const { generateRoomCode } = require('./utils/room-code');

// Room structure:
// {
//   code: "PLGX",
//   hostId: "socket-id",
//   players: [{ id, name, isConnected }],
//   status: "waiting" | "in-progress",
//   gameInstance: null | GameInstance
// }

class LobbyManager {
  constructor(io, gameManager) {
    this.io          = io;
    this.gameManager = gameManager;
    this.rooms       = new Map(); // roomCode -> room
    this.socketToRoom = new Map(); // socketId -> roomCode
  }

  registerHandlers(socket) {
    socket.on('lobby:create', (name, ack)          => this._onCreate(socket, name, ack));
    socket.on('lobby:join',   ({ code, name }, ack) => this._onJoin(socket, code, name, ack));
    socket.on('lobby:start',  (ack)                 => this._onStart(socket, ack));
    socket.on('disconnect',   ()                    => this._onDisconnect(socket));
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  _onCreate(socket, name, ack) {
    const validationError = validateName(name);
    if (validationError) return ack({ error: validationError });

    let code;
    do { code = generateRoomCode(); } while (this.rooms.has(code));

    const room = {
      code,
      hostId:       socket.id,
      players:      [{ id: socket.id, name: name.trim(), isConnected: true }],
      status:       'waiting',
      gameInstance: null,
    };

    this.rooms.set(code, room);
    this.socketToRoom.set(socket.id, code);
    socket.join(code);

    ack({ code });
    this._broadcastRoomState(code);
  }

  // ── Join ────────────────────────────────────────────────────────────────────

  _onJoin(socket, rawCode, name, ack) {
    const code = (rawCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);

    if (!room) return ack({ error: 'Room not found. Check the code and try again.' });

    const validationError = validateName(name);
    if (validationError) return ack({ error: validationError });

    const trimmedName = name.trim();

    // ── In-progress game: only allow known players to reconnect ──────────────
    if (room.status === 'in-progress') {
      const existing = room.players.find(p => p.name === trimmedName);
      if (!existing) {
        return ack({ error: 'Game in progress. You were not part of this game.' });
      }

      // Update socket id (player reconnected with new socket after page navigation)
      existing.id          = socket.id;
      existing.isConnected = true;
      this.socketToRoom.set(socket.id, code);
      socket.join(code);

      ack({ code });

      // Mirror the new socket id into the live game state so turn checks pass
      if (room.gameInstance) {
        const gamePlayer = room.gameInstance.state.players.find(p => p.name === trimmedName);
        if (gamePlayer) gamePlayer.id = socket.id;

        // Broadcast to ALL players so nobody holds a stale player ID in their
        // client state (stale IDs cause "Target player not found" on share actions)
        room.gameInstance.broadcastState();
      }

      // Let others know this player is back
      this._broadcastRoomState(code);
      return;
    }

    // ── Waiting room ──────────────────────────────────────────────────────────

    // Rejoin after disconnect in waiting room
    const disconnected = room.players.find(p => p.name === trimmedName && !p.isConnected);
    if (disconnected) {
      disconnected.id          = socket.id;
      disconnected.isConnected = true;
      this.socketToRoom.set(socket.id, code);
      socket.join(code);
      ack({ code });
      this._broadcastRoomState(code);
      return;
    }

    // Name already taken by a connected player
    if (room.players.some(p => p.name === trimmedName && p.isConnected)) {
      return ack({ error: 'That name is already taken in this room.' });
    }

    if (room.players.filter(p => p.isConnected).length >= 4) {
      return ack({ error: 'This room is full (max 4 players).' });
    }

    room.players.push({ id: socket.id, name: trimmedName, isConnected: true });
    this.socketToRoom.set(socket.id, code);
    socket.join(code);

    ack({ code });
    this._broadcastRoomState(code);
  }

  // ── Start ───────────────────────────────────────────────────────────────────

  _onStart(socket, ack) {
    const code = this.socketToRoom.get(socket.id);
    const room = code && this.rooms.get(code);

    if (!room)                        return ack({ error: 'You are not in a room.' });
    if (room.hostId !== socket.id)    return ack({ error: 'Only the host can start the game.' });
    if (room.status === 'in-progress') return ack({ error: 'Game already started.' });

    const activePlayers = room.players.filter(p => p.isConnected);
    if (activePlayers.length < 2) return ack({ error: 'Need at least 2 players to start.' });
    if (activePlayers.length > 4) return ack({ error: 'Maximum 4 players.' });

    // Create game instance BEFORE navigating clients
    const game     = this.gameManager.createGame(room);
    room.gameInstance = game;
    room.status       = 'in-progress';

    ack({ ok: true });

    // Tell all clients to navigate to game.html — they will reconnect via _onJoin
    // and receive game:state automatically when they do.
    this.io.to(code).emit('lobby:game-starting', { code });
  }

  // ── Disconnect ──────────────────────────────────────────────────────────────

  _onDisconnect(socket) {
    const code = this.socketToRoom.get(socket.id);
    if (!code) return;

    const room = this.rooms.get(code);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) player.isConnected = false;

    this.socketToRoom.delete(socket.id);

    // Transfer host if the host disconnected
    if (room.hostId === socket.id) {
      const next = room.players.find(p => p.isConnected);
      if (next) room.hostId = next.id;
    }

    // Clean up empty waiting rooms
    const anyConnected = room.players.some(p => p.isConnected);
    if (!anyConnected && room.status === 'waiting') {
      this.rooms.delete(code);
      return;
    }

    this._broadcastRoomState(code);
  }

  // ── Broadcast ───────────────────────────────────────────────────────────────

  _broadcastRoomState(code) {
    const room = this.rooms.get(code);
    if (!room) return;

    this.io.to(code).emit('lobby:state', {
      code:     room.code,
      hostId:   room.hostId,
      players:  room.players.map(p => ({
        id:          p.id,
        name:        p.name,
        isConnected: p.isConnected,
      })),
      status: room.status,
    });
  }

  // ── Accessors (used by GameManager) ─────────────────────────────────────────

  getRoom(code) {
    return this.rooms.get(code);
  }
}

function validateName(name) {
  if (!name || typeof name !== 'string') return 'Name is required.';
  const trimmed = name.trim();
  if (trimmed.length < 1)  return 'Name cannot be empty.';
  if (trimmed.length > 20) return 'Name must be 20 characters or fewer.';
  return null;
}

module.exports = { LobbyManager };

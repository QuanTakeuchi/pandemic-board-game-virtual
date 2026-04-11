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
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // roomCode -> room
    this.socketToRoom = new Map(); // socketId -> roomCode
  }

  registerHandlers(socket) {
    socket.on('lobby:create', (name, ack) => this._onCreate(socket, name, ack));
    socket.on('lobby:join', ({ code, name }, ack) => this._onJoin(socket, code, name, ack));
    socket.on('lobby:start', (ack) => this._onStart(socket, ack));
    socket.on('disconnect', () => this._onDisconnect(socket));
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  _onCreate(socket, name, ack) {
    const validationError = validateName(name);
    if (validationError) return ack({ error: validationError });

    // Generate a unique room code
    let code;
    do { code = generateRoomCode(); } while (this.rooms.has(code));

    const room = {
      code,
      hostId: socket.id,
      players: [{ id: socket.id, name: name.trim(), isConnected: true }],
      status: 'waiting',
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
    if (room.status === 'in-progress') return ack({ error: 'That game has already started.' });

    const validationError = validateName(name);
    if (validationError) return ack({ error: validationError });

    const trimmedName = name.trim();

    // Rejoin: socket disconnected and is coming back
    const existing = room.players.find(p => p.name === trimmedName && !p.isConnected);
    if (existing) {
      existing.id = socket.id;
      existing.isConnected = true;
      this.socketToRoom.set(socket.id, code);
      socket.join(code);
      ack({ code });
      this._broadcastRoomState(code);
      return;
    }

    // Name collision with a connected player
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

    if (!room) return ack({ error: 'You are not in a room.' });
    if (room.hostId !== socket.id) return ack({ error: 'Only the host can start the game.' });

    const activePlayers = room.players.filter(p => p.isConnected);
    if (activePlayers.length < 2) return ack({ error: 'Need at least 2 players to start.' });
    if (activePlayers.length > 4) return ack({ error: 'Maximum 4 players.' });

    room.status = 'in-progress';

    ack({ ok: true });

    // Tell all clients to navigate to the game page
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

    // If the host disconnected, assign a new host from remaining connected players
    if (room.hostId === socket.id) {
      const next = room.players.find(p => p.isConnected);
      if (next) room.hostId = next.id;
    }

    // Clean up empty rooms (all players disconnected and game hasn't started)
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
      code: room.code,
      hostId: room.hostId,
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        isConnected: p.isConnected,
      })),
      status: room.status,
    });
  }

  // ── Helpers (used by GameManager) ───────────────────────────────────────────

  getRoom(code) {
    return this.rooms.get(code);
  }

  setGameInstance(code, instance) {
    const room = this.rooms.get(code);
    if (room) room.gameInstance = instance;
  }
}

function validateName(name) {
  if (!name || typeof name !== 'string') return 'Name is required.';
  const trimmed = name.trim();
  if (trimmed.length < 1) return 'Name cannot be empty.';
  if (trimmed.length > 20) return 'Name must be 20 characters or fewer.';
  return null;
}

module.exports = { LobbyManager };

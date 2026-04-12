const { GameInstance } = require('./GameInstance');

class GameManager {
  constructor(io) {
    this.io    = io;
    this.games = new Map(); // roomCode -> GameInstance
  }

  // ── Create a new game from a lobby room ───────────────────────────────────

  createGame(room) {
    const instance = new GameInstance(room);
    instance.io    = this.io;
    this.games.set(room.code, instance);
    console.log(`[game] Created game for room ${room.code} with ${room.players.filter(p => p.isConnected).length} players`);
    return instance;
  }

  getGame(code) {
    return this.games.get(code) || null;
  }

  deleteGame(code) {
    this.games.delete(code);
  }

  // ── Socket event handlers ─────────────────────────────────────────────────
  // Phase 3: only 'game:request-state' (for direct URL access).
  // Full action handlers are added in Phase 4.

  registerHandlers(socket, lobbyManager) {
    // Client can request the current game state at any time
    // (used when navigating directly to /game.html?room=CODE)
    socket.on('game:request-state', () => {
      const code = lobbyManager.socketToRoom.get(socket.id);
      if (!code) return;
      const game = this.games.get(code);
      if (game) game.sendStateTo(socket);
    });
  }
}

module.exports = { GameManager };

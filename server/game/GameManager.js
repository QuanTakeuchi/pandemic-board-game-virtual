const { GameInstance } = require('./GameInstance');

class GameManager {
  constructor(io) {
    this.io    = io;
    this.games = new Map(); // roomCode -> GameInstance
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  createGame(room) {
    const instance = new GameInstance(room);
    instance.io    = this.io;
    this.games.set(room.code, instance);
    console.log(`[game] Room ${room.code}: game created with ${room.players.filter(p => p.isConnected).length} players`);
    return instance;
  }

  getGame(code) {
    return this.games.get(code) || null;
  }

  deleteGame(code) {
    this.games.delete(code);
  }

  // ── Socket handlers ───────────────────────────────────────────────────────────

  registerHandlers(socket, lobbyManager) {

    // Helper: look up the game for this socket
    const getGame = () => {
      const code = lobbyManager.socketToRoom.get(socket.id);
      return code ? this.games.get(code) : null;
    };

    // Client requests current game state (e.g. on page load / reconnect)
    socket.on('game:request-state', () => {
      const game = getGame();
      if (game) game.sendStateTo(socket);
    });

    // Player performs an action
    socket.on('game:action', (actionData, ack) => {
      if (typeof ack !== 'function') return;
      const game = getGame();
      if (!game) return ack({ error: 'Game not found.' });
      game.performAction(socket.id, actionData, ack);
    });

    // Player voluntarily ends their turn early
    socket.on('game:end-turn', (ack) => {
      if (typeof ack !== 'function') return;
      const game = getGame();
      if (!game) return ack({ error: 'Game not found.' });
      game.endTurn(socket.id, ack);
    });

    // Player discards a card during the hand-limit discard phase
    socket.on('game:discard-card', ({ cardCityId } = {}, ack) => {
      if (typeof ack !== 'function') ack = () => {};
      const game = getGame();
      if (!game) return ack({ error: 'Game not found.' });
      game.discardCard(socket.id, cardCityId, ack);
    });

    // Player clicks the player deck to draw 2 cards
    socket.on('game:draw-cards', (ack) => {
      if (typeof ack !== 'function') ack = () => {};
      const game = getGame();
      if (!game) return ack({ error: 'Game not found.' });
      game.drawCards(socket.id, ack);
    });

    // Player clicks the infection deck to run the infect phase
    socket.on('game:run-infect', (ack) => {
      if (typeof ack !== 'function') ack = () => {};
      const game = getGame();
      if (!game) return ack({ error: 'Game not found.' });
      game.runInfect(socket.id, ack);
    });
  }
}

module.exports = { GameManager };

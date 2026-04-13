const { PLAYER_CARDS }    = require('./data/player-cards');
const { INFECTION_CARDS } = require('./data/infection-cards');
const { ROLES }           = require('./data/roles');
const { shuffle, insertEpidemics } = require('./engine/deck');
const { applyAction }    = require('./engine/actions');
const { runDrawPhase, runInfectPhase, advanceToNextPlayer, HAND_LIMIT } = require('./engine/turn');

const STARTING_HAND_SIZE   = { 2: 4, 3: 3, 4: 2 };
const INFECTION_RATE_TRACK = [2, 2, 2, 3, 3, 4, 4];

// Delay (ms) between automatic phase transitions so clients can read the board
const PHASE_DELAY = 1200;

class GameInstance {
  constructor(room, options = {}) {
    this.roomCode = room.code;
    this.io       = null;          // set by GameManager after construction
    this.options  = { epidemicCount: 5, ...options };

    const activePlayers = room.players.filter(p => p.isConnected);
    this.state = this._buildInitialState(activePlayers);
  }

  // ── Initial state ────────────────────────────────────────────────────────────

  _buildInitialState(activePlayers) {
    const playerCount = activePlayers.length;
    const handSize    = STARTING_HAND_SIZE[playerCount] ?? 2;

    // ── 1. Infection deck: shuffle and draw 9 for initial setup ──────────────
    const infectionDrawPile    = shuffle([...INFECTION_CARDS]);
    const infectionDiscardPile = [];
    const diseaseCubes         = {};
    const supplyUsed           = { blue: 0, yellow: 0, black: 0, red: 0 };

    for (let i = 0; i < 9; i++) {
      const card      = infectionDrawPile.shift();
      const cubeCount = i < 3 ? 3 : i < 6 ? 2 : 1;
      infectionDiscardPile.push(card);
      if (!diseaseCubes[card.cityId]) diseaseCubes[card.cityId] = { blue: 0, yellow: 0, black: 0, red: 0 };
      diseaseCubes[card.cityId][card.color] += cubeCount;
      supplyUsed[card.color] += cubeCount;
    }

    // ── 2. Player deck: deal hands, then insert epidemics ────────────────────
    const pool  = shuffle([...PLAYER_CARDS]);
    const hands = Array.from({ length: playerCount }, () => []);
    for (let i = 0; i < handSize * playerCount; i++) hands[i % playerCount].push(pool.shift());
    const playerDrawPile = insertEpidemics(pool, this.options.epidemicCount);

    // ── 3. Assign roles ───────────────────────────────────────────────────────
    const shuffledRoles = shuffle([...ROLES]);

    // ── 4. Build player objects ───────────────────────────────────────────────
    const players = activePlayers.map((p, i) => ({
      id:          p.id,
      name:        p.name,
      role:        shuffledRoles[i].id,
      location:    'atlanta',
      hand:        hands[i],
      isConnected: true,
    }));

    return {
      roomCode:   this.roomCode,
      phase:      'playing',
      lostReason: null,

      currentPlayerIndex: 0,
      actionsRemaining:   4,
      turnPhase:          'actions',

      players,
      diseaseCubes,
      researchStations: ['atlanta'],

      diseases: {
        blue:   { status: 'active', cubesRemaining: 24 - supplyUsed.blue   },
        yellow: { status: 'active', cubesRemaining: 24 - supplyUsed.yellow },
        black:  { status: 'active', cubesRemaining: 24 - supplyUsed.black  },
        red:    { status: 'active', cubesRemaining: 24 - supplyUsed.red    },
      },

      playerDeck:    { drawPile: playerDrawPile, discardPile: [] },
      infectionDeck: { drawPile: infectionDrawPile, discardPile: infectionDiscardPile },

      outbreakCount:      0,
      infectionRateIndex: 0,
      infectionRate:      INFECTION_RATE_TRACK[0],
      curesFound:         0,
      opsFlightUsedThisTurn: false,

      eventLog: [{ type: 'game-start', message: `Game started with ${playerCount} players.` }],
    };
  }

  // ── Perform a player action ──────────────────────────────────────────────────

  performAction(socketId, actionData, ack) {
    if (this.state.phase !== 'playing') {
      return ack({ error: 'The game is not in progress.' });
    }
    if (this.state.turnPhase !== 'actions') {
      return ack({ error: 'Actions are not available right now.' });
    }

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== socketId) {
      return ack({ error: 'It is not your turn.' });
    }

    try {
      this.state = applyAction(this.state, socketId, actionData);
    } catch (err) {
      return ack({ error: err.message });
    }

    this.state.actionsRemaining--;

    // Win check: all 4 diseases cured
    if ((this.state.curesFound ?? 0) >= 4) {
      this.state.phase = 'won';
      this.broadcastState();
      this.io?.to(this.roomCode).emit('game:over', { won: true });
      return ack({ ok: true });
    }

    if (this.state.actionsRemaining <= 0) {
      this.broadcastState();
      setTimeout(() => this._runDrawAndInfect(), PHASE_DELAY);
    } else {
      this.broadcastState();
    }

    return ack({ ok: true });
  }

  // ── End turn early (use fewer than 4 actions) ────────────────────────────────

  endTurn(socketId, ack) {
    if (this.state.phase !== 'playing') {
      return ack({ error: 'The game is not in progress.' });
    }
    if (this.state.turnPhase !== 'actions') {
      return ack({ error: 'Cannot end turn right now.' });
    }
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== socketId) {
      return ack({ error: 'It is not your turn.' });
    }

    this.state.actionsRemaining = 0;
    ack({ ok: true });
    this.broadcastState();
    setTimeout(() => this._runDrawAndInfect(), PHASE_DELAY);
  }

  // ── Discard a card (hand-limit enforcement) ───────────────────────────────────
  // Called when turnPhase === 'discard' and the current player needs to reduce
  // their hand to ≤ HAND_LIMIT (7) cards.

  discardCard(socketId, cardCityId, ack) {
    if (this.state.phase !== 'playing') {
      return ack({ error: 'The game is not in progress.' });
    }
    if (this.state.turnPhase !== 'discard') {
      return ack({ error: 'Not in the discard phase.' });
    }

    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== socketId) {
      return ack({ error: 'It is not your turn.' });
    }

    const cardIdx = currentPlayer.hand.findIndex(c => c.type === 'city' && c.cityId === cardCityId);
    if (cardIdx === -1) {
      return ack({ error: 'Card not in hand.' });
    }

    const [card] = currentPlayer.hand.splice(cardIdx, 1);
    this.state.playerDeck.discardPile.push(card);
    this.state.eventLog.unshift({ type: 'discard', player: currentPlayer.name, card: card.name, color: card.color });

    ack({ ok: true });

    if (currentPlayer.hand.length > HAND_LIMIT) {
      // Still over limit — wait for another discard
      this.broadcastState();
    } else {
      // Hand is now ≤ 7: proceed to infect phase after a short delay
      this.broadcastState();
      setTimeout(() => this._continueToInfect(), PHASE_DELAY);
    }
  }

  // ── Draw → (Discard?) → Infect → Next player ─────────────────────────────────

  _runDrawAndInfect() {
    // ── Draw phase ────────────────────────────────────────────────────────────
    this.state.turnPhase = 'draw';
    this.state = runDrawPhase(this.state);
    this.broadcastState();

    if (this.state.phase !== 'playing') {
      this.io?.to(this.roomCode).emit('game:over', { won: false, reason: this.state.lostReason });
      return;
    }

    // ── Hand-limit check ──────────────────────────────────────────────────────
    // If current player's hand exceeds 7, pause and wait for them to discard.
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer && currentPlayer.hand.length > HAND_LIMIT) {
      this.state.turnPhase = 'discard';
      this.broadcastState();
      // Execution will resume in discardCard() once hand ≤ HAND_LIMIT
      return;
    }

    // ── Infect phase (after delay) ────────────────────────────────────────────
    setTimeout(() => this._continueToInfect(), PHASE_DELAY);
  }

  _continueToInfect() {
    this.state.turnPhase = 'infect';
    this.state = runInfectPhase(this.state);
    this.broadcastState();

    if (this.state.phase !== 'playing') {
      this.io?.to(this.roomCode).emit('game:over', { won: false, reason: this.state.lostReason });
      return;
    }

    // ── Advance to next player ────────────────────────────────────────────────
    setTimeout(() => {
      this.state = advanceToNextPlayer(this.state);
      this.broadcastState();
    }, PHASE_DELAY);
  }

  // ── State delivery ────────────────────────────────────────────────────────────

  getPublicState() {
    const s = this.state;
    return {
      ...s,
      playerDeck: {
        drawPileCount: s.playerDeck.drawPile.length,
        discardPile:   s.playerDeck.discardPile,
      },
      infectionDeck: {
        drawPileCount: s.infectionDeck.drawPile.length,
        discardPile:   s.infectionDeck.discardPile,
      },
    };
  }

  broadcastState() {
    this.io?.to(this.roomCode).emit('game:state', this.getPublicState());
  }

  sendStateTo(socket) {
    socket.emit('game:state', this.getPublicState());
  }
}

module.exports = { GameInstance };

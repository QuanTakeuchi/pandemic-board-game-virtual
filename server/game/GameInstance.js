const { PLAYER_CARDS }    = require('./data/player-cards');
const { INFECTION_CARDS } = require('./data/infection-cards');
const { ROLES }           = require('./data/roles');
const { shuffle, insertEpidemics } = require('./engine/deck');

// Cards dealt to each player based on player count (official rules)
const STARTING_HAND_SIZE = { 2: 4, 3: 3, 4: 2 };

// Infection rate track — indexes into this array as epidemics are drawn
const INFECTION_RATE_TRACK = [2, 2, 2, 3, 3, 4, 4];

class GameInstance {
  /**
   * @param {object} room        — LobbyManager room object
   * @param {object} [options]
   * @param {number} [options.epidemicCount=5]  — 4 (intro) | 5 (standard) | 6 (heroic)
   */
  constructor(room, options = {}) {
    this.roomCode = room.code;
    this.io       = null; // set by GameManager after construction
    this.options  = { epidemicCount: 5, ...options };

    // Only include connected players
    const activePlayers = room.players.filter(p => p.isConnected);
    this.state = this._buildInitialState(activePlayers);
  }

  // ── Initial state ────────────────────────────────────────────────────────────

  _buildInitialState(activePlayers) {
    const playerCount  = activePlayers.length;
    const handSize     = STARTING_HAND_SIZE[playerCount] ?? 2;

    // ── 1. Infection deck: shuffle and draw 9 cards for initial board setup ──
    const infectionDrawPile   = shuffle([...INFECTION_CARDS]);
    const infectionDiscardPile = [];
    const diseaseCubes = {};
    const supplyUsed   = { blue: 0, yellow: 0, black: 0, red: 0 };

    for (let i = 0; i < 9; i++) {
      const card      = infectionDrawPile.shift();
      const cubeCount = i < 3 ? 3 : i < 6 ? 2 : 1;

      infectionDiscardPile.push(card);

      if (!diseaseCubes[card.cityId]) {
        diseaseCubes[card.cityId] = { blue: 0, yellow: 0, black: 0, red: 0 };
      }
      diseaseCubes[card.cityId][card.color] += cubeCount;
      supplyUsed[card.color] += cubeCount;
    }

    // ── 2. Player deck: shuffle base cards, deal hands, insert epidemics ──────
    const playerCardPool = shuffle([...PLAYER_CARDS]);
    const hands          = Array.from({ length: playerCount }, () => []);

    // Deal round-robin so card order mirrors the physical game
    for (let i = 0; i < handSize * playerCount; i++) {
      hands[i % playerCount].push(playerCardPool.shift());
    }

    // Remaining pool gets epidemics inserted
    const playerDrawPile = insertEpidemics(playerCardPool, this.options.epidemicCount);

    // ── 3. Assign roles randomly ──────────────────────────────────────────────
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

    // ── 5. Assemble full state ────────────────────────────────────────────────
    return {
      roomCode:   this.roomCode,
      phase:      'playing',
      lostReason: null,

      currentPlayerIndex: 0,
      actionsRemaining:   4,
      turnPhase:          'actions',   // 'actions' | 'draw' | 'infect'

      players,

      diseaseCubes,
      researchStations: ['atlanta'],

      diseases: {
        blue:   { status: 'active', cubesRemaining: 24 - supplyUsed.blue   },
        yellow: { status: 'active', cubesRemaining: 24 - supplyUsed.yellow },
        black:  { status: 'active', cubesRemaining: 24 - supplyUsed.black  },
        red:    { status: 'active', cubesRemaining: 24 - supplyUsed.red    },
      },

      playerDeck: {
        drawPile:    playerDrawPile,
        discardPile: [],
      },
      infectionDeck: {
        drawPile:    infectionDrawPile,
        discardPile: infectionDiscardPile,
      },

      outbreakCount:      0,
      infectionRateIndex: 0,
      infectionRate:      INFECTION_RATE_TRACK[0],

      curesFound: 0,

      eventLog: [{
        type:    'game-start',
        message: `Game started with ${playerCount} players.`,
      }],
    };
  }

  // ── Public state (strips hidden deck contents) ────────────────────────────

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

  // ── Broadcast full state to all players in room ───────────────────────────

  broadcastState() {
    if (!this.io) return;
    this.io.to(this.roomCode).emit('game:state', this.getPublicState());
  }

  // ── Send state to a single socket (e.g. reconnecting player) ─────────────

  sendStateTo(socket) {
    socket.emit('game:state', this.getPublicState());
  }
}

module.exports = { GameInstance };

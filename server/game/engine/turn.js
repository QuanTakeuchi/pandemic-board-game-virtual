// Turn phase engine: draw phase and infect phase.
// All functions take a state object and return a new (deep-cloned) state.
// Outbreak cascade chains are a Phase 5 concern; here outbreaks increment
// the counter and stop — no adjacent spread.

'use strict';

const { shuffle } = require('./deck');

const INFECTION_RATE_TRACK = [2, 2, 2, 3, 3, 4, 4];
const MAX_OUTBREAKS = 8;

const deepClone = o => JSON.parse(JSON.stringify(o));

// ── Draw Phase ────────────────────────────────────────────────────────────────
// Draw 2 player cards. Epidemic cards are resolved immediately when drawn.

function runDrawPhase(state) {
  const s = deepClone(state);

  for (let i = 0; i < 2; i++) {
    if (s.playerDeck.drawPile.length === 0) {
      s.phase      = 'lost';
      s.lostReason = 'cards';
      s.eventLog.unshift({ type: 'game-over', message: 'Player deck exhausted — humanity loses.' });
      return s;
    }

    const card = s.playerDeck.drawPile.shift();

    if (card.type === 'epidemic') {
      _resolveEpidemic(s, card);
    } else {
      s.players[s.currentPlayerIndex].hand.push(card);
      s.eventLog.unshift({ type: 'draw', player: s.players[s.currentPlayerIndex].name, card: card.name });
    }
  }

  return s;
}

// Full epidemic resolution:
//   Increase  → advance infection rate
//   Infect    → draw bottom infection card, place 3 cubes
//   Intensify → shuffle infection discard back onto draw pile
function _resolveEpidemic(s, epidemicCard) {
  // 1. Increase
  if (s.infectionRateIndex < INFECTION_RATE_TRACK.length - 1) {
    s.infectionRateIndex++;
  }
  s.infectionRate = INFECTION_RATE_TRACK[s.infectionRateIndex];

  // 2. Infect — bottom card of infection draw pile
  let epicCity = null;
  if (s.infectionDeck.drawPile.length > 0) {
    epicCity = s.infectionDeck.drawPile.pop();   // bottom of draw pile
    _placeCubes(s, epicCity, 3);
    s.infectionDeck.discardPile.push(epicCity);
  }

  // 3. Intensify — reshuffle discard onto top of draw pile
  const reshuffled = shuffle([...s.infectionDeck.discardPile]);
  s.infectionDeck.drawPile    = [...reshuffled, ...s.infectionDeck.drawPile];
  s.infectionDeck.discardPile = [];

  // Discard the epidemic player card
  s.playerDeck.discardPile.push(epidemicCard);

  s.eventLog.unshift({
    type:  'epidemic',
    city:  epicCity?.name  || '?',
    color: epicCity?.color || '?',
  });
}

// ── Infect Phase ──────────────────────────────────────────────────────────────
// Draw infection-rate cards and place 1 cube on each city.

function runInfectPhase(state) {
  const s = deepClone(state);

  for (let i = 0; i < s.infectionRate; i++) {
    if (s.infectionDeck.drawPile.length === 0) break;

    const card = s.infectionDeck.drawPile.shift();
    s.infectionDeck.discardPile.push(card);

    _placeCubes(s, card, 1);
    if (s.phase !== 'playing') return s;
  }

  return s;
}

// ── Cube placement helper ─────────────────────────────────────────────────────
// Rules:
//   count=1 (normal):   outbreak if city already has 3 cubes
//   count=3 (epidemic): outbreak if city already has ANY cubes of that color

function _placeCubes(s, card, count) {
  const { cityId, color } = card;

  // Eradicated diseases can't spread
  if (s.diseases[color]?.status === 'eradicated') return;

  if (!s.diseaseCubes[cityId]) {
    s.diseaseCubes[cityId] = { blue: 0, yellow: 0, black: 0, red: 0 };
  }

  const current     = s.diseaseCubes[cityId][color];
  const wouldBurst  = count === 1 ? current >= 3 : current > 0;

  if (wouldBurst) {
    s.outbreakCount++;
    s.eventLog.unshift({ type: 'outbreak', city: card.name, color });
    if (s.outbreakCount >= MAX_OUTBREAKS) {
      s.phase      = 'lost';
      s.lostReason = 'outbreaks';
      s.eventLog.unshift({ type: 'game-over', message: '8 outbreaks — humanity loses.' });
    }
    // No cascade in Phase 4; Phase 5 adds outbreak chaining
    return;
  }

  const toAdd  = Math.min(count, 3 - current);
  const supply = s.diseases[color].cubesRemaining;

  if (supply < toAdd) {
    s.phase      = 'lost';
    s.lostReason = 'cubes';
    s.eventLog.unshift({ type: 'game-over', message: `${color} disease cubes exhausted — humanity loses.` });
    return;
  }

  s.diseaseCubes[cityId][color]     += toAdd;
  s.diseases[color].cubesRemaining  -= toAdd;
  s.eventLog.unshift({ type: 'infect', city: card.name, color });
}

// ── Next player ───────────────────────────────────────────────────────────────

function advanceToNextPlayer(state) {
  const s = deepClone(state);
  s.currentPlayerIndex = (s.currentPlayerIndex + 1) % s.players.length;
  s.actionsRemaining   = 4;
  s.turnPhase          = 'actions';
  return s;
}

module.exports = { runDrawPhase, runInfectPhase, advanceToNextPlayer };

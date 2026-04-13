// Turn phase engine: draw phase, infect phase, and player advance.
// All functions take a state object and return a new (deep-cloned) state.
//
// Phase 5 additions:
//   - Outbreak cascade chains (_placeCubes tracks outbreakedCities per chain)
//   - Hand-limit flag: runDrawPhase sets state.needsDiscard when hand > 7

'use strict';

const { shuffle } = require('./deck');
const { CITIES }  = require('../data/cities');

const INFECTION_RATE_TRACK = [2, 2, 2, 3, 3, 4, 4];
const MAX_OUTBREAKS        = 8;
const HAND_LIMIT           = 7;

const deepClone = o => JSON.parse(JSON.stringify(o));

// ── Draw Phase ────────────────────────────────────────────────────────────────
// Draw 2 player cards.  Epidemic cards are resolved immediately.
// Returns state with needsDiscard=true if the player's hand exceeded HAND_LIMIT.

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
      if (s.phase !== 'playing') return s;
    } else {
      s.players[s.currentPlayerIndex].hand.push(card);
      s.eventLog.unshift({ type: 'draw', player: s.players[s.currentPlayerIndex].name, card: card.name });
    }
  }

  return s;
}

// Full epidemic resolution:
//   Increase  → advance infection rate index
//   Infect    → draw bottom infection card, place 3 cubes (with cascade)
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
    epicCity = s.infectionDeck.drawPile.pop();          // bottom of draw pile
    _placeCubes(s, epicCity, 3, new Set());             // fresh cascade chain
    s.infectionDeck.discardPile.push(epicCity);
  }

  // 3. Intensify — reshuffle discard pile onto top of draw pile
  const reshuffled             = shuffle([...s.infectionDeck.discardPile]);
  s.infectionDeck.drawPile     = [...reshuffled, ...s.infectionDeck.drawPile];
  s.infectionDeck.discardPile  = [];

  // Discard the epidemic player card
  s.playerDeck.discardPile.push(epidemicCard);

  s.eventLog.unshift({
    type:  'epidemic',
    city:  epicCity?.name  || '?',
    color: epicCity?.color || '?',
  });
}

// ── Infect Phase ──────────────────────────────────────────────────────────────
// Draw infection-rate cards; place 1 cube on each city (with cascade).

function runInfectPhase(state) {
  const s = deepClone(state);

  for (let i = 0; i < s.infectionRate; i++) {
    if (s.infectionDeck.drawPile.length === 0) break;

    const card = s.infectionDeck.drawPile.shift();
    s.infectionDeck.discardPile.push(card);

    _placeCubes(s, card, 1, new Set());   // each card starts its own outbreak chain
    if (s.phase !== 'playing') return s;
  }

  return s;
}

// ── Cube placement (with cascade) ─────────────────────────────────────────────
// count=1  → outbreak if city already has 3 cubes of that colour
// count=3  → outbreak if city already has ANY cubes of that colour (epidemic)
//
// outbreakedCities: Set of cityIds that have already outbreaked this chain.
// Each top-level card draw passes a fresh `new Set()`.

function _placeCubes(s, card, count, outbreakedCities) {
  const { cityId, color } = card;

  // Eradicated diseases cannot spread
  if (s.diseases[color]?.status === 'eradicated') return;

  // Quarantine Specialist: prevent cube placement in their city and adjacent cities
  if (_isQuarantined(s, cityId)) return;

  if (!s.diseaseCubes[cityId]) {
    s.diseaseCubes[cityId] = { blue: 0, yellow: 0, black: 0, red: 0 };
  }

  const current    = s.diseaseCubes[cityId][color];
  const wouldBurst = count === 1 ? current >= 3 : current > 0;

  if (wouldBurst) {
    // A city can only outbreak once per chain (prevents infinite loops)
    if (outbreakedCities.has(cityId)) return;

    s.outbreakCount++;
    outbreakedCities.add(cityId);
    s.eventLog.unshift({ type: 'outbreak', city: card.name, color });

    if (s.outbreakCount >= MAX_OUTBREAKS) {
      s.phase      = 'lost';
      s.lostReason = 'outbreaks';
      s.eventLog.unshift({ type: 'game-over', message: '8 outbreaks — humanity loses.' });
      return;
    }

    // ── Cascade: spread 1 cube to every connected city ───────────────────────
    const cityDef = CITIES[cityId];
    if (cityDef) {
      for (const adjId of cityDef.connections) {
        if (s.phase !== 'playing') break;
        const adjDef  = CITIES[adjId];
        const adjCard = { cityId: adjId, color, name: adjDef?.name || adjId };
        _placeCubes(s, adjCard, 1, outbreakedCities);
      }
    }
    return;
  }

  // Normal placement
  const toAdd  = Math.min(count, 3 - current);
  const supply = s.diseases[color].cubesRemaining;

  if (supply < toAdd) {
    s.phase      = 'lost';
    s.lostReason = 'cubes';
    s.eventLog.unshift({ type: 'game-over', message: `${color} disease cubes exhausted — humanity loses.` });
    return;
  }

  s.diseaseCubes[cityId][color]    += toAdd;
  s.diseases[color].cubesRemaining -= toAdd;
  s.eventLog.unshift({ type: 'infect', city: card.name, color });
}

// ── Quarantine Specialist helper ──────────────────────────────────────────────
// Returns true if any QS player is in cityId or an adjacent city.

function _isQuarantined(s, cityId) {
  const qs = s.players.find(p => p.role === 'quarantine-specialist' && p.isConnected);
  if (!qs) return false;
  if (qs.location === cityId) return true;
  const cityDef = CITIES[qs.location];
  return cityDef?.connections.includes(cityId) ?? false;
}

// ── Advance to next player ────────────────────────────────────────────────────

function advanceToNextPlayer(state) {
  const s = deepClone(state);
  s.currentPlayerIndex    = (s.currentPlayerIndex + 1) % s.players.length;
  s.actionsRemaining      = 4;
  s.turnPhase             = 'actions';
  s.opsFlightUsedThisTurn = false;   // reset Operations Expert once-per-turn ability
  return s;
}

module.exports = { runDrawPhase, runInfectPhase, advanceToNextPlayer, HAND_LIMIT };

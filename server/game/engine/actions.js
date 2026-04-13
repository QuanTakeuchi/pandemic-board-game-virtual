// All player actions as pure functions.
// Each function: (state, playerId, params) → newState
// Throws an Error with a user-facing message on validation failure.
//
// Phase 6: role special abilities are now fully wired in.

'use strict';

const { CITIES } = require('../data/cities');

const deepClone = o => JSON.parse(JSON.stringify(o));

function findPlayer(state, id) {
  return state.players.find(p => p.id === id);
}

function logEvent(state, entry) {
  state.eventLog.unshift(entry);
  if (state.eventLog.length > 100) state.eventLog.length = 100;
}

// ── Medic passive: auto-remove cured-disease cubes after moving ───────────────
// Called after every movement action for the Medic role.

function medicAutoClean(s, playerId) {
  const player = findPlayer(s, playerId);
  if (!player || player.role !== 'medic') return;

  const cityId = player.location;
  if (!s.diseaseCubes[cityId]) return;

  const cleanedColors = [];

  for (const [color, count] of Object.entries(s.diseaseCubes[cityId])) {
    if (count > 0 && s.diseases[color]?.status !== 'active') {
      s.diseases[color].cubesRemaining += count;
      s.diseaseCubes[cityId][color] = 0;
      cleanedColors.push(color);
      logEvent(s, { type: 'medic-clean', player: player.name, city: cityId, color });
    }
  }

  if (Object.values(s.diseaseCubes[cityId]).every(v => v === 0)) {
    delete s.diseaseCubes[cityId];
  }

  // Eradication check: if all cubes of a cleaned colour are now gone from the
  // entire board, the cured disease becomes eradicated.
  for (const color of cleanedColors) {
    if (s.diseases[color]?.status === 'cured') {
      const remaining = Object.values(s.diseaseCubes).reduce((n, c) => n + (c[color] || 0), 0);
      if (remaining === 0) {
        s.diseases[color].status = 'eradicated';
        logEvent(s, { type: 'eradicate', color });
      }
    }
  }
}

// ── 1. Drive / Ferry ─────────────────────────────────────────────────────────

function drive(state, playerId, { cityId }) {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found.');

  const from     = player.location;
  const fromCity = CITIES[from];
  const toCity   = CITIES[cityId];

  if (!fromCity)                              throw new Error('Invalid current city.');
  if (!toCity)                                throw new Error('Invalid destination city.');
  if (!fromCity.connections.includes(cityId)) throw new Error(`${toCity.name} is not connected to ${fromCity.name}.`);

  const s = deepClone(state);
  findPlayer(s, playerId).location = cityId;
  logEvent(s, { type: 'move', player: player.name, from, to: cityId, color: toCity.color });
  medicAutoClean(s, playerId);
  return s;
}

// ── 2. Direct Flight ─────────────────────────────────────────────────────────

function directFlight(state, playerId, { cityId }) {
  const player = findPlayer(state, playerId);
  if (!player)       throw new Error('Player not found.');
  const toCity = CITIES[cityId];
  if (!toCity)       throw new Error('Invalid destination city.');
  if (player.location === cityId) throw new Error(`You are already in ${toCity.name}.`);

  const cardIdx = player.hand.findIndex(c => c.type === 'city' && c.cityId === cityId);
  if (cardIdx === -1) throw new Error(`You do not have the ${toCity.name} city card.`);

  const s = deepClone(state);
  const p = findPlayer(s, playerId);
  const [card] = p.hand.splice(cardIdx, 1);
  s.playerDeck.discardPile.push(card);
  p.location = cityId;
  logEvent(s, { type: 'direct-flight', player: player.name, from: player.location, to: cityId, color: toCity.color });
  medicAutoClean(s, playerId);
  return s;
}

// ── 3. Charter Flight ────────────────────────────────────────────────────────

function charterFlight(state, playerId, { cityId }) {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found.');
  const toCity = CITIES[cityId];
  if (!toCity)  throw new Error('Invalid destination city.');

  const from = player.location;
  if (from === cityId) throw new Error(`You are already in ${toCity.name}.`);

  const cardIdx = player.hand.findIndex(c => c.type === 'city' && c.cityId === from);
  if (cardIdx === -1) throw new Error(`You need the ${CITIES[from].name} card to charter a flight.`);

  const s = deepClone(state);
  const p = findPlayer(s, playerId);
  const [card] = p.hand.splice(cardIdx, 1);
  s.playerDeck.discardPile.push(card);
  p.location = cityId;
  logEvent(s, { type: 'charter-flight', player: player.name, from, to: cityId, color: toCity.color });
  medicAutoClean(s, playerId);
  return s;
}

// ── 4. Shuttle Flight ────────────────────────────────────────────────────────

function shuttleFlight(state, playerId, { cityId }) {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found.');
  const toCity = CITIES[cityId];
  if (!toCity) throw new Error('Invalid destination city.');

  const from = player.location;
  if (from === cityId) throw new Error(`You are already in ${toCity.name}.`);
  if (!state.researchStations.includes(from))   throw new Error(`${CITIES[from].name} has no research station.`);
  if (!state.researchStations.includes(cityId)) throw new Error(`${toCity.name} has no research station.`);

  const s = deepClone(state);
  findPlayer(s, playerId).location = cityId;
  logEvent(s, { type: 'shuttle', player: player.name, from, to: cityId, color: toCity.color });
  medicAutoClean(s, playerId);
  return s;
}

// ── 5. Build Research Station ────────────────────────────────────────────────
// Operations Expert: may build WITHOUT discarding the city card.

function buildStation(state, playerId, _params = {}) {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found.');

  const cityId = player.location;
  const city   = CITIES[cityId];
  if (state.researchStations.includes(cityId)) throw new Error(`${city.name} already has a research station.`);
  if (state.researchStations.length >= 6)      throw new Error('Maximum of 6 research stations already placed.');

  const isOpsExpert = player.role === 'operations-expert';

  if (!isOpsExpert) {
    const cardIdx = player.hand.findIndex(c => c.type === 'city' && c.cityId === cityId);
    if (cardIdx === -1) throw new Error(`You need the ${city.name} city card to build a research station here.`);

    const s = deepClone(state);
    const p = findPlayer(s, playerId);
    const [card] = p.hand.splice(cardIdx, 1);
    s.playerDeck.discardPile.push(card);
    s.researchStations.push(cityId);
    logEvent(s, { type: 'build', player: player.name, city: cityId, color: city.color });
    return s;
  } else {
    // Operations Expert: no card needed
    const s = deepClone(state);
    s.researchStations.push(cityId);
    logEvent(s, { type: 'build', player: player.name, city: cityId, color: city.color, role: 'operations-expert' });
    return s;
  }
}

// ── 5b. Operations Expert Flight ─────────────────────────────────────────────
// Once per turn, the Operations Expert may move from any research station to
// any city by discarding any city card from their hand.

function opsExpertFlight(state, playerId, { cityId, cardCityId }) {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found.');
  if (player.role !== 'operations-expert') throw new Error('Only the Operations Expert can use this action.');

  if (state.opsFlightUsedThisTurn) throw new Error('Operations Expert flight can only be used once per turn.');

  const from   = player.location;
  const toCity = CITIES[cityId];
  if (!toCity) throw new Error('Invalid destination city.');
  if (from === cityId) throw new Error(`You are already in ${toCity.name}.`);
  if (!state.researchStations.includes(from)) throw new Error('You must be at a research station to use this ability.');

  const cardIdx = player.hand.findIndex(c => c.type === 'city' && c.cityId === cardCityId);
  if (cardIdx === -1) throw new Error('That city card is not in your hand.');

  const s = deepClone(state);
  const p = findPlayer(s, playerId);
  const [card] = p.hand.splice(cardIdx, 1);
  s.playerDeck.discardPile.push(card);
  p.location = cityId;
  s.opsFlightUsedThisTurn = true;
  logEvent(s, { type: 'ops-flight', player: player.name, from, to: cityId, color: toCity.color });
  medicAutoClean(s, playerId);
  return s;
}

// ── 6. Treat Disease ─────────────────────────────────────────────────────────
// Medic: remove ALL cubes of the chosen color (active or cured).
// Others: remove 1 cube (or all if disease is cured).

function treat(state, playerId, { color }) {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found.');

  const cityId = player.location;
  const city   = CITIES[cityId];
  const cubes  = state.diseaseCubes[cityId];

  if (!cubes || !cubes[color] || cubes[color] <= 0) {
    throw new Error(`There are no ${color} disease cubes in ${city.name}.`);
  }
  if (!state.diseases[color]) throw new Error('Invalid disease color.');

  const s = deepClone(state);
  const isMedic  = player.role === 'medic';
  const isCured  = s.diseases[color].status !== 'active';

  // Medic removes ALL; cured disease also removes ALL
  const toRemove = (isMedic || isCured) ? s.diseaseCubes[cityId][color] : 1;

  s.diseaseCubes[cityId][color] -= toRemove;
  s.diseases[color].cubesRemaining += toRemove;

  if (Object.values(s.diseaseCubes[cityId]).every(v => v === 0)) {
    delete s.diseaseCubes[cityId];
  }

  // Eradication check
  if (s.diseases[color].status === 'cured') {
    const remaining = Object.values(s.diseaseCubes).reduce((n, c) => n + (c[color] || 0), 0);
    if (remaining === 0) {
      s.diseases[color].status = 'eradicated';
      logEvent(s, { type: 'eradicate', color });
    }
  }

  logEvent(s, { type: 'treat', player: player.name, city: cityId, color, count: toRemove });
  return s;
}

// ── 7. Share Knowledge ───────────────────────────────────────────────────────
// Standard: give/take the card matching the current city.
// Researcher: may give ANY city card from their hand.

function share(state, playerId, { targetPlayerId, cardCityId, direction }) {
  const player = findPlayer(state, playerId);
  const target = findPlayer(state, targetPlayerId);

  if (!player) throw new Error('Player not found.');
  if (!target) throw new Error('Target player not found.');
  if (player.location !== target.location) {
    throw new Error('Both players must be in the same city to share knowledge.');
  }

  const cityId = cardCityId || player.location;
  if (!CITIES[cityId]) throw new Error('Invalid city card.');

  if (direction === 'give') {
    // Researcher can give any card; others can only give the current city card
    const isResearcher = player.role === 'researcher';
    if (!isResearcher && cityId !== player.location) {
      throw new Error('You can only give the city card matching your current location.');
    }
    const idx = player.hand.findIndex(c => c.type === 'city' && c.cityId === cityId);
    if (idx === -1) throw new Error(`You do not have the ${CITIES[cityId].name} card.`);
    const s = deepClone(state);
    const [card] = findPlayer(s, playerId).hand.splice(idx, 1);
    findPlayer(s, targetPlayerId).hand.push(card);
    logEvent(s, { type: 'share', player: player.name, target: target.name, city: cityId });
    return s;
  } else {
    // Take: allowed if I am the Researcher OR the target is the Researcher
    // OR the card matches the current city (standard rule)
    const iAmResearcher      = player.role === 'researcher';
    const isTargetResearcher = target.role === 'researcher';
    if (!iAmResearcher && !isTargetResearcher && cityId !== player.location) {
      throw new Error('You can only take the city card matching your current location (unless one of you is the Researcher).');
    }
    const idx = target.hand.findIndex(c => c.type === 'city' && c.cityId === cityId);
    if (idx === -1) throw new Error(`${target.name} does not have the ${CITIES[cityId].name} card.`);
    const s = deepClone(state);
    const [card] = findPlayer(s, targetPlayerId).hand.splice(idx, 1);
    findPlayer(s, playerId).hand.push(card);
    logEvent(s, { type: 'share', player: player.name, target: target.name, city: cityId });
    return s;
  }
}

// ── 8. Discover Cure ─────────────────────────────────────────────────────────
// Standard: discard 5 cards of one color at a research station.
// Scientist: only 4 cards required.

function cure(state, playerId, { cardCityIds }) {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found.');

  const cityId   = player.location;
  if (!state.researchStations.includes(cityId)) {
    throw new Error('You must be at a research station to discover a cure.');
  }

  const REQUIRED = player.role === 'scientist' ? 4 : 5;
  if (!Array.isArray(cardCityIds) || cardCityIds.length < REQUIRED) {
    throw new Error(`You need ${REQUIRED} city cards of the same color to discover a cure.`);
  }

  const cardObjects = cardCityIds.map(id => {
    const card = player.hand.find(c => c.type === 'city' && c.cityId === id);
    if (!card) throw new Error(`You do not have the ${CITIES[id]?.name || id} card.`);
    return card;
  });

  const uniqueColors = [...new Set(cardObjects.map(c => c.color))];
  if (uniqueColors.length > 1) throw new Error('All selected cards must be the same color.');

  const color = uniqueColors[0];
  if (!state.diseases[color])                    throw new Error('Invalid disease color.');
  if (state.diseases[color].status !== 'active') throw new Error(`The ${color} disease is already cured.`);

  const s = deepClone(state);
  const p = findPlayer(s, playerId);

  cardCityIds.forEach(id => {
    const idx = p.hand.findIndex(c => c.type === 'city' && c.cityId === id);
    const [card] = p.hand.splice(idx, 1);
    s.playerDeck.discardPile.push(card);
  });

  s.diseases[color].status = 'cured';
  s.curesFound = (s.curesFound || 0) + 1;

  // Immediate eradication check
  const cubesOnBoard = Object.values(s.diseaseCubes).reduce((n, c) => n + (c[color] || 0), 0);
  if (cubesOnBoard === 0) {
    s.diseases[color].status = 'eradicated';
    logEvent(s, { type: 'eradicate', color });
  }

  logEvent(s, { type: 'cure', player: player.name, color });

  // Medic passive: auto-clean their city when any cure is found
  const medic = s.players.find(mp => mp.role === 'medic');
  if (medic) medicAutoClean(s, medic.id);

  return s;
}

// ── 9. Dispatcher Move ───────────────────────────────────────────────────────
// The Dispatcher may move ANY player's pawn to a city occupied by another pawn.
// Costs 1 action.

function dispatcherMove(state, playerId, { targetPlayerId, cityId }) {
  const dispatcher = findPlayer(state, playerId);
  if (!dispatcher)             throw new Error('Player not found.');
  if (dispatcher.role !== 'dispatcher') throw new Error('Only the Dispatcher can use this action.');

  const target = findPlayer(state, targetPlayerId);
  if (!target) throw new Error('Target player not found.');

  const toCity = CITIES[cityId];
  if (!toCity)  throw new Error('Invalid destination city.');

  if (target.location === cityId) throw new Error(`${target.name} is already in ${toCity.name}.`);

  // Destination must be occupied by at least one OTHER player
  const otherPawnThere = state.players.some(p => p.id !== targetPlayerId && p.isConnected && p.location === cityId);
  if (!otherPawnThere) throw new Error(`No other player is in ${toCity.name}.`);

  const s = deepClone(state);
  findPlayer(s, targetPlayerId).location = cityId;
  logEvent(s, { type: 'dispatcher-move', player: dispatcher.name, target: target.name, to: cityId, color: toCity.color });

  // If the moved pawn belongs to the Medic, auto-clean
  if (target.role === 'medic') medicAutoClean(s, targetPlayerId);

  return s;
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

const HANDLERS = {
  'drive':             drive,
  'direct-flight':     directFlight,
  'charter-flight':    charterFlight,
  'shuttle-flight':    shuttleFlight,
  'build-station':     buildStation,
  'ops-expert-flight': opsExpertFlight,
  'treat':             treat,
  'share':             share,
  'cure':              cure,
  'dispatcher-move':   dispatcherMove,
};

function applyAction(state, playerId, actionData) {
  const handler = HANDLERS[actionData.type];
  if (!handler) throw new Error(`Unknown action type: "${actionData.type}".`);
  return handler(state, playerId, actionData);
}

module.exports = { applyAction };

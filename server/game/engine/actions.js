// All 8 Pandemic player actions as pure functions.
// Each function: (state, playerId, params) → newState
// Throws an Error with a user-facing message on validation failure.
// Role special abilities are stubs here; they are wired in Phase 6.

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

// ── 1. Drive / Ferry ─────────────────────────────────────────────────────────
// Move to a directly connected city. Costs 1 action.

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
  return s;
}

// ── 2. Direct Flight ─────────────────────────────────────────────────────────
// Discard the destination city card to fly there. Costs 1 action.

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
  return s;
}

// ── 3. Charter Flight ────────────────────────────────────────────────────────
// Discard YOUR CURRENT city card to fly anywhere. Costs 1 action.

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
  return s;
}

// ── 4. Shuttle Flight ────────────────────────────────────────────────────────
// Move between any two research stations. Costs 1 action.

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
  return s;
}

// ── 5. Build Research Station ────────────────────────────────────────────────
// Discard current city card to build a station here. Costs 1 action.

function buildStation(state, playerId, _params = {}) {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found.');

  const cityId = player.location;
  const city   = CITIES[cityId];
  if (state.researchStations.includes(cityId)) throw new Error(`${city.name} already has a research station.`);
  if (state.researchStations.length >= 6)      throw new Error('Maximum of 6 research stations already placed.');

  const cardIdx = player.hand.findIndex(c => c.type === 'city' && c.cityId === cityId);
  if (cardIdx === -1) throw new Error(`You need the ${city.name} city card to build a research station here.`);

  const s = deepClone(state);
  const p = findPlayer(s, playerId);
  const [card] = p.hand.splice(cardIdx, 1);
  s.playerDeck.discardPile.push(card);
  s.researchStations.push(cityId);
  logEvent(s, { type: 'build', player: player.name, city: cityId, color: city.color });
  return s;
}

// ── 6. Treat Disease ─────────────────────────────────────────────────────────
// Remove 1 cube (or all if disease is cured) from current city. Costs 1 action.
// Medic role (remove all even if active) is handled in Phase 6.

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
  const isCured = s.diseases[color].status !== 'active';
  // When cured, remove ALL cubes; otherwise remove 1 (Medic enhancement in Phase 6)
  const toRemove = isCured ? s.diseaseCubes[cityId][color] : 1;

  s.diseaseCubes[cityId][color] -= toRemove;
  s.diseases[color].cubesRemaining += toRemove;

  // Remove the city entry when all cubes are gone
  if (Object.values(s.diseaseCubes[cityId]).every(v => v === 0)) {
    delete s.diseaseCubes[cityId];
  }

  // Check eradication: cured disease with zero cubes on the board
  if (s.diseases[color].status === 'cured') {
    const remaining = Object.values(s.diseaseCubes).reduce((n, c) => n + (c[color] || 0), 0);
    if (remaining === 0) s.diseases[color].status = 'eradicated';
  }

  logEvent(s, { type: 'treat', player: player.name, city: cityId, color });
  return s;
}

// ── 7. Share Knowledge ───────────────────────────────────────────────────────
// Give or take a city card matching the current city with a co-located player.
// Researcher role (any card) is handled in Phase 6.

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
    const idx = player.hand.findIndex(c => c.type === 'city' && c.cityId === cityId);
    if (idx === -1) throw new Error(`You do not have the ${CITIES[cityId].name} card.`);
    const s = deepClone(state);
    const [card] = findPlayer(s, playerId).hand.splice(idx, 1);
    findPlayer(s, targetPlayerId).hand.push(card);
    logEvent(s, { type: 'share', player: player.name, target: target.name, city: cityId });
    return s;
  } else {
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
// At a research station, discard 5 cards of one color to cure that disease.
// Scientist role (4 cards) is handled in Phase 6.

function cure(state, playerId, { cardCityIds }) {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found.');

  const cityId = player.location;
  if (!state.researchStations.includes(cityId)) {
    throw new Error('You must be at a research station to discover a cure.');
  }

  const REQUIRED = 5; // Scientist: 4 (Phase 6)
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
  if (!state.diseases[color])                          throw new Error('Invalid disease color.');
  if (state.diseases[color].status !== 'active')       throw new Error(`The ${color} disease is already cured.`);

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
  if (cubesOnBoard === 0) s.diseases[color].status = 'eradicated';

  logEvent(s, { type: 'cure', player: player.name, color });
  return s;
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

const HANDLERS = {
  'drive':          drive,
  'direct-flight':  directFlight,
  'charter-flight': charterFlight,
  'shuttle-flight': shuttleFlight,
  'build-station':  buildStation,
  'treat':          treat,
  'share':          share,
  'cure':           cure,
};

function applyAction(state, playerId, actionData) {
  const handler = HANDLERS[actionData.type];
  if (!handler) throw new Error(`Unknown action type: "${actionData.type}".`);
  return handler(state, playerId, actionData);
}

module.exports = { applyAction };

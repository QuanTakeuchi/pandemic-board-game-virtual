// Special Event card handlers — pure functions: (state, playerId, params) → newState
// Events do not cost actions and can be played by any player at any time.

'use strict';

const { CITIES } = require('../data/cities');

const deepClone = o => JSON.parse(JSON.stringify(o));

function findPlayer(state, id) {
  return state.players.find(p => p.id === id);
}

function logEntry(state, entry) {
  state.eventLog.unshift(entry);
  if (state.eventLog.length > 100) state.eventLog.length = 100;
}

// Remove the event card from the player's hand and add to player discard pile.
function _discardEventCard(s, playerId, eventId) {
  const p = findPlayer(s, playerId);
  const idx = p.hand.findIndex(c => c.type === 'event' && c.id === eventId);
  if (idx === -1) throw new Error('You do not have that event card.');
  const [card] = p.hand.splice(idx, 1);
  s.playerDeck.discardPile.push(card);
}

// ── Airlift ───────────────────────────────────────────────────────────────────
// Move any one pawn to any city.

function airlift(state, playerId, { targetPlayerId, cityId }) {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found.');

  const targetId = targetPlayerId || playerId;
  const target   = findPlayer(state, targetId);
  if (!target) throw new Error('Target player not found.');

  const toCity = CITIES[cityId];
  if (!toCity) throw new Error('Invalid destination city.');
  if (target.location === cityId) throw new Error(`${target.name} is already in ${toCity.name}.`);

  const s = deepClone(state);
  _discardEventCard(s, playerId, 'airlift');
  findPlayer(s, targetId).location = cityId;
  logEntry(s, { type: 'event-airlift', player: player.name, target: target.name, to: cityId, color: toCity.color });
  return s;
}

// ── Government Grant ──────────────────────────────────────────────────────────
// Add 1 research station to any city without spending a card.

function governmentGrant(state, playerId, { cityId }) {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found.');

  const city = CITIES[cityId];
  if (!city) throw new Error('Invalid city.');
  if (state.researchStations.includes(cityId)) throw new Error(`${city.name} already has a research station.`);
  if (state.researchStations.length >= 6) throw new Error('All 6 research stations are already placed.');

  const s = deepClone(state);
  _discardEventCard(s, playerId, 'government-grant');
  s.researchStations.push(cityId);
  logEntry(s, { type: 'event-government-grant', player: player.name, city: cityId, color: city.color });
  return s;
}

// ── One Quiet Night ───────────────────────────────────────────────────────────
// Skip the next Infect Cities step (handled in turn.js runInfectPhase).

function oneQuietNight(state, playerId) {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found.');
  if (state.oneQuietNightActive) throw new Error('One Quiet Night is already active.');

  const s = deepClone(state);
  _discardEventCard(s, playerId, 'one-quiet-night');
  s.oneQuietNightActive = true;
  logEntry(s, { type: 'event-one-quiet-night', player: player.name });
  return s;
}

// ── Forecast ──────────────────────────────────────────────────────────────────
// Pull the top 6 infection cards off the draw pile, store them in forecastPending.
// The player then reorders them via game:forecast-confirm.

function forecast(state, playerId) {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found.');
  if (state.forecastPending) throw new Error('A Forecast is already in progress.');

  const s = deepClone(state);
  _discardEventCard(s, playerId, 'forecast');

  const playerIndex = s.players.findIndex(p => p.id === playerId);
  const top6        = s.infectionDeck.drawPile.slice(0, 6);
  s.infectionDeck.drawPile = s.infectionDeck.drawPile.slice(top6.length);
  s.forecastPending = { playerIndex, cards: top6 };

  logEntry(s, { type: 'event-forecast', player: player.name, count: top6.length });
  return s;
}

// ── Resilient Population ──────────────────────────────────────────────────────
// Remove any 1 card from the infection discard pile permanently.

function resilientPopulation(state, playerId, { cardCityId }) {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found.');

  const cardIdx = state.infectionDeck.discardPile.findIndex(c => c.cityId === cardCityId);
  if (cardIdx === -1) throw new Error('That card is not in the infection discard pile.');

  const s = deepClone(state);
  _discardEventCard(s, playerId, 'resilient-population');
  const [removed] = s.infectionDeck.discardPile.splice(cardIdx, 1);
  logEntry(s, {
    type:   'event-resilient-population',
    player: player.name,
    city:   removed.name,
    cityId: removed.cityId,
    color:  removed.color,
  });
  return s;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

const EVENT_HANDLERS = {
  'airlift':              (s, pid, p) => airlift(s, pid, p),
  'government-grant':     (s, pid, p) => governmentGrant(s, pid, p),
  'one-quiet-night':      (s, pid)    => oneQuietNight(s, pid),
  'forecast':             (s, pid)    => forecast(s, pid),
  'resilient-population': (s, pid, p) => resilientPopulation(s, pid, p),
};

function applyEvent(state, playerId, { eventId, ...params }) {
  // Validate the player has the card BEFORE cloning
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found.');
  if (!player.hand.some(c => c.type === 'event' && c.id === eventId)) {
    throw new Error('You do not have that event card.');
  }

  const handler = EVENT_HANDLERS[eventId];
  if (!handler) throw new Error(`Unknown event card: "${eventId}".`);
  return handler(state, playerId, params);
}

module.exports = { applyEvent };

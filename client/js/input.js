// Canvas hit-testing and action popup for the game board.
// Also exports getAvailableActions() for the sidebar actions panel.

import { CITIES } from './data/cities.js';

const HIT_RADIUS = 16;

// ── Standalone action computer ────────────────────────────────────────────────
// Returns all valid actions for one city given the current player and state.
// Extracted from InputHandler so it can be reused by getAvailableActions().

function _computeActionsForCity(city, me, state, myPlayerIndex) {
  const actions  = [];
  const isHere   = city.id === me.location;
  const fromCity = CITIES[me.location];
  const cubes    = state.diseaseCubes[city.id] || {};

  if (!isHere) {
    // Drive / Ferry
    if (fromCity?.connections.includes(city.id)) {
      actions.push({ label: '🚶 Drive / Ferry', type: 'drive', params: { cityId: city.id } });
    }

    // Direct Flight — have destination card
    if (me.hand.some(c => c.type === 'city' && c.cityId === city.id)) {
      actions.push({ label: '✈️ Direct Flight', type: 'direct-flight', params: { cityId: city.id } });
    }

    // Charter Flight — have current city card
    if (me.hand.some(c => c.type === 'city' && c.cityId === me.location)) {
      actions.push({ label: '🗺️ Charter Flight', type: 'charter-flight', params: { cityId: city.id } });
    }

    // Shuttle Flight — both cities have research stations
    if (state.researchStations.includes(me.location) && state.researchStations.includes(city.id)) {
      actions.push({ label: '🔬 Shuttle Flight', type: 'shuttle-flight', params: { cityId: city.id } });
    }

    // Operations Expert: fly from a research station with any card
    if (me.role === 'operations-expert' &&
        state.researchStations.includes(me.location) &&
        !state.opsFlightUsedThisTurn) {
      me.hand.filter(c => c.type === 'city').forEach(c => {
        actions.push({
          label:  `🛸 Ops Flight (discard ${c.name})`,
          type:   'ops-expert-flight',
          params: { cityId: city.id, cardCityId: c.cityId },
        });
      });
    }

    // Dispatcher: move another player's pawn to a city occupied by someone else
    if (me.role === 'dispatcher') {
      state.players.forEach((other, i) => {
        if (i === myPlayerIndex || !other.isConnected) return;
        if (other.location === city.id) return;
        const otherPawnThere = state.players.some(
          p => p.id !== other.id && p.isConnected && p.location === city.id
        );
        if (otherPawnThere) {
          actions.push({
            label:  `🎯 Move ${other.name} here`,
            type:   'dispatcher-move',
            params: { targetPlayerId: other.id, cityId: city.id },
          });
        }
      });
    }

  } else {
    // ── On-city actions ───────────────────────────────────────────────────────

    // Treat
    for (const [color, count] of Object.entries(cubes)) {
      if (count > 0) {
        const isMedic = me.role === 'medic';
        const isCured = state.diseases[color]?.status !== 'active';
        const tag = isMedic && !isCured ? ' (Medic: all)' : isCured ? ` (all — cured)` : ` (${count})`;
        actions.push({ label: `💊 Treat ${color}${tag}`, type: 'treat', params: { color } });
      }
    }

    // Build Research Station
    if (!state.researchStations.includes(city.id)) {
      const isOpsExpert = me.role === 'operations-expert';
      const hasCard     = me.hand.some(c => c.type === 'city' && c.cityId === city.id);
      if (isOpsExpert || hasCard) {
        actions.push({ label: `🏗️ Build Research Station${isOpsExpert ? ' (no card needed)' : ''}`, type: 'build-station', params: {} });
      }
    }

    // Discover Cure
    if (state.researchStations.includes(city.id)) {
      const required = me.role === 'scientist' ? 4 : 5;
      const groups   = {};
      me.hand.forEach(c => {
        if (c.type === 'city') (groups[c.color] ??= []).push(c.cityId);
      });
      for (const [color, ids] of Object.entries(groups)) {
        if (ids.length >= required && state.diseases[color]?.status === 'active') {
          actions.push({
            label:  `🧪 Discover Cure (${color})${me.role === 'scientist' ? ' — 4 cards' : ''}`,
            type:   'cure',
            params: { cardCityIds: ids.slice(0, required) },
          });
        }
      }
    }

    // Share Knowledge
    state.players.forEach((other, i) => {
      if (i === myPlayerIndex || !other.isConnected) return;
      if (other.location !== me.location) return;

      const iAmResearcher     = me.role === 'researcher';
      const theyAreResearcher = other.role === 'researcher';

      if (iAmResearcher) {
        me.hand.filter(c => c.type === 'city').forEach(c => {
          actions.push({
            label:  `🤝 Give ${c.name} → ${other.name}`,
            type:   'share',
            params: { targetPlayerId: other.id, cardCityId: c.cityId, direction: 'give' },
          });
        });
      } else if (me.hand.some(c => c.type === 'city' && c.cityId === city.id)) {
        actions.push({
          label:  `🤝 Give ${city.name} → ${other.name}`,
          type:   'share',
          params: { targetPlayerId: other.id, cardCityId: city.id, direction: 'give' },
        });
      }

      if (iAmResearcher || theyAreResearcher) {
        other.hand?.filter(c => c.type === 'city').forEach(c => {
          actions.push({
            label:  `🤝 Take ${c.name} ← ${other.name}`,
            type:   'share',
            params: { targetPlayerId: other.id, cardCityId: c.cityId, direction: 'take' },
          });
        });
      } else if (other.hand?.some(c => c.type === 'city' && c.cityId === city.id)) {
        actions.push({
          label:  `🤝 Take ${city.name} ← ${other.name}`,
          type:   'share',
          params: { targetPlayerId: other.id, cardCityId: city.id, direction: 'take' },
        });
      }
    });
  }

  return actions;
}

// ── Exported: all available actions for the sidebar panel ─────────────────────
// Returns a flat array of { group, label, type, params } objects.
// group is 'here' (in-city) or 'move'.
// params===null means it's an info-only hint (charter/ops require board click).

export function getAvailableActions(state, myPlayerIndex) {
  if (!state?.players || myPlayerIndex === null || myPlayerIndex === undefined) return [];
  if (state.phase !== 'playing' || state.turnPhase !== 'actions') return [];
  if (myPlayerIndex !== state.currentPlayerIndex) return [];

  const me       = state.players[myPlayerIndex];
  if (!me) return [];

  const fromCity = CITIES[me.location];
  if (!fromCity) return [];

  const actions = [];

  // ── In-city actions ─────────────────────────────────────────────────────────
  const cubes = state.diseaseCubes[me.location] || {};
  for (const [color, count] of Object.entries(cubes)) {
    if (count > 0) {
      const isMedic = me.role === 'medic';
      const isCured = state.diseases[color]?.status !== 'active';
      const tag = (isMedic && !isCured) ? ' (Medic: all)' : isCured ? ' (all — cured)' : ` (${count})`;
      actions.push({ group: 'here', label: `💊 Treat ${color}${tag}`, type: 'treat', params: { color } });
    }
  }

  if (!state.researchStations.includes(me.location)) {
    const isOps   = me.role === 'operations-expert';
    const hasCard = me.hand.some(c => c.type === 'city' && c.cityId === me.location);
    if (isOps || hasCard) {
      actions.push({ group: 'here', label: `🏗️ Build Research Station${isOps ? ' (no card needed)' : ''}`, type: 'build-station', params: {} });
    }
  }

  if (state.researchStations.includes(me.location)) {
    const required = me.role === 'scientist' ? 4 : 5;
    const groups   = {};
    me.hand.forEach(c => { if (c.type === 'city') (groups[c.color] ??= []).push(c.cityId); });
    for (const [color, ids] of Object.entries(groups)) {
      if (ids.length >= required && state.diseases[color]?.status === 'active') {
        actions.push({
          group:  'here',
          label:  `🧪 Discover Cure (${color})${me.role === 'scientist' ? ' — 4 cards' : ''}`,
          type:   'cure',
          params: { cardCityIds: ids.slice(0, required) },
        });
      }
    }
  }

  state.players.forEach((other, i) => {
    if (i === myPlayerIndex || !other.isConnected) return;
    if (other.location !== me.location) return;

    const iAmResearcher     = me.role === 'researcher';
    const theyAreResearcher = other.role === 'researcher';

    if (iAmResearcher) {
      me.hand.filter(c => c.type === 'city').forEach(c => {
        actions.push({ group: 'here', label: `🤝 Give ${c.name} → ${other.name}`, type: 'share', params: { targetPlayerId: other.id, cardCityId: c.cityId, direction: 'give' } });
      });
    } else if (me.hand.some(c => c.type === 'city' && c.cityId === me.location)) {
      const locName = CITIES[me.location]?.name || me.location;
      actions.push({ group: 'here', label: `🤝 Give ${locName} → ${other.name}`, type: 'share', params: { targetPlayerId: other.id, cardCityId: me.location, direction: 'give' } });
    }

    if (iAmResearcher || theyAreResearcher) {
      other.hand?.filter(c => c.type === 'city').forEach(c => {
        actions.push({ group: 'here', label: `🤝 Take ${c.name} ← ${other.name}`, type: 'share', params: { targetPlayerId: other.id, cardCityId: c.cityId, direction: 'take' } });
      });
    } else if (other.hand?.some(c => c.type === 'city' && c.cityId === me.location)) {
      const locName = CITIES[me.location]?.name || me.location;
      actions.push({ group: 'here', label: `🤝 Take ${locName} ← ${other.name}`, type: 'share', params: { targetPlayerId: other.id, cardCityId: me.location, direction: 'take' } });
    }
  });

  // ── Movement ─────────────────────────────────────────────────────────────────

  // Drive / Ferry
  fromCity.connections.forEach(id => {
    const dest = CITIES[id];
    if (dest) actions.push({ group: 'move', label: `🚶 Drive to ${dest.name}`, type: 'drive', params: { cityId: id } });
  });

  // Direct Flight (one entry per card in hand ≠ current city)
  me.hand.filter(c => c.type === 'city' && c.cityId !== me.location).forEach(c => {
    actions.push({ group: 'move', label: `✈️ Fly to ${c.name}`, type: 'direct-flight', params: { cityId: c.cityId } });
  });

  // Charter Flight — if available, single hint (destination chosen via board click)
  if (me.hand.some(c => c.type === 'city' && c.cityId === me.location)) {
    const locName = CITIES[me.location]?.name || me.location;
    actions.push({ group: 'move', label: `🗺️ Charter Flight (have ${locName} card) — click city`, type: 'charter-hint', params: null });
  }

  // Shuttle Flight
  if (state.researchStations.includes(me.location)) {
    state.researchStations.filter(id => id !== me.location).forEach(id => {
      const dest = CITIES[id];
      if (dest) actions.push({ group: 'move', label: `🔬 Shuttle to ${dest.name}`, type: 'shuttle-flight', params: { cityId: id } });
    });
  }

  // Operations Expert flight — single hint
  if (me.role === 'operations-expert' && state.researchStations.includes(me.location) && !state.opsFlightUsedThisTurn) {
    actions.push({ group: 'move', label: `🛸 Ops Flight available — click city`, type: 'ops-hint', params: null });
  }

  // Dispatcher — move other pawns to cities with another pawn
  if (me.role === 'dispatcher') {
    const seen = new Set();
    state.players.forEach((other, i) => {
      if (i === myPlayerIndex || !other.isConnected) return;
      state.players.forEach((atDest) => {
        if (!atDest.isConnected || atDest.id === other.id) return;
        if (atDest.location === other.location) return;
        const key = `${other.id}|${atDest.location}`;
        if (seen.has(key)) return;
        seen.add(key);
        const dest = CITIES[atDest.location];
        if (dest) {
          actions.push({ group: 'move', label: `🎯 Move ${other.name} to ${dest.name}`, type: 'dispatcher-move', params: { targetPlayerId: other.id, cityId: atDest.location } });
        }
      });
    });
  }

  return actions;
}

// ── InputHandler class ────────────────────────────────────────────────────────

export class InputHandler {
  constructor(canvas, popup, onAction) {
    this.canvas   = canvas;
    this.popup    = popup;
    this.onAction = onAction;
    this.state    = null;
    this.myPlayerIndex = null;

    canvas.addEventListener('click',   e => this._onCanvasClick(e));
    canvas.style.cursor = 'crosshair';

    document.addEventListener('click', e => {
      if (!this.popup.contains(e.target) && e.target !== canvas) this._closePopup();
    });
  }

  update(state, myPlayerIndex) {
    this.state         = state;
    this.myPlayerIndex = myPlayerIndex;
  }

  _onCanvasClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x    = e.clientX - rect.left;
    const y    = e.clientY - rect.top;
    const city = this._hitTest(x, y, rect.width, rect.height);
    if (city) {
      this._showPopup(city, e.clientX, e.clientY);
    } else {
      this._closePopup();
    }
  }

  _hitTest(x, y, W, H) {
    let closest = null;
    let minDist = HIT_RADIUS;
    for (const city of Object.values(CITIES)) {
      const cx   = city.x * W;
      const cy   = city.y * H;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < minDist) { minDist = dist; closest = city; }
    }
    return closest;
  }

  _showPopup(city, screenX, screenY) {
    const state = this.state;
    if (!state || state.phase !== 'playing') return this._closePopup();

    const isMyTurn      = this.myPlayerIndex === state.currentPlayerIndex;
    const isActionPhase = state.turnPhase === 'actions';
    if (!isMyTurn || !isActionPhase) return this._closePopup();

    const me = state.players[this.myPlayerIndex];
    if (!me) return this._closePopup();

    const actions = _computeActionsForCity(city, me, state, this.myPlayerIndex);
    if (actions.length === 0) return this._closePopup();

    const header = document.createElement('div');
    header.className = 'popup-city-name';
    header.textContent = city.name;

    this.popup.innerHTML = '';
    this.popup.appendChild(header);

    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.className   = 'popup-action-btn';
      btn.textContent = a.label;
      btn.addEventListener('click', () => {
        this.onAction(a.type, a.params);
        this._closePopup();
      });
      this.popup.appendChild(btn);
    });

    const cancel = document.createElement('button');
    cancel.className   = 'popup-cancel-btn';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => this._closePopup());
    this.popup.appendChild(cancel);

    this.popup.classList.remove('hidden');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = this.popup.offsetWidth  || 180;
    const ph = this.popup.offsetHeight || 120;
    this.popup.style.left = `${Math.min(screenX + 12, vw - pw - 8)}px`;
    this.popup.style.top  = `${Math.min(screenY - 10, vh - ph - 8)}px`;
  }

  _closePopup() {
    this.popup.classList.add('hidden');
    this.popup.innerHTML = '';
  }

  getHighlights() {
    const empty = { drive: new Set(), flight: new Set(), quarantine: new Set() };
    if (!this.state || !this.state.players) return empty;

    const qs = this.state.players.find(p => p.role === 'quarantine-specialist' && p.isConnected);
    if (qs) {
      const qsCity = CITIES[qs.location];
      if (qsCity) {
        empty.quarantine.add(qs.location);
        qsCity.connections.forEach(id => empty.quarantine.add(id));
      }
    }

    const isMyTurn      = this.myPlayerIndex === this.state.currentPlayerIndex;
    const isActionPhase = this.state.turnPhase === 'actions';
    if (!isMyTurn || !isActionPhase) return empty;

    const me = this.state.players[this.myPlayerIndex];
    if (!me) return empty;

    const fromCity = CITIES[me.location];
    if (!fromCity) return empty;

    const drive  = new Set(fromCity.connections);
    const flight = new Set(
      me.hand.filter(c => c.type === 'city' && c.cityId !== me.location).map(c => c.cityId)
    );

    return { drive, flight, quarantine: empty.quarantine };
  }
}

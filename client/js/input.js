// Canvas hit-testing and action popup for the game board.
// On city click: determines which Pandemic actions are valid and shows a popup menu.
// Phase 6: role-aware action detection for all 7 roles.

import { CITIES } from './data/cities.js';

const HIT_RADIUS = 16; // px — slightly larger than drawn city radius for easier clicking

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

  // ── Canvas click ───────────────────────────────────────────────────────────

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

  // ── Action popup ───────────────────────────────────────────────────────────

  _showPopup(city, screenX, screenY) {
    const state = this.state;
    if (!state || state.phase !== 'playing') return this._closePopup();

    const isMyTurn      = this.myPlayerIndex === state.currentPlayerIndex;
    const isActionPhase = state.turnPhase === 'actions';
    if (!isMyTurn || !isActionPhase) return this._closePopup();

    const me = state.players[this.myPlayerIndex];
    if (!me) return this._closePopup();

    const actions = this._getValidActions(city, me, state);
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

    // Position — keep inside viewport
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

  // ── Determine valid actions for a clicked city ─────────────────────────────

  _getValidActions(city, me, state) {
    const actions  = [];
    const isHere   = city.id === me.location;
    const fromCity = CITIES[me.location];
    const cubes    = state.diseaseCubes[city.id] || {};

    if (!isHere) {
      // ── Movement actions ──────────────────────────────────────────────────

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

      // ── Operations Expert: fly from a research station with any card ───────
      if (me.role === 'operations-expert' &&
          state.researchStations.includes(me.location) &&
          !state.opsFlightUsedThisTurn) {
        // Show one entry per card they could discard
        me.hand.filter(c => c.type === 'city').forEach(c => {
          actions.push({
            label:  `🛸 Ops Flight (discard ${c.name})`,
            type:   'ops-expert-flight',
            params: { cityId: city.id, cardCityId: c.cityId },
          });
        });
      }

      // ── Dispatcher: move another player's pawn to this city ───────────────
      if (me.role === 'dispatcher') {
        state.players.forEach((other, i) => {
          if (i === this.myPlayerIndex || !other.isConnected) return;
          if (other.location === city.id) return; // already there
          // Destination must have another pawn
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
      // ── On-city actions ───────────────────────────────────────────────────

      // Treat Disease — one button per colour present
      for (const [color, count] of Object.entries(cubes)) {
        if (count > 0) {
          const isMedic = me.role === 'medic';
          const isCured = state.diseases[color]?.status !== 'active';
          const removeCount = (isMedic || isCured) ? count : 1;
          const tag = isMedic && !isCured ? ' (Medic: all)' : isCured ? ` (all — cured)` : ` (${count})`;
          actions.push({ label: `💊 Treat ${color}${tag}`, type: 'treat', params: { color } });
        }
      }

      // Build Research Station
      if (!state.researchStations.includes(city.id)) {
        const isOpsExpert = me.role === 'operations-expert';
        const hasCard     = me.hand.some(c => c.type === 'city' && c.cityId === city.id);
        if (isOpsExpert || hasCard) {
          const tag = isOpsExpert ? ' (no card needed)' : '';
          actions.push({ label: `🏗️ Build Research Station${tag}`, type: 'build-station', params: {} });
        }
      }

      // Discover Cure — at research station
      if (state.researchStations.includes(city.id)) {
        const required = me.role === 'scientist' ? 4 : 5;
        const groups   = {};
        me.hand.forEach(c => {
          if (c.type === 'city') (groups[c.color] ??= []).push(c.cityId);
        });
        for (const [color, ids] of Object.entries(groups)) {
          if (ids.length >= required && state.diseases[color]?.status === 'active') {
            const tag = me.role === 'scientist' ? ' (Scientist: 4 cards)' : '';
            actions.push({
              label:  `🧪 Discover Cure (${color})${tag}`,
              type:   'cure',
              params: { cardCityIds: ids.slice(0, required) },
            });
          }
        }
      }

      // Share Knowledge — co-located players
      state.players.forEach((other, i) => {
        if (i === this.myPlayerIndex || !other.isConnected) return;
        if (other.location !== me.location) return;

        const iAmResearcher   = me.role === 'researcher';
        const theyAreResearcher = other.role === 'researcher';

        if (iAmResearcher) {
          // Researcher can give ANY city card in hand
          me.hand.filter(c => c.type === 'city').forEach(c => {
            actions.push({
              label:  `🤝 Give ${c.name} → ${other.name}`,
              type:   'share',
              params: { targetPlayerId: other.id, cardCityId: c.cityId, direction: 'give' },
            });
          });
        } else {
          // Standard: give card matching current city
          if (me.hand.some(c => c.type === 'city' && c.cityId === city.id)) {
            actions.push({
              label:  `🤝 Give ${city.name} → ${other.name}`,
              type:   'share',
              params: { targetPlayerId: other.id, cardCityId: city.id, direction: 'give' },
            });
          }
        }

        // Take card matching current city (or any card if they're the Researcher)
        if (theyAreResearcher) {
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

  // ── Highlight sets for board renderer ─────────────────────────────────────
  // Returns { drive: Set, flight: Set, quarantine: Set } for board renderer.

  getHighlights() {
    const empty = { drive: new Set(), flight: new Set(), quarantine: new Set() };
    if (!this.state || !this.state.players) return empty;

    // Quarantine Specialist aura — always visible for all players
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

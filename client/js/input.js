// Canvas hit-testing and action popup for the game board.
// On city click: determines which Pandemic actions are valid and shows a popup menu.

import { CITIES } from './data/cities.js';

const HIT_RADIUS = 16; // px — slightly larger than drawn city radius for easier clicking

export class InputHandler {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement}       popup   — the #action-popup DOM element
   * @param {function}          onAction  — callback(type, params)
   */
  constructor(canvas, popup, onAction) {
    this.canvas   = canvas;
    this.popup    = popup;
    this.onAction = onAction;
    this.state    = null;
    this.myPlayerIndex = null;

    canvas.addEventListener('click',   e => this._onCanvasClick(e));
    canvas.style.cursor = 'crosshair';

    // Close popup on outside click
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

    const isMyTurn     = this.myPlayerIndex === state.currentPlayerIndex;
    const isActionPhase = state.turnPhase === 'actions';
    if (!isMyTurn || !isActionPhase) return this._closePopup();

    const me = state.players[this.myPlayerIndex];
    if (!me) return this._closePopup();

    const actions = this._getValidActions(city, me, state);
    if (actions.length === 0) return this._closePopup();

    // Build popup DOM
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
    const actions   = [];
    const isHere    = city.id === me.location;
    const fromCity  = CITIES[me.location];
    const cubes     = state.diseaseCubes[city.id] || {};

    if (!isHere) {
      // ── Movement actions ────────────────────────────────────────────────────

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

    } else {
      // ── On-city actions ─────────────────────────────────────────────────────

      // Treat Disease — one button per colour present
      for (const [color, count] of Object.entries(cubes)) {
        if (count > 0) {
          actions.push({ label: `💊 Treat ${color} (${count})`, type: 'treat', params: { color } });
        }
      }

      // Build Research Station
      if (!state.researchStations.includes(city.id) &&
           me.hand.some(c => c.type === 'city' && c.cityId === city.id)) {
        actions.push({ label: '🏗️ Build Research Station', type: 'build-station', params: {} });
      }

      // Discover Cure — at research station with ≥5 same-colour cards
      if (state.researchStations.includes(city.id)) {
        const groups = {};
        me.hand.forEach(c => {
          if (c.type === 'city') (groups[c.color] ??= []).push(c.cityId);
        });
        for (const [color, ids] of Object.entries(groups)) {
          if (ids.length >= 5 && state.diseases[color]?.status === 'active') {
            actions.push({
              label:  `🧪 Discover Cure (${color})`,
              type:   'cure',
              params: { cardCityIds: ids.slice(0, 5) },
            });
          }
        }
      }

      // Share Knowledge — co-located player
      state.players.forEach((other, i) => {
        if (i === this.myPlayerIndex || !other.isConnected) return;
        if (other.location !== me.location) return;

        const iHaveCard    = me.hand.some(c  => c.type === 'city' && c.cityId === city.id);
        const theyHaveCard = other.hand?.some(c => c.type === 'city' && c.cityId === city.id);

        if (iHaveCard) {
          actions.push({
            label:  `🤝 Give ${city.name} → ${other.name}`,
            type:   'share',
            params: { targetPlayerId: other.id, cardCityId: city.id, direction: 'give' },
          });
        }
        if (theyHaveCard) {
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

  // ── Compute highlighted cities for board renderer ──────────────────────────
  // Returns { drive: Set, flight: Set } based on current player's options.

  getHighlights() {
    const empty = { drive: new Set(), flight: new Set() };
    if (!this.state || !this.state.players) return empty;

    const isMyTurn     = this.myPlayerIndex === this.state.currentPlayerIndex;
    const isActionPhase = this.state.turnPhase === 'actions';
    if (!isMyTurn || !isActionPhase) return empty;

    const me       = this.state.players[this.myPlayerIndex];
    if (!me) return empty;

    const fromCity = CITIES[me.location];
    if (!fromCity) return empty;

    const drive  = new Set(fromCity.connections);
    const flight = new Set(
      me.hand.filter(c => c.type === 'city' && c.cityId !== me.location).map(c => c.cityId)
    );

    return { drive, flight };
  }
}

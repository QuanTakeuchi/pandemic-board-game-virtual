// Dramatic infection animation — shows a card overlay for each infect/outbreak/epidemic event,
// then calls onCubePlace(ev) after each card so the caller can progressively update the board.

const HOLD_MS = {
  epidemic: 1600,
  outbreak: 1100,
  infect:    700,
};

const EXIT_MS = 320;

export class InfectionAnimator {
  constructor() {
    this._overlay = null;
    this._running = false;
  }

  get running() { return this._running; }

  // ── Public API ──────────────────────────────────────────────────────────────
  // events      : [{type, city, cityId, color, count?}] in CHRONOLOGICAL order
  // onCubePlace : called with (ev) after each card exits — update your working state here
  // onDone      : called after all cards have animated

  animate(events, onCubePlace, onDone) {
    const filtered = events.filter(e => ['infect', 'outbreak', 'epidemic'].includes(e.type));
    if (!filtered.length) { onDone(); return; }

    this._running = true;
    this._ensureOverlay();

    let i = 0;

    const next = () => {
      if (i >= filtered.length) {
        this._hideOverlay();
        this._running = false;
        onDone();
        return;
      }
      this._showCard(filtered[i++], () => {
        onCubePlace(filtered[i - 1]);
        next();
      });
    };

    next();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _showCard(ev, onHide) {
    const overlay = this._overlay;
    overlay.innerHTML = '';
    overlay.classList.remove('hidden');

    const card = document.createElement('div');
    const variantClass =
      ev.type === 'epidemic' ? 'infect-card--epidemic' :
      ev.type === 'outbreak' ? 'infect-card--outbreak' :
      `infect-card--${ev.color || 'blue'}`;

    card.className = `infect-card ${variantClass}`;

    const icon =
      ev.type === 'epidemic' ? '☣' :
      ev.type === 'outbreak' ? '⚠' : '🦠';

    const label =
      ev.type === 'epidemic' ? 'EPIDEMIC' :
      ev.type === 'outbreak' ? 'OUTBREAK' :
      'INFECTED';

    const cityText = _esc(ev.city || ev.cityId || '?');
    const holdMs   = HOLD_MS[ev.type] ?? HOLD_MS.infect;

    card.innerHTML = `
      <div class="infect-card-icon">${icon}</div>
      <div class="infect-card-label">${label}</div>
      <div class="infect-card-city">${cityText}</div>
    `;

    overlay.appendChild(card);

    // Trigger enter animation on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => card.classList.add('infect-card-visible'));
    });

    // Hold → exit animation → callback
    setTimeout(() => {
      card.classList.add('infect-card-exit');
      setTimeout(onHide, EXIT_MS);
    }, holdMs);
  }

  _ensureOverlay() {
    if (this._overlay) return;
    const el = document.createElement('div');
    el.id = 'infection-overlay';
    el.className = 'infection-overlay hidden';
    document.body.appendChild(el);
    this._overlay = el;
  }

  _hideOverlay() {
    if (!this._overlay) return;
    this._overlay.classList.add('hidden');
    this._overlay.innerHTML = '';
  }
}

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

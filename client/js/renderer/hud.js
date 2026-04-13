// DOM HUD renderer — updates all elements outside the canvas.
// Called with the full game state object on every state broadcast.
// During Phase 2 (no game state), initHud() just wires up static chrome.

const INFECTION_RATE_TRACK = [2, 2, 2, 3, 3, 4, 4];

// ── Init (called once on page load) ──────────────────────────────────────────

export function initHud(roomCode) {
  // Room code in topbar
  const chip = document.getElementById('topbar-room-code');
  if (chip) chip.textContent = roomCode || '----';

  // Build outbreak pips (8 total)
  const pipsEl = document.getElementById('outbreak-pips');
  if (pipsEl) {
    pipsEl.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const pip = document.createElement('div');
      pip.className = 'outbreak-pip';
      pip.dataset.index = i;
      pipsEl.appendChild(pip);
    }
  }
}

// ── Full state render (called on every game:state event) ─────────────────────

export function renderHud(state, myPlayerIndex = null) {
  if (!state) return;
  renderOutbreakTrack(state.outbreakCount ?? 0);
  renderInfectionRate(state.infectionRateIndex ?? 0);
  renderCureIndicators(state.diseases ?? {});
  renderPlayerCards(state.players ?? [], state.currentPlayerIndex ?? 0, myPlayerIndex);
  renderActionPips(state.actionsRemaining ?? 4);
  renderTurnBanner(state, myPlayerIndex);
  if (myPlayerIndex !== null && state.players?.[myPlayerIndex]) {
    renderCardHand(state.players[myPlayerIndex].hand ?? []);
  }
  renderDeckCounts(state);
}

// ── Outbreak track ────────────────────────────────────────────────────────────

function renderOutbreakTrack(count) {
  const pips = document.querySelectorAll('.outbreak-pip');
  pips.forEach((pip, i) => {
    pip.classList.toggle('active', i < count);
  });
  const countEl = document.getElementById('outbreak-count');
  if (countEl) countEl.textContent = `${count}/8`;
}

// ── Infection rate ────────────────────────────────────────────────────────────

function renderInfectionRate(index) {
  const rate = INFECTION_RATE_TRACK[Math.min(index, INFECTION_RATE_TRACK.length - 1)];
  const el = document.getElementById('infection-rate');
  if (el) el.textContent = rate;
}

// ── Cure indicators ───────────────────────────────────────────────────────────

function renderCureIndicators(diseases) {
  for (const [color, data] of Object.entries(diseases)) {
    const dot = document.querySelector(`.cure-dot[data-color="${color}"]`);
    if (!dot) continue;
    dot.className = 'cure-dot';          // reset
    dot.dataset.color = color;           // preserve
    if (data.status === 'cured')       dot.classList.add('cured');
    if (data.status === 'eradicated')  dot.classList.add('cured', 'eradicated');
    dot.title = `${capitalize(color)} — ${data.status}`;
  }
}

// Role colour map (must match server/game/data/roles.js pawnColor values)
const ROLE_COLORS = {
  'medic':                  '#f0a500',
  'scientist':              '#e0e0e0',
  'researcher':             '#c47a3a',
  'operations-expert':      '#3cb371',
  'dispatcher':             '#cc44cc',
  'quarantine-specialist':  '#2e8b57',
  'contingency-planner':    '#4a9ed9',
};

const ROLE_ABILITIES = {
  'medic':                  'Removes all cubes when treating. Auto-cleans cured diseases.',
  'scientist':              'Only 4 cards needed to cure a disease.',
  'researcher':             'Can give any city card (not just current city).',
  'operations-expert':      'Builds stations without a card. Once/turn: fly from any station.',
  'dispatcher':             'Moves any pawn to a city occupied by another pawn.',
  'quarantine-specialist':  'Prevents cube placement in current city + neighbours.',
  'contingency-planner':    'Can retrieve event cards from the player discard pile.',
};

// ── Player cards ──────────────────────────────────────────────────────────────

function renderPlayerCards(players, currentPlayerIndex, myPlayerIndex) {
  const container = document.getElementById('player-cards');
  if (!container) return;

  container.innerHTML = '';

  players.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'player-card' + (i === currentPlayerIndex ? ' active-turn' : '');

    const roleColor = ROLE_COLORS[p.role] || 'var(--muted)';
    div.style.borderLeftColor = roleColor;

    const connectedDot = p.isConnected
      ? '<span style="color:var(--success);font-size:10px;">●</span>'
      : '<span style="color:var(--muted);font-size:10px;">○</span>';

    const youTag     = i === myPlayerIndex ? ' <span class="you-tag">(you)</span>' : '';
    const roleStr    = (p.role || 'no role').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const cityName   = p.location ? p.location.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '—';
    const abilityTip = ROLE_ABILITIES[p.role] || '';

    div.innerHTML = `
      <div class="p-name">${connectedDot} ${escapeHtml(p.name)}${youTag}</div>
      <div class="p-role" style="color:${roleColor}">${escapeHtml(roleStr)}</div>
      <div class="p-ability">${escapeHtml(abilityTip)}</div>
      <div class="p-location">📍 ${escapeHtml(cityName)} &nbsp;·&nbsp; ${p.hand?.length ?? 0} cards</div>
    `;
    container.appendChild(div);
  });
}

// ── Actions remaining ─────────────────────────────────────────────────────────

function renderActionPips(remaining) {
  const pips = document.querySelectorAll('.action-pip');
  pips.forEach((pip, i) => {
    // Pips light up for used actions (4 - remaining used so far)
    pip.classList.toggle('used', i >= remaining);
  });
}

// ── Event log ─────────────────────────────────────────────────────────────────

export function appendLogEntry(entry) {
  const container = document.getElementById('log-entries');
  if (!container) return;

  // Clear placeholder
  const placeholder = container.querySelector('[style*="italic"]');
  if (placeholder) placeholder.remove();

  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = formatLogEntry(entry);
  container.prepend(div);   // newest at top

  // Cap at 50 entries
  while (container.children.length > 50) {
    container.removeChild(container.lastChild);
  }
}

export function renderEventLog(entries) {
  const container = document.getElementById('log-entries');
  if (!container) return;
  container.innerHTML = '';
  [...entries].reverse().forEach(e => appendLogEntry(e));
}

function formatLogEntry(entry) {
  const p  = (name) => `<span class="log-player">${esc(name)}</span>`;
  const c  = (id, color) => `<span class="log-city-${color || 'blue'}">${cityLabel(id)}</span>`;

  switch (entry.type) {
    case 'game-start':
      return `<span style="color:var(--success)">${esc(entry.message)}</span>`;
    case 'game-over':
      return `<span style="color:var(--danger);font-weight:700;">${esc(entry.message)}</span>`;

    case 'move':
      return `${p(entry.player)} moved to ${c(entry.to, entry.color)}`;
    case 'direct-flight':
      return `${p(entry.player)} flew direct to ${c(entry.to, entry.color)}`;
    case 'charter-flight':
      return `${p(entry.player)} chartered a flight to ${c(entry.to, entry.color)}`;
    case 'shuttle':
      return `${p(entry.player)} shuttled to ${c(entry.to, entry.color)}`;

    case 'treat':
      return `${p(entry.player)} treated <span class="log-city-${entry.color}">${entry.color}</span> in ${c(entry.city, entry.color)}`;
    case 'build':
      return `${p(entry.player)} built a station in ${c(entry.city, entry.color)}`;
    case 'cure':
      return `${p(entry.player)} cured <span class="log-city-${entry.color}">${entry.color}</span>! 🎉`;
    case 'share':
      return `${p(entry.player)} shared ${cityLabel(entry.city)} with ${p(entry.target)}`;
    case 'discard':
      return `${p(entry.player)} discarded <span class="log-city-${entry.color || 'blue'}">${esc(entry.card)}</span>`;
    case 'draw':
      return `${p(entry.player)} drew <span class="log-city-blue">${esc(entry.card)}</span>`;
    case 'ops-flight':
      return `${p(entry.player)} used Ops Flight to ${c(entry.to, entry.color)}`;
    case 'dispatcher-move':
      return `${p(entry.player)} (Dispatcher) moved ${p(entry.target)} to ${c(entry.to, entry.color)}`;
    case 'medic-clean':
      return `<span style="color:#f0a500">Medic</span> auto-removed <span class="log-city-${entry.color}">${entry.color}</span> cubes in ${cityLabel(entry.city)}`;
    case 'eradicate':
      return `<span style="color:var(--success)">✓ ERADICATED</span> <span class="log-city-${entry.color}">${entry.color}</span>`;

    case 'outbreak':
      return `<span class="log-outbreak">⚠ OUTBREAK</span> in <span class="log-city-${entry.color}">${esc(entry.city)}</span>`;
    case 'epidemic':
      return `<span class="log-epidemic">☣ EPIDEMIC</span> — <span class="log-city-${entry.color}">${esc(entry.city)}</span> infected`;
    case 'infect':
      return `Infected <span class="log-city-${entry.color}">${esc(entry.city)}</span>`;

    default:
      return esc(JSON.stringify(entry));
  }
}

// Convert a city id like "new-york" to "New York"
function cityLabel(id) {
  return String(id || '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(str) {
  return escapeHtml(String(str || ''));
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Turn phase banner ─────────────────────────────────────────────────────────

function renderTurnBanner(state, myPlayerIndex) {
  const banner = document.getElementById('turn-banner');
  if (!banner) return;

  const isMyTurn      = myPlayerIndex === state.currentPlayerIndex;
  const phase         = state.turnPhase;
  const actionsLeft   = state.actionsRemaining ?? 4;
  const currentPlayer = state.players?.[state.currentPlayerIndex];

  if (phase === 'draw') {
    banner.textContent = '📤 Drawing cards…';
    banner.className   = 'turn-banner phase-banner';
  } else if (phase === 'infect') {
    banner.textContent = '🦠 Infecting cities…';
    banner.className   = 'turn-banner phase-banner';
  } else if (phase === 'discard') {
    if (isMyTurn) {
      const overBy = Math.max(0, (currentPlayer?.hand?.length ?? 8) - 7);
      banner.textContent = `🃏 Discard ${overBy} card${overBy !== 1 ? 's' : ''}`;
      banner.className   = 'turn-banner discard-banner';
    } else {
      banner.textContent = `${currentPlayer?.name || '…'} is discarding…`;
      banner.className   = 'turn-banner other-turn';
    }
  } else if (isMyTurn) {
    banner.textContent = `Your turn — ${actionsLeft} action${actionsLeft !== 1 ? 's' : ''} left`;
    banner.className   = 'turn-banner my-turn';
  } else {
    const who = currentPlayer?.name || '…';
    banner.textContent = `${who}'s turn`;
    banner.className   = 'turn-banner other-turn';
  }
}

// ── Card hand ─────────────────────────────────────────────────────────────────

const COLOR_HEX = { blue: '#4a90d9', yellow: '#e8c34a', black: '#9090a0', red: '#d94a4a' };

function renderCardHand(hand) {
  const container = document.getElementById('card-hand');
  if (!container) return;
  container.innerHTML = '';

  if (!hand.length) {
    container.innerHTML = '<div class="hand-empty">No cards</div>';
    return;
  }

  hand.forEach(card => {
    const div = document.createElement('div');
    if (card.type === 'epidemic') {
      div.className = 'hand-card hand-card-epidemic';
      div.textContent = '⚠️ Epidemic';
    } else {
      div.className = `hand-card hand-card-city`;
      div.style.borderLeftColor = COLOR_HEX[card.color] || '#888';
      div.textContent = card.name || card.cityId;
    }
    container.appendChild(div);
  });
}

// ── Available actions panel ───────────────────────────────────────────────────
// Renders the sidebar list of all currently valid actions.
// actions: array from getAvailableActions(); onAction: dispatch callback.

export function renderAvailableActions(actions, onAction) {
  const container = document.getElementById('available-actions');
  if (!container) return;

  container.innerHTML = '';

  if (!actions || actions.length === 0) {
    container.innerHTML = '<div class="avail-actions-empty">No actions — not your turn</div>';
    return;
  }

  const hereActions = actions.filter(a => a.group === 'here');
  const moveActions = actions.filter(a => a.group === 'move');

  if (hereActions.length) {
    _appendActionGroup(container, 'Here', hereActions, onAction);
  }
  if (moveActions.length) {
    _appendActionGroup(container, 'Movement', moveActions, onAction);
  }
}

function _appendActionGroup(container, title, actions, onAction) {
  const header = document.createElement('div');
  header.className = 'avail-action-group';
  header.textContent = title;
  container.appendChild(header);

  actions.forEach(a => {
    const isHint = a.params === null;
    const btn = document.createElement('button');
    btn.className = `avail-action-btn${isHint ? ' hint-only' : ''}`;
    btn.textContent = a.label;
    btn.title = a.label;
    if (!isHint) {
      btn.addEventListener('click', () => onAction(a.type, a.params));
    }
    container.appendChild(btn);
  });
}

// ── Deck counts ───────────────────────────────────────────────────────────────

function renderDeckCounts(state) {
  const pdEl = document.getElementById('player-deck-count');
  const idEl = document.getElementById('infection-deck-count');
  if (pdEl) pdEl.textContent = state.playerDeck?.drawPileCount ?? '?';
  if (idEl) idEl.textContent = state.infectionDeck?.drawPileCount ?? '?';
}

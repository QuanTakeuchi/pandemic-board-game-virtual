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

// ── Player cards ──────────────────────────────────────────────────────────────

function renderPlayerCards(players, currentPlayerIndex, myPlayerIndex) {
  const container = document.getElementById('player-cards');
  if (!container) return;

  container.innerHTML = '';

  players.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'player-card' + (i === currentPlayerIndex ? ' active-turn' : '');

    const connectedDot = p.isConnected
      ? '<span style="color:var(--success);font-size:10px;">●</span>'
      : '<span style="color:var(--muted);font-size:10px;">○</span>';

    const youTag  = i === myPlayerIndex ? ' <span class="you-tag">(you)</span>' : '';
    const roleStr = (p.role || 'no role').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const cityName = p.location ? p.location.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '—';

    div.innerHTML = `
      <div class="p-name">${connectedDot} ${escapeHtml(p.name)}${youTag}</div>
      <div class="p-role">${escapeHtml(roleStr)}</div>
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
  switch (entry.type) {
    case 'move':
      return `<span class="log-player">${esc(entry.player)}</span> moved to <span class="log-city-${entry.color || 'blue'}">${esc(entry.to)}</span>`;
    case 'treat':
      return `<span class="log-player">${esc(entry.player)}</span> treated ${entry.color} disease in <span class="log-city-${entry.color}">${esc(entry.city)}</span>`;
    case 'build':
      return `<span class="log-player">${esc(entry.player)}</span> built a research station in <span class="log-city-${entry.color || 'blue'}">${esc(entry.city)}</span>`;
    case 'cure':
      return `<span class="log-player">${esc(entry.player)}</span> discovered a cure for <span class="log-city-${entry.color}">${entry.color}</span>!`;
    case 'outbreak':
      return `<span style="color:var(--danger)">OUTBREAK</span> in <span class="log-city-${entry.color}">${esc(entry.city)}</span>`;
    case 'epidemic':
      return `<span style="color:var(--danger)">EPIDEMIC!</span> ${esc(entry.city)} infected`;
    case 'infect':
      return `Infected <span class="log-city-${entry.color}">${esc(entry.city)}</span>`;
    default:
      return esc(JSON.stringify(entry));
  }
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

const PHASE_LABELS = {
  actions: null,           // no banner during action phase
  draw:    '📤 Drawing cards…',
  infect:  '🦠 Infecting cities…',
};

function renderTurnBanner(state, myPlayerIndex) {
  const banner = document.getElementById('turn-banner');
  if (!banner) return;

  const isMyTurn = myPlayerIndex === state.currentPlayerIndex;
  const phase    = state.turnPhase;
  const phaseMsg = PHASE_LABELS[phase];
  const actionsLeft = state.actionsRemaining ?? 4;

  if (phaseMsg) {
    banner.textContent = phaseMsg;
    banner.className   = 'turn-banner phase-banner';
  } else if (isMyTurn) {
    banner.textContent = `Your turn — ${actionsLeft} action${actionsLeft !== 1 ? 's' : ''} left`;
    banner.className   = 'turn-banner my-turn';
  } else {
    const who = state.players?.[state.currentPlayerIndex]?.name || '…';
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

// ── Deck counts ───────────────────────────────────────────────────────────────

function renderDeckCounts(state) {
  const pdEl = document.getElementById('player-deck-count');
  const idEl = document.getElementById('infection-deck-count');
  if (pdEl) pdEl.textContent = state.playerDeck?.drawPileCount ?? '?';
  if (idEl) idEl.textContent = state.infectionDeck?.drawPileCount ?? '?';
}

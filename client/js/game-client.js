// ── Game client entry point ───────────────────────────────────────────────────

import { drawBoard, resizeCanvas }    from './renderer/board.js';
import { drawPawns }                  from './renderer/pawns.js';
import { initHud, renderHud, renderEventLog, renderAvailableActions } from './renderer/hud.js';
import { InputHandler, getAvailableActions } from './input.js';
import { InfectionAnimator }          from './renderer/infection-anim.js';

// ── URL params ────────────────────────────────────────────────────────────────

const params   = new URLSearchParams(window.location.search);
const roomCode = (params.get('room') || '').toUpperCase();
const myName   = params.get('name') || '';

if (!roomCode) window.location.href = '/';

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('board-canvas');

let currentState   = null;
let myPlayerIndex  = null;
let inputHandler   = null;

function render() {
  resizeCanvas(canvas);
  const highlights = inputHandler?.getHighlights() ?? {};
  drawBoard(canvas, currentState, highlights);
  if (currentState) drawPawns(canvas, currentState);
}

render(); // initial blank render

window.addEventListener('resize', render);

// ── HUD init ──────────────────────────────────────────────────────────────────

initHud(roomCode);

// ── Deck widgets ──────────────────────────────────────────────────────────────

const deckPlayerEl    = document.getElementById('deck-player');
const deckInfectionEl = document.getElementById('deck-infection');

function updateDeckWidgets(state, myIdx) {
  if (!state) return;

  const isMyTurn = myIdx !== null && myIdx === state.currentPlayerIndex;
  const phase    = state.turnPhase;

  // Update counts
  const pc = document.getElementById('deck-player-count');
  const ic = document.getElementById('deck-infection-count');
  if (pc) pc.textContent = state.playerDeck?.drawPileCount ?? '—';
  if (ic) ic.textContent = state.infectionDeck?.drawPileCount ?? '—';

  // Player deck: active when it's my turn + draw phase
  if (deckPlayerEl) {
    const active = isMyTurn && phase === 'draw';
    deckPlayerEl.classList.toggle('deck-widget-active', active);
    deckPlayerEl.classList.toggle('deck-widget-waiting', !isMyTurn && phase === 'draw');
  }

  // Infection deck: active when it's my turn + infect phase
  if (deckInfectionEl) {
    const active = isMyTurn && phase === 'infect';
    deckInfectionEl.classList.toggle('deck-widget-active', active);
    deckInfectionEl.classList.toggle('deck-widget-waiting', !isMyTurn && phase === 'infect');
  }
}

// ── Card-fly animation ────────────────────────────────────────────────────────
// Animate `count` card backs flying from `fromEl` to `toEl`.

function flyCards(fromEl, toEl, count) {
  if (!fromEl || !toEl) return;

  const fromRect = fromEl.getBoundingClientRect();
  const toRect   = toEl.getBoundingClientRect();

  const CARD_W = 52;
  const CARD_H = 72;

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const card = document.createElement('div');
      card.className = 'flying-card';

      // Start: centred on the source deck
      const startX = fromRect.left + fromRect.width  / 2 - CARD_W / 2;
      const startY = fromRect.top  + fromRect.height / 2 - CARD_H / 2;

      // End: centred on the destination element
      const endX = toRect.left + toRect.width  / 2 - CARD_W / 2;
      const endY = toRect.top  + toRect.height / 2 - CARD_H / 2;

      card.style.cssText = `
        left: ${startX}px;
        top:  ${startY}px;
        width: ${CARD_W}px;
        height: ${CARD_H}px;
      `;
      document.body.appendChild(card);

      // Kick off CSS transition on the next two frames
      requestAnimationFrame(() => requestAnimationFrame(() => {
        card.style.left      = `${endX}px`;
        card.style.top       = `${endY}px`;
        card.style.opacity   = '0';
        card.style.transform = `rotate(0deg) scale(0.65)`;
      }));

      setTimeout(() => card.remove(), 500);
    }, i * 180);
  }
}

// ── Animation + state queue ───────────────────────────────────────────────────

const animator         = new InfectionAnimator();
let   stateQueue       = [];
let   isAnimating      = false;
let   prevGameState    = null;   // state as of last fully-applied update
let   prevEventLogLen  = 0;      // eventLog.length at last fully-applied update

// Called whenever a new game:state arrives or when an animation finishes.
function _processQueue() {
  if (isAnimating || !stateQueue.length) return;

  const state = stateQueue.shift();

  // Resolve which player slot is ours (once)
  if (myPlayerIndex === null && state.players?.length) {
    myPlayerIndex = state.players.findIndex(p => p.name === myName);
    if (myPlayerIndex === -1) myPlayerIndex = null;
  }

  // Always update HUD, log, sidebar and discard overlay immediately —
  // these don't depend on the progressive board render.
  renderHud(state, myPlayerIndex);
  if (state.eventLog) renderEventLog(state.eventLog);
  if (inputHandler)   inputHandler.update(state, myPlayerIndex);
  renderAvailableActions(getAvailableActions(state, myPlayerIndex), dispatchAction);
  updateDiscardOverlay(state, myPlayerIndex);
  updateDeckWidgets(state, myPlayerIndex);

  // ── Determine new animation events ────────────────────────────────────────
  const newLogLen   = state.eventLog?.length ?? 0;
  const newCount    = Math.max(0, newLogLen - prevEventLogLen);

  // New events are at the front (unshift → newest first); reverse for chronological order.
  const animEvents = prevGameState !== null && newCount > 0
    ? (state.eventLog ?? [])
        .slice(0, newCount)
        .reverse()
        .filter(e => ['infect', 'outbreak', 'epidemic'].includes(e.type))
    : [];

  // ── No animation: apply immediately ───────────────────────────────────────
  if (!animEvents.length) {
    currentState   = state;
    render();
    prevGameState   = state;
    prevEventLogLen = newLogLen;
    _processQueue();
    return;
  }

  // ── Animated path ─────────────────────────────────────────────────────────
  isAnimating = true;

  // Start the board from the state BEFORE these new events so cubes appear one-by-one.
  const workingCubes = JSON.parse(JSON.stringify(prevGameState.diseaseCubes || {}));

  // Show the board at its pre-infect state immediately (so it doesn't jump)
  currentState = { ...state, diseaseCubes: JSON.parse(JSON.stringify(workingCubes)) };
  render();

  animator.animate(
    animEvents,

    // onCubePlace — called after each card exits; update the progressive board.
    (ev) => {
      if (ev.type === 'infect') {
        const { cityId, color, count = 1 } = ev;
        if (!workingCubes[cityId]) {
          workingCubes[cityId] = { blue: 0, yellow: 0, black: 0, red: 0 };
        }
        workingCubes[cityId][color] = Math.min(3,
          (workingCubes[cityId][color] || 0) + count
        );
        // Re-render board with the newly-placed cube(s)
        currentState = { ...state, diseaseCubes: JSON.parse(JSON.stringify(workingCubes)) };
        render();
      }
      // outbreak / epidemic: no extra cube change — cascades are individual infect events
    },

    // onDone — reveal the canonical final state
    () => {
      currentState   = state;
      render();
      prevGameState   = state;
      prevEventLogLen = newLogLen;
      isAnimating     = false;
      _processQueue();
    }
  );
}

// ── Socket.IO ─────────────────────────────────────────────────────────────────

const socket = io();

socket.on('connect', () => {
  if (roomCode && myName) {
    socket.emit('lobby:join', { code: roomCode, name: myName }, res => {
      if (res?.error) showToast(res.error, 'error');
    });
  }
});

socket.on('game:state', state => {
  stateQueue.push(state);
  _processQueue();
});

socket.on('game:over', ({ won, reason }) => showGameOver(won, reason));

// ── Input setup ───────────────────────────────────────────────────────────────

const popup = document.getElementById('action-popup');
inputHandler = new InputHandler(canvas, popup, dispatchAction);

// ── Action dispatch ───────────────────────────────────────────────────────────

function dispatchAction(type, params) {
  socket.emit('game:action', { type, ...params }, res => {
    if (res?.error) showToast(res.error, 'error');
  });
}

// End Turn button
document.getElementById('btn-end-turn')?.addEventListener('click', () => {
  socket.emit('game:end-turn', res => {
    if (res?.error) showToast(res.error, 'error');
  });
});

// ── Player deck click: draw 2 cards ───────────────────────────────────────────

deckPlayerEl?.addEventListener('click', () => {
  if (!deckPlayerEl.classList.contains('deck-widget-active')) return;

  // Fly 2 card backs to the hand panel before the state arrives
  const handPanel = document.getElementById('card-hand');
  flyCards(deckPlayerEl, handPanel, 2);

  socket.emit('game:draw-cards', res => {
    if (res?.error) showToast(res.error, 'error');
  });
});

// ── Infection deck click: run infect phase ────────────────────────────────────

deckInfectionEl?.addEventListener('click', () => {
  if (!deckInfectionEl.classList.contains('deck-widget-active')) return;

  socket.emit('game:run-infect', res => {
    if (res?.error) showToast(res.error, 'error');
  });
});

// ── Discard overlay (hand-limit enforcement) ──────────────────────────────────

const COLOR_HEX = { blue: '#4a90d9', yellow: '#e8c34a', black: '#9090a0', red: '#d94a4a' };
let discardOverlay = null;

function updateDiscardOverlay(state, myIdx) {
  const isMyTurn    = myIdx !== null && myIdx === state.currentPlayerIndex;
  const needDiscard = state.phase === 'playing' && state.turnPhase === 'discard' && isMyTurn;

  if (!needDiscard) {
    if (discardOverlay) { discardOverlay.remove(); discardOverlay = null; }
    return;
  }

  const me     = state.players[myIdx];
  const overBy = me.hand.length - 7;

  if (overBy <= 0) {
    if (discardOverlay) { discardOverlay.remove(); discardOverlay = null; }
    return;
  }

  // Create overlay element once
  if (!discardOverlay) {
    discardOverlay = document.createElement('div');
    discardOverlay.id = 'discard-overlay';
    document.body.appendChild(discardOverlay);
  }

  discardOverlay.innerHTML = `
    <div class="discard-box">
      <div class="discard-title">Hand Limit Reached</div>
      <div class="discard-subtitle">
        You have <strong>${me.hand.length}</strong> cards — discard
        <strong>${overBy}</strong> card${overBy !== 1 ? 's' : ''} to continue.
      </div>
      <div class="discard-cards" id="discard-card-list"></div>
    </div>
  `;

  const list = discardOverlay.querySelector('#discard-card-list');

  me.hand.forEach(card => {
    if (card.type === 'epidemic') return;
    const btn = document.createElement('button');
    btn.className = 'discard-card-btn';
    btn.style.borderLeftColor = COLOR_HEX[card.color] || '#888';
    btn.innerHTML = `
      <span class="discard-card-name">${escHtml(card.name || card.cityId)}</span>
      <span class="discard-card-color" style="color:${COLOR_HEX[card.color] || '#888'}">${card.color}</span>
    `;
    btn.addEventListener('click', () => {
      socket.emit('game:discard-card', { cardCityId: card.cityId }, res => {
        if (res?.error) showToast(res.error, 'error');
      });
    });
    list.appendChild(btn);
  });
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Toast notifications ───────────────────────────────────────────────────────

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = `toast toast-${type}`;
  toast.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ── Game-over banner ──────────────────────────────────────────────────────────

function showGameOver(won, reason) {
  const existing = document.getElementById('game-over-banner');
  if (existing) existing.remove();

  if (discardOverlay) { discardOverlay.remove(); discardOverlay = null; }

  const REASONS = {
    outbreaks: '8 outbreaks reached.',
    cubes:     'Disease cubes exhausted.',
    cards:     'Player deck ran out.',
  };

  const overlay = document.createElement('div');
  overlay.id = 'game-over-banner';
  overlay.innerHTML = `
    <div class="game-over-box">
      <div class="game-over-title ${won ? 'won' : 'lost'}">
        ${won ? '🎉 Humanity Saved!' : '💀 Pandemic Wins'}
      </div>
      <div class="game-over-sub">
        ${won ? 'All four diseases cured.' : (REASONS[reason] || reason || '')}
      </div>
      <button class="btn btn-secondary" id="btn-back-lobby">Back to Lobby</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('btn-back-lobby').addEventListener('click', () => {
    window.location.href = '/';
  });
}

// ── Game client entry point ───────────────────────────────────────────────────

import { drawBoard, resizeCanvas } from './renderer/board.js';
import { drawPawns }               from './renderer/pawns.js';
import { initHud, renderHud, renderEventLog } from './renderer/hud.js';
import { InputHandler } from './input.js';

// ── URL params ────────────────────────────────────────────────────────────────

const params   = new URLSearchParams(window.location.search);
const roomCode = (params.get('room') || '').toUpperCase();
const myName   = params.get('name') || '';

if (!roomCode) window.location.href = '/';

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas = document.getElementById('board-canvas');

let currentState     = null;
let myPlayerIndex    = null;
let inputHandler     = null;

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
  currentState = state;

  // Resolve which player we are (by name)
  if (myPlayerIndex === null && state.players?.length) {
    myPlayerIndex = state.players.findIndex(p => p.name === myName);
    if (myPlayerIndex === -1) myPlayerIndex = null;
  }

  render();
  renderHud(state, myPlayerIndex);
  if (state.eventLog) renderEventLog(state.eventLog);

  if (inputHandler) inputHandler.update(state, myPlayerIndex);

  // Show / hide discard overlay
  updateDiscardOverlay(state, myPlayerIndex);
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
    if (card.type === 'epidemic') return; // epidemic cards stay (shouldn't happen mid-game)
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

  // Remove discard overlay if showing
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

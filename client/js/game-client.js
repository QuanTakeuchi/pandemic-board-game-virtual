// ── Game client entry point ───────────────────────────────────────────────────
// Connects to Socket.IO, handles game:state broadcasts, drives all rendering.
// During Phase 2 the board renders immediately with no game state.

import { drawBoard, resizeCanvas } from './renderer/board.js';
import { initHud, renderHud, renderEventLog } from './renderer/hud.js';

// ── Parse URL params ──────────────────────────────────────────────────────────
const params   = new URLSearchParams(window.location.search);
const roomCode = (params.get('room') || '').toUpperCase();
const myName   = params.get('name') || '';

// Redirect to lobby if accessed directly without a room code
if (!roomCode) {
  window.location.href = '/';
}

// ── Canvas setup ──────────────────────────────────────────────────────────────
const canvas = document.getElementById('board-canvas');

function render(state = null) {
  resizeCanvas(canvas);
  drawBoard(canvas, state);
}

// Initial render (no game state yet — Phase 2 preview)
render();

// Re-render on window resize
window.addEventListener('resize', () => render(currentState));

// ── HUD init ──────────────────────────────────────────────────────────────────
initHud(roomCode);

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const socket = io();
let currentState = null;

socket.on('connect', () => {
  // Rejoin the room on reconnect
  if (roomCode && myName) {
    socket.emit('lobby:join', { code: roomCode, name: myName }, (res) => {
      if (res && res.error) {
        console.warn('Could not rejoin room:', res.error);
      }
    });
  }
});

// Full state broadcast — re-render everything
socket.on('game:state', (state) => {
  currentState = state;
  render(state);
  renderHud(state);
  if (state.eventLog) renderEventLog(state.eventLog);
});

// Game over
socket.on('game:over', ({ won, reason }) => {
  showGameOverBanner(won, reason);
});

// ── Game over banner ──────────────────────────────────────────────────────────
function showGameOverBanner(won, reason) {
  const existing = document.getElementById('game-over-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'game-over-banner';
  Object.assign(banner.style, {
    position:   'fixed',
    inset:      '0',
    display:    'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.82)',
    zIndex:     '100',
    gap:        '16px',
  });

  const title = document.createElement('div');
  title.textContent = won ? 'You saved humanity!' : 'The pandemic won.';
  Object.assign(title.style, {
    fontSize:   '2.4rem',
    fontWeight: '700',
    color:      won ? '#4caf50' : '#d94a4a',
  });

  const sub = document.createElement('div');
  const reasonMap = {
    outbreaks: 'Too many outbreaks (8).',
    cubes:     'Ran out of disease cubes.',
    cards:     'Player deck exhausted.',
  };
  sub.textContent = won ? 'All four diseases cured.' : (reasonMap[reason] || reason);
  Object.assign(sub.style, { fontSize: '1.1rem', color: '#e8e8e8' });

  const btn = document.createElement('button');
  btn.textContent = 'Back to Lobby';
  btn.className   = 'btn btn-secondary';
  btn.addEventListener('click', () => { window.location.href = '/'; });

  banner.appendChild(title);
  banner.appendChild(sub);
  banner.appendChild(btn);
  document.body.appendChild(banner);
}

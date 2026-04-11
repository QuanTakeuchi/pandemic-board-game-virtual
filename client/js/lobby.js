// ── Lobby client ──────────────────────────────────────────────────────────────
// Handles: Create / Join tabs, waiting room UI, player list, start button.
// When the server emits lobby:game-starting the client navigates to game.html.

const socket = io();

// ── State ─────────────────────────────────────────────────────────────────────
let myId        = null;   // our socket id
let myName      = null;   // chosen display name
let currentCode = null;   // room code once in a room
let isHost      = false;  // whether we are the room host

// ── DOM refs ──────────────────────────────────────────────────────────────────
const entryScreen   = document.getElementById('entry-screen');
const waitingRoom   = document.getElementById('waiting-room');

const tabCreate     = document.getElementById('tab-create');
const tabJoin       = document.getElementById('tab-join');
const panelCreate   = document.getElementById('panel-create');
const panelJoin     = document.getElementById('panel-join');

const createNameEl  = document.getElementById('create-name');
const createErrorEl = document.getElementById('create-error');
const btnCreate     = document.getElementById('btn-create');

const joinCodeEl    = document.getElementById('join-code');
const joinNameEl    = document.getElementById('join-name');
const joinErrorEl   = document.getElementById('join-error');
const btnJoin       = document.getElementById('btn-join');

const roomCodeBadge = document.getElementById('room-code-badge');
const copyHint      = document.getElementById('copy-hint');
const playerList    = document.getElementById('player-list');
const playerCount   = document.getElementById('player-count');
const btnStart      = document.getElementById('btn-start');
const startHint     = document.getElementById('start-hint');

// ── Tab switching ─────────────────────────────────────────────────────────────
tabCreate.addEventListener('click', () => {
  tabCreate.classList.add('active');
  tabCreate.setAttribute('aria-selected', 'true');
  tabJoin.classList.remove('active');
  tabJoin.setAttribute('aria-selected', 'false');
  panelCreate.classList.remove('hidden');
  panelJoin.classList.add('hidden');
  createErrorEl.textContent = '';
});

tabJoin.addEventListener('click', () => {
  tabJoin.classList.add('active');
  tabJoin.setAttribute('aria-selected', 'true');
  tabCreate.classList.remove('active');
  tabCreate.setAttribute('aria-selected', 'false');
  panelJoin.classList.remove('hidden');
  panelCreate.classList.add('hidden');
  joinErrorEl.textContent = '';
});

// ── Create game ───────────────────────────────────────────────────────────────
btnCreate.addEventListener('click', createGame);
createNameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') createGame(); });

function createGame() {
  const name = createNameEl.value.trim();
  if (!name) { createErrorEl.textContent = 'Enter your name first.'; return; }

  setLoading(btnCreate, true);
  createErrorEl.textContent = '';

  socket.emit('lobby:create', name, (res) => {
    setLoading(btnCreate, false);
    if (res.error) {
      createErrorEl.textContent = res.error;
    } else {
      myName = name;
      currentCode = res.code;
      showWaitingRoom(res.code);
    }
  });
}

// ── Join game ─────────────────────────────────────────────────────────────────
btnJoin.addEventListener('click', joinGame);
joinNameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });
joinCodeEl.addEventListener('input', () => {
  joinCodeEl.value = joinCodeEl.value.toUpperCase().replace(/[^A-Z]/g, '');
});

function joinGame() {
  const code = joinCodeEl.value.trim().toUpperCase();
  const name = joinNameEl.value.trim();
  if (!code) { joinErrorEl.textContent = 'Enter the room code.'; return; }
  if (!name) { joinErrorEl.textContent = 'Enter your name.'; return; }

  setLoading(btnJoin, true);
  joinErrorEl.textContent = '';

  socket.emit('lobby:join', { code, name }, (res) => {
    setLoading(btnJoin, false);
    if (res.error) {
      joinErrorEl.textContent = res.error;
    } else {
      myName = name;
      currentCode = res.code;
      showWaitingRoom(res.code);
    }
  });
}

// ── Waiting room ──────────────────────────────────────────────────────────────
function showWaitingRoom(code) {
  entryScreen.classList.add('hidden');
  waitingRoom.classList.remove('hidden');
  roomCodeBadge.textContent = code;
}

// Copy room code to clipboard
roomCodeBadge.addEventListener('click', copyCode);
roomCodeBadge.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') copyCode(); });

function copyCode() {
  const code = roomCodeBadge.textContent;
  navigator.clipboard.writeText(code).then(() => {
    copyHint.textContent = 'Copied!';
    setTimeout(() => { copyHint.textContent = 'Click to copy'; }, 2000);
  }).catch(() => {
    copyHint.textContent = 'Copy: ' + code;
  });
}

// ── Lobby state updates ───────────────────────────────────────────────────────
socket.on('lobby:state', (state) => {
  // Capture our socket id on first update
  if (!myId) myId = socket.id;

  isHost = (state.hostId === socket.id);
  renderPlayerList(state.players, state.hostId);
  renderStartControls(state.players);
});

function renderPlayerList(players, hostId) {
  const connected = players.filter(p => p.isConnected);
  playerCount.textContent = `${connected.length} / 4`;

  playerList.innerHTML = '';

  // Connected players
  players.forEach(p => {
    const li = document.createElement('li');
    li.className = 'player-item';
    li.innerHTML = `
      <span class="dot ${p.isConnected ? 'connected' : 'disconnected'}"></span>
      <span class="player-name">${escapeHtml(p.name)}</span>
      ${p.id === hostId    ? '<span class="host-badge">Host</span>' : ''}
      ${p.id === socket.id ? '<span class="you-badge">(you)</span>' : ''}
    `;
    playerList.appendChild(li);
  });

  // Empty slots
  const emptySlots = 4 - players.length;
  for (let i = 0; i < emptySlots; i++) {
    const li = document.createElement('li');
    li.className = 'player-item empty';
    li.innerHTML = `
      <span class="dot disconnected"></span>
      <span class="player-name">Waiting for player…</span>
    `;
    playerList.appendChild(li);
  }
}

function renderStartControls(players) {
  const connected = players.filter(p => p.isConnected).length;

  if (isHost) {
    btnStart.classList.remove('hidden');
    btnStart.disabled = connected < 2;
    startHint.textContent = connected < 2
      ? 'Need at least 2 players to start.'
      : 'Ready to start!';
  } else {
    btnStart.classList.add('hidden');
    startHint.textContent = 'Waiting for the host to start the game…';
  }
}

// ── Start button ──────────────────────────────────────────────────────────────
btnStart.addEventListener('click', () => {
  setLoading(btnStart, true);
  socket.emit('lobby:start', (res) => {
    setLoading(btnStart, false);
    if (res && res.error) {
      startHint.textContent = res.error;
    }
  });
});

// ── Game starting — navigate to game page ─────────────────────────────────────
socket.on('lobby:game-starting', ({ code }) => {
  window.location.href = `/game.html?room=${code}&name=${encodeURIComponent(myName)}`;
});

// ── Connection status ─────────────────────────────────────────────────────────
socket.on('disconnect', () => {
  // If we're still on the entry screen just reconnect silently.
  // If we're in the waiting room, show a notice.
  if (!currentCode) return;
  startHint.textContent = 'Connection lost. Trying to reconnect…';
});

socket.on('connect', () => {
  // On reconnect after being in a room, attempt to rejoin
  if (currentCode && myName) {
    socket.emit('lobby:join', { code: currentCode, name: myName }, (res) => {
      if (res.error) startHint.textContent = 'Could not rejoin: ' + res.error;
    });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.textContent = loading ? 'Connecting…' : btn.dataset.label || btn.textContent;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

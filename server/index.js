const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { LobbyManager } = require('./lobby');
const { GameManager }  = require('./game/GameManager');

const PORT = process.env.PORT || 3000;
const ACCESS_SECRET = process.env.ACCESS_SECRET || '';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// ── Access gate ────────────────────────────────────────────────────────────────
// When ACCESS_SECRET env var is set, every HTTP request must carry a matching
// cookie. The first visit uses ?secret=<value> to set that cookie.

function getAccessCookie(req) {
  const header = req.headers.cookie || '';
  const pair = header.split(';').map(s => s.trim()).find(s => s.startsWith('access_token='));
  return pair ? pair.slice('access_token='.length) : null;
}

app.use((req, res, next) => {
  if (!ACCESS_SECRET) return next();
  if (getAccessCookie(req) === ACCESS_SECRET) return next();

  const provided = req.query.secret;
  if (provided === ACCESS_SECRET) {
    // Stash the token in an HttpOnly cookie and strip the secret from the URL
    res.setHeader('Set-Cookie', `access_token=${ACCESS_SECRET}; HttpOnly; SameSite=Strict; Path=/`);
    const clean = req.path + (Object.keys(req.query).filter(k => k !== 'secret').length
      ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(req.query).filter(([k]) => k !== 'secret')))
      : '');
    return res.redirect(clean);
  }

  res.status(401).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Pandemic — Access Required</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#1a1a2e}
.box{background:#16213e;color:#eee;padding:2rem 2.5rem;border-radius:12px;text-align:center}
h2{margin-top:0}input{padding:.5rem .75rem;font-size:1rem;border-radius:6px;border:1px solid #444;background:#0f3460;color:#eee;margin-right:.5rem}
button{padding:.5rem 1.25rem;font-size:1rem;border-radius:6px;border:none;background:#e94560;color:#fff;cursor:pointer}</style>
</head><body><div class="box"><h2>🦠 Pandemic</h2><p>Enter the access secret to join your game.</p>
<form method="get" action="/"><input name="secret" type="password" placeholder="Access secret" required autofocus>
<button type="submit">Enter</button></form></div></body></html>`);
});

// Gate Socket.IO connections with the same cookie
io.use((socket, next) => {
  if (!ACCESS_SECRET) return next();
  if (getAccessCookie(socket.request) === ACCESS_SECRET) return next();
  next(new Error('Unauthorized'));
});

// Serve static client files
app.use(express.static(path.join(__dirname, '../client')));

// Fallback: any unknown route serves index.html (lobby)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ── Socket.IO ──────────────────────────────────────────────────────────────────

const gameManager  = new GameManager(io);
const lobbyManager = new LobbyManager(io, gameManager);

io.on('connection', (socket) => {
  console.log(`[connect]    ${socket.id}`);
  lobbyManager.registerHandlers(socket);
  gameManager.registerHandlers(socket, lobbyManager);

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
  });
});

// ── Start ──────────────────────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nPandemic server running at http://localhost:${PORT}`);
  console.log(`LAN players: http://<your-ip>:${PORT}\n`);
});

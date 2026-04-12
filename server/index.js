const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { LobbyManager } = require('./lobby');
const { GameManager }  = require('./game/GameManager');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
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

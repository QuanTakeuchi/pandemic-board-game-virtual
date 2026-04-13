# Pandemic — Virtual Board Game

A self-hosted, real-time multiplayer implementation of the Pandemic board game.
2–4 players, all 7 roles, full epidemic and outbreak rules.

---

## Quickstart (Docker — recommended)

**Requirements:** Docker + Docker Compose installed on the host machine.

```bash
# 1. Clone the repo
git clone https://github.com/QuanTakeuchi/pandemic-board-game-virtual.git
cd pandemic-board-game-virtual

# 2. Start the server (builds image on first run, ~30 seconds)
docker compose up -d

# 3. Open the game
#    Local:  http://localhost:3000
#    LAN:    http://<your-ip>:3000
```

To expose on a different port (e.g. 80):

```bash
PORT=80 docker compose up -d
```

To stop:

```bash
docker compose down
```

---

## Quickstart (Node.js — no Docker)

**Requirements:** Node.js 18 or newer.

```bash
git clone https://github.com/QuanTakeuchi/pandemic-board-game-virtual.git
cd pandemic-board-game-virtual
npm install
npm start
```

For live-reload during development:

```bash
npm run dev
```

The server listens on `http://localhost:3000` by default.
Set the `PORT` environment variable to change it:

```bash
PORT=8080 npm start
```

---

## How to play

1. **Host** opens `http://<server-ip>:3000`, clicks **Create Room**, and shares the 4-letter room code with friends.
2. **Players** open the same URL, click **Join Room**, and enter the code + a display name.
3. Once 2–4 players have joined, the host clicks **Start Game**.
4. Each player is dealt a random role and a starting hand of city cards.

### Turn structure

| Phase | What happens |
|-------|-------------|
| **Actions** | Take up to 4 actions: move, build stations, treat disease, share cards, discover cures. Click a city on the board to see available actions. |
| **Draw** | Automatically draw 2 player cards. An Epidemic card triggers immediately. |
| **Discard** | If your hand exceeds 7 cards, a discard overlay appears — choose cards to remove. |
| **Infect** | Automatically draw infection-rate cards and place cubes. Outbreaks cascade to adjacent cities. |

Click **End Turn Early** to skip remaining actions.

### Win condition

Discover cures for all 4 diseases (blue, yellow, black, red).

### Lose conditions

- 8 outbreaks occur
- Any disease color runs out of cubes
- The player draw pile is exhausted

---

## Roles

| Role | Special ability |
|------|----------------|
| **Medic** | Removes all cubes of one color when treating. Auto-cleans cured diseases on entry. |
| **Scientist** | Only 4 cards needed to discover a cure (instead of 5). |
| **Researcher** | Can give any city card from hand, not just the current city card. |
| **Operations Expert** | Builds research stations without discarding a card. Once per turn: fly from any station by discarding any city card. |
| **Dispatcher** | Can move any pawn to a city occupied by another pawn. |
| **Quarantine Specialist** | Prevents all cube placement in their current city and all adjacent cities. |
| **Contingency Planner** | Can retrieve event cards from the player discard pile. *(UI stub — full event-card support planned)* |

---

## Architecture

```
pandemic-board-game-virtual/
├── server/
│   ├── index.js              Express + Socket.IO bootstrap
│   ├── lobby.js              LobbyManager (room create/join/reconnect)
│   ├── game/
│   │   ├── GameManager.js    Socket handler registration
│   │   ├── GameInstance.js   Per-room game state + phase automation
│   │   ├── engine/
│   │   │   ├── actions.js    10 pure action functions (all role abilities)
│   │   │   ├── turn.js       Draw / infect / outbreak cascade / advance
│   │   │   └── deck.js       Fisher-Yates shuffle + epidemic insertion
│   │   └── data/
│   │       ├── cities.js     48 cities with coordinates + connections
│   │       ├── player-cards.js
│   │       ├── infection-cards.js
│   │       └── roles.js      7 roles with descriptions
└── client/
    ├── index.html / lobby.js  Lobby UI
    ├── game.html              Game page shell
    ├── css/
    │   ├── base.css
    │   └── game.css
    └── js/
        ├── game-client.js     Socket handling + discard overlay
        ├── input.js           Canvas hit-test + role-aware action popup
        └── renderer/
            ├── board.js       Canvas board, connections, cubes, QS aura
            ├── pawns.js       Player pawns with active-turn highlight
            └── hud.js         Sidebar, turn banner, card hand, event log
```

**State model:** server-authoritative. Clients send action intents; the server validates, mutates state, and broadcasts a full public snapshot to every client in the room. Draw piles are stripped to counts before broadcast so players can't see hidden cards.

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | TCP port the server listens on |
| `NODE_ENV` | `development` | Set to `production` in Docker |

---

## Development

```bash
npm run dev        # starts server with --watch (auto-restart on file change)
```

The `.claude/launch.json` file configures dev-server detection for Claude Code.

---

## Roadmap

- [ ] Event cards (Airlift, Government Grant, Forecast, …)
- [ ] Contingency Planner full event-card retrieval
- [ ] Mobile-responsive layout
- [ ] Sound effects
- [ ] Game replay / spectator mode

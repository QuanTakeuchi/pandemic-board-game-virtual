import { CITIES } from '../data/cities.js';

// Pawn colors match server/game/data/roles.js
const ROLE_COLORS = {
  'medic':                  '#f0a500',
  'scientist':              '#e0e0e0',
  'researcher':             '#c47a3a',
  'operations-expert':      '#3cb371',
  'dispatcher':             '#cc44cc',
  'quarantine-specialist':  '#2e8b57',
  'contingency-planner':    '#4a9ed9',
};

const ROLE_LABELS = {
  'medic':                  'M',
  'scientist':              'Sc',
  'researcher':             'Re',
  'operations-expert':      'Op',
  'dispatcher':             'Di',
  'quarantine-specialist':  'Qs',
  'contingency-planner':    'Cp',
};

const PAWN_RADIUS = 7;
const PAWN_Y_OFFSET = 18; // above city center

/**
 * Draw all player pawns on top of the already-rendered board.
 * Called from game-client.js after drawBoard().
 */
export function drawPawns(canvas, gameState) {
  if (!gameState?.players) return;

  const ctx = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;

  const currentPlayerId = gameState.players[gameState.currentPlayerIndex]?.id;

  // Group players by city so we can spread them out
  const byCityId = {};
  gameState.players.forEach(p => {
    if (!p.isConnected) return;
    (byCityId[p.location] ??= []).push(p);
  });

  for (const [cityId, players] of Object.entries(byCityId)) {
    const city = CITIES[cityId];
    if (!city) continue;

    const cx      = city.x * W;
    const cy      = city.y * H;
    const total   = players.length;
    const spread  = (total - 1) * (PAWN_RADIUS * 2 + 2);
    const startX  = cx - spread / 2;

    players.forEach((player, i) => {
      const px    = startX + i * (PAWN_RADIUS * 2 + 2);
      const py    = cy - PAWN_Y_OFFSET;
      const color = ROLE_COLORS[player.role] || '#ffffff';
      const label = ROLE_LABELS[player.role] || player.name[0].toUpperCase();

      const isCurrentPlayer = player.id === currentPlayerId;

      // Active-player glow ring
      if (isCurrentPlayer) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, PAWN_RADIUS + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth   = 2;
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur  = 8;
        ctx.stroke();
        ctx.restore();
      }

      // Drop shadow
      ctx.save();
      ctx.shadowColor   = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur    = 6;
      ctx.shadowOffsetY = 2;

      // Pawn circle
      ctx.beginPath();
      ctx.arc(px, py, PAWN_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();

      // Border
      ctx.beginPath();
      ctx.arc(px, py, PAWN_RADIUS, 0, Math.PI * 2);
      ctx.strokeStyle = isCurrentPlayer ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.7)';
      ctx.lineWidth   = isCurrentPlayer ? 2 : 1.5;
      ctx.stroke();

      // Role initial
      ctx.font         = `bold ${label.length > 1 ? 6 : 7}px "Segoe UI", sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = '#000000';
      ctx.fillText(label, px, py);
    });
  }
}

export { ROLE_COLORS };

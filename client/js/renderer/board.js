import { CITIES } from '../data/cities.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const COLOR_MAP = {
  blue:   '#4a90d9',
  yellow: '#e8c34a',
  black:  '#9090a0',
  red:    '#d94a4a',
};

const CITY_RADIUS   = 7;
const LABEL_OFFSET  = 12;   // px below city center
const CONN_ALPHA    = 0.35; // normal connection opacity
const TRANS_ALPHA   = 0.55; // transpacific indicator opacity

// ── Main draw entry point ─────────────────────────────────────────────────────

/**
 * Draws the full board: connections, city nodes, labels.
 * Call this whenever the canvas size changes or game state updates.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object|null} gameState  — null during Phase 2 (no game state yet)
 */
export function drawBoard(canvas, gameState = null) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, W, H);
  drawConnections(ctx, W, H);
  drawCities(ctx, W, H, gameState);
  if (gameState) drawDiseaseCubes(ctx, W, H, gameState);
}

// ── Background ────────────────────────────────────────────────────────────────

function drawBackground(ctx, W, H) {
  // Deep ocean gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,   '#0a1628');
  grad.addColorStop(1,   '#0d1e35');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  const gridSpacing = Math.round(W / 20);
  for (let x = 0; x < W; x += gridSpacing) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += gridSpacing) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
}

// ── Connections ───────────────────────────────────────────────────────────────

function drawConnections(ctx, W, H) {
  const drawn = new Set();

  for (const city of Object.values(CITIES)) {
    for (const neighborId of city.connections) {
      const key = [city.id, neighborId].sort().join('|');
      if (drawn.has(key)) continue;
      drawn.add(key);

      const neighbor = CITIES[neighborId];
      const isTranspacific = city.transpacific?.includes(neighborId)
                          || neighbor.transpacific?.includes(city.id);

      if (isTranspacific) {
        drawTranspacificIndicator(ctx, city, neighbor, W, H);
      } else {
        drawStraightConnection(ctx, city, neighbor, W, H);
      }
    }
  }
}

function drawStraightConnection(ctx, a, b, W, H) {
  ctx.save();
  ctx.globalAlpha = CONN_ALPHA;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(a.x * W, a.y * H);
  ctx.lineTo(b.x * W, b.y * H);
  ctx.stroke();
  ctx.restore();
}

// Transpacific connections: draw a short stub from each city pointing off-screen
// with a small arrow, rather than a line crossing the entire board.
function drawTranspacificIndicator(ctx, a, b, W, H) {
  ctx.save();
  ctx.globalAlpha = TRANS_ALPHA;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 5]);

  // City A stub (pointing toward right edge if a is on the left, left edge otherwise)
  const aIsLeft = a.x < b.x;
  const stubLen = W * 0.04;

  // From city A toward the edge
  const axPx = a.x * W;
  const ayPx = a.y * H;
  const bxPx = b.x * W;
  const byPx = b.y * H;

  if (aIsLeft) {
    // A is on left (e.g. San Francisco) — stub goes right
    ctx.beginPath();
    ctx.moveTo(axPx, ayPx);
    ctx.lineTo(axPx - stubLen, ayPx);
    ctx.stroke();
    // B stub goes right off-screen right
    ctx.beginPath();
    ctx.moveTo(bxPx, byPx);
    ctx.lineTo(bxPx + stubLen, byPx);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(axPx, ayPx);
    ctx.lineTo(axPx + stubLen, ayPx);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bxPx, byPx);
    ctx.lineTo(bxPx - stubLen, byPx);
    ctx.stroke();
  }

  ctx.restore();
}

// ── Cities ────────────────────────────────────────────────────────────────────

function drawCities(ctx, W, H, gameState) {
  for (const city of Object.values(CITIES)) {
    const cx = city.x * W;
    const cy = city.y * H;
    const color = COLOR_MAP[city.color];

    // Glow effect
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, CITY_RADIUS * 3);
    glow.addColorStop(0,   hexToRgba(color, 0.3));
    glow.addColorStop(1,   hexToRgba(color, 0));
    ctx.beginPath();
    ctx.arc(cx, cy, CITY_RADIUS * 3, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // City circle — fill
    ctx.beginPath();
    ctx.arc(cx, cy, CITY_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // City circle — border
    ctx.beginPath();
    ctx.arc(cx, cy, CITY_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Research station indicator (Atlanta starts with one)
    if (gameState) {
      const stations = gameState.researchStations || [];
      if (stations.includes(city.id)) {
        drawResearchStation(ctx, cx, cy);
      }
    } else if (city.id === 'atlanta') {
      // Phase 2: always show Atlanta station as a preview
      drawResearchStation(ctx, cx, cy);
    }

    // City name label
    drawCityLabel(ctx, city.name, cx, cy, color);
  }
}

function drawResearchStation(ctx, cx, cy) {
  const s = 9;
  ctx.save();
  ctx.translate(cx, cy - CITY_RADIUS - s - 2);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle   = 'rgba(255,255,255,0.15)';
  ctx.lineWidth   = 1.5;
  // Pentagon-ish station icon (simple square with notch)
  ctx.beginPath();
  ctx.moveTo(0,  -s);
  ctx.lineTo(s,  -2);
  ctx.lineTo(s/1.4, s);
  ctx.lineTo(-s/1.4, s);
  ctx.lineTo(-s, -2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawCityLabel(ctx, name, cx, cy, color) {
  const y = cy + CITY_RADIUS + LABEL_OFFSET;

  // Shadow for legibility
  ctx.font = 'bold 9px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth   = 3;
  ctx.lineJoin    = 'round';
  ctx.strokeText(name, cx, y);

  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, cx, y);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Disease cubes ─────────────────────────────────────────────────────────────
// Cubes are drawn as small squares around the city node in a 4-quadrant layout:
//   top-right = blue, bottom-right = yellow, bottom-left = black, top-left = red

const CUBE_POSITIONS = {
  blue:   { dx:  1, dy: -1 },
  yellow: { dx:  1, dy:  1 },
  black:  { dx: -1, dy:  1 },
  red:    { dx: -1, dy: -1 },
};

function drawDiseaseCubes(ctx, W, H, gameState) {
  const cubeMap = gameState.diseaseCubes || {};
  const OFFSET  = CITY_RADIUS + 5;   // distance from city center
  const CUBE_S  = 7;                  // cube square size in px

  for (const [cityId, cubes] of Object.entries(cubeMap)) {
    const city = CITIES[cityId];
    if (!city) continue;

    const cx = city.x * W;
    const cy = city.y * H;

    for (const [color, count] of Object.entries(cubes)) {
      if (!count || count <= 0) continue;

      const pos    = CUBE_POSITIONS[color];
      const cubeCx = cx + pos.dx * OFFSET;
      const cubeCy = cy + pos.dy * OFFSET;

      // Cube fill
      ctx.fillStyle = COLOR_MAP[color];
      ctx.fillRect(cubeCx - CUBE_S / 2, cubeCy - CUBE_S / 2, CUBE_S, CUBE_S);

      // Cube border
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth   = 1;
      ctx.strokeRect(cubeCx - CUBE_S / 2, cubeCy - CUBE_S / 2, CUBE_S, CUBE_S);

      // Count label (only when > 1)
      if (count > 1) {
        ctx.font         = 'bold 8px "Segoe UI", sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = count >= 3 ? '#ff4444' : '#ffffff';
        ctx.fillText(String(count), cubeCx, cubeCy);
      }
    }
  }
}

// ── Resize handler ────────────────────────────────────────────────────────────

/**
 * Fits the canvas to its container's pixel dimensions.
 * Returns true if the size actually changed (caller should redraw).
 */
export function resizeCanvas(canvas) {
  const parent = canvas.parentElement;
  const W = parent.clientWidth;
  const H = parent.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  const cssW = W;
  const cssH = H;
  const pxW  = Math.round(W * dpr);
  const pxH  = Math.round(H * dpr);

  if (canvas.width === pxW && canvas.height === pxH) return false;

  canvas.width  = pxW;
  canvas.height = pxH;
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  return true;
}

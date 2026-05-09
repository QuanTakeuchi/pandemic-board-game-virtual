import { CITIES } from '../data/cities.js';

// ── Continent outlines in game-coordinate space (x,y each 0–1) ───────────────
//
// Polygons are defined directly in the board's normalised coordinate system so
// they align with city positions regardless of canvas size.  Each sub-array is
// one closed polygon [x, y] (no need to repeat the first point).
//
// Calibration sources (real city positions → game coords):
//   SF (-122°,38°) → (0.06,0.30)   Tokyo (140°,36°) → (0.95,0.26)
//   London (0°,52°) → (0.41,0.15)  Lagos (3°,7°)   → (0.46,0.56)
//   Cairo (31°,30°) → (0.57,0.35)  Sydney(151°,-34°)→ (0.93,0.74)

const CONTINENT_POLYS = [
  // ── North America ──────────────────────────────────────────────────────────
  [[0.01,0.28],[0.02,0.13],[0.06,0.04],[0.16,0.04],[0.20,0.07],
   [0.24,0.13],[0.30,0.20],[0.30,0.26],[0.24,0.34],[0.22,0.44],
   [0.17,0.48],[0.12,0.49],[0.07,0.48],[0.04,0.43],[0.04,0.35]],

  // ── South America ──────────────────────────────────────────────────────────
  [[0.13,0.53],[0.22,0.52],[0.32,0.61],[0.31,0.73],[0.27,0.88],
   [0.17,0.89],[0.11,0.80],[0.10,0.66],[0.12,0.55]],

  // ── Greenland ──────────────────────────────────────────────────────────────
  [[0.22,0.08],[0.28,0.03],[0.35,0.01],[0.37,0.06],[0.31,0.12]],

  // ── Europe (Portugal → Scandinavia → Russia/Turkey) ───────────────────────
  [[0.37,0.28],[0.36,0.20],[0.40,0.09],[0.46,0.05],[0.56,0.03],
   [0.64,0.07],[0.65,0.16],[0.59,0.22],[0.56,0.27],[0.49,0.28],
   [0.44,0.29]],

  // ── Africa ─────────────────────────────────────────────────────────────────
  [[0.40,0.25],[0.58,0.27],[0.64,0.34],[0.68,0.47],[0.64,0.64],
   [0.57,0.83],[0.45,0.84],[0.41,0.67],[0.41,0.50],[0.42,0.36]],

  // ── Asia (Middle East → Indian sub → SE Asia mainland → Pacific rim) ──────
  [[0.54,0.24],[0.61,0.29],[0.63,0.38],[0.65,0.52],[0.71,0.52],
   [0.75,0.57],[0.84,0.67],[0.88,0.57],[0.92,0.50],[0.98,0.36],
   [0.99,0.26],[0.96,0.15],[0.90,0.12],[0.80,0.11],[0.70,0.09],
   [0.63,0.06],[0.58,0.03],[0.64,0.03],[0.66,0.10],[0.64,0.16]],

  // ── Australia ──────────────────────────────────────────────────────────────
  [[0.86,0.73],[0.88,0.65],[0.91,0.65],[0.94,0.67],[0.97,0.70],
   [0.97,0.81],[0.93,0.83],[0.89,0.82],[0.86,0.77]],

  // ── UK + Ireland ───────────────────────────────────────────────────────────
  [[0.38,0.12],[0.41,0.09],[0.43,0.12],[0.41,0.18],[0.38,0.18]],

  // ── Japan (simplified) ────────────────────────────────────────────────────
  [[0.93,0.24],[0.97,0.24],[0.97,0.37],[0.95,0.38],[0.93,0.31]],

  // ── Philippines (simplified) ──────────────────────────────────────────────
  [[0.88,0.43],[0.92,0.42],[0.93,0.50],[0.90,0.53],[0.88,0.50]],

  // ── New Zealand (simplified) ──────────────────────────────────────────────
  [[0.99,0.78],[0.99,0.85],[0.97,0.86],[0.96,0.79]],
];

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
/**
 * @param {HTMLCanvasElement} canvas
 * @param {object|null}       gameState
 * @param {{ drive?: Set, flight?: Set }} [highlights]  — cities to ring
 */
export function drawBoard(canvas, gameState = null, highlights = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, W, H);
  drawConnections(ctx, W, H);
  if (highlights.quarantine && highlights.quarantine.size) drawQuarantineAura(ctx, W, H, highlights.quarantine);
  if (highlights.drive  && highlights.drive.size)  drawHighlightRings(ctx, W, H, highlights.drive,  'rgba(255,255,255,0.55)');
  if (highlights.flight && highlights.flight.size) drawHighlightRings(ctx, W, H, highlights.flight, 'rgba(74,144,217,0.7)');
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

  // Continent outlines drawn in game-coordinate space (no image load needed)
  ctx.save();
  ctx.fillStyle   = '#1a3a60';
  ctx.strokeStyle = '#2a5590';
  ctx.lineWidth   = 1;
  ctx.lineJoin    = 'round';
  ctx.globalAlpha = 0.55;
  for (const poly of CONTINENT_POLYS) {
    ctx.beginPath();
    ctx.moveTo(poly[0][0] * W, poly[0][1] * H);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0] * W, poly[i][1] * H);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

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

// ── Quarantine Specialist aura ────────────────────────────────────────────────
// Draws a soft green fill behind each quarantined city.

function drawQuarantineAura(ctx, W, H, cityIds) {
  ctx.save();
  for (const id of cityIds) {
    const city = CITIES[id];
    if (!city) continue;
    const cx = city.x * W;
    const cy = city.y * H;
    const R  = CITY_RADIUS * 3.5;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0,   'rgba(46,139,87,0.28)');
    grad.addColorStop(1,   'rgba(46,139,87,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }
  ctx.restore();
}

// ── Highlight rings ───────────────────────────────────────────────────────────

function drawHighlightRings(ctx, W, H, cityIds, color) {
  const R = CITY_RADIUS + 5;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2.5;
  ctx.shadowColor = color;
  ctx.shadowBlur  = 8;

  for (const id of cityIds) {
    const city = CITIES[id];
    if (!city) continue;
    ctx.beginPath();
    ctx.arc(city.x * W, city.y * H, R, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// ── Disease cubes ─────────────────────────────────────────────────────────────
// Each colour occupies one quadrant around the city:
//   blue = top-right  yellow = bottom-right  black = bottom-left  red = top-left
//
// Up to 3 individual cube squares are drawn per colour — no number labels.
// Cubes are slightly larger and darker than city circles for easy reading.

const CUBE_S    = 10;   // cube side length (px) — larger than city radius (7)
const GAP       = 2;    // gap between cubes in a cluster
const STEP      = CUBE_S + GAP;

// Per-colour darker fill so cubes stand out against the board background
const CUBE_COLORS = {
  blue:   '#1a5fa8',
  yellow: '#b8860b',
  black:  '#38384a',
  red:    '#a01515',
};

// Quadrant anchor direction for each colour
const CUBE_DIR = {
  blue:   { dx:  1, dy: -1 },
  yellow: { dx:  1, dy:  1 },
  black:  { dx: -1, dy:  1 },
  red:    { dx: -1, dy: -1 },
};

// Relative [x, y] offsets (in px) for 1, 2, or 3 cubes within a cluster.
// Origin is the cluster centre.
const CUBE_LAYOUTS = {
  1: [[0,       0     ]],
  2: [[-STEP/2, 0     ], [ STEP/2,  0    ]],
  3: [[-STEP,   STEP/2], [ 0,      -STEP/2], [ STEP, STEP/2]],
};

// Distance from city centre to cube cluster centre
const CUBE_OFFSET = CITY_RADIUS + CUBE_S * 0.8;

function drawDiseaseCubes(ctx, W, H, gameState) {
  const cubeMap = gameState.diseaseCubes || {};

  for (const [cityId, cubes] of Object.entries(cubeMap)) {
    const city = CITIES[cityId];
    if (!city) continue;

    const cx = city.x * W;
    const cy = city.y * H;

    for (const [color, count] of Object.entries(cubes)) {
      if (!count || count <= 0) continue;

      const dir     = CUBE_DIR[color];
      const fill    = CUBE_COLORS[color] || COLOR_MAP[color];
      // Anchor point: push cluster centre outward from city in the quadrant dir
      const anchorX = cx + dir.dx * CUBE_OFFSET;
      const anchorY = cy + dir.dy * CUBE_OFFSET;

      const layout  = CUBE_LAYOUTS[Math.min(count, 3)] || CUBE_LAYOUTS[1];

      layout.forEach(([ox, oy]) => {
        const bx = anchorX + ox - CUBE_S / 2;
        const by = anchorY + oy - CUBE_S / 2;

        // Drop shadow
        ctx.save();
        ctx.shadowColor   = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur    = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = fill;
        ctx.fillRect(bx, by, CUBE_S, CUBE_S);
        ctx.restore();

        // Bright border so cubes pop against the dark board
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth   = 1.2;
        ctx.strokeRect(bx, by, CUBE_S, CUBE_S);

        // Inner highlight on top-left edge for a subtle 3-D look
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(bx + 1,          by + CUBE_S - 1);
        ctx.lineTo(bx + 1,          by + 1);
        ctx.lineTo(bx + CUBE_S - 1, by + 1);
        ctx.stroke();
        ctx.restore();
      });
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

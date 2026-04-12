// Deck utilities: shuffle, draw, epidemic insertion.
// All functions are pure — they return new arrays and never mutate inputs.

// ── Fisher-Yates shuffle ──────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Epidemic insertion ────────────────────────────────────────────────────────
// The official rules say:
//   1. Divide the player deck into N roughly equal piles.
//   2. Shuffle one epidemic card into each pile.
//   3. Stack the piles in order (first pile on top).
// This ensures epidemics are spread evenly through the deck rather than
// potentially clustering.

function insertEpidemics(deck, epidemicCount) {
  const shuffled = shuffle(deck);
  const total    = shuffled.length;
  const piles    = [];

  for (let i = 0; i < epidemicCount; i++) {
    const start = Math.floor((i     / epidemicCount) * total);
    const end   = Math.floor(((i+1) / epidemicCount) * total);
    const pile  = shuffled.slice(start, end);
    pile.push({ type: 'epidemic' });
    piles.push(shuffle(pile));
  }

  return piles.flat();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
// Returns { card, remaining } so callers keep state immutable.

function drawTop(pile) {
  if (pile.length === 0) return { card: null, remaining: [] };
  const [card, ...remaining] = pile;
  return { card, remaining };
}

module.exports = { shuffle, insertEpidemics, drawTop };

// Generates a random 4-letter uppercase room code (e.g. "PLGX")
// Excludes visually ambiguous letters: I, O (look like 1, 0)
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }
  return code;
}

module.exports = { generateRoomCode };

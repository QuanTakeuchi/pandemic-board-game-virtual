// Player deck — one city card per city, generated from the master city list.
// Epidemic cards are NOT included here; deck.js inserts them during setup.

const { CITIES } = require('./cities');

const PLAYER_CARDS = Object.values(CITIES).map(city => ({
  type:   'city',
  cityId: city.id,
  name:   city.name,
  color:  city.color,
}));

module.exports = { PLAYER_CARDS };

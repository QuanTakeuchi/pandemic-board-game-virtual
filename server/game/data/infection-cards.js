// Infection deck — one card per city, generated from the master city list.

const { CITIES } = require('./cities');

const INFECTION_CARDS = Object.values(CITIES).map(city => ({
  cityId: city.id,
  name:   city.name,
  color:  city.color,
}));

module.exports = { INFECTION_CARDS };

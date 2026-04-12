// All 48 cities from the Pandemic board game.
// x, y: normalized 0–1 coordinates matching the board map layout.
//        (0,0) = top-left, (1,1) = bottom-right.
// connections: array of city IDs this city links to (bidirectional).
// transpacific: connections that cross the date line — renderer skips drawing
//               a line across the board and shows a visual indicator instead.

const CITIES = {

  // ── Blue — North America ────────────────────────────────────────────────────
  'san-francisco': {
    id: 'san-francisco', name: 'San Francisco', color: 'blue',
    x: 0.06, y: 0.30,
    connections: ['chicago', 'los-angeles', 'tokyo', 'manila'],
    transpacific: ['tokyo', 'manila'],
  },
  'chicago': {
    id: 'chicago', name: 'Chicago', color: 'blue',
    x: 0.14, y: 0.24,
    connections: ['san-francisco', 'los-angeles', 'atlanta', 'montreal', 'mexico-city'],
  },
  'atlanta': {
    id: 'atlanta', name: 'Atlanta', color: 'blue',
    x: 0.16, y: 0.34,
    connections: ['chicago', 'washington', 'miami'],
  },
  'washington': {
    id: 'washington', name: 'Washington', color: 'blue',
    x: 0.21, y: 0.31,
    connections: ['atlanta', 'new-york', 'montreal'],
  },
  'montreal': {
    id: 'montreal', name: 'Montreal', color: 'blue',
    x: 0.22, y: 0.18,
    connections: ['chicago', 'new-york', 'washington'],
  },
  'new-york': {
    id: 'new-york', name: 'New York', color: 'blue',
    x: 0.27, y: 0.26,
    connections: ['washington', 'montreal', 'london', 'madrid'],
  },

  // ── Blue — Europe ────────────────────────────────────────────────────────────
  'london': {
    id: 'london', name: 'London', color: 'blue',
    x: 0.41, y: 0.15,
    connections: ['new-york', 'madrid', 'essen', 'paris'],
  },
  'madrid': {
    id: 'madrid', name: 'Madrid', color: 'blue',
    x: 0.41, y: 0.25,
    connections: ['london', 'new-york', 'paris', 'algiers', 'sao-paulo'],
  },
  'paris': {
    id: 'paris', name: 'Paris', color: 'blue',
    x: 0.47, y: 0.18,
    connections: ['london', 'madrid', 'essen', 'milan', 'algiers'],
  },
  'essen': {
    id: 'essen', name: 'Essen', color: 'blue',
    x: 0.50, y: 0.12,
    connections: ['london', 'paris', 'milan', 'st-petersburg'],
  },
  'milan': {
    id: 'milan', name: 'Milan', color: 'blue',
    x: 0.52, y: 0.21,
    connections: ['essen', 'paris', 'istanbul'],
  },
  'st-petersburg': {
    id: 'st-petersburg', name: 'St. Petersburg', color: 'blue',
    x: 0.58, y: 0.08,
    connections: ['essen', 'istanbul', 'moscow'],
  },

  // ── Yellow — North/Central America ──────────────────────────────────────────
  'los-angeles': {
    id: 'los-angeles', name: 'Los Angeles', color: 'yellow',
    x: 0.06, y: 0.40,
    connections: ['san-francisco', 'chicago', 'mexico-city', 'sydney'],
    transpacific: ['sydney'],
  },
  'mexico-city': {
    id: 'mexico-city', name: 'Mexico City', color: 'yellow',
    x: 0.11, y: 0.44,
    connections: ['chicago', 'los-angeles', 'miami', 'bogota', 'lima'],
  },
  'miami': {
    id: 'miami', name: 'Miami', color: 'yellow',
    x: 0.19, y: 0.43,
    connections: ['atlanta', 'mexico-city', 'bogota'],
  },

  // ── Yellow — South America ───────────────────────────────────────────────────
  'bogota': {
    id: 'bogota', name: 'Bogota', color: 'yellow',
    x: 0.19, y: 0.56,
    connections: ['miami', 'mexico-city', 'lima', 'sao-paulo', 'buenos-aires'],
  },
  'lima': {
    id: 'lima', name: 'Lima', color: 'yellow',
    x: 0.15, y: 0.67,
    connections: ['bogota', 'mexico-city', 'santiago'],
  },
  'santiago': {
    id: 'santiago', name: 'Santiago', color: 'yellow',
    x: 0.16, y: 0.79,
    connections: ['lima'],
  },
  'buenos-aires': {
    id: 'buenos-aires', name: 'Buenos Aires', color: 'yellow',
    x: 0.24, y: 0.82,
    connections: ['bogota', 'sao-paulo'],
  },
  'sao-paulo': {
    id: 'sao-paulo', name: 'São Paulo', color: 'yellow',
    x: 0.28, y: 0.73,
    connections: ['bogota', 'buenos-aires', 'lagos', 'madrid'],
  },

  // ── Yellow — Africa ──────────────────────────────────────────────────────────
  'lagos': {
    id: 'lagos', name: 'Lagos', color: 'yellow',
    x: 0.46, y: 0.56,
    connections: ['sao-paulo', 'kinshasa', 'khartoum'],
  },
  'kinshasa': {
    id: 'kinshasa', name: 'Kinshasa', color: 'yellow',
    x: 0.52, y: 0.65,
    connections: ['lagos', 'khartoum', 'johannesburg'],
  },
  'johannesburg': {
    id: 'johannesburg', name: 'Johannesburg', color: 'yellow',
    x: 0.54, y: 0.77,
    connections: ['kinshasa', 'khartoum'],
  },
  'khartoum': {
    id: 'khartoum', name: 'Khartoum', color: 'yellow',
    x: 0.58, y: 0.50,
    connections: ['cairo', 'lagos', 'kinshasa', 'johannesburg'],
  },

  // ── Black — Middle East / Central Asia ───────────────────────────────────────
  'algiers': {
    id: 'algiers', name: 'Algiers', color: 'black',
    x: 0.47, y: 0.29,
    connections: ['madrid', 'paris', 'cairo', 'istanbul'],
  },
  'cairo': {
    id: 'cairo', name: 'Cairo', color: 'black',
    x: 0.57, y: 0.35,
    connections: ['algiers', 'istanbul', 'baghdad', 'riyadh', 'khartoum'],
  },
  'istanbul': {
    id: 'istanbul', name: 'Istanbul', color: 'black',
    x: 0.55, y: 0.23,
    connections: ['algiers', 'milan', 'st-petersburg', 'moscow', 'baghdad', 'cairo'],
  },
  'moscow': {
    id: 'moscow', name: 'Moscow', color: 'black',
    x: 0.62, y: 0.11,
    connections: ['st-petersburg', 'istanbul', 'tehran'],
  },
  'baghdad': {
    id: 'baghdad', name: 'Baghdad', color: 'black',
    x: 0.63, y: 0.31,
    connections: ['istanbul', 'tehran', 'riyadh', 'karachi', 'cairo'],
  },
  'tehran': {
    id: 'tehran', name: 'Tehran', color: 'black',
    x: 0.67, y: 0.26,
    connections: ['moscow', 'baghdad', 'karachi', 'delhi'],
  },
  'riyadh': {
    id: 'riyadh', name: 'Riyadh', color: 'black',
    x: 0.64, y: 0.40,
    connections: ['baghdad', 'cairo', 'karachi'],
  },

  // ── Black — South Asia ───────────────────────────────────────────────────────
  'karachi': {
    id: 'karachi', name: 'Karachi', color: 'black',
    x: 0.70, y: 0.36,
    connections: ['tehran', 'baghdad', 'riyadh', 'mumbai', 'delhi'],
  },
  'mumbai': {
    id: 'mumbai', name: 'Mumbai', color: 'black',
    x: 0.72, y: 0.46,
    connections: ['karachi', 'delhi', 'chennai'],
  },
  'delhi': {
    id: 'delhi', name: 'Delhi', color: 'black',
    x: 0.74, y: 0.32,
    connections: ['tehran', 'karachi', 'mumbai', 'kolkata', 'chennai'],
  },
  'chennai': {
    id: 'chennai', name: 'Chennai', color: 'black',
    x: 0.76, y: 0.50,
    connections: ['mumbai', 'delhi', 'kolkata', 'bangkok', 'jakarta'],
  },
  'kolkata': {
    id: 'kolkata', name: 'Kolkata', color: 'black',
    x: 0.78, y: 0.40,
    connections: ['delhi', 'chennai', 'bangkok', 'hong-kong'],
  },

  // ── Red — Southeast Asia ──────────────────────────────────────────────────
  'bangkok': {
    id: 'bangkok', name: 'Bangkok', color: 'red',
    x: 0.80, y: 0.47,
    connections: ['kolkata', 'chennai', 'hong-kong', 'jakarta', 'ho-chi-minh'],
  },
  'ho-chi-minh': {
    id: 'ho-chi-minh', name: 'Ho Chi Minh City', color: 'red',
    x: 0.86, y: 0.52,
    connections: ['bangkok', 'jakarta', 'manila', 'hong-kong'],
  },
  'jakarta': {
    id: 'jakarta', name: 'Jakarta', color: 'red',
    x: 0.84, y: 0.62,
    connections: ['chennai', 'bangkok', 'ho-chi-minh', 'sydney'],
  },
  'manila': {
    id: 'manila', name: 'Manila', color: 'red',
    x: 0.90, y: 0.47,
    connections: ['san-francisco', 'ho-chi-minh', 'hong-kong', 'taipei', 'sydney'],
    transpacific: ['san-francisco'],
  },
  'sydney': {
    id: 'sydney', name: 'Sydney', color: 'red',
    x: 0.93, y: 0.74,
    connections: ['los-angeles', 'jakarta', 'manila'],
    transpacific: ['los-angeles'],
  },

  // ── Red — East Asia ──────────────────────────────────────────────────────────
  'hong-kong': {
    id: 'hong-kong', name: 'Hong Kong', color: 'red',
    x: 0.86, y: 0.39,
    connections: ['kolkata', 'bangkok', 'ho-chi-minh', 'manila', 'shanghai', 'taipei'],
  },
  'shanghai': {
    id: 'shanghai', name: 'Shanghai', color: 'red',
    x: 0.88, y: 0.30,
    connections: ['hong-kong', 'beijing', 'tokyo', 'seoul', 'taipei'],
  },
  'beijing': {
    id: 'beijing', name: 'Beijing', color: 'red',
    x: 0.87, y: 0.21,
    connections: ['shanghai', 'seoul'],
  },
  'seoul': {
    id: 'seoul', name: 'Seoul', color: 'red',
    x: 0.90, y: 0.21,
    connections: ['beijing', 'shanghai', 'tokyo'],
  },
  'tokyo': {
    id: 'tokyo', name: 'Tokyo', color: 'red',
    x: 0.95, y: 0.26,
    connections: ['seoul', 'shanghai', 'osaka', 'san-francisco'],
    transpacific: ['san-francisco'],
  },
  'osaka': {
    id: 'osaka', name: 'Osaka', color: 'red',
    x: 0.96, y: 0.33,
    connections: ['tokyo', 'taipei'],
  },
  'taipei': {
    id: 'taipei', name: 'Taipei', color: 'red',
    x: 0.91, y: 0.37,
    connections: ['hong-kong', 'shanghai', 'osaka', 'manila'],
  },
};

module.exports = { CITIES };

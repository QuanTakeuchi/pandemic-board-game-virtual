// Special Event cards — shuffled into the player deck along with city cards.
// Players can play these at any time; they do not cost an action.

const EVENT_CARDS = [
  {
    type: 'event',
    id:   'airlift',
    name: 'Airlift',
    desc: 'Move any 1 pawn to any city. Get permission first.',
  },
  {
    type: 'event',
    id:   'government-grant',
    name: 'Government Grant',
    desc: 'Add 1 research station to any city (no card needed).',
  },
  {
    type: 'event',
    id:   'one-quiet-night',
    name: 'One Quiet Night',
    desc: 'Skip the next Infect Cities step.',
  },
  {
    type: 'event',
    id:   'forecast',
    name: 'Forecast',
    desc: 'Draw, look at, and rearrange the top 6 Infection Deck cards.',
  },
  {
    type: 'event',
    id:   'resilient-population',
    name: 'Resilient Population',
    desc: 'Remove any 1 card from the Infection Discard Pile permanently.',
  },
];

module.exports = { EVENT_CARDS };

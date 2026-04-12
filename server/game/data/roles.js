// The 7 standard Pandemic roles.
// Special ability logic lives in server/game/engine/actions.js (Phase 4).
// This file is the single source of truth for role metadata.

const ROLES = [
  {
    id:          'medic',
    name:        'Medic',
    pawnColor:   '#f0a500',
    description: 'Remove ALL cubes of one color when treating (not just one). '
                + 'Automatically removes cubes of cured diseases at no action cost.',
  },
  {
    id:          'scientist',
    name:        'Scientist',
    pawnColor:   '#e8e8e8',
    description: 'Needs only 4 cards of one color (instead of 5) to discover a cure.',
  },
  {
    id:          'researcher',
    name:        'Researcher',
    pawnColor:   '#8B4513',
    description: 'When sharing knowledge, may give any city card from hand '
                + '(does not need to match current city).',
  },
  {
    id:          'operations-expert',
    name:        'Operations Expert',
    pawnColor:   '#228B22',
    description: 'May build a research station without discarding a city card. '
                + 'Once per turn, move from a research station to any city by discarding any city card.',
  },
  {
    id:          'dispatcher',
    name:        'Dispatcher',
    pawnColor:   '#cc44cc',
    description: 'May move any pawn as if it were your own. '
                + 'May move any pawn to a city occupied by another pawn.',
  },
  {
    id:          'quarantine-specialist',
    name:        'Quarantine Specialist',
    pawnColor:   '#2e8b57',
    description: 'Prevent disease cube placement (and outbreaks) in current city '
                + 'and all directly connected cities.',
  },
  {
    id:          'contingency-planner',
    name:        'Contingency Planner',
    pawnColor:   '#4a9ed9',
    description: 'Once per turn, take any event card from the player discard pile '
                + 'and store it on this role card. Playing that card does not require discarding.',
  },
];

// Keyed by id for fast lookup
const ROLES_BY_ID = Object.fromEntries(ROLES.map(r => [r.id, r]));

module.exports = { ROLES, ROLES_BY_ID };

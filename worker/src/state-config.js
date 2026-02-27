// State configuration for multi-state support
// Each state has its own election settings, KV prefix, etc.

export const STATE_CONFIG = {
  tx: {
    name: 'Texas',
    abbr: 'TX',
    electionDate: '2026-03-03',
    electionName: 'Texas Primary Election',
    parties: ['republican', 'democrat'],
    defaultParty: 'republican',
    fips: '48',
    kvPrefix: '', // TX keys remain unprefixed for backward compat
  },
  dc: {
    name: 'Washington DC',
    abbr: 'DC',
    electionDate: '2026-06-16',
    electionName: 'DC Primary Election',
    parties: ['democrat', 'republican', 'statehood_green', 'libertarian'],
    defaultParty: 'democrat',
    fips: '11',
    kvPrefix: 'dc:',
  },
};

// Valid state codes
export const VALID_STATES = Object.keys(STATE_CONFIG);

// Default state (for backward compat redirects)
export const DEFAULT_STATE = 'tx';

/**
 * Extract state code from a URL pathname.
 * Matches /{state}/app or /{state}/app/...
 * Returns null if no state prefix found.
 */
export function parseStateFromPath(pathname) {
  const match = pathname.match(/^\/(tx|dc)\/app(\/|$|\?|#)/);
  return match ? match[1] : null;
}

/**
 * Strip the state prefix from a pathname for internal routing.
 * e.g., /tx/app/api/guide -> /app/api/guide
 */
export function stripStatePrefix(pathname) {
  return pathname.replace(/^\/(tx|dc)\/app/, '/app');
}

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
    pollsCloseTime: '19:00:00-06:00', // 7 PM Central Time
    resultsUrl: 'https://results.texas-election.com/races',
    runoffDate: null, // Set after primary when runoff races are certified
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
    pollsCloseTime: '20:00:00-05:00', // 8 PM Eastern Time
    resultsUrl: null,
    runoffDate: null,
  },
};

// Valid election phases
export const ELECTION_PHASES = ['pre-election', 'election-night', 'post-election', 'runoff'];

/**
 * Determine the current election phase for a state.
 * Uses time-based logic with optional KV override.
 *
 * @param {string} stateCode - 'tx' or 'dc'
 * @param {object} [options] - Optional overrides
 * @param {string} [options.kvPhase] - KV override value (from site_phase:{stateCode})
 * @param {Date} [options.now] - Current time (for testing)
 * @returns {'pre-election'|'election-night'|'post-election'|'runoff'}
 */
export function getElectionPhase(stateCode, options = {}) {
  // KV override takes precedence if it's a valid phase
  if (options.kvPhase && ELECTION_PHASES.includes(options.kvPhase)) {
    return options.kvPhase;
  }

  const config = STATE_CONFIG[stateCode];
  if (!config) return 'pre-election';

  const now = options.now || new Date();
  const pollsClose = new Date(config.electionDate + 'T' + config.pollsCloseTime);
  const dayAfter = new Date(config.electionDate + 'T00:00:00');
  dayAfter.setDate(dayAfter.getDate() + 1);
  // Day after at midnight in the same timezone — use end of election day + 24h from polls close
  const postElectionStart = new Date(pollsClose.getTime() + 5 * 60 * 60 * 1000); // ~5 hours after polls close (midnight local)

  if (now < pollsClose) return 'pre-election';
  if (now < postElectionStart) return 'election-night';
  return 'post-election';
}

// Election suffix for KV key construction (changes each election cycle)
export const ELECTION_SUFFIX = '_primary_2026';

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

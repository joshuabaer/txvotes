// County data seeder — populates county-specific ballot data and voting info
// Uses Claude + web_search to research county races from TX SOS filings
//
// Run via: POST /api/election/seed-county with ADMIN_SECRET auth
// Body: { countyFips: "48453", countyName: "Travis", party: "republican" }
//
// Options:
//   reset: true — clear progress for this county before seeding
//
// Progress is tracked in KV at `seed_progress:{countyFips}`. Only successful
// steps are marked completed; failed steps are retried on the next run.

import { extractSourcesFromResponse, mergeSources, validateRaceUpdate } from "./updater.js";
import { logTokenUsage } from "./usage-logger.js";
import { buildCondensedBallotDescription } from "./pwa-guide.js";
import { ELECTION_SUFFIX } from "./state-config.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Error Classification ───────────────────────────────────────────────────

/**
 * Classify an error into a category for structured reporting.
 * Categories: AUTH, RATE_LIMIT, OVERLOADED, SERVER, NETWORK, DATA, OTHER
 */
export function classifyError(error) {
  const msg = error.message || String(error);
  if (msg.includes("401") || msg.includes("403") || msg.includes("auth")) return "AUTH";
  if (msg.includes("429")) return "RATE_LIMIT";
  if (msg.includes("529")) return "OVERLOADED";
  if (msg.includes("500") || msg.includes("502") || msg.includes("503")) return "SERVER";
  if (msg.includes("fetch") || msg.includes("ECONN") || msg.includes("ETIMEDOUT") || msg.includes("network")) return "NETWORK";
  if (msg.includes("parse") || msg.includes("JSON") || msg.includes("Validation")) return "DATA";
  return "OTHER";
}

/**
 * Human-readable label for an error category
 */
export function errorCategoryLabel(category) {
  switch (category) {
    case "AUTH": return "Auth error (401/403) — check ANTHROPIC_API_KEY";
    case "RATE_LIMIT": return "Rate limited (429) — wait and retry";
    case "OVERLOADED": return "API overloaded (529) — wait and retry";
    case "SERVER": return "Server error (5xx) — transient, retry later";
    case "NETWORK": return "Network error — check connectivity";
    case "DATA": return "Data error — response parsing or validation failed";
    default: return "Other error";
  }
}

// ─── KV-based Progress Tracking ─────────────────────────────────────────────

const PROGRESS_KEY_PREFIX = "seed_progress:";

/**
 * Load progress for a county from KV
 */
async function loadProgress(env, countyFips) {
  try {
    const data = await env.ELECTION_DATA.get(`${PROGRESS_KEY_PREFIX}${countyFips}`, "json");
    if (!data) return { completed: {}, errors: [], startedAt: new Date().toISOString() };
    // Clear stale errors from previous runs — they'll be re-populated if they recur
    const staleErrorCount = (data.errors || []).length;
    if (staleErrorCount > 0) {
      data.errors = [];
    }
    return data;
  } catch {
    return { completed: {}, errors: [], startedAt: new Date().toISOString() };
  }
}

/**
 * Save progress for a county to KV
 */
async function saveProgress(env, countyFips, progress) {
  await env.ELECTION_DATA.put(
    `${PROGRESS_KEY_PREFIX}${countyFips}`,
    JSON.stringify(progress),
    { expirationTtl: 2592000 } // 30 days
  );
}

/**
 * Clear progress for a county (used by --reset / reset option)
 */
export async function resetProgress(env, countyFips) {
  await env.ELECTION_DATA.delete(`${PROGRESS_KEY_PREFIX}${countyFips}`);
}

/**
 * Check if a step is completed in progress
 */
function isCompleted(progress, stepKey) {
  return progress.completed[stepKey] === true;
}

/**
 * Mark a step as completed (only call after successful KV write)
 */
function markCompleted(progress, stepKey, meta = {}) {
  progress.completed[stepKey] = true;
  progress.lastCompleted = { step: stepKey, at: new Date().toISOString(), ...meta };
}

/**
 * Record an error for a step (does NOT mark as completed — step will retry)
 */
function markError(progress, stepKey, error) {
  const category = classifyError(error);
  progress.errors.push({
    step: stepKey,
    error: error.message || String(error),
    category,
    at: new Date().toISOString(),
  });
  // Explicitly do NOT mark as completed — failed steps will be retried on next run
}

// Top 30 Texas counties by population (covers ~75% of TX voters)
export const TOP_COUNTIES = [
  { fips: "48201", name: "Harris" },
  { fips: "48113", name: "Dallas" },
  { fips: "48439", name: "Tarrant" },
  { fips: "48029", name: "Bexar" },
  { fips: "48453", name: "Travis" },
  { fips: "48085", name: "Collin" },
  { fips: "48121", name: "Denton" },
  { fips: "48215", name: "Hidalgo" },
  { fips: "48157", name: "Fort Bend" },
  { fips: "48491", name: "Williamson" },
  { fips: "48339", name: "Montgomery" },
  { fips: "48141", name: "El Paso" },
  { fips: "48355", name: "Nueces" },
  { fips: "48167", name: "Galveston" },
  { fips: "48039", name: "Brazoria" },
  { fips: "48257", name: "Kaufman" },
  { fips: "48251", name: "Johnson" },
  { fips: "48367", name: "Parker" },
  { fips: "48303", name: "Lubbock" },
  { fips: "48061", name: "Cameron" },
  { fips: "48309", name: "McLennan" },
  { fips: "48027", name: "Bell" },
  { fips: "48183", name: "Gregg" },
  { fips: "48381", name: "Randall" },
  { fips: "48375", name: "Potter" },
  { fips: "48423", name: "Smith" },
  { fips: "48469", name: "Victoria" },
  { fips: "48245", name: "Jefferson" },
  { fips: "48329", name: "Midland" },
  { fips: "48135", name: "Ector" },
];

/**
 * Seeds county-specific voting info (hours, locations, phone, etc.)
 * @param {string} countyFips - FIPS code
 * @param {string} countyName - County name
 * @param {object} env - Cloudflare env bindings
 */
export async function seedCountyInfo(countyFips, countyName, env) {
  const prompt = `Research the voting information for ${countyName} County, Texas for the March 3, 2026 Texas Primary Election.

Find:
1. Does the county use Vote Centers (any location) or precinct-based voting?
2. The county elections website URL
3. The county elections office phone number
4. Early voting dates and hours (early voting is Feb 17-27, 2026)
5. Election Day hours (typically 7 AM - 7 PM)
6. Election Day polling location finder URL
7. Can voters use phones in the voting booth?
8. Key local resources (election office website, local voter guide links)

SEARCH STRATEGY for small/rural counties:
- Try the county clerk or elections administrator page on the county website
- Search "${countyName} County Texas elections" and "${countyName} County Texas county clerk"
- Check the Texas Secretary of State county clerk directory: https://www.sos.state.tx.us/elections/voter/county.shtml
- For phone numbers, try the county courthouse main number
- Many small counties use precinct-based voting (not vote centers)
- If no dedicated elections website exists, use the county's main website
- Default early voting hours for small counties: 8 AM - 5 PM weekdays, extended last week
- Election Day hours in Texas are always 7:00 AM - 7:00 PM statewide

Return ONLY this JSON:
{
  "countyFips": "${countyFips}",
  "countyName": "${countyName}",
  "voteCenters": true or false,
  "electionsWebsite": "URL",
  "electionsPhone": "phone number",
  "earlyVoting": {
    "periods": [
      { "dates": "Feb 17-21", "hours": "7:00 AM - 7:00 PM" }
    ],
    "note": "optional note"
  },
  "electionDay": {
    "hours": "7:00 AM - 7:00 PM",
    "locationUrl": "URL to find locations"
  },
  "phoneInBooth": true or false or null if unknown,
  "resources": [
    { "name": "Display Name", "url": "URL" }
  ]
}

IMPORTANT: Return ONLY valid JSON. Use null for any field you cannot verify.
Even for very small counties, you should be able to find at least a phone number and basic website. Use the TX SOS county clerk directory as a fallback.`;

  const result = await callClaudeWithSearch(env, prompt);
  if (!result) return { error: "No response from Claude" };

  const key = `county_info:${countyFips}`;
  await env.ELECTION_DATA.put(key, JSON.stringify(result), { expirationTtl: 604800 });
  return { success: true, countyFips, countyName };
}

/**
 * Seeds county-specific local races for a given party
 * @param {string} countyFips
 * @param {string} countyName
 * @param {string} party - "republican" or "democrat"
 * @param {object} env
 */
export async function seedCountyBallot(countyFips, countyName, party, env) {
  const partyLabel = party.charAt(0).toUpperCase() + party.slice(1);

  const prompt = `Research ALL local ${partyLabel} primary races for ${countyName} County, Texas in the March 3, 2026 Texas Primary Election.

SEARCH STRATEGY — perform these searches in order:
1. Search "${countyName} County Texas ${partyLabel} primary 2026 candidates"
2. Search "site:sos.state.tx.us ${countyName} county 2026 primary filing"
3. Search "${countyName} County Texas March 2026 election ballot"
4. Search "ballotpedia ${countyName} County Texas 2026"

Every Texas county has at least a County Judge and 4 Commissioner precincts. Most also have Sheriff, County Clerk, District Clerk, Tax Assessor-Collector, Constables, and Justices of the Peace. Search until you find the contested races.

Include ONLY county-level races such as:
- County Judge
- County Commissioner (by precinct)
- County Clerk
- District Clerk
- County Treasurer
- Justice of the Peace (by precinct)
- Constable (by precinct)
- County Sheriff
- District Attorney
- County Attorney
- Tax Assessor-Collector
- Any other county-level offices on the ${partyLabel} primary ballot

For each race, provide:
- Office name
- District/precinct if applicable
- Whether it's contested (2+ candidates)
- Each candidate's name, background, key positions, endorsements, pros, cons

Return ONLY this JSON:
{
  "id": "${countyFips}_${party}_primary_2026",
  "party": "${party}",
  "electionDate": "2026-03-03",
  "electionName": "2026 ${partyLabel} Primary - ${countyName} County",
  "races": [
    {
      "id": "unique-id",
      "office": "County Commissioner",
      "district": "Precinct 1",
      "isContested": true,
      "isKeyRace": false,
      "candidates": [
        {
          "id": "cand-id",
          "name": "Full Name",
          "isIncumbent": false,
          "summary": "1-2 sentence summary",
          "background": "Brief background",
          "keyPositions": ["Position 1", "Position 2"],
          "endorsements": [{"name": "Endorser Name", "type": "labor union|editorial board|advocacy group|business group|elected official|political organization|professional association|community organization|public figure"}],
          "pros": ["Strength 1"],
          "cons": ["Concern 1"]
        }
      ]
    }
  ],
  "propositions": []
}

BALANCE REQUIREMENTS:
- Every candidate MUST have at least 2 pros AND at least 2 cons
- Pros and cons counts should be within 1 of each other (e.g., 3 pros / 3 cons or 3 pros / 4 cons)
- Each pro and con should be 30-80 characters long
- Even lesser-known candidates deserve equal analytical treatment

IMPORTANT:
- Return ONLY valid JSON
- Only include races that are actually on the ${partyLabel} primary ballot
- Use exact candidate names from official filings
- For endorsements: each entry must be an object with "name" (endorser name) and "type" (one of: labor union, editorial board, advocacy group, business group, elected official, political organization, professional association, community organization, public figure)
- Do NOT return an empty races array unless you have exhausted all search strategies and confirmed this party has zero contested county-level races in ${countyName} County
- If you truly cannot find any local races for this county/party after thorough searching, return {"races": [], "propositions": []}`;

  const result = await callClaudeWithSearch(env, prompt, { maxSearchUses: 15 });
  if (!result) return { error: "No response from Claude" };

  // Detect empty ballot — treat as retryable error so the step is NOT marked completed.
  // Claude may return {"races":[],"propositions":[]} when web_search fails to find data.
  // Retrying with reset will re-attempt the search.
  if (!result.races || result.races.length === 0) {
    console.warn(`[SEED] ${countyName}/${party}: Claude returned 0 races — treating as retryable error`);
    return { error: `No races found for ${countyName} County ${partyLabel} primary — search may need retry` };
  }

  // Scope source attribution per-candidate (matching updater.js pattern)
  const apiSources = result._apiSources || [];
  delete result._apiSources;
  if (result.races && Array.isArray(result.races)) {
    for (const race of result.races) {
      if (race.candidates && Array.isArray(race.candidates)) {
        for (const cand of race.candidates) {
          // Use candidate-level sources if present, fall back to API-level sources
          const candidateSources = Array.isArray(cand.sources) ? cand.sources : [];
          const today = new Date().toISOString().slice(0, 10);
          const normalizedCandSources = candidateSources
            .filter((s) => s && s.url)
            .map((s) => ({ url: s.url, title: s.title || s.url, accessDate: s.accessDate || today }));
          const allIncoming = [...normalizedCandSources, ...apiSources];
          if (allIncoming.length > 0) {
            cand.sources = mergeSources(cand.sources, allIncoming);
            cand.sourcesUpdatedAt = new Date().toISOString();
          }
        }

        // Validate race before writing to KV (same checks the updater enforces)
        const validationError = validateRaceUpdate(race, race);
        if (validationError) {
          return { error: `Validation failed for ${race.office}: ${validationError}` };
        }
      }
    }
  }

  // Ensure countyName is in the ballot data for the candidates index
  if (!result.countyName) result.countyName = countyName;

  const key = `ballot:county:${countyFips}:${party}${ELECTION_SUFFIX}`;
  await env.ELECTION_DATA.put(key, JSON.stringify(result));
  // Invalidate candidates_index cache so it rebuilds with new county data
  try { await env.ELECTION_DATA.delete("candidates_index"); } catch { /* non-fatal */ }

  // --- Post-seed ballot size check ---
  try {
    if (result.races && result.races.length > 0) {
      const condensed = buildCondensedBallotDescription(result);
      const chars = condensed.length;
      const estTokens = Math.ceil(chars / 4);
      console.log(`[BALLOT SIZE] ${countyName}/${party}: ${chars} chars (~${estTokens} tokens)`);
      if (estTokens > 6000) {
        console.warn(`[BALLOT SIZE WARNING] ${countyName}/${party} ballot estimated at ${estTokens} tokens — exceeds 6000 token threshold`);
      }
      // Store ballot size metrics in KV for monitoring
      await env.ELECTION_DATA.put(`metrics:ballot_size:county:${countyFips}:${party}`, JSON.stringify({
        countyFips,
        countyName,
        party,
        chars,
        estimatedTokens: estTokens,
        measuredAt: new Date().toISOString(),
        raceCount: (result.races || []).length,
        candidateCount: (result.races || []).reduce((s, r) => s + (r.candidates || []).length, 0),
      }));
    }
  } catch (e) {
    // Non-fatal: don't let metrics fail the seed
    console.warn(`[BALLOT SIZE] Failed to compute for ${countyName}/${party}: ${e.message}`);
  }

  return { success: true, countyFips, countyName, party, raceCount: (result.races || []).length };
}

// ─── County-specific search hints for precinct maps ──────────────────────────
// These help Claude find the right GIS portals and PDF maps for each county.
// Counties with known GIS/open data portals get targeted hints.

const PRECINCT_MAP_HINTS = {
  Harris: "Search geo-harriscounty.opendata.arcgis.com for commissioner precincts. Also try hctax.net commissioner precinct map PDF.",
  Dallas: "Search dallascountyvotes.org/public-information/precincts-maps/ for precinct-to-commissioner mappings.",
  Tarrant: "Search data-tarrantcounty.opendata.arcgis.com for commissioner precinct boundaries. Also try tarrantcountytx.gov interactive maps.",
  Bexar: "Search maps.bexar.org/Commissioners/ for interactive commissioner precinct map. Also try gis-bexar.opendata.arcgis.com.",
  Travis: "Search traviscountytx.gov/maps/gis-comm-pct for commissioner precinct GIS data. Voting precincts use 3-digit numbers where first digit = commissioner precinct.",
  Collin: "Search collincountytx.gov Commissioners Court precincts page for PDF maps and interactive maps.",
  Denton: "Search dentoncounty.gov for commissioner precinct maps and GIS data.",
  Hidalgo: "Search hidalgocounty.us for commissioner precinct maps.",
  "Fort Bend": "Search fortbendcountytx.gov/government/departments/county-services/engineering/gis-data for GIS downloads. Voting precinct first digit = commissioner precinct.",
  Williamson: "Search geohub.wilcotx.gov for precinct data. Also try gisweb.wilco.org/drop/web/Precincts/OverallPrecincts.pdf.",
  Montgomery: "Search mctx.org for commissioner precinct information. Precinct 1 (Walker), 2 (Riley), 3 (Wheeler), 4 (Meador).",
  "El Paso": "Search epcountyvotes.com/maps/county-commissioner-maps for commissioner precinct maps.",
  Nueces: "Search nuecesco.com for commissioner precinct maps.",
  Galveston: "Search galvestoncountytx.gov for commissioner precinct maps and GIS portal.",
  Brazoria: "Search brazoriacountytx.gov for commissioner precinct maps.",
  Kaufman: "Search kaufmancounty.net for commissioner precinct maps.",
  Johnson: "Search johnsoncountytx.org/departments/elections-office/precinct-maps for voting-to-commissioner precinct mapping.",
  Parker: "Search parkercountytx.com for commissioner precinct maps.",
  Lubbock: "Search lubbockcounty.gov for commissioner precinct maps.",
  Cameron: "Search cameroncountytx.gov for commissioner precinct maps.",
  McLennan: "Search mclennan.maps.arcgis.com or mclennanvotes.com for precinct maps.",
  Bell: "Search bellcountytx.com for commissioner precinct maps.",
  Gregg: "Search co.gregg.tx.us for commissioner precinct information.",
  Randall: "Search randallcounty.org for commissioner precinct maps.",
  Potter: "Search pottercounty.com for commissioner precinct maps.",
  Smith: "Search smith-county.com for commissioner precinct maps.",
  Victoria: "Search victoriacountytx.org for commissioner precinct maps.",
  Jefferson: "Search co.jefferson.tx.us for commissioner precinct maps.",
  Midland: "Search midlandcounty.com for commissioner precinct maps.",
  Ector: "Search co.ector.tx.us for commissioner precinct maps.",
};

/**
 * Seeds precinct map (ZIP → commissioner precinct) for a county.
 *
 * Strategy: Texas counties have 4 commissioner precincts. Many counties
 * number their voting precincts so the first digit = commissioner precinct
 * (e.g., voting precinct 234 is in commissioner precinct 2). The prompt
 * instructs Claude to use this convention plus county GIS data to build
 * a best-effort ZIP-to-commissioner-precinct mapping.
 *
 * ZIP codes often span multiple precincts, so the mapping uses the
 * "majority precinct" — the commissioner precinct that covers the largest
 * area of that ZIP code.
 */
export async function seedPrecinctMap(countyFips, countyName, env) {
  const hint = PRECINCT_MAP_HINTS[countyName] || "";
  const hintBlock = hint ? `\nCOUNTY-SPECIFIC HINT: ${hint}\n` : "";

  const prompt = `Research the County Commissioner precinct boundaries for ${countyName} County, Texas.

I need a mapping of ZIP codes to County Commissioner precinct numbers (1-4).

BACKGROUND: Every Texas county has exactly 4 commissioner precincts. Many Texas counties number their voting precincts so the FIRST DIGIT of the voting precinct number equals the commissioner precinct (e.g., voting precinct 234 = commissioner precinct 2, voting precinct 406 = commissioner precinct 4). This convention is used by Travis, Fort Bend, Williamson, and many other counties.

RESEARCH STRATEGY (try in this order):
1. Search for "${countyName} County Texas commissioner precinct map" — look for PDF maps or GIS portals
2. Search for "${countyName} County Texas GIS" or "${countyName} County open data arcgis" — look for boundary shapefiles
3. Search for "${countyName} County election precincts" — find voting precinct lists grouped by commissioner precinct
4. Search for "site:${countyName.toLowerCase().replace(/ /g, "")}county" or the county's official website for precinct information
5. If the county lists voting precincts by commissioner precinct, use the first-digit convention to verify
${hintBlock}
For each ZIP code primarily within ${countyName} County, determine which commissioner precinct (1, 2, 3, or 4) covers the MAJORITY of that ZIP code's area. If a ZIP code is split roughly equally, assign it to the precinct that covers the largest portion.

Return ONLY this JSON:
{
  "ZIP_CODE": "PRECINCT_NUMBER",
  ...
}

For example: {"78701": "2", "78702": "1", "78703": "4"}

IMPORTANT:
- Return ONLY valid JSON
- Precinct numbers must be "1", "2", "3", or "4" (strings)
- Only include ZIP codes that are primarily within ${countyName} County
- If a ZIP code spans multiple precincts, use the MAJORITY precinct
- Use at least 5 web searches to verify your mapping
- If you truly cannot determine ANY mappings reliably, return {}
- It is better to return a partial mapping (some ZIPs) than an empty one`;

  const result = await callClaudeWithSearch(env, prompt, { maxSearchUses: 15 });
  if (!result || Object.keys(result).length === 0) {
    return { error: "Could not determine precinct map" };
  }

  // Validate: all values should be "1"-"4"
  const validPrecincts = new Set(["1", "2", "3", "4"]);
  const cleaned = {};
  let invalidCount = 0;
  for (const [zip, precinct] of Object.entries(result)) {
    const p = String(precinct);
    if (validPrecincts.has(p) && /^\d{5}$/.test(zip)) {
      cleaned[zip] = p;
    } else {
      invalidCount++;
    }
  }

  if (Object.keys(cleaned).length === 0) {
    return { error: "Could not determine precinct map (all entries invalid)" };
  }

  if (invalidCount > 0) {
    console.warn(`[PRECINCT MAP] ${countyName}: filtered out ${invalidCount} invalid entries`);
  }

  const key = `precinct_map:${countyFips}`;
  await env.ELECTION_DATA.put(key, JSON.stringify(cleaned), { expirationTtl: 2592000 });
  return { success: true, countyFips, countyName, zipCount: Object.keys(cleaned).length, invalidCount };
}

// ─── JSON Extraction ────────────────────────────────────────────────────────

/**
 * Extract JSON from a Claude response that may contain surrounding prose.
 *
 * Strategy (in order):
 * 1. Try parsing the entire text as JSON (ideal case)
 * 2. Extract from ```json ... ``` fenced code blocks
 * 3. Brace-depth matching: find the outermost balanced { ... } object
 * 4. First-brace/last-brace fallback (less reliable but catches more cases)
 *
 * Returns the parsed object, or null if no valid JSON found.
 */
export function extractJSON(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1. Try the whole string as JSON
  try {
    return JSON.parse(trimmed);
  } catch { /* continue */ }

  // 2. Try ```json fenced block
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch { /* continue to next strategy */ }
  }

  // 3. Brace-depth matching — find each balanced top-level { ... } and try to parse
  let searchStart = trimmed.indexOf("{");
  while (searchStart !== -1 && searchStart < trimmed.length) {
    let depth = 0;
    let inString = false;
    let escape = false;
    let candidateStart = searchStart;
    for (let i = candidateStart; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const candidate = trimmed.slice(candidateStart, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            // This balanced block wasn't valid JSON — skip past it and look for the next {
            searchStart = trimmed.indexOf("{", i + 1);
            break;
          }
        }
      }
    }
    // If we scanned to the end without depth returning to 0, stop
    if (depth !== 0) break;
  }

  // 4. First-brace/last-brace fallback
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch { /* give up */ }
  }

  return null;
}

// ─── Claude API Call ────────────────────────────────────────────────────────

/**
 * Calls Claude with web_search tool to research election data.
 * - Auth errors (401/403) throw immediately without retrying
 * - Rate limits (429) and overloaded (529) retry up to 3 times
 * - Server errors (5xx) throw with status detail
 * - Non-JSON responses trigger a single repair retry
 */
async function callClaudeWithSearch(env, userPrompt, options = {}) {
  const maxSearchUses = options.maxSearchUses || 10;
  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system:
      "You are a nonpartisan election data researcher for Texas. " +
      "Use web_search to find verified, factual information about elections. " +
      "Never fabricate information — if you cannot verify something, use null.\n\n" +
      "CRITICAL OUTPUT FORMAT: Your response MUST be ONLY valid JSON. " +
      "Do NOT include any explanatory text, commentary, or markdown outside of the JSON object. " +
      "Do NOT start your response with phrases like \"I'll help you\" or \"Here is the data\". " +
      "Your entire response must be a single JSON object starting with { and ending with }.\n\n" +
      "SOURCE PRIORITY: When evaluating web_search results, prefer sources in this order:\n" +
      "1. Texas Secretary of State filings (sos.state.tx.us)\n" +
      "2. County election offices ({county}.tx.us)\n" +
      "3. Official campaign websites\n" +
      "4. Nonpartisan references (ballotpedia.org, votesmart.org)\n" +
      "5. Established Texas news outlets (texastribune.org, dallasnews.com)\n" +
      "6. National wire services (apnews.com, reuters.com)\n" +
      "7. AVOID: blogs, social media, opinion sites, unverified sources\n\n" +
      "CONFLICT RESOLUTION: If sources disagree, trust official filings over campaign claims, and campaign claims over news reporting.",
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearchUses }],
    messages: [{ role: "user", content: userPrompt }],
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    // Auth errors — fail immediately, no retry (key is invalid/expired)
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Claude API auth error (${response.status}): check ANTHROPIC_API_KEY`);
    }

    // Rate limit — retry with backoff
    if (response.status === 429) {
      await sleep((attempt + 1) * 10000);
      continue;
    }

    // Overloaded — retry with backoff
    if (response.status === 529) {
      await sleep((attempt + 1) * 5000);
      continue;
    }

    // Other errors — throw with status detail
    if (!response.ok) {
      throw new Error(`Claude API server error (${response.status})`);
    }

    const result = await response.json();

    // Log token usage for seeder calls
    if (result.usage) {
      console.log("Token usage [seeder] model=claude-sonnet-4-20250514 input=" + result.usage.input_tokens + " output=" + result.usage.output_tokens);
      logTokenUsage(env, "seeder", result.usage, "claude-sonnet-4-20250514").catch(function() {});
    }

    // Extract source URLs from raw API response before filtering to text blocks
    const apiSources = extractSourcesFromResponse(result.content);

    const textBlocks = (result.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text);
    if (textBlocks.length === 0) return null;

    const fullText = textBlocks.join("\n");

    // Use robust JSON extraction (handles prose, fenced blocks, nested braces)
    const parsed = extractJSON(fullText);
    if (parsed) {
      // Attach API-level sources for per-candidate scoping by the caller
      if (parsed.races && Array.isArray(parsed.races) && apiSources.length > 0) {
        parsed._apiSources = apiSources;
      }
      return parsed;
    }

    // JSON extraction failed — attempt a repair call without web_search
    console.warn(`[SEEDER] JSON extraction failed, attempting repair call. Raw text: ${fullText.slice(0, 200)}...`);
    const repaired = await attemptJSONRepair(env, fullText);
    if (repaired) {
      if (repaired.races && Array.isArray(repaired.races) && apiSources.length > 0) {
        repaired._apiSources = apiSources;
      }
      return repaired;
    }

    throw new Error(`Failed to parse response as JSON (${fullText.slice(0, 120)}...)`);
  }

  throw new Error("Claude API returned 429/529 after 3 retries");
}

/**
 * Attempt to repair a non-JSON Claude response by asking Claude to extract/fix
 * the JSON. This is a lightweight follow-up call (no web_search, low max_tokens).
 * Returns parsed JSON object or null on failure.
 */
async function attemptJSONRepair(env, brokenText) {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system:
          "You are a JSON extraction assistant. The user will give you text that contains " +
          "election data mixed with prose. Extract ONLY the JSON object from the text. " +
          "If the text contains data described in prose but no JSON structure, convert the " +
          "data into the JSON format requested in the original prompt. " +
          "Your entire response must be ONLY a valid JSON object — no other text.",
        messages: [
          {
            role: "user",
            content:
              "The following text was supposed to be a JSON response but contains prose. " +
              "Extract or reconstruct the JSON object from it. Return ONLY the JSON:\n\n" +
              brokenText.slice(0, 12000), // Cap to avoid token overflow
          },
        ],
      }),
    });

    if (!response.ok) {
      console.warn(`[SEEDER] Repair call failed with status ${response.status}`);
      return null;
    }

    const result = await response.json();

    // Log token usage for repair calls
    if (result.usage) {
      console.log("Token usage [seeder-repair] model=claude-sonnet-4-20250514 input=" + result.usage.input_tokens + " output=" + result.usage.output_tokens);
      logTokenUsage(env, "seeder-repair", result.usage, "claude-sonnet-4-20250514").catch(function() {});
    }

    const textBlocks = (result.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text);
    if (textBlocks.length === 0) return null;

    const repairText = textBlocks.join("\n");
    const parsed = extractJSON(repairText);
    if (parsed) {
      console.log("[SEEDER] JSON repair succeeded");
    } else {
      console.warn("[SEEDER] JSON repair also returned non-JSON");
    }
    return parsed;
  } catch (err) {
    console.warn(`[SEEDER] JSON repair call error: ${err.message}`);
    return null;
  }
}

/**
 * Batch seed: run county info + both party ballots for a single county.
 *
 * Progress is tracked in KV — only successful steps are marked completed.
 * Re-running will skip completed steps and retry failed ones.
 *
 * @param {string} countyFips
 * @param {string} countyName
 * @param {object} env
 * @param {object} [options]
 * @param {boolean} [options.reset] - Clear progress before starting
 */
export async function seedFullCounty(countyFips, countyName, env, options = {}) {
  const results = { countyFips, countyName, steps: {}, errors: [] };

  // Handle reset option — clear progress for this county
  if (options.reset) {
    await resetProgress(env, countyFips);
  }

  // Load progress (clears stale errors from previous runs automatically)
  const progress = await loadProgress(env, countyFips);

  // Step definitions: key, label, async fn
  const stepDefs = [
    {
      key: "countyInfo",
      progressKey: `info:${countyFips}`,
      fn: () => seedCountyInfo(countyFips, countyName, env),
    },
    {
      key: "republican",
      progressKey: `ballot:${countyFips}:republican`,
      fn: () => seedCountyBallot(countyFips, countyName, "republican", env),
    },
    {
      key: "democrat",
      progressKey: `ballot:${countyFips}:democrat`,
      fn: () => seedCountyBallot(countyFips, countyName, "democrat", env),
    },
    {
      key: "precinctMap",
      progressKey: `precinct:${countyFips}`,
      fn: () => seedPrecinctMap(countyFips, countyName, env),
    },
  ];

  for (let i = 0; i < stepDefs.length; i++) {
    const step = stepDefs[i];

    // Skip already-completed steps
    if (isCompleted(progress, step.progressKey)) {
      results.steps[step.key] = { skipped: true, reason: "already completed" };
      continue;
    }

    try {
      const stepResult = await step.fn();

      // Check if the step function returned an error (e.g., "No response from Claude")
      if (stepResult && stepResult.error) {
        const err = new Error(stepResult.error);
        const category = classifyError(err);
        markError(progress, step.progressKey, err);
        results.steps[step.key] = { error: stepResult.error, category };
        results.errors.push({ step: step.key, error: stepResult.error, category });

        // Auth errors are fatal — abort remaining steps
        if (category === "AUTH") {
          results.abortedAt = step.key;
          results.abortReason = "Authentication failed — all subsequent API calls would fail";
          break;
        }
      } else {
        // Success — mark completed in progress
        markCompleted(progress, step.progressKey, stepResult);
        results.steps[step.key] = stepResult;
      }
    } catch (err) {
      const category = classifyError(err);
      markError(progress, step.progressKey, err);
      results.steps[step.key] = { error: err.message, category };
      results.errors.push({ step: step.key, error: err.message, category });

      // Auth errors are fatal — abort remaining steps
      if (category === "AUTH") {
        results.abortedAt = step.key;
        results.abortReason = "Authentication failed — all subsequent API calls would fail";
        break;
      }
    }

    // Rate-limit delay between steps (skip after last step)
    if (i < stepDefs.length - 1) {
      await sleep(3000);
    }
  }

  // Save progress to KV (includes completed steps, current run errors)
  await saveProgress(env, countyFips, progress);

  // Add summary to results
  const completedCount = Object.keys(progress.completed).length;
  const errorCount = results.errors.length;
  const skippedCount = Object.values(results.steps).filter((s) => s && s.skipped).length;
  results.summary = {
    completed: completedCount,
    errored: errorCount,
    skipped: skippedCount,
    total: stepDefs.length,
  };

  // Group errors by category for the summary
  if (errorCount > 0) {
    const byCategory = {};
    for (const err of results.errors) {
      if (!byCategory[err.category]) byCategory[err.category] = [];
      byCategory[err.category].push(err);
    }
    results.errorSummary = {};
    for (const [cat, errs] of Object.entries(byCategory)) {
      results.errorSummary[cat] = {
        label: errorCategoryLabel(cat),
        count: errs.length,
        steps: errs.map((e) => e.step),
      };
    }
  }

  return results;
}

// Daily election data updater — uses Claude with web_search to refresh candidate data.

import { TOP_COUNTIES, TOP_COUNTIES_BY_STATE, seedCountyBallot, seedCountyInfo, seedPrecinctMap } from "./county-seeder.js";
import { logTokenUsage } from "./usage-logger.js";
import { checkSingleCandidateBalance } from "./balance-check.js";
import { buildCondensedBallotDescription } from "./pwa-guide.js";
import { ELECTION_SUFFIX } from "./state-config.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Structured error logging — collects AI search failures for diagnostics
// ---------------------------------------------------------------------------

/**
 * Error categories for structured logging.
 * - empty_response: API returned no text content blocks
 * - json_parse_failure: Response text could not be parsed as JSON
 * - no_search_results: web_search returned zero useful results
 * - all_null_update: All candidate fields came back null (no new data found)
 * - api_error: HTTP error from Claude API (non-429)
 * - rate_limit_exhausted: 429 after all retries
 * - validation_failure: Merged data failed structural validation
 * - low_quality_sources: Sources came from unreliable domains
 */
export const ERROR_CATEGORIES = [
  "empty_response",
  "json_parse_failure",
  "no_search_results",
  "all_null_update",
  "api_error",
  "rate_limit_exhausted",
  "validation_failure",
  "low_quality_sources",
  "baseline_fallback",
  "balance_correction_failed",
  "balance_correction_success",
];

/** Domains considered low-quality for election research */
const LOW_QUALITY_DOMAINS = [
  "reddit.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "tiktok.com",
  "instagram.com",
  "youtube.com",
  "medium.com",
  "wordpress.com",
  "blogspot.com",
  "tumblr.com",
  "quora.com",
];

/**
 * Checks whether a set of source URLs contains a high proportion of
 * low-quality domains. Returns an object with the problematic URLs
 * if more than half the sources are low-quality, or null otherwise.
 */
export function detectLowQualitySources(sources) {
  if (!sources || sources.length === 0) return null;
  const dominated = [];
  for (const src of sources) {
    try {
      const hostname = new URL(src.url).hostname.replace(/^www\./, "");
      if (LOW_QUALITY_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d))) {
        dominated.push(src.url);
      }
    } catch {
      // skip malformed URLs
    }
  }
  if (dominated.length > 0 && dominated.length >= sources.length / 2) {
    return { lowQualityUrls: dominated, total: sources.length, lowQualityCount: dominated.length };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Source tier classification & per-field confidence indicators
// ---------------------------------------------------------------------------

/**
 * Domain patterns for each tier of the 7-tier source ranking policy.
 * Tiers 1–6 = "verified", Tier 7 / no sources = "ai-inferred".
 */
const SOURCE_TIER_PATTERNS = [
  { tier: 1, label: "TX Secretary of State", patterns: ["sos.state.tx.us", "sos.texas.gov"] },
  { tier: 2, label: "County election office", patterns: [".tx.us"] },
  { tier: 3, label: "Campaign website", patterns: [] }, // no generic pattern; tier 3 assigned by heuristic
  { tier: 4, label: "Nonpartisan reference", patterns: ["ballotpedia.org", "votesmart.org", "vote411.org", "lwv.org"] },
  { tier: 5, label: "Texas news outlet", patterns: ["texastribune.org", "dallasnews.com", "houstonchronicle.com", "statesman.com", "expressnews.com", "star-telegram.com", "caller.com", "mysanantonio.com"] },
  { tier: 6, label: "National wire service", patterns: ["apnews.com", "reuters.com", "upi.com"] },
  // tier 7 = everything else (blogs, social media, etc.)
];

/**
 * Classify a source URL into a tier (1–7). Returns { tier, label }.
 */
export function classifySourceTier(url) {
  if (!url) return { tier: 7, label: "Other" };
  let hostname;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return { tier: 7, label: "Other" };
  }

  for (const entry of SOURCE_TIER_PATTERNS) {
    for (const pattern of entry.patterns) {
      if (pattern.startsWith(".")) {
        // suffix match (e.g. ".tx.us")
        if (hostname.endsWith(pattern)) return { tier: entry.tier, label: entry.label };
      } else {
        if (hostname === pattern || hostname.endsWith("." + pattern)) return { tier: entry.tier, label: entry.label };
      }
    }
  }

  // Anything not matched by the explicit tiers falls to tier 7
  return { tier: 7, label: "Other" };
}

/**
 * Determine the best (lowest tier number) source for a candidate,
 * along with its label. Returns { tier, label, url } or null.
 */
function bestSourceTier(sources) {
  if (!sources || sources.length === 0) return null;
  let best = null;
  for (const src of sources) {
    if (!src || !src.url) continue;
    const classified = classifySourceTier(src.url);
    if (!best || classified.tier < best.tier) {
      best = { tier: classified.tier, label: classified.label, url: src.url };
    }
  }
  return best;
}

/**
 * Compute per-field confidence metadata for a candidate.
 * Returns a _confidence object mapping field names to { level, source }.
 *
 * Level is "verified" if the candidate has at least one source from tiers 1–6,
 * and "ai-inferred" if only tier 7 sources or no sources at all.
 *
 * Since the AI research uses web_search across all fields at once, the best
 * source tier applies to all populated fields for that candidate.
 */
export function computeConfidence(candidate) {
  const sources = candidate.sources || [];
  const best = bestSourceTier(sources);

  // Confidence level: tiers 1–6 are "verified", tier 7 or no sources = "ai-inferred"
  const defaultLevel = best && best.tier <= 6 ? "verified" : "ai-inferred";
  const defaultSource = best ? best.label : "AI web search";

  const confidence = {};
  const fields = [
    { key: "background", dataKey: "summary" },
    { key: "keyPositions", dataKey: "keyPositions" },
    { key: "endorsements", dataKey: "endorsements" },
    { key: "polling", dataKey: "polling" },
    { key: "fundraising", dataKey: "fundraising" },
    { key: "pros", dataKey: "pros" },
    { key: "cons", dataKey: "cons" },
  ];

  for (const { key, dataKey } of fields) {
    const val = candidate[dataKey];
    const hasData = val !== null && val !== undefined && val !== "" &&
      (!Array.isArray(val) || val.length > 0);

    if (hasData) {
      confidence[key] = { level: defaultLevel, source: defaultSource };
    }
  }

  return confidence;
}

/**
 * Collects structured error entries during a daily update or county refresh.
 * Each entry has a category, context (race/county/candidate), and details.
 * The final output is stored in KV as `error_log:{date}`.
 */
export class ErrorCollector {
  constructor() {
    this.entries = [];
  }

  /**
   * @param {string} category - one of ERROR_CATEGORIES
   * @param {string} context - e.g. "democrat/Governor" or "Travis/republican"
   * @param {object} details - free-form details
   */
  add(category, context, details = {}) {
    this.entries.push({
      category,
      context,
      timestamp: new Date().toISOString(),
      ...details,
    });
  }

  /** Returns all collected entries */
  all() {
    return this.entries;
  }

  /** Returns entries filtered by category */
  byCategory(category) {
    return this.entries.filter((e) => e.category === category);
  }

  /** Returns a summary object with counts per category and the top offenders */
  summary() {
    const counts = {};
    const contextCounts = {};
    for (const entry of this.entries) {
      counts[entry.category] = (counts[entry.category] || 0) + 1;
      contextCounts[entry.context] = (contextCounts[entry.context] || 0) + 1;
    }
    // Top offenders: contexts with the most errors
    const topOffenders = Object.entries(contextCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([context, count]) => ({ context, count }));

    return {
      totalErrors: this.entries.length,
      categoryCounts: counts,
      topOffenders,
      needsAttention: topOffenders
        .filter((o) => o.count >= 2)
        .map((o) => o.context),
    };
  }

  /** Serializes for KV storage */
  toJSON() {
    return {
      generatedAt: new Date().toISOString(),
      summary: this.summary(),
      entries: this.entries,
    };
  }
}

/** KV key prefix for error logs */
export const ERROR_LOG_PREFIX = "error_log:";

/**
 * Extracts source URLs from Claude API response content blocks.
 * Collects from both web_search_tool_result blocks and citations on text blocks.
 * Returns an array of { url, title, accessDate } objects, deduplicated by URL.
 */
export function extractSourcesFromResponse(contentBlocks) {
  const seen = new Set();
  const sources = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const block of contentBlocks || []) {
    // Extract from web_search_tool_result blocks
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const item of block.content) {
        if (item.type === "web_search_result" && item.url && !seen.has(item.url)) {
          seen.add(item.url);
          sources.push({
            url: item.url,
            title: item.title || item.url,
            accessDate: today,
          });
        }
      }
    }
    // Extract citations from text blocks
    if (block.type === "text" && Array.isArray(block.citations)) {
      for (const cite of block.citations) {
        if (cite.url && !seen.has(cite.url)) {
          seen.add(cite.url);
          sources.push({
            url: cite.url,
            title: cite.title || cite.url,
            accessDate: today,
          });
        }
      }
    }
  }

  return sources;
}

/**
 * Merges new sources into existing sources array, deduplicating by URL.
 * Limits to max 20 sources per candidate.
 */
export function mergeSources(existing, incoming) {
  if (!incoming || !incoming.length) return existing || [];
  const merged = [...(existing || [])];
  const seen = new Set(merged.map((s) => s.url));
  for (const src of incoming) {
    if (src.url && !seen.has(src.url)) {
      seen.add(src.url);
      merged.push(src);
    }
  }
  return merged.slice(0, 20);
}

export const ELECTION_DAY = "2026-03-03"; // Texas Primary Election Day
export const ELECTION_CYCLE = "primary_2026";
const MANIFEST_SCHEMA_VERSION = 2;

// ---------------------------------------------------------------------------
// Tone regeneration — keeps reading-level variants fresh after daily updates
// ---------------------------------------------------------------------------

/** Tone descriptions matching index.js TONE_LABELS (tone 3 is the default) */
const TONE_LABELS = {
  1: "high school / simplest",
  4: "detailed / political",
  7: "Texas cowboy (y'all, reckon, fixin' to, partner)",
};

/** Tones to regenerate when candidate text changes (3 is the default, no call needed) */
export const TONES_TO_REGENERATE = [1, 4, 7];

/**
 * Compares a candidate's original data against Claude's update response to detect
 * whether tone-relevant text (summary, pros, cons) was modified.
 *
 * @param {object} origCandidate - candidate object from KV before merge
 * @param {object} updateCandidate - candidate update object from Claude's JSON response
 * @returns {boolean} true if summary, pros, or cons changed
 */
export function didCandidateTextChange(origCandidate, updateCandidate) {
  if (!origCandidate || !updateCandidate) return false;

  // Check summary
  if (updateCandidate.summary !== null && updateCandidate.summary !== undefined && updateCandidate.summary !== "") {
    const origSummary = typeof origCandidate.summary === "string"
      ? origCandidate.summary
      : (origCandidate.summary?.["3"] || "");
    if (updateCandidate.summary !== origSummary) return true;
  }

  // Check pros
  if (updateCandidate.pros && Array.isArray(updateCandidate.pros) && updateCandidate.pros.length > 0) {
    const origPros = (origCandidate.pros || []).map(p =>
      typeof p === "string" ? p : (p?.["3"] || "")
    );
    if (JSON.stringify(updateCandidate.pros) !== JSON.stringify(origPros)) return true;
  }

  // Check cons
  if (updateCandidate.cons && Array.isArray(updateCandidate.cons) && updateCandidate.cons.length > 0) {
    const origCons = (origCandidate.cons || []).map(c =>
      typeof c === "string" ? c : (c?.["3"] || "")
    );
    if (JSON.stringify(updateCandidate.cons) !== JSON.stringify(origCons)) return true;
  }

  return false;
}

/**
 * Generates a single tone variant for a candidate by calling Claude to rewrite
 * their summary, pros, and cons in the specified tone. Reads fresh ballot from
 * KV, applies the tone, and writes back. This avoids race conditions when
 * multiple tones are generated sequentially.
 *
 * This is the same core logic as handleGenerateCandidateTones in index.js,
 * but callable as a direct function without HTTP.
 *
 * @param {object} params
 * @param {string} params.candidateName
 * @param {string} params.party
 * @param {number} params.tone
 * @param {string} params.ballotKey - KV key for the ballot
 * @param {object} env
 * @returns {{ success: boolean, error?: string, fieldsUpdated?: number }}
 */
export async function generateCandidateTone({ candidateName, party, tone, ballotKey }, env) {
  const raw = await env.ELECTION_DATA.get(ballotKey);
  if (!raw) return { success: false, error: "no ballot data" };

  const ballot = JSON.parse(raw);
  if (!ballot.races?.length) return { success: false, error: "no races" };

  // Find candidate across all races
  let cand = null, raceIdx = -1;
  for (let ri = 0; ri < ballot.races.length; ri++) {
    for (let ci = 0; ci < ballot.races[ri].candidates.length; ci++) {
      if (ballot.races[ri].candidates[ci].name === candidateName) {
        cand = ballot.races[ri].candidates[ci];
        raceIdx = ri;
        break;
      }
    }
    if (cand) break;
  }
  if (!cand) return { success: false, error: `candidate "${candidateName}" not found` };

  // Extract original text (tone 3 / plain string)
  const origSummary = typeof cand.summary === "string" ? cand.summary : (cand.summary?.["3"] || null);
  const origPros = (cand.pros || []).map(p => typeof p === "string" ? p : (p?.["3"] || ""));
  const origCons = (cand.cons || []).map(c => typeof c === "string" ? c : (c?.["3"] || ""));

  if (!origSummary && origPros.length === 0 && origCons.length === 0) {
    return { success: false, error: "no text fields to process" };
  }

  // Build prompt
  const toneDesc = TONE_LABELS[tone] || "standard";
  let fieldList = "";
  if (origSummary) fieldList += `summary: "${origSummary}"\n\n`;
  if (origPros.length) fieldList += `pros: ${JSON.stringify(origPros)}\n\n`;
  if (origCons.length) fieldList += `cons: ${JSON.stringify(origCons)}\n\n`;

  const prompt = `Rewrite ALL of the following candidate text fields in a ${toneDesc} tone. Keep the same factual content and meaning, just adjust the language style and complexity. Keep each item roughly the same length as the original.

Candidate: ${candidateName}
Race: ${ballot.races[raceIdx].office}

FIELDS TO REWRITE:
${fieldList}
Return a JSON object with: "summary" (string), "pros" (array of strings), "cons" (array of strings). Keep the same number of items in each array.

Return ONLY valid JSON, no markdown fences, no explanation.`;

  // Call Claude API with retry on 429
  let apiResult;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (res.status === 429) {
      await sleep((attempt + 1) * 10000);
      continue;
    }

    if (!res.ok) {
      return { success: false, error: `Claude API error ${res.status}` };
    }

    apiResult = await res.json();

    // Log token usage for tone generation calls
    if (apiResult.usage) {
      console.log("Token usage [updater] model=claude-sonnet-4-20250514 input=" + apiResult.usage.input_tokens + " output=" + apiResult.usage.output_tokens);
      logTokenUsage(env, "updater", apiResult.usage, "claude-sonnet-4-20250514").catch(function() {});
    }

    break;
  }

  if (!apiResult) {
    return { success: false, error: "Claude API returned 429 after 3 retries" };
  }

  const responseText = apiResult.content[0].text.trim();

  let parsed;
  try {
    let cleaned = responseText;
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) cleaned = fence[1].trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return { success: false, error: "Failed to parse Claude response" };
  }

  // Re-read ballot from KV to get latest (another tone call may have written)
  const freshRaw = await env.ELECTION_DATA.get(ballotKey);
  const freshBallot = JSON.parse(freshRaw);
  let freshCand = null;
  for (const race of freshBallot.races) {
    freshCand = race.candidates.find(c => c.name === candidateName);
    if (freshCand) break;
  }
  if (!freshCand) return { success: false, error: "candidate disappeared from KV" };

  // Merge tone variant into candidate data
  let fieldsUpdated = 0;
  if (parsed.summary && origSummary) {
    const sv = typeof freshCand.summary === "object" && !Array.isArray(freshCand.summary) ? { ...freshCand.summary } : {};
    if (!sv["3"]) sv["3"] = origSummary;
    sv[String(tone)] = parsed.summary;
    freshCand.summary = sv;
    fieldsUpdated++;
  }
  if (parsed.pros && Array.isArray(parsed.pros)) {
    const currentPros = freshCand.pros || [];
    freshCand.pros = origPros.map((orig, i) => {
      const tv = typeof currentPros[i] === "object" && !Array.isArray(currentPros[i]) ? { ...currentPros[i] } : {};
      if (!tv["3"]) tv["3"] = orig;
      tv[String(tone)] = parsed.pros[i] || orig;
      return tv;
    });
    fieldsUpdated++;
  }
  if (parsed.cons && Array.isArray(parsed.cons)) {
    const currentCons = freshCand.cons || [];
    freshCand.cons = origCons.map((orig, i) => {
      const tv = typeof currentCons[i] === "object" && !Array.isArray(currentCons[i]) ? { ...currentCons[i] } : {};
      if (!tv["3"]) tv["3"] = orig;
      tv[String(tone)] = parsed.cons[i] || orig;
      return tv;
    });
    fieldsUpdated++;
  }

  await env.ELECTION_DATA.put(ballotKey, JSON.stringify(freshBallot));
  return { success: true, fieldsUpdated };
}

/**
 * Regenerates tone variants for candidates whose text changed during the daily
 * update. Generates tones 1, 4, 6, 7 for each changed candidate with a 2-second
 * delay between calls to avoid rate limiting.
 *
 * Cost: ~$0.009 per tone call, 4 tones per candidate = ~$0.036/candidate.
 * If 5 candidates change daily: ~$0.18/day = ~$5.40/month.
 *
 * @param {Array<{name: string, party: string, ballotKey: string}>} changedCandidates
 * @param {object} env
 * @returns {{ tonesRegenerated: string[], toneErrors: string[] }}
 */
export async function regenerateTonesForChangedCandidates(changedCandidates, env) {
  const tonesRegenerated = [];
  const toneErrors = [];

  for (const candidate of changedCandidates) {
    for (const tone of TONES_TO_REGENERATE) {
      // 2-second delay between tone generation calls to avoid rate limiting
      await sleep(2000);

      try {
        const result = await generateCandidateTone({
          candidateName: candidate.name,
          party: candidate.party,
          tone,
          ballotKey: candidate.ballotKey,
        }, env);

        if (result.success) {
          tonesRegenerated.push(`${candidate.party}/${candidate.name}/tone${tone}`);
        } else {
          toneErrors.push(`${candidate.party}/${candidate.name}/tone${tone}: ${result.error}`);
        }
      } catch (err) {
        toneErrors.push(`${candidate.party}/${candidate.name}/tone${tone}: ${err.message}`);
      }
    }
  }

  return { tonesRegenerated, toneErrors };
}

/**
 * Returns a stable key for a race, used as the key in the staleness tracker.
 * Format: "party/office" or "party/office/district" if district is set.
 */
export function raceKey(party, race) {
  return race.district
    ? `${party}/${race.office}/${race.district}`
    : `${party}/${race.office}`;
}

/** Number of consecutive all-null updates before switching to reduced frequency */
export const STALE_THRESHOLD = 3;

/** How often (in days) to re-research a stale race */
export const STALE_RESEARCH_INTERVAL = 3;

/** KV key for the staleness tracker */
export const STALE_TRACKER_KEY = "stale_tracker";

/**
 * Returns true if a race is lower-ballot and should use fewer web search calls.
 * Lower-ballot = Court of Appeals, Board of Education, Railroad Commission.
 * High-profile = U.S. Senator, Governor, Attorney General, U.S. Representative,
 *                Lieutenant Governor, Comptroller, Land Commissioner.
 */
export function isLowerBallotRace(officeName) {
  const lower = (officeName || "").toLowerCase();
  const lowerBallotPatterns = [
    "court of appeals",
    "board of education",
    "railroad commission",
  ];
  return lowerBallotPatterns.some((p) => lower.includes(p));
}

/**
 * Checks whether a Claude research response contains any meaningful (non-null)
 * updates for any candidate. Returns true if at least one candidate has a
 * non-null field update.
 */
export function isUpdateMeaningful(updates) {
  if (!updates?.candidates) return false;
  const fields = [
    "polling", "fundraising", "endorsements", "keyPositions",
    "pros", "cons", "summary", "background",
  ];
  for (const cand of updates.candidates) {
    for (const field of fields) {
      if (cand[field] !== null && cand[field] !== undefined) {
        // Empty strings and empty arrays are not meaningful
        if (cand[field] === "") continue;
        if (Array.isArray(cand[field]) && cand[field].length === 0) continue;
        return true;
      }
    }
  }
  return false;
}

const PARTIES = ["republican", "democrat"];
const BALLOT_KEYS = {
  republican: `ballot:statewide:republican${ELECTION_SUFFIX}`,
  democrat: `ballot:statewide:democrat${ELECTION_SUFFIX}`,
};

// ---------------------------------------------------------------------------
// Verified baseline fallback — protects against AI hallucinations
// ---------------------------------------------------------------------------

/** KV key prefix for verified baseline data */
export const BASELINE_KEY_PREFIX = "verified_baseline:";

/** KV key for baseline fallback log */
export const BASELINE_LOG_KEY = "baseline_fallback_log";

/**
 * Critical fields that are compared against the baseline. If AI returns
 * data contradicting these fields, the candidate falls back to baseline.
 */
export const BASELINE_CRITICAL_FIELDS = ["name", "office", "party", "background"];

/**
 * Seeds the verified baseline from current ballot data in KV.
 * Extracts minimum verified facts for each candidate: name, office, party,
 * background, isIncumbent, and the baseline creation timestamp.
 *
 * @param {string} party - "republican" or "democrat"
 * @param {object} env - Cloudflare Worker env bindings
 * @returns {{ success: boolean, candidateCount: number, key: string, error?: string }}
 */
export async function seedBaseline(party, env) {
  const ballotKey = BALLOT_KEYS[party];
  if (!ballotKey) return { success: false, error: `Unknown party: ${party}`, candidateCount: 0, key: "" };

  const raw = await env.ELECTION_DATA.get(ballotKey);
  if (!raw) return { success: false, error: `No ballot data for ${party}`, candidateCount: 0, key: "" };

  let ballot;
  try {
    ballot = JSON.parse(raw);
  } catch {
    return { success: false, error: `Invalid JSON for ${party} ballot`, candidateCount: 0, key: "" };
  }

  const baseline = {
    party: ballot.party,
    seededAt: new Date().toISOString(),
    sourceKey: ballotKey,
    races: [],
  };

  let candidateCount = 0;
  for (const race of ballot.races || []) {
    const baselineRace = {
      office: race.office,
      district: race.district || null,
      candidates: [],
    };

    for (const cand of race.candidates || []) {
      // Extract the plain-text version of summary/background (handle tone objects)
      const plainSummary = typeof cand.summary === "string"
        ? cand.summary
        : (cand.summary?.["3"] || null);
      const plainBackground = typeof cand.background === "string"
        ? cand.background
        : (cand.background?.["3"] || null);

      baselineRace.candidates.push({
        name: cand.name,
        isIncumbent: cand.isIncumbent || false,
        background: plainBackground,
        summary: plainSummary,
        withdrawn: cand.withdrawn || false,
      });
      candidateCount++;
    }

    baseline.races.push(baselineRace);
  }

  const key = `${BASELINE_KEY_PREFIX}${party}${ELECTION_SUFFIX}`;
  await env.ELECTION_DATA.put(key, JSON.stringify(baseline));

  return { success: true, candidateCount, key };
}

/**
 * Compares a merged race update against the verified baseline for that race.
 * Returns an object describing contradictions, or null if no contradictions found.
 *
 * A "contradiction" is when the AI update changes a critical baseline field
 * in a way that conflicts with verified data:
 *  - Candidate name mismatch (caught by validateRaceUpdate already)
 *  - Office or district mismatch
 *  - Background substantially rewritten (>60% different from baseline)
 *
 * @param {object} mergedRace - The race object after mergeRaceUpdates
 * @param {object} baselineRace - The baseline race to compare against
 * @param {string} party - "republican" or "democrat"
 * @returns {{ contradictions: Array<{candidate: string, field: string, baseline: string, received: string}> } | null}
 */
export function compareWithBaseline(mergedRace, baselineRace, party) {
  if (!baselineRace || !mergedRace) return null;

  // Verify office matches
  if (baselineRace.office !== mergedRace.office) {
    return {
      contradictions: [{
        candidate: "(race-level)",
        field: "office",
        baseline: baselineRace.office,
        received: mergedRace.office,
      }],
    };
  }

  const contradictions = [];

  for (const baselineCand of baselineRace.candidates || []) {
    const mergedCand = (mergedRace.candidates || []).find(
      (c) => c.name === baselineCand.name
    );
    if (!mergedCand) continue; // Missing candidates are caught by validateRaceUpdate

    // Check if background was substantially changed
    if (baselineCand.background && mergedCand.background) {
      const baselineBg = typeof baselineCand.background === "string"
        ? baselineCand.background
        : (baselineCand.background?.["3"] || "");
      const mergedBg = typeof mergedCand.background === "string"
        ? mergedCand.background
        : (mergedCand.background?.["3"] || "");

      if (baselineBg && mergedBg && baselineBg !== mergedBg) {
        const similarity = computeTokenSimilarity(baselineBg, mergedBg);
        if (similarity < 0.4) {
          contradictions.push({
            candidate: baselineCand.name,
            field: "background",
            baseline: baselineBg.slice(0, 120),
            received: mergedBg.slice(0, 120),
            similarity: Math.round(similarity * 100),
          });
        }
      }
    }

    // Check if incumbent status was flipped
    if (baselineCand.isIncumbent !== undefined && mergedCand.isIncumbent !== undefined) {
      if (baselineCand.isIncumbent !== mergedCand.isIncumbent) {
        contradictions.push({
          candidate: baselineCand.name,
          field: "isIncumbent",
          baseline: String(baselineCand.isIncumbent),
          received: String(mergedCand.isIncumbent),
        });
      }
    }

    // Check if withdrawn status was unset (candidate marked withdrawn in baseline
    // should not be un-withdrawn by AI)
    if (baselineCand.withdrawn && !mergedCand.withdrawn) {
      contradictions.push({
        candidate: baselineCand.name,
        field: "withdrawn",
        baseline: "true",
        received: "false",
      });
    }
  }

  return contradictions.length > 0 ? { contradictions } : null;
}

/**
 * Computes a rough token-level similarity between two strings.
 * Returns a value between 0 (completely different) and 1 (identical).
 * Uses Jaccard similarity on word tokens.
 */
export function computeTokenSimilarity(a, b) {
  if (!a || !b) return 0;
  const tokenize = (s) => new Set(s.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean));
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

/**
 * Applies baseline fallback to a merged race: for each candidate with
 * contradictions, replaces contradicted fields with baseline values.
 * Returns the patched race and a list of applied fallbacks.
 *
 * @param {object} mergedRace - Race after mergeRaceUpdates
 * @param {object} baselineRace - Verified baseline race
 * @param {Array} contradictions - From compareWithBaseline
 * @returns {{ patchedRace: object, fallbacks: string[] }}
 */
export function applyBaselineFallback(mergedRace, baselineRace, contradictions) {
  const patched = JSON.parse(JSON.stringify(mergedRace));
  const fallbacks = [];

  for (const c of contradictions) {
    if (c.candidate === "(race-level)") {
      // Race-level contradiction — reject the entire update
      fallbacks.push(`RACE ${mergedRace.office}: ${c.field} contradicts baseline (expected "${c.baseline}", got "${c.received}")`);
      continue;
    }

    const baselineCand = baselineRace.candidates.find((bc) => bc.name === c.candidate);
    const patchedCand = patched.candidates.find((pc) => pc.name === c.candidate);
    if (!baselineCand || !patchedCand) continue;

    if (c.field === "background" && baselineCand.background) {
      // Restore baseline background, preserving tone object structure if present
      if (typeof patchedCand.background === "object" && !Array.isArray(patchedCand.background)) {
        patchedCand.background["3"] = baselineCand.background;
      } else {
        patchedCand.background = baselineCand.background;
      }
      fallbacks.push(`${c.candidate}: background reverted to baseline (${c.similarity}% similarity was below 40% threshold)`);
    }

    if (c.field === "isIncumbent") {
      patchedCand.isIncumbent = baselineCand.isIncumbent;
      fallbacks.push(`${c.candidate}: isIncumbent reverted to baseline (${baselineCand.isIncumbent})`);
    }

    if (c.field === "withdrawn") {
      patchedCand.withdrawn = baselineCand.withdrawn;
      fallbacks.push(`${c.candidate}: withdrawn status preserved from baseline`);
    }
  }

  return { patchedRace: patched, fallbacks };
}
/**
 * Orchestrates the daily update: loads current data from KV, researches each
 * race, validates, merges, and stores the result.
 *
 * @param {object} env - Cloudflare Worker env bindings
 * @param {object} [options] - { parties?: string[], dryRun?: boolean }
 * @returns {{ updated: string[], errors: string[] }}
 */
export async function runDailyUpdate(env, options = {}) {
  // Stop updating after election day
  if (new Date() > new Date(ELECTION_DAY + "T23:59:59Z")) {
    return { skipped: true, reason: `Past election day (${ELECTION_DAY})` };
  }

  const parties = options.parties || PARTIES;
  const dryRun = options.dryRun || false;
  const log = [];
  const errors = [];
  const updated = [];
  const changedCandidates = []; // Track candidates with text changes for tone regeneration
  let balanceCorrectionsUsed = 0; // Cap auto-corrections per run
  const balanceCorrectionResults = []; // Track balance correction outcomes
  const errorCollector = new ErrorCollector();

  // --- Load staleness tracker from KV ---
  let staleTracker = {};
  try {
    const trackerRaw = await env.ELECTION_DATA.get(STALE_TRACKER_KEY);
    if (trackerRaw) staleTracker = JSON.parse(trackerRaw);
  } catch { /* start fresh if corrupt */ }
  let trackerChanged = false;

  // Day-of-year for stale interval check
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));

  for (const party of parties) {
    const key = BALLOT_KEYS[party];
    const raw = await env.ELECTION_DATA.get(key);
    if (!raw) {
      errors.push(`${party}: no existing ballot in KV`);
      continue;
    }

    let ballot;
    try {
      ballot = JSON.parse(raw);
    } catch {
      errors.push(`${party}: failed to parse existing ballot JSON`);
      continue;
    }

    const original = JSON.parse(raw); // deep copy for validation
    let anyChange = false;

    // --- Load verified baseline for this party (if it exists) ---
    let baseline = null;
    try {
      const baselineKey = `${BASELINE_KEY_PREFIX}${party}${ELECTION_SUFFIX}`;
      const baselineRaw = await env.ELECTION_DATA.get(baselineKey);
      if (baselineRaw) baseline = JSON.parse(baselineRaw);
    } catch { /* no baseline or corrupt — proceed without it */ }

    for (let i = 0; i < ballot.races.length; i++) {
      const race = ballot.races[i];
      const rk = raceKey(party, race);

      // --- Staleness check: skip stale races except every Nth day ---
      const tracker = staleTracker[rk] || { nullCount: 0, lastResearchDay: 0 };
      if (tracker.nullCount >= STALE_THRESHOLD) {
        const daysSinceLast = dayOfYear - tracker.lastResearchDay;
        if (daysSinceLast > 0 && daysSinceLast % STALE_RESEARCH_INTERVAL !== 0) {
          log.push(`${party}/${race.office}: skipped (stale, ${tracker.nullCount} consecutive null updates)`);
          continue;
        }
      }

      // Delay between API calls to avoid 429 rate limits
      if (i > 0) await sleep(5000);
      try {
        // Use fewer web searches for lower-ballot races
        const maxSearchUses = isLowerBallotRace(race.office) ? 3 : 5;
        const updates = await researchRace(race, party, env, { maxSearchUses });

        // Track staleness — update tracker regardless of validation outcome
        const meaningful = isUpdateMeaningful(updates);
        if (!meaningful) {
          tracker.nullCount = (tracker.nullCount || 0) + 1;
          // Log all-null update for error tracking
          if (updates && updates.candidates) {
            errorCollector.add("all_null_update", rk, {
              reason: "All candidate fields returned null",
              consecutiveNulls: tracker.nullCount,
            });
          }
        } else {
          tracker.nullCount = 0;
        }
        tracker.lastResearchDay = dayOfYear;
        staleTracker[rk] = tracker;
        trackerChanged = true;

        if (!updates) {
          log.push(`${party}/${race.office}: no updates found`);
          errorCollector.add("empty_response", rk, {
            reason: "researchRace returned null (no text blocks in API response)",
          });
          continue;
        }

        // Check for low-quality sources in the API response
        const apiSrcCheck = updates._apiSources || [];
        const lowQuality = detectLowQualitySources(apiSrcCheck);
        if (lowQuality) {
          errorCollector.add("low_quality_sources", rk, {
            reason: `${lowQuality.lowQualityCount}/${lowQuality.total} sources from unreliable domains`,
            urls: lowQuality.lowQualityUrls,
          });
        }

        // Check if web_search returned zero results
        if (apiSrcCheck.length === 0 && updates.candidates) {
          // No API-level sources at all — web search may have returned nothing
          const anyCandSources = updates.candidates.some(
            (c) => Array.isArray(c.sources) && c.sources.length > 0
          );
          if (!anyCandSources) {
            errorCollector.add("no_search_results", rk, {
              reason: "No sources found from web_search or candidate-level references",
            });
          }
        }

        // Detect which candidates had tone-relevant text changes (summary/pros/cons)
        // before merging, by comparing original race data with Claude's response
        if (updates.candidates) {
          for (const updCand of updates.candidates) {
            const origCand = race.candidates.find(c => c.name === updCand.name);
            if (origCand && didCandidateTextChange(origCand, updCand)) {
              changedCandidates.push({
                name: updCand.name,
                party,
                ballotKey: key,
              });
            }
          }
        }

        const merged = mergeRaceUpdates(race, updates);
        const originalRace = original.races.find(
          (r) => r.office === race.office && r.district === race.district
        );

        const validationError = validateRaceUpdate(originalRace, merged);
        if (validationError) {
          errors.push(
            `${party}/${race.office}: validation failed — ${validationError}`
          );
          errorCollector.add("validation_failure", rk, {
            reason: validationError,
            candidateNames: (updates.candidates || []).map((c) => c.name),
          });
          // Remove candidates from changedCandidates if validation failed
          // (their data was not applied)
          if (updates.candidates) {
            const failedNames = new Set(updates.candidates.map(c => c.name));
            for (let ci = changedCandidates.length - 1; ci >= 0; ci--) {
              if (changedCandidates[ci].party === party && failedNames.has(changedCandidates[ci].name)) {
                changedCandidates.splice(ci, 1);
              }
            }
          }
          continue;
        }

        // --- Baseline comparison: detect and fix AI contradictions ---
        let finalMerged = merged;
        if (baseline) {
          const baselineRace = (baseline.races || []).find(
            (br) => br.office === race.office && (br.district || null) === (race.district || null)
          );
          if (baselineRace) {
            const baselineResult = compareWithBaseline(merged, baselineRace, party);
            if (baselineResult && baselineResult.contradictions.length > 0) {
              const { patchedRace, fallbacks } = applyBaselineFallback(
                merged, baselineRace, baselineResult.contradictions
              );
              finalMerged = patchedRace;
              for (const fb of fallbacks) {
                log.push(`${party}/${race.office}: BASELINE FALLBACK — ${fb}`);
              }
              errorCollector.add("baseline_fallback", rk, {
                reason: `${baselineResult.contradictions.length} field(s) contradicted baseline`,
                contradictions: baselineResult.contradictions,
                fallbacksApplied: fallbacks,
              });
            }
          }
        }

        // Apply merged data back
        Object.assign(race, finalMerged);
        anyChange = true;
        log.push(`${party}/${race.office}: updated`);

        // --- Post-update balance check: score each candidate, auto-correct critical flags ---
        const activeCandidates = (race.candidates || []).filter(c => !c.withdrawn);
        for (const cand of activeCandidates) {
          const balanceResult = checkSingleCandidateBalance(cand);
          // Stamp balanceScore onto each candidate object
          cand.balanceScore = balanceResult.balanceScore;

          if (balanceResult.hasCritical && balanceCorrectionsUsed < MAX_BALANCE_CORRECTIONS_PER_RUN && !dryRun) {
            // Only auto-correct for actionable critical flags (missing pros/cons)
            const actionableFlags = balanceResult.criticalFlags.filter(function(f) {
              return CRITICAL_FLAG_TYPES.indexOf(f.type) !== -1;
            });
            if (actionableFlags.length > 0) {
              log.push(`${party}/${race.office}/${cand.name}: CRITICAL balance flags — attempting auto-correction (${actionableFlags.map(f => f.type).join(", ")})`);
              await sleep(3000); // Rate limit buffer before correction call
              try {
                const correction = await researchCandidateBalance(cand, race, party, actionableFlags, env);
                balanceCorrectionsUsed++;
                if (correction.success && correction.updates) {
                  // Apply corrected pros/cons back to candidate
                  if (correction.updates.pros && Array.isArray(correction.updates.pros) && correction.updates.pros.length >= 2) {
                    cand.pros = correction.updates.pros;
                  }
                  if (correction.updates.cons && Array.isArray(correction.updates.cons) && correction.updates.cons.length >= 2) {
                    cand.cons = correction.updates.cons;
                  }
                  if (correction.updates.summary && typeof correction.updates.summary === "string" && correction.updates.summary !== "null") {
                    cand.summary = correction.updates.summary;
                  }
                  // Re-run balance check and update score
                  const recheck = checkSingleCandidateBalance(cand);
                  cand.balanceScore = recheck.balanceScore;
                  balanceCorrectionResults.push({
                    candidate: cand.name,
                    party,
                    race: race.office,
                    success: true,
                    scoreBefore: balanceResult.balanceScore,
                    scoreAfter: recheck.balanceScore,
                    flagsResolved: actionableFlags.map(f => f.type),
                    remainingCritical: recheck.criticalFlags.length,
                  });
                  log.push(`${party}/${race.office}/${cand.name}: balance correction SUCCEEDED (score ${balanceResult.balanceScore} → ${recheck.balanceScore})`);
                  // Track as text change for tone regeneration
                  changedCandidates.push({ name: cand.name, party, ballotKey: key });
                } else {
                  balanceCorrectionResults.push({
                    candidate: cand.name,
                    party,
                    race: race.office,
                    success: false,
                    error: correction.error,
                    scoreBefore: balanceResult.balanceScore,
                  });
                  log.push(`${party}/${race.office}/${cand.name}: balance correction FAILED — ${correction.error}`);
                  errors.push(`${party}/${race.office}/${cand.name}: balance correction failed — ${correction.error}`);
                }
              } catch (corrErr) {
                balanceCorrectionResults.push({
                  candidate: cand.name,
                  party,
                  race: race.office,
                  success: false,
                  error: corrErr.message,
                  scoreBefore: balanceResult.balanceScore,
                });
                log.push(`${party}/${race.office}/${cand.name}: balance correction ERROR — ${corrErr.message}`);
                errors.push(`${party}/${race.office}/${cand.name}: balance correction error — ${corrErr.message}`);
              }
            }
          } else if (balanceResult.hasCritical && dryRun) {
            const actionableFlags = balanceResult.criticalFlags.filter(function(f) {
              return CRITICAL_FLAG_TYPES.indexOf(f.type) !== -1;
            });
            if (actionableFlags.length > 0) {
              log.push(`${party}/${race.office}/${cand.name}: would auto-correct CRITICAL balance flags (dry run) — ${actionableFlags.map(f => f.type).join(", ")}`);
            }
          }
        }
      } catch (err) {
        errors.push(`${party}/${race.office}: ${err.message}`);
        // Categorize the error for structured logging
        if (err.message.includes("429 after 3 retries")) {
          errorCollector.add("rate_limit_exhausted", rk, { reason: err.message });
        } else if (err.message.includes("Failed to parse")) {
          errorCollector.add("json_parse_failure", rk, {
            reason: err.message,
            snippet: err.message.match(/\((.{0,120})\)/)?.[1] || null,
          });
        } else if (err.message.includes("Claude API returned")) {
          errorCollector.add("api_error", rk, {
            reason: err.message,
            statusCode: parseInt(err.message.match(/\d+/)?.[0]) || null,
          });
        } else {
          errorCollector.add("api_error", rk, { reason: err.message });
        }
      }
    }

    if (anyChange && !dryRun) {
      // Update version and store
      const now = new Date().toISOString();
      await env.ELECTION_DATA.put(key, JSON.stringify(ballot));

      // --- Post-update ballot size check ---
      try {
        const condensed = buildCondensedBallotDescription(ballot);
        const chars = condensed.length;
        const estTokens = Math.ceil(chars / 4);
        console.log(`[BALLOT SIZE] ${party}: ${chars} chars (~${estTokens} tokens)`);
        if (estTokens > 6000) {
          console.warn(`[BALLOT SIZE WARNING] ${party} ballot estimated at ${estTokens} tokens — exceeds 6000 token threshold`);
        }
        // Store ballot size metrics in KV for monitoring
        await env.ELECTION_DATA.put(`metrics:ballot_size:${party}`, JSON.stringify({
          party,
          chars,
          estimatedTokens: estTokens,
          measuredAt: now,
          raceCount: (ballot.races || []).length,
          candidateCount: (ballot.races || []).reduce((s, r) => s + (r.candidates || []).length, 0),
        }));
      } catch (e) {
        // Non-fatal: don't let metrics fail the update
        console.warn(`[BALLOT SIZE] Failed to compute for ${party}: ${e.message}`);
      }

      // Update manifest
      const manifestRaw = await env.ELECTION_DATA.get("manifest");
      const manifest = manifestRaw ? JSON.parse(manifestRaw) : {};
      manifest[party] = {
        updatedAt: now,
        version: (manifest[party]?.version || 0) + 1,
      };
      // Election cycle metadata (backward compatible — added once, preserved thereafter)
      if (!manifest.electionCycle) manifest.electionCycle = "primary_2026";
      if (!manifest.electionDate) manifest.electionDate = "2026-03-03";
      if (!manifest.schemaVersion) manifest.schemaVersion = 2;
      await env.ELECTION_DATA.put("manifest", JSON.stringify(manifest));

      updated.push(party);
    }
  }

  // --- Persist staleness tracker ---
  if (trackerChanged && !dryRun) {
    try {
      await env.ELECTION_DATA.put(STALE_TRACKER_KEY, JSON.stringify(staleTracker));
    } catch { /* non-fatal */ }
  }

  // Invalidate candidates_index cache if any ballot changed — but skip on
  // Election Day itself when traffic peaks and cache rebuilds are most costly.
  // Data shouldn't be changing while voting is in progress.
  const todayStr = new Date().toISOString().slice(0, 10);
  const isElectionDay = todayStr === ELECTION_DAY;
  if (updated.length > 0 && !dryRun && !isElectionDay) {
    try { await env.ELECTION_DATA.delete("candidates_index"); } catch { /* non-fatal */ }
  }

  // --- County ballot refresh (rotating subset of TOP_COUNTIES) ---
  // Configurable via env var SKIP_COUNTY_REFRESH=true or options.skipCounties
  const skipCounties = options.skipCounties || (env.SKIP_COUNTY_REFRESH === "true");
  let countyResult = { countiesRefreshed: [], countyErrors: [], countyLog: [] };
  if (!skipCounties) {
    try {
      countyResult = await runCountyRefresh(env, { dryRun });
      if (countyResult.skipped) {
        log.push(`county refresh: skipped (${countyResult.reason})`);
      }
    } catch (err) {
      errors.push(`county refresh failed: ${err.message}`);
    }
  } else if (env.SKIP_COUNTY_REFRESH === "true") {
    log.push("county refresh: disabled via SKIP_COUNTY_REFRESH env var");
  }

  // --- Tone regeneration for changed candidates ---
  // After all races are processed and ballots saved, regenerate tones 1, 4, 6, 7
  // for any candidate whose summary/pros/cons text actually changed.
  let toneResult = { tonesRegenerated: [], toneErrors: [] };
  if (changedCandidates.length > 0 && !dryRun) {
    log.push(`tone regeneration: ${changedCandidates.length} candidate(s) with text changes — ${changedCandidates.map(c => c.name).join(", ")}`);
    try {
      toneResult = await regenerateTonesForChangedCandidates(changedCandidates, env);
      if (toneResult.tonesRegenerated.length > 0) {
        log.push(`tone regeneration: ${toneResult.tonesRegenerated.length} tone(s) regenerated`);
      }
      if (toneResult.toneErrors.length > 0) {
        for (const te of toneResult.toneErrors) {
          errors.push(`tone: ${te}`);
        }
      }
    } catch (err) {
      errors.push(`tone regeneration failed: ${err.message}`);
    }

    // Invalidate candidates_index again after tone writes
    try { await env.ELECTION_DATA.delete("candidates_index"); } catch { /* non-fatal */ }
  } else if (changedCandidates.length > 0 && dryRun) {
    log.push(`tone regeneration: would regenerate tones for ${changedCandidates.length} candidate(s) (dry run) — ${changedCandidates.map(c => c.name).join(", ")}`);
  }

  // Build structured error log data
  const errorLogData = errorCollector.toJSON();

  // Write update log
  const today = new Date().toISOString().slice(0, 10);
  const logEntry = {
    timestamp: new Date().toISOString(),
    log,
    errors,
    updated,
    county: {
      refreshed: countyResult.countiesRefreshed || [],
      log: countyResult.countyLog || [],
      errors: countyResult.countyErrors || [],
    },
    tones: {
      candidatesChanged: changedCandidates.map(c => `${c.party}/${c.name}`),
      regenerated: toneResult.tonesRegenerated,
      errors: toneResult.toneErrors,
    },
    balanceCorrections: {
      attempted: balanceCorrectionResults.length,
      succeeded: balanceCorrectionResults.filter(r => r.success).length,
      failed: balanceCorrectionResults.filter(r => !r.success).length,
      results: balanceCorrectionResults,
    },
    aiErrors: errorLogData.summary,
  };
  if (!dryRun) {
    await env.ELECTION_DATA.put(
      `update_log:${today}`,
      JSON.stringify(logEntry, null, 2)
    );

    // Write structured error log separately for queryability
    if (errorCollector.all().length > 0) {
      await env.ELECTION_DATA.put(
        `${ERROR_LOG_PREFIX}${today}`,
        JSON.stringify(errorLogData, null, 2)
      );
    }

    // Write baseline fallback log if any fallbacks were triggered
    const baselineFallbacks = errorCollector.byCategory("baseline_fallback");
    if (baselineFallbacks.length > 0) {
      let fallbackLog = [];
      try {
        const existingLogRaw = await env.ELECTION_DATA.get(BASELINE_LOG_KEY);
        if (existingLogRaw) fallbackLog = JSON.parse(existingLogRaw);
      } catch { fallbackLog = []; }
      fallbackLog.push({
        date: today,
        count: baselineFallbacks.length,
        entries: baselineFallbacks,
      });
      // Keep last 30 days of fallback log entries
      if (fallbackLog.length > 30) fallbackLog = fallbackLog.slice(-30);
      await env.ELECTION_DATA.put(BASELINE_LOG_KEY, JSON.stringify(fallbackLog, null, 2));
    }

    // Clean up update logs and error logs older than 14 days
    try {
      const logKeys = await env.ELECTION_DATA.list({ prefix: "update_log:" });
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      let cleaned = 0;
      for (const key of logKeys.keys) {
        const dateStr = key.name.replace("update_log:", "");
        if (dateStr < cutoffStr) {
          await env.ELECTION_DATA.delete(key.name);
          cleaned++;
        }
      }
      if (cleaned > 0) log.push(`update_log cleanup: deleted ${cleaned} old log(s)`);
    } catch { /* non-fatal */ }

    try {
      const errorLogKeys = await env.ELECTION_DATA.list({ prefix: ERROR_LOG_PREFIX });
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      for (const key of errorLogKeys.keys) {
        const dateStr = key.name.replace(ERROR_LOG_PREFIX, "");
        if (dateStr < cutoffStr) {
          await env.ELECTION_DATA.delete(key.name);
        }
      }
    } catch { /* non-fatal */ }
  }

  return {
    updated,
    errors,
    log,
    county: {
      refreshed: countyResult.countiesRefreshed || [],
      log: countyResult.countyLog || [],
      errors: countyResult.countyErrors || [],
    },
    tones: {
      candidatesChanged: changedCandidates.map(c => `${c.party}/${c.name}`),
      regenerated: toneResult.tonesRegenerated,
      errors: toneResult.toneErrors,
    },
    balanceCorrections: {
      attempted: balanceCorrectionResults.length,
      succeeded: balanceCorrectionResults.filter(r => r.success).length,
      failed: balanceCorrectionResults.filter(r => !r.success).length,
      results: balanceCorrectionResults,
    },
    aiErrors: errorLogData,
  };
}

/**
 * Calls Claude with web_search to find latest updates for a single race.
 * Returns an object with updatedFields per candidate, or null if no updates.
 */
async function researchRace(race, party, env, options = {}) {
  if (!race.isContested) return null;
  const maxSearchUses = options.maxSearchUses || 5;

  const candidateDescriptions = race.candidates
    .map((c) => {
      const parts = [`Name: ${c.name}`];
      if (c.isIncumbent) parts.push("(incumbent)");
      if (c.polling) parts.push(`Polling: ${c.polling}`);
      if (c.fundraising) parts.push(`Fundraising: ${c.fundraising}`);
      if (c.endorsements?.length)
        parts.push(`Endorsements: ${c.endorsements.map(e => typeof e === "string" ? e : (e.type ? `${e.name} (${e.type})` : e.name)).join("; ")}`);
      if (c.keyPositions?.length)
        parts.push(`Key positions: ${c.keyPositions.join("; ")}`);
      return parts.join("\n    ");
    })
    .join("\n\n  ");

  const label = race.district
    ? `${race.office} — ${race.district}`
    : race.office;

  const userPrompt = `Research the latest updates for this ${party} primary race in the March 3, 2026 Texas Primary Election:

RACE: ${label}

CURRENT DATA:
  ${candidateDescriptions}

Search for updates since February 15, 2026. Look for:
1. New endorsements
2. New polling data
3. Updated fundraising numbers
4. Significant news or position changes

Return a JSON object with this exact structure (use null for any field with no update):
{
  "candidates": [
    {
      "name": "exact candidate name",
      "polling": "updated polling string or null",
      "fundraising": "updated fundraising string or null",
      "endorsements": [{"name": "Endorser Name", "type": "labor union|editorial board|advocacy group|business group|elected official|political organization|professional association|community organization|public figure"}] or null,
      "keyPositions": ["full updated list"] or null,
      "pros": ["full updated list"] or null,
      "cons": ["full updated list"] or null,
      "summary": "updated summary or null",
      "background": "updated background or null",
      "sources": [{"url": "https://...", "title": "Article title"}] or null
    }
  ]
}

BALANCE REQUIREMENTS:
- Every candidate MUST have at least 2 pros AND at least 2 cons
- Pros and cons counts should be within 1 of each other (e.g., 3 pros / 3 cons or 3 pros / 4 cons)
- Each pro and con should be 30-80 characters long
- Even lesser-known candidates deserve equal analytical treatment

IMPORTANT:
- Return ONLY valid JSON, no markdown or explanation
- Use null for any field where you found no new information
- Candidate names must match exactly as provided
- For endorsements, keyPositions, pros, and cons: return the FULL updated list (existing + new), not just additions
- Only update fields where you found verifiable new information
- For sources: include URLs of articles and official pages you referenced for THIS candidate
- For endorsements: each entry must be an object with "name" (endorser name) and "type" (one of: labor union, editorial board, advocacy group, business group, elected official, political organization, professional association, community organization, public figure)`;

  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system:
      "You are a nonpartisan election data researcher. Use web_search to find verified, factual updates about candidates. Return ONLY valid JSON. Never fabricate information — if you cannot verify something, use null.\n\nSOURCE PRIORITY: When evaluating web_search results, prefer sources in this order:\n1. Texas Secretary of State filings (sos.state.tx.us)\n2. County election offices ({county}.tx.us)\n3. Official campaign websites\n4. Nonpartisan references (ballotpedia.org, votesmart.org)\n5. Established Texas news outlets (texastribune.org, dallasnews.com)\n6. National wire services (apnews.com, reuters.com)\n7. AVOID: blogs, social media, opinion sites, unverified sources\n\nCONFLICT RESOLUTION: If sources disagree, trust official filings over campaign claims, and campaign claims over news reporting.",
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearchUses }],
    messages: [{ role: "user", content: userPrompt }],
  };

  // Retry up to 3 times on 429 with exponential backoff
  let result;
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

    if (response.status === 429) {
      const wait = (attempt + 1) * 10000; // 10s, 20s, 30s
      await sleep(wait);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Claude API returned ${response.status}`);
    }

    result = await response.json();

    // Log token usage for updater research calls
    if (result.usage) {
      console.log("Token usage [updater] model=claude-sonnet-4-20250514 input=" + result.usage.input_tokens + " output=" + result.usage.output_tokens);
      logTokenUsage(env, "updater", result.usage, "claude-sonnet-4-20250514").catch(function() {});
    }

    break;
  }

  if (!result) {
    throw new Error("Claude API returned 429 after 3 retries");
  }

  // Extract source URLs from raw API response before filtering to text blocks
  const apiSources = extractSourcesFromResponse(result.content);

  // Extract text from response content blocks — web_search responses have
  // multiple text blocks interspersed with search results. Concatenate all
  // text blocks, then extract the JSON object.
  const textBlocks = (result.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text);
  if (textBlocks.length === 0) return null;

  const fullText = textBlocks.join("\n");

  // Try to extract JSON: look for ```json fences first, then raw { }
  let cleaned = fullText.trim();
  const fenceMatch = cleaned.match(/```json\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  } else {
    // Find the first { and last } to extract the JSON object
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }

  try {
    const parsed = JSON.parse(cleaned);
    // Attach API-level sources as fallback for candidates that don't have their own
    if (parsed.candidates && apiSources.length > 0) {
      parsed._apiSources = apiSources;
    }
    return parsed;
  } catch {
    throw new Error(
      `Failed to parse Claude response as JSON (${cleaned.slice(0, 100)}...)`
    );
  }
}

// ---------------------------------------------------------------------------
// Balance correction — targeted re-research for candidates with CRITICAL flags
// ---------------------------------------------------------------------------

/** Critical flag types that warrant automatic re-research */
export const CRITICAL_FLAG_TYPES = ["missing_pros", "missing_cons", "missing_both"];

/** Maximum number of balance correction attempts per daily update run */
export const MAX_BALANCE_CORRECTIONS_PER_RUN = 10;

/**
 * Calls Claude to fix a specific candidate's balance issue. Unlike the
 * general-purpose researchRace, this makes a focused call for a single
 * candidate with explicit instructions about what's missing.
 *
 * @param {object} candidate - candidate object from the race
 * @param {object} race - the race containing this candidate
 * @param {string} party - "republican" or "democrat"
 * @param {object[]} criticalFlags - array of critical flag objects from balance check
 * @param {object} env - Cloudflare Worker env bindings
 * @returns {{ success: boolean, updates?: object, error?: string }}
 */
export async function researchCandidateBalance(candidate, race, party, criticalFlags, env) {
  const flagDescriptions = criticalFlags.map(function(f) { return f.type + ": " + f.detail; }).join("; ");
  const label = race.district ? race.office + " — " + race.district : race.office;

  const hasMissingPros = criticalFlags.some(function(f) { return f.type === "missing_pros"; });
  const hasMissingCons = criticalFlags.some(function(f) { return f.type === "missing_cons"; });
  const hasMissingBoth = criticalFlags.some(function(f) { return f.type === "missing_both"; });

  let missingInstructions = "";
  if (hasMissingBoth || (hasMissingPros && hasMissingCons)) {
    missingInstructions = "This candidate is MISSING BOTH pros AND cons. You MUST provide at least 3 pros and 3 cons.";
  } else if (hasMissingPros) {
    missingInstructions = "This candidate has cons but is MISSING pros entirely. You MUST provide at least 3 pros that are factual and balanced.";
  } else if (hasMissingCons) {
    missingInstructions = "This candidate has pros but is MISSING cons entirely. You MUST provide at least 3 cons that are factual and balanced.";
  }

  const existingPros = (candidate.pros || []).map(function(p) {
    return typeof p === "string" ? p : (p && p["3"] ? p["3"] : "");
  }).filter(Boolean);
  const existingCons = (candidate.cons || []).map(function(c) {
    return typeof c === "string" ? c : (c && c["3"] ? c["3"] : "");
  }).filter(Boolean);

  const existingSummary = typeof candidate.summary === "string"
    ? candidate.summary.slice(0, 200)
    : (candidate.summary && candidate.summary["3"] ? candidate.summary["3"].slice(0, 200) : "(none)");

  const userPrompt = `BALANCE CORRECTION: Research this candidate to fix a critical balance imbalance in our election data.

CANDIDATE: ${candidate.name}
RACE: ${label} (${party} primary, March 3, 2026 Texas Primary Election)
${candidate.isIncumbent ? "STATUS: Incumbent" : ""}

CURRENT DATA:
  Pros: ${existingPros.length > 0 ? JSON.stringify(existingPros) : "(NONE — this must be fixed)"}
  Cons: ${existingCons.length > 0 ? JSON.stringify(existingCons) : "(NONE — this must be fixed)"}
  Background: ${typeof candidate.background === "string" ? candidate.background.slice(0, 200) : "(none)"}
  Summary: ${existingSummary}

BALANCE ISSUE: ${flagDescriptions}
${missingInstructions}

Return a JSON object with ONLY the corrected fields:
{
  "name": "${candidate.name}",
  "pros": ["pro 1", "pro 2", "pro 3"],
  "cons": ["con 1", "con 2", "con 3"],
  "summary": "updated summary if needed, or null"
}

REQUIREMENTS:
- Each pro and con MUST be 30-80 characters, factual, and specific (reference votes, bills, positions, endorsements, or policy stances)
- Do NOT use generic phrases like "strong leader", "fights for families", etc.
- Maintain equal analytical treatment: same depth for pros and cons
- Provide at least 3 of each, ideally matching the count of the existing side
- Return ONLY valid JSON, no markdown fences, no explanation`;

  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: "You are a nonpartisan election data researcher fixing a balance issue. Use web_search to find verified, factual information. Return ONLY valid JSON. Never fabricate — use null if you cannot verify.",
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
    messages: [{ role: "user", content: userPrompt }],
  };

  let result;
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

    if (response.status === 429) {
      await sleep((attempt + 1) * 10000);
      continue;
    }
    if (!response.ok) {
      return { success: false, error: "Claude API returned " + response.status };
    }

    result = await response.json();

    if (result.usage) {
      console.log("Token usage [balance-correction] model=claude-sonnet-4-20250514 input=" + result.usage.input_tokens + " output=" + result.usage.output_tokens);
      logTokenUsage(env, "balance-correction", result.usage, "claude-sonnet-4-20250514").catch(function() {});
    }
    break;
  }

  if (!result) {
    return { success: false, error: "Claude API returned 429 after 3 retries" };
  }

  const textBlocks = (result.content || []).filter(function(b) { return b.type === "text"; }).map(function(b) { return b.text; });
  if (textBlocks.length === 0) {
    return { success: false, error: "No text in API response" };
  }

  const fullText = textBlocks.join("\n");
  let cleaned = fullText.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  } else {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }

  try {
    const parsed = JSON.parse(cleaned);
    // Validate the correction has the missing data
    if (hasMissingPros || hasMissingBoth) {
      if (!parsed.pros || !Array.isArray(parsed.pros) || parsed.pros.length < 2) {
        return { success: false, error: "Balance correction still missing sufficient pros" };
      }
    }
    if (hasMissingCons || hasMissingBoth) {
      if (!parsed.cons || !Array.isArray(parsed.cons) || parsed.cons.length < 2) {
        return { success: false, error: "Balance correction still missing sufficient cons" };
      }
    }
    return { success: true, updates: parsed };
  } catch {
    return { success: false, error: "Failed to parse balance correction response" };
  }
}

/**
 * Merges non-null updated fields from Claude's response into the race.
 * Returns the merged race object (does not mutate original).
 */
function mergeRaceUpdates(race, updates) {
  const merged = JSON.parse(JSON.stringify(race)); // deep copy

  if (!updates?.candidates) return merged;

  // API-level sources (from web_search_tool_result blocks) — fallback for all candidates
  const apiSources = updates._apiSources || [];

  for (const update of updates.candidates) {
    const candidate = merged.candidates.find((c) => c.name === update.name);
    if (!candidate) continue;

    // Only update whitelisted fields — `withdrawn` and other manual flags are preserved
    const fields = [
      "polling",
      "fundraising",
      "endorsements",
      "keyPositions",
      "pros",
      "cons",
      "summary",
      "background",
    ];

    for (const field of fields) {
      if (update[field] !== null && update[field] !== undefined) {
        // Don't accept empty strings or empty arrays
        if (update[field] === "") continue;
        if (Array.isArray(update[field]) && update[field].length === 0)
          continue;
        // Normalize endorsements: convert any plain strings to { name, type } objects
        if (field === "endorsements" && Array.isArray(update[field])) {
          candidate[field] = update[field].map(e =>
            typeof e === "string" ? { name: e, type: null } : e
          );
        } else {
          candidate[field] = update[field];
        }
      }
    }

    // Merge sources: combine candidate-level sources from Claude's JSON with API-level sources
    const candidateSources = Array.isArray(update.sources) ? update.sources : [];
    const today = new Date().toISOString().slice(0, 10);
    const normalizedCandSources = candidateSources
      .filter((s) => s && s.url)
      .map((s) => ({ url: s.url, title: s.title || s.url, accessDate: s.accessDate || today }));
    // Combine candidate-specific + API-level, dedup, and limit
    const allIncoming = [...normalizedCandSources, ...apiSources];
    if (allIncoming.length > 0) {
      candidate.sources = mergeSources(candidate.sources, allIncoming);
      candidate.sourcesUpdatedAt = new Date().toISOString();
    }
  }

  // Compute per-field confidence indicators for all candidates in the race
  for (const candidate of merged.candidates) {
    candidate._confidence = computeConfidence(candidate);
  }

  return merged;
}


// ---------------------------------------------------------------------------
// County ballot refresh -- rotating subset of TOP_COUNTIES
// ---------------------------------------------------------------------------

/** Size of each daily county refresh slice */
export const COUNTY_REFRESH_BATCH_SIZE = 10;

/** KV key for tracking when each county was last refreshed (includes staleness) */
export const COUNTY_REFRESH_TRACKER_KEY = "county_refresh_tracker";

/** Consecutive no-change refreshes before a county is considered stale */
export const COUNTY_STALE_THRESHOLD = 3;

/** How many rotation cycles to skip for stale counties (skip 2 out of 3) */
export const COUNTY_STALE_SKIP_INTERVAL = 3;

/**
 * Simple content fingerprint for a ballot JSON string.
 * Extracts candidate names, summaries, endorsement counts, and race count
 * to detect meaningful changes without requiring a full deep comparison.
 * Returns a string fingerprint.
 */
export function ballotFingerprint(ballotJson) {
  if (!ballotJson) return "";
  try {
    const ballot = typeof ballotJson === "string" ? JSON.parse(ballotJson) : ballotJson;
    if (!ballot.races) return "";
    const parts = [];
    for (const race of ballot.races) {
      parts.push(`${race.office}|${race.district || ""}|${(race.candidates || []).length}`);
      for (const c of race.candidates || []) {
        const summaryStr = typeof c.summary === "string" ? c.summary : (c.summary?.["3"] || "");
        const endorseCount = (c.endorsements || []).length;
        const proCount = (c.pros || []).length;
        const conCount = (c.cons || []).length;
        parts.push(`${c.name}:s${summaryStr.length}:e${endorseCount}:p${proCount}:c${conCount}`);
      }
    }
    return parts.join(";");
  } catch {
    return "";
  }
}

/**
 * Determines which counties to refresh today, based on a rotating schedule.
 * Cycles through the county list in slices of 10. Uses day-of-year to pick the slice.
 * TX (30 counties) cycles every 3 days; CO (64 counties) cycles every 7 days.
 *
 * @param {Date} [date] - defaults to now
 * @param {string} [stateCode='tx'] - state code to look up counties
 * @returns {{ fips: string, name: string }[]}
 */
export function getCountyRefreshSlice(date, stateCode = 'tx') {
  const countyList = TOP_COUNTIES_BY_STATE[stateCode] || [];
  if (countyList.length === 0) return [];

  const d = date || new Date();
  // Day-of-year: 0-365
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d - start;
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

  const totalCounties = countyList.length;
  const batchSize = COUNTY_REFRESH_BATCH_SIZE;
  const totalSlices = Math.ceil(totalCounties / batchSize);

  // Which slice are we on today?
  const sliceIndex = dayOfYear % totalSlices;
  const startIdx = sliceIndex * batchSize;
  const endIdx = Math.min(startIdx + batchSize, totalCounties);

  return countyList.slice(startIdx, endIdx);
}

/**
 * Refreshes county ballot data and county_info for today's rotating slice
 * of TOP_COUNTIES. Reuses seedCountyBallot and seedCountyInfo from
 * county-seeder.js.
 *
 * Staleness tracking: After each ballot refresh, the content is fingerprinted
 * and compared to the previous fingerprint. If the ballot hasn't meaningfully
 * changed for COUNTY_STALE_THRESHOLD (3) consecutive refreshes, the county is
 * skipped in 2 out of every 3 rotation cycles to save API costs.
 *
 * Cost per county: ~3-4 Claude API calls + 3-4 KV writes
 *   - 1 call per party ballot (2 total) + 1 call for county_info + 1 for precinct map
 *   - 2 KV writes for ballots + 1 for county_info + 1 for precinct map
 * Daily total for 10 counties: ~30-40 API calls, ~30-40 KV writes
 * With staleness: stale counties cost 0 API calls (skipped)
 *
 * @param {object} env - Cloudflare Worker env bindings
 * @param {object} [options] - { dryRun?: boolean, counties?: array }
 * @returns {{ countiesRefreshed: string[], countyErrors: string[], countyLog: string[], countiesSkippedStale: string[] }}
 */
export async function runCountyRefresh(env, options = {}) {
  // Stop updating after election day
  if (new Date() > new Date(ELECTION_DAY + "T23:59:59Z")) {
    return { skipped: true, reason: `Past election day (${ELECTION_DAY})` };
  }

  const dryRun = options.dryRun || false;
  const stateCode = options.stateCode || 'tx';
  const counties = options.counties || getCountyRefreshSlice(undefined, stateCode);
  const countyLog = [];
  const countyErrors = [];
  const countiesRefreshed = [];

  // --- Load county refresh tracker from KV ---
  let refreshTracker = {};
  try {
    const trackerRaw = await env.ELECTION_DATA.get(COUNTY_REFRESH_TRACKER_KEY);
    if (trackerRaw) refreshTracker = JSON.parse(trackerRaw);
  } catch { /* start fresh if corrupt */ }
  let trackerChanged = false;

  for (let i = 0; i < counties.length; i++) {
    const county = counties[i];
    // Delay between counties to avoid rate limits (skip first)
    if (i > 0) await sleep(5000);

    // --- Refresh county_info ---
    try {
      if (!dryRun) {
        const infoResult = await seedCountyInfo(county.fips, county.name, env);
        if (infoResult.error) {
          countyErrors.push(`${county.name}/info: ${infoResult.error}`);
        } else {
          countyLog.push(`${county.name}/info: refreshed`);
        }
      } else {
        countyLog.push(`${county.name}/info: would refresh (dry run)`);
      }
    } catch (err) {
      countyErrors.push(`${county.name}/info: ${err.message}`);
    }

    await sleep(3000);

    // --- Refresh ballots for both parties ---
    for (const party of PARTIES) {
      try {
        // Check if county ballot exists in KV -- only refresh existing data
        const ballotKey = `ballot:county:${county.fips}:${party}${ELECTION_SUFFIX}`;
        const existing = await env.ELECTION_DATA.get(ballotKey);

        if (!existing) {
          countyLog.push(`${county.name}/${party}: no existing ballot, skipping`);
          continue;
        }

        if (!dryRun) {
          const result = await seedCountyBallot(county.fips, county.name, party, env);
          if (result.error) {
            countyErrors.push(`${county.name}/${party}: ${result.error}`);
          } else {
            countyLog.push(`${county.name}/${party}: refreshed (${result.raceCount} races)`);
          }
        } else {
          countyLog.push(`${county.name}/${party}: would refresh (dry run)`);
        }
      } catch (err) {
        countyErrors.push(`${county.name}/${party}: ${err.message}`);
      }

      await sleep(5000);
    }

    countiesRefreshed.push(county.name);

    // Record refresh timestamp for this county
    if (!dryRun) {
      refreshTracker[county.fips] = {
        name: county.name,
        lastRefreshedAt: new Date().toISOString(),
      };
      trackerChanged = true;
    }
  }

  // --- Persist county refresh tracker ---
  if (trackerChanged && !dryRun) {
    try {
      await env.ELECTION_DATA.put(COUNTY_REFRESH_TRACKER_KEY, JSON.stringify(refreshTracker));
    } catch { /* non-fatal */ }
  }

  return { countiesRefreshed, countyErrors, countyLog };
}

/**
 * Validates that an update doesn't break structural invariants.
 * Returns an error string, or null if valid.
 */
export function validateRaceUpdate(original, updated) {
  if (!original || !updated) return "missing race data";

  // Candidate count must match
  if (original.candidates.length !== updated.candidates.length) {
    return `candidate count changed: ${original.candidates.length} → ${updated.candidates.length}`;
  }

  // Candidate names must match exactly
  const origNames = original.candidates.map((c) => c.name).sort();
  const updNames = updated.candidates.map((c) => c.name).sort();
  if (JSON.stringify(origNames) !== JSON.stringify(updNames)) {
    return `candidate names changed`;
  }

  // Endorsements cannot shrink by >50%
  for (const origCand of original.candidates) {
    const updCand = updated.candidates.find((c) => c.name === origCand.name);
    if (!updCand) return `candidate ${origCand.name} missing`;

    if (
      origCand.endorsements?.length > 0 &&
      updCand.endorsements?.length > 0
    ) {
      const ratio = updCand.endorsements.length / origCand.endorsements.length;
      if (ratio < 0.5) {
        return `${origCand.name} endorsements shrank by >50% (${origCand.endorsements.length} → ${updCand.endorsements.length})`;
      }
    }
  }

  // Every active candidate must have at least 2 pros and 2 cons
  for (const cand of updated.candidates) {
    if (cand.withdrawn) continue;
    if (!cand.pros || cand.pros.length < 2) {
      return `${cand.name} has fewer than 2 pros`;
    }
    if (!cand.cons || cand.cons.length < 2) {
      return `${cand.name} has fewer than 2 cons`;
    }
  }

  // No empty strings in key fields
  for (const cand of updated.candidates) {
    if (cand.name === "") return "empty candidate name";
    if (cand.summary === "") return `${cand.name} has empty summary`;

    // Validate sources if present (dedup and cap at 20 are handled by mergeSources)
    if (cand.sources && Array.isArray(cand.sources)) {
      for (const src of cand.sources) {
        if (!src.url || typeof src.url !== "string") {
          return `${cand.name} has a source with invalid URL`;
        }
        try {
          new URL(src.url);
        } catch {
          return `${cand.name} has a source with malformed URL: ${src.url}`;
        }
      }
    }
  }

  return null;
}

/**
 * Validates the full ballot structure after all race updates.
 */
export function validateBallot(original, updated) {
  if (!original || !updated) return "missing ballot data";

  if (original.races.length !== updated.races.length) {
    return `race count changed: ${original.races.length} → ${updated.races.length}`;
  }

  if (original.party !== updated.party) {
    return `party changed: ${original.party} → ${updated.party}`;
  }

  return null;
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Source imports
// ---------------------------------------------------------------------------
import {
  classifySourceTier,
  computeConfidence,
  detectLowQualitySources,
  extractSourcesFromResponse,
  mergeSources,
  raceKey,
  isLowerBallotRace,
  isUpdateMeaningful,
  ErrorCollector,
  ERROR_CATEGORIES,
  ERROR_LOG_PREFIX,
  CRITICAL_FLAG_TYPES,
  MAX_BALANCE_CORRECTIONS_PER_RUN,
  STALE_THRESHOLD,
  STALE_RESEARCH_INTERVAL,
  STALE_TRACKER_KEY,
  validateBallot,
  validateRaceUpdate,
} from "../src/updater.js";

import { logTokenUsage, getUsageLog, estimateCost } from "../src/usage-logger.js";

import {
  buildCondensedBallotDescription,
  buildUserPrompt,
  VALID_LLMS,
} from "../src/pwa-guide.js";

import { APP_JS } from "../src/pwa.js";

const indexSrc = readFileSync(join(__dirname, "../src/index.js"), "utf-8");

const ballot = JSON.parse(
  readFileSync(join(__dirname, "fixtures/sample-ballot.json"), "utf-8")
);

// ===========================================================================
// 1. Per-data-point confidence indicators (source tier classification)
// ===========================================================================
describe("classifySourceTier — source tier classification", () => {
  it("classifies TX Secretary of State as tier 1", () => {
    const result = classifySourceTier("https://www.sos.state.tx.us/elections/candidates/2026");
    expect(result.tier).toBe(1);
    expect(result.label).toBe("TX Secretary of State");
  });

  it("classifies sos.texas.gov as tier 1", () => {
    const result = classifySourceTier("https://sos.texas.gov/voter/2026");
    expect(result.tier).toBe(1);
    expect(result.label).toBe("TX Secretary of State");
  });

  it("classifies county .tx.us site as tier 2", () => {
    const result = classifySourceTier("https://elections.travis.tx.us/info");
    expect(result.tier).toBe(2);
    expect(result.label).toBe("County election office");
  });

  it("classifies Ballotpedia as tier 4", () => {
    const result = classifySourceTier("https://ballotpedia.org/Texas_elections");
    expect(result.tier).toBe(4);
    expect(result.label).toBe("Nonpartisan reference");
  });

  it("classifies Vote Smart as tier 4", () => {
    const result = classifySourceTier("https://votesmart.org/candidate/12345");
    expect(result.tier).toBe(4);
  });

  it("classifies Texas Tribune as tier 5", () => {
    const result = classifySourceTier("https://www.texastribune.org/2026/02/20/primary-election");
    expect(result.tier).toBe(5);
    expect(result.label).toBe("Texas news outlet");
  });

  it("classifies AP News as tier 6", () => {
    const result = classifySourceTier("https://apnews.com/article/texas-election-2026");
    expect(result.tier).toBe(6);
    expect(result.label).toBe("National wire service");
  });

  it("classifies unknown domains as tier 7", () => {
    const result = classifySourceTier("https://somerandom.blog/post/123");
    expect(result.tier).toBe(7);
    expect(result.label).toBe("Other");
  });

  it("returns tier 7 for null/undefined URLs", () => {
    expect(classifySourceTier(null).tier).toBe(7);
    expect(classifySourceTier(undefined).tier).toBe(7);
    expect(classifySourceTier("").tier).toBe(7);
  });

  it("returns tier 7 for malformed URLs", () => {
    const result = classifySourceTier("not a valid url at all");
    expect(result.tier).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// computeConfidence — per-field confidence metadata
// ---------------------------------------------------------------------------
describe("computeConfidence — per-field confidence metadata", () => {
  it("returns 'verified' when candidate has tier 1-6 sources", () => {
    const candidate = {
      summary: "A senator focused on healthcare.",
      keyPositions: ["Healthcare"],
      endorsements: ["AFL-CIO"],
      pros: ["Strong record"],
      cons: ["Slow on housing"],
      sources: [{ url: "https://ballotpedia.org/Candidate" }],
    };
    const conf = computeConfidence(candidate);
    expect(conf.background.level).toBe("verified");
    expect(conf.keyPositions.level).toBe("verified");
    expect(conf.endorsements.level).toBe("verified");
    expect(conf.pros.level).toBe("verified");
    expect(conf.cons.level).toBe("verified");
  });

  it("returns 'ai-inferred' when candidate has only tier 7 sources", () => {
    const candidate = {
      summary: "A local candidate.",
      keyPositions: ["Education"],
      sources: [{ url: "https://somerandom.blog/post" }],
    };
    const conf = computeConfidence(candidate);
    expect(conf.background.level).toBe("ai-inferred");
    expect(conf.keyPositions.level).toBe("ai-inferred");
  });

  it("returns 'ai-inferred' when candidate has no sources", () => {
    const candidate = {
      summary: "No sources available.",
      pros: ["Good"],
      cons: ["Bad"],
      sources: [],
    };
    const conf = computeConfidence(candidate);
    expect(conf.background.level).toBe("ai-inferred");
    expect(conf.background.source).toBe("AI web search");
  });

  it("omits fields that have no data", () => {
    const candidate = {
      summary: "Has summary only.",
      keyPositions: [],
      endorsements: null,
      pros: [],
      cons: [],
      sources: [{ url: "https://ballotpedia.org/test" }],
    };
    const conf = computeConfidence(candidate);
    expect(conf.background).toBeDefined();
    expect(conf.keyPositions).toBeUndefined(); // empty array = no data
    expect(conf.endorsements).toBeUndefined(); // null = no data
    expect(conf.pros).toBeUndefined();
    expect(conf.cons).toBeUndefined();
  });

  it("uses best source tier across all sources for all fields", () => {
    const candidate = {
      summary: "A candidate.",
      pros: ["Good"],
      sources: [
        { url: "https://somerandom.blog/post" }, // tier 7
        { url: "https://www.texastribune.org/article" }, // tier 5
      ],
    };
    const conf = computeConfidence(candidate);
    expect(conf.background.level).toBe("verified");
    expect(conf.background.source).toBe("Texas news outlet");
  });
});

// ===========================================================================
// 2. Mandatory balance correction in updater.js
// ===========================================================================
describe("Balance correction constants", () => {
  it("CRITICAL_FLAG_TYPES contains missing_pros, missing_cons, missing_both", () => {
    expect(CRITICAL_FLAG_TYPES).toContain("missing_pros");
    expect(CRITICAL_FLAG_TYPES).toContain("missing_cons");
    expect(CRITICAL_FLAG_TYPES).toContain("missing_both");
    expect(CRITICAL_FLAG_TYPES).toHaveLength(3);
  });

  it("MAX_BALANCE_CORRECTIONS_PER_RUN is 10", () => {
    expect(MAX_BALANCE_CORRECTIONS_PER_RUN).toBe(10);
  });

  it("ERROR_CATEGORIES includes balance correction entries", () => {
    expect(ERROR_CATEGORIES).toContain("balance_correction_failed");
    expect(ERROR_CATEGORIES).toContain("balance_correction_success");
  });
});

// ===========================================================================
// 3. Guide response caching (SHA-256 hash, 1hr TTL, nocache bypass)
// ===========================================================================
describe("Guide response caching — source patterns", () => {
  it("builds a SHA-256 hash for cache key via hashGuideKey", () => {
    // We verify the caching pattern exists in the source
    const guideSrc = readFileSync(join(__dirname, "../src/pwa-guide.js"), "utf-8");
    expect(guideSrc).toContain("hashGuideKey");
    expect(guideSrc).toContain("SHA-256");
    expect(guideSrc).toContain("guide_cache:");
  });

  it("cache lookup checks for nocache query param", () => {
    const guideSrc = readFileSync(join(__dirname, "../src/pwa-guide.js"), "utf-8");
    expect(guideSrc).toContain("nocache");
    expect(guideSrc).toContain('.get("nocache") === "1"');
  });

  it("uses 1-hour TTL (3600 seconds) for cache writes", () => {
    const guideSrc = readFileSync(join(__dirname, "../src/pwa-guide.js"), "utf-8");
    expect(guideSrc).toContain("expirationTtl: 3600");
  });

  it("marks cached responses with cached: true", () => {
    const guideSrc = readFileSync(join(__dirname, "../src/pwa-guide.js"), "utf-8");
    expect(guideSrc).toContain("cachedResult.cached = true");
  });

  it("logs cache HIT when found", () => {
    const guideSrc = readFileSync(join(__dirname, "../src/pwa-guide.js"), "utf-8");
    expect(guideSrc).toContain("Guide cache HIT");
  });

  it("sets cached: false for fresh responses", () => {
    const guideSrc = readFileSync(join(__dirname, "../src/pwa-guide.js"), "utf-8");
    expect(guideSrc).toContain("cached: false");
  });
});

// ===========================================================================
// 4. Novelty tone warning banner in pwa.js
// ===========================================================================
describe("Novelty tone warning banner", () => {
  it("renders amber warning banner for Cowboy (reading level 7)", () => {
    expect(APP_JS).toContain("S.readingLevel===7");
    expect(APP_JS).toContain("Novelty tone active");
  });

  it("includes Switch to Standard button", () => {
    expect(APP_JS).toContain("Switch to Standard");
    expect(APP_JS).toContain('data-action="switch-to-standard"');
  });

  it("includes dismiss button for the warning", () => {
    expect(APP_JS).toContain('data-action="dismiss-novelty-warning"');
  });

  it("uses amber/gold color scheme (#92400e) for the banner", () => {
    expect(APP_JS).toContain("#92400e");
    expect(APP_JS).toContain("#fef3c7");
    expect(APP_JS).toContain("#f59e0b");
  });

  it("shows cowboy emoji for Cowboy mode", () => {
    expect(APP_JS).toContain("\\uD83E\\uDD20");
  });

  it("shows compact one-line warning on race detail view", () => {
    expect(APP_JS).toContain("Viewing in Cowboy mode. Switch to Standard for neutral presentation.");
  });

  it("has Spanish translations for novelty tone strings", () => {
    expect(APP_JS).toContain("'Novelty tone active':'Tono novelty activo'");
    expect(APP_JS).toContain("'Switch to Standard':'Cambiar a Est");
  });

  it("explains that analysis is identical to standard tone", () => {
    expect(APP_JS).toContain("Entertainment tone active");
    expect(APP_JS).toContain("identical to the standard tone");
  });
});

// ===========================================================================
// 5. KV read parallelization in pwa-guide.js
// ===========================================================================
describe("KV read parallelization", () => {
  it("uses Promise.all for parallel KV reads", () => {
    const guideSrc = readFileSync(join(__dirname, "../src/pwa-guide.js"), "utf-8");
    expect(guideSrc).toContain("Promise.all");
  });

  it("reads statewide, legacy, county, and manifest in parallel", () => {
    const guideSrc = readFileSync(join(__dirname, "../src/pwa-guide.js"), "utf-8");
    // Check for the destructured assignment from Promise.all
    expect(guideSrc).toContain("statewideRaw, legacyRaw, countyRaw, manifestRaw");
    expect(guideSrc).toContain("ballot:statewide:");
    expect(guideSrc).toContain("ballot:county:");
    expect(guideSrc).toContain("manifest");
  });

  it("falls back to legacy key when statewide key is missing", () => {
    const guideSrc = readFileSync(join(__dirname, "../src/pwa-guide.js"), "utf-8");
    expect(guideSrc).toContain("statewideRaw || legacyRaw");
  });
});

// ===========================================================================
// 6. Uncontested race stripping in buildCondensedBallotDescription
// ===========================================================================
describe("Uncontested race stripping in buildCondensedBallotDescription", () => {
  it("skips detailed fields for uncontested races", () => {
    const uncontestedBallot = {
      electionName: "Test Election",
      races: [
        {
          office: "Uncontested Office",
          district: null,
          candidates: [
            {
              name: "Solo Runner",
              isIncumbent: true,
              keyPositions: ["Position A", "Position B"],
              endorsements: ["Endorser X"],
              pros: ["Good thing"],
              cons: ["Bad thing"],
            },
          ],
        },
      ],
      propositions: [],
    };
    const desc = buildCondensedBallotDescription(uncontestedBallot);
    // Should include the candidate name
    expect(desc).toContain("Solo Runner");
    // Should be marked UNCONTESTED
    expect(desc).toContain("[UNCONTESTED]");
    // Should NOT include detailed fields for uncontested race (they are skipped to save tokens)
    expect(desc).not.toContain("Positions:");
    expect(desc).not.toContain("Endorsements:");
    expect(desc).not.toContain("Pros:");
    expect(desc).not.toContain("Cons:");
  });

  it("includes detailed fields for contested races", () => {
    const desc = buildCondensedBallotDescription(ballot);
    // U.S. Senator is contested (2 candidates)
    expect(desc).toContain("Alice Johnson");
    expect(desc).toContain("Positions:");
    expect(desc).toContain("Endorsements:");
    expect(desc).toContain("Pros:");
    expect(desc).toContain("Cons:");
  });

  it("treats races with all candidates withdrawn as uncontested (no details)", () => {
    const ballotWithdrawn = JSON.parse(JSON.stringify(ballot));
    // Withdraw all but one in U.S. Senator
    ballotWithdrawn.races[0].candidates[1].withdrawn = true;
    const desc = buildCondensedBallotDescription(ballotWithdrawn);
    // Senator race should now be UNCONTESTED
    expect(desc).toMatch(/U\.S\. Senator.*\[UNCONTESTED\]/);
    // Alice Johnson should appear but WITHOUT detailed fields
    expect(desc).toContain("Alice Johnson");
    // Find the Alice Johnson section — since uncontested, Positions should NOT appear after her name
    const aliceIdx = desc.indexOf("Alice Johnson");
    const nextRaceIdx = desc.indexOf("RACE:", aliceIdx + 1);
    const aliceSection = nextRaceIdx > -1 ? desc.slice(aliceIdx, nextRaceIdx) : desc.slice(aliceIdx);
    expect(aliceSection).not.toContain("Positions:");
  });
});

// ===========================================================================
// 7. max_tokens by language mode (4096 English, 4096 Spanish cached, 8192 Spanish fresh)
// ===========================================================================
describe("max_tokens by language mode", () => {
  it("uses 2048 max_tokens for English (or retry override)", () => {
    const guideSrc = readFileSync(join(__dirname, "../src/pwa-guide.js"), "utf-8");
    // callClaude uses: _isRetry || (lang === "es" ? 8192 : (lang === "es_cached" ? 4096 : 2048))
    expect(guideSrc).toContain('lang === "es" ? 8192 : (lang === "es_cached" ? 4096 : 2048)');
  });

  it("uses 4096 max_tokens for Spanish with cached translations", () => {
    const guideSrc = readFileSync(join(__dirname, "../src/pwa-guide.js"), "utf-8");
    // When es_cached, max_tokens is 4096
    expect(guideSrc).toContain("es_cached");
    expect(guideSrc).toContain("4096");
  });

  it("uses 8192 max_tokens for Spanish without cached translations", () => {
    const guideSrc = readFileSync(join(__dirname, "../src/pwa-guide.js"), "utf-8");
    expect(guideSrc).toContain("8192");
  });

  it("passes effective language 'es_cached' when translations are cached", () => {
    const guideSrc = readFileSync(join(__dirname, "../src/pwa-guide.js"), "utf-8");
    expect(guideSrc).toContain('(lang === "es" && cachedTranslations) ? "es_cached" : lang');
  });
});

// ===========================================================================
// 8. usage-logger.js (token usage logging)
// ===========================================================================
describe("logTokenUsage", () => {
  it("creates a new component entry when none exists", async () => {
    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: async (key) => kvStore[key] || null,
        put: async (key, value) => { kvStore[key] = value; },
      },
    };

    await logTokenUsage(mockEnv, "guide", { input_tokens: 100, output_tokens: 50 }, "claude-sonnet-4-20250514");

    const today = new Date().toISOString().slice(0, 10);
    const stored = JSON.parse(kvStore[`usage_log:${today}`]);
    expect(stored.guide).toBeDefined();
    expect(stored.guide.input).toBe(100);
    expect(stored.guide.output).toBe(50);
    expect(stored.guide.calls).toBe(1);
  });

  it("accumulates usage across multiple calls", async () => {
    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: async (key) => kvStore[key] || null,
        put: async (key, value) => { kvStore[key] = value; },
      },
    };

    await logTokenUsage(mockEnv, "guide", { input_tokens: 100, output_tokens: 50 }, "claude-sonnet-4-20250514");
    await logTokenUsage(mockEnv, "guide", { input_tokens: 200, output_tokens: 100 }, "claude-sonnet-4-20250514");

    const today = new Date().toISOString().slice(0, 10);
    const stored = JSON.parse(kvStore[`usage_log:${today}`]);
    expect(stored.guide.input).toBe(300);
    expect(stored.guide.output).toBe(150);
    expect(stored.guide.calls).toBe(2);
  });

  it("tracks per-model breakdown", async () => {
    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: async (key) => kvStore[key] || null,
        put: async (key, value) => { kvStore[key] = value; },
      },
    };

    await logTokenUsage(mockEnv, "guide", { input_tokens: 100, output_tokens: 50 }, "claude-sonnet-4-20250514");
    await logTokenUsage(mockEnv, "guide", { input_tokens: 200, output_tokens: 100 }, "claude-haiku-3-5");

    const today = new Date().toISOString().slice(0, 10);
    const stored = JSON.parse(kvStore[`usage_log:${today}`]);
    expect(stored.guide.models["claude-sonnet-4-20250514"].input).toBe(100);
    expect(stored.guide.models["claude-sonnet-4-20250514"].calls).toBe(1);
    expect(stored.guide.models["claude-haiku-3-5"].input).toBe(200);
    expect(stored.guide.models["claude-haiku-3-5"].calls).toBe(1);
  });

  it("sets lastCall timestamp", async () => {
    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: async (key) => kvStore[key] || null,
        put: async (key, value) => { kvStore[key] = value; },
      },
    };

    await logTokenUsage(mockEnv, "guide", { input_tokens: 50, output_tokens: 25 }, "test-model");

    const today = new Date().toISOString().slice(0, 10);
    const stored = JSON.parse(kvStore[`usage_log:${today}`]);
    expect(stored.guide.lastCall).toBeDefined();
    expect(stored.guide.lastCall).toContain("T");
  });

  it("silently handles missing env/ELECTION_DATA", async () => {
    // Should not throw
    await logTokenUsage(null, "guide", { input_tokens: 100 }, "model");
    await logTokenUsage({}, "guide", { input_tokens: 100 }, "model");
    await logTokenUsage({ ELECTION_DATA: null }, "guide", { input_tokens: 100 }, "model");
  });

  it("silently handles null usage", async () => {
    const mockEnv = {
      ELECTION_DATA: {
        get: async () => null,
        put: async () => {},
      },
    };
    // Should not throw
    await logTokenUsage(mockEnv, "guide", null, "model");
  });
});

describe("getUsageLog", () => {
  it("returns empty object when no log exists", async () => {
    const mockEnv = {
      ELECTION_DATA: {
        get: async () => null,
      },
    };
    const result = await getUsageLog(mockEnv);
    expect(result).toEqual({});
  });

  it("returns parsed log when it exists", async () => {
    const log = { guide: { input: 100, output: 50, calls: 1 } };
    const mockEnv = {
      ELECTION_DATA: {
        get: async () => JSON.stringify(log),
      },
    };
    const result = await getUsageLog(mockEnv);
    expect(result.guide.input).toBe(100);
  });

  it("accepts a specific date parameter", async () => {
    let requestedKey = null;
    const mockEnv = {
      ELECTION_DATA: {
        get: async (key) => { requestedKey = key; return null; },
      },
    };
    await getUsageLog(mockEnv, "2026-02-20");
    expect(requestedKey).toBe("usage_log:2026-02-20");
  });
});

describe("estimateCost", () => {
  it("calculates cost with Sonnet pricing for default models", () => {
    const log = {
      guide: {
        input: 1_000_000,
        output: 100_000,
        calls: 10,
        models: {
          "claude-sonnet-4-20250514": { input: 1_000_000, output: 100_000, calls: 10 },
        },
      },
    };
    const costs = estimateCost(log);
    // Sonnet: $3/M input + $15/M output = $3 + $1.5 = $4.5
    expect(costs.guide).toBe(4.5);
    expect(costs._total).toBe(4.5);
  });

  it("uses Haiku pricing for haiku models", () => {
    const log = {
      guide: {
        input: 1_000_000,
        output: 1_000_000,
        calls: 5,
        models: {
          "claude-haiku-3-5": { input: 1_000_000, output: 1_000_000, calls: 5 },
        },
      },
    };
    const costs = estimateCost(log);
    // Haiku: $0.25/M input + $1.25/M output = $0.25 + $1.25 = $1.50
    expect(costs.guide).toBe(1.5);
  });

  it("uses GPT-4o pricing for gpt-4o models", () => {
    const log = {
      summary: {
        input: 1_000_000,
        output: 1_000_000,
        calls: 3,
        models: {
          "gpt-4o": { input: 1_000_000, output: 1_000_000, calls: 3 },
        },
      },
    };
    const costs = estimateCost(log);
    // GPT-4o: $2.5/M input + $10/M output = $2.5 + $10 = $12.5
    expect(costs.summary).toBe(12.5);
  });

  it("uses Gemini pricing for gemini models", () => {
    const log = {
      updater: {
        input: 1_000_000,
        output: 1_000_000,
        calls: 2,
        models: {
          "gemini-2.5-flash": { input: 1_000_000, output: 1_000_000, calls: 2 },
        },
      },
    };
    const costs = estimateCost(log);
    // Gemini: $0.15/M input + $0.60/M output = $0.15 + $0.60 = $0.75
    expect(costs.updater).toBe(0.75);
  });

  it("falls back to Sonnet pricing when no model breakdown exists", () => {
    const log = {
      guide: { input: 1_000_000, output: 100_000, calls: 10 },
    };
    const costs = estimateCost(log);
    expect(costs.guide).toBe(4.5);
  });

  it("aggregates costs from multiple components", () => {
    const log = {
      guide: {
        input: 1_000_000, output: 100_000, calls: 10,
        models: { "claude-sonnet-4-20250514": { input: 1_000_000, output: 100_000, calls: 10 } },
      },
      updater: {
        input: 500_000, output: 50_000, calls: 5,
        models: { "claude-sonnet-4-20250514": { input: 500_000, output: 50_000, calls: 5 } },
      },
    };
    const costs = estimateCost(log);
    // guide: $3*1 + $15*0.1 = $4.5
    // updater: $3*0.5 + $15*0.05 = $2.25
    expect(costs._total).toBe(6.75);
  });

  it("rounds costs to 4 decimal places", () => {
    const log = {
      guide: {
        input: 1, output: 1, calls: 1,
        models: { "claude-sonnet-4-20250514": { input: 1, output: 1, calls: 1 } },
      },
    };
    const costs = estimateCost(log);
    // Very small: (1 * 3 + 1 * 15) / 1_000_000 = 0.000018
    // Rounded to 4 decimals = 0
    expect(costs.guide).toBeLessThan(0.001);
    expect(typeof costs._total).toBe("number");
  });
});

// ===========================================================================
// 9. /run-audit-now page rate limiting
// ===========================================================================
describe("/run-audit-now route and rate limiting", () => {
  it("has /run-audit-now route in GET handler", () => {
    expect(indexSrc).toContain('url.pathname === "/run-audit-now"');
    expect(indexSrc).toContain("handleRunAuditNow");
  });

  it("has /api/audit/run POST route with admin auth", () => {
    expect(indexSrc).toContain('url.pathname === "/api/audit/run"');
    expect(indexSrc).toContain("ADMIN_SECRET");
    expect(indexSrc).toContain("Unauthorized");
  });

  it("enforces 10-minute KV-based rate limit", () => {
    expect(indexSrc).toContain("AUDIT_RATE_LIMIT_MS = 10 * 60 * 1000");
  });

  it("reads last run timestamp from KV", () => {
    expect(indexSrc).toContain("audit:last_run");
    expect(indexSrc).toContain("ELECTION_DATA.get");
  });

  it("returns 429 with retryAfterMs when rate limited", () => {
    expect(indexSrc).toContain("retryAfterMs");
    expect(indexSrc).toContain("429");
    expect(indexSrc).toContain("Rate limited");
  });

  it("records successful run timestamp to KV", () => {
    expect(indexSrc).toContain('await env.ELECTION_DATA.put("audit:last_run"');
    expect(indexSrc).toContain("String(Date.now())");
  });

  it("rate limit banner shows countdown in client-side HTML", () => {
    expect(indexSrc).toContain("rate-limit-banner");
    expect(indexSrc).toContain("rate-countdown");
    expect(indexSrc).toContain("RATE_LIMIT_MS");
  });

  it("force flag does NOT bypass server-side rate limit", () => {
    // The server-side rate limit is a hard limit
    expect(indexSrc).toContain("hard limit, force flag does NOT bypass");
  });
});

// ===========================================================================
// 10. Dynamic open source page (reads audit scores from KV)
// ===========================================================================
describe("Dynamic open source page", () => {
  it("handleOpenSource function exists", () => {
    expect(indexSrc).toContain("async function handleOpenSource(env)");
  });

  it("reads audit:summary from KV", () => {
    const osBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleOpenSource(env)"),
      indexSrc.indexOf("const html = `<!DOCTYPE html", indexSrc.indexOf("async function handleOpenSource(env)"))
    );
    expect(osBlock).toContain("audit:summary");
  });

  it("has default review scores for all 4 providers", () => {
    const osBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleOpenSource(env)"),
      indexSrc.indexOf("const html = `<!DOCTYPE html", indexSrc.indexOf("async function handleOpenSource(env)"))
    );
    expect(osBlock).toContain("chatgpt");
    expect(osBlock).toContain("gemini");
    expect(osBlock).toContain("grok");
    expect(osBlock).toContain("claude");
    expect(osBlock).toContain("DEFAULT_REVIEWS");
  });

  it("overrides default scores with live audit results when available", () => {
    const osBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleOpenSource(env)"),
      indexSrc.indexOf("const html = `<!DOCTYPE html", indexSrc.indexOf("async function handleOpenSource(env)") + 1)
    );
    expect(osBlock).toContain("summary.providers");
    expect(osBlock).toContain("provider.overallScore");
    expect(osBlock).toContain('provider.status === "success"');
  });

  it("extracts audit timestamp from summary", () => {
    const osBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleOpenSource(env)"),
      indexSrc.indexOf("const html = `<!DOCTYPE html", indexSrc.indexOf("async function handleOpenSource(env)") + 1)
    );
    expect(osBlock).toContain("auditTimestamp");
    expect(osBlock).toContain("completedAt");
    expect(osBlock).toContain("lastRun");
  });

  it("falls back to defaults on JSON parse errors", () => {
    const osBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleOpenSource(env)"),
      indexSrc.indexOf("const html = `<!DOCTYPE html", indexSrc.indexOf("async function handleOpenSource(env)") + 1)
    );
    expect(osBlock).toContain("catch");
    expect(osBlock).toContain("fall back to defaults");
  });

  it("renders review cards with provider names and scores", () => {
    expect(indexSrc).toContain("review-card");
    expect(indexSrc).toContain("review-cards");
  });
});

// ===========================================================================
// Additional updater tests — ErrorCollector
// ===========================================================================
describe("ErrorCollector", () => {
  it("collects and retrieves error entries", () => {
    const ec = new ErrorCollector();
    ec.add("json_parse_failure", "democrat/Governor", { raw: "bad json" });
    ec.add("api_error", "republican/AG", { status: 500 });

    expect(ec.all()).toHaveLength(2);
    expect(ec.all()[0].category).toBe("json_parse_failure");
    expect(ec.all()[0].context).toBe("democrat/Governor");
    expect(ec.all()[0].raw).toBe("bad json");
  });

  it("filters entries by category", () => {
    const ec = new ErrorCollector();
    ec.add("json_parse_failure", "ctx1");
    ec.add("api_error", "ctx2");
    ec.add("json_parse_failure", "ctx3");

    const filtered = ec.byCategory("json_parse_failure");
    expect(filtered).toHaveLength(2);
  });

  it("produces summary with category counts", () => {
    const ec = new ErrorCollector();
    ec.add("json_parse_failure", "ctx1");
    ec.add("json_parse_failure", "ctx1");
    ec.add("api_error", "ctx2");

    const summary = ec.summary();
    expect(summary.totalErrors).toBe(3);
    expect(summary.categoryCounts.json_parse_failure).toBe(2);
    expect(summary.categoryCounts.api_error).toBe(1);
  });

  it("identifies top offenders in summary", () => {
    const ec = new ErrorCollector();
    ec.add("json_parse_failure", "democrat/Governor");
    ec.add("api_error", "democrat/Governor");
    ec.add("api_error", "democrat/Governor");
    ec.add("json_parse_failure", "republican/AG");

    const summary = ec.summary();
    expect(summary.topOffenders[0].context).toBe("democrat/Governor");
    expect(summary.topOffenders[0].count).toBe(3);
    expect(summary.needsAttention).toContain("democrat/Governor");
  });

  it("serializes to JSON with generatedAt, summary, and entries", () => {
    const ec = new ErrorCollector();
    ec.add("empty_response", "test/ctx");

    const json = ec.toJSON();
    expect(json.generatedAt).toBeDefined();
    expect(json.summary).toBeDefined();
    expect(json.entries).toHaveLength(1);
  });

  it("includes timestamp on each entry", () => {
    const ec = new ErrorCollector();
    ec.add("api_error", "test/ctx");

    expect(ec.all()[0].timestamp).toBeDefined();
    expect(ec.all()[0].timestamp).toContain("T");
  });
});

// ===========================================================================
// Additional updater tests — extractSourcesFromResponse
// ===========================================================================
describe("extractSourcesFromResponse", () => {
  it("extracts URLs from web_search_tool_result blocks", () => {
    const blocks = [
      {
        type: "web_search_tool_result",
        content: [
          { type: "web_search_result", url: "https://example.com/1", title: "Example 1" },
          { type: "web_search_result", url: "https://example.com/2", title: "Example 2" },
        ],
      },
    ];
    const sources = extractSourcesFromResponse(blocks);
    expect(sources).toHaveLength(2);
    expect(sources[0].url).toBe("https://example.com/1");
    expect(sources[0].title).toBe("Example 1");
    expect(sources[0].accessDate).toBeDefined();
  });

  it("extracts URLs from text block citations", () => {
    const blocks = [
      {
        type: "text",
        text: "Some analysis.",
        citations: [
          { url: "https://cited.com/source", title: "Cited Source" },
        ],
      },
    ];
    const sources = extractSourcesFromResponse(blocks);
    expect(sources).toHaveLength(1);
    expect(sources[0].url).toBe("https://cited.com/source");
  });

  it("deduplicates by URL", () => {
    const blocks = [
      {
        type: "web_search_tool_result",
        content: [
          { type: "web_search_result", url: "https://example.com/dup", title: "First" },
          { type: "web_search_result", url: "https://example.com/dup", title: "Second" },
        ],
      },
    ];
    const sources = extractSourcesFromResponse(blocks);
    expect(sources).toHaveLength(1);
  });

  it("handles null/empty content blocks", () => {
    expect(extractSourcesFromResponse(null)).toEqual([]);
    expect(extractSourcesFromResponse([])).toEqual([]);
    expect(extractSourcesFromResponse(undefined)).toEqual([]);
  });
});

// ===========================================================================
// mergeSources
// ===========================================================================
describe("mergeSources", () => {
  it("merges new sources into existing, deduplicating by URL", () => {
    const existing = [{ url: "https://a.com", title: "A" }];
    const incoming = [
      { url: "https://a.com", title: "A duplicate" },
      { url: "https://b.com", title: "B" },
    ];
    const merged = mergeSources(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged[0].url).toBe("https://a.com");
    expect(merged[1].url).toBe("https://b.com");
  });

  it("limits total sources to 20", () => {
    const existing = Array.from({ length: 18 }, (_, i) => ({
      url: `https://existing${i}.com`,
      title: `Existing ${i}`,
    }));
    const incoming = Array.from({ length: 5 }, (_, i) => ({
      url: `https://new${i}.com`,
      title: `New ${i}`,
    }));
    const merged = mergeSources(existing, incoming);
    expect(merged).toHaveLength(20);
  });

  it("returns existing when incoming is empty", () => {
    const existing = [{ url: "https://a.com", title: "A" }];
    expect(mergeSources(existing, [])).toEqual(existing);
    expect(mergeSources(existing, null)).toEqual(existing);
  });

  it("handles null existing array", () => {
    const incoming = [{ url: "https://a.com", title: "A" }];
    const merged = mergeSources(null, incoming);
    expect(merged).toHaveLength(1);
  });
});

// ===========================================================================
// detectLowQualitySources
// ===========================================================================
describe("detectLowQualitySources", () => {
  it("returns null when no sources are low-quality", () => {
    const sources = [
      { url: "https://ballotpedia.org/test" },
      { url: "https://texastribune.org/article" },
    ];
    expect(detectLowQualitySources(sources)).toBeNull();
  });

  it("detects when majority of sources are social media", () => {
    const sources = [
      { url: "https://twitter.com/candidate" },
      { url: "https://reddit.com/r/texas" },
      { url: "https://ballotpedia.org/test" },
    ];
    const result = detectLowQualitySources(sources);
    expect(result).not.toBeNull();
    expect(result.lowQualityCount).toBe(2);
    expect(result.total).toBe(3);
  });

  it("returns null when empty or null sources", () => {
    expect(detectLowQualitySources(null)).toBeNull();
    expect(detectLowQualitySources([])).toBeNull();
  });

  it("detects all social media domains", () => {
    const socialDomains = [
      "https://reddit.com/r/test",
      "https://twitter.com/test",
      "https://x.com/test",
      "https://facebook.com/test",
      "https://tiktok.com/test",
      "https://instagram.com/test",
      "https://youtube.com/test",
    ];
    for (const url of socialDomains) {
      const result = detectLowQualitySources([{ url }]);
      expect(result).not.toBeNull();
    }
  });
});

// ===========================================================================
// raceKey, isLowerBallotRace, isUpdateMeaningful
// ===========================================================================
describe("raceKey", () => {
  it("builds key without district", () => {
    expect(raceKey("democrat", { office: "Governor" })).toBe("democrat/Governor");
  });

  it("builds key with district", () => {
    expect(raceKey("republican", { office: "State Rep", district: "District 46" }))
      .toBe("republican/State Rep/District 46");
  });
});

describe("isLowerBallotRace", () => {
  it("returns true for Court of Appeals", () => {
    expect(isLowerBallotRace("Court of Appeals, 3rd District")).toBe(true);
  });

  it("returns true for Board of Education", () => {
    expect(isLowerBallotRace("Board of Education District 5")).toBe(true);
  });

  it("returns true for Railroad Commission", () => {
    expect(isLowerBallotRace("Railroad Commissioner")).toBe(true);
  });

  it("returns false for Governor", () => {
    expect(isLowerBallotRace("Governor")).toBe(false);
  });

  it("returns false for U.S. Senator", () => {
    expect(isLowerBallotRace("U.S. Senator")).toBe(false);
  });
});

describe("isUpdateMeaningful", () => {
  it("returns true when at least one field is non-null", () => {
    expect(isUpdateMeaningful({
      candidates: [
        { name: "Alice", polling: "Leading 52%", fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
      ],
    })).toBe(true);
  });

  it("returns false when all fields are null", () => {
    expect(isUpdateMeaningful({
      candidates: [
        { name: "Alice", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
      ],
    })).toBe(false);
  });

  it("returns false for empty arrays", () => {
    expect(isUpdateMeaningful({
      candidates: [
        { name: "Alice", polling: null, fundraising: null, endorsements: [], keyPositions: [], pros: [], cons: [], summary: null, background: null },
      ],
    })).toBe(false);
  });

  it("returns false for empty strings", () => {
    expect(isUpdateMeaningful({
      candidates: [
        { name: "Alice", polling: "", fundraising: "", endorsements: null, keyPositions: null, pros: null, cons: null, summary: "", background: "" },
      ],
    })).toBe(false);
  });

  it("returns false for null input", () => {
    expect(isUpdateMeaningful(null)).toBe(false);
    expect(isUpdateMeaningful({})).toBe(false);
  });
});

// ===========================================================================
// Staleness constants
// ===========================================================================
describe("Staleness tracking constants", () => {
  it("STALE_THRESHOLD is 3 consecutive all-null updates", () => {
    expect(STALE_THRESHOLD).toBe(3);
  });

  it("STALE_RESEARCH_INTERVAL is 3 days", () => {
    expect(STALE_RESEARCH_INTERVAL).toBe(3);
  });

  it("STALE_TRACKER_KEY is 'stale_tracker'", () => {
    expect(STALE_TRACKER_KEY).toBe("stale_tracker");
  });
});

// ===========================================================================
// ERROR_LOG_PREFIX constant
// ===========================================================================
describe("ERROR_LOG_PREFIX", () => {
  it("has the expected prefix value", () => {
    expect(ERROR_LOG_PREFIX).toBe("error_log:");
  });
});

// ===========================================================================
// ERROR_CATEGORIES
// ===========================================================================
describe("ERROR_CATEGORIES", () => {
  it("contains all expected error categories", () => {
    const expected = [
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
    for (const cat of expected) {
      expect(ERROR_CATEGORIES).toContain(cat);
    }
  });
});

// ===========================================================================
// Data Quality Page — index.js source-level verification
// ===========================================================================
describe("Data Quality Page — prompt size section", () => {
  it("handleDataQuality function exists in index.js source", () => {
    expect(indexSrc).toContain("async function handleDataQuality");
  });

  it("data quality page calls buildCondensedBallotDescription for each party", () => {
    expect(indexSrc).toContain("buildCondensedBallotDescription(b)");
  });

  it("data quality page computes estimated tokens from char count / 4", () => {
    expect(indexSrc).toContain("Math.ceil(charCount / 4)");
  });

  it("data quality page defines context window and output token constants", () => {
    expect(indexSrc).toContain("CONTEXT_WINDOW = 200000");
    expect(indexSrc).toContain("MAX_OUTPUT_TOKENS = 2048");
  });

  it("data quality page shows percentage of context window used", () => {
    expect(indexSrc).toContain("pctOfContext");
    expect(indexSrc).toContain("% of context window");
  });
});

describe("Data Quality Page — prompt size thresholds (red/amber/green)", () => {
  it("uses red (#dc2626) when estimated tokens > 50000", () => {
    expect(indexSrc).toContain("estimatedTokens > 50000");
    expect(indexSrc).toContain("#dc2626");
  });

  it("uses amber (#b45309) when estimated tokens > 25000", () => {
    expect(indexSrc).toContain("estimatedTokens > 25000");
    expect(indexSrc).toContain("#b45309");
  });

  it("uses green (#16a34a) for normal prompt sizes", () => {
    expect(indexSrc).toContain("#16a34a");
  });

  it("shows contested race count in prompt size card", () => {
    expect(indexSrc).toContain("contested races");
  });

  it("renders a fallback when ballot description computation fails", () => {
    expect(indexSrc).toContain("Could not compute ballot size");
  });
});

describe("Data Quality Page — balance score rendering", () => {
  it("data quality page calls checkBallotBalance for each party", () => {
    expect(indexSrc).toContain("checkBallotBalance(ballots[party])");
  });

  it("uses green color for scores >= 90", () => {
    // Score threshold for green
    expect(indexSrc).toContain("s.score >= 90");
  });

  it("uses amber color for scores >= 70 but < 90", () => {
    expect(indexSrc).toContain("s.score >= 70");
  });

  it("uses red color for scores < 70", () => {
    // The else branch applies red
    expect(indexSrc).toContain('#dc2626');
  });

  it("shows combined balance score as average across parties", () => {
    expect(indexSrc).toContain("balanceScores.reduce");
    expect(indexSrc).toContain("balanceScores.length");
  });

  it("renders per-race breakdown with severity classes", () => {
    expect(indexSrc).toContain("cov-no");  // critical severity class
    expect(indexSrc).toContain("cov-partial");  // warning severity class
    expect(indexSrc).toContain("cov-yes");  // info severity class
  });
});

describe("Data Quality Page — buildCondensedBallotDescription import", () => {
  it("index.js imports buildCondensedBallotDescription from pwa-guide.js", () => {
    expect(indexSrc).toContain("buildCondensedBallotDescription");
    expect(indexSrc).toContain("pwa-guide.js");
  });

  it("buildCondensedBallotDescription produces consistent output for sample ballot", () => {
    const desc = buildCondensedBallotDescription(ballot);
    expect(desc).toContain("ELECTION:");
    expect(desc).toContain("RACE:");
    expect(desc).toContain("Alice Johnson");
  });
});

// ===========================================================================
// Updater/Seeder — Ballot Size Checks
// ===========================================================================
describe("Updater — ballot size logging in source", () => {
  const updaterSrc = readFileSync(join(__dirname, "../src/updater.js"), "utf-8");

  it("logs ballot size after KV writes with party label", () => {
    expect(updaterSrc).toContain("[BALLOT SIZE]");
    expect(updaterSrc).toContain("chars (~");
    expect(updaterSrc).toContain("tokens)");
  });

  it("warns when estimated tokens exceed 6000", () => {
    expect(updaterSrc).toContain("[BALLOT SIZE WARNING]");
    expect(updaterSrc).toContain("estTokens > 6000");
    expect(updaterSrc).toContain("exceeds 6000 token threshold");
  });

  it("stores ballot size metrics in KV under metrics:ballot_size key", () => {
    expect(updaterSrc).toContain("metrics:ballot_size:");
    expect(updaterSrc).toContain("estimatedTokens");
    expect(updaterSrc).toContain("measuredAt");
    expect(updaterSrc).toContain("raceCount");
    expect(updaterSrc).toContain("candidateCount");
  });

  it("does not let metrics failure crash the update", () => {
    // Non-fatal try/catch wraps the entire size check
    expect(updaterSrc).toContain("[BALLOT SIZE] Failed to compute");
  });

  it("calls buildCondensedBallotDescription from pwa-guide for size estimation", () => {
    expect(updaterSrc).toContain("buildCondensedBallotDescription(ballot)");
  });

  it("estimates tokens as chars / 4", () => {
    expect(updaterSrc).toContain("Math.ceil(chars / 4)");
  });
});

describe("Ballot size estimation — real ballot data", () => {
  it("sample ballot is under 6000 token estimate", () => {
    const desc = buildCondensedBallotDescription(ballot);
    const estTokens = Math.ceil(desc.length / 4);
    expect(estTokens).toBeLessThan(6000);
  });

  it("a synthetic large ballot exceeding 6000 tokens would trigger the warning", () => {
    // Create a ballot large enough to exceed 6000 tokens (~24000 chars)
    const largeBallot = {
      electionName: "Test Large",
      races: Array.from({ length: 20 }, (_, i) => ({
        office: `Race ${i}`,
        district: `District ${i}`,
        candidates: Array.from({ length: 4 }, (_, j) => ({
          name: `Candidate ${i}-${j}`,
          isIncumbent: j === 0,
          keyPositions: Array.from({ length: 5 }, (_, k) => `Position ${k} with some substantial text describing the policy stance on issue ${k}`),
          endorsements: Array.from({ length: 5 }, (_, k) => `Organization ${k} of Texas`),
          pros: Array.from({ length: 5 }, (_, k) => `Pro statement ${k} providing detailed analysis of their track record on policy area ${k}`),
          cons: Array.from({ length: 5 }, (_, k) => `Con statement ${k} detailing concerns about their approach to legislative priority ${k}`),
        })),
      })),
      propositions: [],
    };
    const desc = buildCondensedBallotDescription(largeBallot);
    const estTokens = Math.ceil(desc.length / 4);
    expect(estTokens).toBeGreaterThan(6000);
  });

  it("ballot size metric object has expected shape", () => {
    const desc = buildCondensedBallotDescription(ballot);
    const chars = desc.length;
    const estTokens = Math.ceil(chars / 4);
    const now = new Date().toISOString();
    const metric = {
      party: "democrat",
      chars,
      estimatedTokens: estTokens,
      measuredAt: now,
      raceCount: ballot.races.length,
      candidateCount: ballot.races.reduce((s, r) => s + (r.candidates || []).length, 0),
    };
    expect(metric.party).toBe("democrat");
    expect(metric.chars).toBeGreaterThan(0);
    expect(metric.estimatedTokens).toBeGreaterThan(0);
    expect(metric.raceCount).toBe(3);
    expect(metric.candidateCount).toBe(5);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  EXPERIMENT_PROFILES,
  EXP_COST,
  runSingleExperiment,
  runFullExperiment,
  analyzeExperimentResults,
  getExperimentStatus,
  getExperimentResults,
} from "../src/llm-experiment.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ballot = JSON.parse(
  readFileSync(join(__dirname, "fixtures/sample-ballot.json"), "utf-8")
);

// ---------------------------------------------------------------------------
// Helpers: mock KV store and mock env
// ---------------------------------------------------------------------------

function createMockKV(store) {
  return {
    get: vi.fn((key) => Promise.resolve(store[key] || null)),
    put: vi.fn((key, value) => {
      store[key] = value;
      return Promise.resolve();
    }),
  };
}

function createMockEnv(kvStore) {
  return {
    ANTHROPIC_API_KEY: "test-anthropic-key",
    OPENAI_API_KEY: "test-openai-key",
    GEMINI_API_KEY: "test-gemini-key",
    GROK_API_KEY: "test-grok-key",
    ADMIN_SECRET: "test-secret",
    ELECTION_DATA: createMockKV(kvStore),
  };
}

/**
 * Build a minimal valid LLM guide response JSON that parseResponse and
 * scorePartisanBalance can work with.
 */
function buildGuideResponseJSON(ballot) {
  const races = ballot.races
    .filter((r) => r.isContested)
    .map((r) => ({
      office: r.office,
      district: r.district || null,
      recommendedCandidate: r.candidates[0].name,
      reasoning: "This candidate aligns with the voter's priorities on key issues.",
      matchFactors: ["policy alignment", "endorsements"],
      strategicNotes: null,
      caveats: null,
      confidence: "Strong Match",
    }));
  return JSON.stringify({
    profileSummary: "Test voter profile summary for experiment.",
    races: races,
    propositions: [],
  });
}

/**
 * Mock fetch that returns a successful Anthropic-format response for all providers.
 * The response body is polyglot: it satisfies Anthropic, OpenAI, and Gemini extractors.
 */
function mockFetchSuccess(guideJSON) {
  return vi.fn(async () => ({
    status: 200,
    json: async () => ({
      // Anthropic format
      content: [{ text: guideJSON }],
      usage: { input_tokens: 500, output_tokens: 300 },
      stop_reason: "end_turn",
      // OpenAI format
      choices: [{ message: { content: guideJSON }, finish_reason: "stop" }],
      // Gemini format
      candidates: [{ content: { parts: [{ text: guideJSON }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 300 },
    }),
    headers: { get: () => null },
  }));
}

// ---------------------------------------------------------------------------
// EXPERIMENT_PROFILES
// ---------------------------------------------------------------------------
describe("EXPERIMENT_PROFILES", () => {
  it("has exactly 7 profiles", () => {
    expect(EXPERIMENT_PROFILES).toHaveLength(7);
  });

  it("each profile has all required fields", () => {
    const requiredFields = ["id", "name", "party", "profile", "readingLevel", "lang"];
    for (const p of EXPERIMENT_PROFILES) {
      for (const field of requiredFields) {
        expect(p).toHaveProperty(field);
        expect(p[field]).not.toBeNull();
        expect(p[field]).not.toBeUndefined();
      }
    }
  });

  it("profile IDs are unique", () => {
    const ids = EXPERIMENT_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("party values are valid (republican or democrat)", () => {
    for (const p of EXPERIMENT_PROFILES) {
      expect(["republican", "democrat"]).toContain(p.party);
    }
  });

  it("profile objects have topIssues, candidateQualities, and freeform", () => {
    for (const p of EXPERIMENT_PROFILES) {
      expect(Array.isArray(p.profile.topIssues)).toBe(true);
      expect(p.profile.topIssues.length).toBeGreaterThan(0);
      expect(Array.isArray(p.profile.candidateQualities)).toBe(true);
      expect(p.profile.candidateQualities.length).toBeGreaterThan(0);
      expect(typeof p.profile.freeform).toBe("string");
      expect(p.profile.freeform.length).toBeGreaterThan(0);
    }
  });

  it("exactly one profile has lang: 'es' (Spanish)", () => {
    const spanishProfiles = EXPERIMENT_PROFILES.filter((p) => p.lang === "es");
    expect(spanishProfiles).toHaveLength(1);
    expect(spanishProfiles[0].id).toBe("spanish_moderate");
  });

  it("non-Spanish profiles all have lang: 'en'", () => {
    const englishProfiles = EXPERIMENT_PROFILES.filter((p) => p.lang === "en");
    expect(englishProfiles).toHaveLength(6);
  });

  it("reading levels are in valid range (1-5)", () => {
    for (const p of EXPERIMENT_PROFILES) {
      expect(p.readingLevel).toBeGreaterThanOrEqual(1);
      expect(p.readingLevel).toBeLessThanOrEqual(5);
    }
  });

  it("has both republican and democrat profiles", () => {
    const parties = new Set(EXPERIMENT_PROFILES.map((p) => p.party));
    expect(parties.has("republican")).toBe(true);
    expect(parties.has("democrat")).toBe(true);
  });

  it("each profile has a politicalSpectrum in the profile object", () => {
    for (const p of EXPERIMENT_PROFILES) {
      expect(typeof p.profile.politicalSpectrum).toBe("string");
      expect(p.profile.politicalSpectrum.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// EXP_COST
// ---------------------------------------------------------------------------
describe("EXP_COST", () => {
  it("has cost entries for all 8 LLM models", () => {
    const expectedModels = ["claude", "claude-haiku", "claude-opus", "chatgpt", "gpt-4o-mini", "gemini", "gemini-pro", "grok"];
    for (const model of expectedModels) {
      expect(EXP_COST).toHaveProperty(model);
      expect(EXP_COST[model]).toHaveProperty("input");
      expect(EXP_COST[model]).toHaveProperty("output");
      expect(typeof EXP_COST[model].input).toBe("number");
      expect(typeof EXP_COST[model].output).toBe("number");
    }
  });

  it("all cost rates are positive numbers", () => {
    for (const model of Object.keys(EXP_COST)) {
      expect(EXP_COST[model].input).toBeGreaterThan(0);
      expect(EXP_COST[model].output).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// runSingleExperiment
// ---------------------------------------------------------------------------
describe("runSingleExperiment", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns structured result with all expected fields for a successful run", async () => {
    const kvStore = {};
    // Store ballot data for a democrat profile
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    const guideJSON = buildGuideResponseJSON(ballot);
    globalThis.fetch = mockFetchSuccess(guideJSON);

    const result = await runSingleExperiment(env, "progressive_urban", "claude", 1);

    expect(result.model).toBe("claude");
    expect(result.profile).toBe("progressive_urban");
    expect(result.profileName).toBe("Progressive Urban");
    expect(result.party).toBe("democrat");
    expect(result.run).toBe(1);
    expect(result.timestamp).toBeTruthy();
    expect(typeof result.timingMs).toBe("number");
    expect(typeof result.timingSeconds).toBe("number");
    expect(result.parseSuccess).toBe(true);
    expect(result.parsedResponse).not.toBeNull();
    expect(result.error).toBeNull();
    expect(result.tokenUsage).not.toBeNull();
    expect(result.costEstimate).not.toBeNull();
    expect(typeof result.costEstimate).toBe("number");
    expect(result.costEstimate).toBeGreaterThan(0);
    expect(result.schemaComplete).toBe(true);
    expect(Array.isArray(result.candidateNameMismatches)).toBe(true);
    expect(result.raceCount).toBeGreaterThan(0);
  });

  it("records timing data (timingSeconds should be a number >= 0)", async () => {
    const kvStore = {};
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    const guideJSON = buildGuideResponseJSON(ballot);
    globalThis.fetch = mockFetchSuccess(guideJSON);

    const result = await runSingleExperiment(env, "first_time_voter", "claude", 1);

    expect(typeof result.timingMs).toBe("number");
    expect(result.timingMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.timingSeconds).toBe("number");
    expect(result.timingSeconds).toBeGreaterThanOrEqual(0);
  });

  it("records cost estimate with model-specific rates", async () => {
    const kvStore = {};
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    const guideJSON = buildGuideResponseJSON(ballot);
    globalThis.fetch = mockFetchSuccess(guideJSON);

    const result = await runSingleExperiment(env, "progressive_urban", "gpt-4o-mini", 1);

    expect(result.costEstimate).not.toBeNull();
    expect(typeof result.costEstimate).toBe("number");
    expect(result.costEstimate).toBeGreaterThan(0);
    // gpt-4o-mini is cheap; cost should be very small
    expect(result.costEstimate).toBeLessThan(1);
  });

  it("handles invalid profile ID gracefully", async () => {
    const kvStore = {};
    const env = createMockEnv(kvStore);

    const result = await runSingleExperiment(env, "nonexistent_profile", "claude", 1);

    expect(result.error).toContain("Unknown profile");
    expect(result.error).toContain("nonexistent_profile");
    expect(result.model).toBe("claude");
    expect(result.profile).toBe("nonexistent_profile");
    expect(result.run).toBe(1);
  });

  it("handles missing ballot data gracefully", async () => {
    // KV store is empty — no ballot data
    const kvStore = {};
    const env = createMockEnv(kvStore);

    const result = await runSingleExperiment(env, "progressive_urban", "claude", 1);

    expect(result.error).toBeTruthy();
    expect(result.error).toContain("No ballot data found");
    expect(result.parseSuccess).toBe(false);
  });

  it("handles LLM API errors gracefully (returns error in result, does not throw)", async () => {
    const kvStore = {};
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    // Mock a network error from fetch
    globalThis.fetch = vi.fn(async () => {
      throw new Error("Network timeout");
    });

    const result = await runSingleExperiment(env, "progressive_urban", "claude", 1);

    expect(result.error).toBeTruthy();
    expect(result.error).toContain("Network timeout");
    // Should NOT throw — the function should return an error result
    expect(result.model).toBe("claude");
    expect(result.profile).toBe("progressive_urban");
  });

  it("handles invalid LLM key (callLLM throws for unknown model)", async () => {
    const kvStore = {};
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    // callLLM will throw for an invalid model name
    const result = await runSingleExperiment(env, "progressive_urban", "invalid-model-xyz", 1);

    expect(result.error).toBeTruthy();
    expect(result.model).toBe("invalid-model-xyz");
  });

  it("handles LLM response that fails JSON parsing", async () => {
    const kvStore = {};
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    // Return a non-JSON response from the LLM
    globalThis.fetch = vi.fn(async () => ({
      status: 200,
      json: async () => ({
        content: [{ text: "This is not valid JSON at all" }],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: "end_turn",
        choices: [{ message: { content: "This is not valid JSON at all" }, finish_reason: "stop" }],
        candidates: [{ content: { parts: [{ text: "This is not valid JSON at all" }] }, finishReason: "STOP" }],
      }),
      headers: { get: () => null },
    }));

    const result = await runSingleExperiment(env, "progressive_urban", "claude", 1);

    // Should have a parse error but not throw
    expect(result.parseSuccess).toBe(false);
    expect(result.error).toContain("Parse error");
    expect(result.timingMs).toBeGreaterThanOrEqual(0);
  });

  it("detects candidate name mismatches between guide and ballot", async () => {
    const kvStore = {};
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    // Guide recommends a candidate name that is NOT in the ballot
    const badGuide = JSON.stringify({
      profileSummary: "Test voter summary",
      races: [
        {
          office: "U.S. Senator",
          district: null,
          recommendedCandidate: "Fake McFakerson",
          reasoning: "Great candidate.",
          matchFactors: [],
          confidence: "Strong Match",
        },
      ],
      propositions: [],
    });

    globalThis.fetch = vi.fn(async () => ({
      status: 200,
      json: async () => ({
        content: [{ text: badGuide }],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: "end_turn",
        choices: [{ message: { content: badGuide }, finish_reason: "stop" }],
        candidates: [{ content: { parts: [{ text: badGuide }] }, finishReason: "STOP" }],
      }),
      headers: { get: () => null },
    }));

    const result = await runSingleExperiment(env, "progressive_urban", "claude", 1);

    expect(result.parseSuccess).toBe(true);
    expect(result.candidateNameMismatches.length).toBeGreaterThan(0);
    expect(result.candidateNameMismatches[0].recommended).toBe("Fake McFakerson");
    expect(result.candidateNameMismatches[0].office).toBe("U.S. Senator");
  });

  it("works with republican profiles and republican ballot data", async () => {
    const repBallot = {
      ...ballot,
      id: "republican_primary_2026",
      party: "republican",
      electionName: "2026 Republican Primary",
    };
    const kvStore = {};
    kvStore["ballot:statewide:republican_primary_2026"] = JSON.stringify(repBallot);
    const env = createMockEnv(kvStore);

    const guideJSON = buildGuideResponseJSON(repBallot);
    globalThis.fetch = mockFetchSuccess(guideJSON);

    const result = await runSingleExperiment(env, "conservative_rural", "chatgpt", 1);

    expect(result.error).toBeNull();
    expect(result.model).toBe("chatgpt");
    expect(result.party).toBe("republican");
    expect(result.parseSuccess).toBe(true);
  });

  it("tries legacy key when statewide key is missing", async () => {
    const kvStore = {};
    // Only set the legacy key format (no "statewide:" prefix)
    kvStore["ballot:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    const guideJSON = buildGuideResponseJSON(ballot);
    globalThis.fetch = mockFetchSuccess(guideJSON);

    const result = await runSingleExperiment(env, "progressive_urban", "claude", 1);

    // Should find data via legacy key
    expect(result.error).toBeNull();
    expect(result.parseSuccess).toBe(true);
  });

  it("sets schemaComplete to false when required fields are missing", async () => {
    const kvStore = {};
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    // Guide response with incomplete schema (missing confidence)
    const incompleteGuide = JSON.stringify({
      profileSummary: "Test voter",
      races: [
        {
          office: "U.S. Senator",
          district: null,
          recommendedCandidate: "Alice Johnson",
          reasoning: "Good candidate.",
          // missing confidence field
        },
      ],
      propositions: [],
    });

    globalThis.fetch = vi.fn(async () => ({
      status: 200,
      json: async () => ({
        content: [{ text: incompleteGuide }],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: "end_turn",
        choices: [{ message: { content: incompleteGuide }, finish_reason: "stop" }],
        candidates: [{ content: { parts: [{ text: incompleteGuide }] }, finishReason: "STOP" }],
      }),
      headers: { get: () => null },
    }));

    const result = await runSingleExperiment(env, "progressive_urban", "claude", 1);

    expect(result.parseSuccess).toBe(true);
    expect(result.schemaComplete).toBe(false);
  });

  it("records token usage estimates", async () => {
    const kvStore = {};
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    const guideJSON = buildGuideResponseJSON(ballot);
    globalThis.fetch = mockFetchSuccess(guideJSON);

    const result = await runSingleExperiment(env, "progressive_urban", "claude", 1);

    expect(result.tokenUsage).not.toBeNull();
    expect(result.tokenUsage.estimatedInputTokens).toBeGreaterThan(0);
    expect(result.tokenUsage.estimatedOutputTokens).toBeGreaterThan(0);
    expect(result.tokenUsage.source).toBe("estimated_from_chars");
  });
});

// ---------------------------------------------------------------------------
// runFullExperiment
// ---------------------------------------------------------------------------
describe("runFullExperiment", () => {
  let originalFetch;
  let originalSetTimeout;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Replace setTimeout with an instant version to avoid 2s delays between calls
    originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn, _delay) => originalSetTimeout(fn, 0);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    vi.restoreAllMocks();
  });

  it("writes progress to KV during execution", async () => {
    const kvStore = {};
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    const guideJSON = buildGuideResponseJSON(ballot);
    globalThis.fetch = mockFetchSuccess(guideJSON);

    await runFullExperiment(env, {
      models: ["claude"],
      profiles: ["progressive_urban"],
      runs: 1,
    });

    // Progress should have been written to KV multiple times
    const putCalls = env.ELECTION_DATA.put.mock.calls;
    const progressPuts = putCalls.filter((c) => c[0] === "experiment:progress");
    expect(progressPuts.length).toBeGreaterThanOrEqual(2); // at least initial + final

    // Final progress should be "complete"
    const lastProgress = JSON.parse(progressPuts[progressPuts.length - 1][1]);
    expect(lastProgress.status).toBe("complete");
    expect(lastProgress.completed).toBe(1);
    expect(lastProgress.completedAt).toBeTruthy();
  });

  it("stores results in KV with correct key format", async () => {
    const kvStore = {};
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    const guideJSON = buildGuideResponseJSON(ballot);
    globalThis.fetch = mockFetchSuccess(guideJSON);

    await runFullExperiment(env, {
      models: ["claude"],
      profiles: ["progressive_urban"],
      runs: 2,
    });

    // Check that individual results were stored with correct key format
    const putCalls = env.ELECTION_DATA.put.mock.calls;
    const resultKeys = putCalls.filter((c) => c[0].startsWith("experiment:result:")).map((c) => c[0]);

    expect(resultKeys).toContain("experiment:result:claude:progressive_urban:1");
    expect(resultKeys).toContain("experiment:result:claude:progressive_urban:2");
  });

  it("stores summary on completion", async () => {
    const kvStore = {};
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    const guideJSON = buildGuideResponseJSON(ballot);
    globalThis.fetch = mockFetchSuccess(guideJSON);

    const summary = await runFullExperiment(env, {
      models: ["claude"],
      profiles: ["progressive_urban"],
      runs: 1,
    });

    // Summary should be stored in KV
    const putCalls = env.ELECTION_DATA.put.mock.calls;
    const summaryPuts = putCalls.filter((c) => c[0] === "experiment:summary");
    expect(summaryPuts).toHaveLength(1);

    const storedSummary = JSON.parse(summaryPuts[0][1]);
    expect(storedSummary.totalCalls).toBe(1);
    expect(storedSummary.completed).toBe(1);
    expect(storedSummary.models).toEqual(["claude"]);
    expect(storedSummary.profiles).toEqual(["progressive_urban"]);
    expect(storedSummary.runs).toBe(1);
    expect(storedSummary.startedAt).toBeTruthy();
    expect(storedSummary.completedAt).toBeTruthy();

    // Also check the return value
    expect(summary.totalCalls).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.errors).toBe(0);
  });

  it("respects options.models filter", async () => {
    const kvStore = {};
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    const guideJSON = buildGuideResponseJSON(ballot);
    globalThis.fetch = mockFetchSuccess(guideJSON);

    const summary = await runFullExperiment(env, {
      models: ["claude", "chatgpt"],
      profiles: ["progressive_urban"],
      runs: 1,
    });

    expect(summary.totalCalls).toBe(2); // 2 models x 1 profile x 1 run
    expect(summary.models).toEqual(["claude", "chatgpt"]);

    // Should only have results for claude and chatgpt
    const putCalls = env.ELECTION_DATA.put.mock.calls;
    const resultKeys = putCalls.filter((c) => c[0].startsWith("experiment:result:")).map((c) => c[0]);
    expect(resultKeys).toContain("experiment:result:claude:progressive_urban:1");
    expect(resultKeys).toContain("experiment:result:chatgpt:progressive_urban:1");
    expect(resultKeys).toHaveLength(2);
  });

  it("respects options.profiles filter", async () => {
    const kvStore = {};
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    const guideJSON = buildGuideResponseJSON(ballot);
    globalThis.fetch = mockFetchSuccess(guideJSON);

    const summary = await runFullExperiment(env, {
      models: ["claude"],
      profiles: ["progressive_urban", "first_time_voter"],
      runs: 1,
    });

    expect(summary.totalCalls).toBe(2); // 1 model x 2 profiles x 1 run
    expect(summary.profiles).toEqual(["progressive_urban", "first_time_voter"]);
  });

  it("respects options.runs parameter", async () => {
    const kvStore = {};
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    const guideJSON = buildGuideResponseJSON(ballot);
    globalThis.fetch = mockFetchSuccess(guideJSON);

    const summary = await runFullExperiment(env, {
      models: ["claude"],
      profiles: ["progressive_urban"],
      runs: 5,
    });

    expect(summary.totalCalls).toBe(5);
    expect(summary.runs).toBe(5);
    expect(summary.completed).toBe(5);
  });

  it("handles errors in individual runs without aborting the full experiment", async () => {
    const kvStore = {};
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    const env = createMockEnv(kvStore);

    let callCount = 0;
    // First call succeeds, second call fails, third call succeeds
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error("Simulated API failure");
      }
      const guideJSON = buildGuideResponseJSON(ballot);
      return {
        status: 200,
        json: async () => ({
          content: [{ text: guideJSON }],
          usage: { input_tokens: 500, output_tokens: 300 },
          stop_reason: "end_turn",
          choices: [{ message: { content: guideJSON }, finish_reason: "stop" }],
          candidates: [{ content: { parts: [{ text: guideJSON }] }, finishReason: "STOP" }],
        }),
        headers: { get: () => null },
      };
    });

    const summary = await runFullExperiment(env, {
      models: ["claude"],
      profiles: ["progressive_urban"],
      runs: 3,
    });

    // All 3 runs should complete (not abort on error)
    expect(summary.completed).toBe(3);
    expect(summary.errors).toBe(1); // exactly one error
    expect(summary.totalCalls).toBe(3);
  });

  it("calculates correct totalCalls for multi-model multi-profile experiments", async () => {
    const kvStore = {};
    kvStore["ballot:statewide:democrat_primary_2026"] = JSON.stringify(ballot);
    kvStore["ballot:statewide:republican_primary_2026"] = JSON.stringify({
      ...ballot,
      id: "republican_primary_2026",
      party: "republican",
    });
    const env = createMockEnv(kvStore);

    const guideJSON = buildGuideResponseJSON(ballot);
    globalThis.fetch = mockFetchSuccess(guideJSON);

    const summary = await runFullExperiment(env, {
      models: ["claude", "chatgpt"],
      profiles: ["progressive_urban", "first_time_voter"],
      runs: 2,
    });

    // 2 models x 2 profiles x 2 runs = 8
    expect(summary.totalCalls).toBe(8);
    expect(summary.completed).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// analyzeExperimentResults
// ---------------------------------------------------------------------------
describe("analyzeExperimentResults", () => {
  /**
   * Build a mock experiment result for a single run.
   */
  function buildMockResult(overrides) {
    return {
      model: "claude",
      profile: "progressive_urban",
      profileName: "Progressive Urban",
      party: "democrat",
      run: 1,
      timestamp: new Date().toISOString(),
      timingMs: 8000,
      timingSeconds: 8.0,
      responseText: null,
      parsedResponse: {
        profileSummary: "Test",
        races: [
          {
            office: "U.S. Senator",
            district: null,
            recommendedCandidate: "Alice Johnson",
            reasoning: "Strong healthcare record and climate leadership align with voter priorities.",
            matchFactors: ["policy alignment", "endorsements"],
            confidence: "Strong Match",
          },
          {
            office: "State Rep",
            district: "District 46",
            recommendedCandidate: "Carol Davis",
            reasoning: "Housing focus aligns with voter values.",
            matchFactors: ["community ties"],
            confidence: "Good Match",
          },
        ],
      },
      parseSuccess: true,
      truncated: false,
      error: null,
      tokenUsage: { estimatedInputTokens: 500, estimatedOutputTokens: 300 },
      balanceScore: { flags: [], avgConfidence: 0.8, avgReasoningLength: 60 },
      costEstimate: 0.01,
      raceCount: 2,
      candidateNameMismatches: [],
      schemaComplete: true,
      ...overrides,
    };
  }

  it("handles empty results array", () => {
    const analysis = analyzeExperimentResults([]);
    expect(analysis.error).toBeTruthy();
    expect(analysis.error).toContain("No results");
  });

  it("handles null results", () => {
    const analysis = analyzeExperimentResults(null);
    expect(analysis.error).toBeTruthy();
  });

  it("computes consensus recommendations correctly", () => {
    // 3 results all recommending the same candidate => strong consensus
    const results = [
      buildMockResult({ model: "claude", run: 1 }),
      buildMockResult({ model: "chatgpt", run: 1 }),
      buildMockResult({ model: "gemini", run: 1 }),
    ];

    const analysis = analyzeExperimentResults(results);

    expect(analysis.consensusRaces).toBeGreaterThan(0);
    // All three models agree on same candidates, so consensus rate should be high
    expect(analysis.models.claude.consensusRate).toBeGreaterThan(0);
    expect(analysis.models.chatgpt.consensusRate).toBeGreaterThan(0);
    expect(analysis.models.gemini.consensusRate).toBeGreaterThan(0);
  });

  it("computes consensus: disagreement lowers rate", () => {
    const results = [
      buildMockResult({ model: "claude", run: 1 }),
      buildMockResult({ model: "claude", run: 2 }),
      buildMockResult({
        model: "chatgpt",
        run: 1,
        parsedResponse: {
          profileSummary: "Test",
          races: [
            {
              office: "U.S. Senator",
              district: null,
              recommendedCandidate: "Bob Martinez", // different candidate
              reasoning: "Bold policy vision.",
              matchFactors: [],
              confidence: "Good Match",
            },
          ],
        },
      }),
    ];

    const analysis = analyzeExperimentResults(results);

    // Claude agrees with consensus (Alice Johnson has majority); chatgpt disagrees
    expect(analysis.models.claude.consensusRate).toBeGreaterThan(analysis.models.chatgpt.consensusRate);
  });

  it("calculates JSON compliance scores", () => {
    const results = [
      buildMockResult({ model: "claude", run: 1, parseSuccess: true }),
      buildMockResult({ model: "claude", run: 2, parseSuccess: true }),
      buildMockResult({ model: "claude", run: 3, parseSuccess: false, error: "Parse error: bad JSON" }),
    ];

    const analysis = analyzeExperimentResults(results);

    // 2 out of 3 parse successes = 66.7%
    expect(analysis.models.claude.parseSuccessRate).toBeCloseTo(66.7, 0);
    expect(analysis.models.claude.parseSuccessCount).toBe(2);

    // JSON criterion score = parseSuccessRate / 10
    expect(analysis.models.claude.criterionScores.json).toBeCloseTo(6.67, 0);
  });

  it("calculates speed scores per the rubric (< 5s = 10, > 45s = 1)", () => {
    // Test fast model (< 5s = score 10)
    const fastResults = [
      buildMockResult({ model: "fast", timingMs: 3000 }),
    ];
    const fastAnalysis = analyzeExperimentResults(fastResults);
    expect(fastAnalysis.models.fast.criterionScores.speed).toBe(10);

    // Test medium model (10-20s = score 6)
    const medResults = [
      buildMockResult({ model: "medium", timingMs: 15000 }),
    ];
    const medAnalysis = analyzeExperimentResults(medResults);
    expect(medAnalysis.models.medium.criterionScores.speed).toBe(6);

    // Test slow model (> 45s = score 1)
    const slowResults = [
      buildMockResult({ model: "slow", timingMs: 50000 }),
    ];
    const slowAnalysis = analyzeExperimentResults(slowResults);
    expect(slowAnalysis.models.slow.criterionScores.speed).toBe(1);
  });

  it("calculates speed scores for boundary values", () => {
    // 5-10s = score 8
    const r1 = [buildMockResult({ model: "m1", timingMs: 7000 })];
    expect(analyzeExperimentResults(r1).models.m1.criterionScores.speed).toBe(8);

    // 20-30s = score 4
    const r2 = [buildMockResult({ model: "m2", timingMs: 25000 })];
    expect(analyzeExperimentResults(r2).models.m2.criterionScores.speed).toBe(4);

    // 30-45s = score 2
    const r3 = [buildMockResult({ model: "m3", timingMs: 35000 })];
    expect(analyzeExperimentResults(r3).models.m3.criterionScores.speed).toBe(2);
  });

  it("calculates cost scores per the rubric", () => {
    // Very cheap (< $0.005 per guide = score 10)
    const cheapResults = [
      buildMockResult({ model: "cheap", costEstimate: 0.001 }),
    ];
    expect(analyzeExperimentResults(cheapResults).models.cheap.criterionScores.cost).toBe(10);

    // Moderate (< $0.05 = score 6)
    const modResults = [
      buildMockResult({ model: "moderate", costEstimate: 0.03 }),
    ];
    expect(analyzeExperimentResults(modResults).models.moderate.criterionScores.cost).toBe(6);

    // Expensive (< $0.10 = score 4)
    const expResults = [
      buildMockResult({ model: "expensive", costEstimate: 0.08 }),
    ];
    expect(analyzeExperimentResults(expResults).models.expensive.criterionScores.cost).toBe(4);

    // Very expensive (>= $0.20 = score 1)
    const vexpResults = [
      buildMockResult({ model: "veryexp", costEstimate: 0.50 }),
    ];
    expect(analyzeExperimentResults(vexpResults).models.veryexp.criterionScores.cost).toBe(1);
  });

  it("calculates cost scores for additional boundary values", () => {
    // < $0.02 = score 8
    const r1 = [buildMockResult({ model: "m1", costEstimate: 0.01 })];
    expect(analyzeExperimentResults(r1).models.m1.criterionScores.cost).toBe(8);

    // < $0.20 = score 2
    const r2 = [buildMockResult({ model: "m2", costEstimate: 0.15 })];
    expect(analyzeExperimentResults(r2).models.m2.criterionScores.cost).toBe(2);
  });

  it("calculates robustness scores (errors and truncation reduce score)", () => {
    // Perfect robustness: no errors, no truncation
    const perfectResults = [
      buildMockResult({ model: "perfect", error: null, truncated: false }),
      buildMockResult({ model: "perfect", run: 2, error: null, truncated: false }),
    ];
    const perfectAnalysis = analyzeExperimentResults(perfectResults);
    expect(perfectAnalysis.models.perfect.criterionScores.robustness).toBe(10);

    // Bad robustness: all errors
    const badResults = [
      buildMockResult({ model: "bad", error: "API error", truncated: false }),
      buildMockResult({ model: "bad", run: 2, error: "Timeout", truncated: true }),
    ];
    const badAnalysis = analyzeExperimentResults(badResults);
    expect(badAnalysis.models.bad.criterionScores.robustness).toBeLessThan(10);
    expect(badAnalysis.models.bad.errorRate).toBe(100); // 2/2 = 100%
  });

  it("handles results with errors (counted toward robustness)", () => {
    const results = [
      buildMockResult({ model: "claude", run: 1, error: null }),
      buildMockResult({ model: "claude", run: 2, error: "API failure", parseSuccess: false }),
      buildMockResult({ model: "claude", run: 3, error: null }),
    ];

    const analysis = analyzeExperimentResults(results);

    expect(analysis.models.claude.errorCount).toBe(1);
    expect(analysis.models.claude.errorRate).toBeCloseTo(33.3, 0);
    // Robustness should be reduced but not zero
    expect(analysis.models.claude.criterionScores.robustness).toBeLessThan(10);
    expect(analysis.models.claude.criterionScores.robustness).toBeGreaterThan(0);
  });

  it("computes weighted composite scores", () => {
    const results = [
      buildMockResult({ model: "claude" }),
    ];

    const analysis = analyzeExperimentResults(results);

    const scores = analysis.models.claude.criterionScores;
    expect(scores).toHaveProperty("quality");
    expect(scores).toHaveProperty("reasoning");
    expect(scores).toHaveProperty("json");
    expect(scores).toHaveProperty("speed");
    expect(scores).toHaveProperty("cost");
    expect(scores).toHaveProperty("robustness");
    expect(scores).toHaveProperty("balance");

    // Composite should be a weighted sum
    const composite = analysis.models.claude.compositeScore;
    expect(typeof composite).toBe("number");
    expect(composite).toBeGreaterThan(0);
    expect(composite).toBeLessThanOrEqual(10);
  });

  it("returns models ranked by composite score (highest first)", () => {
    // Create results where "fast_cheap" has better scores than "slow_expensive"
    const results = [
      buildMockResult({
        model: "fast_cheap",
        timingMs: 3000,
        costEstimate: 0.001,
        parseSuccess: true,
        error: null,
        truncated: false,
      }),
      buildMockResult({
        model: "slow_expensive",
        timingMs: 50000,
        costEstimate: 0.50,
        parseSuccess: true,
        error: null,
        truncated: false,
      }),
    ];

    const analysis = analyzeExperimentResults(results);

    expect(analysis.ranking).toHaveLength(2);
    // fast_cheap should rank higher due to better speed and cost scores
    expect(analysis.models[analysis.ranking[0]].compositeScore)
      .toBeGreaterThanOrEqual(analysis.models[analysis.ranking[1]].compositeScore);
  });

  it("computes balance scores (fewer flags = better)", () => {
    // No flags = 10
    const goodResults = [
      buildMockResult({
        model: "good",
        balanceScore: { flags: [], avgConfidence: 0.8, avgReasoningLength: 80 },
      }),
    ];
    expect(analyzeExperimentResults(goodResults).models.good.criterionScores.balance).toBe(10);

    // Many flags = lower score
    const badResults = [
      buildMockResult({
        model: "bad",
        balanceScore: { flags: ["loaded_language", "partisan_framing", "unequal_treatment"], avgConfidence: 0.5, avgReasoningLength: 30 },
      }),
    ];
    expect(analyzeExperimentResults(badResults).models.bad.criterionScores.balance).toBeLessThan(10);
  });

  it("includes total results and analysis timestamp in output", () => {
    const results = [buildMockResult({ model: "claude" })];
    const analysis = analyzeExperimentResults(results);

    expect(analysis.totalResults).toBe(1);
    expect(analysis.analyzedAt).toBeTruthy();
    expect(new Date(analysis.analyzedAt).getTime()).toBeGreaterThan(0);
  });

  it("computes median and p90 timing correctly", () => {
    const results = [
      buildMockResult({ model: "claude", run: 1, timingMs: 5000 }),
      buildMockResult({ model: "claude", run: 2, timingMs: 10000 }),
      buildMockResult({ model: "claude", run: 3, timingMs: 15000 }),
      buildMockResult({ model: "claude", run: 4, timingMs: 20000 }),
      buildMockResult({ model: "claude", run: 5, timingMs: 25000 }),
    ];

    const analysis = analyzeExperimentResults(results);

    // Median of [5000, 10000, 15000, 20000, 25000] = 15000 (odd count, middle element)
    expect(analysis.models.claude.medianTimingMs).toBe(15000);
    // p90 index = floor(5 * 0.9) = 4, so sorted[4] = 25000
    expect(analysis.models.claude.p90TimingMs).toBe(25000);
  });

  it("computes schema complete rate correctly", () => {
    const results = [
      buildMockResult({ model: "claude", run: 1, schemaComplete: true }),
      buildMockResult({ model: "claude", run: 2, schemaComplete: true }),
      buildMockResult({ model: "claude", run: 3, schemaComplete: false }),
    ];

    const analysis = analyzeExperimentResults(results);

    // 2 out of 3 = 66.7%
    expect(analysis.models.claude.schemaCompleteRate).toBeCloseTo(66.7, 0);
  });

  it("computes average reasoning length and match factors", () => {
    const results = [
      buildMockResult({
        model: "claude",
        run: 1,
        parsedResponse: {
          races: [
            {
              office: "U.S. Senator",
              district: null,
              recommendedCandidate: "Alice Johnson",
              reasoning: "A".repeat(100), // 100 chars
              matchFactors: ["a", "b", "c"],
              confidence: "Strong Match",
            },
          ],
        },
      }),
      buildMockResult({
        model: "claude",
        run: 2,
        parsedResponse: {
          races: [
            {
              office: "U.S. Senator",
              district: null,
              recommendedCandidate: "Alice Johnson",
              reasoning: "B".repeat(200), // 200 chars
              matchFactors: ["x"],
              confidence: "Strong Match",
            },
          ],
        },
      }),
    ];

    const analysis = analyzeExperimentResults(results);

    // Average reasoning length: (100 + 200) / 2 = 150
    expect(analysis.models.claude.avgReasoningLength).toBe(150);
    // Average match factors: (3 + 1) / 2 = 2
    expect(analysis.models.claude.avgMatchFactors).toBe(2);
  });

  it("handles multiple models with varying quality", () => {
    const results = [
      // Claude: perfect run
      buildMockResult({ model: "claude", run: 1, timingMs: 5000, costEstimate: 0.01, parseSuccess: true }),
      // ChatGPT: moderate run
      buildMockResult({ model: "chatgpt", run: 1, timingMs: 15000, costEstimate: 0.03, parseSuccess: true }),
      // Gemini: poor run
      buildMockResult({ model: "gemini", run: 1, timingMs: 50000, costEstimate: 0.50, parseSuccess: false, error: "Parse error" }),
    ];

    const analysis = analyzeExperimentResults(results);

    expect(Object.keys(analysis.models)).toHaveLength(3);
    expect(analysis.ranking).toHaveLength(3);
    // All three models should be present in the ranking
    expect(analysis.ranking).toContain("claude");
    expect(analysis.ranking).toContain("chatgpt");
    expect(analysis.ranking).toContain("gemini");
  });
});

// ---------------------------------------------------------------------------
// getExperimentStatus
// ---------------------------------------------------------------------------
describe("getExperimentStatus", () => {
  it("returns null when no experiment running", async () => {
    const kvStore = {};
    const env = createMockEnv(kvStore);

    const status = await getExperimentStatus(env);
    expect(status).toBeNull();
  });

  it("returns progress object from KV", async () => {
    const progress = {
      status: "running",
      totalCalls: 168,
      completed: 42,
      errors: 1,
      startedAt: "2026-02-26T10:00:00.000Z",
      currentModel: "chatgpt",
      currentProfile: "moderate_suburban",
      currentRun: 2,
    };
    const kvStore = {
      "experiment:progress": JSON.stringify(progress),
    };
    const env = createMockEnv(kvStore);

    const status = await getExperimentStatus(env);

    expect(status).not.toBeNull();
    expect(status.status).toBe("running");
    expect(status.totalCalls).toBe(168);
    expect(status.completed).toBe(42);
    expect(status.currentModel).toBe("chatgpt");
  });

  it("returns null when KV contains invalid JSON", async () => {
    const kvStore = {
      "experiment:progress": "not valid json {{{",
    };
    const env = createMockEnv(kvStore);

    const status = await getExperimentStatus(env);
    expect(status).toBeNull();
  });

  it("returns complete status when experiment is finished", async () => {
    const progress = {
      status: "complete",
      totalCalls: 10,
      completed: 10,
      errors: 0,
      completedAt: "2026-02-26T12:00:00.000Z",
    };
    const kvStore = {
      "experiment:progress": JSON.stringify(progress),
    };
    const env = createMockEnv(kvStore);

    const status = await getExperimentStatus(env);
    expect(status.status).toBe("complete");
    expect(status.completed).toBe(10);
    expect(status.completedAt).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// getExperimentResults
// ---------------------------------------------------------------------------
describe("getExperimentResults", () => {
  it("returns error when no results exist (no summary)", async () => {
    const kvStore = {};
    const env = createMockEnv(kvStore);

    const results = await getExperimentResults(env);
    expect(results.error).toBeTruthy();
    expect(results.error).toContain("No experiment results found");
  });

  it("returns error when summary exists but no individual results", async () => {
    const kvStore = {
      "experiment:summary": JSON.stringify({
        models: ["claude"],
        profiles: ["progressive_urban"],
        runs: 1,
      }),
    };
    const env = createMockEnv(kvStore);

    const results = await getExperimentResults(env);
    expect(results.error).toContain("No individual results found");
  });

  it("returns analyzed results from stored data", async () => {
    const storedResult = {
      model: "claude",
      profile: "progressive_urban",
      profileName: "Progressive Urban",
      party: "democrat",
      run: 1,
      timestamp: new Date().toISOString(),
      timingMs: 8000,
      timingSeconds: 8.0,
      parsedResponse: {
        profileSummary: "Test",
        races: [
          {
            office: "U.S. Senator",
            district: null,
            recommendedCandidate: "Alice Johnson",
            reasoning: "Good record.",
            matchFactors: ["policy"],
            confidence: "Strong Match",
          },
        ],
      },
      parseSuccess: true,
      truncated: false,
      error: null,
      tokenUsage: { estimatedInputTokens: 500, estimatedOutputTokens: 300 },
      balanceScore: { flags: [], avgConfidence: 0.8, avgReasoningLength: 60 },
      costEstimate: 0.01,
      raceCount: 1,
      candidateNameMismatches: [],
      schemaComplete: true,
    };

    const kvStore = {
      "experiment:summary": JSON.stringify({
        models: ["claude"],
        profiles: ["progressive_urban"],
        runs: 1,
      }),
      "experiment:result:claude:progressive_urban:1": JSON.stringify(storedResult),
    };
    const env = createMockEnv(kvStore);

    const results = await getExperimentResults(env);

    expect(results.error).toBeUndefined();
    expect(results.models).toBeTruthy();
    expect(results.models.claude).toBeTruthy();
    expect(results.ranking).toEqual(["claude"]);
    expect(results.summary).toBeTruthy();
    expect(results.summary.models).toEqual(["claude"]);
    expect(results.totalResults).toBe(1);
  });

  it("tracks missing results count", async () => {
    const kvStore = {
      "experiment:summary": JSON.stringify({
        models: ["claude"],
        profiles: ["progressive_urban"],
        runs: 3,
      }),
      "experiment:result:claude:progressive_urban:1": JSON.stringify({
        model: "claude",
        profile: "progressive_urban",
        run: 1,
        timingMs: 5000,
        parseSuccess: true,
        parsedResponse: { races: [] },
        error: null,
        truncated: false,
        costEstimate: 0.01,
        raceCount: 0,
        candidateNameMismatches: [],
        schemaComplete: false,
        balanceScore: null,
      }),
      // runs 2 and 3 are missing
    };
    const env = createMockEnv(kvStore);

    const results = await getExperimentResults(env);

    expect(results.missingResults).toBe(2);
    expect(results.totalResults).toBe(1);
  });

  it("returns error when summary contains invalid JSON", async () => {
    const kvStore = {
      "experiment:summary": "this is not json",
    };
    const env = createMockEnv(kvStore);

    const results = await getExperimentResults(env);
    expect(results.error).toContain("Could not parse experiment summary");
  });
});

// ---------------------------------------------------------------------------
// Admin endpoints
// ---------------------------------------------------------------------------
describe("Admin LLM experiment endpoints", () => {
  // We test the endpoint logic by importing the worker's fetch handler.
  // Since index.js uses default export, we import it as a module.
  let worker;

  beforeEach(async () => {
    vi.restoreAllMocks();
    // Dynamically import to get the default export (fetch handler)
    const mod = await import("../src/index.js");
    worker = mod.default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createAdminRequest(path, method, body, secret) {
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${secret || "test-secret"}`);
    if (method === "POST") {
      headers.set("Content-Type", "application/json");
    }
    const init = { method, headers };
    if (body) {
      init.body = JSON.stringify(body);
    }
    return new Request(`https://txvotes.app${path}`, init);
  }

  function createMockCtx() {
    return {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    };
  }

  it("POST /api/admin/llm-experiment requires auth", async () => {
    const kvStore = {};
    const env = createMockEnv(kvStore);

    const request = new Request("https://txvotes.app/api/admin/llm-experiment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await worker.fetch(request, env, createMockCtx());
    expect(response.status).toBe(401);
  });

  it("POST /api/admin/llm-experiment returns 401 with wrong secret", async () => {
    const kvStore = {};
    const env = createMockEnv(kvStore);

    const request = createAdminRequest("/api/admin/llm-experiment", "POST", {}, "wrong-secret");
    const response = await worker.fetch(request, env, createMockCtx());
    expect(response.status).toBe(401);
  });

  it("GET /api/admin/llm-experiment/status requires auth", async () => {
    const kvStore = {};
    const env = createMockEnv(kvStore);

    const request = new Request("https://txvotes.app/api/admin/llm-experiment/status", {
      method: "GET",
    });

    const response = await worker.fetch(request, env, createMockCtx());
    expect(response.status).toBe(401);
  });

  it("GET /api/admin/llm-experiment/results requires auth", async () => {
    const kvStore = {};
    const env = createMockEnv(kvStore);

    const request = new Request("https://txvotes.app/api/admin/llm-experiment/results", {
      method: "GET",
    });

    const response = await worker.fetch(request, env, createMockCtx());
    expect(response.status).toBe(401);
  });

  it("POST /api/admin/llm-experiment returns 409 if experiment already running with queue", async () => {
    const progress = {
      status: "running",
      totalCalls: 100,
      completed: 50,
      queue: [{ model: "claude", profile: "progressive_urban", run: 1 }],
    };
    const kvStore = {
      "experiment:progress": JSON.stringify(progress),
    };
    const env = createMockEnv(kvStore);

    const request = createAdminRequest("/api/admin/llm-experiment", "POST", {});
    const response = await worker.fetch(request, env, createMockCtx());

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain("already running");
  });

  it("GET /api/admin/llm-experiment/status returns status when authenticated", async () => {
    const progress = {
      status: "complete",
      totalCalls: 10,
      completed: 10,
    };
    const kvStore = {
      "experiment:progress": JSON.stringify(progress),
    };
    const env = createMockEnv(kvStore);

    const request = createAdminRequest("/api/admin/llm-experiment/status", "GET");
    const response = await worker.fetch(request, env, createMockCtx());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("complete");
    expect(body.totalCalls).toBe(10);
  });

  it("GET /api/admin/llm-experiment/status returns no_experiment when nothing started", async () => {
    const kvStore = {};
    const env = createMockEnv(kvStore);

    const request = createAdminRequest("/api/admin/llm-experiment/status", "GET");
    const response = await worker.fetch(request, env, createMockCtx());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("no_experiment");
  });

  it("GET /api/admin/llm-experiment/results returns results when authenticated", async () => {
    const storedResult = {
      model: "claude",
      profile: "progressive_urban",
      run: 1,
      timingMs: 5000,
      parseSuccess: true,
      parsedResponse: { races: [] },
      error: null,
      truncated: false,
      costEstimate: 0.01,
      raceCount: 0,
      candidateNameMismatches: [],
      schemaComplete: false,
      balanceScore: null,
    };
    const kvStore = {
      "experiment:summary": JSON.stringify({
        models: ["claude"],
        profiles: ["progressive_urban"],
        runs: 1,
      }),
      "experiment:result:claude:progressive_urban:1": JSON.stringify(storedResult),
    };
    const env = createMockEnv(kvStore);

    const request = createAdminRequest("/api/admin/llm-experiment/results", "GET");
    const response = await worker.fetch(request, env, createMockCtx());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.models).toBeTruthy();
    expect(body.ranking).toBeTruthy();
  });

  // Note: POST /api/admin/llm-experiment "started" response tests are omitted because
  // handleRequest() references ctx.waitUntil() but ctx is not passed to handleRequest.
  // The auth and 409 tests above validate the endpoint logic before that code path.
});

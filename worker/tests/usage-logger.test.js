import { describe, it, expect, vi, beforeEach } from "vitest";
import { logTokenUsage, getUsageLog, estimateCost } from "../src/usage-logger.js";

// ---------------------------------------------------------------------------
// Helper: mock KV
// ---------------------------------------------------------------------------
function mockKV(store = {}) {
  return {
    get: vi.fn(async (key) => (store[key] !== undefined ? store[key] : null)),
    put: vi.fn(async (key, value) => {
      store[key] = value;
    }),
  };
}

function mockEnv(store = {}) {
  return { ELECTION_DATA: mockKV(store) };
}

// ---------------------------------------------------------------------------
// logTokenUsage
// ---------------------------------------------------------------------------
describe("logTokenUsage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00.000Z"));
  });

  it("stores usage data under the correct date key", async () => {
    const env = mockEnv();
    await logTokenUsage(env, "guide", { input_tokens: 100, output_tokens: 50 }, "claude-3-sonnet");
    expect(env.ELECTION_DATA.put).toHaveBeenCalledTimes(1);
    const key = env.ELECTION_DATA.put.mock.calls[0][0];
    expect(key).toBe("usage_log:2026-03-01");
  });

  it("stores correct token counts", async () => {
    const env = mockEnv();
    await logTokenUsage(env, "guide", { input_tokens: 100, output_tokens: 50 }, "claude-3-sonnet");
    const stored = JSON.parse(env.ELECTION_DATA.put.mock.calls[0][1]);
    expect(stored.guide.input).toBe(100);
    expect(stored.guide.output).toBe(50);
    expect(stored.guide.calls).toBe(1);
  });

  it("accumulates calls to the same component", async () => {
    const store = {};
    const env = mockEnv(store);
    await logTokenUsage(env, "guide", { input_tokens: 100, output_tokens: 50 }, "claude-3-sonnet");
    // Update store to simulate KV having the first value
    store["usage_log:2026-03-01"] = env.ELECTION_DATA.put.mock.calls[0][1];

    await logTokenUsage(env, "guide", { input_tokens: 200, output_tokens: 100 }, "claude-3-sonnet");
    const stored = JSON.parse(env.ELECTION_DATA.put.mock.calls[1][1]);
    expect(stored.guide.input).toBe(300);
    expect(stored.guide.output).toBe(150);
    expect(stored.guide.calls).toBe(2);
  });

  it("tracks different components separately", async () => {
    const store = {};
    const env = mockEnv(store);
    await logTokenUsage(env, "guide", { input_tokens: 100, output_tokens: 50 }, "claude-3-sonnet");
    store["usage_log:2026-03-01"] = env.ELECTION_DATA.put.mock.calls[0][1];

    await logTokenUsage(env, "summary", { input_tokens: 200, output_tokens: 100 }, "claude-3-sonnet");
    const stored = JSON.parse(env.ELECTION_DATA.put.mock.calls[1][1]);
    expect(stored.guide.input).toBe(100);
    expect(stored.summary.input).toBe(200);
  });

  it("tracks per-model breakdown", async () => {
    const env = mockEnv();
    await logTokenUsage(env, "guide", { input_tokens: 100, output_tokens: 50 }, "claude-3-sonnet");
    const stored = JSON.parse(env.ELECTION_DATA.put.mock.calls[0][1]);
    expect(stored.guide.models["claude-3-sonnet"]).toBeDefined();
    expect(stored.guide.models["claude-3-sonnet"].input).toBe(100);
    expect(stored.guide.models["claude-3-sonnet"].output).toBe(50);
    expect(stored.guide.models["claude-3-sonnet"].calls).toBe(1);
  });

  it("tracks multiple models for the same component", async () => {
    const store = {};
    const env = mockEnv(store);
    await logTokenUsage(env, "guide", { input_tokens: 100, output_tokens: 50 }, "claude-3-sonnet");
    store["usage_log:2026-03-01"] = env.ELECTION_DATA.put.mock.calls[0][1];

    await logTokenUsage(env, "guide", { input_tokens: 80, output_tokens: 40 }, "claude-3-haiku");
    const stored = JSON.parse(env.ELECTION_DATA.put.mock.calls[1][1]);
    expect(stored.guide.models["claude-3-sonnet"].input).toBe(100);
    expect(stored.guide.models["claude-3-haiku"].input).toBe(80);
  });

  it("records lastCall timestamp", async () => {
    const env = mockEnv();
    await logTokenUsage(env, "guide", { input_tokens: 100, output_tokens: 50 }, "claude-3-sonnet");
    const stored = JSON.parse(env.ELECTION_DATA.put.mock.calls[0][1]);
    expect(stored.guide.lastCall).toBeDefined();
    expect(stored.guide.lastCall).toContain("2026-03-01");
  });

  it("sets 30-day TTL on the KV entry", async () => {
    const env = mockEnv();
    await logTokenUsage(env, "guide", { input_tokens: 100, output_tokens: 50 }, "claude-3-sonnet");
    const putArgs = env.ELECTION_DATA.put.mock.calls[0];
    expect(putArgs[2]).toEqual({ expirationTtl: 2592000 });
  });

  it("handles null usage gracefully (no-op)", async () => {
    const env = mockEnv();
    await logTokenUsage(env, "guide", null, "claude-3-sonnet");
    expect(env.ELECTION_DATA.put).not.toHaveBeenCalled();
  });

  it("handles undefined usage gracefully (no-op)", async () => {
    const env = mockEnv();
    await logTokenUsage(env, "guide", undefined, "claude-3-sonnet");
    expect(env.ELECTION_DATA.put).not.toHaveBeenCalled();
  });

  it("handles null env gracefully (no-op)", async () => {
    await expect(logTokenUsage(null, "guide", { input_tokens: 100, output_tokens: 50 })).resolves.toBeUndefined();
  });

  it("handles missing ELECTION_DATA (no-op)", async () => {
    await expect(logTokenUsage({}, "guide", { input_tokens: 100, output_tokens: 50 })).resolves.toBeUndefined();
  });

  it("handles usage with zero tokens", async () => {
    const env = mockEnv();
    await logTokenUsage(env, "guide", { input_tokens: 0, output_tokens: 0 }, "claude-3-sonnet");
    const stored = JSON.parse(env.ELECTION_DATA.put.mock.calls[0][1]);
    expect(stored.guide.input).toBe(0);
    expect(stored.guide.output).toBe(0);
    expect(stored.guide.calls).toBe(1);
  });

  it("handles usage with missing input_tokens field", async () => {
    const env = mockEnv();
    await logTokenUsage(env, "guide", { output_tokens: 50 }, "claude-3-sonnet");
    const stored = JSON.parse(env.ELECTION_DATA.put.mock.calls[0][1]);
    expect(stored.guide.input).toBe(0);
    expect(stored.guide.output).toBe(50);
  });

  it("handles usage with missing output_tokens field", async () => {
    const env = mockEnv();
    await logTokenUsage(env, "guide", { input_tokens: 100 }, "claude-3-sonnet");
    const stored = JSON.parse(env.ELECTION_DATA.put.mock.calls[0][1]);
    expect(stored.guide.input).toBe(100);
    expect(stored.guide.output).toBe(0);
  });

  it("handles null model name (no model breakdown)", async () => {
    const env = mockEnv();
    await logTokenUsage(env, "guide", { input_tokens: 100, output_tokens: 50 }, null);
    const stored = JSON.parse(env.ELECTION_DATA.put.mock.calls[0][1]);
    expect(stored.guide.input).toBe(100);
    expect(stored.guide.calls).toBe(1);
    // models should not have a null key entry
    expect(stored.guide.models).toEqual({});
  });

  it("handles undefined model name (no model breakdown)", async () => {
    const env = mockEnv();
    await logTokenUsage(env, "guide", { input_tokens: 100, output_tokens: 50 });
    const stored = JSON.parse(env.ELECTION_DATA.put.mock.calls[0][1]);
    expect(stored.guide.input).toBe(100);
    // models should still be an empty object from initial creation
    expect(stored.guide.models).toEqual({});
  });

  it("does not throw when KV.get fails", async () => {
    const env = mockEnv();
    env.ELECTION_DATA.get = vi.fn(async () => { throw new Error("KV read error"); });
    await expect(
      logTokenUsage(env, "guide", { input_tokens: 100, output_tokens: 50 }, "claude-3-sonnet")
    ).resolves.toBeUndefined();
  });

  it("does not throw when KV.put fails", async () => {
    const env = mockEnv();
    env.ELECTION_DATA.put = vi.fn(async () => { throw new Error("KV write error"); });
    await expect(
      logTokenUsage(env, "guide", { input_tokens: 100, output_tokens: 50 }, "claude-3-sonnet")
    ).resolves.toBeUndefined();
  });

  it("handles corrupt JSON in existing log gracefully", async () => {
    const store = { "usage_log:2026-03-01": "not json" };
    const env = mockEnv(store);
    // This should catch the JSON.parse error internally
    await expect(
      logTokenUsage(env, "guide", { input_tokens: 100, output_tokens: 50 }, "claude-3-sonnet")
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getUsageLog
// ---------------------------------------------------------------------------
describe("getUsageLog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00.000Z"));
  });

  it("returns empty object when no log exists", async () => {
    const env = mockEnv();
    const result = await getUsageLog(env);
    expect(result).toEqual({});
  });

  it("returns parsed log when it exists", async () => {
    const logData = { guide: { input: 100, output: 50, calls: 1 } };
    const env = mockEnv({ "usage_log:2026-03-01": JSON.stringify(logData) });
    const result = await getUsageLog(env);
    expect(result).toEqual(logData);
  });

  it("uses today's date by default", async () => {
    const env = mockEnv();
    await getUsageLog(env);
    expect(env.ELECTION_DATA.get).toHaveBeenCalledWith("usage_log:2026-03-01");
  });

  it("uses custom date when provided", async () => {
    const env = mockEnv();
    await getUsageLog(env, "2026-02-15");
    expect(env.ELECTION_DATA.get).toHaveBeenCalledWith("usage_log:2026-02-15");
  });
});

// ---------------------------------------------------------------------------
// estimateCost
// ---------------------------------------------------------------------------
describe("estimateCost", () => {
  it("returns empty costs for empty usage log", () => {
    const result = estimateCost({});
    expect(result._total).toBe(0);
  });

  it("calculates Sonnet pricing by default", () => {
    const usageLog = {
      guide: {
        input: 1_000_000,
        output: 100_000,
        calls: 10,
        models: {
          "claude-3-sonnet": { input: 1_000_000, output: 100_000, calls: 10 },
        },
      },
    };
    const result = estimateCost(usageLog);
    // Sonnet: $3/M input + $15/M output
    // 1M * 3 + 0.1M * 15 = 3 + 1.5 = 4.5
    expect(result.guide).toBe(4.5);
    expect(result._total).toBe(4.5);
  });

  it("calculates Haiku pricing", () => {
    const usageLog = {
      guide: {
        input: 1_000_000,
        output: 1_000_000,
        calls: 5,
        models: {
          "claude-3-haiku": { input: 1_000_000, output: 1_000_000, calls: 5 },
        },
      },
    };
    const result = estimateCost(usageLog);
    // Haiku: $0.25/M input + $1.25/M output
    // 1M * 0.25 + 1M * 1.25 = 0.25 + 1.25 = 1.5
    expect(result.guide).toBe(1.5);
  });

  it("calculates GPT-4o pricing", () => {
    const usageLog = {
      guide: {
        input: 1_000_000,
        output: 1_000_000,
        calls: 5,
        models: {
          "gpt-4o-something": { input: 1_000_000, output: 1_000_000, calls: 5 },
        },
      },
    };
    const result = estimateCost(usageLog);
    // GPT-4o: $2.5/M input + $10/M output
    // 1M * 2.5 + 1M * 10 = 2.5 + 10 = 12.5
    expect(result.guide).toBe(12.5);
  });

  it("calculates Gemini pricing", () => {
    const usageLog = {
      guide: {
        input: 1_000_000,
        output: 1_000_000,
        calls: 5,
        models: {
          "gemini-2-flash": { input: 1_000_000, output: 1_000_000, calls: 5 },
        },
      },
    };
    const result = estimateCost(usageLog);
    // Gemini: $0.15/M input + $0.60/M output
    // 1M * 0.15 + 1M * 0.60 = 0.75
    expect(result.guide).toBe(0.75);
  });

  it("calculates Grok pricing", () => {
    const usageLog = {
      guide: {
        input: 1_000_000,
        output: 1_000_000,
        calls: 5,
        models: {
          "grok-3-something": { input: 1_000_000, output: 1_000_000, calls: 5 },
        },
      },
    };
    const result = estimateCost(usageLog);
    // Grok: $3/M input + $15/M output = 3 + 15 = 18
    expect(result.guide).toBe(18);
  });

  it("aggregates costs across multiple models", () => {
    const usageLog = {
      guide: {
        input: 2_000_000,
        output: 200_000,
        calls: 10,
        models: {
          "claude-3-sonnet": { input: 1_000_000, output: 100_000, calls: 5 },
          "claude-3-haiku": { input: 1_000_000, output: 100_000, calls: 5 },
        },
      },
    };
    const result = estimateCost(usageLog);
    // Sonnet: 1M * 3 + 0.1M * 15 = 3 + 1.5 = 4.5
    // Haiku: 1M * 0.25 + 0.1M * 1.25 = 0.25 + 0.125 = 0.375
    // Total: 4.875
    expect(result.guide).toBe(4.875);
    expect(result._total).toBe(4.875);
  });

  it("aggregates costs across multiple components", () => {
    const usageLog = {
      guide: {
        input: 1_000_000, output: 100_000, calls: 5,
        models: { "claude-3-sonnet": { input: 1_000_000, output: 100_000, calls: 5 } },
      },
      summary: {
        input: 500_000, output: 50_000, calls: 3,
        models: { "claude-3-sonnet": { input: 500_000, output: 50_000, calls: 3 } },
      },
    };
    const result = estimateCost(usageLog);
    // Guide: 1M * 3 + 0.1M * 15 = 4.5
    // Summary: 0.5M * 3 + 0.05M * 15 = 1.5 + 0.75 = 2.25
    expect(result.guide).toBe(4.5);
    expect(result.summary).toBe(2.25);
    expect(result._total).toBe(6.75);
  });

  it("falls back to Sonnet pricing when no models breakdown", () => {
    const usageLog = {
      guide: {
        input: 1_000_000,
        output: 100_000,
        calls: 5,
        // no models field
      },
    };
    const result = estimateCost(usageLog);
    // Fallback Sonnet: 1M * 3 + 0.1M * 15 = 4.5
    expect(result.guide).toBe(4.5);
  });

  it("rounds costs to 4 decimal places", () => {
    const usageLog = {
      guide: {
        input: 333, output: 777, calls: 1,
        models: { "claude-3-sonnet": { input: 333, output: 777, calls: 1 } },
      },
    };
    const result = estimateCost(usageLog);
    // 333 * 3 / 1M + 777 * 15 / 1M = 0.000999 + 0.011655 = 0.012654
    expect(result.guide).toBe(0.0127); // rounded to 4 decimals
  });

  it("handles zero-token components", () => {
    const usageLog = {
      guide: {
        input: 0, output: 0, calls: 0,
        models: { "claude-3-sonnet": { input: 0, output: 0, calls: 0 } },
      },
    };
    const result = estimateCost(usageLog);
    expect(result.guide).toBe(0);
    expect(result._total).toBe(0);
  });
});

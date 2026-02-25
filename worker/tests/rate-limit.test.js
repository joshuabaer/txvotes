import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkRateLimit, rateLimitResponse } from "../src/rate-limit.js";

// ---------------------------------------------------------------------------
// Helper: create a mock KV namespace
// ---------------------------------------------------------------------------
function mockKV(store = {}) {
  return {
    get: vi.fn(async (key) => (store[key] !== undefined ? store[key] : null)),
    put: vi.fn(async (key, value, opts) => {
      store[key] = value;
    }),
  };
}

function mockEnv(store = {}) {
  return { ELECTION_DATA: mockKV(store) };
}

// ---------------------------------------------------------------------------
// checkRateLimit — unit tests
// ---------------------------------------------------------------------------
describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin to a known timestamp so window IDs are deterministic
    vi.setSystemTime(new Date("2026-03-01T12:00:30.000Z"));
  });

  it("allows the first request from an IP", async () => {
    const env = mockEnv();
    const result = await checkRateLimit(env, "1.2.3.4", "guide", 10, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.retryAfter).toBe(0);
  });

  it("allows requests up to the limit", async () => {
    const env = mockEnv();
    // Simulate 9 previous requests stored in KV
    const windowId = Math.floor(Date.now() / (60 * 1000));
    const key = "ratelimit:guide:1.2.3.4:" + windowId;
    env.ELECTION_DATA.get = vi.fn(async (k) => (k === key ? "9" : null));

    const result = await checkRateLimit(env, "1.2.3.4", "guide", 10, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("blocks requests over the limit", async () => {
    const env = mockEnv();
    const windowId = Math.floor(Date.now() / (60 * 1000));
    const key = "ratelimit:guide:1.2.3.4:" + windowId;
    env.ELECTION_DATA.get = vi.fn(async (k) => (k === key ? "10" : null));

    const result = await checkRateLimit(env, "1.2.3.4", "guide", 10, 60);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(60);
  });

  it("uses different counters for different IPs", async () => {
    const store = {};
    const env = mockEnv(store);

    // First IP makes 5 requests
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(env, "10.0.0.1", "guide", 10, 60);
    }

    // Second IP should still be allowed — fresh counter
    const result = await checkRateLimit(env, "10.0.0.2", "guide", 10, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("uses different counters for different endpoints", async () => {
    const store = {};
    const env = mockEnv(store);

    // Hit guide endpoint up to the limit
    const windowId = Math.floor(Date.now() / (60 * 1000));
    const guideKey = "ratelimit:guide:1.2.3.4:" + windowId;
    store[guideKey] = "10";

    const guideResult = await checkRateLimit(env, "1.2.3.4", "guide", 10, 60);
    expect(guideResult.allowed).toBe(false);

    // Summary endpoint should still be allowed
    const summaryResult = await checkRateLimit(env, "1.2.3.4", "summary", 10, 60);
    expect(summaryResult.allowed).toBe(true);
  });

  it("increments the counter on each allowed request", async () => {
    const store = {};
    const env = mockEnv(store);

    await checkRateLimit(env, "1.2.3.4", "guide", 10, 60);
    expect(env.ELECTION_DATA.put).toHaveBeenCalledTimes(1);
    const putArgs = env.ELECTION_DATA.put.mock.calls[0];
    expect(putArgs[1]).toBe("1"); // first increment
    expect(putArgs[2]).toEqual({ expirationTtl: 60 });
  });

  it("sets expirationTtl to at least 60 seconds (Cloudflare KV minimum)", async () => {
    const env = mockEnv();
    // Use a 30-second window — TTL should still be 60
    await checkRateLimit(env, "1.2.3.4", "guide", 10, 30);
    const putArgs = env.ELECTION_DATA.put.mock.calls[0];
    expect(putArgs[2].expirationTtl).toBe(60);
  });

  // -------------------------------------------------------------------------
  // Fail-open behavior
  // -------------------------------------------------------------------------
  describe("fail-open behavior", () => {
    it("allows request when env is null", async () => {
      const result = await checkRateLimit(null, "1.2.3.4", "guide");
      expect(result.allowed).toBe(true);
    });

    it("allows request when ELECTION_DATA is missing", async () => {
      const result = await checkRateLimit({}, "1.2.3.4", "guide");
      expect(result.allowed).toBe(true);
    });

    it("allows request when ip is null", async () => {
      const env = mockEnv();
      const result = await checkRateLimit(env, null, "guide");
      expect(result.allowed).toBe(true);
    });

    it("allows request when ip is empty string", async () => {
      const env = mockEnv();
      const result = await checkRateLimit(env, "", "guide");
      expect(result.allowed).toBe(true);
    });

    it("allows request when KV.get throws", async () => {
      const env = mockEnv();
      env.ELECTION_DATA.get = vi.fn(async () => {
        throw new Error("KV read failed");
      });
      const result = await checkRateLimit(env, "1.2.3.4", "guide");
      expect(result.allowed).toBe(true);
    });

    it("allows request when KV.put throws (write failure)", async () => {
      const env = mockEnv();
      env.ELECTION_DATA.put = vi.fn(async () => {
        throw new Error("KV write failed");
      });
      const result = await checkRateLimit(env, "1.2.3.4", "guide");
      // put is fire-and-forget so the request should still succeed
      expect(result.allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // retryAfter calculation
  // -------------------------------------------------------------------------
  it("calculates retryAfter as seconds until window end", async () => {
    // We are 30s into a 60s window (12:00:30)
    const env = mockEnv();
    const windowId = Math.floor(Date.now() / (60 * 1000));
    const key = "ratelimit:guide:1.2.3.4:" + windowId;
    env.ELECTION_DATA.get = vi.fn(async (k) => (k === key ? "10" : null));

    const result = await checkRateLimit(env, "1.2.3.4", "guide", 10, 60);
    expect(result.allowed).toBe(false);
    // 30 seconds remain in the current 60-second window
    expect(result.retryAfter).toBe(30);
  });

  it("returns retryAfter of at least 1 even at window boundary", async () => {
    // Set time to exactly on a window boundary
    vi.setSystemTime(new Date("2026-03-01T12:01:00.000Z"));
    const env = mockEnv();
    const windowId = Math.floor(Date.now() / (60 * 1000));
    const key = "ratelimit:guide:1.2.3.4:" + windowId;
    env.ELECTION_DATA.get = vi.fn(async (k) => (k === key ? "10" : null));

    const result = await checkRateLimit(env, "1.2.3.4", "guide", 10, 60);
    expect(result.allowed).toBe(false);
    // At the boundary, retryAfter would be exactly 60 (full window remaining)
    // or 1 (minimum) — the important thing is it's >= 1
    expect(result.retryAfter).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Custom limits
  // -------------------------------------------------------------------------
  it("respects custom maxRequests", async () => {
    const env = mockEnv();
    const windowId = Math.floor(Date.now() / (60 * 1000));
    const key = "ratelimit:guide:1.2.3.4:" + windowId;
    env.ELECTION_DATA.get = vi.fn(async (k) => (k === key ? "3" : null));

    const result = await checkRateLimit(env, "1.2.3.4", "guide", 3, 60);
    expect(result.allowed).toBe(false);
  });

  it("respects custom windowSeconds for key generation", async () => {
    const env = mockEnv();
    // With a 120-second window, windowId should differ from 60-second window
    await checkRateLimit(env, "1.2.3.4", "guide", 10, 120);
    const putKey = env.ELECTION_DATA.put.mock.calls[0][0];
    const windowId120 = Math.floor(Date.now() / (120 * 1000));
    expect(putKey).toContain(":" + windowId120);
  });
});

// ---------------------------------------------------------------------------
// rateLimitResponse — unit tests
// ---------------------------------------------------------------------------
describe("rateLimitResponse", () => {
  it("returns a 429 status", () => {
    const resp = rateLimitResponse(30);
    expect(resp.status).toBe(429);
  });

  it("includes Retry-After header", () => {
    const resp = rateLimitResponse(42);
    expect(resp.headers.get("Retry-After")).toBe("42");
  });

  it("includes Content-Type application/json", () => {
    const resp = rateLimitResponse(10);
    expect(resp.headers.get("Content-Type")).toBe("application/json");
  });

  it("includes CORS header", () => {
    const resp = rateLimitResponse(10);
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("body contains error message and retryAfter", async () => {
    const resp = rateLimitResponse(25);
    const body = await resp.json();
    expect(body.error).toContain("Too many requests");
    expect(body.retryAfter).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Integration-style: sequential requests through checkRateLimit
// ---------------------------------------------------------------------------
describe("rate limiter integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00.000Z"));
  });

  it("allows exactly maxRequests then blocks the next", async () => {
    const store = {};
    const env = mockEnv(store);

    for (let i = 0; i < 10; i++) {
      const result = await checkRateLimit(env, "5.6.7.8", "guide", 10, 60);
      expect(result.allowed).toBe(true);
    }

    // 11th request should be blocked
    const blocked = await checkRateLimit(env, "5.6.7.8", "guide", 10, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resets after the window rolls over", async () => {
    const store = {};
    const env = mockEnv(store);

    // Exhaust the limit
    for (let i = 0; i < 10; i++) {
      await checkRateLimit(env, "5.6.7.8", "guide", 10, 60);
    }
    const blocked = await checkRateLimit(env, "5.6.7.8", "guide", 10, 60);
    expect(blocked.allowed).toBe(false);

    // Advance time past the window
    vi.setSystemTime(new Date("2026-03-01T12:01:01.000Z"));

    const fresh = await checkRateLimit(env, "5.6.7.8", "guide", 10, 60);
    expect(fresh.allowed).toBe(true);
    expect(fresh.remaining).toBe(9);
  });
});

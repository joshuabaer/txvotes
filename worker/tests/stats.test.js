import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the worker module
import worker from "../src/index.js";

// ---------------------------------------------------------------------------
// Mock env — provides a fake ELECTION_DATA KV namespace
// ---------------------------------------------------------------------------
const sampleBallot = readFileSync(
  join(__dirname, "fixtures/sample-ballot.json"),
  "utf-8"
);

const kvStore = {
  "ballot:statewide:democrat_primary_2026": sampleBallot,
  "ballot:statewide:republican_primary_2026": sampleBallot,
  "manifest": JSON.stringify({
    republican: { updatedAt: new Date().toISOString(), version: "1" },
    democrat: { updatedAt: new Date().toISOString(), version: "1" },
  }),
  "audit:summary": JSON.stringify({
    providers: {
      chatgpt: { score: 8.5 },
      gemini: { score: 9.0 },
      grok: { score: 7.5 },
      claude: { score: 8.0 },
    },
    averageScore: 8.25,
    completedAt: new Date().toISOString(),
  }),
};

const mockEnv = {
  ELECTION_DATA: {
    get: async (key) => kvStore[key] || null,
    put: async () => {},
    list: async ({ prefix } = {}) => {
      const keys = Object.keys(kvStore)
        .filter((k) => !prefix || k.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  },
  ADMIN_SECRET: "test-secret-123",
  ANTHROPIC_API_KEY: "sk-test",
  // No CF_ACCOUNT_ID / CF_API_TOKEN — tests without Analytics Engine
};

/** Helper: make a GET request to the worker */
async function get(path) {
  const url = `https://txvotes.app${path}`;
  const request = new Request(url, { method: "GET" });
  return worker.fetch(request, mockEnv);
}

// ---------------------------------------------------------------------------
// Stats page — basic rendering
// ---------------------------------------------------------------------------
describe("Stats page: basic rendering", () => {
  it("GET /stats returns 200 with HTML", async () => {
    const res = await get("/stats");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("contains expected page structure", async () => {
    const res = await get("/stats");
    const body = await res.text();
    expect(body).toContain("<!DOCTYPE html");
    expect(body).toContain("<title>");
    expect(body).toContain("Stats");
  });

  it("has Cache-Control header set to public, max-age=900", async () => {
    const res = await get("/stats");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=900");
  });

  it("contains hero stat cards", async () => {
    const res = await get("/stats");
    const body = await res.text();
    expect(body).toContain("Guides Generated");
    expect(body).toContain("Interviews Completed");
    expect(body).toContain("I Voted Clicks");
    expect(body).toContain("Cheat Sheets Printed");
    expect(body).toContain("Counties Covered");
    expect(body).toContain("AI Fairness Score");
  });

  it("contains data quality section", async () => {
    const res = await get("/stats");
    const body = await res.text();
    expect(body).toContain("Data Quality");
    expect(body).toContain("Candidate Completeness");
    expect(body).toContain("Races Tracked");
    expect(body).toContain("Balance Score");
  });

  it("contains AI fairness section with provider scores", async () => {
    const res = await get("/stats");
    const body = await res.text();
    expect(body).toContain("AI Fairness Audit");
    expect(body).toContain("ChatGPT");
    expect(body).toContain("Gemini");
    expect(body).toContain("Grok");
    expect(body).toContain("Claude");
  });

  it("contains related links", async () => {
    const res = await get("/stats");
    const body = await res.text();
    expect(body).toContain("/how-it-works");
    expect(body).toContain("/data-quality");
    expect(body).toContain("/audit");
    expect(body).toContain("/nonpartisan");
    expect(body).toContain("/open-source");
    expect(body).toContain("/candidates");
  });

  it("contains CTA banner", async () => {
    const res = await get("/stats");
    const body = await res.text();
    expect(body).toContain("Build My Voting Guide");
    expect(body).toContain("/tx/app?start=1");
  });

  it("contains footer", async () => {
    const res = await get("/stats");
    const body = await res.text();
    expect(body).toContain("page-footer");
    expect(body).toContain("howdy@txvotes.app");
  });

  it("contains OG meta tags", async () => {
    const res = await get("/stats");
    const body = await res.text();
    expect(body).toContain('og:title');
    expect(body).toContain('og:description');
    expect(body).toContain("txvotes.app/stats");
  });
});

// ---------------------------------------------------------------------------
// Stats page — security: no sensitive data exposed
// ---------------------------------------------------------------------------
describe("Stats page: security", () => {
  it("does not expose API keys", async () => {
    const res = await get("/stats");
    const body = await res.text();
    expect(body).not.toContain("sk-");
    expect(body).not.toContain("ANTHROPIC_API_KEY");
    expect(body).not.toContain("ADMIN_SECRET");
    expect(body).not.toContain("CF_API_TOKEN");
    expect(body).not.toContain("CF_ACCOUNT_ID");
  });

  it("does not expose token counts or cost estimates", async () => {
    const res = await get("/stats");
    const body = await res.text();
    expect(body).not.toContain("input_tokens");
    expect(body).not.toContain("output_tokens");
    expect(body).not.toContain("estimateCost");
    expect(body).not.toContain("_total");
  });

  it("does not expose error messages or internal KV keys", async () => {
    const res = await get("/stats");
    const body = await res.text();
    expect(body).not.toContain("usage_log:");
    expect(body).not.toContain("ballot:statewide:");
    expect(body).not.toContain("audit:result:");
    expect(body).not.toContain("rate_limit");
  });

  it("does not expose individual user data", async () => {
    const res = await get("/stats");
    const body = await res.text();
    expect(body).not.toContain("user_id");
    expect(body).not.toContain("ip_address");
    expect(body).not.toContain("voter_profile");
  });
});

// ---------------------------------------------------------------------------
// Stats page — graceful degradation without Analytics Engine
// ---------------------------------------------------------------------------
describe("Stats page: graceful degradation", () => {
  it("shows dash values for AE metrics when AE is unavailable", async () => {
    const res = await get("/stats");
    const body = await res.text();
    // Without AE credentials, hero cards should show em-dash for AE-sourced values
    expect(body).toContain("\u2014"); // em-dash for unavailable AE data
  });

  it("shows 'not yet available' message for activity chart without AE", async () => {
    const res = await get("/stats");
    const body = await res.text();
    expect(body).toContain("Usage analytics are not yet available");
  });

  it("still shows KV-derived stats (counties, data quality, fairness) without AE", async () => {
    const res = await get("/stats");
    const body = await res.text();
    // Data quality section should still have real values from ballot data
    expect(body).toContain("Candidate Completeness");
    expect(body).toContain("Races Tracked");
    // AI fairness from audit:summary
    expect(body).toContain("8.25");
  });
});

// ---------------------------------------------------------------------------
// Stats page — cache behavior
// ---------------------------------------------------------------------------
describe("Stats page: cache behavior", () => {
  it("stores cache in KV on first request", async () => {
    let putCalledWith = null;
    const cachingEnv = {
      ...mockEnv,
      ELECTION_DATA: {
        ...mockEnv.ELECTION_DATA,
        get: async (key) => {
          // Return null for cache key to force rebuild
          if (key === "public_stats_cache") return null;
          return kvStore[key] || null;
        },
        put: async (key, value, opts) => {
          if (key === "public_stats_cache") {
            putCalledWith = { key, value, opts };
          }
        },
      },
    };

    const url = "https://txvotes.app/stats";
    const request = new Request(url, { method: "GET" });
    await worker.fetch(request, cachingEnv);

    expect(putCalledWith).not.toBeNull();
    expect(putCalledWith.key).toBe("public_stats_cache");
    const cached = JSON.parse(putCalledWith.value);
    expect(cached.html).toBeDefined();
    expect(cached.expiresAt).toBeDefined();
    expect(cached.expiresAt).toBeGreaterThan(Date.now());
  });

  it("serves from cache when cache is fresh", async () => {
    const cachedHtml = `<!DOCTYPE html><html><head></head><body><h1>Cached Stats</h1></body></html>`;
    const cachedStats = JSON.stringify({
      html: cachedHtml,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes from now
    });

    const cachingEnv = {
      ...mockEnv,
      ELECTION_DATA: {
        ...mockEnv.ELECTION_DATA,
        get: async (key) => {
          if (key === "public_stats_cache") return cachedStats;
          return kvStore[key] || null;
        },
        put: async () => {},
      },
    };

    const url = "https://txvotes.app/stats";
    const request = new Request(url, { method: "GET" });
    const res = await worker.fetch(request, cachingEnv);
    const body = await res.text();

    expect(body).toBe(cachedHtml);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=900");
  });

  it("rebuilds when cache is expired", async () => {
    const expiredCache = JSON.stringify({
      html: "<html><body>Old</body></html>",
      expiresAt: Date.now() - 1000, // expired
    });

    const cachingEnv = {
      ...mockEnv,
      ELECTION_DATA: {
        ...mockEnv.ELECTION_DATA,
        get: async (key) => {
          if (key === "public_stats_cache") return expiredCache;
          return kvStore[key] || null;
        },
        put: async () => {},
      },
    };

    const url = "https://txvotes.app/stats";
    const request = new Request(url, { method: "GET" });
    const res = await worker.fetch(request, cachingEnv);
    const body = await res.text();

    // Should have rebuilt — contains full stats page, not old cached content
    expect(body).toContain("Stats");
    expect(body).toContain("Guides Generated");
    expect(body).not.toBe("<html><body>Old</body></html>");
  });
});

// ---------------------------------------------------------------------------
// Stats page — Spanish translation support
// ---------------------------------------------------------------------------
describe("Stats page: i18n support", () => {
  it("contains i18n script with Spanish translations", async () => {
    const res = await get("/stats");
    const body = await res.text();
    expect(body).toContain("lang-toggle");
    expect(body).toContain("Estad\u00EDsticas"); // Stats in Spanish
  });

  it("has data-t attributes for translatable content", async () => {
    const res = await get("/stats");
    const body = await res.text();
    expect(body).toContain('data-t="Stats"');
    expect(body).toContain('data-t="Guides Generated"');
    expect(body).toContain('data-t="AI Fairness Score"');
    expect(body).toContain('data-t="Data Quality"');
  });
});

// ---------------------------------------------------------------------------
// Stats page — link in footer
// ---------------------------------------------------------------------------
describe("Stats page: footer link presence", () => {
  it("other pages include /stats link in footer", async () => {
    const res = await get("/how-it-works");
    const body = await res.text();
    expect(body).toContain('href="/stats"');
  });

  it("landing page footer includes /stats link", async () => {
    const res = await get("/");
    const body = await res.text();
    expect(body).toContain('href="/stats"');
  });
});

// ---------------------------------------------------------------------------
// Stats page — without audit data
// ---------------------------------------------------------------------------
describe("Stats page: without audit data", () => {
  it("shows pending state when audit:summary is missing", async () => {
    const noAuditEnv = {
      ...mockEnv,
      ELECTION_DATA: {
        ...mockEnv.ELECTION_DATA,
        get: async (key) => {
          if (key === "audit:summary") return null;
          if (key === "public_stats_cache") return null;
          return kvStore[key] || null;
        },
        put: async () => {},
      },
    };

    const url = "https://txvotes.app/stats";
    const request = new Request(url, { method: "GET" });
    const res = await worker.fetch(request, noAuditEnv);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toContain("Pending");
    expect(body).toContain("Audit results are pending");
  });
});

// ---------------------------------------------------------------------------
// Stats page — without ballot data
// ---------------------------------------------------------------------------
describe("Stats page: without ballot data", () => {
  it("still renders with empty KV store", async () => {
    const emptyEnv = {
      ...mockEnv,
      ELECTION_DATA: {
        get: async () => null,
        put: async () => {},
        list: async () => ({ keys: [], list_complete: true }),
      },
    };

    const url = "https://txvotes.app/stats";
    const request = new Request(url, { method: "GET" });
    const res = await worker.fetch(request, emptyEnv);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Stats");
    expect(body).toContain("Guides Generated");
  });
});

// ---------------------------------------------------------------------------
// Admin analytics filtering — admin activity excluded from stats
// ---------------------------------------------------------------------------
describe("Admin analytics filtering", () => {
  /** Helper: POST an analytics event to /tx/app/api/ev */
  async function postEvent(body, headers = {}) {
    const url = "https://txvotes.app/tx/app/api/ev";
    const request = new Request(url, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...headers },
    });
    return worker.fetch(request, analyticsEnv);
  }

  // Mock ANALYTICS binding to track writeDataPoint calls
  let writeDataPointCalls;
  const analyticsEnv = {
    ...mockEnv,
    ANALYTICS: {
      writeDataPoint: (dp) => {
        writeDataPointCalls.push(dp);
      },
    },
  };

  // Reset before each test
  beforeEach(() => {
    writeDataPointCalls = [];
  });

  it("writes data point for regular (non-admin) events", async () => {
    const res = await postEvent({ event: "guide_complete", props: { lang: "en" } });
    expect(res.status).toBe(204);
    expect(writeDataPointCalls.length).toBe(1);
    expect(writeDataPointCalls[0].blobs[0]).toBe("guide_complete");
  });

  it("skips data point when Authorization header has valid Bearer token", async () => {
    const res = await postEvent(
      { event: "guide_complete", props: { lang: "en" } },
      { Authorization: `Bearer ${mockEnv.ADMIN_SECRET}` }
    );
    expect(res.status).toBe(204);
    expect(writeDataPointCalls.length).toBe(0);
  });

  it("skips data point when Authorization header has valid Basic auth", async () => {
    const encoded = btoa(`admin:${mockEnv.ADMIN_SECRET}`);
    const res = await postEvent(
      { event: "interview_complete", props: { lang: "en" } },
      { Authorization: `Basic ${encoded}` }
    );
    expect(res.status).toBe(204);
    expect(writeDataPointCalls.length).toBe(0);
  });

  it("skips data point when body contains valid _admin_key", async () => {
    const res = await postEvent({
      event: "guide_complete",
      props: { lang: "en" },
      _admin_key: mockEnv.ADMIN_SECRET,
    });
    expect(res.status).toBe(204);
    expect(writeDataPointCalls.length).toBe(0);
  });

  it("does NOT skip when _admin_key is wrong", async () => {
    const res = await postEvent({
      event: "guide_complete",
      props: { lang: "en" },
      _admin_key: "wrong-secret",
    });
    expect(res.status).toBe(204);
    expect(writeDataPointCalls.length).toBe(1);
  });

  it("does NOT skip when Authorization header has wrong token", async () => {
    const res = await postEvent(
      { event: "guide_complete", props: { lang: "en" } },
      { Authorization: "Bearer wrong-token" }
    );
    expect(res.status).toBe(204);
    expect(writeDataPointCalls.length).toBe(1);
  });

  it("still returns 204 when admin event is skipped (silent to client)", async () => {
    const res = await postEvent(
      { event: "i_voted", props: {} },
      { Authorization: `Bearer ${mockEnv.ADMIN_SECRET}` }
    );
    expect(res.status).toBe(204);
  });

  it("skips all event types for admin requests", async () => {
    const events = ["interview_start", "guide_complete", "tone_select", "page_view", "i_voted"];
    for (const evt of events) {
      writeDataPointCalls = [];
      await postEvent({
        event: evt,
        props: { lang: "en" },
        _admin_key: mockEnv.ADMIN_SECRET,
      });
      expect(writeDataPointCalls.length).toBe(0);
    }
  });

  it("does not skip when ADMIN_SECRET is not configured", async () => {
    const noSecretEnv = {
      ...analyticsEnv,
      ADMIN_SECRET: undefined,
    };
    const url = "https://txvotes.app/tx/app/api/ev";
    const request = new Request(url, {
      method: "POST",
      body: JSON.stringify({
        event: "guide_complete",
        props: { lang: "en" },
        _admin_key: "some-key",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await worker.fetch(request, noSecretEnv);
    expect(res.status).toBe(204);
    expect(writeDataPointCalls.length).toBe(1);
  });
});

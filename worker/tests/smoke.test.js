import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the worker module (default export with fetch method)
import worker from "../src/index.js";

// ---------------------------------------------------------------------------
// Mock env — provides a fake ELECTION_DATA KV namespace and secrets.
// Routes that read from KV will get null/empty, but should still return
// valid HTML/JSON (not 500).
// ---------------------------------------------------------------------------
const sampleBallot = readFileSync(
  join(__dirname, "fixtures/sample-ballot.json"),
  "utf-8"
);

const kvStore = {
  "ballot:statewide:democrat_primary_2026": sampleBallot,
  "ballot:statewide:republican_primary_2026": sampleBallot,
  "ballot:democrat_primary_2026": sampleBallot,
  "ballot:republican_primary_2026": sampleBallot,
  "manifest": JSON.stringify({ version: "test", updatedAt: new Date().toISOString() }),
  "audit:summary": JSON.stringify({ providers: {}, averageScore: null }),
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
};

/** Helper: make a GET request to the worker and return the Response */
async function get(path) {
  const url = `https://txvotes.app${path}`;
  const request = new Request(url, { method: "GET" });
  return worker.fetch(request, mockEnv);
}

// ---------------------------------------------------------------------------
// Static HTML pages — should all return 200 with HTML content
// ---------------------------------------------------------------------------
const htmlRoutes = [
  { path: "/", name: "Landing page", expectTitle: "Texas Votes" },
  { path: "/app", name: "PWA app shell", expectTitle: "Texas Votes" },
  { path: "/privacy", name: "Privacy policy", expectContain: "privacy" },
  { path: "/nonpartisan", name: "Nonpartisan pledge", expectContain: "nonpartisan" },
  { path: "/how-it-works", name: "How It Works", expectContain: "How" },
  { path: "/data-quality", name: "Data Quality", expectContain: "data" },
  { path: "/audit", name: "Audit page", expectContain: "audit" },
  { path: "/candidates", name: "Candidates index", expectContain: "candid" },
  { path: "/open-source", name: "Open Source", expectContain: "open" },
  { path: "/sample", name: "Sample ballot", expectContain: "sample" },
  { path: "/support", name: "Support page", expectContain: "support" },
  { path: "/stats", name: "Stats page", expectContain: "stats" },
];

describe("Smoke tests: HTML pages return 200", () => {
  for (const route of htmlRoutes) {
    it(`GET ${route.path} -> 200 (${route.name})`, async () => {
      const res = await get(route.path);
      expect(res.status).toBe(200);

      const ct = res.headers.get("Content-Type");
      expect(ct).toContain("text/html");

      const body = await res.text();

      // Every HTML page should have basic structure
      expect(body).toContain("<!DOCTYPE html");
      expect(body).toContain("<title>");

      // Check for expected title if specified
      if (route.expectTitle) {
        expect(body.toLowerCase()).toContain(route.expectTitle.toLowerCase());
      }

      // Check for expected content substring (case-insensitive)
      if (route.expectContain) {
        expect(body.toLowerCase()).toContain(route.expectContain.toLowerCase());
      }

      // No error indicators
      expect(body).not.toContain("Error 1101");
      expect(body).not.toContain("Error 1015");
      expect(body).not.toContain("Internal Server Error");
    });
  }
});

// ---------------------------------------------------------------------------
// PWA assets
// ---------------------------------------------------------------------------
describe("Smoke tests: PWA assets", () => {
  it("GET /app/sw.js -> 200 with JavaScript content type", async () => {
    const res = await get("/app/sw.js");
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type");
    expect(ct).toContain("javascript");
    const body = await res.text();
    expect(body.length).toBeGreaterThan(100);
  });

  it("GET /app/manifest.json -> 200 with JSON content type", async () => {
    const res = await get("/app/manifest.json");
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type");
    expect(ct).toContain("json");
    const body = await res.json();
    expect(body).toHaveProperty("name");
    expect(body).toHaveProperty("start_url");
  });

  it("GET /app/clear -> 200 with HTML", async () => {
    const res = await get("/app/clear");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<!DOCTYPE html");
  });
});

// ---------------------------------------------------------------------------
// JSON API endpoints — should return 200 with valid JSON
// ---------------------------------------------------------------------------
describe("Smoke tests: API endpoints return valid JSON", () => {
  it("GET /api/balance-check -> 200 with JSON report", async () => {
    const res = await get("/api/balance-check");
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type");
    expect(ct).toContain("json");
    const body = await res.json();
    expect(body).toBeDefined();
    expect(typeof body).toBe("object");
  });

  it("GET /api/audit/export -> 200 with full export JSON", async () => {
    const res = await get("/api/audit/export");
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type");
    expect(ct).toContain("json");
    const body = await res.json();
    expect(body).toHaveProperty("_meta");
    expect(body).toHaveProperty("guideGeneration");
    expect(body).toHaveProperty("nonpartisanSafeguards");
  });

  it("GET /api/audit/results -> 200 with JSON", async () => {
    const res = await get("/api/audit/results");
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type");
    expect(ct).toContain("json");
    const body = await res.json();
    expect(body).toBeDefined();
    expect(typeof body).toBe("object");
  });

  it("GET /api/election/manifest -> 200 with JSON", async () => {
    const res = await get("/api/election/manifest");
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type");
    expect(ct).toContain("json");
  });

  it("GET /app/api/ballot?party=democrat -> 200 with JSON", async () => {
    const res = await get("/app/api/ballot?party=democrat");
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type");
    expect(ct).toContain("json");
  });

  it("GET /app/api/manifest -> 200 with JSON", async () => {
    const res = await get("/app/api/manifest");
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type");
    expect(ct).toContain("json");
  });
});

// ---------------------------------------------------------------------------
// Vanity entry points — should return 200 (they serve the PWA clear page)
// ---------------------------------------------------------------------------
describe("Smoke tests: Vanity entry points", () => {
  const vanityRoutes = [
    { path: "/cowboy", name: "Cowboy tone" },
    { path: "/chef", name: "Swedish Chef tone" },
    { path: "/gemini", name: "Gemini LLM" },
    { path: "/grok", name: "Grok LLM" },
    { path: "/chatgpt", name: "ChatGPT LLM" },
  ];

  for (const route of vanityRoutes) {
    it(`GET ${route.path} -> 200 (${route.name})`, async () => {
      const res = await get(route.path);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("<!DOCTYPE html");
    });
  }
});

// ---------------------------------------------------------------------------
// Unknown routes — GET falls through to landing page, POST returns 404
// ---------------------------------------------------------------------------
describe("Smoke tests: unknown route handling", () => {
  it("GET /nonexistent -> 200 (serves landing page as fallback)", async () => {
    const res = await get("/nonexistent-page-that-does-not-exist");
    // Unknown GET routes fall through to the landing page handler
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Texas Votes");
  });

  it("POST to unknown route -> 404", async () => {
    const url = "https://txvotes.app/nonexistent-api";
    const request = new Request(url, { method: "POST" });
    const res = await worker.fetch(request, mockEnv);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Response headers — basic content-type checks
// ---------------------------------------------------------------------------
describe("Smoke tests: Response headers", () => {
  it("Landing page has Content-Type text/html", async () => {
    const res = await get("/");
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("API endpoint has Content-Type application/json", async () => {
    const res = await get("/api/audit/export");
    expect(res.headers.get("Content-Type")).toContain("json");
  });
});

// ---------------------------------------------------------------------------
// Security.txt (RFC 9116)
// ---------------------------------------------------------------------------
describe("Smoke tests: /.well-known/security.txt", () => {
  it("GET /.well-known/security.txt -> 200 with text/plain", async () => {
    const res = await get("/.well-known/security.txt");
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type");
    expect(ct).toContain("text/plain");
  });

  it("contains required Contact field", async () => {
    const res = await get("/.well-known/security.txt");
    const body = await res.text();
    expect(body).toContain("Contact: mailto:security@txvotes.app");
  });

  it("contains Expires field", async () => {
    const res = await get("/.well-known/security.txt");
    const body = await res.text();
    expect(body).toContain("Expires:");
  });

  it("contains Canonical field pointing to txvotes.app", async () => {
    const res = await get("/.well-known/security.txt");
    const body = await res.text();
    expect(body).toContain("Canonical: https://txvotes.app/.well-known/security.txt");
  });

  it("has Cache-Control header set to public, max-age=86400", async () => {
    const res = await get("/.well-known/security.txt");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400");
  });
});

// ---------------------------------------------------------------------------
// No crashes — all routes complete without throwing
// ---------------------------------------------------------------------------
describe("Smoke tests: No unhandled exceptions", () => {
  const allGetRoutes = [
    "/", "/app", "/privacy", "/nonpartisan", "/how-it-works",
    "/data-quality", "/audit", "/candidates", "/open-source",
    "/sample", "/support", "/stats", "/app/clear", "/app/sw.js",
    "/app/manifest.json", "/cowboy", "/chef",
    "/api/audit/export", "/api/balance-check",
    "/.well-known/security.txt",
  ];

  for (const path of allGetRoutes) {
    it(`GET ${path} does not throw`, async () => {
      await expect(get(path)).resolves.toBeDefined();
    });
  }
});

// ---------------------------------------------------------------------------
// Admin cleanup endpoint
// ---------------------------------------------------------------------------
describe("Smoke tests: POST /api/admin/cleanup", () => {
  /** Helper: make a POST request with admin auth */
  async function postAdmin(path) {
    const url = `https://txvotes.app${path}`;
    const request = new Request(url, {
      method: "POST",
      headers: { Authorization: "Bearer test-secret-123" },
    });
    return worker.fetch(request, mockEnv);
  }

  it("returns 401 without auth", async () => {
    const url = "https://txvotes.app/api/admin/cleanup";
    const request = new Request(url, { method: "POST" });
    const res = await worker.fetch(request, mockEnv);
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong auth", async () => {
    const url = "https://txvotes.app/api/admin/cleanup";
    const request = new Request(url, {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
    });
    const res = await worker.fetch(request, mockEnv);
    expect(res.status).toBe(401);
  });

  it("dry-run (default) returns 200 with JSON report", async () => {
    const res = await postAdmin("/api/admin/cleanup");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dryRun).toBe(true);
    expect(body.totalKeys).toBeGreaterThan(0);
    expect(body.categories).toBeDefined();
    expect(body.stale).toBeDefined();
    expect(typeof body.staleCount).toBe("number");
    expect(body.deletedCount).toBe(0);
  });

  it("categorizes statewide ballots correctly", async () => {
    const res = await postAdmin("/api/admin/cleanup");
    const body = await res.json();
    expect(body.categories.statewideBallots).toBeDefined();
    expect(body.categories.statewideBallots.count).toBe(2);
  });

  it("categorizes legacy ballot keys correctly", async () => {
    const res = await postAdmin("/api/admin/cleanup");
    const body = await res.json();
    expect(body.categories.legacyBallots).toBeDefined();
    expect(body.categories.legacyBallots.count).toBe(2);
    expect(body.categories.legacyBallots.keys).toContain("ballot:democrat_primary_2026");
    expect(body.categories.legacyBallots.keys).toContain("ballot:republican_primary_2026");
  });

  it("identifies legacy ballot keys as stale", async () => {
    const res = await postAdmin("/api/admin/cleanup");
    const body = await res.json();
    const staleKeys = body.stale.map(s => s.key);
    expect(staleKeys).toContain("ballot:democrat_primary_2026");
    expect(staleKeys).toContain("ballot:republican_primary_2026");
    const legacyStale = body.stale.filter(s => s.reason.includes("Legacy"));
    expect(legacyStale.length).toBe(2);
  });

  it("categorizes manifest key", async () => {
    const res = await postAdmin("/api/admin/cleanup");
    const body = await res.json();
    expect(body.categories.manifest).toBeDefined();
    expect(body.categories.manifest.count).toBe(1);
  });

  it("categorizes audit:summary as auditOther", async () => {
    const res = await postAdmin("/api/admin/cleanup");
    const body = await res.json();
    expect(body.categories.auditOther).toBeDefined();
    expect(body.categories.auditOther.keys).toContain("audit:summary");
  });

  it("does not delete in dry-run mode", async () => {
    const res = await postAdmin("/api/admin/cleanup");
    const body = await res.json();
    expect(body.dryRun).toBe(true);
    expect(body.deletedCount).toBe(0);
  });

  it("explicit dry-run=true returns dry-run results", async () => {
    const res = await postAdmin("/api/admin/cleanup?dry-run=true");
    const body = await res.json();
    expect(body.dryRun).toBe(true);
    expect(body.deletedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Admin cleanup with rich mock data (old logs, county data, etc.)
// ---------------------------------------------------------------------------
describe("Admin cleanup: stale dated-key detection", () => {
  const richKvStore = {
    "ballot:statewide:democrat_primary_2026": "{}",
    "ballot:statewide:republican_primary_2026": "{}",
    "ballot:democrat_primary_2026": "{}",
    "ballot:county:48453:democrat_primary_2026": "{}",
    "county_info:48453": "{}",
    "precinct_map:48453": "{}",
    "manifest": "{}",
    "stale_tracker": "{}",
    "candidates_index": "{}",
    "update_log:2026-02-22": "{}",
    "update_log:2026-01-01": "{}",
    "audit:log:2026-02-20": "{}",
    "audit:log:2025-12-15": "{}",
    "audit:result:chatgpt": "{}",
    "audit:summary": "{}",
    "audit:synthesis": "{}",
    "cron_status:2026-02-22": "{}",
    "cron_status:2025-12-01": "{}",
    "health_log:2026-02-22": "{}",
    "health_log:2025-11-30": "{}",
    "usage_log:2026-02-22": "{}",
    "usage_log:2025-10-05": "{}",
    "some_unknown_key": "{}",
  };

  const deletedKeys = [];
  const richEnv = {
    ELECTION_DATA: {
      get: async (key) => richKvStore[key] || null,
      put: async () => {},
      delete: async (key) => { deletedKeys.push(key); },
      list: async ({ prefix, cursor } = {}) => {
        const keys = Object.keys(richKvStore)
          .filter((k) => !prefix || k.startsWith(prefix))
          .map((name) => ({ name }));
        return { keys, list_complete: true };
      },
    },
    ADMIN_SECRET: "test-secret-123",
    ANTHROPIC_API_KEY: "sk-test",
  };

  async function postRich(path) {
    const url = `https://txvotes.app${path}`;
    const request = new Request(url, {
      method: "POST",
      headers: { Authorization: "Bearer test-secret-123" },
    });
    return worker.fetch(request, richEnv);
  }

  it("counts all keys", async () => {
    const res = await postRich("/api/admin/cleanup");
    const body = await res.json();
    expect(body.totalKeys).toBe(Object.keys(richKvStore).length);
  });

  it("categorizes county ballots", async () => {
    const res = await postRich("/api/admin/cleanup");
    const body = await res.json();
    expect(body.categories.countyBallots.count).toBe(1);
  });

  it("categorizes county info", async () => {
    const res = await postRich("/api/admin/cleanup");
    const body = await res.json();
    expect(body.categories.countyInfo.count).toBe(1);
  });

  it("categorizes precinct maps", async () => {
    const res = await postRich("/api/admin/cleanup");
    const body = await res.json();
    expect(body.categories.precinctMaps.count).toBe(1);
  });

  it("categorizes unknown keys", async () => {
    const res = await postRich("/api/admin/cleanup");
    const body = await res.json();
    expect(body.categories.unknown.count).toBe(1);
    expect(body.categories.unknown.keys).toContain("some_unknown_key");
  });

  it("marks old dated logs as stale (>14 days)", async () => {
    const res = await postRich("/api/admin/cleanup");
    const body = await res.json();
    const staleKeys = body.stale.map(s => s.key);
    // Old logs (>14 days old)
    expect(staleKeys).toContain("update_log:2026-01-01");
    expect(staleKeys).toContain("audit:log:2025-12-15");
    expect(staleKeys).toContain("cron_status:2025-12-01");
    expect(staleKeys).toContain("health_log:2025-11-30");
    expect(staleKeys).toContain("usage_log:2025-10-05");
    // Legacy ballot
    expect(staleKeys).toContain("ballot:democrat_primary_2026");
  });

  it("does not mark recent dated logs as stale", async () => {
    const res = await postRich("/api/admin/cleanup");
    const body = await res.json();
    const staleKeys = body.stale.map(s => s.key);
    // Recent logs should NOT be stale
    expect(staleKeys).not.toContain("update_log:2026-02-22");
    expect(staleKeys).not.toContain("audit:log:2026-02-20");
    expect(staleKeys).not.toContain("cron_status:2026-02-22");
    expect(staleKeys).not.toContain("health_log:2026-02-22");
    expect(staleKeys).not.toContain("usage_log:2026-02-22");
  });

  it("does not mark core data as stale", async () => {
    const res = await postRich("/api/admin/cleanup");
    const body = await res.json();
    const staleKeys = body.stale.map(s => s.key);
    expect(staleKeys).not.toContain("ballot:statewide:democrat_primary_2026");
    expect(staleKeys).not.toContain("ballot:statewide:republican_primary_2026");
    expect(staleKeys).not.toContain("manifest");
    expect(staleKeys).not.toContain("audit:summary");
    expect(staleKeys).not.toContain("audit:result:chatgpt");
    expect(staleKeys).not.toContain("county_info:48453");
  });

  it("delete mode actually deletes stale keys", async () => {
    deletedKeys.length = 0;
    const res = await postRich("/api/admin/cleanup?dry-run=false");
    const body = await res.json();
    expect(body.dryRun).toBe(false);
    expect(body.deletedCount).toBeGreaterThan(0);
    expect(body.deletedCount).toBe(body.staleCount);
    // Verify delete was called for each stale key
    expect(deletedKeys.length).toBe(body.staleCount);
    expect(deletedKeys).toContain("ballot:democrat_primary_2026");
    expect(deletedKeys).toContain("update_log:2026-01-01");
  });
});

// ---------------------------------------------------------------------------
// Admin hub page
// ---------------------------------------------------------------------------
describe("Smoke tests: GET /admin hub", () => {
  it("returns 401 without auth", async () => {
    const res = await get("/admin");
    expect(res.status).toBe(401);
  });

  it("returns 200 with correct Bearer token", async () => {
    const url = "https://txvotes.app/admin";
    const request = new Request(url, {
      method: "GET",
      headers: { Authorization: "Bearer test-secret-123" },
    });
    const res = await worker.fetch(request, mockEnv);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Admin Hub");
  });

  it("contains links to all 4 dashboards", async () => {
    const url = "https://txvotes.app/admin";
    const request = new Request(url, {
      method: "GET",
      headers: { Authorization: "Bearer test-secret-123" },
    });
    const res = await worker.fetch(request, mockEnv);
    const html = await res.text();
    expect(html).toContain('/admin/status');
    expect(html).toContain('/admin/coverage');
    expect(html).toContain('/admin/analytics');
    expect(html).toContain('/admin/errors');
  });

  it("contains API endpoint references", async () => {
    const url = "https://txvotes.app/admin";
    const request = new Request(url, {
      method: "GET",
      headers: { Authorization: "Bearer test-secret-123" },
    });
    const res = await worker.fetch(request, mockEnv);
    const html = await res.text();
    expect(html).toContain('/api/admin/usage');
    expect(html).toContain('/api/audit/run');
    expect(html).toContain('/api/election/trigger');
    expect(html).toContain('/api/admin/cleanup');
  });
});

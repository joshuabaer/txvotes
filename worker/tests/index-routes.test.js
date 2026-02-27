import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the worker module
import worker from "../src/index.js";

const sampleBallot = readFileSync(
  join(__dirname, "fixtures/sample-ballot.json"),
  "utf-8"
);

// ---------------------------------------------------------------------------
// Mock env
// ---------------------------------------------------------------------------
function mockKVStore(initial = {}) {
  const store = { ...initial };
  return {
    _store: store,
    get: vi.fn(async (key, type) => {
      const val = store[key] !== undefined ? store[key] : null;
      if (type === "json" && val) {
        try { return JSON.parse(val); } catch { return val; }
      }
      return val;
    }),
    put: vi.fn(async (key, value) => {
      store[key] = value;
    }),
    delete: vi.fn(async (key) => {
      delete store[key];
    }),
    list: vi.fn(async ({ prefix, cursor } = {}) => {
      const keys = Object.keys(store)
        .filter((k) => !prefix || k.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys, list_complete: true };
    }),
  };
}

function createMockEnv(kvOverrides = {}) {
  return {
    ELECTION_DATA: mockKVStore({
      "ballot:statewide:democrat_primary_2026": sampleBallot,
      "ballot:statewide:republican_primary_2026": sampleBallot,
      manifest: JSON.stringify({
        republican: { updatedAt: new Date().toISOString(), version: "1" },
        democrat: { updatedAt: new Date().toISOString(), version: "1" },
      }),
      "audit:summary": JSON.stringify({ providers: {}, averageScore: null }),
      ...kvOverrides,
    }),
    ADMIN_SECRET: "test-secret-123",
    ANTHROPIC_API_KEY: "sk-test",
  };
}

/** Helper: GET request */
async function get(path, env, headers = {}) {
  const url = `https://txvotes.app${path}`;
  const request = new Request(url, {
    method: "GET",
    headers: { ...headers },
  });
  return worker.fetch(request, env || createMockEnv());
}

/** Helper: POST request */
async function post(path, body, env, headers = {}) {
  const url = `https://txvotes.app${path}`;
  const request = new Request(url, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": headers["CF-Connecting-IP"] || "1.2.3.4",
      ...headers,
    },
  });
  return worker.fetch(request, env || createMockEnv());
}

/** Helper: DELETE request */
async function del(path, env, headers = {}) {
  const url = `https://txvotes.app${path}`;
  const request = new Request(url, {
    method: "DELETE",
    headers: { ...headers },
  });
  return worker.fetch(request, env || createMockEnv());
}

/** Helper: OPTIONS request */
async function options(path, env) {
  const url = `https://txvotes.app${path}`;
  const request = new Request(url, { method: "OPTIONS" });
  return worker.fetch(request, env || createMockEnv());
}

// ===========================================================================
// 1. atxvotes.app -> txvotes.app redirect
// ===========================================================================
describe("atxvotes.app redirects", () => {
  it("redirects atxvotes.app to txvotes.app with 301", async () => {
    const env = createMockEnv();
    const request = new Request("https://atxvotes.app/some-path?q=1", { method: "GET" });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(301);
    const location = res.headers.get("Location");
    expect(location).toContain("txvotes.app");
    expect(location).toContain("/some-path");
  });

  it("redirects www.atxvotes.app to txvotes.app", async () => {
    const env = createMockEnv();
    const request = new Request("https://www.atxvotes.app/app", { method: "GET" });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(301);
  });

  it("redirects api.atxvotes.app to txvotes.app", async () => {
    const env = createMockEnv();
    const request = new Request("https://api.atxvotes.app/api/something", { method: "GET" });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(301);
  });
});

// ===========================================================================
// 2. Static asset 404 handling
// ===========================================================================
describe("Static asset 404 handling", () => {
  it("returns 404 for /headshots/ path", async () => {
    const res = await get("/headshots/some-image.jpg");
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 404 for /assets/ path", async () => {
    const res = await get("/assets/missing-file.css");
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

// ===========================================================================
// 3. Backward-compat POST/OPTIONS redirects: /app/api/* -> /tx/app/api/*
// ===========================================================================
describe("POST/OPTIONS backward-compat redirects", () => {
  it("POST /app/api/guide -> 301 redirect to /tx/app/api/guide", async () => {
    const env = createMockEnv();
    const request = new Request("https://txvotes.app/app/api/guide", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4" },
      body: "{}",
    });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/tx/app/api/guide");
  });

  it("OPTIONS /app/api/guide -> 301 redirect to /tx/app/api/guide", async () => {
    const env = createMockEnv();
    const request = new Request("https://txvotes.app/app/api/guide", {
      method: "OPTIONS",
    });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/tx/app/api/guide");
  });

  it("POST /app/api/guide?nocache=1 preserves query string", async () => {
    const env = createMockEnv();
    const request = new Request("https://txvotes.app/app/api/guide?nocache=1", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4" },
      body: "{}",
    });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/tx/app/api/guide?nocache=1");
  });
});

// ===========================================================================
// 4. CORS preflight for state-prefixed API routes
// ===========================================================================
describe("CORS preflight for state-prefixed routes", () => {
  it("OPTIONS /tx/app/api/guide -> 204 with CORS headers", async () => {
    const res = await options("/tx/app/api/guide");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
    expect(res.headers.get("Access-Control-Max-Age")).toBe("86400");
  });

  it("OPTIONS /dc/app/api/ballot -> 204 with CORS headers", async () => {
    const res = await options("/dc/app/api/ballot");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

// ===========================================================================
// 5. DELETE method handling
// ===========================================================================
describe("DELETE method handling", () => {
  it("DELETE /api/admin/llm-experiment requires auth", async () => {
    const res = await del("/api/admin/llm-experiment");
    expect(res.status).toBe(401);
  });

  it("DELETE /api/admin/llm-experiment with auth resets experiment", async () => {
    const env = createMockEnv({
      "experiment:progress": JSON.stringify({ status: "running" }),
      "experiment:lock": "12345",
    });
    const res = await del("/api/admin/llm-experiment", env, {
      Authorization: "Bearer test-secret-123",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("reset");
    expect(env.ELECTION_DATA.delete).toHaveBeenCalledWith("experiment:progress");
    expect(env.ELECTION_DATA.delete).toHaveBeenCalledWith("experiment:lock");
  });

  it("DELETE to unknown path -> 404", async () => {
    const res = await del("/api/admin/nonexistent");
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// 6. handleBallotFetch tests
// ===========================================================================
describe("handleBallotFetch", () => {
  it("returns 400 when party param is missing", async () => {
    const res = await get("/tx/app/api/ballot");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("party parameter required");
  });

  it("returns 400 for invalid party", async () => {
    const res = await get("/tx/app/api/ballot?party=libertarian");
    expect(res.status).toBe(400);
  });

  it("returns 200 for valid republican party", async () => {
    const res = await get("/tx/app/api/ballot?party=republican");
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type");
    expect(ct).toContain("json");
  });

  it("returns 200 for valid democrat party", async () => {
    const res = await get("/tx/app/api/ballot?party=democrat");
    expect(res.status).toBe(200);
  });

  it("includes ETag header", async () => {
    const res = await get("/tx/app/api/ballot?party=republican");
    expect(res.status).toBe(200);
    const etag = res.headers.get("ETag");
    expect(etag).toBeTruthy();
    expect(etag).toMatch(/^"/);
  });

  it("returns 304 for matching If-None-Match header", async () => {
    const env = createMockEnv();
    // First request to get the ETag
    const res1 = await get("/tx/app/api/ballot?party=republican", env);
    const etag = res1.headers.get("ETag");
    expect(etag).toBeTruthy();

    // Second request with If-None-Match
    const url = "https://txvotes.app/tx/app/api/ballot?party=republican";
    const req2 = new Request(url, {
      method: "GET",
      headers: { "If-None-Match": etag },
    });
    const res2 = await worker.fetch(req2, env);
    expect(res2.status).toBe(304);
  });

  it("returns 404 when ballot data is missing", async () => {
    const env = createMockEnv();
    // Override to return null for ballot
    env.ELECTION_DATA.get = vi.fn(async (key) => {
      if (key.startsWith("ballot:statewide:")) return null;
      return null;
    });
    const res = await get("/tx/app/api/ballot?party=republican", env);
    expect(res.status).toBe(404);
  });

  it("merges county ballot data when county param provided", async () => {
    const countyBallot = JSON.stringify({
      races: [{ office: "County Judge", candidates: [] }],
    });
    const env = createMockEnv({
      "ballot:county:48453:republican_primary_2026": countyBallot,
    });
    const res = await get("/tx/app/api/ballot?party=republican&county=48453", env);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Should include statewide races plus county race
    const officeNames = body.races.map((r) => r.office);
    expect(officeNames).toContain("County Judge");
  });

  it("includes Cache-Control header", async () => {
    const res = await get("/tx/app/api/ballot?party=republican");
    expect(res.headers.get("Cache-Control")).toContain("public");
  });
});

// ===========================================================================
// 7. handleCountyInfo tests
// ===========================================================================
describe("handleCountyInfo", () => {
  it("returns 400 when fips param is missing", async () => {
    const res = await get("/tx/app/api/county-info");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("fips");
  });

  it("returns 404 when county info not found", async () => {
    const res = await get("/tx/app/api/county-info?fips=99999");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("No county info");
    expect(body.countyFips).toBe("99999");
  });

  it("returns 200 when county info exists", async () => {
    const env = createMockEnv({
      "county_info:48453": JSON.stringify({ name: "Travis County", fips: "48453" }),
    });
    const res = await get("/tx/app/api/county-info?fips=48453", env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

// ===========================================================================
// 8. handleManifest tests
// ===========================================================================
describe("handleManifest", () => {
  it("returns manifest from KV when it exists", async () => {
    const res = await get("/api/election/manifest");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.republican).toBeDefined();
    expect(body.democrat).toBeDefined();
  });

  it("returns empty manifest when KV is empty", async () => {
    const env = createMockEnv();
    env.ELECTION_DATA.get = vi.fn(async () => null);
    const res = await get("/api/election/manifest", env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.republican).toBeNull();
    expect(body.democrat).toBeNull();
  });

  it("is also accessible at /tx/app/api/manifest", async () => {
    const res = await get("/tx/app/api/manifest");
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// 9. Health check endpoint
// ===========================================================================
describe("GET /health", () => {
  it("returns 200 when all checks pass", async () => {
    const env = createMockEnv({
      "audit:summary": JSON.stringify({
        providers: {},
        averageScore: null,
        lastRun: new Date().toISOString(),
      }),
      [`cron_status:${new Date().toISOString().slice(0, 10)}`]: JSON.stringify({
        tasks: { dailyUpdate: { status: "success" } },
      }),
    });
    const res = await get("/health", env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks).toBeDefined();
    expect(body.checks.kv).toBeDefined();
    expect(body.checks.ballotData).toBeDefined();
    expect(body.checks.apiKey).toBeDefined();
    expect(body.responseMs).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });

  it("returns 503 when KV has no manifest", async () => {
    const env = createMockEnv();
    env.ELECTION_DATA.get = vi.fn(async () => null);
    const res = await get("/health", env);
    const body = await res.json();
    // Should be degraded (manifest missing)
    expect(body.status).not.toBe("ok");
    expect(body.checks.kv.ok).toBe(false);
  });

  it("returns degraded status when API key is missing", async () => {
    const env = createMockEnv();
    delete env.ANTHROPIC_API_KEY;
    const res = await get("/health", env);
    const body = await res.json();
    expect(body.checks.apiKey.ok).toBe(false);
  });

  it("has no-store Cache-Control", async () => {
    const res = await get("/health");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("has CORS header", async () => {
    const res = await get("/health");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

// ===========================================================================
// 10. DC Coming Soon page
// ===========================================================================
describe("DC Coming Soon page", () => {
  it("GET /dc/app returns 200", async () => {
    const res = await get("/dc/app");
    expect(res.status).toBe(200);
  });

  it("contains DC Votes heading", async () => {
    const res = await get("/dc/app");
    const body = await res.text();
    expect(body).toContain("DC Votes");
  });

  it("contains DC election name", async () => {
    const res = await get("/dc/app");
    const body = await res.text();
    expect(body).toContain("DC Primary Election");
  });

  it("contains June 16 date", async () => {
    const res = await get("/dc/app");
    const body = await res.text();
    expect(body).toContain("June 16, 2026");
  });

  it("GET /dc/app/api/anything also shows coming soon", async () => {
    const res = await get("/dc/app/api/ballot?party=democrat");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("DC Votes");
  });

  it("has public cache control", async () => {
    const res = await get("/dc/app");
    expect(res.headers.get("Cache-Control")).toContain("public");
  });
});

// ===========================================================================
// 11. Admin authentication — checkAdminAuth
// ===========================================================================
describe("Admin authentication", () => {
  it("Bearer token authentication works", async () => {
    const res = await get("/admin", undefined, {
      Authorization: "Bearer test-secret-123",
    });
    expect(res.status).toBe(200);
  });

  it("Basic auth with user:password format works", async () => {
    const res = await get("/admin", undefined, {
      Authorization: "Basic " + btoa("admin:test-secret-123"),
    });
    expect(res.status).toBe(200);
  });

  it("Basic auth with colon in password works", async () => {
    const env = { ...createMockEnv(), ADMIN_SECRET: "pass:with:colons" };
    const res = await get("/admin", env, {
      Authorization: "Basic " + btoa("admin:pass:with:colons"),
    });
    expect(res.status).toBe(200);
  });

  it("returns 401 without auth header", async () => {
    const res = await get("/admin");
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe('Basic realm="Admin"');
  });

  it("returns 401 with wrong Bearer token", async () => {
    const res = await get("/admin", undefined, {
      Authorization: "Bearer wrong-token",
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong Basic auth password", async () => {
    const res = await get("/admin", undefined, {
      Authorization: "Basic " + btoa("admin:wrong-password"),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid Base64 in Basic auth", async () => {
    const res = await get("/admin", undefined, {
      Authorization: "Basic !!!invalid!!!",
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with empty auth header", async () => {
    const res = await get("/admin", undefined, {
      Authorization: "",
    });
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// 12. Admin protected endpoints require auth
// ===========================================================================
describe("Admin endpoints require authentication", () => {
  const adminGetEndpoints = [
    "/admin",
    "/admin/status",
    "/admin/coverage",
    "/admin/analytics",
    "/admin/errors",
    "/admin/llm-benchmark",
    "/api/admin/usage",
    "/api/admin/baseline",
    "/api/admin/baseline/log",
    "/api/admin/llm-experiment/status",
    "/api/admin/llm-experiment/results",
    "/llm-experiment",
  ];

  for (const endpoint of adminGetEndpoints) {
    it(`GET ${endpoint} -> 401 without auth`, async () => {
      const res = await get(endpoint);
      expect(res.status).toBe(401);
    });
  }

  const adminPostEndpoints = [
    "/api/audit/run",
    "/api/election/trigger",
    "/api/election/seed-county",
    "/api/election/generate-tones",
    "/api/election/generate-candidate-tones",
    "/api/election/seed-translations",
    "/api/admin/llm-experiment",
    "/api/admin/llm-experiment/run-next",
    "/api/admin/cleanup",
    "/api/admin/baseline/seed",
    "/api/admin/baseline/update",
  ];

  for (const endpoint of adminPostEndpoints) {
    it(`POST ${endpoint} -> 401 without auth`, async () => {
      const res = await post(endpoint, {}, undefined, { "CF-Connecting-IP": "10.0.0.1" });
      expect(res.status).toBe(401);
    });
  }
});

// ===========================================================================
// 13. Admin status endpoint
// ===========================================================================
describe("GET /admin/status with auth", () => {
  it("returns 200 with HTML", async () => {
    const res = await get("/admin/status", undefined, {
      Authorization: "Bearer test-secret-123",
    });
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type");
    expect(ct).toContain("text/html");
  });

  it("contains system status content", async () => {
    const res = await get("/admin/status", undefined, {
      Authorization: "Bearer test-secret-123",
    });
    const body = await res.text();
    expect(body).toContain("<!DOCTYPE html");
    expect(body).toContain("Status");
  });
});

// ===========================================================================
// 14. Admin coverage endpoint
// ===========================================================================
describe("GET /admin/coverage with auth", () => {
  it("returns 200 with HTML", async () => {
    const res = await get("/admin/coverage", undefined, {
      Authorization: "Bearer test-secret-123",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });
});

// ===========================================================================
// 15. Admin analytics endpoint
// ===========================================================================
describe("GET /admin/analytics with auth", () => {
  it("returns 200 with HTML", async () => {
    const res = await get("/admin/analytics", undefined, {
      Authorization: "Bearer test-secret-123",
    });
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// 16. Admin errors endpoint
// ===========================================================================
describe("GET /admin/errors with auth", () => {
  it("returns 200 with HTML by default", async () => {
    const res = await get("/admin/errors", undefined, {
      Authorization: "Bearer test-secret-123",
    });
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type");
    expect(ct).toContain("text/html");
  });

  it("returns JSON when format=json", async () => {
    const res = await get("/admin/errors?format=json", undefined, {
      Authorization: "Bearer test-secret-123",
    });
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type");
    expect(ct).toContain("json");
    const body = await res.json();
    expect(typeof body).toBe("object");
  });
});

// ===========================================================================
// 17. Admin LLM benchmark
// ===========================================================================
describe("GET /admin/llm-benchmark with auth", () => {
  it("returns 200 with HTML", async () => {
    const res = await get("/admin/llm-benchmark", undefined, {
      Authorization: "Bearer test-secret-123",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });
});

// ===========================================================================
// 18. Admin usage API
// ===========================================================================
describe("GET /api/admin/usage with auth", () => {
  it("returns 200 with usage data", async () => {
    const res = await get("/api/admin/usage", undefined, {
      Authorization: "Bearer test-secret-123",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.date).toBeDefined();
    expect(body.usage).toBeDefined();
    expect(body.estimatedCosts).toBeDefined();
  });

  it("accepts custom date parameter", async () => {
    const res = await get("/api/admin/usage?date=2026-02-01", undefined, {
      Authorization: "Bearer test-secret-123",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.date).toBe("2026-02-01");
  });
});

// ===========================================================================
// 19. Admin baseline endpoints
// ===========================================================================
describe("Admin baseline view", () => {
  it("returns exists:false when no baseline", async () => {
    const res = await get("/api/admin/baseline", undefined, {
      Authorization: "Bearer test-secret-123",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(false);
    expect(body.party).toBe("republican"); // default
  });

  it("accepts party query param", async () => {
    const res = await get("/api/admin/baseline?party=democrat", undefined, {
      Authorization: "Bearer test-secret-123",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.party).toBe("democrat");
  });
});

describe("Admin baseline log", () => {
  it("returns empty entries when no log", async () => {
    const res = await get("/api/admin/baseline/log", undefined, {
      Authorization: "Bearer test-secret-123",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual([]);
    expect(body.message).toContain("No baseline fallbacks");
  });
});

// ===========================================================================
// 20. Admin baseline update — validation
// ===========================================================================
describe("POST /api/admin/baseline/update", () => {
  it("returns 400 when party is missing", async () => {
    const res = await post(
      "/api/admin/baseline/update",
      { candidateName: "John" },
      undefined,
      { Authorization: "Bearer test-secret-123", "CF-Connecting-IP": "10.0.0.1" }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("party");
  });

  it("returns 400 when candidateName is missing", async () => {
    const res = await post(
      "/api/admin/baseline/update",
      { party: "republican" },
      undefined,
      { Authorization: "Bearer test-secret-123", "CF-Connecting-IP": "10.0.0.1" }
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when no baseline exists", async () => {
    const res = await post(
      "/api/admin/baseline/update",
      { party: "republican", candidateName: "John", fields: { background: "new" } },
      undefined,
      { Authorization: "Bearer test-secret-123", "CF-Connecting-IP": "10.0.0.1" }
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("No baseline found");
  });
});

// ===========================================================================
// 21. LLM experiment admin redirect
// ===========================================================================
describe("GET /llm-experiment", () => {
  it("redirects to /tx/app#/llm-experiment with auth", async () => {
    const res = await get("/llm-experiment", undefined, {
      Authorization: "Bearer test-secret-123",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/tx/app#/llm-experiment");
  });
});

// ===========================================================================
// 22. Analytics event endpoint
// ===========================================================================
describe("POST /tx/app/api/ev — analytics events", () => {
  let ipCounter = 200;
  function nextIP() {
    ipCounter++;
    return `10.99.${Math.floor(ipCounter / 256)}.${ipCounter % 256}`;
  }

  it("returns 204 for a valid event", async () => {
    const res = await post(
      "/tx/app/api/ev",
      { event: "page_view", props: { lang: "en" } },
      undefined,
      { "CF-Connecting-IP": nextIP() }
    );
    expect(res.status).toBe(204);
  });

  it("returns 204 (silent drop) for an invalid event name", async () => {
    const res = await post(
      "/tx/app/api/ev",
      { event: "invalid_event_name", props: {} },
      undefined,
      { "CF-Connecting-IP": nextIP() }
    );
    expect(res.status).toBe(204); // silent drop, not error
  });

  it("returns 204 for missing event name", async () => {
    const res = await post(
      "/tx/app/api/ev",
      { props: { lang: "en" } },
      undefined,
      { "CF-Connecting-IP": nextIP() }
    );
    expect(res.status).toBe(204);
  });

  it("handles all valid event types", async () => {
    const validEvents = [
      "interview_start", "interview_phase", "interview_complete",
      "interview_abandon", "tone_select",
      "guide_start", "guide_complete", "guide_error",
      "i_voted", "share_app", "share_race", "share_voted",
      "cheatsheet_print", "party_switch", "lang_toggle",
      "race_view", "cheatsheet_view", "page_view",
      "override_set", "override_undo", "override_feedback",
    ];
    for (const event of validEvents) {
      const res = await post(
        "/tx/app/api/ev",
        { event, props: {} },
        undefined,
        { "CF-Connecting-IP": nextIP() }
      );
      expect(res.status).toBe(204);
    }
  });

  it("skips analytics for admin sessions with Bearer auth", async () => {
    const env = createMockEnv();
    // Add a mock ANALYTICS binding to track if writeDataPoint is called
    env.ANALYTICS = { writeDataPoint: vi.fn() };
    const res = await post(
      "/tx/app/api/ev",
      { event: "page_view", props: {} },
      env,
      { "CF-Connecting-IP": nextIP(), Authorization: "Bearer test-secret-123" }
    );
    expect(res.status).toBe(204);
    // Admin events should be skipped, so writeDataPoint should NOT be called
    expect(env.ANALYTICS.writeDataPoint).not.toHaveBeenCalled();
  });

  it("skips analytics for admin sessions with _admin_key in body", async () => {
    const env = createMockEnv();
    env.ANALYTICS = { writeDataPoint: vi.fn() };
    const res = await post(
      "/tx/app/api/ev",
      { event: "page_view", props: {}, _admin_key: "test-secret-123" },
      env,
      { "CF-Connecting-IP": nextIP() }
    );
    expect(res.status).toBe(204);
    expect(env.ANALYTICS.writeDataPoint).not.toHaveBeenCalled();
  });

  it("writes to ANALYTICS when binding is present and not admin", async () => {
    const env = createMockEnv();
    env.ANALYTICS = { writeDataPoint: vi.fn() };
    const res = await post(
      "/tx/app/api/ev",
      { event: "page_view", props: { lang: "es", d1: "home" } },
      env,
      { "CF-Connecting-IP": nextIP() }
    );
    expect(res.status).toBe(204);
    expect(env.ANALYTICS.writeDataPoint).toHaveBeenCalledTimes(1);
    const args = env.ANALYTICS.writeDataPoint.mock.calls[0][0];
    expect(args.blobs[0]).toBe("page_view");
    expect(args.blobs[1]).toBe("es");
    expect(args.blobs[2]).toBe("home");
  });
});

// ===========================================================================
// 23. Audit API results
// ===========================================================================
describe("GET /api/audit/results", () => {
  it("returns empty result when no audit data", async () => {
    const env = createMockEnv();
    env.ELECTION_DATA.get = vi.fn(async (key) => {
      if (key === "audit:summary") return null;
      return null;
    });
    const res = await get("/api/audit/results", env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providers).toEqual({});
    expect(body.averageScore).toBeNull();
  });
});

describe("GET /api/audit/results/:provider", () => {
  it("returns 404 for nonexistent provider", async () => {
    const res = await get("/api/audit/results/nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("No results for provider");
  });

  it("returns provider results when they exist", async () => {
    const env = createMockEnv({
      "audit:result:chatgpt": JSON.stringify({ score: 8.5, bias: "none detected" }),
    });
    const res = await get("/api/audit/results/chatgpt", env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score).toBe(8.5);
  });
});

// ===========================================================================
// 24. POST to non-POST methods returns 404
// ===========================================================================
describe("HTTP method handling", () => {
  it("PUT request returns 404", async () => {
    const env = createMockEnv();
    const request = new Request("https://txvotes.app/api/something", { method: "PUT" });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(404);
  });

  it("PATCH request returns 404", async () => {
    const env = createMockEnv();
    const request = new Request("https://txvotes.app/api/something", { method: "PATCH" });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// 25. Polymarket endpoint (stub)
// ===========================================================================
describe("GET /tx/app/api/polymarket", () => {
  it("returns empty odds object", async () => {
    const res = await get("/tx/app/api/polymarket");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.odds).toEqual({});
  });
});

// ===========================================================================
// 26. LLM experiment status/results without auth -> 401
// ===========================================================================
describe("LLM experiment admin endpoints", () => {
  it("GET /api/admin/llm-experiment/status returns status when authenticated", async () => {
    const res = await get("/api/admin/llm-experiment/status", undefined, {
      Authorization: "Bearer test-secret-123",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("no_experiment");
  });

  it("GET /api/admin/llm-experiment/results returns results when authenticated", async () => {
    const res = await get("/api/admin/llm-experiment/results", undefined, {
      Authorization: "Bearer test-secret-123",
    });
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// 27. Audit run endpoint rate limiting
// ===========================================================================
describe("POST /api/audit/run rate limiting", () => {
  it("returns 429 when run too recently", async () => {
    const env = createMockEnv({
      "audit:last_run": String(Date.now() - 60000), // 1 min ago (within 10-min limit)
    });
    // Mock fetch for Claude API calls
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response("mock"));
    try {
      const res = await post(
        "/api/audit/run",
        {},
        env,
        { Authorization: "Bearer test-secret-123", "CF-Connecting-IP": "10.0.0.1" }
      );
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toContain("Rate limited");
      expect(body.retryAfterMs).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ===========================================================================
// 28. Admin trigger endpoint — requires auth
// ===========================================================================
describe("POST /api/election/trigger", () => {
  it("returns 401 without auth", async () => {
    const res = await post("/api/election/trigger", {}, undefined, {
      "CF-Connecting-IP": "10.0.0.1",
    });
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// 29. Seed county — validation
// ===========================================================================
describe("POST /api/election/seed-county", () => {
  it("returns 401 without auth", async () => {
    const res = await post("/api/election/seed-county", {}, undefined, {
      "CF-Connecting-IP": "10.0.0.1",
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when countyFips or countyName missing", async () => {
    const res = await post(
      "/api/election/seed-county",
      { countyFips: "48453" }, // missing countyName
      undefined,
      { Authorization: "Bearer test-secret-123", "CF-Connecting-IP": "10.0.0.1" }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("countyFips and countyName required");
  });
});

// ===========================================================================
// 30. Vanity entry points — tone and LLM
// ===========================================================================
describe("Vanity entry points", () => {
  it("GET /cowboy returns 200 with HTML", async () => {
    const res = await get("/cowboy");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<!DOCTYPE html");
    expect(body).toContain("Yeehaw");
  });

  it("GET /gemini returns 200 with HTML", async () => {
    const res = await get("/gemini");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Gemini");
  });

  it("GET /grok returns 200 with HTML", async () => {
    const res = await get("/grok");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Grok");
  });

  it("GET /chatgpt returns 200 with HTML", async () => {
    const res = await get("/chatgpt");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("ChatGPT");
  });
});

// ===========================================================================
// 31. Candidate redirect
// ===========================================================================
describe("Candidate redirects", () => {
  it("GET /candidate (no slug) -> 302 to /candidates", async () => {
    const res = await get("/candidate");
    expect(res.status).toBe(302);
  });

  it("GET /candidate/ (trailing slash, no slug) -> 302 to /candidates", async () => {
    const res = await get("/candidate/");
    expect(res.status).toBe(302);
  });
});

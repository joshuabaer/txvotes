import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
      ...kvOverrides,
    }),
    ADMIN_SECRET: "test-secret-123",
    ANTHROPIC_API_KEY: "sk-test",
  };
}

function adminHeaders() {
  return { Authorization: "Bearer test-secret-123" };
}

async function get(path, env, headers = {}) {
  const url = `https://txvotes.app${path}`;
  const request = new Request(url, { method: "GET", headers });
  return worker.fetch(request, env || createMockEnv());
}

async function post(path, body, env, headers = {}) {
  const url = `https://txvotes.app${path}`;
  const request = new Request(url, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "1.2.3.4",
      ...headers,
    },
  });
  return worker.fetch(request, env || createMockEnv());
}

// ---------------------------------------------------------------------------
// GET /api/admin/phase
// ---------------------------------------------------------------------------
describe("GET /api/admin/phase", () => {
  it("requires auth", async () => {
    const res = await get("/api/admin/phase");
    expect(res.status).toBe(401);
  });

  it("returns current phase for TX (defaults to time-based)", async () => {
    const res = await get("/api/admin/phase", createMockEnv(), adminHeaders());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.state).toBe("tx");
    expect(["pre-election", "election-night", "post-election", "runoff"]).toContain(data.phase);
    expect(data.kvOverride).toBeNull();
    expect(data.resultsUrl).toBe("https://results.texas-election.com/races");
  });

  it("returns KV override when set", async () => {
    const env = createMockEnv({ "site_phase:tx": "post-election" });
    const res = await get("/api/admin/phase", env, adminHeaders());
    const data = await res.json();
    expect(data.phase).toBe("post-election");
    expect(data.kvOverride).toBe("post-election");
  });

  it("supports ?state=dc", async () => {
    const res = await get("/api/admin/phase?state=dc", createMockEnv(), adminHeaders());
    const data = await res.json();
    expect(data.state).toBe("dc");
  });

  it("returns 400 for unknown state", async () => {
    const res = await get("/api/admin/phase?state=ca", createMockEnv(), adminHeaders());
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/set-phase
// ---------------------------------------------------------------------------
describe("POST /api/admin/set-phase", () => {
  it("requires auth", async () => {
    const res = await post("/api/admin/set-phase", { phase: "post-election" });
    expect(res.status).toBe(401);
  });

  it("sets phase override in KV", async () => {
    const env = createMockEnv();
    const res = await post("/api/admin/set-phase", { phase: "post-election" }, env, adminHeaders());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.phase).toBe("post-election");
    expect(data.kvOverride).toBe("post-election");
    // Verify KV was written
    expect(env.ELECTION_DATA.put).toHaveBeenCalledWith("site_phase:tx", "post-election");
  });

  it("sets runoff phase", async () => {
    const env = createMockEnv();
    const res = await post("/api/admin/set-phase", { phase: "runoff" }, env, adminHeaders());
    const data = await res.json();
    expect(data.phase).toBe("runoff");
  });

  it("clears override when phase is null", async () => {
    const env = createMockEnv({ "site_phase:tx": "post-election" });
    const res = await post("/api/admin/set-phase", { phase: null }, env, adminHeaders());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.kvOverride).toBeNull();
    expect(data.message).toContain("Override cleared");
    expect(env.ELECTION_DATA.delete).toHaveBeenCalledWith("site_phase:tx");
  });

  it("clears override when phase is empty string", async () => {
    const env = createMockEnv({ "site_phase:tx": "post-election" });
    const res = await post("/api/admin/set-phase", { phase: "" }, env, adminHeaders());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.kvOverride).toBeNull();
  });

  it("rejects invalid phase value", async () => {
    const res = await post("/api/admin/set-phase", { phase: "invalid" }, createMockEnv(), adminHeaders());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid phase");
  });

  it("supports setting phase for DC", async () => {
    const env = createMockEnv();
    const res = await post("/api/admin/set-phase", { state: "dc", phase: "post-election" }, env, adminHeaders());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.state).toBe("dc");
    expect(env.ELECTION_DATA.put).toHaveBeenCalledWith("site_phase:dc", "post-election");
  });

  it("rejects unknown state", async () => {
    const res = await post("/api/admin/set-phase", { state: "ca", phase: "post-election" }, createMockEnv(), adminHeaders());
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Guide API 410 guards (post-election)
// ---------------------------------------------------------------------------
describe("Guide API post-election guards", () => {
  function guideBody() {
    return {
      party: "republican",
      profile: { topIssues: ["Economy"], politicalSpectrum: "Moderate" },
    };
  }

  it("POST /tx/app/api/guide returns 410 when phase is post-election", async () => {
    const env = createMockEnv({ "site_phase:tx": "post-election" });
    const res = await post("/tx/app/api/guide", guideBody(), env);
    expect(res.status).toBe(410);
    const data = await res.json();
    expect(data.error).toContain("closed");
    expect(data.phase).toBe("post-election");
  });

  it("POST /tx/app/api/guide returns 410 when phase is election-night", async () => {
    const env = createMockEnv({ "site_phase:tx": "election-night" });
    const res = await post("/tx/app/api/guide", guideBody(), env);
    expect(res.status).toBe(410);
    expect((await res.json()).phase).toBe("election-night");
  });

  it("POST /tx/app/api/guide-stream returns 410 when post-election", async () => {
    const env = createMockEnv({ "site_phase:tx": "post-election" });
    const res = await post("/tx/app/api/guide-stream", guideBody(), env);
    expect(res.status).toBe(410);
    const text = await res.text();
    expect(text).toContain("closed");
  });

  it("POST /tx/app/api/summary returns 410 when post-election", async () => {
    const env = createMockEnv({ "site_phase:tx": "post-election" });
    const res = await post("/tx/app/api/summary", { profile: { topIssues: ["Economy"] } }, env);
    expect(res.status).toBe(410);
  });

  it("POST /dc/app/api/guide returns 410 when DC is post-election", async () => {
    const env = createMockEnv({ "site_phase:dc": "post-election" });
    const res = await post("/dc/app/api/guide", guideBody(), env);
    expect(res.status).toBe(410);
  });

  it("POST /tx/app/api/guide works normally when pre-election (no KV override)", async () => {
    // No site_phase override = time-based. Since we're before March 3, 2026, it should be pre-election
    const env = createMockEnv();
    const res = await post("/tx/app/api/guide", guideBody(), env);
    // Should not be 410 — it might be another error (like missing API key) but not 410
    expect(res.status).not.toBe(410);
  });

  it("POST /tx/app/api/guide respects ?test_phase=post-election", async () => {
    const env = createMockEnv();
    const res = await post("/tx/app/api/guide?test_phase=post-election", guideBody(), env);
    expect(res.status).toBe(410);
  });
});

// ---------------------------------------------------------------------------
// Static pages post-election behavior (?test_phase=)
// ---------------------------------------------------------------------------
describe("Static pages with ?test_phase= query param", () => {
  it("landing page shows View Primary Results when post-election", async () => {
    const env = createMockEnv();
    const res = await get("/?test_phase=post-election", env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("View Primary Results");
    expect(html).toContain("March 3 Primary");
    expect(html).not.toContain('>Build My Voting Guide<');
  });

  it("landing page shows Build My Voting Guide when pre-election", async () => {
    const env = createMockEnv();
    const res = await get("/?test_phase=pre-election", env);
    const html = await res.text();
    expect(html).toContain("Build My Voting Guide");
    expect(html).toContain("Texas Primary");
  });

  it("landing page shows election-night badge when election-night", async () => {
    const env = createMockEnv();
    const res = await get("/?test_phase=election-night", env);
    const html = await res.text();
    expect(html).toContain("Polls Are Closed");
    expect(html).toContain("View Primary Results");
  });

  it("landing page shows runoff CTA when runoff", async () => {
    const env = createMockEnv();
    const res = await get("/?test_phase=runoff", env);
    const html = await res.text();
    expect(html).toContain("Build My Runoff Guide");
    expect(html).toContain("Primary Runoff");
  });

  it("how-it-works page shows View Primary Results when post-election", async () => {
    const env = createMockEnv();
    const res = await get("/how-it-works?test_phase=post-election", env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("View Primary Results");
    expect(html).not.toContain('>Build My Voting Guide<');
  });

  it("privacy page shows post-election CTA when post-election", async () => {
    const env = createMockEnv();
    const res = await get("/privacy?test_phase=post-election", env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("View Primary Results");
  });

  it("ignores invalid test_phase values", async () => {
    const env = createMockEnv();
    const res = await get("/?test_phase=invalid-phase", env);
    const html = await res.text();
    // Should fall through to time-based (pre-election currently)
    expect(html).toContain("Build My Voting Guide");
  });

  it("test_phase=post-election shows View Your Ballot link on landing", async () => {
    const env = createMockEnv();
    const res = await get("/?test_phase=post-election", env);
    const html = await res.text();
    expect(html).toContain("View Your Ballot");
    // The "See a Sample Ballot" link should be replaced by "View Your Ballot" in the HTML
    // (translation dictionaries may still contain the string — that's fine)
    expect(html).toContain('href="/tx/app"');
  });
});

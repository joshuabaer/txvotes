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
      "audit:summary": JSON.stringify({ providers: {}, averageScore: null, lastRun: new Date().toISOString() }),
      ...kvOverrides,
    }),
    ADMIN_SECRET: "test-secret-123",
    ANTHROPIC_API_KEY: "sk-test",
  };
}

const authHeaders = {
  Authorization: "Basic " + btoa("admin:test-secret-123"),
};

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

// ===========================================================================
// 1. Spot-Check Dashboard (GET /admin/spot-check)
// ===========================================================================
describe("GET /admin/spot-check", () => {
  it("requires authentication", async () => {
    const res = await get("/admin/spot-check");
    expect(res.status).toBe(401);
  });

  it("returns HTML dashboard when authenticated", async () => {
    const res = await get("/admin/spot-check", undefined, authHeaders);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Spot-Check");
    expect(html).toContain("Candidate Data Review");
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("shows candidate cards from ballot data", async () => {
    const res = await get("/admin/spot-check", undefined, authHeaders);
    const html = await res.text();
    // Sample ballot has candidates: Alice Johnson, Bob Martinez, Carol Davis, Dan Wilson, Eve Thompson
    expect(html).toContain("Alice Johnson");
    expect(html).toContain("Bob Martinez");
    expect(html).toContain("Carol Davis");
  });

  it("shows stats bar with total, approved, flagged, remaining", async () => {
    const res = await get("/admin/spot-check", undefined, authHeaders);
    const html = await res.text();
    expect(html).toContain('id="stat-total"');
    expect(html).toContain('id="stat-approved"');
    expect(html).toContain('id="stat-flagged"');
    expect(html).toContain('id="stat-remaining"');
    expect(html).toContain('id="stat-eta"');
  });

  it("shows confidence badges for candidate fields", async () => {
    const res = await get("/admin/spot-check", undefined, authHeaders);
    const html = await res.text();
    expect(html).toContain("sc-badge");
    expect(html).toContain("ai-inferred");
  });

  it("shows keyboard shortcuts hint", async () => {
    const res = await get("/admin/spot-check", undefined, authHeaders);
    const html = await res.text();
    expect(html).toContain("Keyboard");
    expect(html).toContain("Enter");
    expect(html).toContain("Flag");
  });

  it("shows filter tabs (All, Pending, Flagged, Approved)", async () => {
    const res = await get("/admin/spot-check", undefined, authHeaders);
    const html = await res.text();
    expect(html).toContain("sc-filter-tab");
    expect(html).toContain("Pending");
    expect(html).toContain("Flagged");
    expect(html).toContain("Approved");
  });

  it("shows export link", async () => {
    const res = await get("/admin/spot-check", undefined, authHeaders);
    const html = await res.text();
    expect(html).toContain("/admin/spot-check/export");
  });

  it("shows progress bar", async () => {
    const res = await get("/admin/spot-check", undefined, authHeaders);
    const html = await res.text();
    expect(html).toContain("sc-progress-bar");
    expect(html).toContain("sc-progress-fill");
  });

  it("reflects review state from KV", async () => {
    const progress = {
      reviewed: {
        "alice-johnson|democrat": { status: "approved", note: "", reviewer: "admin", timestamp: "2026-02-28T10:00:00Z" },
        "bob-martinez|democrat": { status: "flagged", note: "Wrong endorsement", reviewer: "admin", timestamp: "2026-02-28T10:01:00Z" },
      },
    };
    const env = createMockEnv({
      spot_check_progress: JSON.stringify(progress),
    });
    const res = await get("/admin/spot-check", env, authHeaders);
    const html = await res.text();
    // Should show 2 reviewed, and flag note
    expect(html).toContain("Wrong endorsement");
    expect(html).toContain('data-status="approved"');
    expect(html).toContain('data-status="flagged"');
  });

  it("sorts unreviewed candidates before reviewed", async () => {
    const progress = {
      reviewed: {
        "alice-johnson|democrat": { status: "approved", note: "", reviewer: "admin", timestamp: "2026-02-28T10:00:00Z" },
      },
    };
    const env = createMockEnv({
      spot_check_progress: JSON.stringify(progress),
    });
    const res = await get("/admin/spot-check", env, authHeaders);
    const html = await res.text();
    // Alice (democrat) is approved, so she should appear after unreviewed candidates.
    // Match only actual card divs (data-idx="0"), not CSS selectors.
    // Card format: <div class="sc-card ..." data-idx="0" data-key="..." data-status="..." id="card-0">
    const firstCardMatch = html.match(/data-idx="0"[^>]*data-status="(\w+)"/);
    expect(firstCardMatch).not.toBeNull();
    expect(firstCardMatch[1]).toBe("pending");
  });
});

// ===========================================================================
// 2. Spot-Check Review Endpoint (POST /api/admin/spot-check/review)
// ===========================================================================
describe("POST /api/admin/spot-check/review", () => {
  it("requires authentication", async () => {
    const res = await post("/api/admin/spot-check/review", {
      key: "alice-johnson|democrat",
      status: "approved",
    });
    expect(res.status).toBe(401);
  });

  it("saves an approved review", async () => {
    const env = createMockEnv();
    const res = await post(
      "/api/admin/spot-check/review",
      { key: "alice-johnson|democrat", status: "approved" },
      env,
      authHeaders
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.status).toBe("approved");

    // Verify KV was written
    const stored = JSON.parse(env.ELECTION_DATA._store["spot_check_progress"]);
    expect(stored.reviewed["alice-johnson|democrat"].status).toBe("approved");
  });

  it("saves a flagged review with note", async () => {
    const env = createMockEnv();
    const res = await post(
      "/api/admin/spot-check/review",
      { key: "bob-martinez|democrat", status: "flagged", note: "Wrong endorsement listed" },
      env,
      authHeaders
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.status).toBe("flagged");

    const stored = JSON.parse(env.ELECTION_DATA._store["spot_check_progress"]);
    expect(stored.reviewed["bob-martinez|democrat"].status).toBe("flagged");
    expect(stored.reviewed["bob-martinez|democrat"].note).toBe("Wrong endorsement listed");
  });

  it("rejects missing key", async () => {
    const res = await post(
      "/api/admin/spot-check/review",
      { status: "approved" },
      undefined,
      authHeaders
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing required fields");
  });

  it("rejects missing status", async () => {
    const res = await post(
      "/api/admin/spot-check/review",
      { key: "alice-johnson|democrat" },
      undefined,
      authHeaders
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing required fields");
  });

  it("rejects invalid status", async () => {
    const res = await post(
      "/api/admin/spot-check/review",
      { key: "alice-johnson|democrat", status: "maybe" },
      undefined,
      authHeaders
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("approved");
  });

  it("preserves existing reviews when adding new one", async () => {
    const env = createMockEnv({
      spot_check_progress: JSON.stringify({
        reviewed: {
          "alice-johnson|democrat": { status: "approved", note: "", reviewer: "admin", timestamp: "2026-02-28T10:00:00Z" },
        },
      }),
    });
    const res = await post(
      "/api/admin/spot-check/review",
      { key: "bob-martinez|democrat", status: "flagged", note: "Bad data" },
      env,
      authHeaders
    );
    expect(res.status).toBe(200);

    const stored = JSON.parse(env.ELECTION_DATA._store["spot_check_progress"]);
    expect(stored.reviewed["alice-johnson|democrat"].status).toBe("approved");
    expect(stored.reviewed["bob-martinez|democrat"].status).toBe("flagged");
  });

  it("can overwrite a previous review for the same candidate", async () => {
    const env = createMockEnv({
      spot_check_progress: JSON.stringify({
        reviewed: {
          "alice-johnson|democrat": { status: "approved", note: "", reviewer: "admin", timestamp: "2026-02-28T10:00:00Z" },
        },
      }),
    });
    const res = await post(
      "/api/admin/spot-check/review",
      { key: "alice-johnson|democrat", status: "flagged", note: "Changed my mind" },
      env,
      authHeaders
    );
    expect(res.status).toBe(200);

    const stored = JSON.parse(env.ELECTION_DATA._store["spot_check_progress"]);
    expect(stored.reviewed["alice-johnson|democrat"].status).toBe("flagged");
    expect(stored.reviewed["alice-johnson|democrat"].note).toBe("Changed my mind");
  });

  it("handles invalid JSON body gracefully", async () => {
    const url = "https://txvotes.app/api/admin/spot-check/review";
    const request = new Request(url, {
      method: "POST",
      body: "not json",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "1.2.3.4",
        ...authHeaders,
      },
    });
    const res = await worker.fetch(request, createMockEnv());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid JSON");
  });

  it("includes timestamp and reviewer in stored review", async () => {
    const env = createMockEnv();
    await post(
      "/api/admin/spot-check/review",
      { key: "alice-johnson|democrat", status: "approved", reviewer: "josh" },
      env,
      authHeaders
    );

    const stored = JSON.parse(env.ELECTION_DATA._store["spot_check_progress"]);
    const review = stored.reviewed["alice-johnson|democrat"];
    expect(review.reviewer).toBe("josh");
    expect(review.timestamp).toBeDefined();
    // Timestamp should be an ISO string
    expect(new Date(review.timestamp).toISOString()).toBe(review.timestamp);
  });
});

// ===========================================================================
// 3. Spot-Check Export (GET /admin/spot-check/export)
// ===========================================================================
describe("GET /admin/spot-check/export", () => {
  it("requires authentication", async () => {
    const res = await get("/admin/spot-check/export");
    expect(res.status).toBe(401);
  });

  it("returns empty flagged list when no reviews", async () => {
    const res = await get("/admin/spot-check/export", undefined, authHeaders);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.flaggedCount).toBe(0);
    expect(data.flagged).toEqual({});
  });

  it("returns only flagged items, not approved", async () => {
    const env = createMockEnv({
      spot_check_progress: JSON.stringify({
        reviewed: {
          "alice-johnson|democrat": { status: "approved", note: "", reviewer: "admin", timestamp: "2026-02-28T10:00:00Z" },
          "bob-martinez|democrat": { status: "flagged", note: "Wrong endorsement", reviewer: "admin", timestamp: "2026-02-28T10:01:00Z" },
          "carol-davis|democrat": { status: "flagged", note: "Missing positions", reviewer: "josh", timestamp: "2026-02-28T10:02:00Z" },
        },
      }),
    });
    const res = await get("/admin/spot-check/export", env, authHeaders);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.flaggedCount).toBe(2);
    expect(data.flagged["bob-martinez|democrat"]).toBeDefined();
    expect(data.flagged["bob-martinez|democrat"].note).toBe("Wrong endorsement");
    expect(data.flagged["carol-davis|democrat"]).toBeDefined();
    expect(data.flagged["alice-johnson|democrat"]).toBeUndefined();
  });

  it("returns JSON content type", async () => {
    const res = await get("/admin/spot-check/export", undefined, authHeaders);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});

// ===========================================================================
// 4. Spot-Check Reset (POST /api/admin/spot-check/reset)
// ===========================================================================
describe("POST /api/admin/spot-check/reset", () => {
  it("requires authentication", async () => {
    const res = await post("/api/admin/spot-check/reset", {});
    expect(res.status).toBe(401);
  });

  it("resets all review progress", async () => {
    const env = createMockEnv({
      spot_check_progress: JSON.stringify({
        reviewed: {
          "alice-johnson|democrat": { status: "approved", note: "", reviewer: "admin", timestamp: "2026-02-28T10:00:00Z" },
          "bob-martinez|democrat": { status: "flagged", note: "Bad", reviewer: "admin", timestamp: "2026-02-28T10:01:00Z" },
        },
      }),
    });
    const res = await post("/api/admin/spot-check/reset", {}, env, authHeaders);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify KV was cleared
    const stored = JSON.parse(env.ELECTION_DATA._store["spot_check_progress"]);
    expect(stored.reviewed).toEqual({});
  });
});

// ===========================================================================
// 5. Admin Hub includes Spot-Check link
// ===========================================================================
describe("Admin Hub spot-check link", () => {
  it("shows spot-check card on admin hub", async () => {
    const res = await get("/admin", undefined, authHeaders);
    const html = await res.text();
    expect(html).toContain("/admin/spot-check");
    expect(html).toContain("Spot-Check");
  });
});

// ===========================================================================
// 6. Confidence score calculation
// ===========================================================================
describe("Spot-check confidence scoring", () => {
  it("candidates without sources have lower confidence score in the HTML", async () => {
    // The sample ballot candidates have no sources, so all should be ai-inferred
    const res = await get("/admin/spot-check", undefined, authHeaders);
    const html = await res.text();
    // All candidates should show ai-inferred badges
    expect(html).toContain("sc-inferred");
  });

  it("candidates with official sources show verified badges", async () => {
    const ballotWithSources = {
      id: "test_primary_2026",
      party: "democrat",
      electionDate: "2026-03-03",
      electionName: "2026 Democratic Primary",
      races: [
        {
          office: "Governor",
          district: null,
          isContested: true,
          candidates: [
            {
              name: "Sourced Candidate",
              summary: "Has official sources.",
              keyPositions: ["Position 1"],
              pros: ["Pro 1"],
              cons: ["Con 1"],
              endorsements: ["Endorser 1"],
              sources: [
                { url: "https://ballotpedia.org/test", title: "Ballotpedia" },
                { url: "https://votesmart.org/test", title: "Vote Smart" },
                { url: "https://sos.state.tx.us/test", title: "TX SOS" },
              ],
            },
          ],
        },
      ],
    };
    const env = createMockEnv({
      "ballot:statewide:democrat_primary_2026": JSON.stringify(ballotWithSources),
      "ballot:statewide:republican_primary_2026": JSON.stringify(ballotWithSources),
    });
    const res = await get("/admin/spot-check", env, authHeaders);
    const html = await res.text();
    expect(html).toContain("sc-verified");
    expect(html).toContain("Sourced Candidate");
    // Should also show source links
    expect(html).toContain("ballotpedia.org");
  });
});

// ===========================================================================
// 7. Edge cases
// ===========================================================================
describe("Spot-check edge cases", () => {
  it("handles empty ballot data gracefully", async () => {
    const env = createMockEnv({
      "ballot:statewide:democrat_primary_2026": null,
      "ballot:statewide:republican_primary_2026": null,
    });
    const res = await get("/admin/spot-check", env, authHeaders);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Spot-Check");
    // Total should be 0
    expect(html).toContain('>0</div>');
  });

  it("handles corrupted KV progress gracefully", async () => {
    const env = createMockEnv({
      spot_check_progress: "not valid json {{{",
    });
    const res = await get("/admin/spot-check", env, authHeaders);
    expect(res.status).toBe(200);
    // Should still render, treating progress as empty
    const html = await res.text();
    expect(html).toContain("Spot-Check");
  });

  it("escapes HTML in candidate names", async () => {
    const xssBallot = {
      id: "test_primary_2026",
      party: "democrat",
      electionDate: "2026-03-03",
      electionName: "2026 Democratic Primary",
      races: [
        {
          office: "Governor",
          district: null,
          isContested: true,
          candidates: [
            {
              name: '<script>alert("xss")</script>',
              summary: "Test",
              keyPositions: ["Position"],
              pros: ["Pro"],
              cons: ["Con"],
            },
          ],
        },
      ],
    };
    const env = createMockEnv({
      "ballot:statewide:democrat_primary_2026": JSON.stringify(xssBallot),
      "ballot:statewide:republican_primary_2026": JSON.stringify(xssBallot),
    });
    const res = await get("/admin/spot-check", env, authHeaders);
    const html = await res.text();
    // Script tag should be escaped
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows candidate endorsements with type info", async () => {
    const ballot = {
      id: "test_primary_2026",
      party: "democrat",
      electionDate: "2026-03-03",
      electionName: "2026 Democratic Primary",
      races: [
        {
          office: "Governor",
          district: null,
          isContested: true,
          candidates: [
            {
              name: "Test Candidate",
              summary: "Test summary",
              keyPositions: ["Pos 1"],
              endorsements: [
                { name: "AFL-CIO", type: "labor union" },
                { name: "Sierra Club", type: "environmental" },
              ],
              pros: ["Pro 1"],
              cons: ["Con 1"],
            },
          ],
        },
      ],
    };
    const env = createMockEnv({
      "ballot:statewide:democrat_primary_2026": JSON.stringify(ballot),
      "ballot:statewide:republican_primary_2026": JSON.stringify(ballot),
    });
    const res = await get("/admin/spot-check", env, authHeaders);
    const html = await res.text();
    expect(html).toContain("AFL-CIO");
    expect(html).toContain("labor union");
    expect(html).toContain("Sierra Club");
  });

  it("shows party filter dropdown", async () => {
    const res = await get("/admin/spot-check", undefined, authHeaders);
    const html = await res.text();
    expect(html).toContain("party-filter");
    expect(html).toContain("Republican");
    expect(html).toContain("Democrat");
  });

  it("shows search input", async () => {
    const res = await get("/admin/spot-check", undefined, authHeaders);
    const html = await res.text();
    expect(html).toContain("search-input");
    expect(html).toContain("Search by name or race");
  });
});

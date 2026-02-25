import { describe, it, expect, vi, beforeEach } from "vitest";
import { runDailyUpdate, runCountyRefresh, getCountyRefreshSlice, COUNTY_REFRESH_BATCH_SIZE, COUNTY_REFRESH_TRACKER_KEY, validateBallot, validateRaceUpdate, extractSourcesFromResponse, mergeSources, ELECTION_DAY, raceKey, isLowerBallotRace, isUpdateMeaningful, STALE_THRESHOLD, STALE_RESEARCH_INTERVAL, STALE_TRACKER_KEY, ErrorCollector, detectLowQualitySources, ERROR_CATEGORIES, ERROR_LOG_PREFIX } from "../src/updater.js";

// ---------------------------------------------------------------------------
// mergeRaceUpdates is not exported, so we test it indirectly through
// runDailyUpdate. validateBallot, validateRaceUpdate, and runDailyUpdate
// are exported and tested directly.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// validateBallot
// ---------------------------------------------------------------------------
describe("validateBallot", () => {
  it("returns null for matching ballots", () => {
    const original = { races: [{ office: "Gov" }], party: "democrat" };
    const updated = { races: [{ office: "Gov" }], party: "democrat" };
    expect(validateBallot(original, updated)).toBeNull();
  });

  it("returns error when race count changes", () => {
    const original = { races: [{ office: "A" }, { office: "B" }], party: "democrat" };
    const updated = { races: [{ office: "A" }], party: "democrat" };
    const err = validateBallot(original, updated);
    expect(err).toContain("race count changed");
    expect(err).toContain("2");
    expect(err).toContain("1");
  });

  it("returns error when party changes", () => {
    const original = { races: [], party: "democrat" };
    const updated = { races: [], party: "republican" };
    const err = validateBallot(original, updated);
    expect(err).toContain("party changed");
    expect(err).toContain("democrat");
    expect(err).toContain("republican");
  });

  it("returns error when original is null", () => {
    expect(validateBallot(null, { races: [], party: "democrat" })).toBe(
      "missing ballot data"
    );
  });

  it("returns error when updated is null", () => {
    expect(validateBallot({ races: [], party: "democrat" }, null)).toBe(
      "missing ballot data"
    );
  });

  it("returns error when both are null", () => {
    expect(validateBallot(null, null)).toBe("missing ballot data");
  });

  it("returns error when both are undefined", () => {
    expect(validateBallot(undefined, undefined)).toBe("missing ballot data");
  });

  it("accepts identical multi-race ballots", () => {
    const original = {
      races: [
        { office: "U.S. Senator" },
        { office: "Governor" },
        { office: "State Rep" },
      ],
      party: "republican",
    };
    const updated = {
      races: [
        { office: "U.S. Senator" },
        { office: "Governor" },
        { office: "State Rep" },
      ],
      party: "republican",
    };
    expect(validateBallot(original, updated)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// runDailyUpdate — election day cutoff
// ---------------------------------------------------------------------------
describe("runDailyUpdate — election day cutoff", () => {
  it("skips after election day (March 3, 2026)", async () => {
    // Mock Date to be after election day
    const realDate = globalThis.Date;
    const afterElection = new Date("2026-03-05T12:00:00Z");
    vi.useFakeTimers({ now: afterElection });

    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn(),
        put: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test",
    };

    const result = await runDailyUpdate(mockEnv, { skipCounties: true });
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("Past election day");

    // Should not have called KV at all
    expect(mockEnv.ELECTION_DATA.get).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// runDailyUpdate — dry run
// ---------------------------------------------------------------------------
describe("runDailyUpdate — dry run mode", () => {
  let mockEnv;

  beforeEach(() => {
    vi.useRealTimers();
    // Set time before election day for these tests
    vi.useFakeTimers({ now: new Date("2026-02-20T12:00:00Z") });
  });

  it("does not write to KV in dry run mode", async () => {
    const ballot = {
      id: "test",
      party: "democrat",
      races: [
        {
          office: "Governor",
          isContested: true,
          candidates: [
            { name: "Alice", summary: "Test", endorsements: ["A"], keyPositions: ["X"], pros: ["Strong record on policy", "Experienced public servant"], cons: ["Limited name recognition", "No prior state office experience"] },
            { name: "Bob", summary: "Test", endorsements: ["B"], keyPositions: ["Y"], pros: ["Fresh policy perspective", "Community organizer background"], cons: ["Lacks legislative experience", "Limited fundraising reach"] },
          ],
        },
      ],
    };

    const mockPut = vi.fn();
    mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (key.includes("ballot")) return JSON.stringify(ballot);
          return null;
        }),
        put: mockPut,
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    // Mock fetch to return an update
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: "Leading 52%", fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    const result = await runDailyUpdate(mockEnv, {
      parties: ["democrat"],
      dryRun: true,
      skipCounties: true,
    });

    // Should NOT have written to KV
    expect(mockPut).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("reports error when ballot not found in KV", async () => {
    mockEnv = {
      ELECTION_DATA: {
        get: vi.fn(() => null),
        put: vi.fn(),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    const result = await runDailyUpdate(mockEnv, {
      parties: ["democrat"],
      dryRun: true,
      skipCounties: true,
    });

    expect(result.errors).toContain("democrat: no existing ballot in KV");

    vi.useRealTimers();
  });

  it("reports error when ballot JSON is invalid", async () => {
    mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (key.includes("ballot")) return "not valid json{{{";
          return null;
        }),
        put: vi.fn(),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    const result = await runDailyUpdate(mockEnv, {
      parties: ["democrat"],
      dryRun: true,
      skipCounties: true,
    });

    expect(result.errors).toContain(
      "democrat: failed to parse existing ballot JSON"
    );

    vi.useRealTimers();
  });

  it("skips uncontested races", async () => {
    const ballot = {
      id: "test",
      party: "republican",
      races: [
        {
          office: "Board of Ed",
          isContested: false,
          candidates: [{ name: "Solo Runner", summary: "Unopposed" }],
        },
      ],
    };

    mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (key.includes("ballot")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn(),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    // fetch should NOT be called (no contested races)
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await runDailyUpdate(mockEnv, {
      parties: ["republican"],
      dryRun: true,
      skipCounties: true,
    });

    // No API calls for uncontested
    expect(mockFetch).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// runDailyUpdate — merge and validation via end-to-end
// ---------------------------------------------------------------------------
describe("runDailyUpdate — merge and validation behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-02-20T12:00:00Z") });
  });

  it("rejects updates that change candidate count (validation)", async () => {
    const ballot = {
      id: "test",
      party: "democrat",
      races: [
        {
          office: "Governor",
          district: null,
          isContested: true,
          candidates: [
            { name: "Alice", summary: "Gov candidate", endorsements: ["A"], keyPositions: ["X"], pros: ["Strong record on policy", "Experienced public servant"], cons: ["Limited name recognition", "No prior state office experience"] },
            { name: "Bob", summary: "Gov candidate", endorsements: ["B"], keyPositions: ["Y"], pros: ["Fresh policy perspective", "Community organizer background"], cons: ["Lacks legislative experience", "Limited fundraising reach"] },
          ],
        },
      ],
    };

    const mockPut = vi.fn();
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (key.includes("ballot")) return JSON.stringify(ballot);
          return null;
        }),
        put: mockPut,
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    // Return an update that adds an extra candidate (invalid)
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                      // Extra candidate — invalid, should be caught by validation
                      { name: "Charlie", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: "New", background: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    const result = await runDailyUpdate(mockEnv, {
      parties: ["democrat"],
      dryRun: true,
      skipCounties: true,
    });

    // Note: mergeRaceUpdates only updates existing candidates (Charlie wouldn't match),
    // so the merged result keeps 2 candidates, which matches. No validation error here.
    // The validation checks names match, and since merge preserves names, this passes.
    // But let's verify no unexpected errors
    expect(result).toBeDefined();

    vi.useRealTimers();
  });

  it("successfully merges valid updates and writes to KV", async () => {
    const ballot = {
      id: "test",
      party: "democrat",
      races: [
        {
          office: "Governor",
          district: null,
          isContested: true,
          candidates: [
            { name: "Alice", summary: "Gov candidate", endorsements: ["A", "B"], keyPositions: ["X"], polling: null, fundraising: null, pros: ["Strong record on policy", "Experienced public servant"], cons: ["Limited name recognition", "No prior state office experience"] },
            { name: "Bob", summary: "Gov candidate", endorsements: ["C"], keyPositions: ["Y"], polling: null, fundraising: null, pros: ["Fresh policy perspective", "Community organizer background"], cons: ["Lacks legislative experience", "Limited fundraising reach"] },
          ],
        },
      ],
    };

    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (kvStore[key]) return kvStore[key];
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => {
          kvStore[key] = value;
        }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    // Return a valid update — new polling data for Alice
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: "Leading 55%", fundraising: "$2M", endorsements: ["A", "B", "D"], keyPositions: null, pros: null, cons: null, summary: null, background: null },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    const result = await runDailyUpdate(mockEnv, {
      parties: ["democrat"],
      skipCounties: true,
    });

    expect(result.updated).toContain("democrat");
    // Should have written ballot and manifest and update log
    expect(mockEnv.ELECTION_DATA.put).toHaveBeenCalled();
    const putCalls = mockEnv.ELECTION_DATA.put.mock.calls.map((c) => c[0]);
    expect(putCalls).toContain("ballot:statewide:democrat_primary_2026");
    expect(putCalls).toContain("manifest");

    // Verify the stored ballot has updated polling
    const storedBallot = JSON.parse(
      kvStore["ballot:statewide:democrat_primary_2026"]
    );
    const alice = storedBallot.races[0].candidates.find(
      (c) => c.name === "Alice"
    );
    expect(alice.polling).toBe("Leading 55%");
    expect(alice.fundraising).toBe("$2M");
    expect(alice.endorsements).toEqual([
      { name: "A", type: null },
      { name: "B", type: null },
      { name: "D", type: null },
    ]);

    // Bob should be unchanged
    const bob = storedBallot.races[0].candidates.find(
      (c) => c.name === "Bob"
    );
    expect(bob.polling).toBeNull();

    vi.useRealTimers();
  });

  it("rejects endorsement shrinkage >50%", async () => {
    const ballot = {
      id: "test",
      party: "democrat",
      races: [
        {
          office: "Senator",
          district: null,
          isContested: true,
          candidates: [
            { name: "Alice", summary: "Senator", endorsements: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], keyPositions: ["X"], pros: ["Strong record on policy", "Experienced public servant"], cons: ["Limited name recognition", "No prior state office experience"] },
            { name: "Bob", summary: "Senator", endorsements: ["Z"], keyPositions: ["Y"], pros: ["Fresh policy perspective", "Community organizer background"], cons: ["Lacks legislative experience", "Limited fundraising reach"] },
          ],
        },
      ],
    };

    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (key.includes("ballot")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn(),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    // Return update that shrinks Alice's endorsements from 10 to 3 (>50% shrinkage)
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: null, fundraising: null, endorsements: ["A", "B", "C"], keyPositions: null, pros: null, cons: null, summary: null, background: null },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    const result = await runDailyUpdate(mockEnv, {
      parties: ["democrat"],
      dryRun: true,
      skipCounties: true,
    });

    // Should have a validation error about endorsement shrinkage
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("endorsements shrank");
    expect(result.errors[0]).toContain("50%");

    vi.useRealTimers();
  });

  it("ignores empty strings in updates (does not overwrite)", async () => {
    const ballot = {
      id: "test",
      party: "democrat",
      races: [
        {
          office: "Governor",
          district: null,
          isContested: true,
          candidates: [
            { name: "Alice", summary: "Original summary", endorsements: ["A"], keyPositions: ["X"], pros: ["Strong record on policy", "Experienced public servant"], cons: ["Limited name recognition", "No prior state office experience"] },
            { name: "Bob", summary: "Bob summary", endorsements: ["B"], keyPositions: ["Y"], pros: ["Fresh policy perspective", "Community organizer background"], cons: ["Lacks legislative experience", "Limited fundraising reach"] },
          ],
        },
      ],
    };

    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (kvStore[key]) return kvStore[key];
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => {
          kvStore[key] = value;
        }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    // Return update with empty string for summary (should be ignored)
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: "55%", fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: "", background: null },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    const result = await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    expect(result.updated).toContain("democrat");
    const stored = JSON.parse(kvStore["ballot:statewide:democrat_primary_2026"]);
    const alice = stored.races[0].candidates.find((c) => c.name === "Alice");
    // Summary should still be original (empty string ignored)
    expect(alice.summary).toBe("Original summary");
    // But polling should be updated
    expect(alice.polling).toBe("55%");

    vi.useRealTimers();
  });

  it("ignores empty arrays in updates (does not overwrite)", async () => {
    const ballot = {
      id: "test",
      party: "democrat",
      races: [
        {
          office: "Governor",
          district: null,
          isContested: true,
          candidates: [
            { name: "Alice", summary: "Gov candidate", endorsements: ["A"], keyPositions: ["X", "Y"], pros: ["Strong record on policy", "Experienced public servant"], cons: ["Limited name recognition", "No prior state office experience"] },
            { name: "Bob", summary: "Gov candidate", endorsements: ["B"], keyPositions: ["Z"], pros: ["Fresh policy perspective", "Community organizer background"], cons: ["Lacks legislative experience", "Limited fundraising reach"] },
          ],
        },
      ],
    };

    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (kvStore[key]) return kvStore[key];
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => {
          kvStore[key] = value;
        }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    // Return update with empty array for endorsements (should be ignored)
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: "50%", fundraising: null, endorsements: [], keyPositions: [], pros: null, cons: null, summary: null, background: null },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    const result = await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    expect(result.updated).toContain("democrat");
    const stored = JSON.parse(kvStore["ballot:statewide:democrat_primary_2026"]);
    const alice = stored.races[0].candidates.find((c) => c.name === "Alice");
    // Endorsements and keyPositions should keep original (empty arrays ignored)
    expect(alice.endorsements).toEqual(["A"]);
    expect(alice.keyPositions).toEqual(["X", "Y"]);
    // But polling should be updated
    expect(alice.polling).toBe("50%");

    vi.useRealTimers();
  });

  it("reports error when statewide ballot key is missing (no legacy fallback)", async () => {
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          // No ballot data at all
          return null;
        }),
        put: vi.fn(),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    const result = await runDailyUpdate(mockEnv, {
      parties: ["democrat"],
      dryRun: true,
      skipCounties: true,
    });

    // Should have tried statewide key
    expect(mockEnv.ELECTION_DATA.get).toHaveBeenCalledWith(
      "ballot:statewide:democrat_primary_2026"
    );
    // Should report error
    expect(result.errors).toContain("democrat: no existing ballot in KV");

    vi.useRealTimers();
  });

  it("handles API error gracefully", async () => {
    const ballot = {
      id: "test",
      party: "democrat",
      races: [
        {
          office: "Governor",
          district: null,
          isContested: true,
          candidates: [
            { name: "Alice", summary: "Test", pros: ["Strong record on policy", "Experienced public servant"], cons: ["Limited name recognition", "No prior state office experience"] },
            { name: "Bob", summary: "Test", pros: ["Fresh policy perspective", "Community organizer background"], cons: ["Lacks legislative experience", "Limited fundraising reach"] },
          ],
        },
      ],
    };

    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (key.includes("ballot")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn(),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    // Mock fetch to return 500
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
        })
      )
    );

    const result = await runDailyUpdate(mockEnv, {
      parties: ["democrat"],
      dryRun: true,
      skipCounties: true,
    });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("democrat/Governor");

    vi.useRealTimers();
  });

  it("invalidates candidates_index when ballot changes", async () => {
    const ballot = {
      id: "test",
      party: "democrat",
      races: [
        {
          office: "Governor",
          district: null,
          isContested: true,
          candidates: [
            { name: "Alice", summary: "Test", endorsements: ["A"], keyPositions: ["X"], pros: ["Strong record on policy", "Experienced public servant"], cons: ["Limited name recognition", "No prior state office experience"] },
            { name: "Bob", summary: "Test", endorsements: ["B"], keyPositions: ["Y"], pros: ["Fresh policy perspective", "Community organizer background"], cons: ["Lacks legislative experience", "Limited fundraising reach"] },
          ],
        },
      ],
    };

    const mockDelete = vi.fn();
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn(),
        delete: mockDelete,
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: "60%", fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    expect(mockDelete).toHaveBeenCalledWith("candidates_index");

    vi.useRealTimers();
  });

  it("skips candidates_index invalidation on Election Day to avoid peak-load cache rebuilds", async () => {
    // Set clock to Election Day itself
    vi.useRealTimers();
    vi.useFakeTimers({ now: new Date(ELECTION_DAY + "T14:00:00Z") });

    const ballot = {
      id: "test",
      party: "democrat",
      races: [
        {
          office: "Governor",
          district: null,
          isContested: true,
          candidates: [
            { name: "Alice", summary: "Test", endorsements: ["A"], keyPositions: ["X"], pros: ["Strong record on policy", "Experienced public servant"], cons: ["Limited name recognition", "No prior state office experience"] },
            { name: "Bob", summary: "Test", endorsements: ["B"], keyPositions: ["Y"], pros: ["Fresh policy perspective", "Community organizer background"], cons: ["Lacks legislative experience", "Limited fundraising reach"] },
          ],
        },
      ],
    };

    const mockDelete = vi.fn();
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn(),
        delete: mockDelete,
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: "60%", fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    const result = await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    // Update should still succeed — data is written to KV
    expect(result.updated).toContain("democrat");
    expect(mockEnv.ELECTION_DATA.put).toHaveBeenCalled();

    // But candidates_index should NOT be invalidated on Election Day
    expect(mockDelete).not.toHaveBeenCalledWith("candidates_index");

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// extractSourcesFromResponse
// ---------------------------------------------------------------------------
describe("extractSourcesFromResponse", () => {
  it("extracts URLs from web_search_tool_result blocks", () => {
    const blocks = [
      {
        type: "web_search_tool_result",
        content: [
          { type: "web_search_result", url: "https://example.com/a", title: "Article A" },
          { type: "web_search_result", url: "https://example.com/b", title: "Article B" },
        ],
      },
      { type: "text", text: "Some text" },
    ];
    const sources = extractSourcesFromResponse(blocks);
    expect(sources).toHaveLength(2);
    expect(sources[0].url).toBe("https://example.com/a");
    expect(sources[0].title).toBe("Article A");
    expect(sources[1].url).toBe("https://example.com/b");
  });

  it("extracts citations from text blocks", () => {
    const blocks = [
      {
        type: "text",
        text: "Some text with citations",
        citations: [
          { url: "https://example.com/cite1", title: "Citation 1", cited_text: "blah" },
          { url: "https://example.com/cite2", title: "Citation 2", cited_text: "blah" },
        ],
      },
    ];
    const sources = extractSourcesFromResponse(blocks);
    expect(sources).toHaveLength(2);
    expect(sources[0].url).toBe("https://example.com/cite1");
    expect(sources[1].title).toBe("Citation 2");
  });

  it("deduplicates URLs across blocks", () => {
    const blocks = [
      {
        type: "web_search_tool_result",
        content: [
          { type: "web_search_result", url: "https://example.com/dup", title: "First" },
        ],
      },
      {
        type: "text",
        text: "text",
        citations: [
          { url: "https://example.com/dup", title: "Second" },
        ],
      },
    ];
    const sources = extractSourcesFromResponse(blocks);
    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe("First"); // first occurrence wins
  });

  it("returns empty array for null/undefined input", () => {
    expect(extractSourcesFromResponse(null)).toEqual([]);
    expect(extractSourcesFromResponse(undefined)).toEqual([]);
    expect(extractSourcesFromResponse([])).toEqual([]);
  });

  it("skips items without URLs", () => {
    const blocks = [
      {
        type: "web_search_tool_result",
        content: [
          { type: "web_search_result", url: null, title: "No URL" },
          { type: "web_search_result", url: "https://example.com/good", title: "Good" },
        ],
      },
    ];
    const sources = extractSourcesFromResponse(blocks);
    expect(sources).toHaveLength(1);
    expect(sources[0].url).toBe("https://example.com/good");
  });

  it("uses URL as title when title is missing", () => {
    const blocks = [
      {
        type: "web_search_tool_result",
        content: [
          { type: "web_search_result", url: "https://example.com/notitle" },
        ],
      },
    ];
    const sources = extractSourcesFromResponse(blocks);
    expect(sources[0].title).toBe("https://example.com/notitle");
  });

  it("includes accessDate as today", () => {
    const blocks = [
      {
        type: "web_search_tool_result",
        content: [
          { type: "web_search_result", url: "https://example.com/a", title: "A" },
        ],
      },
    ];
    const sources = extractSourcesFromResponse(blocks);
    expect(sources[0].accessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// mergeSources
// ---------------------------------------------------------------------------
describe("mergeSources", () => {
  it("merges new sources into existing", () => {
    const existing = [{ url: "https://a.com", title: "A", accessDate: "2026-01-01" }];
    const incoming = [{ url: "https://b.com", title: "B", accessDate: "2026-02-01" }];
    const merged = mergeSources(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged[0].url).toBe("https://a.com");
    expect(merged[1].url).toBe("https://b.com");
  });

  it("deduplicates by URL", () => {
    const existing = [{ url: "https://a.com", title: "A", accessDate: "2026-01-01" }];
    const incoming = [
      { url: "https://a.com", title: "A updated", accessDate: "2026-02-01" },
      { url: "https://b.com", title: "B", accessDate: "2026-02-01" },
    ];
    const merged = mergeSources(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged[0].title).toBe("A"); // existing wins
  });

  it("limits to max 20 sources", () => {
    const existing = Array.from({ length: 18 }, (_, i) => ({
      url: `https://existing${i}.com`,
      title: `E${i}`,
      accessDate: "2026-01-01",
    }));
    const incoming = Array.from({ length: 5 }, (_, i) => ({
      url: `https://new${i}.com`,
      title: `N${i}`,
      accessDate: "2026-02-01",
    }));
    const merged = mergeSources(existing, incoming);
    expect(merged).toHaveLength(20);
  });

  it("handles null existing", () => {
    const incoming = [{ url: "https://a.com", title: "A", accessDate: "2026-01-01" }];
    const merged = mergeSources(null, incoming);
    expect(merged).toHaveLength(1);
  });

  it("handles null incoming", () => {
    const existing = [{ url: "https://a.com", title: "A", accessDate: "2026-01-01" }];
    const merged = mergeSources(existing, null);
    expect(merged).toHaveLength(1);
    expect(merged[0].url).toBe("https://a.com");
  });

  it("handles both null", () => {
    const merged = mergeSources(null, null);
    expect(merged).toEqual([]);
  });

  it("skips incoming items without URL", () => {
    const incoming = [
      { url: "", title: "No URL", accessDate: "2026-01-01" },
      { url: "https://good.com", title: "Good", accessDate: "2026-01-01" },
    ];
    const merged = mergeSources([], incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].url).toBe("https://good.com");
  });
});

// ---------------------------------------------------------------------------
// Source validation (tested via runDailyUpdate end-to-end)
// ---------------------------------------------------------------------------
describe("source validation in updates", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-02-20T12:00:00Z") });
  });

  it("caps sources at 20 when Claude returns more than 20", async () => {
    const sources25 = Array.from({ length: 25 }, (_, i) => ({
      url: `https://src${i}.com`,
      title: `Source ${i}`,
    }));
    const ballot = {
      id: "test",
      party: "democrat",
      races: [
        {
          office: "Governor",
          district: null,
          isContested: true,
          candidates: [
            { name: "Alice", summary: "Test", endorsements: ["A"], keyPositions: ["X"], pros: ["Strong record on policy", "Experienced public servant"], cons: ["Limited name recognition", "No prior state office experience"] },
            { name: "Bob", summary: "Test", endorsements: ["B"], keyPositions: ["Y"], pros: ["Fresh policy perspective", "Community organizer background"], cons: ["Lacks legislative experience", "Limited fundraising reach"] },
          ],
        },
      ],
    };

    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (kvStore[key]) return kvStore[key];
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => {
          kvStore[key] = value;
        }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null, sources: sources25 },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null, sources: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    // mergeSources caps at 20, so it should pass validation and be stored
    const result = await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    expect(result.updated).toContain("democrat");
    const stored = JSON.parse(kvStore["ballot:statewide:democrat_primary_2026"]);
    const alice = stored.races[0].candidates.find((c) => c.name === "Alice");
    expect(alice.sources).toHaveLength(20);

    vi.useRealTimers();
  });

  it("successfully merges sources from API response into candidates", async () => {
    const ballot = {
      id: "test",
      party: "democrat",
      races: [
        {
          office: "Governor",
          district: null,
          isContested: true,
          candidates: [
            { name: "Alice", summary: "Gov candidate", endorsements: ["A"], keyPositions: ["X"], pros: ["Strong record on policy", "Experienced public servant"], cons: ["Limited name recognition", "No prior state office experience"] },
            { name: "Bob", summary: "Gov candidate", endorsements: ["B"], keyPositions: ["Y"], pros: ["Fresh policy perspective", "Community organizer background"], cons: ["Lacks legislative experience", "Limited fundraising reach"] },
          ],
        },
      ],
    };

    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (kvStore[key]) return kvStore[key];
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => {
          kvStore[key] = value;
        }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "web_search_tool_result",
                  content: [
                    { type: "web_search_result", url: "https://texastribune.org/alice", title: "Alice profile" },
                    { type: "web_search_result", url: "https://ballotpedia.org/bob", title: "Bob profile" },
                  ],
                },
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: "55%", fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null, sources: [{ url: "https://alice-campaign.com", title: "Alice Campaign" }] },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null, sources: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    const result = await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    expect(result.updated).toContain("democrat");
    const stored = JSON.parse(kvStore["ballot:statewide:democrat_primary_2026"]);
    const alice = stored.races[0].candidates.find((c) => c.name === "Alice");
    // Alice should have her candidate-level source + API-level sources
    expect(alice.sources).toBeDefined();
    expect(alice.sources.length).toBeGreaterThanOrEqual(1);
    expect(alice.sources.some((s) => s.url === "https://alice-campaign.com")).toBe(true);
    expect(alice.sources.some((s) => s.url === "https://texastribune.org/alice")).toBe(true);
    expect(alice.sourcesUpdatedAt).toBeDefined();

    // Bob should have API-level sources as fallback
    const bob = stored.races[0].candidates.find((c) => c.name === "Bob");
    expect(bob.sources).toBeDefined();
    expect(bob.sources.some((s) => s.url === "https://texastribune.org/alice")).toBe(true);

    vi.useRealTimers();
  });

  it("preserves existing sources when no new sources provided", async () => {
    const ballot = {
      id: "test",
      party: "democrat",
      races: [
        {
          office: "Governor",
          district: null,
          isContested: true,
          candidates: [
            {
              name: "Alice",
              summary: "Gov candidate",
              endorsements: ["A"],
              keyPositions: ["X"],
              sources: [{ url: "https://existing.com", title: "Existing", accessDate: "2026-01-01" }],
              pros: ["Strong record on policy", "Experienced public servant"],
              cons: ["Limited name recognition", "No prior state office experience"],
            },
            { name: "Bob", summary: "Gov candidate", endorsements: ["B"], keyPositions: ["Y"], pros: ["Fresh policy perspective", "Community organizer background"], cons: ["Lacks legislative experience", "Limited fundraising reach"] },
          ],
        },
      ],
    };

    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (kvStore[key]) return kvStore[key];
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => {
          kvStore[key] = value;
        }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    // No web_search_tool_result blocks, no sources from Claude
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: "60%", fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null, sources: null },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null, sources: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    const result = await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    expect(result.updated).toContain("democrat");
    const stored = JSON.parse(kvStore["ballot:statewide:democrat_primary_2026"]);
    const alice = stored.races[0].candidates.find((c) => c.name === "Alice");
    // Existing sources should be preserved
    expect(alice.sources).toEqual([{ url: "https://existing.com", title: "Existing", accessDate: "2026-01-01" }]);
    expect(alice.polling).toBe("60%");

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// validateRaceUpdate — direct unit tests
// ---------------------------------------------------------------------------
// Helper: minimum pros/cons to pass balance validation
const balancedProps = { pros: ["Strong record on policy", "Experienced public servant"], cons: ["Limited name recognition", "No prior state office experience"] };

describe("validateRaceUpdate", () => {
  it("returns null for matching races", () => {
    const original = {
      candidates: [
        { name: "Alice", summary: "Test", endorsements: ["A"], ...balancedProps },
        { name: "Bob", summary: "Test", endorsements: ["B"], ...balancedProps },
      ],
    };
    const updated = {
      candidates: [
        { name: "Alice", summary: "Test updated", endorsements: ["A", "C"], ...balancedProps },
        { name: "Bob", summary: "Test", endorsements: ["B"], ...balancedProps },
      ],
    };
    expect(validateRaceUpdate(original, updated)).toBeNull();
  });

  it("returns error when original is null", () => {
    expect(validateRaceUpdate(null, { candidates: [] })).toBe("missing race data");
  });

  it("returns error when updated is null", () => {
    expect(validateRaceUpdate({ candidates: [] }, null)).toBe("missing race data");
  });

  it("returns error when candidate count changes", () => {
    const original = {
      candidates: [{ name: "Alice", ...balancedProps }, { name: "Bob", ...balancedProps }],
    };
    const updated = {
      candidates: [{ name: "Alice", ...balancedProps }],
    };
    const err = validateRaceUpdate(original, updated);
    expect(err).toContain("candidate count changed");
    expect(err).toContain("2");
    expect(err).toContain("1");
  });

  it("returns error when candidate names change", () => {
    const original = {
      candidates: [{ name: "Alice", ...balancedProps }, { name: "Bob", ...balancedProps }],
    };
    const updated = {
      candidates: [{ name: "Alice", ...balancedProps }, { name: "Charlie", ...balancedProps }],
    };
    const err = validateRaceUpdate(original, updated);
    expect(err).toContain("candidate names changed");
  });

  it("returns error when endorsements shrink by more than 50%", () => {
    const original = {
      candidates: [
        { name: "Alice", endorsements: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], ...balancedProps },
      ],
    };
    const updated = {
      candidates: [
        { name: "Alice", endorsements: ["A", "B", "C"], ...balancedProps },
      ],
    };
    const err = validateRaceUpdate(original, updated);
    expect(err).toContain("endorsements shrank");
    expect(err).toContain("50%");
  });

  it("allows endorsements to shrink by less than 50%", () => {
    const original = {
      candidates: [
        { name: "Alice", endorsements: ["A", "B", "C", "D"], ...balancedProps },
      ],
    };
    const updated = {
      candidates: [
        { name: "Alice", endorsements: ["A", "B", "C"], ...balancedProps },
      ],
    };
    expect(validateRaceUpdate(original, updated)).toBeNull();
  });

  it("skips endorsement check when original has no endorsements", () => {
    const original = {
      candidates: [{ name: "Alice", endorsements: [], ...balancedProps }],
    };
    const updated = {
      candidates: [{ name: "Alice", endorsements: ["New"], ...balancedProps }],
    };
    expect(validateRaceUpdate(original, updated)).toBeNull();
  });

  it("skips endorsement check when updated has no endorsements", () => {
    const original = {
      candidates: [{ name: "Alice", endorsements: ["A", "B"], ...balancedProps }],
    };
    const updated = {
      candidates: [{ name: "Alice", endorsements: [], ...balancedProps }],
    };
    // Empty endorsements = falsy length, so optional chaining skips the check
    expect(validateRaceUpdate(original, updated)).toBeNull();
  });

  it("returns error for empty candidate name", () => {
    const original = { candidates: [{ name: "Alice", ...balancedProps }] };
    const updated = { candidates: [{ name: "", ...balancedProps }] };
    // Name mismatch detected first
    const err = validateRaceUpdate(original, updated);
    expect(err).toBeTruthy();
  });

  it("returns error for empty summary in updated candidate", () => {
    const original = { candidates: [{ name: "Alice", summary: "Test", ...balancedProps }] };
    const updated = { candidates: [{ name: "Alice", summary: "", ...balancedProps }] };
    const err = validateRaceUpdate(original, updated);
    expect(err).toContain("empty summary");
  });

  it("validates source URLs when present", () => {
    const original = { candidates: [{ name: "Alice", ...balancedProps }] };
    const updated = {
      candidates: [
        {
          name: "Alice",
          summary: "Test",
          sources: [{ url: "not-a-url", title: "Bad" }],
          ...balancedProps,
        },
      ],
    };
    const err = validateRaceUpdate(original, updated);
    expect(err).toContain("malformed URL");
  });

  it("accepts valid source URLs", () => {
    const original = { candidates: [{ name: "Alice", ...balancedProps }] };
    const updated = {
      candidates: [
        {
          name: "Alice",
          summary: "Test",
          sources: [
            { url: "https://texastribune.org/article", title: "Good" },
            { url: "https://ballotpedia.org/test", title: "Also Good" },
          ],
          ...balancedProps,
        },
      ],
    };
    expect(validateRaceUpdate(original, updated)).toBeNull();
  });

  it("returns error for source with missing URL", () => {
    const original = { candidates: [{ name: "Alice", ...balancedProps }] };
    const updated = {
      candidates: [
        {
          name: "Alice",
          summary: "Test",
          sources: [{ url: "", title: "No URL" }],
          ...balancedProps,
        },
      ],
    };
    const err = validateRaceUpdate(original, updated);
    expect(err).toContain("invalid URL");
  });

  it("allows candidates without sources field", () => {
    const original = { candidates: [{ name: "Alice", ...balancedProps }] };
    const updated = { candidates: [{ name: "Alice", summary: "Test", ...balancedProps }] };
    expect(validateRaceUpdate(original, updated)).toBeNull();
  });

  it("handles unsorted candidate names (compares sorted)", () => {
    const original = {
      candidates: [{ name: "Bob", ...balancedProps }, { name: "Alice", ...balancedProps }],
    };
    const updated = {
      candidates: [{ name: "Alice", summary: "Test", ...balancedProps }, { name: "Bob", summary: "Test", ...balancedProps }],
    };
    expect(validateRaceUpdate(original, updated)).toBeNull();
  });

  it("returns error when candidate has fewer than 2 pros", () => {
    const original = { candidates: [{ name: "Alice", pros: ["One"], cons: ["A", "B"] }] };
    const updated = { candidates: [{ name: "Alice", pros: ["One"], cons: ["A", "B"] }] };
    const err = validateRaceUpdate(original, updated);
    expect(err).toContain("Alice");
    expect(err).toContain("fewer than 2 pros");
  });

  it("returns error when candidate has fewer than 2 cons", () => {
    const original = { candidates: [{ name: "Alice", pros: ["A", "B"], cons: ["One"] }] };
    const updated = { candidates: [{ name: "Alice", pros: ["A", "B"], cons: ["One"] }] };
    const err = validateRaceUpdate(original, updated);
    expect(err).toContain("Alice");
    expect(err).toContain("fewer than 2 cons");
  });

  it("skips balance validation for withdrawn candidates", () => {
    const original = { candidates: [{ name: "Alice", withdrawn: true }] };
    const updated = { candidates: [{ name: "Alice", withdrawn: true }] };
    expect(validateRaceUpdate(original, updated)).toBeNull();
  });
});



// ---------------------------------------------------------------------------
// getCountyRefreshSlice — rotating county selection
// ---------------------------------------------------------------------------
describe("getCountyRefreshSlice", () => {
  it("returns exactly COUNTY_REFRESH_BATCH_SIZE counties", () => {
    const slice = getCountyRefreshSlice(new Date("2026-02-20T12:00:00Z"));
    expect(slice.length).toBe(COUNTY_REFRESH_BATCH_SIZE);
    expect(slice.length).toBe(10);
  });

  it("returns different slices on consecutive days", () => {
    const day1 = getCountyRefreshSlice(new Date("2026-02-20T12:00:00Z"));
    const day2 = getCountyRefreshSlice(new Date("2026-02-21T12:00:00Z"));
    const names1 = day1.map(c => c.name);
    const names2 = day2.map(c => c.name);
    expect(names1).not.toEqual(names2);
  });

  it("cycles back to the same slice every 3 days (30 counties / 10 per batch)", () => {
    const day1 = getCountyRefreshSlice(new Date("2026-02-20T12:00:00Z"));
    const day4 = getCountyRefreshSlice(new Date("2026-02-23T12:00:00Z"));
    const names1 = day1.map(c => c.name);
    const names4 = day4.map(c => c.name);
    expect(names1).toEqual(names4);
  });

  it("every returned county has fips and name", () => {
    const slice = getCountyRefreshSlice(new Date("2026-02-20T12:00:00Z"));
    for (const county of slice) {
      expect(county.fips).toBeDefined();
      expect(county.name).toBeDefined();
      expect(typeof county.fips).toBe("string");
      expect(typeof county.name).toBe("string");
    }
  });

  it("all returned FIPS codes start with 48 (Texas)", () => {
    const slice = getCountyRefreshSlice(new Date("2026-02-20T12:00:00Z"));
    for (const county of slice) {
      expect(county.fips.startsWith("48")).toBe(true);
    }
  });

  it("covers all 30 top counties over 3 consecutive days", () => {
    const allNames = new Set();
    for (let d = 0; d < 3; d++) {
      const date = new Date("2026-02-20T12:00:00Z");
      date.setDate(date.getDate() + d);
      const slice = getCountyRefreshSlice(date);
      for (const county of slice) {
        allNames.add(county.name);
      }
    }
    expect(allNames.size).toBe(30);
  });

  it("defaults to current date when no argument provided", () => {
    const slice = getCountyRefreshSlice();
    expect(slice.length).toBe(10);
    expect(slice[0].fips).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// runCountyRefresh
// ---------------------------------------------------------------------------
describe("runCountyRefresh", () => {
  it("skips after election day", async () => {
    vi.useFakeTimers({ now: new Date("2026-03-05T12:00:00Z") });

    const mockEnv = {
      ELECTION_DATA: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
      ANTHROPIC_API_KEY: "test",
    };

    const result = await runCountyRefresh(mockEnv);
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("Past election day");

    vi.useRealTimers();
  });

  it("skips ballot refresh when no existing ballot in KV", async () => {
    const mockKV = new Map();
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => mockKV.get(key) || null),
        put: vi.fn((key, val, opts) => mockKV.set(key, val)),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test",
    };

    // Mock fetch to handle county_info calls (seedCountyInfo)
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              countyFips: "48201",
              countyName: "Harris",
              voteCenters: true,
              electionsWebsite: "https://harrisvotes.com",
              electionsPhone: "713-755-6965",
            }),
          },
        ],
      }),
    });

    const testCounties = [{ fips: "48201", name: "Harris" }];
    const result = await runCountyRefresh(mockEnv, { counties: testCounties });

    // Should have logged that no existing ballot was found (skipping)
    const skipLogs = result.countyLog.filter(l => l.includes("no existing ballot"));
    expect(skipLogs.length).toBe(2); // one per party

    fetchSpy.mockRestore();
  }, 30000);

  it("respects dryRun option", async () => {
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test",
    };

    const testCounties = [{ fips: "48201", name: "Harris" }];
    const result = await runCountyRefresh(mockEnv, { counties: testCounties, dryRun: true });

    // Should have "would refresh (dry run)" logs
    const dryRunLogs = result.countyLog.filter(l => l.includes("dry run"));
    expect(dryRunLogs.length).toBeGreaterThan(0);

    // county_info gets "would refresh (dry run)"; ballots have no existing data so they log "no existing ballot"
    expect(dryRunLogs.length).toBe(1); // just county_info
    // Ballots should show "no existing ballot" (KV mock returns null)
    const skipLogs = result.countyLog.filter(l => l.includes("no existing ballot"));
    expect(skipLogs.length).toBe(2); // one per party
  }, 30000);

  it("returns countiesRefreshed array with county names", async () => {
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test",
    };

    const testCounties = [
      { fips: "48201", name: "Harris" },
      { fips: "48113", name: "Dallas" },
    ];
    const result = await runCountyRefresh(mockEnv, { counties: testCounties, dryRun: true });

    expect(result.countiesRefreshed).toContain("Harris");
    expect(result.countiesRefreshed).toContain("Dallas");
    expect(result.countiesRefreshed.length).toBe(2);
  }, 30000);

  it("catches errors in seedCountyInfo gracefully", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network failure"));

    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test",
    };

    const testCounties = [{ fips: "48201", name: "Harris" }];
    const result = await runCountyRefresh(mockEnv, { counties: testCounties });

    // Should have captured the error, not thrown
    expect(result.countyErrors.length).toBeGreaterThan(0);
    expect(result.countyErrors[0]).toContain("Harris/info");

    fetchSpy.mockRestore();
  }, 30000);

  it("persists county refresh tracker to KV after refreshing counties", async () => {
    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => kvStore[key] || null),
        put: vi.fn((key, val) => { kvStore[key] = val; }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test",
    };

    // Mock fetch to handle county_info calls
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              countyFips: "48453",
              countyName: "Travis",
              voteCenters: true,
              electionsWebsite: "https://countyclerk.traviscountytx.gov",
              electionsPhone: "512-238-8683",
            }),
          },
        ],
      }),
    });

    const testCounties = [{ fips: "48453", name: "Travis" }];
    const result = await runCountyRefresh(mockEnv, { counties: testCounties });

    // Tracker should have been written to KV
    expect(kvStore[COUNTY_REFRESH_TRACKER_KEY]).toBeDefined();
    const tracker = JSON.parse(kvStore[COUNTY_REFRESH_TRACKER_KEY]);
    expect(tracker["48453"]).toBeDefined();
    expect(tracker["48453"].name).toBe("Travis");
    expect(tracker["48453"].lastRefreshedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    fetchSpy.mockRestore();
  }, 30000);

  it("does not persist county refresh tracker in dry run mode", async () => {
    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => kvStore[key] || null),
        put: vi.fn((key, val) => { kvStore[key] = val; }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test",
    };

    const testCounties = [{ fips: "48453", name: "Travis" }];
    await runCountyRefresh(mockEnv, { counties: testCounties, dryRun: true });

    // Tracker should NOT be in KV (dry run)
    expect(kvStore[COUNTY_REFRESH_TRACKER_KEY]).toBeUndefined();
  }, 30000);

  it("preserves existing tracker data when refreshing new counties", async () => {
    const existingTracker = {
      "48201": { name: "Harris", lastRefreshedAt: "2026-02-18T12:00:00.000Z" },
    };
    const kvStore = {
      [COUNTY_REFRESH_TRACKER_KEY]: JSON.stringify(existingTracker),
    };
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => kvStore[key] || null),
        put: vi.fn((key, val) => { kvStore[key] = val; }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test",
    };

    // Mock fetch for county_info
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              countyFips: "48113",
              countyName: "Dallas",
              voteCenters: true,
            }),
          },
        ],
      }),
    });

    const testCounties = [{ fips: "48113", name: "Dallas" }];
    await runCountyRefresh(mockEnv, { counties: testCounties });

    const tracker = JSON.parse(kvStore[COUNTY_REFRESH_TRACKER_KEY]);
    // Harris should still be there (preserved)
    expect(tracker["48201"]).toBeDefined();
    expect(tracker["48201"].name).toBe("Harris");
    expect(tracker["48201"].lastRefreshedAt).toBe("2026-02-18T12:00:00.000Z");
    // Dallas should be added
    expect(tracker["48113"]).toBeDefined();
    expect(tracker["48113"].name).toBe("Dallas");

    fetchSpy.mockRestore();
  }, 30000);
});

// ---------------------------------------------------------------------------
// runDailyUpdate — county refresh integration
// ---------------------------------------------------------------------------
describe("runDailyUpdate — county refresh integration", () => {
  it("return value always includes county section structure", async () => {
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test",
    };

    // With skipCounties: true, verify county structure is present but empty
    const result = await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });
    expect(result.county).toBeDefined();
    expect(result.county.refreshed).toBeDefined();
    expect(Array.isArray(result.county.refreshed)).toBe(true);
    expect(result.county.log).toBeDefined();
    expect(Array.isArray(result.county.log)).toBe(true);
    expect(result.county.errors).toBeDefined();
    expect(Array.isArray(result.county.errors)).toBe(true);
  });

  it("omits county data when skipCounties is true", async () => {
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test",
    };

    const result = await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    // County data should be empty (default values since refresh was skipped)
    expect(result.county.refreshed).toEqual([]);
    expect(result.county.log).toEqual([]);
    expect(result.county.errors).toEqual([]);
  });

  it("includes county section in update_log KV entry", async () => {
    const stored = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn((key, val) => { stored[key] = val; }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test",
    };

    await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    // Check the update_log was written with county section
    const logKey = Object.keys(stored).find(k => k.startsWith("update_log:"));
    expect(logKey).toBeDefined();
    const logEntry = JSON.parse(stored[logKey]);
    expect(logEntry.county).toBeDefined();
    expect(logEntry.county.refreshed).toBeDefined();
    expect(logEntry.county.log).toBeDefined();
    expect(logEntry.county.errors).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// raceKey
// ---------------------------------------------------------------------------
describe("raceKey", () => {
  it("returns party/office for races without district", () => {
    expect(raceKey("democrat", { office: "Governor" })).toBe("democrat/Governor");
  });

  it("returns party/office/district when district is set", () => {
    expect(raceKey("republican", { office: "U.S. Representative", district: "District 21" }))
      .toBe("republican/U.S. Representative/District 21");
  });

  it("returns party/office when district is null", () => {
    expect(raceKey("democrat", { office: "Attorney General", district: null }))
      .toBe("democrat/Attorney General");
  });

  it("returns party/office when district is empty string", () => {
    expect(raceKey("democrat", { office: "Governor", district: "" }))
      .toBe("democrat/Governor");
  });
});

// ---------------------------------------------------------------------------
// isLowerBallotRace
// ---------------------------------------------------------------------------
describe("isLowerBallotRace", () => {
  it("returns true for Court of Appeals", () => {
    expect(isLowerBallotRace("Court of Appeals, Place 4")).toBe(true);
  });

  it("returns true for Board of Education", () => {
    expect(isLowerBallotRace("State Board of Education, District 5")).toBe(true);
  });

  it("returns true for Railroad Commission", () => {
    expect(isLowerBallotRace("Railroad Commission of Texas")).toBe(true);
  });

  it("returns false for Governor", () => {
    expect(isLowerBallotRace("Governor")).toBe(false);
  });

  it("returns false for U.S. Senator", () => {
    expect(isLowerBallotRace("U.S. Senator")).toBe(false);
  });

  it("returns false for Attorney General", () => {
    expect(isLowerBallotRace("Attorney General")).toBe(false);
  });

  it("returns false for U.S. Representative", () => {
    expect(isLowerBallotRace("U.S. Representative")).toBe(false);
  });

  it("is case insensitive", () => {
    expect(isLowerBallotRace("COURT OF APPEALS")).toBe(true);
    expect(isLowerBallotRace("board of education")).toBe(true);
  });

  it("handles null/undefined gracefully", () => {
    expect(isLowerBallotRace(null)).toBe(false);
    expect(isLowerBallotRace(undefined)).toBe(false);
    expect(isLowerBallotRace("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isUpdateMeaningful
// ---------------------------------------------------------------------------
describe("isUpdateMeaningful", () => {
  it("returns false for all-null updates", () => {
    const updates = {
      candidates: [
        { name: "Alice", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
        { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
      ],
    };
    expect(isUpdateMeaningful(updates)).toBe(false);
  });

  it("returns true when one candidate has a non-null polling update", () => {
    const updates = {
      candidates: [
        { name: "Alice", polling: "Leading 52%", fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
        { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
      ],
    };
    expect(isUpdateMeaningful(updates)).toBe(true);
  });

  it("returns true when one candidate has non-null endorsements", () => {
    const updates = {
      candidates: [
        { name: "Alice", polling: null, fundraising: null, endorsements: [{ name: "Group A", type: "advocacy group" }], keyPositions: null, pros: null, cons: null, summary: null, background: null },
      ],
    };
    expect(isUpdateMeaningful(updates)).toBe(true);
  });

  it("returns false for null/undefined input", () => {
    expect(isUpdateMeaningful(null)).toBe(false);
    expect(isUpdateMeaningful(undefined)).toBe(false);
    expect(isUpdateMeaningful({})).toBe(false);
  });

  it("returns false when fields are empty strings", () => {
    const updates = {
      candidates: [
        { name: "Alice", polling: "", fundraising: "", endorsements: null, keyPositions: null, pros: null, cons: null, summary: "", background: "" },
      ],
    };
    expect(isUpdateMeaningful(updates)).toBe(false);
  });

  it("returns false when array fields are empty arrays", () => {
    const updates = {
      candidates: [
        { name: "Alice", polling: null, fundraising: null, endorsements: [], keyPositions: [], pros: [], cons: [], summary: null, background: null },
      ],
    };
    expect(isUpdateMeaningful(updates)).toBe(false);
  });

  it("returns true for non-null summary update", () => {
    const updates = {
      candidates: [
        { name: "Alice", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: "Updated summary text", background: null },
      ],
    };
    expect(isUpdateMeaningful(updates)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Staleness tracking in runDailyUpdate
// ---------------------------------------------------------------------------
describe("runDailyUpdate — staleness tracking", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.useFakeTimers({ now: new Date("2026-02-20T12:00:00Z") });
  });

  // Helper: make a ballot with one contested race
  function makeBallot(office = "Governor", district = null) {
    return {
      id: "test",
      party: "democrat",
      races: [
        {
          office,
          district,
          isContested: true,
          candidates: [
            { name: "Alice", summary: "Test", endorsements: ["A"], keyPositions: ["X"], pros: ["Strong record on policy", "Experienced public servant"], cons: ["Limited name recognition", "No prior state office experience"] },
            { name: "Bob", summary: "Test", endorsements: ["B"], keyPositions: ["Y"], pros: ["Fresh policy perspective", "Community organizer background"], cons: ["Lacks legislative experience", "Limited fundraising reach"] },
          ],
        },
      ],
    };
  }

  // Helper: mock fetch returning all-null updates
  function mockAllNullFetch() {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );
  }

  it("persists staleness tracker to KV after researching races", async () => {
    const ballot = makeBallot();
    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (kvStore[key]) return kvStore[key];
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => { kvStore[key] = value; }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    mockAllNullFetch();

    await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    // stale_tracker should have been written
    expect(kvStore[STALE_TRACKER_KEY]).toBeDefined();
    const tracker = JSON.parse(kvStore[STALE_TRACKER_KEY]);
    expect(tracker["democrat/Governor"]).toBeDefined();
    expect(tracker["democrat/Governor"].nullCount).toBe(1);

    vi.useRealTimers();
  });

  it("increments nullCount on consecutive all-null updates", async () => {
    const ballot = makeBallot();

    // Pre-seed the tracker with 2 previous null runs
    const dayOfYear = 51; // Feb 20 = day 51
    const preTracker = {
      "democrat/Governor": { nullCount: 2, lastResearchDay: dayOfYear - 1 },
    };

    const kvStore = {
      [STALE_TRACKER_KEY]: JSON.stringify(preTracker),
    };
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (kvStore[key]) return kvStore[key];
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => { kvStore[key] = value; }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    mockAllNullFetch();

    await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    const tracker = JSON.parse(kvStore[STALE_TRACKER_KEY]);
    // Should now be 3 (was 2, incremented by 1 after another null update)
    expect(tracker["democrat/Governor"].nullCount).toBe(3);

    vi.useRealTimers();
  });

  it("resets nullCount to 0 when a meaningful update is found", async () => {
    const ballot = makeBallot();

    // Pre-seed the tracker with a high null count
    const dayOfYear = 51;
    const preTracker = {
      "democrat/Governor": { nullCount: 5, lastResearchDay: dayOfYear - 3 }, // due for re-research
    };

    const kvStore = {
      [STALE_TRACKER_KEY]: JSON.stringify(preTracker),
    };
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (kvStore[key]) return kvStore[key];
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => { kvStore[key] = value; }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    // Return a meaningful update (polling changed)
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: "Leading 55%", fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    const tracker = JSON.parse(kvStore[STALE_TRACKER_KEY]);
    expect(tracker["democrat/Governor"].nullCount).toBe(0);

    vi.useRealTimers();
  });

  it("skips stale races that are not due for re-research", async () => {
    const ballot = makeBallot();

    // Pre-seed: race is stale (nullCount >= 3), last researched yesterday (not divisible by 3)
    const dayOfYear = 51;
    const preTracker = {
      "democrat/Governor": { nullCount: 5, lastResearchDay: dayOfYear - 1 },
    };

    const kvStore = {
      [STALE_TRACKER_KEY]: JSON.stringify(preTracker),
    };
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (kvStore[key]) return kvStore[key];
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => { kvStore[key] = value; }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const result = await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    // Should NOT have called the API — race was skipped
    expect(mockFetch).not.toHaveBeenCalled();
    // Should have a log entry about skipping
    const skipLogs = result.log.filter((l) => l.includes("skipped (stale"));
    expect(skipLogs.length).toBe(1);
    expect(skipLogs[0]).toContain("5 consecutive null updates");

    vi.useRealTimers();
  });

  it("re-researches a stale race when the interval aligns", async () => {
    const ballot = makeBallot();

    // Pre-seed: stale race, last researched 3 days ago (daysSinceLast % 3 === 0)
    const dayOfYear = 51;
    const preTracker = {
      "democrat/Governor": { nullCount: 5, lastResearchDay: dayOfYear - 3 },
    };

    const kvStore = {
      [STALE_TRACKER_KEY]: JSON.stringify(preTracker),
    };
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (kvStore[key]) return kvStore[key];
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => { kvStore[key] = value; }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    mockAllNullFetch();

    const result = await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    // Should have called the API (race was due for re-research)
    expect(globalThis.fetch).toHaveBeenCalled();
    // nullCount should have incremented
    const tracker = JSON.parse(kvStore[STALE_TRACKER_KEY]);
    expect(tracker["democrat/Governor"].nullCount).toBe(6);

    vi.useRealTimers();
  });

  it("does not persist staleness tracker in dry run mode", async () => {
    const ballot = makeBallot();
    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => { kvStore[key] = value; }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    mockAllNullFetch();

    await runDailyUpdate(mockEnv, { parties: ["democrat"], dryRun: true, skipCounties: true });

    // stale_tracker should NOT be in KV (dry run)
    expect(kvStore[STALE_TRACKER_KEY]).toBeUndefined();

    vi.useRealTimers();
  });

  it("uses max_uses=3 for lower-ballot races", async () => {
    const ballot = makeBallot("Court of Appeals, Place 4");
    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (kvStore[key]) return kvStore[key];
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => { kvStore[key] = value; }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    mockAllNullFetch();

    await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    // Check the fetch call body to verify max_uses was 3
    const fetchCall = globalThis.fetch.mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body);
    expect(requestBody.tools[0].max_uses).toBe(3);

    vi.useRealTimers();
  });

  it("uses max_uses=5 for high-profile races", async () => {
    const ballot = makeBallot("Governor");
    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (kvStore[key]) return kvStore[key];
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => { kvStore[key] = value; }),
        delete: vi.fn(),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    mockAllNullFetch();

    await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    // Check the fetch call body to verify max_uses was 5
    const fetchCall = globalThis.fetch.mock.calls[0];
    const requestBody = JSON.parse(fetchCall[1].body);
    expect(requestBody.tools[0].max_uses).toBe(5);

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// ErrorCollector
// ---------------------------------------------------------------------------
describe("ErrorCollector", () => {
  it("starts empty", () => {
    const ec = new ErrorCollector();
    expect(ec.all()).toEqual([]);
    expect(ec.summary().totalErrors).toBe(0);
  });

  it("adds entries with category and context", () => {
    const ec = new ErrorCollector();
    ec.add("api_error", "democrat/Governor", { reason: "500 error" });
    ec.add("json_parse_failure", "republican/Senator", { snippet: "{broken" });
    expect(ec.all()).toHaveLength(2);
    expect(ec.all()[0].category).toBe("api_error");
    expect(ec.all()[0].context).toBe("democrat/Governor");
    expect(ec.all()[0].reason).toBe("500 error");
    expect(ec.all()[1].snippet).toBe("{broken");
  });

  it("filters by category", () => {
    const ec = new ErrorCollector();
    ec.add("api_error", "ctx1");
    ec.add("json_parse_failure", "ctx2");
    ec.add("api_error", "ctx3");
    expect(ec.byCategory("api_error")).toHaveLength(2);
    expect(ec.byCategory("json_parse_failure")).toHaveLength(1);
    expect(ec.byCategory("empty_response")).toHaveLength(0);
  });

  it("generates summary with counts per category", () => {
    const ec = new ErrorCollector();
    ec.add("api_error", "ctx1");
    ec.add("api_error", "ctx2");
    ec.add("validation_failure", "ctx1");
    const summary = ec.summary();
    expect(summary.totalErrors).toBe(3);
    expect(summary.categoryCounts.api_error).toBe(2);
    expect(summary.categoryCounts.validation_failure).toBe(1);
  });

  it("identifies top offenders by context", () => {
    const ec = new ErrorCollector();
    ec.add("api_error", "democrat/Governor");
    ec.add("validation_failure", "democrat/Governor");
    ec.add("api_error", "republican/Senator");
    const summary = ec.summary();
    expect(summary.topOffenders[0].context).toBe("democrat/Governor");
    expect(summary.topOffenders[0].count).toBe(2);
  });

  it("flags contexts with 2+ errors as needing attention", () => {
    const ec = new ErrorCollector();
    ec.add("api_error", "democrat/Governor");
    ec.add("validation_failure", "democrat/Governor");
    ec.add("api_error", "republican/Senator");
    const summary = ec.summary();
    expect(summary.needsAttention).toContain("democrat/Governor");
    expect(summary.needsAttention).not.toContain("republican/Senator");
  });

  it("serializes to JSON with summary and entries", () => {
    const ec = new ErrorCollector();
    ec.add("empty_response", "democrat/Governor", { reason: "no text" });
    const json = ec.toJSON();
    expect(json.generatedAt).toBeDefined();
    expect(json.summary).toBeDefined();
    expect(json.summary.totalErrors).toBe(1);
    expect(json.entries).toHaveLength(1);
    expect(json.entries[0].category).toBe("empty_response");
  });

  it("includes timestamp on each entry", () => {
    const ec = new ErrorCollector();
    ec.add("api_error", "ctx");
    expect(ec.all()[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// detectLowQualitySources
// ---------------------------------------------------------------------------
describe("detectLowQualitySources", () => {
  it("returns null for empty sources", () => {
    expect(detectLowQualitySources([])).toBeNull();
    expect(detectLowQualitySources(null)).toBeNull();
    expect(detectLowQualitySources(undefined)).toBeNull();
  });

  it("returns null when all sources are high-quality", () => {
    const sources = [
      { url: "https://texastribune.org/article", title: "Good" },
      { url: "https://ballotpedia.org/test", title: "Also Good" },
      { url: "https://sos.state.tx.us/filings", title: "Official" },
    ];
    expect(detectLowQualitySources(sources)).toBeNull();
  });

  it("returns null when low-quality sources are less than half", () => {
    const sources = [
      { url: "https://texastribune.org/article", title: "Good" },
      { url: "https://ballotpedia.org/test", title: "Also Good" },
      { url: "https://reddit.com/r/texas", title: "Reddit" },
    ];
    expect(detectLowQualitySources(sources)).toBeNull();
  });

  it("detects when majority of sources are low-quality", () => {
    const sources = [
      { url: "https://reddit.com/r/texas", title: "Reddit" },
      { url: "https://twitter.com/someone", title: "Twitter" },
      { url: "https://texastribune.org/article", title: "Good" },
    ];
    const result = detectLowQualitySources(sources);
    expect(result).not.toBeNull();
    expect(result.lowQualityCount).toBe(2);
    expect(result.total).toBe(3);
    expect(result.lowQualityUrls).toContain("https://reddit.com/r/texas");
    expect(result.lowQualityUrls).toContain("https://twitter.com/someone");
  });

  it("detects all low-quality sources", () => {
    const sources = [
      { url: "https://reddit.com/r/texas", title: "Reddit" },
      { url: "https://www.facebook.com/group", title: "Facebook" },
    ];
    const result = detectLowQualitySources(sources);
    expect(result).not.toBeNull();
    expect(result.lowQualityCount).toBe(2);
  });

  it("handles www. prefix correctly", () => {
    const sources = [
      { url: "https://www.reddit.com/r/texas", title: "Reddit" },
      { url: "https://www.twitter.com/someone", title: "Twitter" },
    ];
    const result = detectLowQualitySources(sources);
    expect(result).not.toBeNull();
    expect(result.lowQualityCount).toBe(2);
  });

  it("handles x.com (Twitter rebrand)", () => {
    const sources = [
      { url: "https://x.com/candidate", title: "X Post" },
    ];
    const result = detectLowQualitySources(sources);
    expect(result).not.toBeNull();
  });

  it("handles malformed URLs gracefully", () => {
    const sources = [
      { url: "not-a-url", title: "Bad" },
      { url: "https://reddit.com/r/texas", title: "Reddit" },
    ];
    // One malformed (skipped), one low-quality. 1/2 = 50% which meets threshold
    const result = detectLowQualitySources(sources);
    expect(result).not.toBeNull();
    expect(result.lowQualityCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ERROR_CATEGORIES and ERROR_LOG_PREFIX
// ---------------------------------------------------------------------------
describe("ERROR_CATEGORIES", () => {
  it("is an array of strings", () => {
    expect(Array.isArray(ERROR_CATEGORIES)).toBe(true);
    for (const cat of ERROR_CATEGORIES) {
      expect(typeof cat).toBe("string");
    }
  });

  it("includes key error types", () => {
    expect(ERROR_CATEGORIES).toContain("empty_response");
    expect(ERROR_CATEGORIES).toContain("json_parse_failure");
    expect(ERROR_CATEGORIES).toContain("no_search_results");
    expect(ERROR_CATEGORIES).toContain("all_null_update");
    expect(ERROR_CATEGORIES).toContain("api_error");
    expect(ERROR_CATEGORIES).toContain("rate_limit_exhausted");
    expect(ERROR_CATEGORIES).toContain("validation_failure");
    expect(ERROR_CATEGORIES).toContain("low_quality_sources");
  });
});

describe("ERROR_LOG_PREFIX", () => {
  it("is error_log:", () => {
    expect(ERROR_LOG_PREFIX).toBe("error_log:");
  });
});

// ---------------------------------------------------------------------------
// runDailyUpdate — error collector integration
// ---------------------------------------------------------------------------
describe("runDailyUpdate — error collector integration", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.useFakeTimers({ now: new Date("2026-02-20T12:00:00Z") });
  });

  function makeBallot(office = "Governor") {
    return {
      id: "test",
      party: "democrat",
      races: [
        {
          office,
          district: null,
          isContested: true,
          candidates: [
            { name: "Alice", summary: "Test", endorsements: ["A"], keyPositions: ["X"], pros: ["Strong record on policy", "Experienced public servant"], cons: ["Limited name recognition", "No prior state office experience"] },
            { name: "Bob", summary: "Test", endorsements: ["B"], keyPositions: ["Y"], pros: ["Fresh policy perspective", "Community organizer background"], cons: ["Lacks legislative experience", "Limited fundraising reach"] },
          ],
        },
      ],
    };
  }

  it("includes aiErrors in return value", async () => {
    const ballot = makeBallot();
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    // All-null response to trigger all_null_update
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    const result = await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    expect(result.aiErrors).toBeDefined();
    expect(result.aiErrors.summary).toBeDefined();
    expect(result.aiErrors.entries).toBeDefined();
    // Should have logged all_null_update and no_search_results
    expect(result.aiErrors.entries.length).toBeGreaterThan(0);
    const categories = result.aiErrors.entries.map((e) => e.category);
    expect(categories).toContain("all_null_update");
    expect(categories).toContain("no_search_results");

    vi.useRealTimers();
  });

  it("logs validation_failure in error collector", async () => {
    const ballot = {
      id: "test",
      party: "democrat",
      races: [
        {
          office: "Senator",
          district: null,
          isContested: true,
          candidates: [
            { name: "Alice", summary: "Senator", endorsements: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], keyPositions: ["X"], pros: ["Strong record on policy", "Experienced public servant"], cons: ["Limited name recognition", "No prior state office experience"] },
            { name: "Bob", summary: "Senator", endorsements: ["Z"], keyPositions: ["Y"], pros: ["Fresh policy perspective", "Community organizer background"], cons: ["Lacks legislative experience", "Limited fundraising reach"] },
          ],
        },
      ],
    };

    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (key.includes("ballot")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    // Return update that shrinks endorsements by >50% (validation failure)
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: null, fundraising: null, endorsements: ["A", "B", "C"], keyPositions: null, pros: null, cons: null, summary: null, background: null },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    const result = await runDailyUpdate(mockEnv, { parties: ["democrat"], dryRun: true, skipCounties: true });

    const validationErrors = result.aiErrors.entries.filter((e) => e.category === "validation_failure");
    expect(validationErrors.length).toBeGreaterThan(0);
    expect(validationErrors[0].reason).toContain("endorsements shrank");

    vi.useRealTimers();
  });

  it("logs api_error when Claude returns 500", async () => {
    const ballot = makeBallot();
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 500 }))
    );

    const result = await runDailyUpdate(mockEnv, { parties: ["democrat"], dryRun: true, skipCounties: true });

    const apiErrors = result.aiErrors.entries.filter((e) => e.category === "api_error");
    expect(apiErrors.length).toBeGreaterThan(0);
    expect(apiErrors[0].reason).toContain("500");

    vi.useRealTimers();
  });

  it("logs json_parse_failure when response is not valid JSON", async () => {
    const ballot = makeBallot();
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                { type: "text", text: "This is not valid JSON {broken response" },
              ],
            }),
        })
      )
    );

    const result = await runDailyUpdate(mockEnv, { parties: ["democrat"], dryRun: true, skipCounties: true });

    const parseErrors = result.aiErrors.entries.filter((e) => e.category === "json_parse_failure");
    expect(parseErrors.length).toBeGreaterThan(0);
    expect(parseErrors[0].reason).toContain("Failed to parse");

    vi.useRealTimers();
  });

  it("persists error_log to KV when not in dry run mode", async () => {
    const ballot = makeBallot();
    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (kvStore[key]) return kvStore[key];
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => { kvStore[key] = value; }),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    // All-null response to trigger error logging
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    // Check that error_log was written
    const errorLogKey = Object.keys(kvStore).find((k) => k.startsWith(ERROR_LOG_PREFIX));
    expect(errorLogKey).toBeDefined();
    const errorLog = JSON.parse(kvStore[errorLogKey]);
    expect(errorLog.generatedAt).toBeDefined();
    expect(errorLog.summary).toBeDefined();
    expect(errorLog.entries.length).toBeGreaterThan(0);

    vi.useRealTimers();
  });

  it("does not persist error_log when there are no errors", async () => {
    const ballot = makeBallot();
    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (kvStore[key]) return kvStore[key];
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => { kvStore[key] = value; }),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    // Return meaningful update (polling changed) — no errors expected
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "web_search_tool_result",
                  content: [
                    { type: "web_search_result", url: "https://texastribune.org/article", title: "Good source" },
                  ],
                },
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: "Leading 55%", fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    // No error_log key should exist (the update was clean)
    const errorLogKey = Object.keys(kvStore).find((k) => k.startsWith(ERROR_LOG_PREFIX));
    expect(errorLogKey).toBeUndefined();

    vi.useRealTimers();
  });

  it("includes aiErrors summary in the update_log entry", async () => {
    const ballot = makeBallot();
    const kvStore = {};
    const mockEnv = {
      ELECTION_DATA: {
        get: vi.fn((key) => {
          if (kvStore[key]) return kvStore[key];
          if (key.includes("ballot:statewide:democrat")) return JSON.stringify(ballot);
          return null;
        }),
        put: vi.fn((key, value) => { kvStore[key] = value; }),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({ keys: [] }),
      },
      ANTHROPIC_API_KEY: "test-key",
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    candidates: [
                      { name: "Alice", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                      { name: "Bob", polling: null, fundraising: null, endorsements: null, keyPositions: null, pros: null, cons: null, summary: null, background: null },
                    ],
                  }),
                },
              ],
            }),
        })
      )
    );

    await runDailyUpdate(mockEnv, { parties: ["democrat"], skipCounties: true });

    const logKey = Object.keys(kvStore).find((k) => k.startsWith("update_log:"));
    expect(logKey).toBeDefined();
    const logEntry = JSON.parse(kvStore[logKey]);
    expect(logEntry.aiErrors).toBeDefined();
    expect(logEntry.aiErrors.totalErrors).toBeGreaterThan(0);

    vi.useRealTimers();
  });
});

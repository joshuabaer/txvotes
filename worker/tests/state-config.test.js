import { describe, it, expect } from "vitest";
import {
  STATE_CONFIG,
  VALID_STATES,
  DEFAULT_STATE,
  ELECTION_PHASES,
  parseStateFromPath,
  stripStatePrefix,
  getElectionPhase,
} from "../src/state-config.js";

// ---------------------------------------------------------------------------
// STATE_CONFIG structure
// ---------------------------------------------------------------------------
describe("STATE_CONFIG", () => {
  it("contains tx entry", () => {
    expect(STATE_CONFIG.tx).toBeDefined();
  });

  it("contains dc entry", () => {
    expect(STATE_CONFIG.dc).toBeDefined();
  });

  it("TX has all required fields", () => {
    const tx = STATE_CONFIG.tx;
    expect(tx.name).toBe("Texas");
    expect(tx.abbr).toBe("TX");
    expect(tx.electionDate).toBe("2026-03-03");
    expect(tx.electionName).toBe("Texas Primary Election");
    expect(tx.fips).toBe("48");
    expect(tx.kvPrefix).toBe("");
    expect(tx.parties).toContain("republican");
    expect(tx.parties).toContain("democrat");
    expect(tx.defaultParty).toBe("republican");
  });

  it("DC has all required fields", () => {
    const dc = STATE_CONFIG.dc;
    expect(dc.name).toBe("Washington DC");
    expect(dc.abbr).toBe("DC");
    expect(dc.electionDate).toBe("2026-06-16");
    expect(dc.electionName).toBe("DC Primary Election");
    expect(dc.fips).toBe("11");
    expect(dc.kvPrefix).toBe("dc:");
    expect(dc.parties).toContain("democrat");
    expect(dc.parties).toContain("republican");
    expect(dc.parties).toContain("statehood_green");
    expect(dc.parties).toContain("libertarian");
    expect(dc.defaultParty).toBe("democrat");
  });

  it("TX kvPrefix is empty for backward compatibility", () => {
    expect(STATE_CONFIG.tx.kvPrefix).toBe("");
  });

  it("DC kvPrefix is 'dc:' for namespacing", () => {
    expect(STATE_CONFIG.dc.kvPrefix).toBe("dc:");
  });

  it("each state has a valid FIPS code", () => {
    for (const [, config] of Object.entries(STATE_CONFIG)) {
      expect(config.fips).toMatch(/^\d+$/);
    }
  });

  it("each state has at least one party", () => {
    for (const [, config] of Object.entries(STATE_CONFIG)) {
      expect(config.parties.length).toBeGreaterThan(0);
    }
  });

  it("each state's defaultParty is in its parties list", () => {
    for (const [, config] of Object.entries(STATE_CONFIG)) {
      expect(config.parties).toContain(config.defaultParty);
    }
  });

  it("each state has a valid ISO date for electionDate", () => {
    for (const [, config] of Object.entries(STATE_CONFIG)) {
      expect(config.electionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const d = new Date(config.electionDate);
      expect(d.toString()).not.toBe("Invalid Date");
    }
  });
});

// ---------------------------------------------------------------------------
// VALID_STATES
// ---------------------------------------------------------------------------
describe("VALID_STATES", () => {
  it("is an array", () => {
    expect(Array.isArray(VALID_STATES)).toBe(true);
  });

  it("contains tx and dc", () => {
    expect(VALID_STATES).toContain("tx");
    expect(VALID_STATES).toContain("dc");
  });

  it("matches STATE_CONFIG keys", () => {
    expect(VALID_STATES.sort()).toEqual(Object.keys(STATE_CONFIG).sort());
  });

  it("contains only lowercase strings", () => {
    for (const state of VALID_STATES) {
      expect(state).toBe(state.toLowerCase());
    }
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_STATE
// ---------------------------------------------------------------------------
describe("DEFAULT_STATE", () => {
  it("is tx", () => {
    expect(DEFAULT_STATE).toBe("tx");
  });

  it("is a valid state code", () => {
    expect(VALID_STATES).toContain(DEFAULT_STATE);
  });
});

// ---------------------------------------------------------------------------
// parseStateFromPath
// ---------------------------------------------------------------------------
describe("parseStateFromPath", () => {
  it("parses /tx/app as tx", () => {
    expect(parseStateFromPath("/tx/app")).toBe("tx");
  });

  it("parses /dc/app as dc", () => {
    expect(parseStateFromPath("/dc/app")).toBe("dc");
  });

  it("parses /tx/app/ with trailing slash", () => {
    expect(parseStateFromPath("/tx/app/")).toBe("tx");
  });

  it("parses /dc/app/ with trailing slash", () => {
    expect(parseStateFromPath("/dc/app/")).toBe("dc");
  });

  it("parses /tx/app/api/guide as tx", () => {
    expect(parseStateFromPath("/tx/app/api/guide")).toBe("tx");
  });

  it("parses /dc/app/api/ballot as dc", () => {
    expect(parseStateFromPath("/dc/app/api/ballot")).toBe("dc");
  });

  it("parses /tx/app?tone=7 as tx", () => {
    expect(parseStateFromPath("/tx/app?tone=7")).toBe("tx");
  });

  it("parses /dc/app#/ballot as dc", () => {
    expect(parseStateFromPath("/dc/app#/ballot")).toBe("dc");
  });

  it("returns null for /app (no state prefix)", () => {
    expect(parseStateFromPath("/app")).toBeNull();
  });

  it("returns null for /app/api/guide", () => {
    expect(parseStateFromPath("/app/api/guide")).toBeNull();
  });

  it("returns null for root path /", () => {
    expect(parseStateFromPath("/")).toBeNull();
  });

  it("returns null for unknown state /ca/app", () => {
    expect(parseStateFromPath("/ca/app")).toBeNull();
  });

  it("returns null for /tx (without /app)", () => {
    expect(parseStateFromPath("/tx")).toBeNull();
  });

  it("returns null for /dc (without /app)", () => {
    expect(parseStateFromPath("/dc")).toBeNull();
  });

  it("returns null for /tx/other (non-app path)", () => {
    expect(parseStateFromPath("/tx/other")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseStateFromPath("")).toBeNull();
  });

  it("returns null for /TX/app (case-sensitive)", () => {
    expect(parseStateFromPath("/TX/app")).toBeNull();
  });

  it("returns null for /tx/application (partial match)", () => {
    expect(parseStateFromPath("/tx/application")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// stripStatePrefix
// ---------------------------------------------------------------------------
describe("stripStatePrefix", () => {
  it("strips /tx/app to /app", () => {
    expect(stripStatePrefix("/tx/app")).toBe("/app");
  });

  it("strips /dc/app to /app", () => {
    expect(stripStatePrefix("/dc/app")).toBe("/app");
  });

  it("strips /tx/app/api/guide to /app/api/guide", () => {
    expect(stripStatePrefix("/tx/app/api/guide")).toBe("/app/api/guide");
  });

  it("strips /dc/app/api/ballot to /app/api/ballot", () => {
    expect(stripStatePrefix("/dc/app/api/ballot")).toBe("/app/api/ballot");
  });

  it("strips /tx/app/clear to /app/clear", () => {
    expect(stripStatePrefix("/tx/app/clear")).toBe("/app/clear");
  });

  it("strips /tx/app/sw.js to /app/sw.js", () => {
    expect(stripStatePrefix("/tx/app/sw.js")).toBe("/app/sw.js");
  });

  it("leaves /app unchanged (no state prefix)", () => {
    expect(stripStatePrefix("/app")).toBe("/app");
  });

  it("leaves / unchanged", () => {
    expect(stripStatePrefix("/")).toBe("/");
  });

  it("leaves /privacy unchanged", () => {
    expect(stripStatePrefix("/privacy")).toBe("/privacy");
  });

  it("does not strip unknown state prefix /ca/app", () => {
    expect(stripStatePrefix("/ca/app")).toBe("/ca/app");
  });

  it("is case-sensitive — does not strip /TX/app", () => {
    expect(stripStatePrefix("/TX/app")).toBe("/TX/app");
  });
});

// ---------------------------------------------------------------------------
// New config fields (resultsUrl, pollsCloseTime, runoffDate)
// ---------------------------------------------------------------------------
describe("STATE_CONFIG new fields", () => {
  it("TX has resultsUrl", () => {
    expect(STATE_CONFIG.tx.resultsUrl).toBe("https://results.texas-election.com/races");
  });

  it("TX has pollsCloseTime", () => {
    expect(STATE_CONFIG.tx.pollsCloseTime).toBe("19:00:00-06:00");
  });

  it("DC has pollsCloseTime", () => {
    expect(STATE_CONFIG.dc.pollsCloseTime).toBeDefined();
  });

  it("each state has runoffDate field (may be null)", () => {
    for (const [, config] of Object.entries(STATE_CONFIG)) {
      expect("runoffDate" in config).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ELECTION_PHASES
// ---------------------------------------------------------------------------
describe("ELECTION_PHASES", () => {
  it("contains all four phases", () => {
    expect(ELECTION_PHASES).toEqual(["pre-election", "election-night", "post-election", "runoff"]);
  });
});

// ---------------------------------------------------------------------------
// getElectionPhase
// ---------------------------------------------------------------------------
describe("getElectionPhase", () => {
  // TX election: March 3, 2026. Polls close 7 PM CT (UTC-6).
  // pollsClose = 2026-03-03T19:00:00-06:00 = 2026-03-04T01:00:00Z
  // postElectionStart = pollsClose + 5h = 2026-03-04T06:00:00Z (midnight CT)

  it("returns pre-election before polls close", () => {
    const before = new Date("2026-03-03T12:00:00-06:00"); // noon CT on election day
    expect(getElectionPhase("tx", { now: before })).toBe("pre-election");
  });

  it("returns pre-election well before election day", () => {
    const early = new Date("2026-02-28T12:00:00Z");
    expect(getElectionPhase("tx", { now: early })).toBe("pre-election");
  });

  it("returns election-night right after polls close", () => {
    const afterClose = new Date("2026-03-03T19:01:00-06:00"); // 7:01 PM CT
    expect(getElectionPhase("tx", { now: afterClose })).toBe("election-night");
  });

  it("returns election-night at 11 PM CT on election night", () => {
    const lateNight = new Date("2026-03-03T23:00:00-06:00");
    expect(getElectionPhase("tx", { now: lateNight })).toBe("election-night");
  });

  it("returns post-election the next morning", () => {
    const nextMorning = new Date("2026-03-04T08:00:00-06:00"); // 8 AM CT March 4
    expect(getElectionPhase("tx", { now: nextMorning })).toBe("post-election");
  });

  it("returns post-election weeks after election", () => {
    const weeksLater = new Date("2026-03-20T12:00:00Z");
    expect(getElectionPhase("tx", { now: weeksLater })).toBe("post-election");
  });

  // KV override tests
  it("returns KV override when set to post-election", () => {
    const before = new Date("2026-02-28T12:00:00Z"); // pre-election by time
    expect(getElectionPhase("tx", { kvPhase: "post-election", now: before })).toBe("post-election");
  });

  it("returns KV override when set to runoff", () => {
    expect(getElectionPhase("tx", { kvPhase: "runoff" })).toBe("runoff");
  });

  it("returns KV override when set to election-night", () => {
    expect(getElectionPhase("tx", { kvPhase: "election-night" })).toBe("election-night");
  });

  it("returns KV override when set to pre-election (override back)", () => {
    const after = new Date("2026-03-10T12:00:00Z"); // post-election by time
    expect(getElectionPhase("tx", { kvPhase: "pre-election", now: after })).toBe("pre-election");
  });

  it("ignores invalid KV override and falls through to time-based", () => {
    const before = new Date("2026-02-28T12:00:00Z");
    expect(getElectionPhase("tx", { kvPhase: "invalid-phase", now: before })).toBe("pre-election");
  });

  it("ignores empty string KV override", () => {
    const before = new Date("2026-02-28T12:00:00Z");
    expect(getElectionPhase("tx", { kvPhase: "", now: before })).toBe("pre-election");
  });

  it("ignores null KV override", () => {
    const before = new Date("2026-02-28T12:00:00Z");
    expect(getElectionPhase("tx", { kvPhase: null, now: before })).toBe("pre-election");
  });

  // DC election: June 16, 2026
  it("returns pre-election for DC before its election", () => {
    const before = new Date("2026-06-15T12:00:00Z");
    expect(getElectionPhase("dc", { now: before })).toBe("pre-election");
  });

  it("returns post-election for DC after its election", () => {
    const after = new Date("2026-06-18T12:00:00Z");
    expect(getElectionPhase("dc", { now: after })).toBe("post-election");
  });

  // Edge cases
  it("returns pre-election for unknown state code", () => {
    expect(getElectionPhase("ca")).toBe("pre-election");
  });

  it("boundary: exactly at polls close time returns election-night", () => {
    // Polls close at 7 PM CT = 2026-03-04T01:00:00Z
    const exact = new Date("2026-03-04T01:00:00Z");
    // At exact boundary, now >= pollsClose so it's election-night
    expect(getElectionPhase("tx", { now: exact })).toBe("election-night");
  });

  it("boundary: 1ms before polls close is pre-election", () => {
    const justBefore = new Date(new Date("2026-03-04T01:00:00Z").getTime() - 1);
    expect(getElectionPhase("tx", { now: justBefore })).toBe("pre-election");
  });
});

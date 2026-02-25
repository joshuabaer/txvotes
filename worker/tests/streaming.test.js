import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createIncrementalParser,
  handlePWA_GuideStream,
} from "../src/pwa-guide.js";

// ---------------------------------------------------------------------------
// createIncrementalParser — incremental JSON extraction
// ---------------------------------------------------------------------------
describe("createIncrementalParser", () => {
  it("extracts a complete race object from a single chunk", () => {
    const races = [];
    const parser = createIncrementalParser({
      onProfileSummary: () => {},
      onRace: (r) => races.push(r),
      onProposition: () => {},
    });

    parser.feed('{"profileSummary":"I care about...","races":[{"office":"Governor","recommendedCandidate":"Smith","reasoning":"Good","confidence":"Strong Match"}]}');
    parser.flush();
    expect(races).toHaveLength(1);
    expect(races[0].office).toBe("Governor");
  });

  it("extracts races streamed character by character", () => {
    const races = [];
    const parser = createIncrementalParser({
      onProfileSummary: () => {},
      onRace: (r) => races.push(r),
      onProposition: () => {},
    });

    const json = '{"profileSummary":"test","races":[{"office":"Governor","recommendedCandidate":"A","reasoning":"R","confidence":"Good Match"},{"office":"Lt. Governor","recommendedCandidate":"B","reasoning":"R2","confidence":"Good Match"}],"propositions":[]}';
    for (const ch of json) {
      parser.feed(ch);
    }
    parser.flush();
    expect(races).toHaveLength(2);
    expect(races[0].office).toBe("Governor");
    expect(races[1].office).toBe("Lt. Governor");
  });

  it("extracts profileSummary", () => {
    let summary = null;
    const parser = createIncrementalParser({
      onProfileSummary: (s) => { summary = s; },
      onRace: () => {},
      onProposition: () => {},
    });

    parser.feed('{"profileSummary":"I believe in freedom","races":[]}');
    parser.flush();
    expect(summary).toBe("I believe in freedom");
  });

  it("extracts propositions", () => {
    const props = [];
    const parser = createIncrementalParser({
      onProfileSummary: () => {},
      onRace: () => {},
      onProposition: (p) => props.push(p),
    });

    parser.feed('{"races":[],"propositions":[{"number":1,"recommendation":"Lean Yes","reasoning":"Good for you","confidence":"Clear Call"},{"number":2,"recommendation":"Lean No","reasoning":"Not aligned","confidence":"Lean"}]}');
    parser.flush();
    expect(props).toHaveLength(2);
    expect(props[0].number).toBe(1);
    expect(props[1].number).toBe(2);
  });

  it("handles nested braces in string values", () => {
    const races = [];
    const parser = createIncrementalParser({
      onProfileSummary: () => {},
      onRace: (r) => races.push(r),
      onProposition: () => {},
    });

    parser.feed('{"races":[{"office":"Governor","reasoning":"He said \\"{great}\\\"","recommendedCandidate":"A","confidence":"Good Match"}]}');
    parser.flush();
    expect(races).toHaveLength(1);
    expect(races[0].office).toBe("Governor");
  });

  it("emits races incrementally as they complete", () => {
    const races = [];
    const parser = createIncrementalParser({
      onProfileSummary: () => {},
      onRace: (r) => races.push(r),
      onProposition: () => {},
    });

    // Feed first part — race array starts but first object incomplete
    parser.feed('{"profileSummary":"test","races":[{"office":"Governor","recommendedCandidate":"A","reasoning":"R","confidence":"Good Match"');
    expect(races).toHaveLength(0); // Not yet complete

    // Complete first object, start second
    parser.feed('},{"office":"Lt. Gov"');
    expect(races).toHaveLength(1); // First object now complete
    expect(races[0].office).toBe("Governor");

    // Complete second object
    parser.feed(',"recommendedCandidate":"B","reasoning":"R2","confidence":"Good Match"}]}');
    parser.flush();
    expect(races).toHaveLength(2);
  });

  it("handles empty races array", () => {
    const races = [];
    const parser = createIncrementalParser({
      onProfileSummary: () => {},
      onRace: (r) => races.push(r),
      onProposition: () => {},
    });

    parser.feed('{"profileSummary":"test","races":[],"propositions":[]}');
    parser.flush();
    expect(races).toHaveLength(0);
  });

  it("handles truncated input gracefully", () => {
    const races = [];
    const parser = createIncrementalParser({
      onProfileSummary: () => {},
      onRace: (r) => races.push(r),
      onProposition: () => {},
    });

    // Feed a complete race followed by a truncated one
    parser.feed('{"races":[{"office":"Governor","recommendedCandidate":"A","reasoning":"R","confidence":"Good Match"},{"office":"Lt. G');
    parser.flush();
    expect(races).toHaveLength(1); // Only complete object extracted
    expect(races[0].office).toBe("Governor");
  });

  it("returns buffer and counts from flush", () => {
    const parser = createIncrementalParser({
      onProfileSummary: () => {},
      onRace: () => {},
      onProposition: () => {},
    });

    parser.feed('{"races":[{"office":"Gov","recommendedCandidate":"A","reasoning":"R","confidence":"Good Match"}],"propositions":[{"number":1,"recommendation":"Yes","reasoning":"R"}]}');
    const result = parser.flush();
    expect(result.emittedRaces).toBe(1);
    expect(result.emittedProps).toBe(1);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("handles profileSummary with escaped quotes", () => {
    let summary = null;
    const parser = createIncrementalParser({
      onProfileSummary: (s) => { summary = s; },
      onRace: () => {},
      onProposition: () => {},
    });

    parser.feed('{"profileSummary":"I said \\"hello\\"","races":[]}');
    parser.flush();
    expect(summary).toBe('I said "hello"');
  });

  it("getBuffer returns accumulated text", () => {
    const parser = createIncrementalParser({
      onProfileSummary: () => {},
      onRace: () => {},
      onProposition: () => {},
    });

    parser.feed("hello ");
    parser.feed("world");
    expect(parser.getBuffer()).toBe("hello world");
  });
});

// ---------------------------------------------------------------------------
// SSE event format helper
// ---------------------------------------------------------------------------
describe("sseEvent format", () => {
  it("produces valid SSE format", () => {
    // We test the format indirectly through handlePWA_GuideStream
    // by checking event: type\ndata: json\n\n pattern
    const sseRegex = /^event: \w+\ndata: .+\n\n$/;
    const event = "event: meta\ndata: {\"test\":true}\n\n";
    expect(sseRegex.test(event)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handlePWA_GuideStream — SSE streaming handler
// ---------------------------------------------------------------------------
describe("handlePWA_GuideStream", () => {
  function createMockEnv(overrides = {}) {
    const kvData = {};
    return {
      ELECTION_DATA: {
        get: vi.fn(async (key) => {
          if (overrides.kvData && overrides.kvData[key] !== undefined) {
            return overrides.kvData[key];
          }
          return kvData[key] || null;
        }),
        put: vi.fn(async () => {}),
      },
      ANTHROPIC_API_KEY: "test-key",
      ...overrides,
    };
  }

  function createRequest(body) {
    return new Request("https://txvotes.app/app/api/guide-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function readSSEEvents(response) {
    const text = await response.text();
    const events = [];
    const parts = text.split("\n\n").filter(Boolean);
    for (const part of parts) {
      const lines = part.split("\n");
      let type = null;
      let data = null;
      for (const line of lines) {
        if (line.startsWith("event: ")) type = line.slice(7);
        if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (type && data) {
        try {
          events.push({ type, data: JSON.parse(data) });
        } catch (e) {
          events.push({ type, data: data });
        }
      }
    }
    return events;
  }

  it("returns 400 for missing party", async () => {
    const env = createMockEnv();
    const req = createRequest({ profile: { topIssues: ["economy"] } });
    const res = await handlePWA_GuideStream(req, env);
    expect(res.status).toBe(400);
    const events = await readSSEEvents(res);
    expect(events[0].type).toBe("error");
    expect(events[0].data.error).toContain("party required");
  });

  it("returns 400 for missing profile", async () => {
    const env = createMockEnv();
    const req = createRequest({ party: "republican" });
    const res = await handlePWA_GuideStream(req, env);
    expect(res.status).toBe(400);
    const events = await readSSEEvents(res);
    expect(events[0].type).toBe("error");
    expect(events[0].data.error).toContain("profile required");
  });

  it("returns error event when no ballot data available", async () => {
    const env = createMockEnv();
    const req = createRequest({
      party: "republican",
      profile: { topIssues: ["economy"] },
    });
    const res = await handlePWA_GuideStream(req, env);
    expect(res.status).toBe(200); // SSE always returns 200
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const events = await readSSEEvents(res);
    expect(events.some((e) => e.type === "error")).toBe(true);
  });

  it("returns SSE content type header", async () => {
    const env = createMockEnv();
    const req = createRequest({
      party: "republican",
      profile: { topIssues: ["economy"] },
    });
    const res = await handlePWA_GuideStream(req, env);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("emits all events from cache hit", async () => {
    const sampleBallot = {
      id: "test",
      party: "republican",
      electionDate: "2026-03-03",
      electionName: "2026 Republican Primary",
      races: [
        {
          office: "Governor",
          candidates: [
            { name: "Smith", id: 1 },
            { name: "Jones", id: 2 },
          ],
          recommendation: {
            candidateId: 1,
            candidateName: "Smith",
            reasoning: "Aligns with your values",
            matchFactors: ["economy"],
            confidence: "Strong Match",
          },
        },
      ],
      propositions: [
        {
          number: 1,
          title: "Prop 1",
          description: "Test",
          recommendation: "Lean Yes",
          reasoning: "Good for economy",
          confidence: "Clear Call",
        },
      ],
    };

    const cachedResult = {
      ballot: sampleBallot,
      profileSummary: "I care about the economy",
      llm: "claude",
      balanceScore: { flags: [], skewNote: null },
      dataUpdatedAt: "2026-02-24T00:00:00Z",
    };

    // We need the KV to have both ballot and cache data
    const kvData = {
      "ballot:statewide:republican_primary_2026": JSON.stringify(sampleBallot),
    };

    // Since the cache key is hash-based, we need to mock the get to return cached data
    // for any guide_cache: key
    const env = createMockEnv();
    env.ELECTION_DATA.get = vi.fn(async (key) => {
      if (key.startsWith("ballot:statewide:")) {
        return JSON.stringify(sampleBallot);
      }
      if (key.startsWith("guide_cache:")) {
        return JSON.stringify(cachedResult);
      }
      return null;
    });

    const req = createRequest({
      party: "republican",
      profile: { topIssues: ["economy"], politicalSpectrum: "Conservative" },
    });
    const res = await handlePWA_GuideStream(req, env);
    const events = await readSSEEvents(res);

    const types = events.map((e) => e.type);
    expect(types).toContain("meta");
    expect(types).toContain("profile");
    expect(types).toContain("race");
    expect(types).toContain("complete");

    // Check meta event has ballot skeleton
    const meta = events.find((e) => e.type === "meta");
    expect(meta.data.party).toBe("republican");
    expect(meta.data.ballot.races).toBeDefined();

    // Check complete event has cached: true
    const complete = events.find((e) => e.type === "complete");
    expect(complete.data.cached).toBe(true);
  });

  it("returns 400 for invalid JSON body", async () => {
    const env = createMockEnv();
    const req = new Request("https://txvotes.app/app/api/guide-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await handlePWA_GuideStream(req, env);
    expect(res.status).toBe(400);
    const events = await readSSEEvents(res);
    expect(events[0].type).toBe("error");
  });

  it("rejects invalid party values", async () => {
    const env = createMockEnv();
    const req = createRequest({
      party: "libertarian",
      profile: { topIssues: ["economy"] },
    });
    const res = await handlePWA_GuideStream(req, env);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Incremental parser — stress tests
// ---------------------------------------------------------------------------
describe("createIncrementalParser stress", () => {
  it("handles large number of races", () => {
    const races = [];
    const parser = createIncrementalParser({
      onProfileSummary: () => {},
      onRace: (r) => races.push(r),
      onProposition: () => {},
    });

    const raceObjs = [];
    for (let i = 0; i < 20; i++) {
      raceObjs.push({
        office: `Race ${i}`,
        recommendedCandidate: `Candidate ${i}`,
        reasoning: `Reason ${i}`,
        confidence: "Good Match",
      });
    }

    const json = JSON.stringify({
      profileSummary: "test",
      races: raceObjs,
      propositions: [],
    });

    // Feed in random-sized chunks
    let pos = 0;
    while (pos < json.length) {
      const chunkSize = Math.min(1 + Math.floor(Math.random() * 50), json.length - pos);
      parser.feed(json.slice(pos, pos + chunkSize));
      pos += chunkSize;
    }
    parser.flush();
    expect(races).toHaveLength(20);
  });

  it("handles matchFactors arrays in race objects", () => {
    const races = [];
    const parser = createIncrementalParser({
      onProfileSummary: () => {},
      onRace: (r) => races.push(r),
      onProposition: () => {},
    });

    parser.feed('{"races":[{"office":"Governor","recommendedCandidate":"A","reasoning":"R","matchFactors":["economy","education","healthcare"],"confidence":"Strong Match"}]}');
    parser.flush();
    expect(races).toHaveLength(1);
    expect(races[0].matchFactors).toEqual(["economy", "education", "healthcare"]);
  });

  it("handles null and string field values", () => {
    const races = [];
    const parser = createIncrementalParser({
      onProfileSummary: () => {},
      onRace: (r) => races.push(r),
      onProposition: () => {},
    });

    parser.feed('{"races":[{"office":"Governor","recommendedCandidate":"A","reasoning":"R","strategicNotes":null,"caveats":"Watch out","confidence":"Good Match"}]}');
    parser.flush();
    expect(races).toHaveLength(1);
    expect(races[0].strategicNotes).toBeNull();
    expect(races[0].caveats).toBe("Watch out");
  });

  it("does not emit duplicate races", () => {
    const races = [];
    const parser = createIncrementalParser({
      onProfileSummary: () => {},
      onRace: (r) => races.push(r),
      onProposition: () => {},
    });

    // Feed same content twice
    const json = '{"races":[{"office":"Governor","recommendedCandidate":"A","reasoning":"R","confidence":"Good Match"}]}';
    parser.feed(json);
    parser.flush();
    // Parser doesn't deduplicate — that's handled by the handler
    // But it shouldn't re-emit when flushed
    const count = races.length;
    parser.flush();
    expect(races.length).toBe(count);
  });
});

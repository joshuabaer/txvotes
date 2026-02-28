import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the PWA source for source-level verification
import { APP_JS } from "../src/pwa.js";

// Import the worker module for API endpoint tests
import worker from "../src/index.js";

const sampleBallot = readFileSync(
  join(__dirname, "fixtures/sample-ballot.json"),
  "utf-8"
);

// ---------------------------------------------------------------------------
// Mock env for API endpoint tests
// ---------------------------------------------------------------------------
function mockKVStore(initial = {}) {
  const store = { ...initial };
  return {
    _store: store,
    get: vi.fn(async (key, type) => {
      const val = store[key] !== undefined ? store[key] : null;
      if (type === "json" && val) return JSON.parse(val);
      return val;
    }),
    put: vi.fn(async (key, value) => {
      store[key] = value;
    }),
    list: vi.fn(async ({ prefix } = {}) => {
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

/** Helper: POST to the worker */
async function post(path, body, env, headers = {}) {
  const url = `https://txvotes.app${path}`;
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": headers["CF-Connecting-IP"] || "1.2.3.4",
      ...headers,
    },
  });
  return worker.fetch(request, env);
}

// ===========================================================================
// 1. Override helper functions exist in PWA source
// ===========================================================================
describe("Override helper functions — source verification", () => {
  it("defines getRaceKey function", () => {
    expect(APP_JS).toContain("function getRaceKey(race)");
  });

  it("getRaceKey combines office and district with em dash separator", () => {
    expect(APP_JS).toContain(
      "return race.office+(race.district?' \\u2014 '+race.district:'')"
    );
  });

  it("defines getOverride function", () => {
    expect(APP_JS).toContain("function getOverride(race)");
  });

  it("getOverride uses selectedParty scoping", () => {
    expect(APP_JS).toContain("var party=S.selectedParty");
    expect(APP_JS).toContain("S.overrides[party]&&S.overrides[party][key]");
  });

  it("defines setOverride function", () => {
    expect(APP_JS).toContain("function setOverride(race,candidateName)");
  });

  it("setOverride stores originalCandidate, chosenCandidate, timestamp", () => {
    expect(APP_JS).toContain("originalCandidate:orig");
    expect(APP_JS).toContain("chosenCandidate:candidateName");
    expect(APP_JS).toContain("timestamp:new Date().toISOString()");
  });

  it("setOverride calls save() to persist", () => {
    // setOverride body ends with save()
    expect(APP_JS).toMatch(/function setOverride[\s\S]*?save\(\)/);
  });

  it("defines clearOverride function", () => {
    expect(APP_JS).toContain("function clearOverride(race)");
  });

  it("clearOverride deletes the key and calls save()", () => {
    expect(APP_JS).toContain("delete S.overrides[party][key]");
  });

  it("defines getEffectiveChoice function", () => {
    expect(APP_JS).toContain("function getEffectiveChoice(race)");
  });

  it("getEffectiveChoice returns override when present, AI pick when not", () => {
    expect(APP_JS).toContain("var ov=getOverride(race)");
    expect(APP_JS).toContain("if(ov)return ov.chosenCandidate");
    expect(APP_JS).toContain(
      "return race.recommendation?race.recommendation.candidateName:null"
    );
  });
});

// ===========================================================================
// 2. Override state in S object
// ===========================================================================
describe("Override state management — source verification", () => {
  it("S state object includes overrides:{}", () => {
    expect(APP_JS).toContain("overrides:{}");
  });

  it("save() persists overrides to tx_votes_overrides in localStorage", () => {
    expect(APP_JS).toContain("tx_votes_overrides");
    expect(APP_JS).toContain(
      "localStorage.setItem('tx_votes_overrides',JSON.stringify(S.overrides))"
    );
  });

  it("save() removes tx_votes_overrides when overrides is empty", () => {
    expect(APP_JS).toContain(
      "localStorage.removeItem('tx_votes_overrides')"
    );
  });

  it("load() reads tx_votes_overrides from localStorage", () => {
    expect(APP_JS).toContain(
      "var _ov=localStorage.getItem('tx_votes_overrides')"
    );
    expect(APP_JS).toContain("S.overrides=JSON.parse(_ov)");
  });

  it("load() handles JSON parse errors gracefully", () => {
    expect(APP_JS).toContain(
      "catch(e){S.overrides={}}"
    );
  });

  it("reset action clears overrides state", () => {
    // Check that the reset action sets S.overrides={}
    expect(APP_JS).toContain("S.electionExpired=false;S.overrides={}");
  });

  it("reset action removes tx_votes_overrides from localStorage", () => {
    // Both reset and election-clear should remove tx_votes_overrides
    const matches = APP_JS.match(
      /localStorage\.removeItem\('tx_votes_overrides'\)/g
    );
    // Should appear at least twice (reset + election-clear)
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("election-clear action clears overrides state", () => {
    // The election-clear handler should also set S.overrides={}
    expect(APP_JS).toContain("S.electionExpired=false;S.overrides={}");
  });
});

// ===========================================================================
// 3. Race card override indicators
// ===========================================================================
describe("Race card override display — source verification", () => {
  it("renderRaceCard calls getOverride to check for overrides", () => {
    expect(APP_JS).toContain("var _ov=getOverride(race)");
  });

  it("shows 'You changed this' badge when override is active", () => {
    expect(APP_JS).toContain("You changed this");
    expect(APP_JS).toContain('data-t="You changed this"');
  });

  it("shows overridden candidate name with amber color", () => {
    expect(APP_JS).toContain("color:#92400e");
    expect(APP_JS).toContain("esc(_ov.chosenCandidate)");
  });

  it("shows AI pick in strikethrough when overridden", () => {
    expect(APP_JS).toContain("<s>");
    expect(APP_JS).toContain("(AI pick)");
    expect(APP_JS).toContain('data-t="(AI pick)"');
  });

  it("highlights user's chosen candidate avatar with amber border", () => {
    expect(APP_JS).toContain("2px solid #d97706");
  });

  it("uses _isUserPick to determine avatar border", () => {
    expect(APP_JS).toContain(
      "var _isUserPick=_ovActive&&c.name===_ov.chosenCandidate"
    );
  });
});

// ===========================================================================
// 4. Race detail override UI
// ===========================================================================
describe("Race detail override UI — source verification", () => {
  it("renderRaceDetail checks for override state", () => {
    // Should check for override at the top of the function
    expect(APP_JS).toContain("var _ov=getOverride(race)");
    expect(APP_JS).toContain(
      "var _ovActive=_ov&&_ov.chosenCandidate!==_ov.originalCandidate"
    );
  });

  it("shows dimmed rec box with strikethrough when overridden", () => {
    expect(APP_JS).toContain("opacity:0.6");
    expect(APP_JS).toContain("text-decoration:line-through");
    expect(APP_JS).toContain("border-left:4px solid #d97706");
  });

  it("shows 'AI recommended X, but you chose Y' text", () => {
    expect(APP_JS).toContain("AI recommended");
    expect(APP_JS).toContain("but you chose");
  });

  it("provides Restore AI pick button with undo-override action", () => {
    expect(APP_JS).toContain('data-action="undo-override"');
    expect(APP_JS).toContain("Restore AI pick");
    expect(APP_JS).toContain('data-t="Restore AI pick"');
  });

  it("shows 'Choose this candidate instead' button on non-selected candidates", () => {
    expect(APP_JS).toContain('data-action="override-candidate"');
    expect(APP_JS).toContain("Choose this candidate instead");
    expect(APP_JS).toContain('data-t="Choose this candidate instead"');
  });

  it("does not show 'Choose this candidate instead' on user's current pick or AI-recommended candidate", () => {
    expect(APP_JS).toContain("if(candidates.length>1&&!_isUserPick&&!c.isRecommended)");
  });

  it("shows 'Your Pick' badge on the user's chosen candidate", () => {
    expect(APP_JS).toContain("Your Pick");
    expect(APP_JS).toContain('data-t="Your Pick"');
  });

  it("applies amber left border to user's chosen candidate card", () => {
    expect(APP_JS).toContain('style="border-left:4px solid #d97706"');
  });

  it("applies override-pick class to user's chosen candidate", () => {
    expect(APP_JS).toContain("_candCardCls+=' override-pick'");
  });
});

// ===========================================================================
// 5. Override action handlers
// ===========================================================================
describe("Override action handlers — source verification", () => {
  it("handles override-candidate action", () => {
    expect(APP_JS).toContain("action==='override-candidate'");
  });

  it("override-candidate calls setOverride and tracks analytics", () => {
    expect(APP_JS).toContain("setOverride(_oRace,_oName)");
    expect(APP_JS).toContain("trk('override_set'");
  });

  it("handles undo-override action", () => {
    expect(APP_JS).toContain("action==='undo-override'");
  });

  it("undo-override calls clearOverride and tracks analytics", () => {
    expect(APP_JS).toContain("clearOverride(_uRace)");
    expect(APP_JS).toContain("trk('override_undo'");
  });

  it("handles submit-override-feedback action", () => {
    expect(APP_JS).toContain("action==='submit-override-feedback'");
  });

  it("submit-override-feedback POSTs to /app/api/override-feedback", () => {
    expect(APP_JS).toContain(
      "fetch('/app/api/override-feedback'"
    );
  });

  it("submit-override-feedback sets reasonSubmitted to true", () => {
    expect(APP_JS).toContain("_fOv.reasonSubmitted=true");
  });

  it("submit-override-feedback tracks override_feedback analytics", () => {
    expect(APP_JS).toContain("trk('override_feedback'");
  });

  it("handles dismiss-override-feedback action", () => {
    expect(APP_JS).toContain("action==='dismiss-override-feedback'");
  });

  it("dismiss-override-feedback marks reasonSubmitted true and re-renders", () => {
    expect(APP_JS).toContain("_dOv.reasonSubmitted=true;save();render()");
  });
});

// ===========================================================================
// 6. Cheat sheet override integration
// ===========================================================================
describe("Cheat sheet override integration — source verification", () => {
  it("renderCheatSheet calls getOverride for each contested race", () => {
    expect(APP_JS).toContain("var _csOv=getOverride(r)");
  });

  it("shows overridden candidate name in cheat sheet", () => {
    expect(APP_JS).toContain("_csOv?esc(_csOv.chosenCandidate)");
  });

  it("shows '(your pick)' annotation for overridden races", () => {
    expect(APP_JS).toContain("(your pick)");
    expect(APP_JS).toContain('data-t="(your pick)"');
  });

  it("only shows annotation when override differs from AI pick", () => {
    expect(APP_JS).toContain(
      "_csOverridden=_csOv&&_csOv.chosenCandidate!==_csOv.originalCandidate"
    );
  });
});

// ===========================================================================
// 7. Override feedback area in race detail
// ===========================================================================
describe("Override feedback UI — source verification", () => {
  it("shows feedback area when override is active and not yet submitted", () => {
    expect(APP_JS).toContain("override-feedback-area");
    expect(APP_JS).toContain("_ovActive&&_ov&&!_ov.reasonSubmitted");
  });

  it("includes textarea for user's reason", () => {
    expect(APP_JS).toContain('id="override-reason"');
  });

  it("has placeholder text that is translatable", () => {
    expect(APP_JS).toContain(
      'data-t-placeholder="What made you choose differently? (optional, anonymous)"'
    );
  });

  it("shows Submit feedback button", () => {
    expect(APP_JS).toContain('data-action="submit-override-feedback"');
    expect(APP_JS).toContain('data-t="Submit feedback"');
  });

  it("shows Skip button to dismiss", () => {
    expect(APP_JS).toContain('data-action="dismiss-override-feedback"');
    expect(APP_JS).toContain('data-t="Skip"');
  });

  it("shows anonymous notice", () => {
    expect(APP_JS).toContain(
      "This feedback is anonymous and helps improve recommendations for everyone."
    );
  });

  it("shows 'Feedback sent' confirmation after submission", () => {
    expect(APP_JS).toContain("Feedback sent");
    expect(APP_JS).toContain('data-t="Feedback sent"');
  });
});

// ===========================================================================
// 8. Spanish translations for override strings
// ===========================================================================
describe("Override Spanish translations — source verification", () => {
  const translationPairs = [
    ["You changed this", "Cambiaste esto"],
    ["Your Pick", "Tu elecci"],
    ["AI pick", "Elecci"],
    ["AI recommended", "La IA recomend"],
    ["but you chose", "pero elegiste"],
    ["Restore AI pick", "Restaurar elecci"],
    ["Choose this candidate instead", "Elegir este candidato en su lugar"],
    ["Why did you change this?", "Por qu"],
    ["Submit feedback", "Enviar comentario"],
    ["Skip", "Omitir"],
    ["Feedback sent", "Comentario enviado"],
    ["your pick", "tu elecci"],
  ];

  for (const [eng, esFragment] of translationPairs) {
    it(`has Spanish translation for '${eng}'`, () => {
      expect(APP_JS).toContain(`'${eng}':`);
      expect(APP_JS).toContain(esFragment);
    });
  }
});

// ===========================================================================
// 9. Override feedback API endpoint
// ===========================================================================
describe("POST /tx/app/api/override-feedback", () => {
  let env;
  // Use unique IPs per test to avoid rate limiter contamination
  let testIPCounter = 0;
  function nextIP() {
    testIPCounter++;
    return `10.10.${Math.floor(testIPCounter / 256)}.${testIPCounter % 256}`;
  }

  beforeEach(() => {
    env = createMockEnv();
  });

  it("returns 204 on valid feedback submission", async () => {
    const res = await post("/tx/app/api/override-feedback", {
      party: "republican",
      race: "Governor",
      from: "Jane Smith",
      to: "John Doe",
      reason: "Better education plan",
      lang: "en",
    }, env, { "CF-Connecting-IP": nextIP() });
    expect(res.status).toBe(204);
  });

  it("stores feedback in KV under correct key", async () => {
    await post("/tx/app/api/override-feedback", {
      party: "republican",
      race: "Governor",
      from: "Jane Smith",
      to: "John Doe",
      reason: "Better education plan",
      lang: "en",
    }, env, { "CF-Connecting-IP": nextIP() });

    expect(env.ELECTION_DATA.put).toHaveBeenCalled();
    const putCalls = env.ELECTION_DATA.put.mock.calls;
    const kvCall = putCalls.find(
      (c) => c[0] === "feedback:overrides:republican:Governor"
    );
    expect(kvCall).toBeDefined();
    const stored = JSON.parse(kvCall[1]);
    expect(stored).toHaveLength(1);
    expect(stored[0].from).toBe("Jane Smith");
    expect(stored[0].to).toBe("John Doe");
    expect(stored[0].reason).toBe("Better education plan");
    expect(stored[0].lang).toBe("en");
    expect(stored[0].ts).toBeDefined();
  });

  it("appends to existing feedback entries", async () => {
    // Pre-populate KV with one existing entry
    const existingData = JSON.stringify([{
      from: "Jane Smith",
      to: "Bob Jones",
      reason: "Border security",
      lang: "en",
      ts: "2026-02-20T12:00:00Z",
    }]);
    const envWithExisting = createMockEnv({
      "feedback:overrides:republican:Governor": existingData,
    });

    await post("/tx/app/api/override-feedback", {
      party: "republican",
      race: "Governor",
      from: "Jane Smith",
      to: "John Doe",
      reason: "Education plan",
      lang: "en",
    }, envWithExisting, { "CF-Connecting-IP": nextIP() });

    const putCalls = envWithExisting.ELECTION_DATA.put.mock.calls;
    const kvCall = putCalls.find(
      (c) => c[0] === "feedback:overrides:republican:Governor"
    );
    expect(kvCall).toBeDefined();
    const stored = JSON.parse(kvCall[1]);
    expect(stored).toHaveLength(2);
    expect(stored[0].to).toBe("Bob Jones");
    expect(stored[1].to).toBe("John Doe");
  });

  it("returns 400 when party is missing", async () => {
    const res = await post("/tx/app/api/override-feedback", {
      race: "Governor",
      from: "Jane Smith",
      to: "John Doe",
    }, env, { "CF-Connecting-IP": nextIP() });
    expect(res.status).toBe(400);
  });

  it("returns 400 when race is missing", async () => {
    const res = await post("/tx/app/api/override-feedback", {
      party: "republican",
      from: "Jane Smith",
      to: "John Doe",
    }, env, { "CF-Connecting-IP": nextIP() });
    expect(res.status).toBe(400);
  });

  it("returns 400 when from is missing", async () => {
    const res = await post("/tx/app/api/override-feedback", {
      party: "republican",
      race: "Governor",
      to: "John Doe",
    }, env, { "CF-Connecting-IP": nextIP() });
    expect(res.status).toBe(400);
  });

  it("returns 400 when to is missing", async () => {
    const res = await post("/tx/app/api/override-feedback", {
      party: "republican",
      race: "Governor",
      from: "Jane Smith",
    }, env, { "CF-Connecting-IP": nextIP() });
    expect(res.status).toBe(400);
  });

  it("truncates reason to 500 characters", async () => {
    const longReason = "x".repeat(600);
    await post("/tx/app/api/override-feedback", {
      party: "republican",
      race: "Governor",
      from: "Jane Smith",
      to: "John Doe",
      reason: longReason,
      lang: "en",
    }, env, { "CF-Connecting-IP": nextIP() });

    const putCalls = env.ELECTION_DATA.put.mock.calls;
    const kvCall = putCalls.find(
      (c) => c[0] === "feedback:overrides:republican:Governor"
    );
    const stored = JSON.parse(kvCall[1]);
    expect(stored[0].reason).toHaveLength(500);
  });

  it("handles missing reason gracefully (stores empty string)", async () => {
    await post("/tx/app/api/override-feedback", {
      party: "republican",
      race: "Governor",
      from: "Jane Smith",
      to: "John Doe",
      lang: "en",
    }, env, { "CF-Connecting-IP": nextIP() });

    const putCalls = env.ELECTION_DATA.put.mock.calls;
    const kvCall = putCalls.find(
      (c) => c[0] === "feedback:overrides:republican:Governor"
    );
    const stored = JSON.parse(kvCall[1]);
    expect(stored[0].reason).toBe("");
  });

  it("defaults lang to 'en' when not provided", async () => {
    await post("/tx/app/api/override-feedback", {
      party: "republican",
      race: "Governor",
      from: "Jane Smith",
      to: "John Doe",
    }, env, { "CF-Connecting-IP": nextIP() });

    const putCalls = env.ELECTION_DATA.put.mock.calls;
    const kvCall = putCalls.find(
      (c) => c[0] === "feedback:overrides:republican:Governor"
    );
    const stored = JSON.parse(kvCall[1]);
    expect(stored[0].lang).toBe("en");
  });

  it("returns 400 for invalid JSON body", async () => {
    const url = "https://txvotes.app/tx/app/api/override-feedback";
    const request = new Request(url, {
      method: "POST",
      body: "not json",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": nextIP(),
      },
    });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 10. Rate limiting on feedback endpoint
// ===========================================================================
describe("Override feedback rate limiting", () => {
  it("returns 429 when rate limit is exceeded", async () => {
    const env = createMockEnv();
    // Use a unique IP to avoid polluting other tests
    const rateTestIP = "192.168.99.99";
    // Flood with >100 requests (in-memory rate limiter: 100/min per IP)
    const results = [];
    for (let i = 0; i < 105; i++) {
      results.push(
        post("/tx/app/api/override-feedback", {
          party: "republican",
          race: "Governor",
          from: "Jane Smith",
          to: "John Doe",
          reason: "test",
        }, env, { "CF-Connecting-IP": rateTestIP })
      );
    }
    const responses = await Promise.all(results);
    const statuses = responses.map((r) => r.status);
    // Most should succeed (204) but some should be rate limited (429)
    expect(statuses).toContain(429);
  });
});

// ===========================================================================
// 11. Override analytics events in VALID_EVENTS
// ===========================================================================
describe("Override analytics events — index.js", () => {
  const indexSrc = readFileSync(
    join(__dirname, "../src/index.js"),
    "utf-8"
  );

  it("VALID_EVENTS includes override_set", () => {
    expect(indexSrc).toContain('"override_set"');
  });

  it("VALID_EVENTS includes override_undo", () => {
    expect(indexSrc).toContain('"override_undo"');
  });

  it("VALID_EVENTS includes override_feedback", () => {
    expect(indexSrc).toContain('"override_feedback"');
  });

  it("override_set event is accepted by analytics endpoint", async () => {
    const env = createMockEnv();
    const res = await post("/tx/app/api/ev", {
      event: "override_set",
      props: { d1: "Governor", d2: "John Doe", lang: "en" },
    }, env, { "CF-Connecting-IP": "10.0.0.100" });
    expect(res.status).toBe(204);
  });

  it("override_undo event is accepted by analytics endpoint", async () => {
    const env = createMockEnv();
    const res = await post("/tx/app/api/ev", {
      event: "override_undo",
      props: { d1: "Governor", lang: "en" },
    }, env, { "CF-Connecting-IP": "10.0.0.101" });
    expect(res.status).toBe(204);
  });

  it("override_feedback event is accepted by analytics endpoint", async () => {
    const env = createMockEnv();
    const res = await post("/tx/app/api/ev", {
      event: "override_feedback",
      props: { d1: "Governor", lang: "en" },
    }, env, { "CF-Connecting-IP": "10.0.0.102" });
    expect(res.status).toBe(204);
  });
});

// ===========================================================================
// 12. handleOverrideFeedback function exists in index.js
// ===========================================================================
describe("handleOverrideFeedback — index.js source verification", () => {
  const indexSrc = readFileSync(
    join(__dirname, "../src/index.js"),
    "utf-8"
  );

  it("defines handleOverrideFeedback function", () => {
    expect(indexSrc).toContain("async function handleOverrideFeedback");
  });

  it("route for override-feedback exists", () => {
    expect(indexSrc).toContain("app/api/override-feedback");
    expect(indexSrc).toContain("handleOverrideFeedback(request, env)");
  });

  it("route calls handleOverrideFeedback", () => {
    expect(indexSrc).toContain("return handleOverrideFeedback(request, env)");
  });

  it("uses isRateLimited for rate limiting", () => {
    // The function should use the in-memory rate limiter
    const fnStart = indexSrc.indexOf("async function handleOverrideFeedback");
    const fnEnd = indexSrc.indexOf("// ----", fnStart + 1);
    const fnBody = indexSrc.slice(fnStart, fnEnd);
    expect(fnBody).toContain("isRateLimited(ip)");
  });

  it("caps stored entries at 500 per race", () => {
    expect(indexSrc).toContain("existing.length >= 500");
    expect(indexSrc).toContain("existing.shift()");
  });

  it("stores under feedback:overrides:{party}:{race} KV key pattern", () => {
    expect(indexSrc).toContain(
      "feedback:overrides:${party}:${race}"
    );
  });
});

// ===========================================================================
// 13. shareRace and shareGuide use getEffectiveChoice
// ===========================================================================
describe("Share functions use getEffectiveChoice — source verification", () => {
  it("shareRace uses getEffectiveChoice instead of raw recommendation", () => {
    expect(APP_JS).toContain("var _srChoice=getEffectiveChoice(race)");
    expect(APP_JS).toContain("lines.push('My pick: '+_srChoice)");
  });

  it("shareRace does not use race.recommendation.candidateName for pick text", () => {
    // The old buggy pattern was: lines.push('My pick: '+race.recommendation.candidateName)
    expect(APP_JS).not.toContain(
      "lines.push('My pick: '+race.recommendation.candidateName)"
    );
  });

  it("shareRace still shows recommendation reasoning when available", () => {
    expect(APP_JS).toContain(
      "if(race.recommendation&&race.recommendation.reasoning)lines.push(race.recommendation.reasoning)"
    );
  });

  it("shareGuide uses getEffectiveChoice instead of raw recommendation", () => {
    expect(APP_JS).toContain("var _sgName=getEffectiveChoice(r)");
    expect(APP_JS).toContain("if(_sgName)lines.push(r.office");
  });

  it("shareGuide does not use r.recommendation.candidateName for line text", () => {
    // The old buggy pattern was: lines.push(r.office+...+': '+r.recommendation.candidateName)
    expect(APP_JS).not.toContain(
      "': '+r.recommendation.candidateName)"
    );
  });

  it("shareGuide filter includes races with overrides (not just AI recommendations)", () => {
    expect(APP_JS).toContain(
      "r.isContested&&(r.recommendation||getOverride(r))"
    );
  });
});

// ===========================================================================
// 14. clearOverride cleans up empty party objects
// ===========================================================================
describe("clearOverride cleanup — source verification", () => {
  it("removes empty party sub-object after clearing last override", () => {
    expect(APP_JS).toContain(
      "if(Object.keys(S.overrides[party]).length===0)delete S.overrides[party]"
    );
  });
});

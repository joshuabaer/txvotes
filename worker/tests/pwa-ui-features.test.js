import { describe, it, expect } from "vitest";
import { APP_JS } from "../src/pwa.js";

// ---------------------------------------------------------------------------
// PWA UI Features — source-level verification
//
// These tests verify that key UI features exist in the PWA source code.
// They use the same approach as routes.test.js: reading the source string
// and checking for expected patterns, since the PWA is a single inline
// script served from the worker.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Strengths and Concerns display
// ---------------------------------------------------------------------------
describe("Strengths and Concerns in ballot view", () => {
  it("renders Strengths section with green checkmark", () => {
    expect(APP_JS).toContain("Strengths");
    expect(APP_JS).toContain("\\u2705");
    expect(APP_JS).toContain("c.pros");
  });

  it("renders Concerns section with warning sign", () => {
    expect(APP_JS).toContain("Concerns");
    expect(APP_JS).toContain("\\u26A0");
    expect(APP_JS).toContain("c.cons");
  });

  it("conditionally shows Strengths only when pros array has items", () => {
    expect(APP_JS).toContain("c.pros&&c.pros.length");
  });

  it("conditionally shows Concerns only when cons array has items", () => {
    expect(APP_JS).toContain("c.cons&&c.cons.length");
  });

  it("uses esc() for XSS protection on pros/cons text", () => {
    // The rendering code should escape all user-facing content
    expect(APP_JS).toContain("esc(tp(c.pros[j]))");
    expect(APP_JS).toContain("esc(tp(c.cons[j]))");
  });

  it("renders pros and cons as unordered lists", () => {
    expect(APP_JS).toContain("pros\"><h5>");
    expect(APP_JS).toContain("cons\"><h5>");
    // Both use <ul> list format
    expect(APP_JS).toContain("<ul>");
    expect(APP_JS).toContain("<li>");
  });

  it("Strengths and Concerns have Spanish translations", () => {
    expect(APP_JS).toContain("'Strengths':'Fortalezas'");
    expect(APP_JS).toContain("'Concerns':'Preocupaciones'");
  });

  it("renders strengths/concerns in compact view (race card)", () => {
    // The race card shows a compact pros/cons summary
    expect(APP_JS).toContain("var(--ok)");  // Strengths color
    expect(APP_JS).toContain("var(--bad)"); // Concerns color
  });
});

// ---------------------------------------------------------------------------
// "Flag this info" bias reporting UI
// ---------------------------------------------------------------------------
describe("Flag this info bias reporting", () => {
  it("renders Flag this info button on each candidate card", () => {
    expect(APP_JS).toContain("Flag this info");
    expect(APP_JS).toContain('data-action="report-issue"');
    expect(APP_JS).toContain("report-link");
  });

  it("Flag this info button includes candidate name and race data attributes", () => {
    expect(APP_JS).toContain('data-candidate="');
    expect(APP_JS).toContain('data-race="');
  });

  it("report-issue action triggers showReportModal", () => {
    expect(APP_JS).toContain("showReportModal");
    expect(APP_JS).toContain("report-issue");
  });

  it("report modal has 4 issue type radio buttons", () => {
    expect(APP_JS).toContain('value="incorrect"');
    expect(APP_JS).toContain('value="bias"');
    expect(APP_JS).toContain('value="missing"');
    expect(APP_JS).toContain('value="other"');
  });

  it("report modal shows issue type labels", () => {
    expect(APP_JS).toContain("Incorrect info");
    expect(APP_JS).toContain("Perceived bias");
    expect(APP_JS).toContain("Missing info");
    expect(APP_JS).toContain("Other");
  });

  it("report modal includes a textarea for details", () => {
    expect(APP_JS).toContain("report-details");
    expect(APP_JS).toContain("Describe the issue");
  });

  it("report modal has Cancel and Submit buttons", () => {
    expect(APP_JS).toContain('data-action="report-cancel"');
    expect(APP_JS).toContain('data-action="report-submit"');
    expect(APP_JS).toContain("Cancel");
    expect(APP_JS).toContain("Submit Report");
  });

  it("submit action sends email to flagged@txvotes.app", () => {
    expect(APP_JS).toContain("flagged@txvotes.app");
    expect(APP_JS).toContain("mailto:");
  });

  it("submit constructs email with candidate, race, type, and details", () => {
    expect(APP_JS).toContain("Issue Report:");
    expect(APP_JS).toContain("'Candidate: '+candidateName");
    expect(APP_JS).toContain("'Race: '+raceName");
    expect(APP_JS).toContain("'Issue Type: '");
    expect(APP_JS).toContain("'Details: '");
  });

  it("submit tracks report_submitted event", () => {
    expect(APP_JS).toContain("report_submitted");
  });

  it("submit shows thank you message", () => {
    expect(APP_JS).toContain("Thank you! Your report has been sent.");
  });

  it("cancel action removes the modal overlay", () => {
    expect(APP_JS).toContain("report-cancel");
    expect(APP_JS).toContain("d.remove()");
  });

  it("validates that an issue type is selected before submit", () => {
    expect(APP_JS).toContain("Please select an issue type");
  });

  it("Flag this info has Spanish translation", () => {
    expect(APP_JS).toContain("'Flag this info':'Reportar esta informaci");
  });
});

// ---------------------------------------------------------------------------
// Candidate card rendering
// ---------------------------------------------------------------------------
describe("Candidate card rendering in ballot view", () => {
  it("renders candidate name as heading", () => {
    expect(APP_JS).toContain("c.name");
  });

  it("renders candidate summary with escaping", () => {
    expect(APP_JS).toContain("esc(tp(c.summary))");
  });

  it("conditionally renders Key Positions as chips", () => {
    expect(APP_JS).toContain("c.keyPositions&&c.keyPositions.length");
    expect(APP_JS).toContain("Key Positions");
    expect(APP_JS).toContain("pos-chip");
  });

  it("conditionally renders Endorsements list", () => {
    expect(APP_JS).toContain("c.endorsements&&c.endorsements.length");
    expect(APP_JS).toContain("Endorsements");
  });

  it("handles both string and object endorsement formats", () => {
    // String endorsements: typeof en==='string'
    expect(APP_JS).toContain("typeof en==='string'");
    // Object endorsements with type label
    expect(APP_JS).toContain("en.type");
    expect(APP_JS).toContain("en.name");
  });

  it("conditionally renders Fundraising section", () => {
    expect(APP_JS).toContain("c.fundraising");
    expect(APP_JS).toContain("Fundraising");
  });

  it("conditionally renders Polling section", () => {
    expect(APP_JS).toContain("c.polling");
    expect(APP_JS).toContain("Polling");
  });

  it("has expand/collapse toggle button", () => {
    expect(APP_JS).toContain("toggle-expand");
    expect(APP_JS).toContain("Show Details");
    expect(APP_JS).toContain("Show Less");
  });

  it("renders Sources section with expand/collapse", () => {
    expect(APP_JS).toContain("c.sources&&c.sources.length");
    expect(APP_JS).toContain("Sources");
    // Sources show count
    expect(APP_JS).toContain("c.sources.length");
  });

  it("source links open in new tab", () => {
    expect(APP_JS).toContain('target="_blank"');
    expect(APP_JS).toContain('rel="noopener noreferrer"');
  });

  it("source links show access date when available", () => {
    expect(APP_JS).toContain("src.accessDate");
  });
});

// ---------------------------------------------------------------------------
// Phase 0 redirect behavior (source patterns)
// ---------------------------------------------------------------------------
describe("Phase 0 redirect behavior in PWA source", () => {
  it("initial phase is set to 0", () => {
    // The state initialization sets phase to 0
    expect(APP_JS).toContain("phase:0");
  });

  it("phase 0 redirects to landing page", () => {
    // Phase 0 render triggers redirect to /
    expect(APP_JS).toContain("location.href='/'");
  });

  it("?start=1 param auto-advances past phase 0", () => {
    expect(APP_JS).toContain("start=1");
    // When start=1, the app skips phase 0
    expect(APP_JS).toContain("S.phase=1");
  });

  it("?tone= param sets reading level and advances to phase 2", () => {
    expect(APP_JS).toContain("tone=");
    expect(APP_JS).toContain("S.readingLevel=parseInt");
    expect(APP_JS).toContain("S.phase=2");
  });

  it("hash routing resets to #/ when guide is not complete", () => {
    expect(APP_JS).toContain("!S.guideComplete&&location.hash&&location.hash!=='#/'");
    expect(APP_JS).toContain("location.hash='#/'");
  });
});

// ---------------------------------------------------------------------------
// PWA state persistence patterns
// ---------------------------------------------------------------------------
describe("PWA state persistence", () => {
  it("uses tx_votes_ prefix for localStorage keys", () => {
    expect(APP_JS).toContain("tx_votes_profile");
    expect(APP_JS).toContain("tx_votes_ballot_republican");
    expect(APP_JS).toContain("tx_votes_ballot_democrat");
  });

  it("migrates from atx_votes_ prefix", () => {
    expect(APP_JS).toContain("atx_votes_");
    expect(APP_JS).toContain("tx_votes_");
  });

  it("saves profile and ballot data to localStorage", () => {
    expect(APP_JS).toContain("localStorage.setItem");
    expect(APP_JS).toContain("tx_votes_profile");
  });

  it("loads profile and ballot data from localStorage", () => {
    expect(APP_JS).toContain("localStorage.getItem");
    expect(APP_JS).toContain("tx_votes_profile");
  });
});

// ---------------------------------------------------------------------------
// Share race feature
// ---------------------------------------------------------------------------
describe("Share race feature", () => {
  it("has share-race button on each race", () => {
    expect(APP_JS).toContain('data-action="share-race"');
    expect(APP_JS).toContain("Share this race");
  });

  it("tracks share_race analytics event", () => {
    expect(APP_JS).toContain("share_race");
  });

  it("uses navigator.share when available, falls back to clipboard", () => {
    expect(APP_JS).toContain("navigator.share");
    expect(APP_JS).toContain("navigator.clipboard");
  });
});

// ---------------------------------------------------------------------------
// Guide reprocessing
// ---------------------------------------------------------------------------
describe("Guide reprocessing", () => {
  it("has reprocess-guide button when guide is complete", () => {
    expect(APP_JS).toContain('data-action="reprocess-guide"');
    expect(APP_JS).toContain("Reprocess Guide");
  });

  it("reprocess action resets and rebuilds guide", () => {
    expect(APP_JS).toContain("reprocessGuide");
    expect(APP_JS).toContain("S.guideComplete=false");
    expect(APP_JS).toContain("S.phase=8");
  });
});

// ---------------------------------------------------------------------------
// "I Voted" feature
// ---------------------------------------------------------------------------
describe("I Voted feature", () => {
  it("has mark-voted action", () => {
    expect(APP_JS).toContain('data-action="mark-voted"');
  });

  it("tracks i_voted analytics event", () => {
    expect(APP_JS).toContain("i_voted");
  });

  it("launches confetti on voting", () => {
    expect(APP_JS).toContain("launchConfetti");
  });

  it("has unvote action to toggle back", () => {
    expect(APP_JS).toContain('data-action="unvote"');
  });
});

// ---------------------------------------------------------------------------
// Tab navigation
// ---------------------------------------------------------------------------
describe("Tab navigation in PWA", () => {
  it("has ballot, profile, and info tabs", () => {
    expect(APP_JS).toContain("#/ballot");
    expect(APP_JS).toContain("#/profile");
    expect(APP_JS).toContain("#/info");
  });

  it("renders tab bar with tabBar function", () => {
    expect(APP_JS).toContain("tabBar");
  });

  it("renders top navigation with topNav function", () => {
    expect(APP_JS).toContain("topNav");
  });
});

// ---------------------------------------------------------------------------
// Disclaimer display
// ---------------------------------------------------------------------------
describe("Disclaimer display", () => {
  it("shows disclaimer that can be dismissed", () => {
    expect(APP_JS).toContain("disclaimerDismissed");
    expect(APP_JS).toContain('data-action="dismiss-disclaimer"');
  });

  it("disclaimer mentions AI-generated recommendations", () => {
    expect(APP_JS).toContain("AI-generated");
  });

  it("encourages doing own research", () => {
    expect(APP_JS).toContain("do your own research");
  });
});

// ---------------------------------------------------------------------------
// Deep dive option balance — word count parity
// ---------------------------------------------------------------------------
describe("Deep dive option balance", () => {
  // Parse the DEEP_DIVES object from the APP_JS source
  const deepDivesMatch = APP_JS.match(/var DEEP_DIVES=(\{[\s\S]*?\});/);

  it("DEEP_DIVES object exists in APP_JS", () => {
    expect(deepDivesMatch).not.toBeNull();
  });

  // Extract all deep dive issues and their options
  // Each option has a label (l) and description (d)
  const deepDiveStr = deepDivesMatch ? deepDivesMatch[1] : "{}";
  // Use Function constructor to parse JS object literal
  let deepDives;
  try {
    deepDives = new Function("return " + deepDiveStr)();
  } catch (e) {
    deepDives = {};
  }

  const issues = Object.keys(deepDives);

  it("has deep dives for at least 15 issues", () => {
    expect(issues.length).toBeGreaterThanOrEqual(15);
  });

  it("each deep dive has exactly 4 options", () => {
    for (const issue of issues) {
      expect(deepDives[issue].opts).toHaveLength(4);
    }
  });

  it("all deep dive option descriptions have balanced word counts within each issue (max 3:1 ratio)", () => {
    for (const issue of issues) {
      const opts = deepDives[issue].opts;
      const wordCounts = opts.map(o => o.d.split(/\s+/).length);
      const maxWords = Math.max(...wordCounts);
      const minWords = Math.min(...wordCounts);
      const ratio = maxWords / minWords;
      expect(ratio).toBeLessThanOrEqual(3);
    }
  });

  it("no deep dive description exceeds 15 words (stays concise)", () => {
    for (const issue of issues) {
      for (const opt of deepDives[issue].opts) {
        const wordCount = opt.d.split(/\s+/).length;
        expect(wordCount).toBeLessThanOrEqual(15);
      }
    }
  });

  it("all deep dive labels are under 40 characters", () => {
    for (const issue of issues) {
      for (const opt of deepDives[issue].opts) {
        expect(opt.l.length).toBeLessThanOrEqual(40);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Deep dives — loaded language check
// ---------------------------------------------------------------------------
describe("Deep dive descriptions — no loaded language", () => {
  const deepDivesMatch = APP_JS.match(/var DEEP_DIVES=(\{[\s\S]*?\});/);
  const deepDiveStr = deepDivesMatch ? deepDivesMatch[1] : "{}";
  let deepDives;
  try {
    deepDives = new Function("return " + deepDiveStr)();
  } catch (e) {
    deepDives = {};
  }

  // Loaded/biased terms that should never appear in a nonpartisan guide
  const LOADED_TERMS = [
    "radical", "extremist", "dangerous", "socialist", "communist",
    "fascist", "tyranny", "destruction", "oppression", "crushing",
    "disastrous", "catastrophic", "reckless", "corrupt",
    "appalling", "disgraceful", "un-American", "patriotic duty",
    "freedom-hating", "job-killing",
  ];

  const issues = Object.keys(deepDives);

  it("no deep dive question uses loaded terms", () => {
    for (const issue of issues) {
      const q = deepDives[issue].q.toLowerCase();
      for (const term of LOADED_TERMS) {
        expect(q).not.toContain(term);
      }
    }
  });

  it("no deep dive option label uses loaded terms", () => {
    for (const issue of issues) {
      for (const opt of deepDives[issue].opts) {
        const label = opt.l.toLowerCase();
        for (const term of LOADED_TERMS) {
          expect(label).not.toContain(term);
        }
      }
    }
  });

  it("no deep dive option description uses loaded terms", () => {
    for (const issue of issues) {
      for (const opt of deepDives[issue].opts) {
        const desc = opt.d.toLowerCase();
        for (const term of LOADED_TERMS) {
          expect(desc).not.toContain(term);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Deep dives — Spanish translations completeness
// ---------------------------------------------------------------------------
describe("Deep dive Spanish translations (TR dictionary)", () => {
  const deepDivesMatch = APP_JS.match(/var DEEP_DIVES=(\{[\s\S]*?\});/);
  const deepDiveStr = deepDivesMatch ? deepDivesMatch[1] : "{}";
  let deepDives;
  try {
    deepDives = new Function("return " + deepDiveStr)();
  } catch (e) {
    deepDives = {};
  }

  const issues = Object.keys(deepDives);

  // Helper: re-escape unicode characters that appear as escape sequences in APP_JS source
  function escapeForSearch(str) {
    return str.replace(/[\u2019\u2014\u00E9\u00ED\u00F3\u00FA\u00E1\u00F1\u00BF\u00A1]/g, function(ch) {
      return "\\u" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
    });
  }

  it("TR dictionary exists with translations", () => {
    expect(APP_JS).toContain("var TR={");
  });

  it("all deep dive question strings have Spanish translations in TR", () => {
    for (const issue of issues) {
      const q = escapeForSearch(deepDives[issue].q);
      // The TR dictionary uses single-quoted keys: 'question':'translation'
      expect(APP_JS).toContain("'" + q + "'");
    }
  });

  it("all deep dive option labels have Spanish translations in TR", () => {
    for (const issue of issues) {
      for (const opt of deepDives[issue].opts) {
        const l = escapeForSearch(opt.l);
        expect(APP_JS).toContain("'" + l + "'");
      }
    }
  });

  it("all deep dive option descriptions have Spanish translations in TR", () => {
    for (const issue of issues) {
      for (const opt of deepDives[issue].opts) {
        const d = escapeForSearch(opt.d);
        expect(APP_JS).toContain("'" + d + "'");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Error handling — API error messages shown to user
// ---------------------------------------------------------------------------
describe("Error handling — API error display", () => {
  it("sets S.error to err.message when guide generation fails", () => {
    expect(APP_JS).toContain("S.error=err.message||'Something went wrong. Please try again.'");
  });

  it("renders error state in the UI", () => {
    expect(APP_JS).toContain("S.error");
    // Error is rendered visually
    expect(APP_JS).toContain("error");
  });

  it("tracks guide_error analytics event with error message", () => {
    expect(APP_JS).toContain("trk('guide_error'");
    expect(APP_JS).toContain("err.message");
  });

  it("truncates long error messages to 128 chars for analytics", () => {
    expect(APP_JS).toContain(".slice(0,128)");
  });

  it("has a default fallback error message when err.message is falsy", () => {
    expect(APP_JS).toContain("'Something went wrong. Please try again.'");
  });

  it("re-renders the UI after setting the error", () => {
    // After S.error is set, render() is called
    expect(APP_JS).toContain("S.error=err.message||'Something went wrong. Please try again.';render()");
  });
});

// ---------------------------------------------------------------------------
// Per-data-point confidence indicators in PWA
// ---------------------------------------------------------------------------
describe("PWA source confidence badges", () => {
  it("defines classifySourceConf function", () => {
    expect(APP_JS).toContain("function classifySourceConf(c)");
  });

  it("defines sourceConfBadge function", () => {
    expect(APP_JS).toContain("function sourceConfBadge(level)");
  });

  it("classifies official sources as verified", () => {
    expect(APP_JS).toContain("ballotpedia|votesmart|sos\\.state|sos\\.texas|capitol|senate\\.gov|house\\.gov");
  });

  it("adds confidence badges to candidate detail sections", () => {
    expect(APP_JS).toContain("sourceConfBadge(_sc.keyPositions)");
    expect(APP_JS).toContain("sourceConfBadge(_sc.pros)");
    expect(APP_JS).toContain("sourceConfBadge(_sc.cons)");
    expect(APP_JS).toContain("sourceConfBadge(_sc.endorsements)");
    expect(APP_JS).toContain("sourceConfBadge(_sc.fundraising)");
    expect(APP_JS).toContain("sourceConfBadge(_sc.polling)");
  });

  it("computes confidence when candidate is expanded", () => {
    expect(APP_JS).toContain("var _sc=classifySourceConf(c)");
  });

  it("renders three badge styles for verified, sourced, and ai-inferred", () => {
    expect(APP_JS).toContain("#059669"); // verified color
    expect(APP_JS).toContain("#2563eb"); // sourced color
    expect(APP_JS).toContain("#d97706"); // ai-inferred color
  });

  it("includes confidence legend in expanded view", () => {
    expect(APP_JS).toContain("Data Confidence");
    expect(APP_JS).toContain("backed by official sources");
    expect(APP_JS).toContain("from web sources cited below");
    expect(APP_JS).toContain("generated by AI from available information");
  });

  it("includes Spanish translations for confidence labels", () => {
    expect(APP_JS).toContain("'Verified':'Verificado'");
    expect(APP_JS).toContain("'Sourced':'Con fuentes'");
    expect(APP_JS).toContain("'AI-inferred':'Inferido por IA'");
    expect(APP_JS).toContain("'Data Confidence':'Confianza de Datos'");
  });
});

// ---------------------------------------------------------------------------
// Admin hash routes bypass render() interview guard
// ---------------------------------------------------------------------------
describe("Admin hash routes bypass interview guard in render()", () => {
  it("render() checks for _adminHash variable", () => {
    expect(APP_JS).toContain("var _adminHash=location.hash==='#/llm-experiment'||location.hash==='#/debug/compare'");
  });

  it("render() skips interview early-return when _adminHash is true", () => {
    expect(APP_JS).toContain("if(!S.guideComplete&&!_adminHash){");
  });

  it("routes #/llm-experiment to renderExperiment()", () => {
    expect(APP_JS).toContain("else if(h==='#/llm-experiment'){app.innerHTML=renderExperiment()");
  });

  it("routes #/debug/compare to renderLLMCompare()", () => {
    expect(APP_JS).toContain("else if(h==='#/debug/compare'){app.innerHTML=renderLLMCompare()");
  });
});

// ---------------------------------------------------------------------------
// Init guard exempts admin hash routes
// ---------------------------------------------------------------------------
describe("Init guard exempts admin hash routes", () => {
  it("init guard checks for #/llm-experiment exemption", () => {
    expect(APP_JS).toContain("location.hash!=='#/llm-experiment'");
  });

  it("init guard checks for #/debug/compare exemption", () => {
    expect(APP_JS).toContain("location.hash!=='#/debug/compare'");
  });

  it("init guard resets non-exempt hashes to #/ when guide is incomplete", () => {
    expect(APP_JS).toContain(
      "if(!S.guideComplete&&location.hash&&location.hash!=='#/'&&location.hash!=='#/llm-experiment'&&location.hash!=='#/debug/compare')location.hash='#/'"
    );
  });
});

// ---------------------------------------------------------------------------
// expGenerate() default profile fallback
// ---------------------------------------------------------------------------
describe("expGenerate() default profile fallback", () => {
  it("expGenerate reads profile from localStorage", () => {
    expect(APP_JS).toContain("localStorage.getItem('tx_votes_profile')");
  });

  it("provides a default profile when none exists in localStorage", () => {
    expect(APP_JS).toContain(
      "if(!profile){profile={tone:'balanced',issues:['Economy','Education','Healthcare','Immigration','Public Safety'],qualities:['Integrity','Experience','Leadership'],readingLevel:3}}"
    );
  });

  it("default profile has balanced tone", () => {
    expect(APP_JS).toContain("tone:'balanced'");
  });

  it("default profile has 5 default issues", () => {
    expect(APP_JS).toContain("issues:['Economy','Education','Healthcare','Immigration','Public Safety']");
  });

  it("default profile has 3 default qualities", () => {
    expect(APP_JS).toContain("qualities:['Integrity','Experience','Leadership']");
  });

  it("default profile has readingLevel 3", () => {
    // The default profile fallback sets readingLevel:3
    const match = APP_JS.match(/if\(!profile\)\{profile=\{[^}]+readingLevel:(\d+)/);
    expect(match).not.toBeNull();
    expect(match[1]).toBe("3");
  });
});

// ---------------------------------------------------------------------------
// Experiment always generates both LLMs fresh (no seeding from existing ballot)
// ---------------------------------------------------------------------------
describe("expGenerate() always generates fresh — no ballot seeding", () => {
  // Extract the full expGenerate function body using its known termination pattern.
  // The function starts at "function expGenerate(){" and ends at "})(toGen[gj])}}".
  const fnStart = APP_JS.indexOf("function expGenerate(){");
  const endMarker = "})(toGen[gj])}}";
  const markerPos = APP_JS.indexOf(endMarker, fnStart);
  const fnBody = APP_JS.slice(fnStart, markerPos + endMarker.length);

  it("extracts expGenerate function body successfully", () => {
    expect(fnStart).toBeGreaterThan(-1);
    expect(markerPos).toBeGreaterThan(fnStart);
    expect(fnBody.length).toBeGreaterThan(100);
  });

  it("expGenerate does not reference S.repBallot", () => {
    expect(fnBody).not.toContain("S.repBallot");
  });

  it("expGenerate does not reference S.demBallot", () => {
    expect(fnBody).not.toContain("S.demBallot");
  });

  it("expGenerate always calls fetch for both Claude and challenger", () => {
    expect(fnBody).toContain("fetch('/app/api/guide'");
    expect(fnBody).toContain("body:JSON.stringify({party:party,profile:profile");
    expect(fnBody).toContain("llm:llmKey");
  });

  it("expGenerate generates for both parties (republican and democrat)", () => {
    expect(fnBody).toContain("var parties=['republican','democrat']");
    expect(fnBody).toContain("parties.map(function(party)");
  });

  it("expGenerate records timing data for each LLM", () => {
    expect(fnBody).toContain("var t0=Date.now()");
    expect(fnBody).toContain("expTiming[llmKey]=elapsed");
  });

  it("expGenerate computes cost estimates for each LLM", () => {
    expect(fnBody).toContain("expCosts[llmKey]=");
    expect(fnBody).toContain("EXP_COST[llmKey]");
  });
});

// ---------------------------------------------------------------------------
// LLM_META — all 8 models with required fields
// ---------------------------------------------------------------------------
describe("LLM_META — expanded 8-model support", () => {
  const ALL_LLM_KEYS = [
    "claude", "claude-haiku", "claude-opus",
    "chatgpt", "gpt-4o-mini",
    "gemini", "gemini-pro",
    "grok",
  ];

  it("LLM_META has entries for all 8 models", () => {
    // Keys with hyphens are quoted, simple keys are unquoted in the JS source
    const quotedKeys = ["claude-haiku", "claude-opus", "gpt-4o-mini", "gemini-pro"];
    const unquotedKeys = ["claude", "chatgpt", "gemini", "grok"];
    for (const key of quotedKeys) {
      expect(APP_JS).toContain("'" + key + "':{name:");
    }
    for (const key of unquotedKeys) {
      expect(APP_JS).toContain(key + ":{name:");
    }
  });

  it("each LLM_META entry has a name field", () => {
    // Verify specific names
    expect(APP_JS).toContain("name:'Claude Sonnet'");
    expect(APP_JS).toContain("name:'Claude Haiku'");
    expect(APP_JS).toContain("name:'Claude Opus'");
    expect(APP_JS).toContain("name:'GPT-4o'");
    expect(APP_JS).toContain("name:'GPT-4o mini'");
    expect(APP_JS).toContain("name:'Gemini Flash'");
    expect(APP_JS).toContain("name:'Gemini Pro'");
    expect(APP_JS).toContain("name:'Grok 3'");
  });

  it("each LLM_META entry has an icon field", () => {
    // All Anthropic models use purple circle
    expect(APP_JS).toContain("claude:{name:'Claude Sonnet',icon:'\\u{1F7E3}'");
    expect(APP_JS).toContain("'claude-haiku':{name:'Claude Haiku',icon:'\\u{1F7E3}'");
    expect(APP_JS).toContain("'claude-opus':{name:'Claude Opus',icon:'\\u{1F7E3}'");
    // OpenAI models use green circle
    expect(APP_JS).toContain("chatgpt:{name:'GPT-4o',icon:'\\u{1F7E2}'");
    expect(APP_JS).toContain("'gpt-4o-mini':{name:'GPT-4o mini',icon:'\\u{1F7E2}'");
    // Google models use blue circle
    expect(APP_JS).toContain("gemini:{name:'Gemini Flash',icon:'\\u{1F535}'");
    expect(APP_JS).toContain("'gemini-pro':{name:'Gemini Pro',icon:'\\u{1F535}'");
    // xAI uses black circle
    expect(APP_JS).toContain("grok:{name:'Grok 3',icon:'\\u26AB'");
  });

  it("each LLM_META entry has a color field", () => {
    expect(APP_JS).toContain("color:'#7B61FF'");   // Claude Sonnet
    expect(APP_JS).toContain("color:'#B39DFF'");   // Claude Haiku
    expect(APP_JS).toContain("color:'#5B3FCC'");   // Claude Opus
    expect(APP_JS).toContain("color:'#10A37F'");   // ChatGPT / GPT-4o
    expect(APP_JS).toContain("color:'#6BCF9F'");   // GPT-4o mini
    expect(APP_JS).toContain("color:'#4285F4'");   // Gemini Flash
    expect(APP_JS).toContain("color:'#1A73E8'");   // Gemini Pro
    expect(APP_JS).toContain("color:'#1DA1F2'");   // Grok
  });

  it("each LLM_META entry has a provider field", () => {
    expect(APP_JS).toContain("provider:'Anthropic'");
    expect(APP_JS).toContain("provider:'OpenAI'");
    expect(APP_JS).toContain("provider:'Google'");
    expect(APP_JS).toContain("provider:'xAI'");
  });

  it("claude models have provider Anthropic", () => {
    // Match the full entry pattern for each Anthropic model
    expect(APP_JS).toContain("claude:{name:'Claude Sonnet',icon:'\\u{1F7E3}',color:'#7B61FF',provider:'Anthropic'}");
    expect(APP_JS).toContain("'claude-haiku':{name:'Claude Haiku',icon:'\\u{1F7E3}',color:'#B39DFF',provider:'Anthropic'}");
    expect(APP_JS).toContain("'claude-opus':{name:'Claude Opus',icon:'\\u{1F7E3}',color:'#5B3FCC',provider:'Anthropic'}");
  });

  it("OpenAI models have provider OpenAI", () => {
    expect(APP_JS).toContain("chatgpt:{name:'GPT-4o',icon:'\\u{1F7E2}',color:'#10A37F',provider:'OpenAI'}");
    expect(APP_JS).toContain("'gpt-4o-mini':{name:'GPT-4o mini',icon:'\\u{1F7E2}',color:'#6BCF9F',provider:'OpenAI'}");
  });

  it("Google models have provider Google", () => {
    expect(APP_JS).toContain("gemini:{name:'Gemini Flash',icon:'\\u{1F535}',color:'#4285F4',provider:'Google'}");
    expect(APP_JS).toContain("'gemini-pro':{name:'Gemini Pro',icon:'\\u{1F535}',color:'#1A73E8',provider:'Google'}");
  });

  it("grok has provider xAI", () => {
    expect(APP_JS).toContain("grok:{name:'Grok 3',icon:'\\u26AB',color:'#1DA1F2',provider:'xAI'}");
  });
});

// ---------------------------------------------------------------------------
// EXP_COST — pricing entries for all 8 models
// ---------------------------------------------------------------------------
describe("EXP_COST — pricing for all 8 models", () => {
  // Parse the EXP_COST object from source
  const expCostMatch = APP_JS.match(/var EXP_COST=(\{[^;]+\});/);

  it("EXP_COST object exists in APP_JS", () => {
    expect(expCostMatch).not.toBeNull();
  });

  let expCost;
  try {
    expCost = new Function("return " + expCostMatch[1])();
  } catch (e) {
    expCost = {};
  }

  it("has pricing for all 8 LLM keys", () => {
    const expectedKeys = ["claude", "claude-haiku", "claude-opus", "chatgpt", "gpt-4o-mini", "gemini", "gemini-pro", "grok"];
    for (const key of expectedKeys) {
      expect(expCost).toHaveProperty(key);
    }
  });

  it("each pricing entry has input and output rates", () => {
    const keys = Object.keys(expCost);
    for (const key of keys) {
      expect(expCost[key]).toHaveProperty("input");
      expect(expCost[key]).toHaveProperty("output");
      expect(typeof expCost[key].input).toBe("number");
      expect(typeof expCost[key].output).toBe("number");
      expect(expCost[key].input).toBeGreaterThan(0);
      expect(expCost[key].output).toBeGreaterThan(0);
    }
  });

  it("claude-haiku is cheaper than claude (sonnet)", () => {
    expect(expCost["claude-haiku"].input).toBeLessThan(expCost.claude.input);
    expect(expCost["claude-haiku"].output).toBeLessThan(expCost.claude.output);
  });

  it("claude-opus is more expensive than claude (sonnet)", () => {
    expect(expCost["claude-opus"].input).toBeGreaterThan(expCost.claude.input);
    expect(expCost["claude-opus"].output).toBeGreaterThan(expCost.claude.output);
  });

  it("gpt-4o-mini is cheaper than chatgpt (gpt-4o)", () => {
    expect(expCost["gpt-4o-mini"].input).toBeLessThan(expCost.chatgpt.input);
    expect(expCost["gpt-4o-mini"].output).toBeLessThan(expCost.chatgpt.output);
  });

  it("gemini-pro is more expensive than gemini (flash)", () => {
    expect(expCost["gemini-pro"].input).toBeGreaterThan(expCost.gemini.input);
    expect(expCost["gemini-pro"].output).toBeGreaterThan(expCost.gemini.output);
  });
});

// ---------------------------------------------------------------------------
// Experiment dropdown — optgroup provider grouping
// ---------------------------------------------------------------------------
describe("Experiment dropdown — optgroup provider grouping", () => {
  it("uses optgroup elements for organizing models by provider", () => {
    expect(APP_JS).toContain("<optgroup");
    expect(APP_JS).toContain("</optgroup>");
  });

  it("has Anthropic optgroup with claude-haiku and claude-opus", () => {
    expect(APP_JS).toContain("{label:'Anthropic',models:['claude-haiku','claude-opus']}");
  });

  it("has OpenAI optgroup with chatgpt and gpt-4o-mini", () => {
    expect(APP_JS).toContain("{label:'OpenAI',models:['chatgpt','gpt-4o-mini']}");
  });

  it("has Google optgroup with gemini and gemini-pro", () => {
    expect(APP_JS).toContain("{label:'Google',models:['gemini','gemini-pro']}");
  });

  it("has xAI optgroup with grok", () => {
    expect(APP_JS).toContain("{label:'xAI',models:['grok']}");
  });

  it("expGroups array contains all 4 provider groups", () => {
    expect(APP_JS).toContain("var expGroups=[");
    // The full groups definition
    expect(APP_JS).toContain(
      "var expGroups=[" +
      "{label:'Anthropic',models:['claude-haiku','claude-opus']}," +
      "{label:'OpenAI',models:['chatgpt','gpt-4o-mini']}," +
      "{label:'Google',models:['gemini','gemini-pro']}," +
      "{label:'xAI',models:['grok']}" +
      "]"
    );
  });

  it("dropdown iterates over expGroups to build optgroup HTML", () => {
    expect(APP_JS).toContain("h+='<optgroup label=\"'+grp.label+'\">'");
    expect(APP_JS).toContain("h+='</optgroup>'");
  });
});

// ---------------------------------------------------------------------------
// LLM Compare page — references all 8 model keys
// ---------------------------------------------------------------------------
describe("LLM Compare page — all 8 models referenced", () => {
  it("llmKeys array in renderLLMCompare contains all 8 models", () => {
    expect(APP_JS).toContain(
      "var llmKeys=['claude','claude-haiku','claude-opus','chatgpt','gpt-4o-mini','gemini','gemini-pro','grok']"
    );
  });

  it("LLM compare iterates over all llmKeys for button grid", () => {
    expect(APP_JS).toContain("for(var i=0;i<llmKeys.length;i++)");
    expect(APP_JS).toContain("var key=llmKeys[i];var meta=LLM_META[key]");
  });

  it("LLM compare page loads cached results for all models", () => {
    expect(APP_JS).toContain("for(var li=0;li<llmKeys.length;li++)");
    expect(APP_JS).toContain("var lk=llmKeys[li]");
    expect(APP_JS).toContain("localStorage.getItem('tx_votes_llm_compare_'+lk)");
  });

  it("LLM compare has llm-generate data action for triggering generation", () => {
    expect(APP_JS).toContain('data-action="llm-generate"');
    expect(APP_JS).toContain('data-llm="');
  });

  it("LLM compare stores results per model in localStorage", () => {
    expect(APP_JS).toContain("localStorage.setItem('tx_votes_llm_compare_'+llmKey");
  });

  it("LLM compare uses LLM_META for display in button grid", () => {
    expect(APP_JS).toContain("meta.icon");
    expect(APP_JS).toContain("meta.name");
  });
});

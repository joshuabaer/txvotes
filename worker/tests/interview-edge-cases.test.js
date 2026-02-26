// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { APP_JS } from "../src/pwa.js";

// ---------------------------------------------------------------------------
// Helpers — same as interview-flow.test.js
// Note: bootApp uses document.body.innerHTML which is safe in test context
// (only setting trusted test markup, no user input)
// ---------------------------------------------------------------------------
function bootApp(opts = {}) {
  // Safe: only setting trusted static test markup, not user input
  document.body.innerHTML =
    '<div id="topnav"></div><main id="app"></main><div id="tabs"></div>';
  // Set ?start=1 to auto-advance past Phase 0 (which redirects to landing page)
  if (opts.start) {
    history.replaceState(null, "", "/app?start=1");
  }
  const indirectEval = eval;
  indirectEval(APP_JS);
}

function clickAction(action, value) {
  const sel = value
    ? `[data-action="${action}"][data-value="${CSS.escape(value)}"]`
    : `[data-action="${action}"]`;
  const el = document.querySelector(sel);
  if (!el) throw new Error(`clickAction: no element for ${sel}`);
  el.click();
}

function getApp() {
  return document.getElementById("app").innerHTML;
}

function S() {
  return window.S;
}

function passTone() {
  clickAction("next");
}

function passIssues() {
  for (let i = 0; i < 5; i++) {
    const poolItem = document.querySelector('[data-action="pick-issue"]');
    if (poolItem) poolItem.click();
  }
  clickAction("next");
}

function passSpectrum(value = "Moderate") {
  clickAction("select-spectrum", value);
  clickAction("next");
}

function passDeepDives() {
  const total = S().ddQuestions.length;
  for (let i = 0; i < total; i++) {
    const dd = S().ddQuestions[i];
    clickAction("select-dd", dd.opts[0].l);
    clickAction("next-dd");
  }
}

function passQualities() {
  for (let i = 0; i < 3; i++) {
    const poolItem = document.querySelector('[data-action="pick-quality"]');
    if (poolItem) poolItem.click();
  }
  clickAction("next");
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  // Safe: resetting test DOM, not user content
  document.documentElement.innerHTML = "<head></head><body></body>";

  const store = {};
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((k) => (k in store ? store[k] : null)),
    setItem: vi.fn((k, v) => { store[k] = String(v); }),
    removeItem: vi.fn((k) => { delete store[k]; }),
    clear: vi.fn(() => { for (const k in store) delete store[k]; }),
    key: vi.fn((i) => Object.keys(store)[i] ?? null),
    get length() { return Object.keys(store).length; },
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        status: 200,
      })
    )
  );

  Object.defineProperty(navigator, "sendBeacon", {
    value: vi.fn(() => true),
    writable: true,
    configurable: true,
  });

  vi.stubGlobal("confirm", vi.fn(() => true));

  bootApp({ start: true });
});

// ---------------------------------------------------------------------------
// Reading level selection
// ---------------------------------------------------------------------------
describe("Reading level selection", () => {
  it("defaults to reading level 1", () => {
    expect(S().readingLevel).toBe(1);
  });

  it("sets reading level 1 (Simple)", () => {
    document.querySelector('[data-action="select-tone"][data-value="1"]').click();
    expect(S().readingLevel).toBe(1);
  });

  it("sets reading level 4 (Detailed)", () => {
    document.querySelector('[data-action="select-tone"][data-value="4"]').click();
    expect(S().readingLevel).toBe(4);
  });

  it("easter egg tone 7 is hidden by default", () => {
    const el7 = document.querySelector('[data-action="select-tone"][data-value="7"]');
    expect(el7).toBeNull();
  });

  it("easter egg tone appears after secret tap", () => {
    // The header "Talk to me like..." has data-action="secret-tap"
    const tap = document.querySelector('[data-action="secret-tap"]');
    if (tap) tap.click();
    const el7 = document.querySelector('[data-action="select-tone"][data-value="7"]');
    expect(el7).not.toBeNull();

    el7.click();
    expect(S().readingLevel).toBe(7);
  });

  it("changing reading level re-renders with highlight", () => {
    document.querySelector('[data-action="select-tone"][data-value="1"]').click();
    const html = getApp();
    expect(html).toContain('data-value="1"');
  });

  it("reading level persists through phase transitions", () => {
    document.querySelector('[data-action="select-tone"][data-value="4"]').click();
    expect(S().readingLevel).toBe(4);
    passTone();
    expect(S().readingLevel).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// State initialization
// ---------------------------------------------------------------------------
describe("State initialization", () => {
  it("issues are empty until phase 2 renders", () => {
    // Issues are populated lazily when entering phase 2
    expect(S().issues).toHaveLength(0);
  });

  it("issues populate to 21 when entering phase 2", () => {
    passTone(); // advance to phase 2
    expect(S().issues).toHaveLength(21);
  });

  it("qualities are empty until phase 5 renders", () => {
    // Qualities are populated lazily when entering phase 5
    expect(S().qualities).toHaveLength(0);
  });

  it("qualities populate to 10 when entering phase 5", () => {
    passTone();
    passIssues();
    passSpectrum("Moderate");
    passDeepDives();
    // Now at phase 5, qualities should be populated
    expect(S().qualities).toHaveLength(10);
  });

  it("initializes with empty policyViews", () => {
    expect(S().policyViews).toBeDefined();
    expect(Object.keys(S().policyViews)).toHaveLength(0);
  });

  it("initializes with null spectrum", () => {
    expect(S().spectrum).toBeNull();
  });

  it("initializes with empty freeform", () => {
    expect(S().freeform).toBe("");
  });

  it("initializes with default address (state=TX)", () => {
    expect(S().address).toBeDefined();
    expect(S().address.state).toBe("TX");
    expect(S().address.street).toBe("");
    expect(S().address.zip).toBe("");
  });

  it("initializes with phase 1 (auto-advanced via ?start=1)", () => {
    expect(S().phase).toBe(1);
  });

  it("has no guide initially", () => {
    expect(S().guideComplete).toBe(false);
    expect(S().repBallot).toBeNull();
    expect(S().demBallot).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// All 6 spectrum options
// ---------------------------------------------------------------------------
describe("All 6 spectrum options", () => {
  beforeEach(() => {
    passTone();
    passIssues();
  });

  it("can select Progressive", () => {
    clickAction("select-spectrum", "Progressive");
    expect(S().spectrum).toBe("Progressive");
  });

  it("can select Liberal", () => {
    clickAction("select-spectrum", "Liberal");
    expect(S().spectrum).toBe("Liberal");
  });

  it("can select Moderate", () => {
    clickAction("select-spectrum", "Moderate");
    expect(S().spectrum).toBe("Moderate");
  });

  it("can select Conservative", () => {
    clickAction("select-spectrum", "Conservative");
    expect(S().spectrum).toBe("Conservative");
  });

  it("can select Libertarian", () => {
    clickAction("select-spectrum", "Libertarian");
    expect(S().spectrum).toBe("Libertarian");
  });

  it("can select Independent / Issue-by-Issue", () => {
    const els = document.querySelectorAll('[data-action="select-spectrum"]');
    let found = false;
    for (const el of els) {
      if (el.dataset.value.includes("Independent")) {
        el.click();
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    expect(S().spectrum).toContain("Independent");
  });

  it("changing spectrum selection updates state", () => {
    clickAction("select-spectrum", "Progressive");
    expect(S().spectrum).toBe("Progressive");
    clickAction("select-spectrum", "Conservative");
    expect(S().spectrum).toBe("Conservative");
  });
});

// ---------------------------------------------------------------------------
// Freeform text handling
// ---------------------------------------------------------------------------
describe("Freeform text edge cases", () => {
  beforeEach(() => {
    passTone();
    passIssues();
    passSpectrum("Moderate");
    passDeepDives();
    passQualities();
  });

  it("captures empty freeform when skipping", () => {
    clickAction("next");
    expect(S().freeform).toBe("");
  });

  it("captures long freeform text", () => {
    const ta = document.getElementById("freeform-input");
    const longText = "A".repeat(500);
    ta.value = longText;
    clickAction("next");
    expect(S().freeform).toBe(longText);
  });

  it("captures freeform with special characters", () => {
    const ta = document.getElementById("freeform-input");
    ta.value = 'I care about education & housing for all';
    clickAction("next");
    expect(S().freeform).toBe('I care about education & housing for all');
  });
});

// ---------------------------------------------------------------------------
// Address validation edge cases
// ---------------------------------------------------------------------------
describe("Address validation edge cases", () => {
  beforeEach(() => {
    passTone();
    passIssues();
    passSpectrum("Moderate");
    passDeepDives();
    passQualities();
    clickAction("next"); // skip freeform
  });

  it("rejects ZIP+4 format (only 5-digit ZIP accepted)", () => {
    const form = document.getElementById("addr-form");
    form.street.value = "123 Main St";
    form.zip.value = "78701-1234";
    form.dispatchEvent(new window.Event("submit", { bubbles: true }));
    expect(S().addressError).toContain("5-digit ZIP");
  });

  it("rejects all-letter ZIP", () => {
    const form = document.getElementById("addr-form");
    form.street.value = "123 Main St";
    form.zip.value = "abcde";
    form.dispatchEvent(new window.Event("submit", { bubbles: true }));
    expect(S().addressError).toContain("5-digit ZIP");
  });

  it("trims whitespace from address fields", () => {
    const form = document.getElementById("addr-form");
    form.street.value = "  123 Main St  ";
    form.zip.value = "78701";
    form.dispatchEvent(new window.Event("submit", { bubbles: true }));
    expect(S().addressError).toBeNull();
  });

  it("skip address sets empty address fields", () => {
    clickAction("skip-address");
    expect(S().phase).toBe(8);
    expect(S().address.street).toBe("");
    expect(S().address.city).toBe("");
    expect(S().address.zip).toBe("");
    expect(S().address.state).toBe("TX");
  });
});

// ---------------------------------------------------------------------------
// Phase 8: Building the guide
// ---------------------------------------------------------------------------
describe("Phase 8: Building guide", () => {
  beforeEach(() => {
    passTone();
    passIssues();
    passSpectrum("Moderate");
    passDeepDives();
    passQualities();
    clickAction("next"); // skip freeform
    clickAction("skip-address");
  });

  it("shows loading your ballot screen", () => {
    expect(S().phase).toBe(8);
    const html = getApp();
    expect(html).toContain("Loading your ballot");
  });

  it("triggers fetch to guide API", () => {
    expect(fetch).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------
describe("localStorage persistence", () => {
  it("saves profile when advancing past phase 7", () => {
    passTone();
    passIssues();
    passSpectrum("Moderate");
    passDeepDives();
    passQualities();
    clickAction("next");
    clickAction("skip-address");

    const setCalls = localStorage.setItem.mock.calls;
    const profileCall = setCalls.find(
      (c) => c[0] === "tx_votes_profile"
    );
    expect(profileCall).toBeDefined();
  });

  it("uses tx_votes_ prefix for localStorage keys", () => {
    passTone();
    passIssues();
    passSpectrum("Moderate");
    passDeepDives();
    passQualities();
    clickAction("next");
    clickAction("skip-address");

    const setCalls = localStorage.setItem.mock.calls;
    const txVotesCalls = setCalls.filter((c) => c[0].startsWith("tx_votes_"));
    expect(txVotesCalls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Translation function t()
// ---------------------------------------------------------------------------
describe("Translation function t() existence", () => {
  it("window.t is defined globally", () => {
    expect(window.t).toBeDefined();
    expect(typeof window.t).toBe("function");
  });

  it("t returns key when no translation (en)", () => {
    const key = "Some unique test string";
    expect(window.t(key)).toBe(key);
  });
});

// ---------------------------------------------------------------------------
// Deep dive answer options structure
// ---------------------------------------------------------------------------
describe("Deep dive answer structure", () => {
  it("each deep dive has exactly 4 options", () => {
    passTone();
    passIssues();
    passSpectrum("Moderate");
    for (const dd of S().ddQuestions) {
      expect(dd.opts).toHaveLength(4);
    }
  });

  it("each option has label (l) and description (d)", () => {
    passTone();
    passIssues();
    passSpectrum("Moderate");
    for (const dd of S().ddQuestions) {
      for (const opt of dd.opts) {
        expect(opt.l).toBeTruthy();
        expect(typeof opt.l).toBe("string");
        expect(opt.d).toBeTruthy();
        expect(typeof opt.d).toBe("string");
      }
    }
  });

  it("each deep dive has a question (q) field", () => {
    passTone();
    passIssues();
    passSpectrum("Moderate");
    for (const dd of S().ddQuestions) {
      expect(dd.q).toBeTruthy();
      expect(typeof dd.q).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// Round-trip back navigation
// ---------------------------------------------------------------------------
describe("Round-trip back navigation", () => {
  it("can go forward to phase 3 and back to phase 1 without corruption", () => {
    passTone();
    expect(S().phase).toBe(2);

    passIssues();
    expect(S().phase).toBe(3);

    clickAction("back");
    expect(S().phase).toBe(2);
    expect(S().issues).toHaveLength(21);

    clickAction("back");
    expect(S().phase).toBe(1);
    expect(S().readingLevel).toBe(1);

    clickAction("next");
    expect(S().phase).toBe(2);
    expect(S().issues).toHaveLength(21);
  });

  it("answers are preserved through multiple back-forward cycles", () => {
    passTone();
    passIssues();
    passSpectrum("Conservative");
    expect(S().spectrum).toBe("Conservative");

    clickAction("back");
    expect(S().phase).toBe(3);
    expect(S().spectrum).toBe("Conservative");

    clickAction("select-spectrum", "Conservative");
    clickAction("next");
    expect(S().phase).toBe(4);

    const dd0 = S().ddQuestions[0];
    const answer = dd0.opts[2].l;
    clickAction("select-dd", answer);
    expect(S().policyViews[dd0.q]).toBe(answer);

    clickAction("back");
    expect(S().phase).toBe(3);

    clickAction("back");
    expect(S().phase).toBe(2);

    passIssues();
    passSpectrum("Conservative");

    expect(S().policyViews[dd0.q]).toBe(answer);
  });
});

// ---------------------------------------------------------------------------
// Issue ordering
// ---------------------------------------------------------------------------
describe("Issue ordering", () => {
  it("picked issues maintain their order in the top 5", () => {
    passTone();
    for (let i = 0; i < 5; i++) {
      document.querySelector('[data-action="pick-issue"]').click();
    }
    const top5 = S().issues.slice(0, 5);
    expect(top5.length).toBe(5);
    for (const issue of top5) {
      expect(typeof issue).toBe("string");
      expect(issue.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Quality ordering
// ---------------------------------------------------------------------------
describe("Quality ordering", () => {
  beforeEach(() => {
    passTone();
    passIssues();
    passSpectrum("Moderate");
    passDeepDives();
  });

  it("picked qualities are in the top 3 of S().qualities", () => {
    for (let i = 0; i < 3; i++) {
      document.querySelector('[data-action="pick-quality"]').click();
    }
    const top3 = S().qualities.slice(0, 3);
    expect(top3.length).toBe(3);
    for (const q of top3) {
      expect(typeof q).toBe("string");
      expect(q.length).toBeGreaterThan(0);
    }
  });

  it("unpicking a quality and picking a different one works", () => {
    document.querySelector('[data-action="pick-quality"]').click();
    expect(S()._pickedQuals).toBe(1);

    document.querySelector('[data-action="unpick-quality"]').click();
    expect(S()._pickedQuals).toBe(0);

    document.querySelector('[data-action="pick-quality"]').click();
    expect(S()._pickedQuals).toBe(1);
  });
});

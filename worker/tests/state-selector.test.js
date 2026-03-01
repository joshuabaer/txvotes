// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { APP_JS, handlePWA, handlePWA_Manifest } from "../src/pwa.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function bootApp(opts = {}) {
  document.body.innerHTML =
    '<div id="topnav"></div><main id="app"></main><div id="tabs"></div>';
  if (opts.start) {
    history.replaceState(null, "", "/app?start=1");
  }
  // Set _STATE before evaluating APP_JS
  if (opts.state) {
    window._STATE = opts.state;
  }
  const indirectEval = eval;
  indirectEval(APP_JS);
}

function getApp() {
  return document.getElementById("app").innerHTML;
}

function S() {
  return window.S;
}

function clickAction(action, value) {
  const sel = value
    ? `[data-action="${action}"][data-value="${CSS.escape(value)}"]`
    : `[data-action="${action}"]`;
  const el = document.querySelector(sel);
  if (!el) throw new Error(`clickAction: no element for ${sel}`);
  el.click();
}

// Phase pass-through helpers
function passTone() { clickAction("next"); }
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

function navigateToAddress() {
  passTone();
  passIssues();
  passSpectrum();
  passDeepDives();
  passQualities();
  clickAction("next"); // freeform -> address
}

beforeEach(() => {
  // Reset DOM completely
  document.documentElement.innerHTML = "<head></head><body></body>";

  // Provide a compliant localStorage stub
  const store = {};
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((k) => (k in store ? store[k] : null)),
    setItem: vi.fn((k, v) => { store[k] = String(v); }),
    removeItem: vi.fn((k) => { delete store[k]; }),
    clear: vi.fn(() => { for (const k in store) delete store[k]; }),
    key: vi.fn((i) => Object.keys(store)[i] ?? null),
    get length() { return Object.keys(store).length; },
  });

  // Stub fetch
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

  // Stub navigator.sendBeacon
  Object.defineProperty(navigator, "sendBeacon", {
    value: vi.fn(() => true),
    writable: true,
    configurable: true,
  });

  // Stub confirm
  vi.stubGlobal("confirm", vi.fn(() => true));

  // Clean up globals
  delete window._STATE;
  delete window._APP_BASE;
  delete window.S;
});

// ===========================================================================
// 1. State code initialization
// ===========================================================================
describe("State code initialization", () => {
  it("defaults to tx when _STATE is not set", () => {
    bootApp({ start: true });
    expect(S().stateCode).toBe("tx");
  });

  it("initializes to tx when _STATE='tx'", () => {
    bootApp({ start: true, state: "tx" });
    expect(S().stateCode).toBe("tx");
  });

  it("initializes to dc when _STATE='dc'", () => {
    bootApp({ start: true, state: "dc" });
    expect(S().stateCode).toBe("dc");
  });

  it("persists state code in localStorage", () => {
    bootApp({ start: true, state: "dc" });
    expect(localStorage.setItem).toHaveBeenCalledWith("tx_votes_state", "dc");
  });

  it("persists tx state in localStorage", () => {
    bootApp({ start: true, state: "tx" });
    expect(localStorage.setItem).toHaveBeenCalledWith("tx_votes_state", "tx");
  });
});

// ===========================================================================
// 2. Address form defaults for TX
// ===========================================================================
describe("Address form defaults for TX", () => {
  it("defaults address state to TX", () => {
    bootApp({ start: true, state: "tx" });
    expect(S().address.state).toBe("TX");
  });

  it("defaults city to empty for TX", () => {
    bootApp({ start: true, state: "tx" });
    expect(S().address.city).toBe("");
  });

  it("defaults selectedParty to republican for TX", () => {
    bootApp({ start: true, state: "tx" });
    expect(S().selectedParty).toBe("republican");
  });

  it("shows TX in address form state field", () => {
    bootApp({ start: true, state: "tx" });
    navigateToAddress();
    expect(S().phase).toBe(7);
    const html = getApp();
    expect(html).toContain('value="TX" disabled');
    expect(html).toContain('placeholder="78701"');
  });
});

// ===========================================================================
// 3. Address form defaults for DC
// ===========================================================================
describe("Address form defaults for DC", () => {
  it("defaults address state to DC", () => {
    bootApp({ start: true, state: "dc" });
    expect(S().address.state).toBe("DC");
  });

  it("defaults city to Washington for DC", () => {
    bootApp({ start: true, state: "dc" });
    expect(S().address.city).toBe("Washington");
  });

  it("defaults selectedParty to democrat for DC", () => {
    bootApp({ start: true, state: "dc" });
    expect(S().selectedParty).toBe("democrat");
  });

  it("shows DC in address form state field", () => {
    bootApp({ start: true, state: "dc" });
    navigateToAddress();
    expect(S().phase).toBe(7);
    const html = getApp();
    expect(html).toContain('value="DC" disabled');
    expect(html).toContain('placeholder="20001"');
  });

  it("pre-fills Washington in city field", () => {
    bootApp({ start: true, state: "dc" });
    navigateToAddress();
    const html = getApp();
    expect(html).toContain('value="Washington"');
  });

  it("skip-address preserves DC state defaults", () => {
    bootApp({ start: true, state: "dc" });
    expect(S().address.state).toBe("DC");
    expect(S().address.city).toBe("Washington");
  });
});

// ===========================================================================
// 4. State-aware branding
// ===========================================================================
describe("State-aware branding", () => {
  it("_stateLabel returns Texas Votes when state=tx", () => {
    bootApp({ start: true, state: "tx" });
    expect(window._stateLabel()).toBe("Texas Votes");
  });

  it("_stateLabel returns DC Votes when state=dc", () => {
    bootApp({ start: true, state: "dc" });
    expect(window._stateLabel()).toBe("DC Votes");
  });

  it("_stateAbbr is TX for state=tx", () => {
    bootApp({ start: true, state: "tx" });
    expect(window._stateAbbr).toBe("TX");
  });

  it("_stateAbbr is DC for state=dc", () => {
    bootApp({ start: true, state: "dc" });
    expect(window._stateAbbr).toBe("DC");
  });

  it("_stateName is Texas for state=tx", () => {
    bootApp({ start: true, state: "tx" });
    expect(window._stateName).toBe("Texas");
  });

  it("_stateName is DC for state=dc", () => {
    bootApp({ start: true, state: "dc" });
    expect(window._stateName).toBe("DC");
  });

  it("_stateFullName is Texas for state=tx", () => {
    bootApp({ start: true, state: "tx" });
    expect(window._stateFullName).toBe("Texas");
  });

  it("_stateFullName is Washington DC for state=dc", () => {
    bootApp({ start: true, state: "dc" });
    expect(window._stateFullName).toBe("Washington DC");
  });
});

// ===========================================================================
// 4b. Address form defaults for CO
// ===========================================================================
describe("Address form defaults for CO", () => {
  it("defaults address state to CO", () => {
    bootApp({ start: true, state: "co" });
    expect(S().address.state).toBe("CO");
  });

  it("defaults city to empty for CO", () => {
    bootApp({ start: true, state: "co" });
    expect(S().address.city).toBe("");
  });

  it("defaults selectedParty to democrat for CO", () => {
    bootApp({ start: true, state: "co" });
    expect(S().selectedParty).toBe("democrat");
  });
});

// ===========================================================================
// 4c. State-aware branding for CO
// ===========================================================================
describe("State-aware branding for CO", () => {
  it("_stateLabel returns Colorado Votes when state=co", () => {
    bootApp({ start: true, state: "co" });
    expect(window._stateLabel()).toBe("Colorado Votes");
  });

  it("_stateAbbr is CO for state=co", () => {
    bootApp({ start: true, state: "co" });
    expect(window._stateAbbr).toBe("CO");
  });

  it("_stateName is Colorado for state=co", () => {
    bootApp({ start: true, state: "co" });
    expect(window._stateName).toBe("Colorado");
  });

  it("_stateFullName is Colorado for state=co", () => {
    bootApp({ start: true, state: "co" });
    expect(window._stateFullName).toBe("Colorado");
  });

  it("_defaultParty is democrat for state=co", () => {
    bootApp({ start: true, state: "co" });
    expect(window._defaultParty).toBe("democrat");
  });

  it("_defaultCity is empty for state=co", () => {
    bootApp({ start: true, state: "co" });
    expect(window._defaultCity).toBe("");
  });
});

// ===========================================================================
// 4d. CO state code initialization
// ===========================================================================
describe("CO state code initialization", () => {
  it("initializes to co when _STATE='co'", () => {
    bootApp({ start: true, state: "co" });
    expect(S().stateCode).toBe("co");
  });

  it("persists co state in localStorage", () => {
    bootApp({ start: true, state: "co" });
    expect(localStorage.setItem).toHaveBeenCalledWith("tx_votes_state", "co");
  });
});

// ===========================================================================
// 5. handlePWA state injection
// ===========================================================================
describe("handlePWA state injection", () => {
  it("injects _STATE='tx' for TX", async () => {
    const res = handlePWA("tx");
    const body = await res.text();
    expect(body).toContain('var _STATE="tx"');
    expect(body).toContain('var _APP_BASE="/tx/app"');
    expect(body).toContain("<title>Texas Votes</title>");
  });

  it("injects _STATE='dc' for DC", async () => {
    const res = handlePWA("dc");
    const body = await res.text();
    expect(body).toContain('var _STATE="dc"');
    expect(body).toContain('var _APP_BASE="/dc/app"');
    expect(body).toContain("<title>DC Votes</title>");
  });

  it("rewrites API paths for DC", async () => {
    const res = handlePWA("dc");
    const body = await res.text();
    expect(body).toContain("/dc/app/api/");
  });

  it("rewrites meta tags for DC", async () => {
    const res = handlePWA("dc");
    const body = await res.text();
    expect(body).toContain('content="DC Votes');
    expect(body).toContain("Washington DC elections");
  });

  it("injects _STATE='co' for CO", async () => {
    const res = handlePWA("co");
    const body = await res.text();
    expect(body).toContain('var _STATE="co"');
    expect(body).toContain('var _APP_BASE="/co/app"');
    expect(body).toContain("<title>Colorado Votes</title>");
  });

  it("rewrites API paths for CO", async () => {
    const res = handlePWA("co");
    const body = await res.text();
    expect(body).toContain("/co/app/api/");
  });

  it("keeps Texas branding for TX", async () => {
    const res = handlePWA("tx");
    const body = await res.text();
    expect(body).toContain("<title>Texas Votes</title>");
    expect(body).toContain("Texas elections");
  });
});

// ===========================================================================
// 6. handlePWA_Manifest state injection
// ===========================================================================
describe("handlePWA_Manifest state injection", () => {
  it("returns Texas Votes manifest for TX", async () => {
    const res = handlePWA_Manifest("tx");
    const manifest = await res.json();
    expect(manifest.name).toBe("Texas Votes");
    expect(manifest.short_name).toBe("TX Votes");
    expect(manifest.start_url).toBe("/tx/app");
  });

  it("returns DC Votes manifest for DC", async () => {
    const res = handlePWA_Manifest("dc");
    const manifest = await res.json();
    expect(manifest.name).toBe("DC Votes");
    expect(manifest.short_name).toBe("DC Votes");
    expect(manifest.start_url).toBe("/dc/app");
  });

  it("returns Colorado Votes manifest for CO", async () => {
    const res = handlePWA_Manifest("co");
    const manifest = await res.json();
    expect(manifest.name).toBe("Colorado Votes");
    expect(manifest.short_name).toBe("CO Votes");
    expect(manifest.start_url).toBe("/co/app");
  });

  it("description mentions Colorado for CO", async () => {
    const res = handlePWA_Manifest("co");
    const manifest = await res.json();
    expect(manifest.description).toContain("Colorado");
  });

  it("description mentions Washington DC for DC", async () => {
    const res = handlePWA_Manifest("dc");
    const manifest = await res.json();
    expect(manifest.description).toContain("Washington DC");
  });
});

// ===========================================================================
// 7. Spanish translations for new DC strings
// ===========================================================================
describe("Spanish translations for DC strings", () => {
  it("TR dictionary contains DC Primary translation", () => {
    expect(APP_JS).toContain("'DC Primary \\u2014 June 16, 2026'");
    expect(APP_JS).toContain("Primaria de DC");
  });

  it("TR dictionary contains Closed Primary translation", () => {
    expect(APP_JS).toContain("'Closed Primary:'");
    expect(APP_JS).toContain("Primaria cerrada");
  });

  it("TR dictionary contains DC voter ID translation", () => {
    expect(APP_JS).toContain("DC does not require photo ID");
    expect(APP_JS).toContain("DC no requiere");
  });

  it("TR dictionary contains DC early voting translation", () => {
    expect(APP_JS).toContain("Vote at any early voting location in DC.");
    expect(APP_JS).toContain("Vota en cualquier lugar de votaci");
  });

  it("TR dictionary contains Built with translation", () => {
    expect(APP_JS).toContain("'Built with'");
    expect(APP_JS).toContain("'Hecho con'");
  });

  it("TR dictionary contains June 16 date translation", () => {
    expect(APP_JS).toContain("'June 16, 2026'");
    expect(APP_JS).toContain("16 de junio");
  });

  it("TR dictionary contains state info translation", () => {
    expect(APP_JS).toContain("'State info'");
    expect(APP_JS).toContain("'Info estatal'");
  });
});

// ===========================================================================
// 8. Address reset preserves state defaults
// ===========================================================================
describe("Address reset preserves state defaults", () => {
  it("TX defaults: state=TX, city=empty", () => {
    bootApp({ start: true, state: "tx" });
    expect(window._stateAbbr).toBe("TX");
    expect(window._defaultCity).toBe("");
  });

  it("DC defaults: state=DC, city=Washington", () => {
    bootApp({ start: true, state: "dc" });
    expect(window._stateAbbr).toBe("DC");
    expect(window._defaultCity).toBe("Washington");
  });

  it("DC default party is democrat", () => {
    bootApp({ start: true, state: "dc" });
    expect(window._defaultParty).toBe("democrat");
  });

  it("TX default party is republican", () => {
    bootApp({ start: true, state: "tx" });
    expect(window._defaultParty).toBe("republican");
  });

  it("CO defaults: state=CO, city=empty", () => {
    bootApp({ start: true, state: "co" });
    expect(window._stateAbbr).toBe("CO");
    expect(window._defaultCity).toBe("");
  });

  it("CO default party is democrat", () => {
    bootApp({ start: true, state: "co" });
    expect(window._defaultParty).toBe("democrat");
  });
});

// ===========================================================================
// 9. Election date awareness
// ===========================================================================
describe("Election date awareness", () => {
  it("APP_JS contains TX, DC, and CO election date constructors", () => {
    expect(APP_JS).toContain("new Date(2026,2,3)"); // March 3 TX
    expect(APP_JS).toContain("new Date(2026,5,16)"); // June 16 DC
    expect(APP_JS).toContain("new Date(2026,5,23)"); // June 23 CO
  });

  it("TX save sets election date to 2026-03-03", () => {
    bootApp({ start: true, state: "tx" });
    window.save();
    expect(localStorage.setItem).toHaveBeenCalledWith("tx_votes_election_date", "2026-03-03");
  });

  it("DC save sets election date to 2026-06-16", () => {
    bootApp({ start: true, state: "dc" });
    window.save();
    expect(localStorage.setItem).toHaveBeenCalledWith("tx_votes_election_date", "2026-06-16");
  });

  it("CO save sets election date to 2026-06-23", () => {
    bootApp({ start: true, state: "co" });
    window.save();
    expect(localStorage.setItem).toHaveBeenCalledWith("tx_votes_election_date", "2026-06-23");
  });
});

// ===========================================================================
// 10. Vote Info state-aware content
// ===========================================================================
describe("Vote Info state-aware content in APP_JS", () => {
  it("contains closed primary text for DC", () => {
    expect(APP_JS).toContain("Closed Primary:");
    expect(APP_JS).toContain("DC has closed primaries");
  });

  it("contains open primary text for TX", () => {
    expect(APP_JS).toContain("Open Primary:");
    expect(APP_JS).toContain("Texas has open primaries");
  });

  it("contains DC Board of Elections URL", () => {
    expect(APP_JS).toContain("dcboe.org");
  });

  it("contains DC voter ID info", () => {
    expect(APP_JS).toContain("DC does not require photo ID to vote");
  });

  it("contains DC early voting dates", () => {
    expect(APP_JS).toContain("Jun 5 \\u2013 13, 2026");
  });

  it("contains DC registration deadline", () => {
    expect(APP_JS).toContain("May 18, 2026");
  });
});

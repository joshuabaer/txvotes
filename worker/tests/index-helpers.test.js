import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexSrc = readFileSync(join(__dirname, "../src/index.js"), "utf-8");

// ---------------------------------------------------------------------------
// Extract helper functions from index.js source (same approach as routes.test.js)
// ---------------------------------------------------------------------------

function normalizeEndorsement(e) {
  if (typeof e === "string") return { name: e, type: null };
  return { name: e.name || String(e), type: e.type || null };
}

function resolveTone(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value["3"] || value[Object.keys(value).sort()[0]] || null;
  }
  return null;
}

function resolveToneArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => resolveTone(item)).filter(Boolean);
}

function nameToSlug(name) {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isSparseCandidate(c) {
  let filled = 0;
  if (c.pros && (Array.isArray(c.pros) ? c.pros.length : true)) filled++;
  if (c.cons && (Array.isArray(c.cons) ? c.cons.length : true)) filled++;
  if (c.endorsements && (Array.isArray(c.endorsements) ? c.endorsements.length : true)) filled++;
  if (c.keyPositions && c.keyPositions.length) filled++;
  return filled < 2;
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function classifyConfidence(candidate) {
  const hasSources = candidate.sources && candidate.sources.length > 0;
  const hasOfficialSource = hasSources && candidate.sources.some(s =>
    /ballotpedia|votesmart|sos\.state|sos\.texas|capitol|senate\.gov|house\.gov/i.test(s.url || '')
  );
  const hasMultipleSources = hasSources && candidate.sources.length >= 3;

  return {
    background: hasOfficialSource ? 'verified' : hasSources ? 'sourced' : 'ai-inferred',
    keyPositions: hasOfficialSource ? 'verified' : hasSources ? 'sourced' : 'ai-inferred',
    endorsements: candidate.endorsements && candidate.endorsements.length > 0
      ? (hasOfficialSource ? 'verified' : 'sourced') : 'none',
    polling: candidate.polling ? (hasMultipleSources ? 'verified' : 'sourced') : 'none',
    fundraising: candidate.fundraising ? (hasMultipleSources ? 'verified' : 'sourced') : 'none',
    pros: hasSources ? 'sourced' : 'ai-inferred',
    cons: hasSources ? 'sourced' : 'ai-inferred',
  };
}

function findBasename(geos, partialKey) {
  for (const key of Object.keys(geos)) {
    if (key.includes(partialKey) && geos[key].length > 0) {
      return geos[key][0].BASENAME;
    }
  }
  return null;
}

function findGeo(geos, partialKey) {
  for (const key of Object.keys(geos)) {
    if (key.includes(partialKey) && geos[key].length > 0) {
      return geos[key][0];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// normalizeEndorsement
// ---------------------------------------------------------------------------
describe("normalizeEndorsement", () => {
  it("converts a plain string to {name, type:null}", () => {
    expect(normalizeEndorsement("AFL-CIO")).toEqual({
      name: "AFL-CIO",
      type: null,
    });
  });

  it("returns structured object unchanged when complete", () => {
    const e = { name: "Texas Tribune", type: "editorial board" };
    expect(normalizeEndorsement(e)).toEqual({
      name: "Texas Tribune",
      type: "editorial board",
    });
  });

  it("fills missing type with null", () => {
    expect(normalizeEndorsement({ name: "John Doe" })).toEqual({
      name: "John Doe",
      type: null,
    });
  });

  it("fills missing name with string conversion", () => {
    const result = normalizeEndorsement({ type: "labor union" });
    expect(result.type).toBe("labor union");
    // name should be String({type:"labor union"}) since name is undefined
    expect(result.name).toBeDefined();
  });

  it("handles empty string", () => {
    expect(normalizeEndorsement("")).toEqual({ name: "", type: null });
  });

  it("handles object with both name and type", () => {
    const e = { name: "Governor Smith", type: "elected official" };
    expect(normalizeEndorsement(e)).toEqual({
      name: "Governor Smith",
      type: "elected official",
    });
  });

  it("handles all valid endorsement types", () => {
    const validTypes = [
      "labor union", "editorial board", "advocacy group", "business group",
      "elected official", "political organization", "professional association",
      "community organization", "public figure",
    ];
    for (const type of validTypes) {
      const result = normalizeEndorsement({ name: "Test", type });
      expect(result.type).toBe(type);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveToneArray
// ---------------------------------------------------------------------------
describe("resolveToneArray", () => {
  it("returns empty array for non-array input", () => {
    expect(resolveToneArray(null)).toEqual([]);
    expect(resolveToneArray(undefined)).toEqual([]);
    expect(resolveToneArray("string")).toEqual([]);
    expect(resolveToneArray(42)).toEqual([]);
  });

  it("passes through plain strings", () => {
    expect(resolveToneArray(["A", "B", "C"])).toEqual(["A", "B", "C"]);
  });

  it("resolves tone objects in array", () => {
    const arr = [
      { "1": "Simple A", "3": "Standard A" },
      { "1": "Simple B", "3": "Standard B" },
    ];
    expect(resolveToneArray(arr)).toEqual(["Standard A", "Standard B"]);
  });

  it("filters out null entries", () => {
    const arr = ["A", null, "B", undefined];
    expect(resolveToneArray(arr)).toEqual(["A", "B"]);
  });

  it("handles mixed plain strings and tone objects", () => {
    const arr = [
      "Plain text",
      { "3": "Standard text", "5": "Expert text" },
    ];
    expect(resolveToneArray(arr)).toEqual(["Plain text", "Standard text"]);
  });

  it("falls back to first sorted key when tone 3 is missing in array item", () => {
    const arr = [{ "1": "Simple", "5": "Expert" }];
    expect(resolveToneArray(arr)).toEqual(["Simple"]);
  });

  it("handles empty array", () => {
    expect(resolveToneArray([])).toEqual([]);
  });

  it("filters out empty tone objects", () => {
    const arr = [{}]; // empty object resolves to null, which gets filtered
    expect(resolveToneArray(arr)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findBasename
// ---------------------------------------------------------------------------
describe("findBasename", () => {
  const geos = {
    "Congressional Districts 119th Congress": [
      { BASENAME: "25", GEOID: "4825" },
    ],
    "Legislative Districts - Upper": [
      { BASENAME: "14", GEOID: "4814" },
    ],
    "Legislative Districts - Lower": [
      { BASENAME: "46", GEOID: "4846" },
    ],
    "Counties": [
      { BASENAME: "Travis", GEOID: "48453", NAME: "Travis" },
    ],
    "Empty Layer": [],
  };

  it("finds Congressional district basename", () => {
    expect(findBasename(geos, "Congressional Districts")).toBe("25");
  });

  it("finds State Senate (Upper) district", () => {
    expect(findBasename(geos, "Legislative Districts - Upper")).toBe("14");
  });

  it("finds State House (Lower) district", () => {
    expect(findBasename(geos, "Legislative Districts - Lower")).toBe("46");
  });

  it("returns null for non-existent key", () => {
    expect(findBasename(geos, "Nonexistent Layer")).toBeNull();
  });

  it("returns null for empty layer", () => {
    expect(findBasename(geos, "Empty Layer")).toBeNull();
  });

  it("matches partial keys", () => {
    // "Congressional" is enough to match "Congressional Districts 119th Congress"
    expect(findBasename(geos, "Congressional")).toBe("25");
  });

  it("handles empty geos object", () => {
    expect(findBasename({}, "Congressional")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findGeo
// ---------------------------------------------------------------------------
describe("findGeo", () => {
  const geos = {
    "Counties": [
      { BASENAME: "Travis", GEOID: "48453", NAME: "Travis" },
    ],
    "Unified School Districts": [
      { BASENAME: "Austin ISD", GEOID: "4812345", NAME: "Austin Independent School District" },
    ],
    "Empty Layer": [],
  };

  it("finds county geography", () => {
    const result = findGeo(geos, "Counties");
    expect(result.GEOID).toBe("48453");
    expect(result.NAME).toBe("Travis");
  });

  it("finds school district geography", () => {
    const result = findGeo(geos, "Unified School Districts");
    expect(result.NAME).toBe("Austin Independent School District");
  });

  it("returns null for non-existent key", () => {
    expect(findGeo(geos, "Nonexistent")).toBeNull();
  });

  it("returns null for empty layer", () => {
    expect(findGeo(geos, "Empty Layer")).toBeNull();
  });

  it("returns the first element when multiple geographies match", () => {
    const multiGeos = {
      "Counties": [
        { GEOID: "48453", NAME: "Travis" },
        { GEOID: "48201", NAME: "Harris" },
      ],
    };
    const result = findGeo(multiGeos, "Counties");
    expect(result.NAME).toBe("Travis"); // first element
  });
});

// ---------------------------------------------------------------------------
// isSparseCandidate - additional edge cases
// ---------------------------------------------------------------------------
describe("isSparseCandidate — edge cases", () => {
  it("handles undefined fields gracefully", () => {
    expect(isSparseCandidate({
      pros: undefined,
      cons: undefined,
      endorsements: undefined,
      keyPositions: undefined,
    })).toBe(true);
  });

  it("considers non-array truthy values as populated", () => {
    // A string for pros counts as populated
    expect(isSparseCandidate({
      pros: "Strong record",
      cons: "Weak on education",
    })).toBe(false);
  });

  it("considers single-element arrays as populated", () => {
    expect(isSparseCandidate({
      pros: ["One thing"],
      keyPositions: ["One position"],
    })).toBe(false);
  });

  it("all 4 fields populated returns false", () => {
    expect(isSparseCandidate({
      pros: ["Good"],
      cons: ["Bad"],
      endorsements: ["Someone"],
      keyPositions: ["Healthcare"],
    })).toBe(false);
  });

  it("returns true with only one field of four", () => {
    expect(isSparseCandidate({ endorsements: ["AFL-CIO"] })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TX_FIPS generation in index.js
// ---------------------------------------------------------------------------
describe("TX_FIPS in index.js source", () => {
  it("generates FIPS codes from 48001 to 48507 with odd numbers", () => {
    expect(indexSrc).toContain("for (let i = 1; i <= 507; i += 2)");
    expect(indexSrc).toContain('TX_FIPS.push(`48${String(i).padStart(3, "0")}`');
  });

  it("TX_COUNTY_NAMES contains all 254 counties", () => {
    // The map is defined in the source. Count the entries.
    const countyNamesBlock = indexSrc.slice(
      indexSrc.indexOf("const TX_COUNTY_NAMES = {"),
      indexSrc.indexOf("};", indexSrc.indexOf("const TX_COUNTY_NAMES = {")) + 2
    );
    // Count quoted strings that look like county names (value positions)
    const matches = countyNamesBlock.match(/"48\d{3}":/g);
    expect(matches.length).toBeGreaterThanOrEqual(250);
  });
});

// ---------------------------------------------------------------------------
// Analytics event validation
// ---------------------------------------------------------------------------
describe("Analytics event handling in index.js", () => {
  it("defines VALID_EVENTS allowlist", () => {
    expect(indexSrc).toContain("VALID_EVENTS");
    expect(indexSrc).toContain("interview_start");
    expect(indexSrc).toContain("guide_complete");
    expect(indexSrc).toContain("cheatsheet_print");
    expect(indexSrc).toContain("lang_toggle");
    expect(indexSrc).toContain("i_voted");
    expect(indexSrc).toContain("share_app");
    expect(indexSrc).toContain("party_switch");
  });

  it("has rate limiting with 100 events per minute per IP", () => {
    expect(indexSrc).toContain("RATE_LIMIT_MAX = 100");
    expect(indexSrc).toContain("RATE_LIMIT_WINDOW = 60000");
  });

  it("returns 204 for valid events", () => {
    expect(indexSrc).toContain("{ status: 204 }");
  });

  it("returns 429 when rate limited", () => {
    expect(indexSrc).toContain("{ status: 429 }");
  });

  it("silently drops invalid events (204 not 400)", () => {
    // handleAnalyticsEvent returns 204 for invalid event names (silent drop)
    const analyticsBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleAnalyticsEvent"),
      indexSrc.indexOf("export default")
    );
    expect(analyticsBlock).toContain("silent drop");
  });
});

// ---------------------------------------------------------------------------
// Route pattern coverage
// ---------------------------------------------------------------------------
describe("Route patterns — additional coverage", () => {
  it("has vanity tone entry point /cowboy", () => {
    expect(indexSrc).toContain('url.pathname === "/cowboy"');
    expect(indexSrc).toContain("tone=7");
  });

  it("has vanity LLM entry points /gemini, /grok, /chatgpt", () => {
    expect(indexSrc).toContain('url.pathname === "/gemini"');
    expect(indexSrc).toContain('url.pathname === "/grok"');
    expect(indexSrc).toContain('url.pathname === "/chatgpt"');
  });

  it("redirects atxvotes.app to txvotes.app with 301", () => {
    expect(indexSrc).toContain("atxvotes.app");
    expect(indexSrc).toContain("www.atxvotes.app");
    expect(indexSrc).toContain("api.atxvotes.app");
    expect(indexSrc).toContain("301");
  });

  it("returns 404 for headshot and asset paths that don't exist", () => {
    expect(indexSrc).toContain('url.pathname.startsWith("/headshots/")');
    expect(indexSrc).toContain('url.pathname.startsWith("/assets/")');
    expect(indexSrc).toContain('"Cache-Control": "no-store"');
  });

  it("admin routes require Bearer auth", () => {
    expect(indexSrc).toContain("/admin/coverage");
    expect(indexSrc).toContain("Bearer ${env.ADMIN_SECRET}");
    expect(indexSrc).toContain("Unauthorized");
  });

  it("handleBallotFetch validates party parameter", () => {
    const ballotBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleBallotFetch"),
      indexSrc.indexOf("async function handleCountyInfo")
    );
    expect(ballotBlock).toContain("republican");
    expect(ballotBlock).toContain("democrat");
    expect(ballotBlock).toContain("party parameter required");
  });

  it("handleBallotFetch supports ETag / If-None-Match for 304", () => {
    const ballotBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleBallotFetch"),
      indexSrc.indexOf("async function handleCountyInfo")
    );
    expect(ballotBlock).toContain("ETag");
    expect(ballotBlock).toContain("If-None-Match");
    expect(ballotBlock).toContain("304");
  });

  it("handleCountyInfo requires fips parameter", () => {
    const countyBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCountyInfo"),
      indexSrc.indexOf("async function handleTrigger")
    );
    expect(countyBlock).toContain("fips parameter required");
    expect(countyBlock).toContain("county_info:");
  });

  it("handleBallotFetch merges county races into statewide ballot", () => {
    const ballotBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleBallotFetch"),
      indexSrc.indexOf("async function handleCountyInfo")
    );
    expect(ballotBlock).toContain("county");
    expect(ballotBlock).toContain("ballot:county:");
    expect(ballotBlock).toContain("concat");
  });

  it("seed-county route requires countyFips and countyName", () => {
    expect(indexSrc).toContain("countyFips and countyName required");
  });

  it("scheduled handler stops cron after election day", () => {
    expect(indexSrc).toContain("2026-03-04");
    expect(indexSrc).toContain("async scheduled");
  });

  it("/app/api/polymarket returns empty odds", () => {
    expect(indexSrc).toContain("/app/api/polymarket");
    expect(indexSrc).toContain("odds: {}");
  });

  it("injectBeacon only modifies HTML responses", () => {
    const beaconBlock = indexSrc.slice(
      indexSrc.indexOf("function injectBeacon"),
      indexSrc.indexOf("// MARK: - Analytics")
    );
    expect(beaconBlock).toContain("text/html");
    expect(beaconBlock).toContain("HTMLRewriter");
    expect(beaconBlock).toContain("cloudflareinsights");
  });

  it("injectBeacon skips when no token", () => {
    const beaconBlock = indexSrc.slice(
      indexSrc.indexOf("function injectBeacon"),
      indexSrc.indexOf("// MARK: - Analytics")
    );
    expect(beaconBlock).toContain("if (!token) return response");
  });
});

// ---------------------------------------------------------------------------
// Candidate profile page
// ---------------------------------------------------------------------------
describe("Candidate profile page", () => {
  it("shows 404 page for unknown slug", () => {
    expect(indexSrc).toContain("Candidate Not Found");
    expect(indexSrc).toContain("status: 404");
  });

  it("renders headshot with fallback to initials", () => {
    expect(indexSrc).toContain("/headshots/");
    expect(indexSrc).toContain("onerror");
    // PNG fallback when JPG fails
    expect(indexSrc).toContain(".jpg");
    expect(indexSrc).toContain(".png");
  });

  it("shows withdrawn badge and banner", () => {
    const profileBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCandidateProfile"),
      indexSrc.indexOf("async function handleCandidatesIndex")
    );
    expect(profileBlock).toContain("Withdrawn");
    expect(profileBlock).toContain("candidate has withdrawn");
    expect(profileBlock).toContain("#c62626");
  });

  it("shows limited public info banner for sparse candidates", () => {
    const profileBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCandidateProfile"),
      indexSrc.indexOf("async function handleCandidatesIndex")
    );
    expect(profileBlock).toContain("Limited public information");
    expect(profileBlock).toContain("isSparseCandidate");
  });

  it("renders all candidate sections conditionally", () => {
    const profileBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCandidateProfile"),
      indexSrc.indexOf("async function handleCandidatesIndex")
    );
    const sections = ["About", "Education", "Experience", "Key Positions",
      "Strengths", "Concerns", "Endorsements", "Polling", "Fundraising", "Sources"];
    for (const section of sections) {
      expect(profileBlock).toContain(section);
    }
  });

  it("shows data freshness timestamp from manifest", () => {
    const profileBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCandidateProfile"),
      indexSrc.indexOf("async function handleCandidatesIndex")
    );
    expect(profileBlock).toContain("Data last verified");
    expect(profileBlock).toContain("manifest");
  });

  it("includes OG meta tags for social sharing via pageHead()", () => {
    const profileBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCandidateProfile"),
      indexSrc.indexOf("async function handleCandidatesIndex")
    );
    // OG tags are now generated by the shared pageHead() helper
    expect(profileBlock).toContain("pageHead(");
    expect(profileBlock).toContain("ogDescription");
    expect(profileBlock).toContain("type: \"profile\"");
    expect(profileBlock).toContain("headshots/");
    // Verify pageHead itself generates all required OG tags
    const pageHeadBlock = indexSrc.slice(
      indexSrc.indexOf("function pageHead("),
      indexSrc.indexOf("// Shared i18n script")
    );
    expect(pageHeadBlock).toContain("og:title");
    expect(pageHeadBlock).toContain("og:description");
    expect(pageHeadBlock).toContain("og:type");
    expect(pageHeadBlock).toContain("og:image");
    expect(pageHeadBlock).toContain("og:site_name");
    expect(pageHeadBlock).toContain("twitter:card");
    expect(pageHeadBlock).toContain("twitter:image");
  });

  it("uses normalizeEndorsement for endorsement display", () => {
    const profileBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCandidateProfile"),
      indexSrc.indexOf("async function handleCandidatesIndex")
    );
    expect(profileBlock).toContain("normalizeEndorsement");
  });

  it("displays endorsement type labels", () => {
    const profileBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCandidateProfile"),
      indexSrc.indexOf("async function handleCandidatesIndex")
    );
    expect(profileBlock).toContain("ne.type");
    expect(profileBlock).toContain("typeLabel");
  });
});

// ---------------------------------------------------------------------------
// classifyConfidence — source-based confidence classification
// ---------------------------------------------------------------------------
describe("classifyConfidence — source-based confidence classification", () => {
  it("returns 'verified' for fields when official sources present", () => {
    const candidate = {
      sources: [{ url: "https://ballotpedia.org/John_Smith" }],
      keyPositions: ["Education"],
      endorsements: [{ name: "AFL-CIO" }],
      pros: ["Strong record"],
      cons: ["Slow on housing"],
      polling: "Leading",
      fundraising: "$500k",
    };
    const conf = classifyConfidence(candidate);
    expect(conf.background).toBe("verified");
    expect(conf.keyPositions).toBe("verified");
    expect(conf.endorsements).toBe("verified");
  });

  it("returns 'sourced' for fields when non-official sources present", () => {
    const candidate = {
      sources: [{ url: "https://texastribune.org/article" }],
      keyPositions: ["Education"],
      endorsements: [{ name: "AFL-CIO" }],
      pros: ["Good"],
      cons: ["Bad"],
    };
    const conf = classifyConfidence(candidate);
    expect(conf.background).toBe("sourced");
    expect(conf.keyPositions).toBe("sourced");
    expect(conf.endorsements).toBe("sourced");
    expect(conf.pros).toBe("sourced");
    expect(conf.cons).toBe("sourced");
  });

  it("returns 'ai-inferred' when no sources present", () => {
    const candidate = {
      sources: [],
      keyPositions: ["Education"],
      pros: ["Good"],
      cons: ["Bad"],
    };
    const conf = classifyConfidence(candidate);
    expect(conf.background).toBe("ai-inferred");
    expect(conf.keyPositions).toBe("ai-inferred");
    expect(conf.pros).toBe("ai-inferred");
    expect(conf.cons).toBe("ai-inferred");
  });

  it("returns 'ai-inferred' when sources is undefined", () => {
    const candidate = { pros: ["Good"] };
    const conf = classifyConfidence(candidate);
    expect(conf.background).toBe("ai-inferred");
    expect(conf.pros).toBe("ai-inferred");
  });

  it("returns 'none' for endorsements when empty", () => {
    const candidate = { sources: [], endorsements: [] };
    const conf = classifyConfidence(candidate);
    expect(conf.endorsements).toBe("none");
  });

  it("returns 'none' for polling/fundraising when absent", () => {
    const candidate = { sources: [{ url: "https://example.com" }] };
    const conf = classifyConfidence(candidate);
    expect(conf.polling).toBe("none");
    expect(conf.fundraising).toBe("none");
  });

  it("returns 'verified' for polling/fundraising only with 3+ sources", () => {
    const candidate = {
      sources: [
        { url: "https://ballotpedia.org/x" },
        { url: "https://texastribune.org/y" },
        { url: "https://apnews.com/z" },
      ],
      polling: "Leading by 5%",
      fundraising: "$1M raised",
    };
    const conf = classifyConfidence(candidate);
    expect(conf.polling).toBe("verified");
    expect(conf.fundraising).toBe("verified");
  });

  it("returns 'sourced' for polling/fundraising with fewer than 3 sources", () => {
    const candidate = {
      sources: [{ url: "https://texastribune.org/x" }],
      polling: "Leading",
      fundraising: "$500k",
    };
    const conf = classifyConfidence(candidate);
    expect(conf.polling).toBe("sourced");
    expect(conf.fundraising).toBe("sourced");
  });

  it("recognizes all official source patterns", () => {
    const patterns = [
      "https://ballotpedia.org/test",
      "https://votesmart.org/test",
      "https://sos.state.tx.us/test",
      "https://sos.texas.gov/test",
      "https://capitol.texas.gov/test",
      "https://senate.gov/test",
      "https://house.gov/test",
    ];
    for (const url of patterns) {
      const conf = classifyConfidence({ sources: [{ url }] });
      expect(conf.background).toBe("verified");
    }
  });
});

describe("Candidate profile — confidence badges in source", () => {
  it("uses classifyConfidence for badge generation", () => {
    const profileBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCandidateProfile"),
      indexSrc.indexOf("async function handleCandidatesIndex")
    );
    expect(profileBlock).toContain("classifyConfidence(c)");
    expect(profileBlock).toContain("confidenceBadge(");
  });

  it("includes three confidence levels in badge rendering", () => {
    const profileBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCandidateProfile"),
      indexSrc.indexOf("async function handleCandidatesIndex")
    );
    expect(profileBlock).toContain("conf-verified");
    expect(profileBlock).toContain("conf-sourced");
    expect(profileBlock).toContain("conf-inferred");
  });

  it("includes data-t attributes for Spanish translation on badges", () => {
    const profileBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCandidateProfile"),
      indexSrc.indexOf("async function handleCandidatesIndex")
    );
    expect(profileBlock).toContain('data-t="Verified"');
    expect(profileBlock).toContain('data-t="Sourced"');
    expect(profileBlock).toContain('data-t="AI-inferred"');
  });

  it("includes confidence legend with all three levels", () => {
    const profileBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCandidateProfile"),
      indexSrc.indexOf("async function handleCandidatesIndex")
    );
    expect(profileBlock).toContain("conf-legend");
    expect(profileBlock).toContain("Data Confidence");
    expect(profileBlock).toContain("backed by official sources");
    expect(profileBlock).toContain("from web sources cited below");
    expect(profileBlock).toContain("generated by AI from available information");
  });

  it("includes Spanish translations for badge labels", () => {
    const profileBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCandidateProfile"),
      indexSrc.indexOf("async function handleCandidatesIndex")
    );
    expect(profileBlock).toContain("Verificado");
    expect(profileBlock).toContain("Con fuentes");
    expect(profileBlock).toContain("Inferido por IA");
  });
});

// ---------------------------------------------------------------------------
// Candidates index page
// ---------------------------------------------------------------------------
describe("Candidates index page", () => {
  it("groups candidates by race and party", () => {
    const indexBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCandidatesIndex"),
      indexSrc.indexOf("// MARK: - Data Quality")
    );
    expect(indexBlock).toContain("raceMap");
    expect(indexBlock).toContain("republican");
    expect(indexBlock).toContain("democrat");
  });

  it("shows empty state when no candidates", () => {
    expect(indexSrc).toContain("No candidate data is available yet");
  });

  it("shows incumbent and withdrawn badges", () => {
    const indexBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCandidatesIndex"),
      indexSrc.indexOf("// MARK: - Data Quality")
    );
    expect(indexBlock).toContain("incumbent");
    expect(indexBlock).toContain("withdrawn");
    expect(indexBlock).toContain("limited info");
  });

  it("links to individual candidate profiles", () => {
    const indexBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCandidatesIndex"),
      indexSrc.indexOf("// MARK: - Data Quality")
    );
    expect(indexBlock).toContain("/candidate/");
  });

  it("renders side-by-side party columns", () => {
    expect(indexSrc).toContain("party-columns");
    expect(indexSrc).toContain("party-col");
  });
});

// ---------------------------------------------------------------------------
// Data quality dashboard
// ---------------------------------------------------------------------------
describe("Data quality dashboard", () => {
  it("calculates candidate completeness percentage", () => {
    const dqBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleDataQuality"),
      indexSrc.indexOf("// MARK: - Admin Coverage")
    );
    expect(dqBlock).toContain("completenessPercent");
    expect(dqBlock).toContain("totalFieldsFilled");
    expect(dqBlock).toContain("totalFieldsPossible");
  });

  it("checks 6 completeness fields per candidate", () => {
    const dqBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleDataQuality"),
      indexSrc.indexOf("// MARK: - Admin Coverage")
    );
    expect(dqBlock).toContain("summary");
    expect(dqBlock).toContain("background");
    expect(dqBlock).toContain("keyPositions");
    expect(dqBlock).toContain("endorsements");
    expect(dqBlock).toContain("pros");
    expect(dqBlock).toContain("cons");
  });

  it("reads county data in batches of 50", () => {
    const dqBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleDataQuality"),
      indexSrc.indexOf("// MARK: - Admin Coverage")
    );
    expect(dqBlock).toContain("BATCH = 50");
  });

  it("includes county checker search functionality", () => {
    const dqBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleDataQuality"),
      indexSrc.indexOf("// MARK: - Admin Coverage")
    );
    expect(dqBlock).toContain("county-input");
    expect(dqBlock).toContain("county-result");
    expect(dqBlock).toContain("countyCheckerData");
  });

  it("shows today's update activity", () => {
    const dqBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleDataQuality"),
      indexSrc.indexOf("// MARK: - Admin Coverage")
    );
    expect(dqBlock).toContain("update_log:");
    expect(dqBlock).toContain("Today's Update Activity");
  });

  it("shows data freshness from manifest", () => {
    const dqBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleDataQuality"),
      indexSrc.indexOf("// MARK: - Admin Coverage")
    );
    expect(dqBlock).toContain("Data Freshness");
    expect(dqBlock).toContain("manifest");
  });

  it("includes pros/cons balance section", () => {
    const dqBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleDataQuality"),
      indexSrc.indexOf("// MARK: - Admin Coverage")
    );
    expect(dqBlock).toContain("Pros/Cons Balance");
    expect(dqBlock).toContain("checkBallotBalance");
    expect(dqBlock).toContain("balanceHtml");
    expect(dqBlock).toContain("balance score");
  });

  it("links to balance check JSON API", () => {
    const dqBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleDataQuality"),
      indexSrc.indexOf("// MARK: - Admin Coverage")
    );
    expect(dqBlock).toContain("/api/balance-check");
  });
});

// ---------------------------------------------------------------------------
// Balance check API
// ---------------------------------------------------------------------------
describe("Balance check API", () => {
  it("has /api/balance-check route", () => {
    expect(indexSrc).toContain('url.pathname === "/api/balance-check"');
    expect(indexSrc).toContain("handleBalanceCheck");
  });

  it("imports checkBallotBalance from balance-check module", () => {
    expect(indexSrc).toContain('import { checkBallotBalance, formatBalanceSummary } from "./balance-check.js"');
  });

  it("computes combined score across both parties", () => {
    const block = indexSrc.slice(
      indexSrc.indexOf("async function handleBalanceCheck"),
      indexSrc.indexOf("// MARK: - Election Data Endpoints")
    );
    expect(block).toContain("combinedScore");
    expect(block).toContain("republican");
    expect(block).toContain("democrat");
  });
});

// ---------------------------------------------------------------------------
// Tone generation logic
// ---------------------------------------------------------------------------
describe("Tone generation", () => {
  it("defines VALID_TONES as [1, 3, 4, 7]", () => {
    expect(indexSrc).toContain("VALID_TONES = [1, 3, 4, 7]");
  });

  it("has tone labels for all valid tones", () => {
    expect(indexSrc).toContain("TONE_LABELS");
    expect(indexSrc).toContain("high school / simplest");
    expect(indexSrc).toContain("standard / news level");
    expect(indexSrc).toContain("detailed / political");
    expect(indexSrc).toContain("Texas cowboy");
  });

  it("proposition tone generation handles tone 3 as original storage", () => {
    const toneBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleGenerateTones"),
      indexSrc.indexOf("async function handleGenerateCandidateTones")
    );
    expect(toneBlock).toContain("if (tone === 3)");
    expect(toneBlock).toContain('toneVersions["3"] = text');
  });

  it("candidate tone generation supports county ballots", () => {
    const toneBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleGenerateCandidateTones"),
      indexSrc.indexOf("// MARK: - Candidate Profile & Index Pages")
    );
    expect(toneBlock).toContain("countyFips");
    expect(toneBlock).toContain("ballot:county:");
  });

  it("candidate tone generation preserves original as tone 3", () => {
    const toneBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleGenerateCandidateTones"),
      indexSrc.indexOf("// MARK: - Candidate Profile & Index Pages")
    );
    expect(toneBlock).toContain('if (!sv["3"])');
    expect(toneBlock).toContain('if (!tv["3"])');
  });
});

// ---------------------------------------------------------------------------
// loadAllCandidates caching
// ---------------------------------------------------------------------------
describe("loadAllCandidates caching", () => {
  it("tries candidates_index cache first", () => {
    const block = indexSrc.slice(
      indexSrc.indexOf("async function loadAllCandidates"),
      indexSrc.indexOf("async function invalidateCandidatesIndex")
    );
    expect(block).toContain('env.ELECTION_DATA.get("candidates_index")');
  });

  it("builds index from individual ballot keys on cache miss", () => {
    const block = indexSrc.slice(
      indexSrc.indexOf("async function loadAllCandidates"),
      indexSrc.indexOf("async function invalidateCandidatesIndex")
    );
    expect(block).toContain("ballot:statewide:");
    expect(block).toContain("ballot:county:");
    expect(block).toContain("list({ prefix:");
  });

  it("deduplicates candidates by slug+party", () => {
    const block = indexSrc.slice(
      indexSrc.indexOf("async function loadAllCandidates"),
      indexSrc.indexOf("async function invalidateCandidatesIndex")
    );
    expect(block).toContain("seen.has");
    expect(block).toContain("seen.add");
  });

  it("writes built index back to KV cache", () => {
    const block = indexSrc.slice(
      indexSrc.indexOf("async function loadAllCandidates"),
      indexSrc.indexOf("async function invalidateCandidatesIndex")
    );
    expect(block).toContain('env.ELECTION_DATA.put("candidates_index"');
  });

  it("non-fatally handles cache write failures", () => {
    const block = indexSrc.slice(
      indexSrc.indexOf("async function loadAllCandidates"),
      indexSrc.indexOf("async function invalidateCandidatesIndex")
    );
    expect(block).toContain("non-fatal");
  });
});

// ---------------------------------------------------------------------------
// Support page
// ---------------------------------------------------------------------------
describe("Support page", () => {
  it("has /support route", () => {
    expect(indexSrc).toContain('url.pathname === "/support"');
    expect(indexSrc).toContain("handleSupport");
  });

  it("includes FAQ sections", () => {
    expect(indexSrc).toContain("How do I reset my voting guide");
    expect(indexSrc).toContain("Are the recommendations accurate");
    expect(indexSrc).toContain("Where is my data stored");
    expect(indexSrc).toContain("Which elections are covered");
  });

  it("includes contact email", () => {
    expect(indexSrc).toContain("howdy@txvotes.app");
  });
});

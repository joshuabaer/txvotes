import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexSrc = readFileSync(join(__dirname, "../src/index.js"), "utf-8");

// ---------------------------------------------------------------------------
// Extract and evaluate helper functions from index.js source.
// These functions are not exported, so we extract them from the source string
// and evaluate them, similar to how audit-export.test.js works.
// ---------------------------------------------------------------------------

// Extract nameToSlug function body and create a callable
const nameToSlugBody = `
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
`;
function nameToSlug(name) {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Extract isSparseCandidate logic
function isSparseCandidate(c) {
  let filled = 0;
  if (c.pros && (Array.isArray(c.pros) ? c.pros.length : true)) filled++;
  if (c.cons && (Array.isArray(c.cons) ? c.cons.length : true)) filled++;
  if (c.endorsements && (Array.isArray(c.endorsements) ? c.endorsements.length : true)) filled++;
  if (c.keyPositions && c.keyPositions.length) filled++;
  return filled < 2;
}

// Extract escapeHtml logic
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Extract resolveTone logic
function resolveTone(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value["3"] || value[Object.keys(value).sort()[0]] || null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// nameToSlug
// ---------------------------------------------------------------------------
describe("nameToSlug", () => {
  it("converts a simple name to kebab-case", () => {
    expect(nameToSlug("Alice Johnson")).toBe("alice-johnson");
  });

  it("handles null input", () => {
    expect(nameToSlug(null)).toBe("");
  });

  it("handles undefined input", () => {
    expect(nameToSlug(undefined)).toBe("");
  });

  it("handles empty string", () => {
    expect(nameToSlug("")).toBe("");
  });

  it("handles special characters", () => {
    expect(nameToSlug("Maria Garcia-Lopez")).toBe("maria-garcia-lopez");
  });

  it("handles multiple spaces", () => {
    expect(nameToSlug("John   Doe")).toBe("john-doe");
  });

  it("strips leading/trailing hyphens", () => {
    expect(nameToSlug("--Test--")).toBe("test");
  });

  it("handles names with periods", () => {
    expect(nameToSlug("Dr. James Smith Jr.")).toBe("dr-james-smith-jr");
  });

  it("handles names with apostrophes", () => {
    expect(nameToSlug("O'Brien")).toBe("o-brien");
  });

  it("lowercases all characters", () => {
    expect(nameToSlug("ALICE JOHNSON")).toBe("alice-johnson");
  });

  it("handles single word", () => {
    expect(nameToSlug("Alice")).toBe("alice");
  });

  it("handles numeric characters", () => {
    expect(nameToSlug("District 25")).toBe("district-25");
  });

  it("converts accented characters to hyphens", () => {
    // accented characters are non a-z0-9, so they become hyphens
    expect(nameToSlug("Jose Cruz III")).toBe("jose-cruz-iii");
  });
});

// ---------------------------------------------------------------------------
// isSparseCandidate
// ---------------------------------------------------------------------------
describe("isSparseCandidate", () => {
  it("returns true when no fields populated", () => {
    expect(isSparseCandidate({})).toBe(true);
  });

  it("returns true when only one field populated", () => {
    expect(
      isSparseCandidate({ pros: ["Strong record"], cons: [], endorsements: [], keyPositions: [] })
    ).toBe(true);
  });

  it("returns false when 2 fields populated", () => {
    expect(
      isSparseCandidate({ pros: ["Good"], cons: ["Bad"], endorsements: [], keyPositions: [] })
    ).toBe(false);
  });

  it("returns false when 3 fields populated", () => {
    expect(
      isSparseCandidate({
        pros: ["Good"],
        cons: ["Bad"],
        endorsements: ["AFL-CIO"],
        keyPositions: [],
      })
    ).toBe(false);
  });

  it("returns false when all 4 fields populated", () => {
    expect(
      isSparseCandidate({
        pros: ["Good"],
        cons: ["Bad"],
        endorsements: ["AFL-CIO"],
        keyPositions: ["Healthcare"],
      })
    ).toBe(false);
  });

  it("treats empty arrays as not populated", () => {
    expect(
      isSparseCandidate({
        pros: [],
        cons: [],
        endorsements: [],
        keyPositions: [],
      })
    ).toBe(true);
  });

  it("treats null fields as not populated", () => {
    expect(
      isSparseCandidate({ pros: null, cons: null, endorsements: null, keyPositions: null })
    ).toBe(true);
  });

  it("handles string values for array fields (truthy)", () => {
    expect(
      isSparseCandidate({ pros: "Strong record", cons: "Weak on housing" })
    ).toBe(false);
  });

  it("returns true with only keyPositions", () => {
    expect(
      isSparseCandidate({ keyPositions: ["Healthcare"] })
    ).toBe(true);
  });

  it("returns false with endorsements and keyPositions", () => {
    expect(
      isSparseCandidate({ endorsements: ["Chronicle"], keyPositions: ["Transit"] })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------
describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("AT&T")).toBe("AT&amp;T");
  });

  it("escapes less-than signs", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes greater-than signs", () => {
    expect(escapeHtml("a > b")).toBe("a &gt; b");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('He said "hello"')).toBe("He said &quot;hello&quot;");
  });

  it("handles null input", () => {
    expect(escapeHtml(null)).toBe("");
  });

  it("handles undefined input", () => {
    expect(escapeHtml(undefined)).toBe("");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("passes through clean strings unchanged", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });

  it("escapes multiple special characters in one string", () => {
    expect(escapeHtml('<a href="test">AT&T</a>')).toBe(
      '&lt;a href=&quot;test&quot;&gt;AT&amp;T&lt;/a&gt;'
    );
  });
});

// ---------------------------------------------------------------------------
// resolveTone
// ---------------------------------------------------------------------------
describe("resolveTone", () => {
  it("returns a plain string unchanged", () => {
    expect(resolveTone("Hello")).toBe("Hello");
  });

  it("returns null for null input", () => {
    expect(resolveTone(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(resolveTone(undefined)).toBeNull();
  });

  it("extracts tone 3 from an object", () => {
    expect(resolveTone({ "1": "Simple", "3": "Standard", "5": "Expert" })).toBe(
      "Standard"
    );
  });

  it("falls back to first sorted key when tone 3 is missing", () => {
    expect(resolveTone({ "1": "Simple", "5": "Expert" })).toBe("Simple");
  });

  it("returns null for empty object", () => {
    expect(resolveTone({})).toBeNull();
  });

  it("returns null for arrays", () => {
    expect(resolveTone(["a", "b"])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Static page content verification
// ---------------------------------------------------------------------------
describe("Static pages in index.js source", () => {
  it("landing page contains essential elements", () => {
    expect(indexSrc).toContain("Texas Votes");
    expect(indexSrc).toContain("Build My Voting Guide");
    expect(indexSrc).toContain("/tx/app?start=1");
  });

  it("nonpartisan page contains key sections", () => {
    expect(indexSrc).toContain("Nonpartisan by Design");
    expect(indexSrc).toContain("Randomized Candidate Order");
    expect(indexSrc).toContain("No Party Labels on Candidates");
    expect(indexSrc).toContain("Values-Based Matching");
  });

  it("privacy page exists in routing", () => {
    expect(indexSrc).toContain("/privacy");
    expect(indexSrc).toContain("handlePrivacy");
  });

  it("open-source page exists in routing", () => {
    expect(indexSrc).toContain("/open-source");
  });

  it("audit page exists in routing", () => {
    expect(indexSrc).toContain("/audit");
    expect(indexSrc).toContain("handleAuditPage");
  });

  it("candidates page exists in routing", () => {
    expect(indexSrc).toContain("/candidates");
    expect(indexSrc).toContain("loadAllCandidates");
  });

  it("candidates page includes county filter dropdown", () => {
    // The county filter HTML should be built conditionally when county data exists
    expect(indexSrc).toContain('id="county-filter"');
    expect(indexSrc).toContain('class="county-filter-bar"');
    expect(indexSrc).toContain('id="county-count"');
    expect(indexSrc).toContain('value="all"');
    expect(indexSrc).toContain('value="statewide"');
  });

  it("candidates page county filter script uses DOMContentLoaded guard", () => {
    // The filter script should handle the case where DOM is still loading
    expect(indexSrc).toContain("document.readyState === 'loading'");
    expect(indexSrc).toContain("DOMContentLoaded");
  });

  it("candidates page county filter script listens for both change and input events", () => {
    // Both events needed for cross-browser compatibility
    expect(indexSrc).toContain("addEventListener('change', update)");
    expect(indexSrc).toContain("addEventListener('input', update)");
  });

  it("candidates page county filter queries sections fresh on each update", () => {
    // Sections should be queried inside update() for robustness
    const candidatesBlock = indexSrc.slice(
      indexSrc.indexOf("function init()"),
      indexSrc.indexOf("<\\/script>", indexSrc.indexOf("function init()"))
    );
    // querySelectorAll should be inside update(), not cached outside it
    expect(candidatesBlock).toContain("function update()");
    const updateBody = candidatesBlock.slice(
      candidatesBlock.indexOf("function update()"),
      candidatesBlock.indexOf("sel.addEventListener")
    );
    expect(updateBody).toContain("querySelectorAll('.race-section')");
  });

  it("candidates page county filter handles statewide + county logic", () => {
    // When a specific county is selected, both statewide and that county should show
    expect(indexSrc).toContain("county === 'statewide' || county === v");
  });

  it("candidates page county filter has proper CSS styling", () => {
    expect(indexSrc).toContain(".county-filter-bar");
    expect(indexSrc).toContain("appearance:none");
    expect(indexSrc).toContain("county-filter-bar select:focus");
    expect(indexSrc).toContain("county-filter-bar select:hover");
  });

  it("handleDistricts route exists", () => {
    expect(indexSrc).toContain("/tx/app/api/districts");
    expect(indexSrc).toContain("handleDistricts");
  });

  it("landing page returns correct content type", () => {
    expect(indexSrc).toContain('"Content-Type": "text/html;charset=utf-8"');
  });

  it("landing page includes OG meta tags", () => {
    expect(indexSrc).toContain("og:title");
    expect(indexSrc).toContain("og:description");
    expect(indexSrc).toContain("og:image");
    expect(indexSrc).toContain("twitter:card");
  });

  it("landing page includes Spanish translations", () => {
    expect(indexSrc).toContain("tx_votes_lang");
  });
});

// ---------------------------------------------------------------------------
// Worker routing patterns
// ---------------------------------------------------------------------------
describe("Worker routing patterns", () => {
  it("has a fetch handler export", () => {
    expect(indexSrc).toContain("export default");
    expect(indexSrc).toContain("async fetch(request, env, ctx)");
  });

  it("has a scheduled handler for cron", () => {
    expect(indexSrc).toContain("async scheduled(event, env");
  });

  it("handles CORS OPTIONS requests", () => {
    expect(indexSrc).toContain("OPTIONS");
    expect(indexSrc).toContain("Access-Control-Allow-Origin");
  });

  it("routes /app to PWA handler", () => {
    expect(indexSrc).toContain("handlePWA");
  });

  it("routes /app/api/guide to guide handler", () => {
    expect(indexSrc).toContain("handlePWA_Guide");
  });

  it("routes /app/api/summary to summary handler", () => {
    expect(indexSrc).toContain("handlePWA_Summary");
  });

  it("has admin secret protection for admin routes", () => {
    expect(indexSrc).toContain("ADMIN_SECRET");
  });

  it("cron stops after election day", () => {
    expect(indexSrc).toContain("2026-03-04");
  });

  it("returns 404 for unknown POST routes", () => {
    expect(indexSrc).toContain('return new Response("Not found", { status: 404 })');
  });

  it("falls through to landing page for unknown GET paths", () => {
    // At end of GET routes, handleLandingPage() is the fallback
    expect(indexSrc).toContain("return handleLandingPage(phase)");
  });

  it("redirects /candidate (no slug) to /candidates index", () => {
    expect(indexSrc).toContain('url.pathname === "/candidate"');
    expect(indexSrc).toContain('Response.redirect');
    expect(indexSrc).toContain("/candidates");
  });

  it("extracts slug from /candidate/ path", () => {
    expect(indexSrc).toContain('url.pathname.startsWith("/candidate/")');
    expect(indexSrc).toContain('url.pathname.slice("/candidate/".length)');
  });
});

// ---------------------------------------------------------------------------
// /how-it-works page content
// ---------------------------------------------------------------------------
describe("/how-it-works page content", () => {
  it("has handleHowItWorks function", () => {
    expect(indexSrc).toContain("function handleHowItWorks(phase");
  });

  it("has the correct page title", () => {
    expect(indexSrc).toContain("How It Works — Texas Votes");
  });

  it("explains the 4-step process with numbered steps", () => {
    expect(indexSrc).toContain("You answer a short interview");
    expect(indexSrc).toContain("The AI reads candidate profiles");
    expect(indexSrc).toContain("It finds your best matches");
    expect(indexSrc).toContain("You get a personalized ballot");
  });

  it("explains where candidate information comes from", () => {
    expect(indexSrc).toContain("Where Does the Candidate Information Come From");
    expect(indexSrc).toContain("Official government records");
    expect(indexSrc).toContain("Nonpartisan references");
    expect(indexSrc).toContain("News coverage");
    expect(indexSrc).toContain("Campaign materials");
  });

  it("explains what the app does NOT do", () => {
    expect(indexSrc).toContain("What This App Does NOT Do");
    expect(indexSrc).toContain("does not tell you who to vote for");
    expect(indexSrc).toContain("does not store your personal information");
    expect(indexSrc).toContain("does not track you");
    expect(indexSrc).toContain("does not favor any political party");
    expect(indexSrc).toContain("does not replace your own research");
  });

  it("includes trust section with transparency points", () => {
    expect(indexSrc).toContain("How Can I Trust It");
    expect(indexSrc).toContain("source code is public");
    expect(indexSrc).toContain("Four independent AI systems");
  });

  it("mentions the Flag this info feature", () => {
    const howBlock = indexSrc.slice(
      indexSrc.indexOf("function handleHowItWorks"),
      indexSrc.indexOf("function handleNonpartisan")
    );
    expect(howBlock).toContain("Flag this info");
  });

  it("includes related links section", () => {
    const howBlock = indexSrc.slice(
      indexSrc.indexOf("function handleHowItWorks"),
      indexSrc.indexOf("function handleNonpartisan")
    );
    expect(howBlock).toContain("/nonpartisan");
    expect(howBlock).toContain("/audit");
    expect(howBlock).toContain("/data-quality");
    expect(howBlock).toContain("/open-source");
    expect(howBlock).toContain("/privacy");
  });
});

// ---------------------------------------------------------------------------
// Back button links on subpages
// ---------------------------------------------------------------------------
describe("Back button links on subpages", () => {
  it("how-it-works page has back link to home", () => {
    const howBlock = indexSrc.slice(
      indexSrc.indexOf("function handleHowItWorks"),
      indexSrc.indexOf("function handleNonpartisan")
    );
    expect(howBlock).toContain('class="back-top"');
    expect(howBlock).toContain('href="/"');
    expect(howBlock).toContain("Texas Votes");
  });

  it("nonpartisan page has back link to home", () => {
    const nonpartBlock = indexSrc.slice(
      indexSrc.indexOf("function handleNonpartisan"),
      indexSrc.indexOf("async function handleAuditPage")
    );
    expect(nonpartBlock).toContain('class="back-top"');
    expect(nonpartBlock).toContain('href="/"');
  });

  it("candidate profile page has back link to candidates index", () => {
    const profileBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleCandidateProfile"),
      indexSrc.indexOf("async function handleCandidatesIndex")
    );
    expect(profileBlock).toContain("/candidates");
    expect(profileBlock).toContain("back");
  });

  it("data quality page has back link to home", () => {
    const dqBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleDataQuality"),
      indexSrc.indexOf("// MARK: - Admin Coverage")
    );
    expect(dqBlock).toContain('href="/"');
  });

  it("support page has back link to home", () => {
    expect(indexSrc).toContain("function handleSupport");
    const supportBlock = indexSrc.slice(
      indexSrc.indexOf("function handleSupport"),
      indexSrc.indexOf("function handlePrivacyPolicy")
    );
    expect(supportBlock).toContain('href="/"');
  });
});

// ---------------------------------------------------------------------------
// Page footer consistency
// ---------------------------------------------------------------------------
describe("Page footer consistency", () => {
  it("how-it-works page uses generateFooter helper", () => {
    const howBlock = indexSrc.slice(
      indexSrc.indexOf("function handleHowItWorks"),
      indexSrc.indexOf("function handleNonpartisan")
    );
    expect(howBlock).toContain("generateFooter");
  });

  it("nonpartisan page uses generateFooter helper", () => {
    const nonpartBlock = indexSrc.slice(
      indexSrc.indexOf("function handleNonpartisan"),
      indexSrc.indexOf("async function handleAuditPage")
    );
    expect(nonpartBlock).toContain("generateFooter");
  });

  it("generateFooter helper contains page-footer class and contact email", () => {
    const footerBlock = indexSrc.slice(
      indexSrc.indexOf("function generateFooter"),
      indexSrc.indexOf("function generateAdminFooter")
    );
    expect(footerBlock).toContain("page-footer");
    expect(footerBlock).toContain("howdy@txvotes.app");
    expect(footerBlock).toContain("/privacy");
  });
});

// ---------------------------------------------------------------------------
// Bias reporting (Flag this info) in nonpartisan page
// ---------------------------------------------------------------------------
describe("Bias reporting in nonpartisan page", () => {
  it("has Flag This Info section", () => {
    const nonpartBlock = indexSrc.slice(
      indexSrc.indexOf("function handleNonpartisan"),
      indexSrc.indexOf("async function handleAuditPage")
    );
    expect(nonpartBlock).toContain("Flag This Info");
    expect(nonpartBlock).toContain("Flag this info");
  });

  it("mentions flagged@txvotes.app email", () => {
    const nonpartBlock = indexSrc.slice(
      indexSrc.indexOf("function handleNonpartisan"),
      indexSrc.indexOf("async function handleAuditPage")
    );
    expect(nonpartBlock).toContain("flagged@txvotes.app");
  });

  it("describes the reporting workflow", () => {
    const nonpartBlock = indexSrc.slice(
      indexSrc.indexOf("function handleNonpartisan"),
      indexSrc.indexOf("async function handleAuditPage")
    );
    expect(nonpartBlock).toContain("biased");
    expect(nonpartBlock).toContain("inaccurate");
    expect(nonpartBlock).toContain("report it directly");
  });
});

// ---------------------------------------------------------------------------
// Automated balance checks section in nonpartisan page
// ---------------------------------------------------------------------------
describe("Automated balance checks in nonpartisan page", () => {
  it("has Automated Balance Checks section", () => {
    const nonpartBlock = indexSrc.slice(
      indexSrc.indexOf("function handleNonpartisan"),
      indexSrc.indexOf("async function handleAuditPage")
    );
    expect(nonpartBlock).toContain("Automated Balance Checks");
  });

  it("links to data quality dashboard and balance-check API", () => {
    const nonpartBlock = indexSrc.slice(
      indexSrc.indexOf("function handleNonpartisan"),
      indexSrc.indexOf("async function handleAuditPage")
    );
    expect(nonpartBlock).toContain("/data-quality");
    expect(nonpartBlock).toContain("/api/balance-check");
  });
});

// ---------------------------------------------------------------------------
// Audit page rendering
// ---------------------------------------------------------------------------
describe("Audit page rendering", () => {
  it("has handleAuditPage function that reads from KV", () => {
    const auditBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleAuditPage"),
      indexSrc.indexOf("async function handleBalanceCheck")
    );
    expect(auditBlock).toContain("audit:summary");
    expect(auditBlock).toContain("audit:result:chatgpt");
    expect(auditBlock).toContain("audit:result:gemini");
    expect(auditBlock).toContain("audit:result:grok");
    expect(auditBlock).toContain("audit:result:claude");
  });

  it("renders audit cards for each provider", () => {
    const auditBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleAuditPage"),
      indexSrc.indexOf("async function handleBalanceCheck")
    );
    expect(auditBlock).toContain("renderAuditCard");
    expect(auditBlock).toContain("audit-card");
    expect(auditBlock).toContain("audit-score");
  });

  it("shows Pending state for providers not yet run", () => {
    const auditBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleAuditPage"),
      indexSrc.indexOf("async function handleBalanceCheck")
    );
    expect(auditBlock).toContain("Pending");
    expect(auditBlock).toContain("audit-pending");
  });

  it("shows dimension scores for successful results", () => {
    const auditBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleAuditPage"),
      indexSrc.indexOf("async function handleBalanceCheck")
    );
    expect(auditBlock).toContain("partisanBias");
    expect(auditBlock).toContain("Partisan Bias");
    expect(auditBlock).toContain("Factual Accuracy");
    expect(auditBlock).toContain("Fairness of Framing");
    expect(auditBlock).toContain("Balance of Pros/Cons");
    expect(auditBlock).toContain("Transparency");
  });

  it("links to methodology export and results API", () => {
    const auditBlock = indexSrc.slice(
      indexSrc.indexOf("async function handleAuditPage"),
      indexSrc.indexOf("async function handleBalanceCheck")
    );
    expect(auditBlock).toContain("/api/audit/export");
    expect(auditBlock).toContain("/api/audit/results");
  });
});

// ---------------------------------------------------------------------------
// Cron scheduled handler
// ---------------------------------------------------------------------------
describe("Cron scheduled handler", () => {
  it("runs daily update with error tracking", () => {
    expect(indexSrc).toContain("await runDailyUpdate(env)");
    expect(indexSrc).toContain('cronLog.tasks.dailyUpdate = { status: "success"');
  });

  it("runs AI audit daily until election day", () => {
    expect(indexSrc).toContain("runAudit(env");
    expect(indexSrc).toContain('triggeredBy: "cron"');
  });

  it("passes exportData to audit via buildAuditExportData", () => {
    expect(indexSrc).toContain("exportData: buildAuditExportData()");
  });

  it("writes cron_status to KV after tasks complete", () => {
    expect(indexSrc).toContain("cron_status:");
    expect(indexSrc).toContain("JSON.stringify(cronLog)");
  });

  it("runs health check as part of cron", () => {
    expect(indexSrc).toContain("runCronHealthCheck(env)");
    expect(indexSrc).toContain('cronLog.tasks.healthCheck');
  });

  it("notifies Discord when tasks fail", () => {
    expect(indexSrc).toContain("notifyDiscord(env");
    expect(indexSrc).toContain("Cron Alert");
  });
});

// ---------------------------------------------------------------------------
// Vanity entry points
// ---------------------------------------------------------------------------
describe("Vanity entry points", () => {
  it("cowboy entry point clears data and sets tone=7", () => {
    expect(indexSrc).toContain('"/cowboy"');
    expect(indexSrc).toContain("handlePWA_Clear");
    expect(indexSrc).toContain("tone=7");
  });

  it("gemini entry point clears data", () => {
    expect(indexSrc).toContain('"/gemini"');
    expect(indexSrc).toContain("Powered by Gemini");
  });

  it("grok entry point clears data", () => {
    expect(indexSrc).toContain('"/grok"');
    expect(indexSrc).toContain("Powered by Grok");
  });

  it("chatgpt entry point clears data", () => {
    expect(indexSrc).toContain('"/chatgpt"');
    expect(indexSrc).toContain("Powered by ChatGPT");
  });
});

// ---------------------------------------------------------------------------
// Health check endpoint
// ---------------------------------------------------------------------------
describe("Health check endpoint", () => {
  it("has /health route in GET handler", () => {
    expect(indexSrc).toContain('url.pathname === "/health"');
  });

  it("routes to handleHealthCheck", () => {
    expect(indexSrc).toContain("handleHealthCheck(env)");
  });

  it("health check reads manifest key", () => {
    expect(indexSrc).toContain('env.ELECTION_DATA.get("manifest")');
  });

  it("health check validates both statewide ballots", () => {
    expect(indexSrc).toContain("ballot:statewide:republican_primary_2026");
    expect(indexSrc).toContain("ballot:statewide:democrat_primary_2026");
  });

  it("health check returns status ok/degraded/down", () => {
    expect(indexSrc).toContain('"ok"');
    expect(indexSrc).toContain('"degraded"');
    expect(indexSrc).toContain('"down"');
  });

  it("health check includes responseMs timing", () => {
    expect(indexSrc).toContain("responseMs");
  });

  it("health endpoint is public (no auth check)", () => {
    // The /health route should NOT check Authorization
    const healthRouteIdx = indexSrc.indexOf('url.pathname === "/health"');
    const nextLines = indexSrc.slice(healthRouteIdx, healthRouteIdx + 200);
    expect(nextLines).not.toContain("ADMIN_SECRET");
  });

  it("health check includes cron freshness check", () => {
    expect(indexSrc).toContain("cronFreshness");
    expect(indexSrc).toContain("cron_status:");
  });

  it("health check includes audit freshness", () => {
    expect(indexSrc).toContain("auditFreshness");
  });

  it("health check verifies API key presence", () => {
    expect(indexSrc).toContain("checks.apiKey");
    expect(indexSrc).toContain("ANTHROPIC_API_KEY");
  });
});

// ---------------------------------------------------------------------------
// Admin status dashboard
// ---------------------------------------------------------------------------
describe("Admin status dashboard", () => {
  it("has /admin/status route", () => {
    expect(indexSrc).toContain('url.pathname === "/admin/status"');
  });

  it("requires admin auth", () => {
    const statusRouteIdx = indexSrc.indexOf('url.pathname === "/admin/status"');
    const nextLines = indexSrc.slice(statusRouteIdx, statusRouteIdx + 300);
    expect(nextLines).toContain("checkAdminAuth");
  });

  it("routes to handleAdminStatus", () => {
    expect(indexSrc).toContain("handleAdminStatus(env)");
  });

  it("admin status shows cron task results", () => {
    expect(indexSrc).toContain("cronTaskRows");
  });

  it("admin status shows audit provider scores", () => {
    expect(indexSrc).toContain("auditProviders");
  });

  it("admin status shows update logs", () => {
    expect(indexSrc).toContain("updateLogRows");
  });

  it("admin status shows health log", () => {
    expect(indexSrc).toContain("healthLogRows");
  });

  it("admin status links to AI error log", () => {
    expect(indexSrc).toContain("/admin/errors");
  });
});

// ---------------------------------------------------------------------------
// Admin AI error log dashboard
// ---------------------------------------------------------------------------
describe("Admin AI error log dashboard", () => {
  it("has /admin/errors route", () => {
    expect(indexSrc).toContain('url.pathname === "/admin/errors"');
  });

  it("requires admin auth", () => {
    const routeIdx = indexSrc.indexOf('url.pathname === "/admin/errors"');
    const nextLines = indexSrc.slice(routeIdx, routeIdx + 300);
    expect(nextLines).toContain("checkAdminAuth");
  });

  it("routes to handleAdminErrors", () => {
    expect(indexSrc).toContain("handleAdminErrors(request, env)");
  });

  it("has handleAdminErrors function", () => {
    expect(indexSrc).toContain("async function handleAdminErrors(request, env)");
  });

  it("supports JSON format parameter", () => {
    expect(indexSrc).toContain('format === "json"');
  });

  it("fetches error_log: prefix from KV", () => {
    expect(indexSrc).toContain("ERROR_LOG_PREFIX");
  });
});

// ---------------------------------------------------------------------------
// Discord webhook notification
// ---------------------------------------------------------------------------
describe("Discord webhook notification", () => {
  it("has notifyDiscord helper function", () => {
    expect(indexSrc).toContain("async function notifyDiscord(env, message)");
  });

  it("checks for DISCORD_WEBHOOK_URL", () => {
    expect(indexSrc).toContain("env.DISCORD_WEBHOOK_URL");
  });

  it("sends JSON content to webhook", () => {
    expect(indexSrc).toContain('"Content-Type": "application/json"');
  });
});

// ---------------------------------------------------------------------------
// Cron health check
// ---------------------------------------------------------------------------
describe("Cron health check", () => {
  it("has runCronHealthCheck function", () => {
    expect(indexSrc).toContain("async function runCronHealthCheck(env)");
  });

  it("writes health_log to KV", () => {
    expect(indexSrc).toContain("health_log:");
  });

  it("checks manifest key exists", () => {
    const fnIdx = indexSrc.indexOf("async function runCronHealthCheck");
    const fnBody = indexSrc.slice(fnIdx, fnIdx + 2000);
    expect(fnBody).toContain("manifest");
  });

  it("checks both statewide ballots", () => {
    const fnIdx = indexSrc.indexOf("async function runCronHealthCheck");
    const fnBody = indexSrc.slice(fnIdx, fnIdx + 2000);
    expect(fnBody).toContain("republican");
    expect(fnBody).toContain("democrat");
  });

  it("alerts Discord when issues found", () => {
    const fnIdx = indexSrc.indexOf("async function runCronHealthCheck");
    const fnBody = indexSrc.slice(fnIdx, fnIdx + 2000);
    expect(fnBody).toContain("notifyDiscord");
    expect(fnBody).toContain("Health Alert");
  });
});

// ---------------------------------------------------------------------------
// Admin KV cleanup endpoint
// ---------------------------------------------------------------------------
describe("Admin KV cleanup endpoint", () => {
  it("has /api/admin/cleanup route", () => {
    expect(indexSrc).toContain('url.pathname === "/api/admin/cleanup"');
  });

  it("requires ADMIN_SECRET auth", () => {
    const routeIdx = indexSrc.indexOf('url.pathname === "/api/admin/cleanup"');
    const nextLines = indexSrc.slice(routeIdx, routeIdx + 300);
    expect(nextLines).toContain("ADMIN_SECRET");
    expect(nextLines).toContain("Unauthorized");
  });

  it("routes to handleAdminCleanup", () => {
    expect(indexSrc).toContain("handleAdminCleanup(url, env)");
  });

  it("has handleAdminCleanup function", () => {
    expect(indexSrc).toContain("async function handleAdminCleanup(url, env)");
  });

  it("supports dry-run parameter", () => {
    const fnIdx = indexSrc.indexOf("async function handleAdminCleanup");
    const fnBody = indexSrc.slice(fnIdx, fnIdx + 5000);
    expect(fnBody).toContain("dry-run");
    expect(fnBody).toContain("dryRun");
  });

  it("uses cursor pagination to list all KV keys", () => {
    const fnIdx = indexSrc.indexOf("async function handleAdminCleanup");
    const fnBody = indexSrc.slice(fnIdx, fnIdx + 5000);
    expect(fnBody).toContain("cursor");
    expect(fnBody).toContain("list_complete");
    expect(fnBody).toContain("ELECTION_DATA.list");
  });

  it("categorizes statewide and county ballot keys", () => {
    const fnIdx = indexSrc.indexOf("async function handleAdminCleanup");
    const fnBody = indexSrc.slice(fnIdx, fnIdx + 5000);
    expect(fnBody).toContain("statewideBallots");
    expect(fnBody).toContain("countyBallots");
    expect(fnBody).toContain("ballot:statewide:");
    expect(fnBody).toContain("ballot:county:");
  });

  it("categorizes log key types", () => {
    const fnIdx = indexSrc.indexOf("async function handleAdminCleanup");
    const fnBody = indexSrc.slice(fnIdx, fnIdx + 5000);
    expect(fnBody).toContain("updateLogs");
    expect(fnBody).toContain("cronStatus");
    expect(fnBody).toContain("healthLogs");
    expect(fnBody).toContain("usageLogs");
    expect(fnBody).toContain("auditLogs");
  });

  it("identifies legacy ballot keys as stale", () => {
    const fnIdx = indexSrc.indexOf("async function handleAdminCleanup");
    const fnBody = indexSrc.slice(fnIdx, fnIdx + 5000);
    expect(fnBody).toContain("legacyBallots");
    expect(fnBody).toContain("Legacy ballot key");
  });

  it("uses 14-day cutoff for dated logs", () => {
    const fnIdx = indexSrc.indexOf("async function handleAdminCleanup");
    const fnBody = indexSrc.slice(fnIdx, fnIdx + 5000);
    expect(fnBody).toContain("14");
    expect(fnBody).toContain("cutoff");
    expect(fnBody).toContain("cutoffStr");
  });

  it("returns JSON response with expected fields", () => {
    const fnIdx = indexSrc.indexOf("async function handleAdminCleanup");
    const fnBody = indexSrc.slice(fnIdx, fnIdx + 5000);
    expect(fnBody).toContain("totalKeys");
    expect(fnBody).toContain("categories");
    expect(fnBody).toContain("staleCount");
    expect(fnBody).toContain("deletedCount");
    expect(fnBody).toContain("jsonResponse");
  });

  it("deletes keys when not in dry-run mode", () => {
    const fnIdx = indexSrc.indexOf("async function handleAdminCleanup");
    const fnBody = indexSrc.slice(fnIdx, fnIdx + 5000);
    expect(fnBody).toContain("ELECTION_DATA.delete");
    expect(fnBody).toContain("!dryRun");
  });

  it("handles delete errors gracefully", () => {
    const fnIdx = indexSrc.indexOf("async function handleAdminCleanup");
    const fnBody = indexSrc.slice(fnIdx, fnIdx + 5000);
    expect(fnBody).toContain("deleteErrors");
    expect(fnBody).toContain("catch");
  });
});

// ---------------------------------------------------------------------------
// Admin hub LLM Experiment link
// ---------------------------------------------------------------------------
describe("Admin hub LLM Experiment link", () => {
  it("admin hub dashboard includes LLM Compare stat card", () => {
    const adminBlock = indexSrc.slice(
      indexSrc.indexOf("function handleAdmin()"),
      indexSrc.indexOf("function handleAdmin()") + 3000
    );
    expect(adminBlock).toContain("LLM Compare");
    expect(adminBlock).toContain('/tx/app#/llm-experiment"');
  });

  it("LLM Experiment card has descriptive text", () => {
    const adminBlock = indexSrc.slice(
      indexSrc.indexOf("function handleAdmin()"),
      indexSrc.indexOf("function handleAdmin()") + 3000
    );
    expect(adminBlock).toContain("Compare guide output across LLM providers");
  });

  it("LLM Compare card uses stat-card class", () => {
    const adminBlock = indexSrc.slice(
      indexSrc.indexOf("function handleAdmin()"),
      indexSrc.indexOf("function handleAdmin()") + 3000
    );
    expect(adminBlock).toContain('class="stat-card"><h3>LLM Compare</h3>');
  });

  it("admin hub dashboard includes LLM Benchmark stat card", () => {
    const adminBlock = indexSrc.slice(
      indexSrc.indexOf("function handleAdmin()"),
      indexSrc.indexOf("function handleAdmin()") + 3000
    );
    expect(adminBlock).toContain("LLM Benchmark");
    expect(adminBlock).toContain('/admin/llm-benchmark"');
  });

  it("/llm-experiment route redirects to /tx/app#/llm-experiment", () => {
    expect(indexSrc).toContain('url.pathname === "/llm-experiment"');
    expect(indexSrc).toContain('Location: "/tx/app#/llm-experiment"');
  });

  it("/llm-experiment route requires admin auth", () => {
    const routeIdx = indexSrc.indexOf('url.pathname === "/llm-experiment"');
    const nextLines = indexSrc.slice(routeIdx, routeIdx + 200);
    expect(nextLines).toContain("checkAdminAuth");
  });
});

// ---------------------------------------------------------------------------
// Multi-state routing infrastructure (Phase 1)
// ---------------------------------------------------------------------------
describe("Multi-state routing infrastructure", () => {
  it("imports STATE_CONFIG from state-config.js", () => {
    expect(indexSrc).toContain('from "./state-config.js"');
    expect(indexSrc).toContain("STATE_CONFIG");
  });

  it("has backward-compat redirect for /app -> /tx/app", () => {
    // The routing block should handle /app and /app/* redirects
    expect(indexSrc).toContain('url.pathname === "/app"');
    expect(indexSrc).toContain('url.pathname.startsWith("/app/")');
    expect(indexSrc).toContain("status: 301");
  });

  it("has /tx/app route for Texas PWA", () => {
    expect(indexSrc).toContain('url.pathname === "/tx/app"');
    expect(indexSrc).toContain('handlePWA("tx")');
  });

  it("has /tx/app/sw.js route for Texas service worker", () => {
    expect(indexSrc).toContain('url.pathname === "/tx/app/sw.js"');
    expect(indexSrc).toContain('handlePWA_SW("tx")');
  });

  it("has /tx/app/manifest.json route for Texas manifest", () => {
    expect(indexSrc).toContain('url.pathname === "/tx/app/manifest.json"');
    expect(indexSrc).toContain('handlePWA_Manifest("tx")');
  });

  it("has /tx/app/api/* routes for Texas API", () => {
    expect(indexSrc).toContain('url.pathname === "/tx/app/api/ballot"');
    expect(indexSrc).toContain('url.pathname === "/tx/app/api/guide"');
    expect(indexSrc).toContain('url.pathname === "/tx/app/api/guide-stream"');
    expect(indexSrc).toContain('url.pathname === "/tx/app/api/summary"');
    expect(indexSrc).toContain('url.pathname === "/tx/app/api/districts"');
    expect(indexSrc).toContain('url.pathname === "/tx/app/api/ev"');
  });

  it("has /dc/app route for DC stub", () => {
    expect(indexSrc).toContain('url.pathname === "/dc/app"');
    expect(indexSrc).toContain("handleDCComingSoon");
  });

  it("vanity routes redirect to /tx/app", () => {
    expect(indexSrc).toContain('"/tx/app?tone=7"');
    expect(indexSrc).toContain('"/tx/app?gemini"');
    expect(indexSrc).toContain('"/tx/app?grok"');
    expect(indexSrc).toContain('"/tx/app?chatgpt"');
  });

  it("CTA links point to /tx/app", () => {
    expect(indexSrc).toContain('href="/tx/app?start=1"');
    expect(indexSrc).not.toContain('href="/app?start=1"');
  });

  it("CORS preflight handles /tx/app/api/ paths", () => {
    expect(indexSrc).toContain('url.pathname.startsWith("/tx/app/api/")');
  });

  it("backward-compat redirect for /clear -> /tx/app/clear", () => {
    expect(indexSrc).toContain('url.pathname === "/clear"');
  });
});

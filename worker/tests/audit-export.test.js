import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexSrc = readFileSync(join(__dirname, "../src/index.js"), "utf-8");
const guideSrc = readFileSync(join(__dirname, "../src/pwa-guide.js"), "utf-8");
const updaterSrc = readFileSync(join(__dirname, "../src/updater.js"), "utf-8");

// Extract the export JSON by running the worker handler in miniflare-like fashion
// isn't possible without the full worker runtime, so instead we verify by checking
// the source code contains the expected strings and patterns.

// Helper: extract the INTERNAL (full) audit export function block
function getInternalExportBlock() {
  return indexSrc.slice(
    indexSrc.indexOf("function buildAuditExportData()"),
    indexSrc.indexOf("function buildPublicAuditExportData()")
  );
}

// Helper: extract the PUBLIC (redacted) audit export function block
function getPublicExportBlock() {
  return indexSrc.slice(
    indexSrc.indexOf("function buildPublicAuditExportData()"),
    indexSrc.indexOf("function handleAuditExport()")
  );
}

// ---------------------------------------------------------------------------
// Security: public export redacts verbatim prompts
// ---------------------------------------------------------------------------
describe("Audit export security: prompt redaction", () => {
  it("public export function exists", () => {
    expect(indexSrc).toContain("function buildPublicAuditExportData()");
  });

  it("handleAuditExport uses the public (redacted) version", () => {
    // The handler should call buildPublicAuditExportData, not buildAuditExportData
    const handlerBlock = indexSrc.slice(
      indexSrc.indexOf("function handleAuditExport()"),
      indexSrc.indexOf("function handleAuditExport()") + 300
    );
    expect(handlerBlock).toContain("buildPublicAuditExportData()");
  });

  it("public export contains redaction notice", () => {
    const pubBlock = getPublicExportBlock();
    expect(pubBlock).toContain("withheld for security");
  });

  it("public export contains security note in _meta", () => {
    const pubBlock = getPublicExportBlock();
    expect(pubBlock).toContain("securityNote");
    expect(pubBlock).toContain("prompt injection");
  });

  it("public export redacts guide generation system prompt", () => {
    const pubBlock = getPublicExportBlock();
    expect(pubBlock).toContain("guideGeneration.systemPrompt");
    expect(pubBlock).toContain("PROMPT_REDACTED");
  });

  it("public export redacts guide generation user prompt template", () => {
    const pubBlock = getPublicExportBlock();
    expect(pubBlock).toContain("guideGeneration.userPromptTemplate");
    expect(pubBlock).toContain("USER_PROMPT_REDACTED");
  });

  it("public export redacts profile summary prompts", () => {
    const pubBlock = getPublicExportBlock();
    expect(pubBlock).toContain("profileSummary.systemPrompt");
    expect(pubBlock).toContain("profileSummary.userPromptTemplate");
  });

  it("public export redacts candidate research system prompt", () => {
    const pubBlock = getPublicExportBlock();
    expect(pubBlock).toContain("candidateResearch.systemPrompt");
    expect(pubBlock).toContain("nonpartisan election data researcher");
  });

  it("public export redacts daily updater prompts", () => {
    const pubBlock = getPublicExportBlock();
    expect(pubBlock).toContain("dailyUpdater.systemPrompt");
    expect(pubBlock).toContain("dailyUpdater.raceResearchPromptTemplate");
  });

  it("public export redacts county seeder prompts", () => {
    const pubBlock = getPublicExportBlock();
    expect(pubBlock).toContain("countySeeder.systemPrompt");
    expect(pubBlock).toContain("countySeeder.countyInfoPrompt");
    expect(pubBlock).toContain("countySeeder.countyBallotPrompt");
    expect(pubBlock).toContain("countySeeder.precinctMapPrompt");
  });

  it("public export redacts tone variants rewrite prompt", () => {
    const pubBlock = getPublicExportBlock();
    expect(pubBlock).toContain("toneVariants.rewritePromptTemplate");
  });

  it("public export uses generic model names (no exact versions)", () => {
    const pubBlock = getPublicExportBlock();
    // Should set generic names
    expect(pubBlock).toContain('"Claude Sonnet (Anthropic)"');
    // Should NOT contain exact version strings
    expect(pubBlock).not.toContain("claude-sonnet-4-6");
    expect(pubBlock).not.toContain("claude-sonnet-4-20250514");
  });

  it("public export redacts reading level verbatim tone instructions", () => {
    const pubBlock = getPublicExportBlock();
    // Should have simplified descriptions
    expect(pubBlock).toContain("high school reading level");
    expect(pubBlock).toContain("Texas cowboy");
    // Should NOT contain the verbatim TONE: injection text
    expect(pubBlock).not.toContain("TONE: Write at a high school reading level");
    expect(pubBlock).not.toContain("TONE: Write EVERYTHING as a folksy Texas cowboy");
  });
});

// ---------------------------------------------------------------------------
// Internal export still has full prompts (for audit runner)
// ---------------------------------------------------------------------------
describe("Audit export internal: full prompts preserved", () => {
  it("internal export includes the full SYSTEM_PROMPT from pwa-guide.js", () => {
    const keyPhrases = [
      "non-partisan voting guide assistant",
      "NEVER recommend a candidate who is not listed",
      "NEVER invent or hallucinate",
      "NONPARTISAN RULES",
      "neutral, factual language",
      "Treat all candidates with equal analytical rigor",
    ];
    const intBlock = getInternalExportBlock();
    for (const phrase of keyPhrases) {
      expect(guideSrc).toContain(phrase);
      expect(intBlock).toContain(phrase);
    }
  });

  it("internal export includes the model name from pwa-guide.js", () => {
    const intBlock = getInternalExportBlock();
    expect(guideSrc).toContain("claude-sonnet-4-6");
    expect(intBlock).toContain("claude-sonnet-4-6");
  });

  it("internal export includes verbatim reading level instructions", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("TONE: Write at a high school reading level");
    expect(intBlock).toContain("Texas cowboy");
  });

  it("internal export includes verbatim user prompt template", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("NONPARTISAN");
    expect(intBlock).toContain("recommendedCandidate");
    expect(intBlock).toContain("profileSummary");
  });

  it("internal export is passed to audit runner", () => {
    // Cron and API audit runner get buildAuditExportData (full), not public
    expect(indexSrc).toContain("exportData: buildAuditExportData()");
  });
});

// ---------------------------------------------------------------------------
// Guide generation (kept in both internal and public)
// ---------------------------------------------------------------------------
describe("Audit export source: guide generation", () => {
  it("export includes confidence levels", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("Strong Match");
    expect(intBlock).toContain("Good Match");
    expect(intBlock).toContain("Best Available");
    expect(intBlock).toContain("Symbolic Race");
    expect(intBlock).toContain("Clear Call");
    expect(intBlock).toContain("Genuinely Contested");
  });

  it("export includes all 6 reading level entries", () => {
    // Verify pwa-guide.js has all reading levels (Chef/Trump removed)
    expect(guideSrc).toContain("high school reading level");
    expect(guideSrc).toContain("explaining politics to a friend");
    expect(guideSrc).toContain("more depth and nuance");
    expect(guideSrc).toContain("expert level");
    expect(guideSrc).toContain("Texas cowboy");

    // Verify the internal export has all 6
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("high school reading level");
    expect(intBlock).toContain("explaining politics to a friend");
    expect(intBlock).toContain("more depth and nuance");
    expect(intBlock).toContain("expert level");
    expect(intBlock).toContain("Texas cowboy");
  });
});

// ---------------------------------------------------------------------------
// Profile summary
// ---------------------------------------------------------------------------
describe("Audit export source: profile summary", () => {
  it("internal export includes the SUMMARY_SYSTEM prompt", () => {
    const keyPhrases = [
      "concise, non-partisan political analyst",
      "neutral, respectful language",
      "Never use partisan labels",
    ];
    const intBlock = getInternalExportBlock();
    for (const phrase of keyPhrases) {
      expect(guideSrc).toContain(phrase);
      expect(intBlock).toContain(phrase);
    }
  });

  it("internal export includes the party label prohibition", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain('NEVER say');
    expect(intBlock).toContain("Democrat");
    expect(intBlock).toContain("Republican");
  });
});

// ---------------------------------------------------------------------------
// Daily updater
// ---------------------------------------------------------------------------
describe("Audit export source: daily updater", () => {
  it("internal export includes the updater system prompt", () => {
    const updaterPrompt =
      "You are a nonpartisan election data researcher. Use web_search to find verified, factual updates about candidates.";
    const intBlock = getInternalExportBlock();
    expect(updaterSrc).toContain(updaterPrompt);
    expect(intBlock).toContain(updaterPrompt);
  });

  it("export includes validation rules", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("Candidate count must remain the same");
    expect(intBlock).toContain("Candidate names must match exactly");
    expect(intBlock).toContain("Endorsement lists cannot shrink by more than 50%");
  });

  it("internal export includes full race research prompt template", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("raceResearchPromptTemplate");
    expect(intBlock).toContain("Search for updates since");
    expect(intBlock).toContain("New endorsements");
    expect(intBlock).toContain("New polling data");
    expect(intBlock).toContain("Updated fundraising numbers");
  });

  it("export documents merge strategy and KV keys", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("mergeStrategy");
    expect(intBlock).toContain("kvKeys");
    expect(intBlock).toContain("update_log");
  });
});

// ---------------------------------------------------------------------------
// Candidate research
// ---------------------------------------------------------------------------
describe("Audit export source: candidate research", () => {
  it("includes data sources", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("Texas Secretary of State");
    expect(intBlock).toContain("Ballotpedia");
    expect(intBlock).toContain("Campaign websites");
  });

  it("includes all candidate data fields", () => {
    const intBlock = getInternalExportBlock();
    const requiredFields = [
      "name", "isIncumbent", "summary", "background", "education",
      "keyPositions", "endorsements", "pros", "cons", "polling", "fundraising",
    ];
    for (const field of requiredFields) {
      expect(intBlock).toContain(field);
    }
  });

  it("includes equal treatment statement", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("equalTreatment");
    expect(intBlock).toContain("same structured fields");
  });
});

// ---------------------------------------------------------------------------
// Nonpartisan safeguards
// ---------------------------------------------------------------------------
describe("Audit export source: nonpartisan safeguards", () => {
  it("has all 4 safeguard categories", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("promptLevel");
    expect(intBlock).toContain("dataLevel");
    expect(intBlock).toContain("uiLevel");
    expect(intBlock).toContain("translationLevel");
  });

  it("UI safeguards mention randomization and hidden party labels", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("randomized");
    expect(intBlock).toContain("Party labels hidden");
    expect(intBlock).toContain("Interview answer options shuffled");
  });
});

// ---------------------------------------------------------------------------
// Interview questions
// ---------------------------------------------------------------------------
describe("Audit export source: interview questions", () => {
  it("documents all 8 interview phases", () => {
    const intBlock = getInternalExportBlock();
    const phases = [
      "Party Selection",
      "Political Spectrum",
      "Top Issues",
      "Policy Deep Dives",
      "Candidate Qualities",
      "Free-form",
      "Address Lookup",
      "Guide Generation",
    ];
    for (const phase of phases) {
      expect(intBlock).toContain(phase);
    }
  });

  it("includes all 17 issues with icons", () => {
    const intBlock = getInternalExportBlock();
    const issues = [
      "Economy & Cost of Living",
      "Housing",
      "Public Safety",
      "Education",
      "Healthcare",
      "Environment & Climate",
      "Grid & Infrastructure",
      "Tech & Innovation",
      "Transportation",
      "Immigration",
      "Taxes",
      "Civil Rights",
      "Gun Policy",
      "Abortion & Reproductive Rights",
      "Water & Land",
      "Agriculture & Rural",
      "Faith & Religious Liberty",
    ];
    for (const issue of issues) {
      expect(intBlock).toContain(issue);
    }
    expect(issues).toHaveLength(17);
  });

  it("includes all 6 political spectrum options", () => {
    const intBlock = getInternalExportBlock();
    const options = [
      "Progressive",
      "Liberal",
      "Moderate",
      "Conservative",
      "Libertarian",
      "Independent / Issue-by-Issue",
    ];
    for (const opt of options) {
      expect(intBlock).toContain(opt);
    }
    expect(options).toHaveLength(6);
  });

  it("includes all 10 candidate qualities", () => {
    const intBlock = getInternalExportBlock();
    const qualities = [
      "Competence & Track Record",
      "Integrity & Honesty",
      "Independence",
      "Experience",
      "Fresh Perspective",
      "Bipartisan / Works Across Aisle",
      "Strong Leadership",
      "Community Ties",
      "Faith & Values",
      "Business Experience",
    ];
    for (const quality of qualities) {
      expect(intBlock).toContain(quality);
    }
    expect(qualities).toHaveLength(10);
  });

  it("includes all 17 policy deep-dive topics with questions and options", () => {
    const intBlock = getInternalExportBlock();
    const topics = [
      "Housing",
      "Public Safety",
      "Economy & Cost of Living",
      "Tech & Innovation",
      "Education",
      "Healthcare",
      "Environment & Climate",
      "Grid & Infrastructure",
      "Transportation",
      "Immigration",
      "Civil Rights",
      "Gun Policy",
      "Abortion & Reproductive Rights",
      "Water & Land",
      "Agriculture & Rural",
      "Taxes",
      "Faith & Religious Liberty",
    ];
    for (const topic of topics) {
      expect(intBlock).toContain(`"${topic}"`);
    }
    expect(topics).toHaveLength(17);

    // Verify each deep dive has a question and 4 options
    expect(intBlock).toContain("policyDeepDives");
    expect(intBlock).toContain("question:");
    expect(intBlock).toContain("options:");
    expect(intBlock).toContain("label:");
  });
});

// ---------------------------------------------------------------------------
// Data structure samples
// ---------------------------------------------------------------------------
describe("Audit export source: data structure", () => {
  it("includes sample candidate with pros and cons", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("sampleCandidate");
    expect(intBlock).toContain("sampleProposition");
  });
});

// ---------------------------------------------------------------------------
// County seeder
// ---------------------------------------------------------------------------
describe("Audit export source: county seeder", () => {
  it("has countySeeder section with prompt fields", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("countySeeder:");
    expect(intBlock).toContain("countyInfoPrompt");
    expect(intBlock).toContain("countyBallotPrompt");
    expect(intBlock).toContain("precinctMapPrompt");
  });

  it("internal export includes the county seeder system prompt", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("nonpartisan election data researcher for Texas");
  });

  it("lists data sources for county research", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("County clerk election offices");
    expect(intBlock).toContain("County elections websites");
    expect(intBlock).toContain("County GIS and precinct boundary data");
  });

  it("includes top 30 counties", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("topCounties");
    const topCounties = [
      "Harris", "Dallas", "Tarrant", "Bexar", "Travis",
      "Collin", "Denton", "Hidalgo", "Fort Bend", "Williamson",
    ];
    for (const county of topCounties) {
      expect(intBlock).toContain(county);
    }
  });

  it("documents KV key structure for county data", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("county_info:{fips}");
    expect(intBlock).toContain("ballot:county:{fips}");
    expect(intBlock).toContain("precinct_map:{fips}");
  });

  it("includes equal treatment statement for county ballots", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("Both party ballots for each county use identical prompt structure");
  });
});

// ---------------------------------------------------------------------------
// Tone variants
// ---------------------------------------------------------------------------
describe("Audit export source: tone variants", () => {
  it("has toneVariants section", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("toneVariants:");
  });

  it("documents all 6 available tones", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("availableTones");
    // Check for tone keys (Chef 6 and Trump 8 removed)
    expect(intBlock).toContain('"1"');
    expect(intBlock).toContain('"2"');
    expect(intBlock).toContain('"3"');
    expect(intBlock).toContain('"4"');
    expect(intBlock).toContain('"5"');
    expect(intBlock).toContain('"7"');
  });

  it("documents tone labels", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("Simple");
    expect(intBlock).toContain("Casual");
    expect(intBlock).toContain("Standard (default)");
    expect(intBlock).toContain("Detailed");
    expect(intBlock).toContain("Expert");
    expect(intBlock).toContain("Texas Cowboy");
  });

  it("documents candidate and proposition fields affected", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("candidateFields");
    expect(intBlock).toContain("propositionFields");
    expect(intBlock).toContain("ifPasses");
    expect(intBlock).toContain("ifFails");
    expect(intBlock).toContain("fiscalImpact");
  });

  it("documents storage format and constraints", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("storageFormat");
    expect(intBlock).toContain("resolveTone()");
    expect(intBlock).toContain("Tone 3 is always the original");
  });

  it("internal export includes rewrite prompt template", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("rewritePromptTemplate");
    expect(intBlock).toContain("Keep the same factual content and meaning");
  });
});

// ---------------------------------------------------------------------------
// Source ranking policy
// ---------------------------------------------------------------------------
const seederSrc = readFileSync(join(__dirname, "../src/county-seeder.js"), "utf-8");

describe("Audit export source: source ranking policy", () => {
  it("has sourceRankingPolicy section in audit export", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("sourceRankingPolicy:");
  });

  it("documents all 7 tiers of source hierarchy", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("tier: 1");
    expect(intBlock).toContain("tier: 2");
    expect(intBlock).toContain("tier: 3");
    expect(intBlock).toContain("tier: 4");
    expect(intBlock).toContain("tier: 5");
    expect(intBlock).toContain("tier: 6");
    expect(intBlock).toContain("tier: 7");
    expect(intBlock).toContain("Texas Secretary of State filings");
    expect(intBlock).toContain("County election offices");
    expect(intBlock).toContain("Official campaign websites");
    expect(intBlock).toContain("Nonpartisan references");
    expect(intBlock).toContain("Established Texas news outlets");
    expect(intBlock).toContain("National wire services");
    expect(intBlock).toContain("Blogs, social media, opinion sites");
  });

  it("includes conflict resolution rule", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("conflictResolution");
    expect(intBlock).toContain("official filings override campaign claims");
    expect(intBlock).toContain("campaign claims override news reporting");
  });

  it("documents enforcement mechanism", () => {
    const intBlock = getInternalExportBlock();
    expect(intBlock).toContain("enforcement");
    expect(intBlock).toContain("updater.js");
    expect(intBlock).toContain("county-seeder.js");
  });
});

describe("Source ranking: prompt-level enforcement", () => {
  it("updater.js system prompt contains SOURCE PRIORITY", () => {
    expect(updaterSrc).toContain("SOURCE PRIORITY");
  });

  it("updater.js system prompt contains CONFLICT RESOLUTION", () => {
    expect(updaterSrc).toContain("CONFLICT RESOLUTION");
  });

  it("updater.js system prompt lists all 7 tiers", () => {
    expect(updaterSrc).toContain("Texas Secretary of State filings");
    expect(updaterSrc).toContain("County election offices");
    expect(updaterSrc).toContain("Official campaign websites");
    expect(updaterSrc).toContain("ballotpedia.org");
    expect(updaterSrc).toContain("texastribune.org");
    expect(updaterSrc).toContain("apnews.com");
    expect(updaterSrc).toContain("AVOID: blogs, social media");
  });

  it("county-seeder.js system prompt contains SOURCE PRIORITY", () => {
    expect(seederSrc).toContain("SOURCE PRIORITY");
  });

  it("county-seeder.js system prompt contains CONFLICT RESOLUTION", () => {
    expect(seederSrc).toContain("CONFLICT RESOLUTION");
  });

  it("county-seeder.js system prompt lists all 7 tiers", () => {
    expect(seederSrc).toContain("Texas Secretary of State filings");
    expect(seederSrc).toContain("County election offices");
    expect(seederSrc).toContain("Official campaign websites");
    expect(seederSrc).toContain("ballotpedia.org");
    expect(seederSrc).toContain("texastribune.org");
    expect(seederSrc).toContain("apnews.com");
    expect(seederSrc).toContain("AVOID: blogs, social media");
  });
});

// ---------------------------------------------------------------------------
// Completeness: export size
// ---------------------------------------------------------------------------
describe("Audit export source: completeness", () => {
  it("buildAuditExportData (internal) function is at least 15000 characters", () => {
    const start = indexSrc.indexOf("function buildAuditExportData()");
    const end = indexSrc.indexOf("function buildPublicAuditExportData()");
    const fnLength = end - start;
    expect(fnLength).toBeGreaterThan(15000);
  });

  it("buildPublicAuditExportData function exists and redacts prompts", () => {
    const start = indexSrc.indexOf("function buildPublicAuditExportData()");
    const end = indexSrc.indexOf("function handleAuditExport()");
    const fnLength = end - start;
    expect(fnLength).toBeGreaterThan(500);
    const pubBlock = indexSrc.slice(start, end);
    expect(pubBlock).toContain("withheld for security");
    expect(pubBlock).toContain("PROMPT_REDACTED");
  });

  it("export has at least 11 top-level keys in the internal exportData object", () => {
    const intBlock = getInternalExportBlock();
    const topKeys = [
      "_meta", "guideGeneration", "profileSummary", "candidateResearch",
      "dailyUpdater", "dataStructure", "nonpartisanSafeguards", "sourceRankingPolicy",
      "interviewQuestions", "countySeeder", "toneVariants",
    ];
    for (const key of topKeys) {
      expect(intBlock).toContain(key + ":");
    }
    expect(topKeys).toHaveLength(11);
  });
});

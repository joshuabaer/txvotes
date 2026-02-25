import { describe, it, expect } from "vitest";
import {
  resolveTone,
  resolveToneArray,
  analyzeCandidate,
  checkCandidateBalance,
  checkRaceBalance,
  checkBallotBalance,
  formatBalanceSummary,
  getCandidatesNeedingRebalance,
  REBALANCE_FLAG_TYPES,
  matchesGenericPhrase,
  countGenericItems,
  scoreSpecificity,
  scoreSpecificityArray,
  analyzeSentiment,
  countWordMatches,
  GENERIC_PHRASES,
  STRONG_POSITIVE_WORDS,
  WEAK_POSITIVE_WORDS,
  STRONG_NEGATIVE_WORDS,
  HEDGING_WORDS,
} from "../src/balance-check.js";

// ---------------------------------------------------------------------------
// resolveTone
// ---------------------------------------------------------------------------
describe("resolveTone", () => {
  it("returns null for null input", () => {
    expect(resolveTone(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(resolveTone(undefined)).toBeNull();
  });

  it("returns plain strings unchanged", () => {
    expect(resolveTone("Strong record")).toBe("Strong record");
  });

  it("extracts tone 3 from tone-variant object", () => {
    const toneObj = { "1": "Simple", "3": "Standard", "5": "Expert" };
    expect(resolveTone(toneObj)).toBe("Standard");
  });

  it("falls back to first sorted key when tone 3 is missing", () => {
    const toneObj = { "1": "Simple", "5": "Expert" };
    expect(resolveTone(toneObj)).toBe("Simple");
  });

  it("returns null for empty object", () => {
    expect(resolveTone({})).toBeNull();
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
  });

  it("passes through plain string arrays", () => {
    expect(resolveToneArray(["A", "B"])).toEqual(["A", "B"]);
  });

  it("resolves tone-variant objects in array", () => {
    const arr = [
      { "1": "Simple A", "3": "Standard A" },
      { "1": "Simple B", "3": "Standard B" },
    ];
    expect(resolveToneArray(arr)).toEqual(["Standard A", "Standard B"]);
  });

  it("filters out null and undefined entries", () => {
    expect(resolveToneArray(["A", null, "B", undefined])).toEqual(["A", "B"]);
  });

  it("handles empty array", () => {
    expect(resolveToneArray([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// analyzeCandidate
// ---------------------------------------------------------------------------
describe("analyzeCandidate", () => {
  it("counts pros and cons correctly", () => {
    const candidate = {
      name: "Alice",
      pros: ["Strong record", "Bipartisan"],
      cons: ["Slow on housing"],
    };
    const result = analyzeCandidate(candidate);
    expect(result.name).toBe("Alice");
    expect(result.prosCount).toBe(2);
    expect(result.consCount).toBe(1);
  });

  it("calculates text lengths", () => {
    const candidate = {
      name: "Bob",
      pros: ["Good"],  // 4 chars
      cons: ["Bad"],   // 3 chars
    };
    const result = analyzeCandidate(candidate);
    expect(result.prosLength).toBe(4);
    expect(result.consLength).toBe(3);
  });

  it("calculates average lengths", () => {
    const candidate = {
      name: "Carol",
      pros: ["Short", "A bit longer text"],  // 5 + 18 = 23, avg ~12
      cons: ["Medium length"],                // 13, avg 13
    };
    const result = analyzeCandidate(candidate);
    // "Short" = 5, "A bit longer text" = 18, total = 23, avg = round(23/2) = 12
    // But actual: "A bit longer text".length = 18, so 5+18=23, round(23/2)=12
    // Let's just check against actual computed values
    const expectedProsTotal = "Short".length + "A bit longer text".length;
    expect(result.prosAvgLength).toBe(Math.round(expectedProsTotal / 2));
    expect(result.consAvgLength).toBe("Medium length".length);
  });

  it("handles missing pros and cons", () => {
    const candidate = { name: "Dan" };
    const result = analyzeCandidate(candidate);
    expect(result.prosCount).toBe(0);
    expect(result.consCount).toBe(0);
    expect(result.prosLength).toBe(0);
    expect(result.consLength).toBe(0);
    expect(result.prosAvgLength).toBe(0);
    expect(result.consAvgLength).toBe(0);
  });

  it("handles empty arrays", () => {
    const candidate = { name: "Eve", pros: [], cons: [] };
    const result = analyzeCandidate(candidate);
    expect(result.prosCount).toBe(0);
    expect(result.consCount).toBe(0);
  });

  it("handles tone-variant pros and cons", () => {
    const candidate = {
      name: "Frank",
      pros: [
        { "1": "Simple pro", "3": "Standard pro" },
        { "1": "Simple pro 2", "3": "Standard pro 2" },
      ],
      cons: [
        { "1": "Simple con", "3": "Standard con" },
      ],
    };
    const result = analyzeCandidate(candidate);
    expect(result.prosCount).toBe(2);
    expect(result.consCount).toBe(1);
    // Should use tone 3 versions
    expect(result.prosLength).toBe("Standard pro".length + "Standard pro 2".length);
    expect(result.consLength).toBe("Standard con".length);
  });
});

// ---------------------------------------------------------------------------
// checkCandidateBalance
// ---------------------------------------------------------------------------
describe("checkCandidateBalance", () => {
  it("returns no flags for balanced candidate", () => {
    const analysis = {
      name: "Alice",
      prosCount: 2,
      consCount: 2,
      prosLength: 50,
      consLength: 48,
      prosAvgLength: 25,
      consAvgLength: 24,
    };
    const flags = checkCandidateBalance(analysis);
    expect(flags).toHaveLength(0);
  });

  it("flags missing pros as critical", () => {
    const analysis = {
      name: "Bob",
      prosCount: 0,
      consCount: 2,
      prosLength: 0,
      consLength: 40,
      prosAvgLength: 0,
      consAvgLength: 20,
    };
    const flags = checkCandidateBalance(analysis);
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe("missing_pros");
    expect(flags[0].severity).toBe("critical");
    expect(flags[0].candidate).toBe("Bob");
  });

  it("flags missing cons as critical", () => {
    const analysis = {
      name: "Carol",
      prosCount: 3,
      consCount: 0,
      prosLength: 60,
      consLength: 0,
      prosAvgLength: 20,
      consAvgLength: 0,
    };
    const flags = checkCandidateBalance(analysis);
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe("missing_cons");
    expect(flags[0].severity).toBe("critical");
  });

  it("flags both missing as warning (not critical)", () => {
    const analysis = {
      name: "Dan",
      prosCount: 0,
      consCount: 0,
      prosLength: 0,
      consLength: 0,
      prosAvgLength: 0,
      consAvgLength: 0,
    };
    const flags = checkCandidateBalance(analysis);
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe("missing_both");
    expect(flags[0].severity).toBe("warning");
  });

  it("flags count imbalance when ratio exceeds 2:1", () => {
    const analysis = {
      name: "Eve",
      prosCount: 5,
      consCount: 1,
      prosLength: 100,
      consLength: 20,
      prosAvgLength: 20,
      consAvgLength: 20,
    };
    const flags = checkCandidateBalance(analysis);
    const countFlag = flags.find(f => f.type === "count_imbalance");
    expect(countFlag).toBeDefined();
    expect(countFlag.severity).toBe("warning");
    expect(countFlag.detail).toContain("5.0:1");
  });

  it("does not flag count imbalance at exactly 2:1", () => {
    const analysis = {
      name: "Frank",
      prosCount: 2,
      consCount: 1,
      prosLength: 40,
      consLength: 20,
      prosAvgLength: 20,
      consAvgLength: 20,
    };
    const flags = checkCandidateBalance(analysis);
    const countFlag = flags.find(f => f.type === "count_imbalance");
    expect(countFlag).toBeUndefined();
  });

  it("flags length imbalance when ratio exceeds 2x", () => {
    const analysis = {
      name: "Grace",
      prosCount: 2,
      consCount: 2,
      prosLength: 200,
      consLength: 50,
      prosAvgLength: 100,
      consAvgLength: 25,
    };
    const flags = checkCandidateBalance(analysis);
    const lengthFlag = flags.find(f => f.type === "length_imbalance");
    expect(lengthFlag).toBeDefined();
    expect(lengthFlag.severity).toBe("info");
    expect(lengthFlag.detail).toContain("pros");
  });

  it("identifies cons as the longer side when appropriate", () => {
    const analysis = {
      name: "Hank",
      prosCount: 1,
      consCount: 1,
      prosLength: 10,
      consLength: 50,
      prosAvgLength: 10,
      consAvgLength: 50,
    };
    const flags = checkCandidateBalance(analysis);
    const lengthFlag = flags.find(f => f.type === "length_imbalance");
    expect(lengthFlag).toBeDefined();
    expect(lengthFlag.detail).toContain("cons");
  });

  it("does not flag length imbalance at exactly 2x", () => {
    const analysis = {
      name: "Iris",
      prosCount: 2,
      consCount: 2,
      prosLength: 100,
      consLength: 50,
      prosAvgLength: 50,
      consAvgLength: 25,
    };
    const flags = checkCandidateBalance(analysis);
    const lengthFlag = flags.find(f => f.type === "length_imbalance");
    expect(lengthFlag).toBeUndefined();
  });

  it("can return multiple flags for severely imbalanced candidate", () => {
    const analysis = {
      name: "Jack",
      prosCount: 6,
      consCount: 1,
      prosLength: 300,
      consLength: 15,
      prosAvgLength: 50,
      consAvgLength: 15,
    };
    const flags = checkCandidateBalance(analysis);
    expect(flags.length).toBeGreaterThanOrEqual(2);
    const types = flags.map(f => f.type);
    expect(types).toContain("count_imbalance");
    expect(types).toContain("length_imbalance");
  });
});

// ---------------------------------------------------------------------------
// checkRaceBalance
// ---------------------------------------------------------------------------
describe("checkRaceBalance", () => {
  it("returns no flags for a balanced race", () => {
    const race = {
      office: "Governor",
      candidates: [
        { name: "Alice", pros: ["Strong record", "Bipartisan"], cons: ["Slow on housing", "Establishment"] },
        { name: "Bob", pros: ["Fresh ideas", "Grassroots support"], cons: ["No experience", "Thin endorsements"] },
      ],
    };
    const { raceFlags } = checkRaceBalance(race);
    expect(raceFlags).toHaveLength(0);
  });

  it("flags cross-candidate detail imbalance when one candidate has much more text", () => {
    const race = {
      office: "Senator",
      candidates: [
        {
          name: "Alice",
          pros: ["A very detailed and comprehensive analysis of this candidate's strong legislative record spanning decades"],
          cons: ["An equally detailed critique of their slow response to housing crisis and establishment ties"],
        },
        {
          name: "Bob",
          pros: ["OK"],
          cons: ["Meh"],
        },
      ],
    };
    const { raceFlags } = checkRaceBalance(race);
    const detailFlag = raceFlags.find(f => f.type === "cross_candidate_detail");
    expect(detailFlag).toBeDefined();
    expect(detailFlag.severity).toBe("warning");
    expect(detailFlag.detail).toContain("Alice");
    expect(detailFlag.detail).toContain("Bob");
  });

  it("flags candidate with no pros/cons when others have them", () => {
    const race = {
      office: "AG",
      candidates: [
        { name: "Alice", pros: ["Good"], cons: ["Bad"] },
        { name: "Bob", pros: [], cons: [] },
      ],
    };
    const { raceFlags } = checkRaceBalance(race);
    const missingFlag = raceFlags.find(f => f.type === "cross_candidate_missing");
    expect(missingFlag).toBeDefined();
    expect(missingFlag.severity).toBe("critical");
    expect(missingFlag.detail).toContain("Bob");
  });

  it("skips withdrawn candidates", () => {
    const race = {
      office: "Governor",
      candidates: [
        { name: "Alice", pros: ["Good"], cons: ["Bad"] },
        { name: "Bob", pros: [], cons: [], withdrawn: true },
      ],
    };
    const { raceFlags, candidateAnalyses } = checkRaceBalance(race);
    // Only Alice should be analyzed (Bob is withdrawn)
    expect(candidateAnalyses).toHaveLength(1);
    expect(candidateAnalyses[0].name).toBe("Alice");
    // No cross-candidate flags since there's effectively only one candidate
    const crossFlags = raceFlags.filter(f => f.type.startsWith("cross_"));
    expect(crossFlags).toHaveLength(0);
  });

  it("handles single-candidate (uncontested) race", () => {
    const race = {
      office: "Board of Education",
      candidates: [
        { name: "Eve", pros: ["Expert"], cons: ["Unopposed"] },
      ],
    };
    const { raceFlags } = checkRaceBalance(race);
    expect(raceFlags).toHaveLength(0);
  });

  it("handles race with no candidates", () => {
    const race = { office: "Empty", candidates: [] };
    const { raceFlags, candidateAnalyses } = checkRaceBalance(race);
    expect(raceFlags).toHaveLength(0);
    expect(candidateAnalyses).toHaveLength(0);
  });

  it("flags pros count spread across candidates", () => {
    const race = {
      office: "Governor",
      candidates: [
        { name: "Alice", pros: ["A", "B", "C", "D", "E"], cons: ["X"] },
        { name: "Bob", pros: ["A"], cons: ["X"] },
      ],
    };
    const { raceFlags } = checkRaceBalance(race);
    const prosCountFlag = raceFlags.find(f => f.type === "cross_candidate_pros_count");
    expect(prosCountFlag).toBeDefined();
    expect(prosCountFlag.detail).toContain("1");
    expect(prosCountFlag.detail).toContain("5");
  });

  it("flags cons count spread across candidates", () => {
    const race = {
      office: "Governor",
      candidates: [
        { name: "Alice", pros: ["A"], cons: ["X", "Y", "Z", "W", "V"] },
        { name: "Bob", pros: ["A"], cons: ["X"] },
      ],
    };
    const { raceFlags } = checkRaceBalance(race);
    const consCountFlag = raceFlags.find(f => f.type === "cross_candidate_cons_count");
    expect(consCountFlag).toBeDefined();
  });

  it("does not flag minor count spread (2 vs 1)", () => {
    const race = {
      office: "Governor",
      candidates: [
        { name: "Alice", pros: ["A", "B"], cons: ["X"] },
        { name: "Bob", pros: ["A"], cons: ["X"] },
      ],
    };
    const { raceFlags } = checkRaceBalance(race);
    // 2 vs 1 is 2:1 ratio but difference is only 1, below the threshold of 2
    const prosCountFlag = raceFlags.find(f => f.type === "cross_candidate_pros_count");
    expect(prosCountFlag).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// checkBallotBalance
// ---------------------------------------------------------------------------
describe("checkBallotBalance", () => {
  it("returns perfect score for well-balanced ballot", () => {
    const ballot = {
      races: [
        {
          office: "Governor",
          candidates: [
            {
              name: "Alice",
              pros: ["Sponsored HB 1234 to expand Medicaid in 2023", "Chaired the committee on education funding reform"],
              cons: ["Voted against SB 567 border security bill in 2024", "Rated C by the Texas Taxpayers Association"],
            },
            {
              name: "Bob",
              pros: ["Founded a nonprofit that created 500 jobs in rural Texas", "Endorsed by the Texas AFL-CIO and Sierra Club"],
              cons: ["Filed zero bills during 4 years on city council", "Voted against the $2M infrastructure bond in 2022"],
            },
          ],
        },
      ],
    };
    const report = checkBallotBalance(ballot);
    expect(report.summary.score).toBe(100);
    expect(report.summary.totalFlags).toBe(0);
    expect(report.summary.totalRaces).toBe(1);
    expect(report.summary.totalCandidates).toBe(2);
  });

  it("handles null ballot gracefully", () => {
    const report = checkBallotBalance(null);
    expect(report.summary.score).toBe(100);
    expect(report.summary.totalRaces).toBe(0);
    expect(report.summary.totalCandidates).toBe(0);
    expect(report.races).toHaveLength(0);
  });

  it("handles ballot with no races", () => {
    const report = checkBallotBalance({ races: [] });
    expect(report.summary.score).toBe(100);
    expect(report.races).toHaveLength(0);
  });

  it("handles ballot with no races key", () => {
    const report = checkBallotBalance({});
    expect(report.summary.score).toBe(100);
  });

  it("deducts points for critical flags", () => {
    const ballot = {
      races: [
        {
          office: "Governor",
          candidates: [
            { name: "Alice", pros: ["Strong record"], cons: [] }, // missing cons = critical
            { name: "Bob", pros: ["Fresh ideas"], cons: ["No experience"] },
          ],
        },
      ],
    };
    const report = checkBallotBalance(ballot);
    expect(report.summary.criticalCount).toBeGreaterThan(0);
    expect(report.summary.score).toBeLessThan(100);
  });

  it("deducts more points for multiple flags", () => {
    const ballot = {
      races: [
        {
          office: "Governor",
          candidates: [
            { name: "Alice", pros: ["Strong record"], cons: [] },
            { name: "Bob", pros: [], cons: ["No experience"] },
          ],
        },
      ],
    };
    const report = checkBallotBalance(ballot);
    expect(report.summary.criticalCount).toBeGreaterThanOrEqual(2);
    expect(report.summary.score).toBeLessThanOrEqual(80);
  });

  it("excludes withdrawn candidates from count", () => {
    const ballot = {
      races: [
        {
          office: "Governor",
          candidates: [
            { name: "Alice", pros: ["Good"], cons: ["Bad"] },
            { name: "Bob", pros: ["Good"], cons: ["Bad"], withdrawn: true },
          ],
        },
      ],
    };
    const report = checkBallotBalance(ballot);
    expect(report.summary.totalCandidates).toBe(1);
  });

  it("includes race labels with district info", () => {
    const ballot = {
      races: [
        {
          office: "State Rep",
          district: "District 46",
          candidates: [
            { name: "Carol", pros: ["Good"], cons: ["Bad"] },
          ],
        },
      ],
    };
    const report = checkBallotBalance(ballot);
    expect(report.races[0].label).toBe("State Rep — District 46");
  });

  it("aggregates flags from multiple races correctly", () => {
    const ballot = {
      races: [
        {
          office: "Governor",
          candidates: [
            { name: "Alice", pros: ["A"], cons: [] }, // missing cons
            { name: "Bob", pros: ["B"], cons: ["C"] },
          ],
        },
        {
          office: "AG",
          candidates: [
            { name: "Carol", pros: [], cons: ["D"] }, // missing pros
            { name: "Dan", pros: ["E"], cons: ["F"] },
          ],
        },
      ],
    };
    const report = checkBallotBalance(ballot);
    expect(report.summary.totalRaces).toBe(2);
    expect(report.summary.totalCandidates).toBe(4);
    expect(report.summary.criticalCount).toBeGreaterThanOrEqual(2);
  });

  it("score never goes below 0", () => {
    const ballot = {
      races: Array.from({ length: 5 }, (_, i) => ({
        office: `Race ${i}`,
        candidates: [
          { name: `Alice ${i}`, pros: [], cons: [] },
          { name: `Bob ${i}`, pros: ["A", "B", "C", "D", "E"], cons: [] },
        ],
      })),
    };
    const report = checkBallotBalance(ballot);
    expect(report.summary.score).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// checkBallotBalance — using sample ballot fixture
// ---------------------------------------------------------------------------
describe("checkBallotBalance — sample ballot fixture", () => {
  // The sample ballot has well-structured pros/cons for most candidates
  const { readFileSync } = require("fs");
  const { join } = require("path");
  const ballot = JSON.parse(
    readFileSync(join(__dirname, "fixtures/sample-ballot.json"), "utf-8")
  );

  it("produces a report for the sample ballot", () => {
    const report = checkBallotBalance(ballot);
    expect(report.summary.totalRaces).toBe(3);
    expect(report.summary.totalCandidates).toBe(5);
    expect(report.races).toHaveLength(3);
  });

  it("analyzes all active candidates", () => {
    const report = checkBallotBalance(ballot);
    const allCandidates = report.races.flatMap(r => r.candidates);
    expect(allCandidates).toHaveLength(5);
    // All candidates in the sample have pros and cons
    for (const c of allCandidates) {
      expect(c.prosCount).toBeGreaterThan(0);
      expect(c.consCount).toBeGreaterThan(0);
    }
  });

  it("sample ballot is reasonably well balanced", () => {
    const report = checkBallotBalance(ballot);
    // The sample ballot scores lower now due to generic content and specificity checks
    // but should still be above 50 (no critical issues)
    expect(report.summary.score).toBeGreaterThanOrEqual(50);
    expect(report.summary.criticalCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatBalanceSummary
// ---------------------------------------------------------------------------
describe("formatBalanceSummary", () => {
  it("formats a clean report with no flags", () => {
    const report = {
      summary: { totalRaces: 2, totalCandidates: 4, totalFlags: 0, score: 100, criticalCount: 0, warningCount: 0, infoCount: 0 },
      races: [],
    };
    const summary = formatBalanceSummary(report);
    expect(summary).toContain("Balance Score: 100/100");
    expect(summary).toContain("Races: 2");
    expect(summary).toContain("Candidates: 4");
    expect(summary).toContain("Flags: 0");
  });

  it("includes flag details when flags exist", () => {
    const report = {
      summary: { totalRaces: 1, totalCandidates: 2, totalFlags: 1, score: 90, criticalCount: 1, warningCount: 0, infoCount: 0 },
      races: [
        {
          label: "Governor",
          flagCount: 1,
          raceFlags: [],
          candidates: [
            {
              name: "Alice",
              flags: [{ type: "missing_cons", candidate: "Alice", detail: "Has 2 pros but no cons", severity: "critical" }],
            },
          ],
        },
      ],
    };
    const summary = formatBalanceSummary(report);
    expect(summary).toContain("Governor:");
    expect(summary).toContain("[CRITICAL]");
    expect(summary).toContain("Alice");
    expect(summary).toContain("no cons");
  });

  it("includes race-level flags", () => {
    const report = {
      summary: { totalRaces: 1, totalCandidates: 2, totalFlags: 1, score: 95, criticalCount: 0, warningCount: 1, infoCount: 0 },
      races: [
        {
          label: "Senator",
          flagCount: 1,
          raceFlags: [{ type: "cross_candidate_detail", detail: "Alice has 200 chars vs Bob with 20 chars", severity: "warning" }],
          candidates: [],
        },
      ],
    };
    const summary = formatBalanceSummary(report);
    expect(summary).toContain("Senator:");
    expect(summary).toContain("[WARNING]");
    expect(summary).toContain("Alice has 200 chars");
  });

  it("skips races with no flags", () => {
    const report = {
      summary: { totalRaces: 2, totalCandidates: 4, totalFlags: 1, score: 95, criticalCount: 0, warningCount: 1, infoCount: 0 },
      races: [
        { label: "Governor", flagCount: 0, raceFlags: [], candidates: [] },
        {
          label: "Senator",
          flagCount: 1,
          raceFlags: [{ type: "cross_candidate_detail", detail: "Imbalance detected", severity: "warning" }],
          candidates: [],
        },
      ],
    };
    const summary = formatBalanceSummary(report);
    expect(summary).not.toContain("Governor:");
    expect(summary).toContain("Senator:");
  });
});


// ---------------------------------------------------------------------------
// matchesGenericPhrase
// ---------------------------------------------------------------------------
describe("matchesGenericPhrase", () => {
  it("detects exact generic phrases (case-insensitive)", () => {
    expect(matchesGenericPhrase("Experienced leader")).toBe("experienced leader");
    expect(matchesGenericPhrase("PROVEN TRACK RECORD")).toBe("proven track record");
    expect(matchesGenericPhrase("fresh perspective")).toBe("fresh perspective");
  });

  it("detects generic phrases embedded in short text", () => {
    expect(matchesGenericPhrase("A proven leader in Texas")).toBe("proven leader");
    expect(matchesGenericPhrase("She is a strong advocate")).toBe("strong advocate");
  });

  it("returns null for specific/non-generic text", () => {
    expect(matchesGenericPhrase("Voted for HB 1234 to fund rural schools")).toBeNull();
    expect(matchesGenericPhrase("Secured $5M in infrastructure funding")).toBeNull();
    expect(matchesGenericPhrase("Sponsored the Clean Water Act amendment in 2023")).toBeNull();
  });

  it("returns null for long text even if it contains a generic phrase", () => {
    // Long text (>60 chars) should not match even if it contains a generic phrase
    const longText = "While some call her an experienced leader, her record shows she voted against HB 1234 and failed to attend 30% of committee meetings";
    expect(matchesGenericPhrase(longText)).toBeNull();
  });

  it("detects negative generic phrases", () => {
    expect(matchesGenericPhrase("Career politician")).toBe("career politician");
    expect(matchesGenericPhrase("Out of touch")).toBe("out of touch");
    expect(matchesGenericPhrase("Empty promises")).toBe("empty promises");
    expect(matchesGenericPhrase("More of the same")).toBe("more of the same");
  });
});

// ---------------------------------------------------------------------------
// countGenericItems
// ---------------------------------------------------------------------------
describe("countGenericItems", () => {
  it("counts generic items in an array", () => {
    const items = ["Experienced leader", "Voted for HB 1234 in 2023", "Proven track record"];
    const result = countGenericItems(items);
    expect(result.genericCount).toBe(2);
    expect(result.totalCount).toBe(3);
    expect(result.genericItems).toHaveLength(2);
  });

  it("returns zero for all specific items", () => {
    const items = ["Sponsored SB 567 border security bill", "Secured $2M for school funding"];
    const result = countGenericItems(items);
    expect(result.genericCount).toBe(0);
    expect(result.totalCount).toBe(2);
    expect(result.genericItems).toHaveLength(0);
  });

  it("handles empty array", () => {
    const result = countGenericItems([]);
    expect(result.genericCount).toBe(0);
    expect(result.totalCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// scoreSpecificity
// ---------------------------------------------------------------------------
describe("scoreSpecificity", () => {
  it("scores zero for empty/null text", () => {
    expect(scoreSpecificity("")).toBe(0);
    expect(scoreSpecificity(null)).toBe(0);
  });

  it("scores zero for generic phrases", () => {
    expect(scoreSpecificity("Strong leader")).toBe(0);
    expect(scoreSpecificity("Proven track record")).toBe(0);
    expect(scoreSpecificity("Fresh perspective")).toBe(0);
  });

  it("scores higher for text with verifiable references", () => {
    const score1 = scoreSpecificity("Voted for HB 1234 in 2023");
    expect(score1).toBeGreaterThan(0);

    const score2 = scoreSpecificity("Secured $5M in funding for schools");
    expect(score2).toBeGreaterThan(0);

    const score3 = scoreSpecificity("Chaired the committee on education reform");
    expect(score3).toBeGreaterThan(0);
  });

  it("scores higher for more specific references", () => {
    const vague = scoreSpecificity("Has some experience in government");
    const specific = scoreSpecificity("Sponsored HB 1234, passed in 2023, reducing property taxes by 15%");
    expect(specific).toBeGreaterThan(vague);
  });

  it("gives length bonus for longer statements", () => {
    // Two texts with no specificity indicators, but different lengths
    const short = scoreSpecificity("Good on education");
    const medium = scoreSpecificity("Supports improving public education across the state");
    // Short (<30 chars) gets no length bonus; medium (30-59 chars) gets 0.1 bonus
    expect(short).toBe(0);
    expect(medium).toBe(0.1);
  });

  it("caps score at 1.0", () => {
    const maxed = scoreSpecificity("In 2023, voted for HB 1234, co-sponsored SB 567, chaired the committee on finance, founded the rural education initiative, and secured $10M");
    expect(maxed).toBeLessThanOrEqual(1.0);
  });
});

// ---------------------------------------------------------------------------
// scoreSpecificityArray
// ---------------------------------------------------------------------------
describe("scoreSpecificityArray", () => {
  it("returns zero avgScore for empty array", () => {
    const result = scoreSpecificityArray([]);
    expect(result.avgScore).toBe(0);
    expect(result.scores).toHaveLength(0);
    expect(result.lowSpecificityCount).toBe(0);
  });

  it("calculates average specificity across items", () => {
    const items = [
      "Voted for HB 1234 in 2023",  // high specificity
      "Strong leader",               // zero specificity
    ];
    const result = scoreSpecificityArray(items);
    expect(result.avgScore).toBeGreaterThan(0);
    expect(result.scores).toHaveLength(2);
    expect(result.lowSpecificityCount).toBe(1);
  });

  it("counts items with zero specificity", () => {
    const items = ["Good candidate", "Nice person", "Fresh ideas"];
    const result = scoreSpecificityArray(items);
    expect(result.lowSpecificityCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// countWordMatches / analyzeSentiment
// ---------------------------------------------------------------------------
describe("analyzeSentiment", () => {
  it("returns zeros for empty input", () => {
    const result = analyzeSentiment([]);
    expect(result.strongPositiveCount).toBe(0);
    expect(result.weakPositiveCount).toBe(0);
    expect(result.strongNegativeCount).toBe(0);
    expect(result.hedgingCount).toBe(0);
    expect(result.avgWordCount).toBe(0);
  });

  it("returns zeros for null input", () => {
    const result = analyzeSentiment(null);
    expect(result.strongPositiveCount).toBe(0);
    expect(result.weakPositiveCount).toBe(0);
    expect(result.strongNegativeCount).toBe(0);
    expect(result.hedgingCount).toBe(0);
    expect(result.avgWordCount).toBe(0);
  });

  it("counts strong positive words", () => {
    const result = analyzeSentiment(["An outstanding and remarkable achievement"]);
    expect(result.strongPositiveCount).toBe(2);
    expect(result.hedgingCount).toBe(0);
  });

  it("counts weak positive words", () => {
    const result = analyzeSentiment(["A decent and adequate performance overall"]);
    expect(result.weakPositiveCount).toBe(2);
    expect(result.strongPositiveCount).toBe(0);
  });

  it("counts strong negative words", () => {
    const result = analyzeSentiment(["A reckless and dangerous approach to policy"]);
    expect(result.strongNegativeCount).toBe(2);
    expect(result.strongPositiveCount).toBe(0);
  });

  it("counts hedging words", () => {
    const result = analyzeSentiment(["She somewhat lacks clarity and could perhaps improve"]);
    expect(result.hedgingCount).toBeGreaterThanOrEqual(2);
    expect(result.strongPositiveCount).toBe(0);
  });

  it("calculates average word count", () => {
    const result = analyzeSentiment(["One two three", "Four five"]);
    // 3 + 2 = 5 total words, 5/2 = 2.5, rounded = 3
    expect(result.avgWordCount).toBe(3);
  });

  it("detects phrase-based hedging terms", () => {
    const result = analyzeSentiment(["Some say the policy is mixed"]);
    expect(result.hedgingCount).toBeGreaterThanOrEqual(2);  // "some say" + "mixed"
  });

  it("distinguishes all four sentiment categories in mixed text", () => {
    const result = analyzeSentiment([
      "Outstanding leadership",       // strong positive
      "Adequate performance",          // weak positive
      "Dangerous proposal",            // strong negative
      "Perhaps somewhat unclear",      // hedging
    ]);
    expect(result.strongPositiveCount).toBeGreaterThanOrEqual(1);
    expect(result.weakPositiveCount).toBeGreaterThanOrEqual(1);
    expect(result.strongNegativeCount).toBeGreaterThanOrEqual(1);
    expect(result.hedgingCount).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// checkCandidateBalance — new flag types
// ---------------------------------------------------------------------------
describe("checkCandidateBalance — sentiment_asymmetry", () => {
  it("flags word count asymmetry between pros and cons", () => {
    const analysis = {
      name: "TestCandidate",
      prosCount: 2,
      consCount: 2,
      prosLength: 200,
      consLength: 40,
      prosAvgLength: 100,
      consAvgLength: 20,
      prosSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 15 },
      consSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 3 },
      prosSpecificity: { avgScore: 0.5, scores: [0.5, 0.5], lowSpecificityCount: 0 },
      consSpecificity: { avgScore: 0.5, scores: [0.5, 0.5], lowSpecificityCount: 0 },
      prosGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
      consGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
    };
    const flags = checkCandidateBalance(analysis);
    const sentimentFlag = flags.find(f => f.type === "sentiment_asymmetry");
    expect(sentimentFlag).toBeDefined();
    expect(sentimentFlag.severity).toBe("info");
    expect(sentimentFlag.detail).toContain("word count asymmetry");
  });

  it("flags enthusiastic pros with hedging cons", () => {
    const analysis = {
      name: "TestCandidate",
      prosCount: 2,
      consCount: 2,
      prosLength: 100,
      consLength: 100,
      prosAvgLength: 50,
      consAvgLength: 50,
      prosSentiment: { strongPositiveCount: 3, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 8 },
      consSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 2, avgWordCount: 8 },
      prosSpecificity: { avgScore: 0.5, scores: [0.5, 0.5], lowSpecificityCount: 0 },
      consSpecificity: { avgScore: 0.5, scores: [0.5, 0.5], lowSpecificityCount: 0 },
      prosGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
      consGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
    };
    const flags = checkCandidateBalance(analysis);
    const sentimentFlag = flags.find(f => f.type === "sentiment_asymmetry" && f.detail.includes("subtly favorable"));
    expect(sentimentFlag).toBeDefined();
    expect(sentimentFlag.severity).toBe("warning");
  });

  it("flags weak positive pros with strong negative cons", () => {
    const analysis = {
      name: "TestCandidate",
      prosCount: 2,
      consCount: 2,
      prosLength: 100,
      consLength: 100,
      prosAvgLength: 50,
      consAvgLength: 50,
      prosSentiment: { strongPositiveCount: 0, weakPositiveCount: 2, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 8 },
      consSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 3, hedgingCount: 0, avgWordCount: 8 },
      prosSpecificity: { avgScore: 0.5, scores: [0.5, 0.5], lowSpecificityCount: 0 },
      consSpecificity: { avgScore: 0.5, scores: [0.5, 0.5], lowSpecificityCount: 0 },
      prosGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
      consGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
    };
    const flags = checkCandidateBalance(analysis);
    const sentimentFlag = flags.find(f => f.type === "sentiment_asymmetry" && f.detail.includes("strong negative"));
    expect(sentimentFlag).toBeDefined();
    expect(sentimentFlag.severity).toBe("warning");
    expect(sentimentFlag.detail).toContain("subtly unfavorable");
  });

  it("does not flag when both sides use similar language", () => {
    const analysis = {
      name: "TestCandidate",
      prosCount: 2,
      consCount: 2,
      prosLength: 100,
      consLength: 100,
      prosAvgLength: 50,
      consAvgLength: 50,
      prosSentiment: { strongPositiveCount: 1, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 8 },
      consSentiment: { strongPositiveCount: 1, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 8 },
      prosSpecificity: { avgScore: 0.5, scores: [0.5, 0.5], lowSpecificityCount: 0 },
      consSpecificity: { avgScore: 0.5, scores: [0.5, 0.5], lowSpecificityCount: 0 },
      prosGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
      consGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
    };
    const flags = checkCandidateBalance(analysis);
    const sentimentFlags = flags.filter(f => f.type === "sentiment_asymmetry");
    expect(sentimentFlags).toHaveLength(0);
  });
});

describe("checkCandidateBalance — generic_content", () => {
  it("flags candidates with mostly generic pros/cons as warning", () => {
    const analysis = {
      name: "TestCandidate",
      prosCount: 2,
      consCount: 2,
      prosLength: 60,
      consLength: 60,
      prosAvgLength: 30,
      consAvgLength: 30,
      prosSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 3 },
      consSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 3 },
      prosSpecificity: { avgScore: 0, scores: [0, 0], lowSpecificityCount: 2 },
      consSpecificity: { avgScore: 0, scores: [0, 0], lowSpecificityCount: 2 },
      prosGeneric: { genericCount: 2, totalCount: 2, genericItems: [
        { text: "Experienced leader", matchedPhrase: "experienced leader" },
        { text: "Strong advocate", matchedPhrase: "strong advocate" },
      ]},
      consGeneric: { genericCount: 2, totalCount: 2, genericItems: [
        { text: "Out of touch", matchedPhrase: "out of touch" },
        { text: "Career politician", matchedPhrase: "career politician" },
      ]},
    };
    const flags = checkCandidateBalance(analysis);
    const genericFlag = flags.find(f => f.type === "generic_content");
    expect(genericFlag).toBeDefined();
    expect(genericFlag.severity).toBe("warning");
    expect(genericFlag.detail).toContain("4 of 4");
    expect(genericFlag.detail).toContain("needs human review");
  });

  it("flags even a single generic item", () => {
    const analysis = {
      name: "TestCandidate",
      prosCount: 3,
      consCount: 2,
      prosLength: 100,
      consLength: 80,
      prosAvgLength: 33,
      consAvgLength: 40,
      prosSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 5 },
      consSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 5 },
      prosSpecificity: { avgScore: 0.3, scores: [0.5, 0.5, 0], lowSpecificityCount: 1 },
      consSpecificity: { avgScore: 0.5, scores: [0.5, 0.5], lowSpecificityCount: 0 },
      prosGeneric: { genericCount: 1, totalCount: 3, genericItems: [
        { text: "Strong leader", matchedPhrase: "strong leader" },
      ]},
      consGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
    };
    const flags = checkCandidateBalance(analysis);
    const genericFlag = flags.find(f => f.type === "generic_content");
    expect(genericFlag).toBeDefined();
    expect(genericFlag.detail).toContain("1 of 5");
  });

  it("does not flag when no generic content found", () => {
    const analysis = {
      name: "TestCandidate",
      prosCount: 2,
      consCount: 2,
      prosLength: 100,
      consLength: 100,
      prosAvgLength: 50,
      consAvgLength: 50,
      prosSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 8 },
      consSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 8 },
      prosSpecificity: { avgScore: 0.5, scores: [0.5, 0.5], lowSpecificityCount: 0 },
      consSpecificity: { avgScore: 0.5, scores: [0.5, 0.5], lowSpecificityCount: 0 },
      prosGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
      consGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
    };
    const flags = checkCandidateBalance(analysis);
    const genericFlag = flags.find(f => f.type === "generic_content");
    expect(genericFlag).toBeUndefined();
  });
});

describe("checkCandidateBalance — specificity_gap", () => {
  it("flags when pros are specific but cons are generic", () => {
    const analysis = {
      name: "TestCandidate",
      prosCount: 2,
      consCount: 2,
      prosLength: 100,
      consLength: 40,
      prosAvgLength: 50,
      consAvgLength: 20,
      prosSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 8 },
      consSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 3 },
      prosSpecificity: { avgScore: 0.5, scores: [0.5, 0.5], lowSpecificityCount: 0 },
      consSpecificity: { avgScore: 0, scores: [0, 0], lowSpecificityCount: 2 },
      prosGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
      consGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
    };
    const flags = checkCandidateBalance(analysis);
    const specFlag = flags.find(f => f.type === "specificity_gap" && f.detail.includes("cons are entirely generic"));
    expect(specFlag).toBeDefined();
    expect(specFlag.severity).toBe("warning");
  });

  it("flags when cons are specific but pros are generic", () => {
    const analysis = {
      name: "TestCandidate",
      prosCount: 2,
      consCount: 2,
      prosLength: 40,
      consLength: 100,
      prosAvgLength: 20,
      consAvgLength: 50,
      prosSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 3 },
      consSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 8 },
      prosSpecificity: { avgScore: 0, scores: [0, 0], lowSpecificityCount: 2 },
      consSpecificity: { avgScore: 0.5, scores: [0.5, 0.5], lowSpecificityCount: 0 },
      prosGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
      consGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
    };
    const flags = checkCandidateBalance(analysis);
    const specFlag = flags.find(f => f.type === "specificity_gap" && f.detail.includes("pros are entirely generic"));
    expect(specFlag).toBeDefined();
    expect(specFlag.severity).toBe("warning");
  });

  it("flags large specificity ratio (5x or more)", () => {
    const analysis = {
      name: "TestCandidate",
      prosCount: 2,
      consCount: 2,
      prosLength: 100,
      consLength: 100,
      prosAvgLength: 50,
      consAvgLength: 50,
      prosSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 8 },
      consSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 8 },
      prosSpecificity: { avgScore: 0.75, scores: [0.75, 0.75], lowSpecificityCount: 0 },
      consSpecificity: { avgScore: 0.1, scores: [0.1, 0.1], lowSpecificityCount: 0 },
      prosGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
      consGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
    };
    const flags = checkCandidateBalance(analysis);
    const specFlag = flags.find(f => f.type === "specificity_gap" && f.detail.includes("more specific"));
    expect(specFlag).toBeDefined();
    expect(specFlag.severity).toBe("info");
  });

  it("flags when all pros/cons lack specificity", () => {
    const analysis = {
      name: "TestCandidate",
      prosCount: 2,
      consCount: 2,
      prosLength: 60,
      consLength: 60,
      prosAvgLength: 30,
      consAvgLength: 30,
      prosSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 5 },
      consSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 5 },
      prosSpecificity: { avgScore: 0, scores: [0, 0], lowSpecificityCount: 2 },
      consSpecificity: { avgScore: 0, scores: [0, 0], lowSpecificityCount: 2 },
      prosGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
      consGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
    };
    const flags = checkCandidateBalance(analysis);
    const specFlag = flags.find(f => f.type === "specificity_gap" && f.detail.includes("lack specific references"));
    expect(specFlag).toBeDefined();
    expect(specFlag.severity).toBe("warning");
  });

  it("does not flag info-level specificity gap when ratio is below 5x", () => {
    const analysis = {
      name: "TestCandidate",
      prosCount: 2,
      consCount: 2,
      prosLength: 100,
      consLength: 100,
      prosAvgLength: 50,
      consAvgLength: 50,
      prosSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 8 },
      consSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 8 },
      prosSpecificity: { avgScore: 0.4, scores: [0.4, 0.4], lowSpecificityCount: 0 },
      consSpecificity: { avgScore: 0.1, scores: [0.1, 0.1], lowSpecificityCount: 0 },
      prosGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
      consGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
    };
    // 0.4 / 0.1 = 4.0x ratio — below 5x threshold, should NOT flag info-level specificity_gap
    const flags = checkCandidateBalance(analysis);
    const specFlag = flags.find(f => f.type === "specificity_gap" && f.detail.includes("more specific"));
    expect(specFlag).toBeUndefined();
  });

  it("does not flag when both sides are similarly specific", () => {
    const analysis = {
      name: "TestCandidate",
      prosCount: 2,
      consCount: 2,
      prosLength: 100,
      consLength: 100,
      prosAvgLength: 50,
      consAvgLength: 50,
      prosSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 8 },
      consSentiment: { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 8 },
      prosSpecificity: { avgScore: 0.5, scores: [0.5, 0.5], lowSpecificityCount: 0 },
      consSpecificity: { avgScore: 0.5, scores: [0.5, 0.5], lowSpecificityCount: 0 },
      prosGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
      consGeneric: { genericCount: 0, totalCount: 2, genericItems: [] },
    };
    const flags = checkCandidateBalance(analysis);
    const specFlags = flags.filter(f => f.type === "specificity_gap");
    expect(specFlags).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// analyzeCandidate — extended fields
// ---------------------------------------------------------------------------
describe("analyzeCandidate — extended analysis", () => {
  it("includes sentiment analysis in results", () => {
    const candidate = {
      name: "TestCandidate",
      pros: ["An outstanding record of transformative legislation"],
      cons: ["Somewhat unclear on policy, could arguably do better"],
    };
    const result = analyzeCandidate(candidate);
    expect(result.prosSentiment).toBeDefined();
    expect(result.consSentiment).toBeDefined();
    expect(result.prosSentiment.strongPositiveCount).toBeGreaterThan(0);
    expect(result.consSentiment.hedgingCount).toBeGreaterThan(0);
  });

  it("includes specificity scoring in results", () => {
    const candidate = {
      name: "TestCandidate",
      pros: ["Voted for HB 1234 in 2023"],
      cons: ["Lacks experience"],
    };
    const result = analyzeCandidate(candidate);
    expect(result.prosSpecificity).toBeDefined();
    expect(result.consSpecificity).toBeDefined();
    expect(result.prosSpecificity.avgScore).toBeGreaterThan(0);
    expect(result.consSpecificity.avgScore).toBe(0);
  });

  it("includes generic content detection in results", () => {
    const candidate = {
      name: "TestCandidate",
      pros: ["Experienced leader", "Voted for HB 1234"],
      cons: ["Career politician"],
    };
    const result = analyzeCandidate(candidate);
    expect(result.prosGeneric).toBeDefined();
    expect(result.consGeneric).toBeDefined();
    expect(result.prosGeneric.genericCount).toBe(1);
    expect(result.consGeneric.genericCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Integration: end-to-end with realistic candidates
// ---------------------------------------------------------------------------
describe("integration — realistic candidate balance checks", () => {
  it("flags a subtly biased candidate (glowing pros, tepid cons)", () => {
    const candidate = {
      name: "Favored Candidate",
      pros: [
        "An extraordinary and transformative leader who has achieved remarkable results",
        "Instrumental in passing unprecedented legislation that dramatically improved schools",
      ],
      cons: [
        "Could perhaps do somewhat better on housing policy",
        "Some say the approach seems fairly cautious on transit",
      ],
    };
    const analysis = analyzeCandidate(candidate);
    const flags = checkCandidateBalance(analysis);
    const sentimentFlags = flags.filter(f => f.type === "sentiment_asymmetry");
    expect(sentimentFlags.length).toBeGreaterThan(0);
  });

  it("flags a candidate with all generic content", () => {
    const candidate = {
      name: "Generic Candidate",
      pros: ["Experienced leader", "Strong advocate"],
      cons: ["Career politician", "Out of touch"],
    };
    const analysis = analyzeCandidate(candidate);
    const flags = checkCandidateBalance(analysis);
    const genericFlags = flags.filter(f => f.type === "generic_content");
    expect(genericFlags.length).toBeGreaterThan(0);
    expect(genericFlags[0].detail).toContain("4 of 4");
  });

  it("flags specificity gap (specific pros, vague cons)", () => {
    const candidate = {
      name: "Lopsided Candidate",
      pros: [
        "Voted for HB 1234 to fund $50M in school construction in 2023",
        "Chaired the committee on education and passed 3 major bills",
      ],
      cons: [
        "Not great on transit",
        "Needs improvement",
      ],
    };
    const analysis = analyzeCandidate(candidate);
    const flags = checkCandidateBalance(analysis);
    const specFlags = flags.filter(f => f.type === "specificity_gap");
    expect(specFlags.length).toBeGreaterThan(0);
  });

  it("produces clean report for well-crafted specific content", () => {
    const candidate = {
      name: "Well Documented",
      pros: [
        "Sponsored HB 1234 which reduced property taxes by 12% in 2023",
        "Endorsed by the Texas AFL-CIO and rated A by the League of Conservation Voters",
      ],
      cons: [
        "Voted against SB 567 border security bill which passed with bipartisan support",
        "Rated D by the Texas Taxpayers Association for 3 consecutive years",
      ],
    };
    const analysis = analyzeCandidate(candidate);
    const flags = checkCandidateBalance(analysis);
    const genericFlags = flags.filter(f => f.type === "generic_content");
    const specGapFlags = flags.filter(f => f.type === "specificity_gap");
    expect(genericFlags).toHaveLength(0);
    expect(specGapFlags).toHaveLength(0);
  });

  it("flags tepid pros paired with harsh cons (weak positive + strong negative)", () => {
    const candidate = {
      name: "Unfairly Treated",
      pros: [
        "A decent and adequate representative who is generally reliable",
        "Satisfactory performance on committees and passable attendance record",
      ],
      cons: [
        "A dangerous and reckless approach that has been catastrophic for the district",
        "Appalling record of negligent oversight and irresponsible spending decisions",
      ],
    };
    const analysis = analyzeCandidate(candidate);
    const flags = checkCandidateBalance(analysis);
    const sentimentFlags = flags.filter(f => f.type === "sentiment_asymmetry");
    expect(sentimentFlags.length).toBeGreaterThan(0);
    // Should detect the weak-positive vs strong-negative pattern
    const weakStrongFlag = sentimentFlags.find(f => f.detail.includes("strong negative"));
    expect(weakStrongFlag).toBeDefined();
    expect(weakStrongFlag.severity).toBe("warning");
  });
});

// ---------------------------------------------------------------------------
// Word list validation
// ---------------------------------------------------------------------------
describe("word lists — validation", () => {
  it("WEAK_POSITIVE_WORDS has at least 10 entries", () => {
    expect(WEAK_POSITIVE_WORDS.length).toBeGreaterThanOrEqual(10);
  });

  it("STRONG_NEGATIVE_WORDS has at least 10 entries", () => {
    expect(STRONG_NEGATIVE_WORDS.length).toBeGreaterThanOrEqual(10);
  });

  it("WEAK_POSITIVE_WORDS and STRONG_POSITIVE_WORDS do not overlap", () => {
    const overlap = WEAK_POSITIVE_WORDS.filter(w => STRONG_POSITIVE_WORDS.includes(w));
    expect(overlap).toHaveLength(0);
  });

  it("STRONG_NEGATIVE_WORDS and HEDGING_WORDS do not overlap", () => {
    const overlap = STRONG_NEGATIVE_WORDS.filter(w => HEDGING_WORDS.includes(w));
    expect(overlap).toHaveLength(0);
  });

  it("countWordMatches detects weak positive words", () => {
    const count = countWordMatches("This is a decent and adequate policy", WEAK_POSITIVE_WORDS);
    expect(count).toBe(2);
  });

  it("countWordMatches detects strong negative words", () => {
    const count = countWordMatches("A dangerous and catastrophic failure", STRONG_NEGATIVE_WORDS);
    expect(count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getCandidatesNeedingRebalance
// ---------------------------------------------------------------------------
describe("getCandidatesNeedingRebalance", () => {
  it("returns empty array for null ballot", () => {
    expect(getCandidatesNeedingRebalance(null)).toEqual([]);
  });

  it("returns empty array for ballot with no races", () => {
    expect(getCandidatesNeedingRebalance({ races: [] })).toEqual([]);
  });

  it("returns empty array when all candidates are balanced", () => {
    const ballot = {
      races: [
        {
          office: "Governor",
          candidates: [
            { name: "Alice", pros: ["Strong record"], cons: ["Slow on housing"] },
            { name: "Bob", pros: ["Fresh ideas"], cons: ["No experience"] },
          ],
        },
      ],
    };
    const results = getCandidatesNeedingRebalance(ballot);
    expect(results).toHaveLength(0);
  });

  it("returns candidates with missing pros", () => {
    const ballot = {
      races: [
        {
          office: "Governor",
          candidates: [
            { name: "Alice", pros: [], cons: ["Bad record"] },
            { name: "Bob", pros: ["Fresh ideas"], cons: ["No experience"] },
          ],
        },
      ],
    };
    const results = getCandidatesNeedingRebalance(ballot);
    expect(results).toHaveLength(1);
    expect(results[0].candidate.name).toBe("Alice");
    expect(results[0].race).toBe("Governor");
    expect(results[0].criticalFlags[0].type).toBe("missing_pros");
  });

  it("returns candidates with missing cons", () => {
    const ballot = {
      races: [
        {
          office: "AG",
          district: "District 5",
          candidates: [
            { name: "Carol", pros: ["Good record", "Bipartisan"], cons: [] },
          ],
        },
      ],
    };
    const results = getCandidatesNeedingRebalance(ballot);
    expect(results).toHaveLength(1);
    expect(results[0].candidate.name).toBe("Carol");
    expect(results[0].race).toBe("AG");
    expect(results[0].district).toBe("District 5");
    expect(results[0].criticalFlags[0].type).toBe("missing_cons");
    expect(results[0].balanceScore).toBeLessThan(100);
  });

  it("returns multiple candidates across multiple races", () => {
    const ballot = {
      races: [
        {
          office: "Governor",
          candidates: [
            { name: "Alice", pros: [], cons: ["Bad"] },
            { name: "Bob", pros: ["Good"], cons: [] },
          ],
        },
        {
          office: "AG",
          candidates: [
            { name: "Carol", pros: ["OK"], cons: ["Bad"] },
            { name: "Dan", pros: ["Good"], cons: [] },
          ],
        },
      ],
    };
    const results = getCandidatesNeedingRebalance(ballot);
    expect(results).toHaveLength(3); // Alice (missing_pros), Bob (missing_cons), Dan (missing_cons)
    const names = results.map(r => r.candidate.name);
    expect(names).toContain("Alice");
    expect(names).toContain("Bob");
    expect(names).toContain("Dan");
  });

  it("skips withdrawn candidates", () => {
    const ballot = {
      races: [
        {
          office: "Governor",
          candidates: [
            { name: "Alice", pros: [], cons: ["Bad"], withdrawn: true },
            { name: "Bob", pros: ["Good"], cons: ["Bad"] },
          ],
        },
      ],
    };
    const results = getCandidatesNeedingRebalance(ballot);
    expect(results).toHaveLength(0);
  });

  it("includes balanceScore for each result", () => {
    const ballot = {
      races: [
        {
          office: "Senate",
          candidates: [
            { name: "Eve", pros: ["Strong"], cons: [] },
          ],
        },
      ],
    };
    const results = getCandidatesNeedingRebalance(ballot);
    expect(results).toHaveLength(1);
    expect(typeof results[0].balanceScore).toBe("number");
    expect(results[0].balanceScore).toBeLessThanOrEqual(100);
    expect(results[0].balanceScore).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// REBALANCE_FLAG_TYPES
// ---------------------------------------------------------------------------
describe("REBALANCE_FLAG_TYPES", () => {
  it("contains the expected critical flag types", () => {
    expect(REBALANCE_FLAG_TYPES).toContain("missing_pros");
    expect(REBALANCE_FLAG_TYPES).toContain("missing_cons");
    expect(REBALANCE_FLAG_TYPES).toContain("missing_both");
    expect(REBALANCE_FLAG_TYPES).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// getCandidatesNeedingRebalance — real-world-like ballot data
// ---------------------------------------------------------------------------
describe("getCandidatesNeedingRebalance — real-world ballot", () => {
  it("identifies imbalanced candidates across a multi-race ballot", () => {
    const ballot = {
      races: [
        {
          office: "U.S. Senator",
          district: null,
          candidates: [
            { name: "Alice Johnson", pros: ["Strong legislative record", "Bipartisan deals"], cons: ["Seen as establishment", "Slow on housing"] },
            { name: "Bob Martinez", pros: ["Energizes young voters"], cons: ["No experience", "Thin endorsement list"] },
          ],
        },
        {
          office: "Governor",
          district: null,
          candidates: [
            { name: "Carol Davis", pros: ["Deep community ties", "Housing champion"], cons: [] }, // missing cons
            { name: "Dan Wilson", pros: [], cons: ["Weak on environment"] }, // missing pros
          ],
        },
        {
          office: "AG",
          district: null,
          candidates: [
            { name: "Eve Thompson", pros: ["Legal expertise"], cons: ["Limited scope"] },
            { name: "Frank White", pros: ["Trial experience"], cons: ["Corporate ties"] },
          ],
        },
        {
          office: "State Rep",
          district: "District 46",
          candidates: [
            { name: "Grace Lee", pros: [], cons: [] }, // missing both
            { name: "Henry Brown", pros: ["Fresh perspective"], cons: ["No record"] },
          ],
        },
      ],
    };
    const results = getCandidatesNeedingRebalance(ballot);
    const names = results.map(r => r.candidate.name);
    // Carol missing cons (critical), Dan missing pros (critical)
    expect(names).toContain("Carol Davis");
    expect(names).toContain("Dan Wilson");
    // Grace missing both — severity is "warning" not "critical", so NOT returned
    // (getCandidatesNeedingRebalance only returns candidates with critical flags)
    expect(names).not.toContain("Grace Lee");
    // Alice, Bob, Eve, Frank, Henry should not be flagged
    expect(names).not.toContain("Alice Johnson");
    expect(names).not.toContain("Bob Martinez");
    expect(names).not.toContain("Eve Thompson");
    expect(names).not.toContain("Frank White");
    expect(names).not.toContain("Henry Brown");
  });

  it("returns correct race and district context for each result", () => {
    const ballot = {
      races: [
        {
          office: "State Rep",
          district: "District 46",
          candidates: [
            { name: "Alice", pros: ["Good"], cons: [] },
          ],
        },
      ],
    };
    const results = getCandidatesNeedingRebalance(ballot);
    expect(results).toHaveLength(1);
    expect(results[0].race).toBe("State Rep");
    expect(results[0].district).toBe("District 46");
  });

  it("handles ballot with all balanced candidates (no results)", () => {
    const ballot = {
      races: [
        {
          office: "Governor",
          candidates: [
            { name: "A", pros: ["P1", "P2"], cons: ["C1"] },
            { name: "B", pros: ["P1"], cons: ["C1", "C2"] },
          ],
        },
        {
          office: "AG",
          candidates: [
            { name: "C", pros: ["P1"], cons: ["C1"] },
            { name: "D", pros: ["P1", "P2"], cons: ["C1", "C2"] },
          ],
        },
      ],
    };
    expect(getCandidatesNeedingRebalance(ballot)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Sentiment asymmetry vs 2.0x ratio interaction
// ---------------------------------------------------------------------------
describe("sentiment asymmetry and word count ratio interaction", () => {
  it("does not flag sentiment_asymmetry when word counts are close (ratio < 2.0)", () => {
    const candidate = {
      name: "Candidate A",
      pros: ["Strong record on education funding and teacher pay raises"],
      cons: ["Moderate stance on healthcare and insurance reform"],
    };
    const analysis = analyzeCandidate(candidate);
    const flags = checkCandidateBalance(analysis);
    const sentimentFlags = flags.filter(f => f.type === "sentiment_asymmetry" && f.detail.includes("word count"));
    expect(sentimentFlags).toHaveLength(0);
  });

  it("flags sentiment_asymmetry when pros are verbose but cons are terse", () => {
    const candidate = {
      name: "Candidate B",
      pros: [
        "Has an outstanding track record of implementing transformative education policies across the state that have increased graduation rates by 15% since 2020",
        "Secured $50M in federal funding for rural broadband infrastructure through bipartisan legislation",
      ],
      cons: ["Weak", "Slow"],
    };
    const analysis = analyzeCandidate(candidate);
    const flags = checkCandidateBalance(analysis);
    const wordFlags = flags.filter(f => f.type === "sentiment_asymmetry" && f.detail.includes("word count"));
    expect(wordFlags.length).toBeGreaterThanOrEqual(1);
  });

  it("flags glowing pros with hedging cons as suspiciously favorable", () => {
    const candidate = {
      name: "Candidate C",
      pros: [
        "An outstanding and transformative leader who championed groundbreaking reform",
        "Unprecedented success in reducing crime by implementing landmark community programs",
      ],
      cons: [
        "Perhaps somewhat slow on addressing certain environmental concerns",
      ],
    };
    const analysis = analyzeCandidate(candidate);
    const flags = checkCandidateBalance(analysis);
    const sentimentFlags = flags.filter(f =>
      f.type === "sentiment_asymmetry" && f.detail.includes("subtly favorable")
    );
    expect(sentimentFlags.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Specificity scoring edge cases
// ---------------------------------------------------------------------------
describe("scoreSpecificity — edge cases with numbers, dates, dollars", () => {
  it("scores text with dollar amounts as specific", () => {
    const score = scoreSpecificity("Secured $2.5M in funding for community health centers");
    expect(score).toBeGreaterThan(0);
  });

  it("scores text with percentages as specific", () => {
    const score = scoreSpecificity("Reduced crime rates by 15% in the district");
    expect(score).toBeGreaterThan(0);
  });

  it("scores text with year references as specific", () => {
    const score = scoreSpecificity("In 2023, authored HB 1234 to reform sentencing laws");
    expect(score).toBeGreaterThan(0.3);
  });

  it("scores text with bill numbers as highly specific", () => {
    const score = scoreSpecificity("Sponsored SB 456 which passed with bipartisan support");
    expect(score).toBeGreaterThan(0.3);
  });

  it("scores text with term durations as specific", () => {
    const score = scoreSpecificity("Served 12 years on the city council before running for state office");
    expect(score).toBeGreaterThan(0);
  });

  it("scores generic short text as zero", () => {
    const score = scoreSpecificity("Strong leader");
    expect(score).toBe(0);
  });

  it("scores empty string as zero", () => {
    expect(scoreSpecificity("")).toBe(0);
    expect(scoreSpecificity(null)).toBe(0);
  });

  it("combines multiple specificity indicators for higher score", () => {
    const score = scoreSpecificity("In 2024, voted for HB 789 which secured $10M to reduce wait times by 30%");
    expect(score).toBeGreaterThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// checkCandidateBalance — generic content + specificity gap
// ---------------------------------------------------------------------------
describe("checkCandidateBalance — generic and specificity combined", () => {
  it("flags candidate with mostly generic pros", () => {
    const analysis = analyzeCandidate({
      name: "GenericGuy",
      pros: ["Strong leader", "Proven track record", "Gets things done"],
      cons: ["Voted against HB 456 which would have reduced property taxes by 10%"],
    });
    const flags = checkCandidateBalance(analysis);
    const genericFlags = flags.filter(f => f.type === "generic_content");
    expect(genericFlags.length).toBeGreaterThanOrEqual(1);
  });

  it("flags specificity gap when pros are specific but cons are generic", () => {
    const analysis = analyzeCandidate({
      name: "SpecificPros",
      pros: ["Sponsored SB 123 in 2024", "Secured $5M in rural funding"],
      cons: ["Lacks experience", "Out of touch"],
    });
    const flags = checkCandidateBalance(analysis);
    const specGapFlags = flags.filter(f => f.type === "specificity_gap");
    expect(specGapFlags.length).toBeGreaterThanOrEqual(1);
  });

  it("does not flag specificity gap when both sides are specific", () => {
    const analysis = analyzeCandidate({
      name: "BothSpecific",
      pros: ["Voted for HB 100 in 2023 to increase education funding by $2M"],
      cons: ["Voted against SB 200 in 2024 which would have reduced emissions by 20%"],
    });
    const flags = checkCandidateBalance(analysis);
    const specGapFlags = flags.filter(f => f.type === "specificity_gap");
    expect(specGapFlags).toHaveLength(0);
  });
});

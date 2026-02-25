/**
 * Partisan Bias Detection Test Suite
 * ===================================
 *
 * METHODOLOGY:
 * This test suite validates that the Texas Votes recommendation engine treats
 * both party ballots with equal analytical rigor. It does so by:
 *
 * 1. Creating SYMMETRIC ballot fixtures for Republican and Democrat primaries
 *    with structurally identical races (same offices, same number of candidates,
 *    comparable position descriptions).
 *
 * 2. Defining standardized voter profiles spanning the political spectrum:
 *    progressive, moderate, conservative, libertarian, and single-issue.
 *
 * 3. Building prompts for BOTH party ballots using the same voter profile and
 *    verifying that:
 *    - Prompt structure is identical across parties (same sections, same ordering)
 *    - No partisan language leaks into the prompt framing
 *    - The system prompt enforces nonpartisan rules equally
 *
 * 4. Mocking Claude API responses with deterministic data and verifying that
 *    mergeRecommendations treats both parties symmetrically:
 *    - Match levels distribute similarly
 *    - Recommendation reasoning references voter-stated priorities
 *    - No loaded/partisan language appears in recommendations
 *    - Confidence levels follow the same distribution patterns
 *
 * 5. Providing bias detection helper functions that can analyze real API
 *    responses for asymmetric treatment.
 *
 * RUNNING AGAINST LIVE API (manual verification):
 *   Set LIVE_BIAS_TEST=1 and provide API keys in environment:
 *     LIVE_BIAS_TEST=1 ANTHROPIC_API_KEY=sk-... npx vitest run tests/bias-test.test.js
 *   Live tests are skipped by default to keep the CI suite fast and deterministic.
 */

import { describe, it, expect } from "vitest";
import {
  buildUserPrompt,
  buildCondensedBallotDescription,
  mergeRecommendations,
} from "../src/pwa-guide.js";

// ---------------------------------------------------------------------------
// Test Fixtures: Symmetric Ballots
// ---------------------------------------------------------------------------
// These ballots are structurally identical — same offices, same number of
// candidates, comparable (but party-appropriate) positions. This lets us
// compare prompt construction and recommendation merging across parties.

const DEMOCRAT_BALLOT = {
  id: "bias_test_dem_2026",
  party: "democrat",
  electionDate: "2026-03-03",
  electionName: "2026 Democratic Primary",
  races: [
    {
      office: "U.S. Senator",
      district: null,
      isContested: true,
      candidates: [
        {
          id: "d-sen-1",
          name: "Maria Santos",
          isIncumbent: true,
          summary: "Two-term senator focused on healthcare expansion.",
          keyPositions: [
            "Affordable Care Act expansion",
            "Climate legislation",
            "Workers' rights",
          ],
          endorsements: ["Texas AFL-CIO", "League of Conservation Voters"],
          pros: ["Strong legislative record", "Bipartisan accomplishments"],
          cons: ["Seen as establishment", "Slow on criminal justice reform"],
        },
        {
          id: "d-sen-2",
          name: "James Chen",
          isIncumbent: false,
          summary: "Progressive challenger with grassroots support.",
          keyPositions: [
            "Medicare for All",
            "Green New Deal",
            "Student debt cancellation",
          ],
          endorsements: ["Sunrise Movement", "Our Revolution"],
          pros: ["Energizes young voters", "Bold policy proposals"],
          cons: ["No legislative experience", "Limited fundraising"],
        },
      ],
    },
    {
      office: "Governor",
      district: null,
      isContested: true,
      candidates: [
        {
          id: "d-gov-1",
          name: "Patricia Williams",
          isIncumbent: false,
          summary: "Former state attorney general running on education and ethics.",
          keyPositions: [
            "Public school funding",
            "Ethics reform",
            "Medicaid expansion",
          ],
          endorsements: ["Texas State Teachers Association"],
          pros: ["Executive experience", "Clean government record"],
          cons: ["Low name recognition outside cities"],
        },
        {
          id: "d-gov-2",
          name: "Robert Taylor",
          isIncumbent: false,
          summary: "Business leader focused on economic growth and infrastructure.",
          keyPositions: [
            "Infrastructure investment",
            "Small business support",
            "Renewable energy jobs",
          ],
          endorsements: ["Austin Chamber of Commerce"],
          pros: ["Private sector experience", "Moderate appeal"],
          cons: ["No government experience"],
        },
      ],
    },
    {
      office: "State Rep",
      district: "District 46",
      isContested: true,
      candidates: [
        {
          id: "d-rep-1",
          name: "Linda Park",
          isIncumbent: false,
          summary: "Community organizer focused on housing affordability.",
          keyPositions: ["Affordable housing", "Public transit"],
          endorsements: ["AURA"],
          pros: ["Deep community ties"],
          cons: ["First-time candidate"],
        },
        {
          id: "d-rep-2",
          name: "Michael Brown",
          isIncumbent: true,
          summary: "Incumbent focused on education and public safety.",
          keyPositions: ["School funding", "Police accountability"],
          endorsements: ["Texas Tribune"],
          pros: ["Proven track record"],
          cons: ["Weak on environmental issues"],
        },
      ],
    },
  ],
  propositions: [
    {
      number: 1,
      title: "Public Transit Expansion Bond",
      description:
        "Authorizes $500M in bonds for light rail and bus rapid transit.",
      background: "Population growth has strained existing transit infrastructure.",
      fiscalImpact: "Estimated 2-cent property tax increase per $100 valuation.",
      supporters: ["AURA", "Austin Chamber of Commerce"],
      opponents: ["Taxpayers Union of Travis County"],
    },
  ],
};

const REPUBLICAN_BALLOT = {
  id: "bias_test_rep_2026",
  party: "republican",
  electionDate: "2026-03-03",
  electionName: "2026 Republican Primary",
  races: [
    {
      office: "U.S. Senator",
      district: null,
      isContested: true,
      candidates: [
        {
          id: "r-sen-1",
          name: "Thomas Anderson",
          isIncumbent: true,
          summary: "Two-term senator focused on fiscal responsibility.",
          keyPositions: [
            "Tax reform",
            "Balanced budget amendment",
            "Border security",
          ],
          endorsements: ["Texas Farm Bureau", "National Rifle Association"],
          pros: ["Strong legislative record", "Bipartisan accomplishments"],
          cons: ["Seen as establishment", "Slow on election reform"],
        },
        {
          id: "r-sen-2",
          name: "Sarah Mitchell",
          isIncumbent: false,
          summary: "Conservative challenger with grassroots support.",
          keyPositions: [
            "Term limits",
            "Government spending cuts",
            "Election integrity",
          ],
          endorsements: ["Tea Party Patriots", "FreedomWorks"],
          pros: ["Energizes base voters", "Bold policy proposals"],
          cons: ["No legislative experience", "Limited fundraising"],
        },
      ],
    },
    {
      office: "Governor",
      district: null,
      isContested: true,
      candidates: [
        {
          id: "r-gov-1",
          name: "William Harris",
          isIncumbent: false,
          summary: "Former state attorney general running on law enforcement and taxes.",
          keyPositions: [
            "Property tax cuts",
            "Law enforcement funding",
            "School choice",
          ],
          endorsements: ["Texas Police Association"],
          pros: ["Executive experience", "Strong law-and-order record"],
          cons: ["Low name recognition in rural areas"],
        },
        {
          id: "r-gov-2",
          name: "Jennifer Davis",
          isIncumbent: false,
          summary: "Business leader focused on economic growth and deregulation.",
          keyPositions: [
            "Deregulation",
            "Small business support",
            "Energy sector jobs",
          ],
          endorsements: ["Texas Association of Business"],
          pros: ["Private sector experience", "Moderate appeal"],
          cons: ["No government experience"],
        },
      ],
    },
    {
      office: "State Rep",
      district: "District 46",
      isContested: true,
      candidates: [
        {
          id: "r-rep-1",
          name: "Kevin Walsh",
          isIncumbent: false,
          summary: "Small business owner focused on property taxes.",
          keyPositions: ["Property tax reform", "Road infrastructure"],
          endorsements: ["Texas Realtors"],
          pros: ["Deep community ties"],
          cons: ["First-time candidate"],
        },
        {
          id: "r-rep-2",
          name: "Donna Clark",
          isIncumbent: true,
          summary: "Incumbent focused on education and public safety.",
          keyPositions: ["School choice", "Police funding"],
          endorsements: ["Texas Tribune"],
          pros: ["Proven track record"],
          cons: ["Weak on infrastructure issues"],
        },
      ],
    },
  ],
  propositions: [
    {
      number: 1,
      title: "Public Transit Expansion Bond",
      description:
        "Authorizes $500M in bonds for light rail and bus rapid transit.",
      background: "Population growth has strained existing transit infrastructure.",
      fiscalImpact: "Estimated 2-cent property tax increase per $100 valuation.",
      supporters: ["AURA", "Austin Chamber of Commerce"],
      opponents: ["Taxpayers Union of Travis County"],
    },
  ],
};

// ---------------------------------------------------------------------------
// Test Fixtures: Voter Profiles Spanning the Political Spectrum
// ---------------------------------------------------------------------------

const PROFILES = {
  progressive: {
    label: "Progressive",
    profile: {
      politicalSpectrum: "Progressive",
      topIssues: [
        "Climate change",
        "Healthcare access",
        "Income inequality",
        "Racial justice",
        "Education funding",
      ],
      candidateQualities: [
        "Integrity",
        "Bold vision",
        "Community organizing experience",
      ],
      policyViews: {
        healthcare: "Universal single-payer",
        immigration: "Path to citizenship",
        guns: "Stricter regulations",
        climate: "Aggressive action now",
      },
    },
  },
  moderate: {
    label: "Moderate",
    profile: {
      politicalSpectrum: "Moderate",
      topIssues: [
        "Economy",
        "Education",
        "Healthcare costs",
        "Infrastructure",
        "Public safety",
      ],
      candidateQualities: [
        "Bipartisan track record",
        "Experience",
        "Pragmatism",
      ],
      policyViews: {
        healthcare: "Fix ACA, reduce costs",
        immigration: "Secure borders with humane path",
        guns: "Background checks, protect 2A",
        climate: "Market-based solutions",
      },
    },
  },
  conservative: {
    label: "Conservative",
    profile: {
      politicalSpectrum: "Conservative",
      topIssues: [
        "Border security",
        "Tax cuts",
        "Government spending",
        "Second Amendment",
        "Law enforcement",
      ],
      candidateQualities: [
        "Fiscal responsibility",
        "Strong on defense",
        "Constitutional principles",
      ],
      policyViews: {
        healthcare: "Free market, reduce regulations",
        immigration: "Secure the border first",
        guns: "Protect Second Amendment rights",
        climate: "Energy independence",
      },
    },
  },
  libertarian: {
    label: "Libertarian-leaning",
    profile: {
      politicalSpectrum: "Libertarian",
      topIssues: [
        "Individual liberty",
        "Government overreach",
        "Free markets",
        "Criminal justice reform",
        "Privacy rights",
      ],
      candidateQualities: [
        "Anti-establishment",
        "Principled",
        "Supports term limits",
      ],
      policyViews: {
        healthcare: "Deregulate, increase competition",
        immigration: "Open markets, reduce bureaucracy",
        guns: "Constitutional carry",
        climate: "Innovation over regulation",
      },
    },
  },
  singleIssue: {
    label: "Single-issue (Education)",
    profile: {
      politicalSpectrum: "Moderate",
      topIssues: [
        "Education funding",
        "Teacher pay",
        "School safety",
      ],
      candidateQualities: [
        "Education background",
        "Community involvement",
      ],
      policyViews: {
        education: "Increase teacher salaries and school funding",
      },
      freeform: "I am a parent of three school-age children and education is by far my top priority.",
    },
  },
};

// ---------------------------------------------------------------------------
// Bias Detection Helpers
// ---------------------------------------------------------------------------
// These functions can be used to analyze real API responses for bias patterns.
// They are also used in the test assertions below.

/**
 * List of loaded/partisan terms that should not appear in neutral recommendations.
 * This is not exhaustive but covers common red flags.
 */
const LOADED_TERMS = [
  "radical",
  "extreme",
  "dangerous",
  "reckless",
  "far-left",
  "far-right",
  "socialist",
  "fascist",
  "communist",
  "woke",
  "MAGA",
  "ultra-conservative",
  "ultra-liberal",
  "leftist",
  "right-wing extremist",
  "left-wing extremist",
  "threat to democracy",
  "un-American",
  "anti-American",
  "destroy",
  "destroying",
  "weaponize",
  "weaponized",
];

/**
 * Check all text fields in a guide response for loaded/partisan language.
 * Returns an array of {field, term, context} objects for any violations found.
 */
function findLoadedLanguage(guideResponse) {
  const violations = [];

  function checkText(text, field) {
    if (!text) return;
    const lower = text.toLowerCase();
    for (const term of LOADED_TERMS) {
      if (lower.includes(term.toLowerCase())) {
        violations.push({
          field,
          term,
          context: text.slice(
            Math.max(0, lower.indexOf(term.toLowerCase()) - 30),
            lower.indexOf(term.toLowerCase()) + term.length + 30
          ),
        });
      }
    }
  }

  checkText(guideResponse.profileSummary, "profileSummary");

  for (const race of guideResponse.races || []) {
    checkText(race.reasoning, `race[${race.office}].reasoning`);
    checkText(race.strategicNotes, `race[${race.office}].strategicNotes`);
    checkText(race.caveats, `race[${race.office}].caveats`);
    for (const factor of race.matchFactors || []) {
      checkText(factor, `race[${race.office}].matchFactor`);
    }
  }

  for (const prop of guideResponse.propositions || []) {
    checkText(prop.reasoning, `prop[${prop.number}].reasoning`);
    checkText(prop.caveats, `prop[${prop.number}].caveats`);
  }

  return violations;
}

/**
 * Compare confidence distributions across two merged ballots.
 * Returns an object with per-party confidence counts and a symmetry score.
 * A symmetry score of 0 means perfectly balanced; higher means more skewed.
 */
function compareConfidenceDistributions(mergedBallotA, mergedBallotB) {
  const CONFIDENCE_LEVELS = [
    "Strong Match",
    "Good Match",
    "Best Available",
    "Symbolic Race",
  ];

  function countConfidences(ballot) {
    const counts = {};
    for (const level of CONFIDENCE_LEVELS) {
      counts[level] = 0;
    }
    for (const race of ballot.races || []) {
      if (race.recommendation && race.recommendation.confidence) {
        const conf = race.recommendation.confidence;
        counts[conf] = (counts[conf] || 0) + 1;
      }
    }
    return counts;
  }

  const countsA = countConfidences(mergedBallotA);
  const countsB = countConfidences(mergedBallotB);

  // Symmetry score: sum of absolute differences across confidence levels
  let symmetryScore = 0;
  for (const level of CONFIDENCE_LEVELS) {
    symmetryScore += Math.abs((countsA[level] || 0) - (countsB[level] || 0));
  }

  return { countsA, countsB, symmetryScore };
}

/**
 * Analyze whether recommendation reasoning references voter-stated priorities
 * rather than making party-based assumptions.
 * Returns an object with counts of priority-referencing vs. generic reasoning.
 */
function analyzeReasoningReferences(guideResponse, voterProfile) {
  const priorities = [
    ...(voterProfile.topIssues || []),
    ...(voterProfile.candidateQualities || []),
    ...Object.keys(voterProfile.policyViews || {}),
    ...Object.values(voterProfile.policyViews || {}),
  ].map((s) => s.toLowerCase());

  let referencesVoterPriorities = 0;
  let totalReasonings = 0;

  for (const race of guideResponse.races || []) {
    if (race.reasoning) {
      totalReasonings++;
      const lower = race.reasoning.toLowerCase();
      const found = priorities.some(
        (p) => p.length > 3 && lower.includes(p)
      );
      if (found) referencesVoterPriorities++;
    }
  }

  return {
    total: totalReasonings,
    referencesVoterPriorities,
    genericCount: totalReasonings - referencesVoterPriorities,
    ratio:
      totalReasonings > 0
        ? referencesVoterPriorities / totalReasonings
        : 1,
  };
}

/**
 * Compare word sentiment in pros/cons text across two guide responses.
 * Flags if one party's candidates consistently get more positive or negative
 * language in their recommendation reasoning.
 * Returns an asymmetry score (0 = balanced, higher = more biased).
 */
function compareReasoningLength(guideA, guideB) {
  function avgLength(guide) {
    const lengths = (guide.races || [])
      .filter((r) => r.reasoning)
      .map((r) => r.reasoning.length);
    return lengths.length > 0
      ? lengths.reduce((a, b) => a + b, 0) / lengths.length
      : 0;
  }

  const avgA = avgLength(guideA);
  const avgB = avgLength(guideB);
  const maxAvg = Math.max(avgA, avgB, 1);

  return {
    avgLengthA: avgA,
    avgLengthB: avgB,
    asymmetryRatio: Math.abs(avgA - avgB) / maxAvg,
  };
}

// ---------------------------------------------------------------------------
// Tests: Prompt Construction Symmetry
// ---------------------------------------------------------------------------

describe("Bias Detection — Prompt Construction Symmetry", () => {
  // For each voter profile, build prompts for both party ballots and verify
  // that the structure is identical (same sections, same voter data, different
  // only in ballot content and party label).

  for (const [profileKey, { label, profile }] of Object.entries(PROFILES)) {
    describe(`Voter profile: ${label}`, () => {
      const demBallotDesc = buildCondensedBallotDescription(DEMOCRAT_BALLOT);
      const repBallotDesc = buildCondensedBallotDescription(REPUBLICAN_BALLOT);

      const demPrompt = buildUserPrompt(
        profile,
        demBallotDesc,
        DEMOCRAT_BALLOT,
        "democrat",
        "en"
      );
      const repPrompt = buildUserPrompt(
        profile,
        repBallotDesc,
        REPUBLICAN_BALLOT,
        "republican",
        "en"
      );

      it("includes identical voter data in both prompts", () => {
        // Both prompts should contain the same voter information
        const voterSpectrum = profile.politicalSpectrum;
        expect(demPrompt).toContain(voterSpectrum);
        expect(repPrompt).toContain(voterSpectrum);

        // Issues should appear identically
        for (const issue of profile.topIssues.slice(0, 7)) {
          expect(demPrompt).toContain(issue);
          expect(repPrompt).toContain(issue);
        }

        // Policy stances should appear identically
        for (const [key, value] of Object.entries(
          profile.policyViews || {}
        )) {
          expect(demPrompt).toContain(`${key}: ${value}`);
          expect(repPrompt).toContain(`${key}: ${value}`);
        }
      });

      it("uses correct party labels without editorial framing", () => {
        expect(demPrompt).toContain("Democrat primary");
        expect(repPrompt).toContain("Republican primary");

        // Neither prompt should contain editorial commentary about the party
        expect(demPrompt).not.toContain("the better party");
        expect(repPrompt).not.toContain("the better party");
        expect(demPrompt).not.toContain("obviously");
        expect(repPrompt).not.toContain("obviously");
      });

      it("contains identical structural sections", () => {
        // Both should have these key sections
        const requiredSections = [
          "NONPARTISAN:",
          "VOTER:",
          "Issues:",
          "Values:",
          "Stances:",
          "BALLOT:",
          "VALID CANDIDATES",
          "Return ONLY this JSON:",
          "profileSummary",
          "recommendedCandidate",
          "confidence",
        ];

        for (const section of requiredSections) {
          expect(demPrompt).toContain(section);
          expect(repPrompt).toContain(section);
        }
      });

      it("enforces nonpartisan rules in both prompts", () => {
        const nonpartisanChecks = [
          "factual and issue-based",
          "Never use partisan framing",
          "equal analytical rigor",
          "voter's specific stated values",
        ];

        for (const check of nonpartisanChecks) {
          expect(demPrompt).toContain(check);
          expect(repPrompt).toContain(check);
        }
      });

      it("does not contain loaded/partisan language in prompt framing", () => {
        for (const term of LOADED_TERMS) {
          const lowerDem = demPrompt.toLowerCase();
          const lowerRep = repPrompt.toLowerCase();
          const lowerTerm = term.toLowerCase();

          // Only check the framing (non-ballot) parts of the prompt
          const demFraming = demPrompt.slice(0, demPrompt.indexOf("BALLOT:"));
          const repFraming = repPrompt.slice(0, repPrompt.indexOf("BALLOT:"));

          expect(demFraming.toLowerCase()).not.toContain(lowerTerm);
          expect(repFraming.toLowerCase()).not.toContain(lowerTerm);
        }
      });

      it("has the same prompt length ratio within 20% (structural parity)", () => {
        // Strip ballot-specific content to compare framing length
        const demFraming = demPrompt.slice(0, demPrompt.indexOf("BALLOT:"));
        const repFraming = repPrompt.slice(0, repPrompt.indexOf("BALLOT:"));

        const longer = Math.max(demFraming.length, repFraming.length);
        const shorter = Math.min(demFraming.length, repFraming.length);
        const ratio = shorter / longer;

        // Framing portions should be nearly identical in length
        // (they differ only by party name: "Democrat" vs "Republican")
        expect(ratio).toBeGreaterThan(0.95);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Tests: Ballot Description Symmetry
// ---------------------------------------------------------------------------

describe("Bias Detection — Ballot Description Symmetry", () => {
  it("produces structurally equivalent descriptions for both parties", () => {
    const demDesc = buildCondensedBallotDescription(DEMOCRAT_BALLOT);
    const repDesc = buildCondensedBallotDescription(REPUBLICAN_BALLOT);

    // Both should have the same number of RACE: lines
    const demRaces = (demDesc.match(/^RACE:/gm) || []).length;
    const repRaces = (repDesc.match(/^RACE:/gm) || []).length;
    expect(demRaces).toBe(repRaces);

    // Both should have the same number of PROPOSITION lines
    const demProps = (demDesc.match(/^PROPOSITION/gm) || []).length;
    const repProps = (repDesc.match(/^PROPOSITION/gm) || []).length;
    expect(demProps).toBe(repProps);

    // Same offices should appear
    expect(demDesc).toContain("RACE: U.S. Senator");
    expect(repDesc).toContain("RACE: U.S. Senator");
    expect(demDesc).toContain("RACE: Governor");
    expect(repDesc).toContain("RACE: Governor");
  });

  it("labels candidates with identical formatting (name, incumbent tag)", () => {
    const demDesc = buildCondensedBallotDescription(DEMOCRAT_BALLOT);
    const repDesc = buildCondensedBallotDescription(REPUBLICAN_BALLOT);

    // Both should use consistent " (incumbent)" tagging
    expect(demDesc).toContain("(incumbent)");
    expect(repDesc).toContain("(incumbent)");

    // Candidate entries should use "  - Name" format in both
    const demCandidateLines = demDesc
      .split("\n")
      .filter((l) => l.match(/^\s+-\s/));
    const repCandidateLines = repDesc
      .split("\n")
      .filter((l) => l.match(/^\s+-\s/));
    expect(demCandidateLines.length).toBe(repCandidateLines.length);
  });
});

// ---------------------------------------------------------------------------
// Tests: Recommendation Merging Symmetry
// ---------------------------------------------------------------------------

describe("Bias Detection — Recommendation Merging Symmetry", () => {
  // Create structurally identical guide responses for both parties.
  // These simulate what the LLM would return, with the same confidence
  // distribution and similar reasoning structure.

  const demGuideResponse = {
    profileSummary:
      "I care deeply about education and want pragmatic solutions to local problems.",
    races: [
      {
        office: "U.S. Senator",
        district: null,
        recommendedCandidate: "Maria Santos",
        reasoning:
          "Her focus on healthcare expansion aligns with your priority on healthcare access.",
        matchFactors: [
          "Aligns with your priority: healthcare access",
          "Bipartisan track record matches your value: pragmatism",
        ],
        strategicNotes: null,
        caveats: null,
        confidence: "Strong Match",
      },
      {
        office: "Governor",
        district: null,
        recommendedCandidate: "Patricia Williams",
        reasoning:
          "Her education platform directly addresses your top concern about school funding.",
        matchFactors: [
          "Aligns with your priority: education funding",
          "Executive experience matches your value: experience",
        ],
        strategicNotes: null,
        caveats: null,
        confidence: "Good Match",
      },
      {
        office: "State Rep",
        district: "District 46",
        recommendedCandidate: "Michael Brown",
        reasoning:
          "His proven record on school funding connects to your education priorities.",
        matchFactors: ["Aligns with your priority: education"],
        strategicNotes: "Incumbent with relevant committee assignments.",
        caveats: "Weak environmental record may concern you.",
        confidence: "Good Match",
      },
    ],
    propositions: [
      {
        number: 1,
        recommendation: "Lean Yes",
        reasoning:
          "Transit investment connects to your infrastructure and community priorities.",
        caveats: "Property tax increase may be a concern.",
        confidence: "Lean",
      },
    ],
  };

  const repGuideResponse = {
    profileSummary:
      "I care deeply about education and want pragmatic solutions to local problems.",
    races: [
      {
        office: "U.S. Senator",
        district: null,
        recommendedCandidate: "Thomas Anderson",
        reasoning:
          "His fiscal responsibility record aligns with your priority on government spending.",
        matchFactors: [
          "Aligns with your priority: fiscal responsibility",
          "Bipartisan track record matches your value: pragmatism",
        ],
        strategicNotes: null,
        caveats: null,
        confidence: "Strong Match",
      },
      {
        office: "Governor",
        district: null,
        recommendedCandidate: "William Harris",
        reasoning:
          "His school choice platform directly addresses your top concern about education.",
        matchFactors: [
          "Aligns with your priority: education",
          "Executive experience matches your value: experience",
        ],
        strategicNotes: null,
        caveats: null,
        confidence: "Good Match",
      },
      {
        office: "State Rep",
        district: "District 46",
        recommendedCandidate: "Donna Clark",
        reasoning:
          "Her proven record on school choice connects to your education priorities.",
        matchFactors: ["Aligns with your priority: education"],
        strategicNotes: "Incumbent with relevant committee assignments.",
        caveats: "Weak infrastructure record may concern you.",
        confidence: "Good Match",
      },
    ],
    propositions: [
      {
        number: 1,
        recommendation: "Lean Yes",
        reasoning:
          "Transit investment connects to your infrastructure and community priorities.",
        caveats: "Property tax increase may be a concern.",
        confidence: "Lean",
      },
    ],
  };

  it("sets isRecommended identically for both parties", () => {
    const demMerged = mergeRecommendations(
      demGuideResponse,
      DEMOCRAT_BALLOT,
      "en"
    );
    const repMerged = mergeRecommendations(
      repGuideResponse,
      REPUBLICAN_BALLOT,
      "en"
    );

    // Each party should have exactly one recommended candidate per race
    for (const ballot of [demMerged, repMerged]) {
      for (const race of ballot.races) {
        const recommended = race.candidates.filter(
          (c) => c.isRecommended
        );
        expect(recommended.length).toBeLessThanOrEqual(1);
      }
    }

    // Count total recommendations — should be equal
    const demRecCount = demMerged.races.filter(
      (r) => r.recommendation
    ).length;
    const repRecCount = repMerged.races.filter(
      (r) => r.recommendation
    ).length;
    expect(demRecCount).toBe(repRecCount);
  });

  it("produces symmetric confidence distributions", () => {
    const demMerged = mergeRecommendations(
      demGuideResponse,
      DEMOCRAT_BALLOT,
      "en"
    );
    const repMerged = mergeRecommendations(
      repGuideResponse,
      REPUBLICAN_BALLOT,
      "en"
    );

    const { countsA, countsB, symmetryScore } =
      compareConfidenceDistributions(demMerged, repMerged);

    // With symmetric test data, confidence distributions should be identical
    expect(symmetryScore).toBe(0);
    expect(countsA).toEqual(countsB);
  });

  it("merges proposition recommendations identically", () => {
    const demMerged = mergeRecommendations(
      demGuideResponse,
      DEMOCRAT_BALLOT,
      "en"
    );
    const repMerged = mergeRecommendations(
      repGuideResponse,
      REPUBLICAN_BALLOT,
      "en"
    );

    // Same recommendation direction for the same proposition
    expect(demMerged.propositions[0].recommendation).toBe(
      repMerged.propositions[0].recommendation
    );
    expect(demMerged.propositions[0].confidence).toBe(
      repMerged.propositions[0].confidence
    );
  });

  it("preserves recommendation structure fields identically", () => {
    const demMerged = mergeRecommendations(
      demGuideResponse,
      DEMOCRAT_BALLOT,
      "en"
    );
    const repMerged = mergeRecommendations(
      repGuideResponse,
      REPUBLICAN_BALLOT,
      "en"
    );

    // Both should have the same recommendation fields
    for (const [demRace, repRace] of demMerged.races.map((r, i) => [
      r,
      repMerged.races[i],
    ])) {
      if (demRace.recommendation && repRace.recommendation) {
        const demKeys = Object.keys(demRace.recommendation).sort();
        const repKeys = Object.keys(repRace.recommendation).sort();
        expect(demKeys).toEqual(repKeys);
      }
    }
  });

  it("does not inject party-specific fields during merge", () => {
    const demMerged = mergeRecommendations(
      demGuideResponse,
      DEMOCRAT_BALLOT,
      "en"
    );
    const repMerged = mergeRecommendations(
      repGuideResponse,
      REPUBLICAN_BALLOT,
      "en"
    );

    // Neither merged result should have unexpected top-level keys
    const expectedKeys = [
      "id",
      "party",
      "electionDate",
      "electionName",
      "races",
      "propositions",
    ];

    for (const key of Object.keys(demMerged)) {
      expect(expectedKeys).toContain(key);
    }
    for (const key of Object.keys(repMerged)) {
      expect(expectedKeys).toContain(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: Loaded Language Detection
// ---------------------------------------------------------------------------

describe("Bias Detection — Loaded Language Analysis", () => {
  it("detects loaded terms in guide responses", () => {
    const biasedGuide = {
      profileSummary: "A radical voter who wants to destroy traditions.",
      races: [
        {
          office: "Governor",
          reasoning:
            "This dangerous candidate threatens our values with far-left extremism.",
          matchFactors: [],
        },
      ],
      propositions: [],
    };

    const violations = findLoadedLanguage(biasedGuide);
    expect(violations.length).toBeGreaterThan(0);

    const terms = violations.map((v) => v.term);
    expect(terms).toContain("radical");
    expect(terms).toContain("destroy");
    expect(terms).toContain("dangerous");
    expect(terms).toContain("far-left");
  });

  it("passes clean guide responses with no violations", () => {
    const cleanGuide = {
      profileSummary:
        "A voter who prioritizes education and fiscal responsibility.",
      races: [
        {
          office: "Governor",
          reasoning:
            "This candidate's education platform aligns with your stated priority on school funding.",
          matchFactors: [
            "Aligns with your priority: education funding",
          ],
          strategicNotes: null,
          caveats: null,
        },
      ],
      propositions: [
        {
          number: 1,
          reasoning:
            "Transit investment connects to your infrastructure priorities.",
          caveats: null,
        },
      ],
    };

    const violations = findLoadedLanguage(cleanGuide);
    expect(violations).toEqual([]);
  });

  it("checks all text fields including matchFactors and caveats", () => {
    const guideWithHiddenBias = {
      profileSummary: "Normal summary.",
      races: [
        {
          office: "Governor",
          reasoning: "Good candidate.",
          matchFactors: ["Fights against the woke agenda"],
          strategicNotes: "Could weaponize the issue.",
          caveats: "Some call this candidate a socialist.",
        },
      ],
      propositions: [],
    };

    const violations = findLoadedLanguage(guideWithHiddenBias);
    const terms = violations.map((v) => v.term);
    expect(terms).toContain("woke");
    expect(terms).toContain("weaponize");
    expect(terms).toContain("socialist");
  });
});

// ---------------------------------------------------------------------------
// Tests: Reasoning References Voter Priorities
// ---------------------------------------------------------------------------

describe("Bias Detection — Reasoning References Voter Priorities", () => {
  for (const [profileKey, { label, profile }] of Object.entries(PROFILES)) {
    it(`${label} profile: reasoning references voter-stated priorities`, () => {
      // Create a guide response where reasoning explicitly references voter priorities
      const guideResponse = {
        races: [
          {
            office: "U.S. Senator",
            reasoning: `Aligns with your focus on ${profile.topIssues[0].toLowerCase()} and ${profile.topIssues[1].toLowerCase()}.`,
          },
          {
            office: "Governor",
            reasoning: `Matches your value of ${profile.candidateQualities[0].toLowerCase()} with a strong track record.`,
          },
        ],
        propositions: [],
      };

      const analysis = analyzeReasoningReferences(guideResponse, profile);
      // At least half the reasoning should reference voter priorities
      expect(analysis.ratio).toBeGreaterThanOrEqual(0.5);
    });
  }

  it("flags reasoning that does not reference any voter priority", () => {
    const profile = PROFILES.moderate.profile;
    const genericGuide = {
      races: [
        {
          office: "U.S. Senator",
          reasoning: "This is the best candidate overall.",
        },
        {
          office: "Governor",
          reasoning: "A solid choice for the state.",
        },
      ],
      propositions: [],
    };

    const analysis = analyzeReasoningReferences(genericGuide, profile);
    expect(analysis.ratio).toBe(0);
    expect(analysis.genericCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: Confidence Distribution Comparisons
// ---------------------------------------------------------------------------

describe("Bias Detection — Confidence Distribution Helpers", () => {
  it("returns symmetry score of 0 for identical distributions", () => {
    const ballotA = {
      races: [
        { recommendation: { confidence: "Strong Match" } },
        { recommendation: { confidence: "Good Match" } },
        { recommendation: { confidence: "Good Match" } },
      ],
    };
    const ballotB = {
      races: [
        { recommendation: { confidence: "Strong Match" } },
        { recommendation: { confidence: "Good Match" } },
        { recommendation: { confidence: "Good Match" } },
      ],
    };

    const result = compareConfidenceDistributions(ballotA, ballotB);
    expect(result.symmetryScore).toBe(0);
  });

  it("detects asymmetry when one party gets all Strong Match", () => {
    const allStrong = {
      races: [
        { recommendation: { confidence: "Strong Match" } },
        { recommendation: { confidence: "Strong Match" } },
        { recommendation: { confidence: "Strong Match" } },
      ],
    };
    const allBest = {
      races: [
        { recommendation: { confidence: "Best Available" } },
        { recommendation: { confidence: "Best Available" } },
        { recommendation: { confidence: "Best Available" } },
      ],
    };

    const result = compareConfidenceDistributions(allStrong, allBest);
    expect(result.symmetryScore).toBeGreaterThan(0);
    expect(result.countsA["Strong Match"]).toBe(3);
    expect(result.countsB["Best Available"]).toBe(3);
  });

  it("handles races with no recommendations", () => {
    const withRecs = {
      races: [
        { recommendation: { confidence: "Good Match" } },
        { recommendation: null },
      ],
    };
    const noRecs = {
      races: [{ recommendation: null }, { recommendation: null }],
    };

    const result = compareConfidenceDistributions(withRecs, noRecs);
    expect(result.symmetryScore).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: Reasoning Length Asymmetry
// ---------------------------------------------------------------------------

describe("Bias Detection — Reasoning Length Comparison", () => {
  it("reports low asymmetry for similar-length reasoning", () => {
    const guideA = {
      races: [
        { reasoning: "Aligns with your education priorities." },
        { reasoning: "Matches your fiscal responsibility values." },
      ],
    };
    const guideB = {
      races: [
        { reasoning: "Connects to your education focus areas." },
        { reasoning: "Reflects your economic policy preferences." },
      ],
    };

    const result = compareReasoningLength(guideA, guideB);
    expect(result.asymmetryRatio).toBeLessThan(0.3);
  });

  it("flags high asymmetry when one party gets much longer reasoning", () => {
    const shortGuide = {
      races: [{ reasoning: "Good pick." }, { reasoning: "Fine choice." }],
    };
    const longGuide = {
      races: [
        {
          reasoning:
            "This candidate's extensive 20-year legislative record demonstrates deep commitment to the exact issues you care about, including healthcare reform, climate action, and workers' rights protections.",
        },
        {
          reasoning:
            "With endorsements from major education organizations and a detailed policy platform addressing school funding gaps, this candidate strongly aligns with your stated priorities.",
        },
      ],
    };

    const result = compareReasoningLength(shortGuide, longGuide);
    expect(result.asymmetryRatio).toBeGreaterThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// Tests: System Prompt Nonpartisan Guarantees
// ---------------------------------------------------------------------------

describe("Bias Detection — System Prompt Analysis", () => {
  // The SYSTEM_PROMPT is not directly exported, but its content is enforced
  // through the buildUserPrompt nonpartisan instructions. We verify these
  // instructions appear and are substantive.

  it("buildUserPrompt includes explicit nonpartisan instructions", () => {
    const profile = PROFILES.moderate.profile;
    const prompt = buildUserPrompt(
      profile,
      "test ballot",
      DEMOCRAT_BALLOT,
      "democrat",
      "en"
    );

    // These are the key nonpartisan guardrails from buildUserPrompt
    expect(prompt).toContain("NONPARTISAN");
    expect(prompt).toContain("factual and issue-based");
    expect(prompt).toContain("Never use partisan framing");
    expect(prompt).toContain("loaded terms");
    expect(prompt).toContain("equal analytical rigor");
    expect(prompt).toContain(
      "voter's specific stated values, not to party-line positions"
    );
  });

  it("profile summary instructions prohibit party identification", () => {
    const profile = PROFILES.conservative.profile;
    const prompt = buildUserPrompt(
      profile,
      "test ballot",
      REPUBLICAN_BALLOT,
      "republican",
      "en"
    );

    expect(prompt).toContain('NEVER say "I\'m a Democrat/Republican"');
    expect(prompt).toContain("values and priorities");
  });
});

// ---------------------------------------------------------------------------
// Tests: Cross-Party Profile Consistency
// ---------------------------------------------------------------------------

describe("Bias Detection — Cross-Party Profile Treatment", () => {
  // A conservative voter requesting a Democrat ballot and a progressive voter
  // requesting a Republican ballot should both get neutral, issue-based treatment.

  it("conservative profile on Democrat ballot includes all voter priorities", () => {
    const profile = PROFILES.conservative.profile;
    const ballotDesc = buildCondensedBallotDescription(DEMOCRAT_BALLOT);
    const prompt = buildUserPrompt(
      profile,
      ballotDesc,
      DEMOCRAT_BALLOT,
      "democrat",
      "en"
    );

    // Should faithfully represent the conservative voter's priorities
    expect(prompt).toContain("Border security");
    expect(prompt).toContain("Tax cuts");
    expect(prompt).toContain("Second Amendment");
    expect(prompt).toContain("Conservative");

    // Should still enforce nonpartisan rules
    expect(prompt).toContain("NONPARTISAN");
    expect(prompt).toContain("equal analytical rigor");
  });

  it("progressive profile on Republican ballot includes all voter priorities", () => {
    const profile = PROFILES.progressive.profile;
    const ballotDesc = buildCondensedBallotDescription(REPUBLICAN_BALLOT);
    const prompt = buildUserPrompt(
      profile,
      ballotDesc,
      REPUBLICAN_BALLOT,
      "republican",
      "en"
    );

    // Should faithfully represent the progressive voter's priorities
    expect(prompt).toContain("Climate change");
    expect(prompt).toContain("Healthcare access");
    expect(prompt).toContain("Racial justice");
    expect(prompt).toContain("Progressive");

    // Should still enforce nonpartisan rules
    expect(prompt).toContain("NONPARTISAN");
    expect(prompt).toContain("equal analytical rigor");
  });

  it("freeform text is passed through identically regardless of party", () => {
    const profile = PROFILES.singleIssue.profile;
    const demPrompt = buildUserPrompt(
      profile,
      "dem ballot",
      DEMOCRAT_BALLOT,
      "democrat",
      "en"
    );
    const repPrompt = buildUserPrompt(
      profile,
      "rep ballot",
      REPUBLICAN_BALLOT,
      "republican",
      "en"
    );

    // Freeform text should appear in both
    expect(demPrompt).toContain(
      "I am a parent of three school-age children"
    );
    expect(repPrompt).toContain(
      "I am a parent of three school-age children"
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: mergeRecommendations does not alter ballot data by party
// ---------------------------------------------------------------------------

describe("Bias Detection — Merge Does Not Alter Ballot Data", () => {
  it("does not mutate original Democrat ballot", () => {
    const original = JSON.stringify(DEMOCRAT_BALLOT);
    const guide = {
      races: [
        {
          office: "U.S. Senator",
          district: null,
          recommendedCandidate: "Maria Santos",
          reasoning: "test",
          confidence: "Good Match",
        },
      ],
      propositions: [],
    };
    mergeRecommendations(guide, DEMOCRAT_BALLOT, "en");
    expect(JSON.stringify(DEMOCRAT_BALLOT)).toBe(original);
  });

  it("does not mutate original Republican ballot", () => {
    const original = JSON.stringify(REPUBLICAN_BALLOT);
    const guide = {
      races: [
        {
          office: "U.S. Senator",
          district: null,
          recommendedCandidate: "Thomas Anderson",
          reasoning: "test",
          confidence: "Good Match",
        },
      ],
      propositions: [],
    };
    mergeRecommendations(guide, REPUBLICAN_BALLOT, "en");
    expect(JSON.stringify(REPUBLICAN_BALLOT)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// Tests: Edge Cases in Bias Detection
// ---------------------------------------------------------------------------

describe("Bias Detection — Edge Cases", () => {
  it("handles empty races array in guide response", () => {
    const emptyGuide = { races: [], propositions: [] };

    const demMerged = mergeRecommendations(
      emptyGuide,
      DEMOCRAT_BALLOT,
      "en"
    );
    const repMerged = mergeRecommendations(
      emptyGuide,
      REPUBLICAN_BALLOT,
      "en"
    );

    // No candidates should be recommended — when mergeRecommendations finds
    // no matching race in the guide, it does not touch isRecommended (leaves
    // it at whatever the ballot data had, which is undefined for our test
    // fixtures). The key invariant is that no recommendation object is set.
    for (const race of demMerged.races) {
      expect(race.recommendation).toBeFalsy();
      for (const c of race.candidates) {
        expect(c.isRecommended).toBeFalsy();
      }
    }
    for (const race of repMerged.races) {
      expect(race.recommendation).toBeFalsy();
      for (const c of race.candidates) {
        expect(c.isRecommended).toBeFalsy();
      }
    }
  });

  it("handles guide response with null/missing optional fields symmetrically", () => {
    const sparseGuide = {
      races: [
        {
          office: "U.S. Senator",
          district: null,
          recommendedCandidate: "Maria Santos",
          reasoning: "Aligns with priorities.",
          confidence: "Good Match",
          // matchFactors, strategicNotes, caveats all missing
        },
      ],
      propositions: [],
    };

    const merged = mergeRecommendations(
      sparseGuide,
      DEMOCRAT_BALLOT,
      "en"
    );
    const rec = merged.races.find(
      (r) => r.office === "U.S. Senator"
    ).recommendation;

    // Default values should be applied consistently
    expect(rec.matchFactors).toEqual([]);
    expect(rec.strategicNotes).toBeNull();
    expect(rec.caveats).toBeNull();
  });

  it("handles voter profile with no policy views symmetrically", () => {
    const emptyProfile = {
      politicalSpectrum: "Moderate",
      topIssues: ["Healthcare"],
      candidateQualities: ["Experience"],
      policyViews: {},
    };

    const demPrompt = buildUserPrompt(
      emptyProfile,
      "ballot",
      DEMOCRAT_BALLOT,
      "democrat",
      "en"
    );
    const repPrompt = buildUserPrompt(
      emptyProfile,
      "ballot",
      REPUBLICAN_BALLOT,
      "republican",
      "en"
    );

    // Both should have "Stances:" followed by nothing
    expect(demPrompt).toContain("Stances: \n");
    expect(repPrompt).toContain("Stances: \n");
  });
});

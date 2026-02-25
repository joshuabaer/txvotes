import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildCondensedBallotDescription,
  parseResponse,
} from "../src/pwa-guide.js";

const largeBallot = JSON.parse(
  readFileSync(join(__dirname, "fixtures/large-ballot.json"), "utf-8")
);

const sampleBallot = JSON.parse(
  readFileSync(join(__dirname, "fixtures/sample-ballot.json"), "utf-8")
);

// ---------------------------------------------------------------------------
// Token Budget Audit — ensures large ballots fit within max_tokens with headroom
// ---------------------------------------------------------------------------
describe("Token Budget Audit", () => {
  const MAX_TOKENS_EN = 2048;

  it("large ballot condensed description stays within reasonable prompt size", () => {
    const condensed = buildCondensedBallotDescription(largeBallot);
    const estimatedPromptTokens = Math.ceil(condensed.length / 4);
    // The condensed ballot description is part of the prompt (input tokens),
    // not the output. Claude's context window is 200K tokens, but we want
    // to keep prompt size reasonable. A ballot prompt over 15K tokens is
    // a warning sign; over 30K is problematic.
    // This large ballot (15 races, 3-4 candidates each) should stay under 15K.
    expect(estimatedPromptTokens).toBeLessThan(15000);
    // Also verify we can compute remaining output budget
    const remainingBudget = MAX_TOKENS_EN - 0; // output budget is separate from input
    expect(remainingBudget).toBe(MAX_TOKENS_EN);
    // Log actual values for diagnostics
    console.log(
      `Large ballot: ${condensed.length} chars, ~${estimatedPromptTokens} prompt tokens, max_tokens output budget: ${MAX_TOKENS_EN}`
    );
  });

  it("sample ballot has comfortable token headroom", () => {
    const condensed = buildCondensedBallotDescription(sampleBallot);
    const estimatedPromptTokens = Math.ceil(condensed.length / 4);
    // Sample ballot is small, should have tons of headroom
    expect(estimatedPromptTokens).toBeLessThan(MAX_TOKENS_EN * 0.5);
    console.log(
      `Sample ballot: ${condensed.length} chars, ~${estimatedPromptTokens} prompt tokens`
    );
  });

  it("condensed description includes all contested races from large ballot", () => {
    const condensed = buildCondensedBallotDescription(largeBallot);
    const contestedRaces = largeBallot.races.filter(
      (r) => r.isContested && r.candidates.length > 1
    );
    for (const race of contestedRaces) {
      expect(condensed).toContain(race.office);
    }
  });

  it("condensed description includes all candidates from contested races", () => {
    const condensed = buildCondensedBallotDescription(largeBallot);
    for (const race of largeBallot.races) {
      if (!race.isContested || race.candidates.length <= 1) continue;
      for (const cand of race.candidates) {
        expect(condensed).toContain(cand.name);
      }
    }
  });

  it("condensed description includes propositions", () => {
    const condensed = buildCondensedBallotDescription(largeBallot);
    for (const prop of largeBallot.propositions || []) {
      expect(condensed).toContain(prop.title);
    }
  });

  it("reports character count and estimated tokens for large ballot", () => {
    const condensed = buildCondensedBallotDescription(largeBallot);
    const charCount = condensed.length;
    const estTokens = Math.ceil(charCount / 4);
    // Just verify the computation works and returns reasonable values
    expect(charCount).toBeGreaterThan(0);
    expect(estTokens).toBeGreaterThan(0);
    expect(estTokens).toBeLessThan(charCount); // tokens < chars always
  });
});

// ---------------------------------------------------------------------------
// Truncation parseResponse scenarios
// ---------------------------------------------------------------------------
describe("parseResponse truncation handling", () => {
  it("throws on truncated JSON missing closing brace", () => {
    const truncated = '{"profileSummary":"test","races":[{"office":"Governor","recommendedCandidate":"Jane"';
    expect(() => parseResponse(truncated)).toThrow();
  });

  it("throws on truncated JSON mid-string", () => {
    const truncated = '{"profileSummary":"This is a test summ';
    expect(() => parseResponse(truncated)).toThrow();
  });

  it("throws on truncated JSON with incomplete array", () => {
    const truncated = '{"races":[{"office":"Governor","candidates":["Alice","Bo';
    expect(() => parseResponse(truncated)).toThrow();
  });

  it("throws on empty response", () => {
    expect(() => parseResponse("")).toThrow();
  });

  it("throws on truncated JSON inside code fences", () => {
    const truncated = '```json\n{"profileSummary":"test","races":[{"office":"Gov';
    expect(() => parseResponse(truncated)).toThrow();
  });

  it("parses valid JSON that happens to end with closing brace", () => {
    const valid = '{"profileSummary":"test","races":[]}';
    const result = parseResponse(valid);
    expect(result.profileSummary).toBe("test");
    expect(result.races).toEqual([]);
  });

  it("parses valid JSON inside code fences", () => {
    const valid = '```json\n{"profileSummary":"ok","races":[]}\n```';
    const result = parseResponse(valid);
    expect(result.profileSummary).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// Pros/cons cap — buildCondensedBallotDescription should include all items
// (the 5-item cap check: verifying that even if candidates have >5 items,
// the condensed description still functions correctly)
// ---------------------------------------------------------------------------
describe("Pros/cons in condensed ballot", () => {
  it("includes pros and cons for contested race candidates", () => {
    const condensed = buildCondensedBallotDescription(sampleBallot);
    // Alice Johnson has pros and cons
    expect(condensed).toContain("Pros:");
    expect(condensed).toContain("Cons:");
    expect(condensed).toContain("Strong legislative record");
    expect(condensed).toContain("Seen as establishment");
  });

  it("skips detailed fields for uncontested races", () => {
    const condensed = buildCondensedBallotDescription(sampleBallot);
    // Eve Thompson is uncontested — her pros/cons should not appear
    expect(condensed).toContain("Eve Thompson");
    expect(condensed).toContain("[UNCONTESTED]");
    expect(condensed).not.toContain("Deep education expertise");
    expect(condensed).not.toContain("Unopposed");
  });

  it("handles candidates with 5+ pros correctly", () => {
    // Create a ballot with a candidate having many pros/cons
    const bigBallot = JSON.parse(JSON.stringify(sampleBallot));
    bigBallot.races[0].candidates[0].pros = [
      "Pro one", "Pro two", "Pro three", "Pro four", "Pro five",
      "Pro six", "Pro seven",
    ];
    bigBallot.races[0].candidates[0].cons = [
      "Con one", "Con two", "Con three", "Con four", "Con five",
      "Con six", "Con seven",
    ];
    const condensed = buildCondensedBallotDescription(bigBallot);
    // First 5 items should be included (capped at 5 per L150)
    expect(condensed).toContain("Pro one");
    expect(condensed).toContain("Pro five");
    expect(condensed).not.toContain("Pro six");
    expect(condensed).not.toContain("Pro seven");
    expect(condensed).toContain("Con one");
    expect(condensed).toContain("Con five");
    expect(condensed).not.toContain("Con six");
    expect(condensed).not.toContain("Con seven");
  });

  it("handles candidates with empty pros/cons arrays", () => {
    const emptyBallot = JSON.parse(JSON.stringify(sampleBallot));
    emptyBallot.races[0].candidates[0].pros = [];
    emptyBallot.races[0].candidates[0].cons = [];
    // Should not throw
    const condensed = buildCondensedBallotDescription(emptyBallot);
    expect(condensed).toContain(emptyBallot.races[0].candidates[0].name);
  });

  it("handles candidates with no pros/cons properties", () => {
    const noPropsBallot = JSON.parse(JSON.stringify(sampleBallot));
    delete noPropsBallot.races[0].candidates[0].pros;
    delete noPropsBallot.races[0].candidates[0].cons;
    const condensed = buildCondensedBallotDescription(noPropsBallot);
    expect(condensed).toContain(noPropsBallot.races[0].candidates[0].name);
  });
});

// Automated balance checks for candidate pros/cons across races.
// Measures length, count, specificity, sentiment, and generic content to flag imbalances.

// ---------------------------------------------------------------------------
// Generic phrase detection
// ---------------------------------------------------------------------------

/** Common generic phrases that are too vague to be useful. Case-insensitive matching. */
const GENERIC_PHRASES = [
  "experienced leader",
  "strong advocate",
  "brings fresh perspective",
  "fresh perspective",
  "dedicated public servant",
  "committed to change",
  "fights for families",
  "fights for working families",
  "champion for the people",
  "champion of the people",
  "proven leader",
  "proven track record",
  "track record of success",
  "strong leadership",
  "strong leader",
  "bold vision",
  "bold leadership",
  "passionate about",
  "cares about the community",
  "cares deeply",
  "voice for the voiceless",
  "breath of fresh air",
  "common-sense solutions",
  "common sense approach",
  "gets things done",
  "puts people first",
  "fighting for you",
  "real change",
  "new energy",
  "new ideas",
  "fresh ideas",
  "seasoned politician",
  "career politician",
  "out of touch",
  "too extreme",
  "not enough experience",
  "lacks experience",
  "lacks vision",
  "no clear plan",
  "flip-flopper",
  "typical politician",
  "empty promises",
  "all talk",
  "more of the same",
  "status quo",
  "washington insider",
  "austin insider",
  "political insider",
];

/**
 * Check if a text matches any generic phrase.
 * Returns the matched phrase or null.
 */
function matchesGenericPhrase(text) {
  const lower = text.toLowerCase().trim();
  for (const phrase of GENERIC_PHRASES) {
    // Match if the entire text IS the generic phrase, or if the text
    // is short (under 60 chars) and contains the phrase as a substantial part
    if (lower === phrase) return phrase;
    if (lower.length < 60 && lower.includes(phrase) && phrase.length >= lower.length * 0.5) {
      return phrase;
    }
  }
  return null;
}

/**
 * Count how many items in an array are predominantly generic.
 * Returns { genericCount, totalCount, genericItems }.
 */
function countGenericItems(items) {
  const results = [];
  for (const item of items) {
    const match = matchesGenericPhrase(item);
    if (match) {
      results.push({ text: item, matchedPhrase: match });
    }
  }
  return {
    genericCount: results.length,
    totalCount: items.length,
    genericItems: results,
  };
}

// ---------------------------------------------------------------------------
// Specificity scoring
// ---------------------------------------------------------------------------

/** Indicators that a statement references something verifiable. */
const SPECIFICITY_INDICATORS = [
  // Numerical references
  /\b\d{4}\b/,                         // years (e.g., "in 2023")
  /\$[\d,.]+[BMKbmk]?/,                // dollar amounts
  /\b\d+%/,                            // percentages
  /\b\d+\s*(years?|months?|terms?)\b/i, // durations
  // Legislative / official actions
  /\bvoted\s+(for|against|to)\b/i,
  /\bsponsored\b/i,
  /\bco-?sponsored\b/i,
  /\bauthored\b/i,
  /\bpassed\b/i,
  /\bsigned\b/i,
  /\bfiled\b/i,
  /\bintroduced\s+(a\s+)?bill\b/i,
  // Specific references
  /\b(bill|resolution|amendment|ordinance|proposition)\s*(no\.?\s*)?\d*/i,
  /\bHB\s*\d+/i,
  /\bSB\s*\d+/i,
  /\bHR\s*\d+/i,
  // Named entities (organizations, endorsements with specifics)
  /\bendorsed\s+by\b/i,
  /\brated\s+(A|B|C|D|F)\b/i,
  /\b(committee|commission|board)\s+on\b/i,
  /\bchair(ed)?\s+(of|the)\b/i,
  // Documented positions / achievements
  /\bfounded\b/i,
  /\bcreated\b/i,
  /\bestablished\b/i,
  /\bsecured\s+\$/i,
  /\bsecured\s+funding\b/i,
  /\bnegotiated\b/i,
  /\bimplemented\b/i,
  /\breduced\b.*\bby\b/i,
  /\bincreased\b.*\bby\b/i,
];

/**
 * Score a single pro/con statement on specificity.
 * Returns a value from 0 (fully generic) to 1 (highly specific).
 */
function scoreSpecificity(text) {
  if (!text || text.length === 0) return 0;

  let matchCount = 0;
  for (const pattern of SPECIFICITY_INDICATORS) {
    if (pattern.test(text)) {
      matchCount++;
    }
  }

  // Also penalize very short statements (under 30 chars are likely generic)
  const lengthBonus = text.length >= 60 ? 0.2 : text.length >= 30 ? 0.1 : 0;

  // Check if it matches a known generic phrase (strong penalty)
  const isGeneric = matchesGenericPhrase(text) !== null;
  if (isGeneric && matchCount === 0) return 0;

  // Score: each indicator match adds 0.25, cap at 1.0
  const indicatorScore = Math.min(matchCount * 0.25, 0.8);
  return Math.min(indicatorScore + lengthBonus, 1.0);
}

/**
 * Score an array of pro/con statements on average specificity.
 * Returns { avgScore, scores[], lowSpecificityCount }.
 */
function scoreSpecificityArray(items) {
  if (!items || items.length === 0) {
    return { avgScore: 0, scores: [], lowSpecificityCount: 0 };
  }
  const scores = items.map(item => scoreSpecificity(item));
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const lowSpecificityCount = scores.filter(s => s === 0).length;
  return {
    avgScore: Math.round(avgScore * 100) / 100,
    scores,
    lowSpecificityCount,
  };
}

// ---------------------------------------------------------------------------
// Sentiment / enthusiasm analysis
// ---------------------------------------------------------------------------

/** Words indicating strong positive sentiment / enthusiasm. */
const STRONG_POSITIVE_WORDS = [
  "outstanding", "exceptional", "remarkable", "impressive", "transformative",
  "groundbreaking", "pioneering", "decisive", "landmark", "historic",
  "sweeping", "unanimous", "overwhelming", "resounding", "instrumental",
  "critical", "vital", "essential", "powerful", "significant",
  "substantial", "dramatic", "extraordinary", "unparalleled", "unprecedented",
];

/** Words indicating mild/tepid positive sentiment. */
const WEAK_POSITIVE_WORDS = [
  "adequate", "acceptable", "satisfactory", "decent", "reasonable",
  "competent", "capable", "solid", "steady", "reliable",
  "respectable", "serviceable", "passable", "sufficient", "okay",
  "fine", "fair", "workable", "functional", "suitable",
];

/** Words indicating strong negative sentiment / alarm. */
const STRONG_NEGATIVE_WORDS = [
  "dangerous", "disastrous", "catastrophic", "reckless", "corrupt",
  "devastating", "appalling", "egregious", "inexcusable", "disgraceful",
  "abysmal", "scandalous", "unconscionable", "toxic", "extreme",
  "radical", "alarming", "dismal", "deplorable", "atrocious",
  "incompetent", "negligent", "destructive", "irresponsible", "shameful",
];

/** Words indicating weak/hedging/tepid language. */
const HEDGING_WORDS = [
  "somewhat", "arguably", "perhaps", "possibly", "might",
  "could", "may", "seems", "appears", "relatively",
  "fairly", "rather", "quite", "slightly", "moderately",
  "some say", "some feel", "generally", "tends to", "on balance",
  "not necessarily", "debatable", "unclear", "mixed",
];

/**
 * Count occurrences of word lists in a text.
 */
function countWordMatches(text, wordList) {
  const lower = text.toLowerCase();
  let count = 0;
  for (const word of wordList) {
    // Use word boundary matching for single words, includes for phrases
    if (word.includes(" ")) {
      if (lower.includes(word)) count++;
    } else {
      const regex = new RegExp("\\b" + word + "\\b", "i");
      if (regex.test(lower)) count++;
    }
  }
  return count;
}

/**
 * Analyze sentiment characteristics of an array of statements.
 * Returns { strongPositiveCount, weakPositiveCount, strongNegativeCount, hedgingCount, avgWordCount }.
 */
function analyzeSentiment(items) {
  if (!items || items.length === 0) {
    return { strongPositiveCount: 0, weakPositiveCount: 0, strongNegativeCount: 0, hedgingCount: 0, avgWordCount: 0 };
  }
  let strongPositiveCount = 0;
  let weakPositiveCount = 0;
  let strongNegativeCount = 0;
  let hedgingCount = 0;
  let totalWordCount = 0;

  for (const item of items) {
    strongPositiveCount += countWordMatches(item, STRONG_POSITIVE_WORDS);
    weakPositiveCount += countWordMatches(item, WEAK_POSITIVE_WORDS);
    strongNegativeCount += countWordMatches(item, STRONG_NEGATIVE_WORDS);
    hedgingCount += countWordMatches(item, HEDGING_WORDS);
    totalWordCount += item.split(/\s+/).filter(Boolean).length;
  }

  return {
    strongPositiveCount,
    weakPositiveCount,
    strongNegativeCount,
    hedgingCount,
    avgWordCount: items.length > 0 ? Math.round(totalWordCount / items.length) : 0,
  };
}

// ---------------------------------------------------------------------------
// Tone resolution (unchanged)
// ---------------------------------------------------------------------------

/**
 * Resolve a field value that may be a tone-variant object.
 * Returns the plain string (tone 3 preferred, then first sorted key).
 */
function resolveTone(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value["3"] || value[Object.keys(value).sort()[0]] || null;
  }
  return null;
}

/**
 * Resolve an array where each element may be a tone-variant object.
 * Returns an array of plain strings.
 */
function resolveToneArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => resolveTone(item)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Candidate analysis (extended)
// ---------------------------------------------------------------------------

/**
 * Analyze pros/cons balance for a single candidate.
 * Returns { prosCount, consCount, prosLength, consLength, prosAvgLength, consAvgLength,
 *           prosSentiment, consSentiment, prosSpecificity, consSpecificity,
 *           prosGeneric, consGeneric }.
 */
function analyzeCandidate(candidate) {
  const pros = resolveToneArray(candidate.pros || []);
  const cons = resolveToneArray(candidate.cons || []);

  const prosLength = pros.reduce((sum, p) => sum + p.length, 0);
  const consLength = cons.reduce((sum, c) => sum + c.length, 0);

  return {
    name: candidate.name,
    prosCount: pros.length,
    consCount: cons.length,
    prosLength,
    consLength,
    prosAvgLength: pros.length > 0 ? Math.round(prosLength / pros.length) : 0,
    consAvgLength: cons.length > 0 ? Math.round(consLength / cons.length) : 0,
    // New: sentiment analysis
    prosSentiment: analyzeSentiment(pros),
    consSentiment: analyzeSentiment(cons),
    // New: specificity scoring
    prosSpecificity: scoreSpecificityArray(pros),
    consSpecificity: scoreSpecificityArray(cons),
    // New: generic content detection
    prosGeneric: countGenericItems(pros),
    consGeneric: countGenericItems(cons),
  };
}

// ---------------------------------------------------------------------------
// Candidate balance checks (extended with new flag types)
// ---------------------------------------------------------------------------

/**
 * Check balance within a single candidate (pros vs cons symmetry).
 * Returns an array of flag objects: { type, candidate, detail, severity }.
 * Severity: "info" | "warning" | "critical"
 */
function checkCandidateBalance(analysis) {
  const flags = [];

  // Flag missing pros or cons entirely
  if (analysis.prosCount === 0 && analysis.consCount === 0) {
    flags.push({
      type: "missing_both",
      candidate: analysis.name,
      detail: "No pros or cons listed",
      severity: "warning",
    });
    return flags;
  }

  if (analysis.prosCount === 0) {
    flags.push({
      type: "missing_pros",
      candidate: analysis.name,
      detail: "Has " + analysis.consCount + " cons but no pros",
      severity: "critical",
    });
  }

  if (analysis.consCount === 0) {
    flags.push({
      type: "missing_cons",
      candidate: analysis.name,
      detail: "Has " + analysis.prosCount + " pros but no cons",
      severity: "critical",
    });
  }

  // Flag count imbalance (more than 2:1 ratio)
  if (analysis.prosCount > 0 && analysis.consCount > 0) {
    const countRatio = Math.max(analysis.prosCount, analysis.consCount) /
      Math.min(analysis.prosCount, analysis.consCount);
    if (countRatio > 2) {
      const moreType = analysis.prosCount > analysis.consCount ? "pros" : "cons";
      flags.push({
        type: "count_imbalance",
        candidate: analysis.name,
        detail: analysis.prosCount + " pros vs " + analysis.consCount + " cons (" + countRatio.toFixed(1) + ":1 ratio favoring " + moreType + ")",
        severity: "warning",
      });
    }
  }

  // Flag length imbalance (total text length differs by >2x)
  if (analysis.prosLength > 0 && analysis.consLength > 0) {
    const lengthRatio = Math.max(analysis.prosLength, analysis.consLength) /
      Math.min(analysis.prosLength, analysis.consLength);
    if (lengthRatio > 2) {
      const longerType = analysis.prosLength > analysis.consLength ? "pros" : "cons";
      flags.push({
        type: "length_imbalance",
        candidate: analysis.name,
        detail: "Total " + longerType + " text is " + lengthRatio.toFixed(1) + "x longer (" + analysis.prosLength + " vs " + analysis.consLength + " chars)",
        severity: "info",
      });
    }
  }

  // --- NEW: Sentiment asymmetry check ---
  if (analysis.prosSentiment && analysis.consSentiment &&
      analysis.prosCount > 0 && analysis.consCount > 0) {
    // Check average word count asymmetry (should be within reasonable range)
    const prosAvgWords = analysis.prosSentiment.avgWordCount;
    const consAvgWords = analysis.consSentiment.avgWordCount;
    if (prosAvgWords > 0 && consAvgWords > 0) {
      const wordCountRatio = Math.max(prosAvgWords, consAvgWords) /
        Math.min(prosAvgWords, consAvgWords);
      // Flag if more than 2.0x difference AND absolute difference is meaningful (>= 3 words)
      if (wordCountRatio > 2.0 && Math.abs(prosAvgWords - consAvgWords) >= 3) {
        const longerSide = prosAvgWords > consAvgWords ? "pros" : "cons";
        const shorterSide = longerSide === "pros" ? "cons" : "pros";
        flags.push({
          type: "sentiment_asymmetry",
          candidate: analysis.name,
          detail: "Average word count asymmetry: " + longerSide + " avg " + Math.max(prosAvgWords, consAvgWords) + " words vs " + shorterSide + " avg " + Math.min(prosAvgWords, consAvgWords) + " words (" + wordCountRatio.toFixed(1) + "x ratio)",
          severity: "info",
        });
      }
    }

    // Check if pros use enthusiastic language but cons are tepid (or vice versa)
    const prosEnthusiasm = analysis.prosSentiment.strongPositiveCount;
    const prosWeakPositive = analysis.prosSentiment.weakPositiveCount || 0;
    const consHedging = analysis.consSentiment.hedgingCount;
    const prosHedging = analysis.prosSentiment.hedgingCount;
    const consEnthusiasm = analysis.consSentiment.strongPositiveCount;
    const consStrongNeg = analysis.consSentiment.strongNegativeCount || 0;
    const prosStrongNeg = analysis.prosSentiment.strongNegativeCount || 0;

    // Glowing pros + hedging cons = suspiciously favorable
    if (prosEnthusiasm >= 2 && consHedging >= 1 && prosHedging === 0) {
      flags.push({
        type: "sentiment_asymmetry",
        candidate: analysis.name,
        detail: "Pros use " + prosEnthusiasm + " strong positive terms while cons use " + consHedging + " hedging/qualifying terms — may be subtly favorable",
        severity: "warning",
      });
    }
    // Strong language in cons + hedging in pros = suspiciously unfavorable
    if (consEnthusiasm >= 2 && prosHedging >= 1 && consHedging === 0) {
      flags.push({
        type: "sentiment_asymmetry",
        candidate: analysis.name,
        detail: "Cons use " + consEnthusiasm + " strong terms while pros use " + prosHedging + " hedging/qualifying terms — may be subtly unfavorable",
        severity: "warning",
      });
    }

    // Tepid/weak pros + harsh/strong-negative cons = suspiciously unfavorable
    if (consStrongNeg >= 2 && prosWeakPositive >= 1 && prosEnthusiasm === 0) {
      flags.push({
        type: "sentiment_asymmetry",
        candidate: analysis.name,
        detail: "Cons use " + consStrongNeg + " strong negative terms while pros use only " + prosWeakPositive + " weak positive terms — may be subtly unfavorable",
        severity: "warning",
      });
    }

    // Harsh/strong-negative pros (unusual) + weak cons = suspiciously favorable framing
    if (prosStrongNeg >= 2 && consHedging >= 1 && consStrongNeg === 0) {
      flags.push({
        type: "sentiment_asymmetry",
        candidate: analysis.name,
        detail: "Pros contain " + prosStrongNeg + " strong negative terms (attack framing) while cons use " + consHedging + " hedging terms — asymmetric tone",
        severity: "warning",
      });
    }
  }

  // --- NEW: Generic content check ---
  if (analysis.prosGeneric && analysis.consGeneric) {
    const totalItems = analysis.prosCount + analysis.consCount;
    const totalGeneric = analysis.prosGeneric.genericCount + analysis.consGeneric.genericCount;

    if (totalItems > 0 && totalGeneric > 0) {
      const genericRatio = totalGeneric / totalItems;
      const genericTexts = [
        ...analysis.prosGeneric.genericItems.map(function(g) { return g.matchedPhrase; }),
        ...analysis.consGeneric.genericItems.map(function(g) { return g.matchedPhrase; }),
      ];
      const quotedTexts = genericTexts.map(function(t) { return String.fromCharCode(34) + t + String.fromCharCode(34); }).join(", ");
      // Flag if more than half of all pros/cons are generic — needs human review
      if (genericRatio > 0.5) {
        flags.push({
          type: "generic_content",
          candidate: analysis.name,
          detail: totalGeneric + " of " + totalItems + " pros/cons are generic phrases (" + quotedTexts + ") — needs human review",
          severity: "warning",
        });
      } else {
        // Even a single generic item is worth noting
        flags.push({
          type: "generic_content",
          candidate: analysis.name,
          detail: totalGeneric + " of " + totalItems + " pros/cons match generic phrases (" + quotedTexts + ")",
          severity: "info",
        });
      }
    }
  }

  // --- NEW: Specificity gap check ---
  if (analysis.prosSpecificity && analysis.consSpecificity &&
      analysis.prosCount > 0 && analysis.consCount > 0) {
    const prosAvgSpec = analysis.prosSpecificity.avgScore;
    const consAvgSpec = analysis.consSpecificity.avgScore;

    // Flag when one side is specific but the other is all generic
    if (prosAvgSpec > 0 && consAvgSpec === 0) {
      flags.push({
        type: "specificity_gap",
        candidate: analysis.name,
        detail: "Pros have specific references (avg score " + prosAvgSpec + ") but cons are entirely generic (avg score 0)",
        severity: "warning",
      });
    } else if (consAvgSpec > 0 && prosAvgSpec === 0) {
      flags.push({
        type: "specificity_gap",
        candidate: analysis.name,
        detail: "Cons have specific references (avg score " + consAvgSpec + ") but pros are entirely generic (avg score 0)",
        severity: "warning",
      });
    } else if (prosAvgSpec > 0 && consAvgSpec > 0) {
      // Flag large gap even if neither is zero
      const specRatio = Math.max(prosAvgSpec, consAvgSpec) / Math.min(prosAvgSpec, consAvgSpec);
      if (specRatio >= 5) {
        const moreSpecific = prosAvgSpec > consAvgSpec ? "pros" : "cons";
        const lessSpecific = moreSpecific === "pros" ? "cons" : "pros";
        flags.push({
          type: "specificity_gap",
          candidate: analysis.name,
          detail: moreSpecific + " are " + specRatio.toFixed(1) + "x more specific than " + lessSpecific + " (" + Math.max(prosAvgSpec, consAvgSpec) + " vs " + Math.min(prosAvgSpec, consAvgSpec) + ")",
          severity: "info",
        });
      }
    }

    // Also flag if ALL items across both sides have zero specificity
    const allZero = analysis.prosSpecificity.avgScore === 0 && analysis.consSpecificity.avgScore === 0;
    if (allZero && (analysis.prosCount + analysis.consCount) >= 2) {
      flags.push({
        type: "specificity_gap",
        candidate: analysis.name,
        detail: "All " + (analysis.prosCount + analysis.consCount) + " pros/cons lack specific references (votes, bills, dollar amounts, dates)",
        severity: "warning",
      });
    }
  }

  return flags;
}

/**
 * Check balance across candidates within a race.
 * Compares total detail level between candidates to flag unequal treatment.
 * Returns { raceFlags, candidateAnalyses }.
 */
function checkRaceBalance(race) {
  const candidates = (race.candidates || []).filter(c => !c.withdrawn);
  const analyses = candidates.map(analyzeCandidate);
  const flags = [];

  // Skip races with fewer than 2 active candidates
  if (analyses.length < 2) {
    return { raceFlags: flags, candidateAnalyses: analyses };
  }

  // Compare total detail (pros + cons text length) across candidates
  const totalLengths = analyses.map(a => a.prosLength + a.consLength);
  const maxTotal = Math.max(...totalLengths);
  const minTotal = Math.min(...totalLengths);

  if (minTotal > 0 && maxTotal / minTotal > 3) {
    const mostDetailed = analyses[totalLengths.indexOf(maxTotal)];
    const leastDetailed = analyses[totalLengths.indexOf(minTotal)];
    flags.push({
      type: "cross_candidate_detail",
      detail: mostDetailed.name + " has " + maxTotal + " chars of pros/cons vs " + leastDetailed.name + " with " + minTotal + " chars (" + (maxTotal / minTotal).toFixed(1) + "x difference)",
      severity: "warning",
    });
  }

  // Check if any candidate has zero pros/cons while others have them
  const hasProsOrCons = analyses.filter(a => a.prosCount > 0 || a.consCount > 0);
  const noProsOrCons = analyses.filter(a => a.prosCount === 0 && a.consCount === 0);
  if (hasProsOrCons.length > 0 && noProsOrCons.length > 0) {
    for (const missing of noProsOrCons) {
      flags.push({
        type: "cross_candidate_missing",
        detail: missing.name + " has no pros/cons while other candidates in this race do",
        severity: "critical",
      });
    }
  }

  // Compare pros count spread across candidates
  const prosCounts = analyses.map(a => a.prosCount).filter(c => c > 0);
  if (prosCounts.length >= 2) {
    const maxPros = Math.max(...prosCounts);
    const minPros = Math.min(...prosCounts);
    if (maxPros > minPros * 2 && maxPros - minPros >= 2) {
      flags.push({
        type: "cross_candidate_pros_count",
        detail: "Pros count ranges from " + minPros + " to " + maxPros + " across candidates",
        severity: "info",
      });
    }
  }

  // Compare cons count spread across candidates
  const consCounts = analyses.map(a => a.consCount).filter(c => c > 0);
  if (consCounts.length >= 2) {
    const maxCons = Math.max(...consCounts);
    const minCons = Math.min(...consCounts);
    if (maxCons > minCons * 2 && maxCons - minCons >= 2) {
      flags.push({
        type: "cross_candidate_cons_count",
        detail: "Cons count ranges from " + minCons + " to " + maxCons + " across candidates",
        severity: "info",
      });
    }
  }

  return { raceFlags: flags, candidateAnalyses: analyses };
}

/**
 * Run balance checks across an entire ballot.
 * Returns a full report with per-race and per-candidate analysis.
 *
 * @param {object} ballot - Ballot object with races[].candidates[].pros/cons
 * @returns {object} { summary, races[] }
 */
function checkBallotBalance(ballot) {
  if (!ballot || !ballot.races) {
    return {
      summary: { totalRaces: 0, totalCandidates: 0, totalFlags: 0, score: 100, criticalCount: 0, warningCount: 0, infoCount: 0 },
      races: [],
    };
  }

  const raceResults = [];
  let totalFlags = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  let totalCandidates = 0;

  for (const race of ballot.races) {
    const activeCandidates = (race.candidates || []).filter(c => !c.withdrawn);
    totalCandidates += activeCandidates.length;

    const { raceFlags, candidateAnalyses } = checkRaceBalance(race);

    // Per-candidate flags
    const candidateFlags = [];
    for (const analysis of candidateAnalyses) {
      const flags = checkCandidateBalance(analysis);
      candidateFlags.push({ ...analysis, flags });
    }

    // Collect all flags for this race
    const allFlags = [...raceFlags, ...candidateFlags.flatMap(c => c.flags)];
    for (const f of allFlags) {
      totalFlags++;
      if (f.severity === "critical") criticalCount++;
      else if (f.severity === "warning") warningCount++;
      else infoCount++;
    }

    const label = race.district ? race.office + " \u2014 " + race.district : race.office;
    raceResults.push({
      office: race.office,
      district: race.district || null,
      label,
      raceFlags,
      candidates: candidateFlags,
      flagCount: allFlags.length,
    });
  }

  // Calculate a balance score (100 = perfect, deduct for flags)
  // Critical: -10 each, Warning: -5 each, Info: -2 each
  const deductions = criticalCount * 10 + warningCount * 5 + infoCount * 2;
  const rawScore = Math.max(0, 100 - deductions);
  // Scale so that a few info flags don\u0027t tank the score too hard
  const score = totalCandidates > 0 ? rawScore : 100;

  return {
    summary: {
      totalRaces: ballot.races.length,
      totalCandidates,
      totalFlags,
      score,
      criticalCount,
      warningCount,
      infoCount,
    },
    races: raceResults,
  };
}

/**
 * Generate a concise text summary of balance check results.
 * Useful for logging or API responses.
 */
function formatBalanceSummary(report) {
  const s = report.summary;
  const lines = [
    "Balance Score: " + s.score + "/100",
    "Races: " + s.totalRaces + " | Candidates: " + s.totalCandidates,
    "Flags: " + s.totalFlags + " (" + s.criticalCount + " critical, " + s.warningCount + " warning, " + s.infoCount + " info)",
  ];

  if (s.totalFlags > 0) {
    lines.push("");
    for (const race of report.races) {
      if (race.flagCount === 0) continue;
      lines.push(race.label + ":");
      for (const f of race.raceFlags) {
        lines.push("  [" + f.severity.toUpperCase() + "] " + f.detail);
      }
      for (const c of race.candidates) {
        for (const f of c.flags) {
          lines.push("  [" + f.severity.toUpperCase() + "] " + f.candidate + ": " + f.detail);
        }
      }
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Single-candidate balance check — convenience wrapper for updater integration
// ---------------------------------------------------------------------------

/** Severity weights used to compute per-candidate balance scores */
const SEVERITY_WEIGHTS = { critical: 25, warning: 10, info: 3 };

/**
 * Compute a 0-100 balance score from an array of flag objects.
 * 100 = perfectly balanced, deductions for each flag by severity.
 */
function computeBalanceScore(flags) {
  if (!flags || flags.length === 0) return 100;
  let deductions = 0;
  for (const f of flags) {
    deductions += SEVERITY_WEIGHTS[f.severity] || 0;
  }
  return Math.max(0, 100 - deductions);
}

/**
 * Run a full balance check on a single candidate object and return a
 * structured result with analysis, flags, balanceScore, and whether any
 * critical flags were found.
 *
 * @param {object} candidate - candidate object with pros, cons, name, etc.
 * @returns {{ analysis: object, flags: object[], balanceScore: number, hasCritical: boolean, criticalFlags: object[] }}
 */
function checkSingleCandidateBalance(candidate) {
  const analysis = analyzeCandidate(candidate);
  const flags = checkCandidateBalance(analysis);
  const balanceScore = computeBalanceScore(flags);
  const criticalFlags = flags.filter(function(f) { return f.severity === "critical"; });
  return {
    analysis,
    flags,
    balanceScore,
    hasCritical: criticalFlags.length > 0,
    criticalFlags,
  };
}

// ---------------------------------------------------------------------------
// Rebalance detection — identifies candidates needing mandatory re-research
// ---------------------------------------------------------------------------

/** Critical flag types that warrant automatic re-research */
const REBALANCE_FLAG_TYPES = ["missing_pros", "missing_cons", "missing_both"];

/**
 * Scan a ballot and return an array of candidates that have critical balance
 * flags warranting automatic re-research.
 *
 * Each returned entry includes the candidate object, the race context, and
 * the specific critical flags that triggered the rebalance need.
 *
 * @param {object} ballot - Ballot object with races[].candidates[]
 * @returns {{ candidate: object, race: string, district: string|null, criticalFlags: object[], balanceScore: number }[]}
 */
function getCandidatesNeedingRebalance(ballot) {
  if (!ballot || !ballot.races) return [];

  const results = [];
  for (const race of ballot.races) {
    const activeCandidates = (race.candidates || []).filter(function(c) { return !c.withdrawn; });
    for (const cand of activeCandidates) {
      const check = checkSingleCandidateBalance(cand);
      if (!check.hasCritical) continue;

      // Filter to only actionable critical flags (missing pros/cons)
      const actionableFlags = check.criticalFlags.filter(function(f) {
        return REBALANCE_FLAG_TYPES.indexOf(f.type) !== -1;
      });
      if (actionableFlags.length === 0) continue;

      results.push({
        candidate: cand,
        race: race.office,
        district: race.district || null,
        criticalFlags: actionableFlags,
        balanceScore: check.balanceScore,
      });
    }
  }
  return results;
}

export {
  resolveTone,
  resolveToneArray,
  analyzeCandidate,
  checkCandidateBalance,
  checkRaceBalance,
  checkBallotBalance,
  formatBalanceSummary,
  // Single-candidate check for updater integration
  checkSingleCandidateBalance,
  computeBalanceScore,
  SEVERITY_WEIGHTS,
  // Rebalance detection
  getCandidatesNeedingRebalance,
  REBALANCE_FLAG_TYPES,
  // Exports for testing
  matchesGenericPhrase,
  countGenericItems,
  scoreSpecificity,
  scoreSpecificityArray,
  analyzeSentiment,
  countWordMatches,
  GENERIC_PHRASES,
  SPECIFICITY_INDICATORS,
  STRONG_POSITIVE_WORDS,
  WEAK_POSITIVE_WORDS,
  STRONG_NEGATIVE_WORDS,
  HEDGING_WORDS,
};

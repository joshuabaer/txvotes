// LLM Model Comparison Experiment Runner
// Runs a systematic comparison of all LLM providers across voter profiles
// to determine the best model for guide generation.

import {
  buildCondensedBallotDescription,
  buildUserPrompt,
  callLLM,
  parseResponse,
  scorePartisanBalance,
  VALID_LLMS,
  SYSTEM_PROMPT,
} from "./pwa-guide.js";
import { STATE_CONFIG } from "./state-config.js";

// MARK: - Cost Rates (per 1M tokens)

const EXP_COST = {
  claude: { input: 3, output: 15 },
  "claude-haiku": { input: 0.80, output: 4 },
  "claude-opus": { input: 15, output: 75 },
  chatgpt: { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  gemini: { input: 0.15, output: 3.5 },
  "gemini-pro": { input: 1.25, output: 10 },
  grok: { input: 5, output: 15 },
};

// MARK: - Voter Profiles (Section 3.1 of plan)

const EXPERIMENT_PROFILES = [
  {
    id: "progressive_urban",
    name: "Progressive Urban",
    party: "democrat",
    profile: {
      politicalSpectrum: "Very Progressive",
      topIssues: ["Healthcare", "Education", "Abortion/Reproductive Rights", "Climate & Environment", "LGBTQ+ Rights", "Criminal Justice", "Voting & Elections"],
      candidateQualities: ["Integrity", "Experience", "Leadership", "Diversity", "Collaboration"],
      policyViews: {
        Healthcare: "Universal healthcare, expand Medicaid",
        Immigration: "Path to citizenship, protect DACA",
        Education: "Increase public school funding, oppose vouchers",
        "Gun Policy": "Assault weapons ban, universal background checks",
        Abortion: "Codify Roe v. Wade protections",
      },
      freeform: "I live in Austin and care deeply about reproductive rights and public transit. I want candidates who will stand up to the state legislature on local control issues.",
    },
    readingLevel: 4,
    lang: "en",
  },
  {
    id: "conservative_rural",
    name: "Conservative Rural",
    party: "republican",
    profile: {
      politicalSpectrum: "Very Conservative",
      topIssues: ["Immigration", "Gun Rights/Safety", "Economy & Jobs", "Agriculture/Rural Issues", "Faith/Religious Liberty", "Public Safety", "Energy & Oil/Gas"],
      candidateQualities: ["Faith & Values", "Business Experience", "Leadership", "Integrity", "Toughness"],
      policyViews: {
        Immigration: "Secure the border, deport illegal immigrants",
        "Gun Policy": "Protect Second Amendment, no new restrictions",
        Economy: "Lower taxes, reduce regulations",
        Energy: "Expand oil and gas production, no green mandates",
        Education: "School choice and vouchers, parental rights",
      },
      freeform: "Rancher in West Texas. Federal government needs to get out of the way. Property rights matter. I want someone who will fight for rural communities.",
    },
    readingLevel: 3,
    lang: "en",
  },
  {
    id: "moderate_suburban",
    name: "Moderate Suburban",
    party: "republican",
    profile: {
      politicalSpectrum: "Moderate",
      topIssues: ["Economy & Jobs", "Education", "Healthcare", "Property Tax", "Public Safety", "Water Rights/Scarcity"],
      candidateQualities: ["Experience", "Collaboration", "Integrity", "Leadership", "Business Experience"],
      policyViews: {
        Healthcare: "Market-based solutions with safety net",
        Education: "Good public schools AND school choice",
        Economy: "Fiscally responsible, pro-business",
        Immigration: "Secure border but practical reforms",
        "Gun Policy": "Second Amendment with responsible ownership",
      },
      freeform: "Suburban mom in the DFW area. I want pragmatic solutions, not culture wars. Tired of both extremes.",
    },
    readingLevel: 3,
    lang: "en",
  },
  {
    id: "single_issue_immigration",
    name: "Single-Issue Immigration",
    party: "republican",
    profile: {
      politicalSpectrum: "Conservative",
      topIssues: ["Immigration", "Immigration", "Immigration", "Public Safety", "Economy & Jobs"],
      candidateQualities: ["Toughness", "Leadership", "Business Experience"],
      policyViews: {
        Immigration: "Complete border wall, end catch and release, mandatory E-Verify, end birthright citizenship",
        "Public Safety": "Support law enforcement",
        Economy: "America first trade policy",
      },
      freeform: "Immigration is THE issue. Everything else is secondary. I want the toughest candidate on the border.",
    },
    readingLevel: 2,
    lang: "en",
  },
  {
    id: "first_time_voter",
    name: "First-Time Voter",
    party: "democrat",
    profile: {
      politicalSpectrum: "Lean Progressive",
      topIssues: ["Education", "Climate & Environment", "Economy & Jobs", "Healthcare", "Housing"],
      candidateQualities: ["Diversity", "Integrity", "Collaboration"],
      policyViews: {
        Education: "Make college more affordable",
        Climate: "Take climate change seriously",
        Economy: "Living wage, affordable housing",
      },
      freeform: "Just turned 18. First time voting. I honestly don't know much about these candidates but I care about my future.",
    },
    readingLevel: 1,
    lang: "en",
  },
  {
    id: "libertarian_leaning",
    name: "Libertarian-Leaning",
    party: "republican",
    profile: {
      politicalSpectrum: "Libertarian",
      topIssues: ["Economy & Jobs", "Gun Rights/Safety", "Property Tax", "Faith/Religious Liberty", "Criminal Justice"],
      candidateQualities: ["Integrity", "Business Experience", "Leadership"],
      policyViews: {
        Economy: "Eliminate income tax, minimal regulation, reduce government spending",
        "Gun Policy": "Constitutional carry, abolish ATF",
        "Criminal Justice": "End drug war, reduce incarceration",
        Education: "Abolish Department of Education, full school choice",
        Healthcare: "Free market healthcare, no mandates",
      },
      freeform: "Government that governs least governs best. Both parties spend too much. Individual liberty above all.",
    },
    readingLevel: 5,
    lang: "en",
  },
  {
    id: "spanish_moderate",
    name: "Spanish-Speaking Moderate",
    party: "democrat",
    profile: {
      politicalSpectrum: "Moderate",
      topIssues: ["Immigration", "Healthcare", "Education", "Economy & Jobs", "Housing"],
      candidateQualities: ["Diversity", "Experience", "Collaboration", "Integrity"],
      policyViews: {
        Immigration: "Protect DREAMers, path to citizenship for law-abiding immigrants",
        Healthcare: "Expand coverage for working families",
        Education: "Bilingual education, well-funded public schools",
        Economy: "Small business support, fair wages",
      },
      freeform: "Mi familia ha vivido en Texas por tres generaciones. Quiero candidatos que representen a toda la comunidad.",
    },
    readingLevel: 3,
    lang: "es",
  },
];

// MARK: - Run Single Experiment

/**
 * Run a single experiment: one profile + one LLM model + one run number.
 * Calls the guide generation pipeline directly (bypasses HTTP/rate limits).
 *
 * @param {object} env - Worker environment with ELECTION_DATA and API keys
 * @param {string} profileId - ID from EXPERIMENT_PROFILES
 * @param {string} llmKey - LLM key (e.g. "claude", "chatgpt")
 * @param {number} runNumber - Repetition number (1-based)
 * @param {string} [stateCode] - State code for KV prefix lookup (default: 'tx')
 * @returns {object} Structured result with timing, response, scores, etc.
 */
async function runSingleExperiment(env, profileId, llmKey, runNumber, stateCode) {
  stateCode = stateCode || 'tx';
  var kvPrefix = (STATE_CONFIG[stateCode] && STATE_CONFIG[stateCode].kvPrefix) || '';
  const expProfile = EXPERIMENT_PROFILES.find(function(p) { return p.id === profileId; });
  if (!expProfile) {
    return { error: "Unknown profile: " + profileId, model: llmKey, profile: profileId, run: runNumber };
  }

  const result = {
    model: llmKey,
    profile: profileId,
    profileName: expProfile.name,
    party: expProfile.party,
    run: runNumber,
    timestamp: new Date().toISOString(),
    timingMs: 0,
    timingSeconds: 0,
    responseText: null,
    parsedResponse: null,
    parseSuccess: false,
    truncated: false,
    error: null,
    tokenUsage: null,
    balanceScore: null,
    costEstimate: null,
    raceCount: 0,
    candidateNameMismatches: [],
    schemaComplete: false,
  };

  try {
    // 1. Read ballot data from KV
    var ballotKey = kvPrefix + "ballot:statewide:" + expProfile.party + "_primary_2026";
    var raw = await env.ELECTION_DATA.get(ballotKey);
    if (!raw) {
      // Try legacy key
      raw = await env.ELECTION_DATA.get(kvPrefix + "ballot:" + expProfile.party + "_primary_2026");
    }
    if (!raw) {
      result.error = "No ballot data found for " + expProfile.party;
      return result;
    }
    var ballot = JSON.parse(raw);

    // 2. Build condensed ballot description
    var ballotDesc = buildCondensedBallotDescription(ballot);

    // 3. Build the user prompt
    var lang = expProfile.lang || "en";
    var userPrompt = buildUserPrompt(
      expProfile.profile,
      ballotDesc,
      ballot,
      expProfile.party,
      lang,
      expProfile.readingLevel,
      null // no cached translations for experiment (forces fresh generation)
    );

    // 4. Call LLM with timing
    var startTime = Date.now();
    var responseText = await callLLM(env, SYSTEM_PROMPT, userPrompt, lang, llmKey);
    var endTime = Date.now();

    result.timingMs = endTime - startTime;
    result.timingSeconds = Math.round((endTime - startTime) / 100) / 10;
    result.responseText = responseText;

    // Estimate token usage from response length (since callLLM returns text only)
    var estimatedOutputTokens = Math.round(responseText.length / 4);
    var estimatedInputTokens = Math.round(userPrompt.length / 4);
    result.tokenUsage = {
      estimatedInputTokens: estimatedInputTokens,
      estimatedOutputTokens: estimatedOutputTokens,
      source: "estimated_from_chars",
    };

    // Estimate cost
    var rates = EXP_COST[llmKey] || EXP_COST.claude;
    result.costEstimate = ((estimatedInputTokens * rates.input) + (estimatedOutputTokens * rates.output)) / 1000000;

    // 5. Parse the response
    try {
      var parsed = parseResponse(responseText);
      result.parsedResponse = parsed;
      result.parseSuccess = true;
      result.truncated = !!parsed._truncated;
      result.raceCount = (parsed.races || []).length;

      // Check schema completeness
      result.schemaComplete = !!(
        parsed.profileSummary &&
        parsed.races &&
        parsed.races.length > 0 &&
        parsed.races.every(function(r) {
          return r.office && r.recommendedCandidate && r.reasoning && r.confidence;
        })
      );

      // Check candidate name mismatches
      var ballotCandidates = {};
      for (var i = 0; i < ballot.races.length; i++) {
        var race = ballot.races[i];
        var raceKey = race.office + "|" + (race.district || "");
        ballotCandidates[raceKey] = race.candidates
          .filter(function(c) { return !c.withdrawn; })
          .map(function(c) { return c.name; });
      }
      for (var j = 0; j < (parsed.races || []).length; j++) {
        var guideRace = parsed.races[j];
        var key = guideRace.office + "|" + (guideRace.district || "");
        var validNames = ballotCandidates[key] || [];
        if (guideRace.recommendedCandidate && validNames.indexOf(guideRace.recommendedCandidate) === -1) {
          result.candidateNameMismatches.push({
            office: guideRace.office,
            recommended: guideRace.recommendedCandidate,
            validCandidates: validNames,
          });
        }
      }

      // 6. Run partisan balance scoring
      result.balanceScore = scorePartisanBalance(parsed, ballot);
    } catch (parseErr) {
      result.parseSuccess = false;
      result.error = "Parse error: " + parseErr.message;
    }
  } catch (err) {
    result.error = err.message || String(err);
    result.timingMs = result.timingMs || (Date.now() - (result.timestamp ? new Date(result.timestamp).getTime() : Date.now()));
  }

  return result;
}

// MARK: - Run Full Experiment

/**
 * Run the full experiment matrix: models x profiles x runs.
 * Iterates sequentially with delays to avoid rate limits.
 * Stores progress and results in KV.
 *
 * @param {object} env - Worker environment
 * @param {object} options - Configuration
 * @param {string[]} [options.models] - LLM keys to test (default: all 8)
 * @param {string[]} [options.profiles] - Profile IDs to test (default: all 7)
 * @param {number} [options.runs] - Number of repetitions (default: 3)
 * @param {string} [options.stateCode] - State code for KV prefix lookup (default: 'tx')
 * @returns {object} Summary of the experiment run
 */
async function runFullExperiment(env, options) {
  var models = (options && options.models) || VALID_LLMS.slice();
  var profileIds = (options && options.profiles) || EXPERIMENT_PROFILES.map(function(p) { return p.id; });
  var runs = (options && options.runs) || 3;
  var stateCode = (options && options.stateCode) || 'tx';

  var totalCalls = models.length * profileIds.length * runs;
  var completed = 0;
  var errors = 0;
  var startTime = Date.now();
  var results = [];

  // Initialize progress in KV
  var progress = {
    status: "running",
    totalCalls: totalCalls,
    completed: 0,
    errors: 0,
    startedAt: new Date().toISOString(),
    estimatedMinutes: Math.round(totalCalls * 17 / 60), // ~15s per call + 2s delay
    currentModel: null,
    currentProfile: null,
    currentRun: null,
  };
  await env.ELECTION_DATA.put("experiment:progress", JSON.stringify(progress), { expirationTtl: 86400 });

  for (var mi = 0; mi < models.length; mi++) {
    var model = models[mi];
    for (var pi = 0; pi < profileIds.length; pi++) {
      var profileId = profileIds[pi];
      for (var ri = 0; ri < runs; ri++) {
        var runNumber = ri + 1;

        // Update progress before each call
        progress.currentModel = model;
        progress.currentProfile = profileId;
        progress.currentRun = runNumber;
        progress.completed = completed;
        progress.errors = errors;
        progress.elapsedMs = Date.now() - startTime;
        await env.ELECTION_DATA.put("experiment:progress", JSON.stringify(progress), { expirationTtl: 86400 });

        // Run the experiment
        console.log("[EXPERIMENT] " + model + " | " + profileId + " | run " + runNumber + " (" + (completed + 1) + "/" + totalCalls + ")");
        var result = await runSingleExperiment(env, profileId, model, runNumber, stateCode);

        if (result.error) {
          errors++;
          console.warn("[EXPERIMENT ERROR] " + model + " | " + profileId + " | run " + runNumber + ": " + result.error);
        }

        // Store individual result in KV (7-day TTL)
        // Strip the raw response text to save KV space — keep parsed data
        var storedResult = Object.assign({}, result);
        delete storedResult.responseText;
        var resultKey = "experiment:result:" + model + ":" + profileId + ":" + runNumber;
        await env.ELECTION_DATA.put(resultKey, JSON.stringify(storedResult), { expirationTtl: 604800 });

        results.push(storedResult);
        completed++;

        // 2-second delay between calls to avoid rate limits
        if (completed < totalCalls) {
          await new Promise(function(resolve) { setTimeout(resolve, 2000); });
        }
      }
    }
  }

  // Mark experiment as complete
  progress.status = "complete";
  progress.completed = completed;
  progress.errors = errors;
  progress.elapsedMs = Date.now() - startTime;
  progress.completedAt = new Date().toISOString();
  await env.ELECTION_DATA.put("experiment:progress", JSON.stringify(progress), { expirationTtl: 86400 });

  // Store the full results summary
  var summary = {
    totalCalls: totalCalls,
    completed: completed,
    errors: errors,
    elapsedMs: Date.now() - startTime,
    elapsedMinutes: Math.round((Date.now() - startTime) / 60000),
    models: models,
    profiles: profileIds,
    runs: runs,
    startedAt: progress.startedAt,
    completedAt: progress.completedAt,
  };
  await env.ELECTION_DATA.put("experiment:summary", JSON.stringify(summary), { expirationTtl: 604800 });

  return summary;
}

// MARK: - Analyze Experiment Results

/**
 * Compute automated scoring across all experiment results.
 *
 * Criteria:
 *   - Consensus: Cross-model agreement rate
 *   - JSON Compliance: Parse success rate, schema compliance, truncation rate
 *   - Reasoning Quality: Average reasoning length, matchFactors count
 *   - Speed: Median and p90 timing per model
 *   - Cost: Average cost per guide
 *   - Robustness: Error rate, truncation rate
 *   - Balance: Average partisan balance score
 *
 * @param {Array} results - Array of experiment result objects
 * @returns {object} Per-model scores and weighted composite
 */
function analyzeExperimentResults(results) {
  if (!results || results.length === 0) {
    return { error: "No results to analyze", models: {} };
  }

  // Group results by model
  var byModel = {};
  for (var i = 0; i < results.length; i++) {
    var r = results[i];
    if (!byModel[r.model]) byModel[r.model] = [];
    byModel[r.model].push(r);
  }

  // --- Consensus analysis ---
  // For each race across all profiles, find what candidate each model recommends
  // Group by profile+race, then find majority candidate
  var raceVotes = {}; // key: "profileId|office|district" -> { candidateName: count }
  for (var j = 0; j < results.length; j++) {
    var res = results[j];
    if (!res.parsedResponse || !res.parsedResponse.races) continue;
    for (var k = 0; k < res.parsedResponse.races.length; k++) {
      var race = res.parsedResponse.races[k];
      var raceKey = res.profile + "|" + race.office + "|" + (race.district || "");
      if (!raceVotes[raceKey]) raceVotes[raceKey] = {};
      var candidate = race.recommendedCandidate;
      if (candidate) {
        raceVotes[raceKey][candidate] = (raceVotes[raceKey][candidate] || 0) + 1;
      }
    }
  }

  // Find consensus candidate for each race (majority across all models/runs)
  var consensus = {}; // raceKey -> consensusCandidate
  var raceKeys = Object.keys(raceVotes);
  for (var ck = 0; ck < raceKeys.length; ck++) {
    var rk = raceKeys[ck];
    var votes = raceVotes[rk];
    var maxVotes = 0;
    var maxCandidate = null;
    var totalVotes = 0;
    var candidateNames = Object.keys(votes);
    for (var cn = 0; cn < candidateNames.length; cn++) {
      totalVotes += votes[candidateNames[cn]];
      if (votes[candidateNames[cn]] > maxVotes) {
        maxVotes = votes[candidateNames[cn]];
        maxCandidate = candidateNames[cn];
      }
    }
    // Only count as consensus if the top candidate has > 50% of votes
    if (maxVotes > totalVotes / 2) {
      consensus[rk] = maxCandidate;
    }
  }

  // Score each model on consensus agreement
  var modelScores = {};
  var models = Object.keys(byModel);
  for (var mi = 0; mi < models.length; mi++) {
    var model = models[mi];
    var modelResults = byModel[model];
    var scores = {
      model: model,
      totalRuns: modelResults.length,

      // Consensus
      consensusAgreements: 0,
      consensusTotal: 0,
      consensusRate: 0,

      // JSON compliance
      parseSuccessCount: 0,
      parseSuccessRate: 0,
      schemaCompleteCount: 0,
      schemaCompleteRate: 0,
      truncatedCount: 0,
      truncationRate: 0,
      candidateNameMismatchCount: 0,
      candidateNameMismatchRate: 0,

      // Reasoning quality
      avgReasoningLength: 0,
      avgMatchFactors: 0,

      // Speed
      timings: [],
      medianTimingMs: 0,
      p90TimingMs: 0,

      // Cost
      avgCost: 0,
      totalCost: 0,

      // Robustness
      errorCount: 0,
      errorRate: 0,

      // Balance
      avgBalanceFlags: 0,
      balanceDetails: [],

      // Composite
      criterionScores: {},
      compositeScore: 0,
    };

    var totalReasoningLength = 0;
    var totalMatchFactors = 0;
    var reasoningCount = 0;
    var totalCost = 0;
    var totalMismatches = 0;
    var totalRaces = 0;
    var totalBalanceFlags = 0;

    for (var ri = 0; ri < modelResults.length; ri++) {
      var mr = modelResults[ri];

      // Parse success
      if (mr.parseSuccess) scores.parseSuccessCount++;
      if (mr.schemaComplete) scores.schemaCompleteCount++;
      if (mr.truncated) scores.truncatedCount++;
      if (mr.error) scores.errorCount++;
      if (mr.timingMs > 0) scores.timings.push(mr.timingMs);
      if (mr.costEstimate) totalCost += mr.costEstimate;

      // Candidate name mismatches
      totalMismatches += (mr.candidateNameMismatches || []).length;
      totalRaces += mr.raceCount || 0;

      // Balance
      if (mr.balanceScore) {
        totalBalanceFlags += (mr.balanceScore.flags || []).length;
        scores.balanceDetails.push({
          profile: mr.profile,
          run: mr.run,
          flags: mr.balanceScore.flags || [],
          avgConfidence: mr.balanceScore.avgConfidence,
          avgReasoningLength: mr.balanceScore.avgReasoningLength,
        });
      }

      // Consensus agreement
      if (mr.parsedResponse && mr.parsedResponse.races) {
        for (var rc = 0; rc < mr.parsedResponse.races.length; rc++) {
          var guideRace = mr.parsedResponse.races[rc];
          var consensusKey = mr.profile + "|" + guideRace.office + "|" + (guideRace.district || "");
          if (consensus[consensusKey]) {
            scores.consensusTotal++;
            if (guideRace.recommendedCandidate === consensus[consensusKey]) {
              scores.consensusAgreements++;
            }
          }
        }
      }

      // Reasoning quality
      if (mr.parsedResponse && mr.parsedResponse.races) {
        for (var rq = 0; rq < mr.parsedResponse.races.length; rq++) {
          totalReasoningLength += (mr.parsedResponse.races[rq].reasoning || "").length;
          totalMatchFactors += (mr.parsedResponse.races[rq].matchFactors || []).length;
          reasoningCount++;
        }
      }
    }

    // Compute rates
    scores.parseSuccessRate = scores.totalRuns > 0 ? Math.round((scores.parseSuccessCount / scores.totalRuns) * 1000) / 10 : 0;
    scores.schemaCompleteRate = scores.totalRuns > 0 ? Math.round((scores.schemaCompleteCount / scores.totalRuns) * 1000) / 10 : 0;
    scores.truncationRate = scores.totalRuns > 0 ? Math.round((scores.truncatedCount / scores.totalRuns) * 1000) / 10 : 0;
    scores.errorRate = scores.totalRuns > 0 ? Math.round((scores.errorCount / scores.totalRuns) * 1000) / 10 : 0;
    scores.consensusRate = scores.consensusTotal > 0 ? Math.round((scores.consensusAgreements / scores.consensusTotal) * 1000) / 10 : 0;
    scores.candidateNameMismatchRate = totalRaces > 0 ? Math.round((totalMismatches / totalRaces) * 1000) / 10 : 0;
    scores.candidateNameMismatchCount = totalMismatches;

    // Averages
    scores.avgReasoningLength = reasoningCount > 0 ? Math.round(totalReasoningLength / reasoningCount) : 0;
    scores.avgMatchFactors = reasoningCount > 0 ? Math.round((totalMatchFactors / reasoningCount) * 100) / 100 : 0;
    scores.totalCost = Math.round(totalCost * 10000) / 10000;
    scores.avgCost = scores.totalRuns > 0 ? Math.round((totalCost / scores.totalRuns) * 10000) / 10000 : 0;
    scores.avgBalanceFlags = scores.totalRuns > 0 ? Math.round((totalBalanceFlags / scores.totalRuns) * 100) / 100 : 0;

    // Timing percentiles
    if (scores.timings.length > 0) {
      var sorted = scores.timings.slice().sort(function(a, b) { return a - b; });
      var medianIdx = Math.floor(sorted.length / 2);
      scores.medianTimingMs = sorted.length % 2 === 0
        ? Math.round((sorted[medianIdx - 1] + sorted[medianIdx]) / 2)
        : sorted[medianIdx];
      var p90Idx = Math.min(Math.floor(sorted.length * 0.9), sorted.length - 1);
      scores.p90TimingMs = sorted[p90Idx];
    }

    modelScores[model] = scores;
  }

  // --- Criterion scoring (0-10 scale) ---
  // Find max reasoning length for normalization
  var maxReasoningLength = 0;
  var maxMatchFactors = 0;
  for (var ms = 0; ms < models.length; ms++) {
    if (modelScores[models[ms]].avgReasoningLength > maxReasoningLength) {
      maxReasoningLength = modelScores[models[ms]].avgReasoningLength;
    }
    if (modelScores[models[ms]].avgMatchFactors > maxMatchFactors) {
      maxMatchFactors = modelScores[models[ms]].avgMatchFactors;
    }
  }

  for (var cs = 0; cs < models.length; cs++) {
    var m = models[cs];
    var s = modelScores[m];

    // Quality (consensus agreement rate -> 0-10)
    var qualityScore = s.consensusRate > 0 ? Math.min(s.consensusRate / 10, 10) : 5;

    // Reasoning (normalized to top model = 10)
    var reasoningLenScore = maxReasoningLength > 0 ? (s.avgReasoningLength / maxReasoningLength) * 10 : 5;
    var matchFactorsScore = maxMatchFactors > 0 ? (s.avgMatchFactors / maxMatchFactors) * 10 : 5;
    var reasoningScore = (reasoningLenScore + matchFactorsScore) / 2;

    // JSON compliance (parse success rate -> 0-10)
    var jsonScore = s.parseSuccessRate / 10;

    // Speed (rubric from plan section 2.6)
    var medianSec = s.medianTimingMs / 1000;
    var speedScore;
    if (medianSec < 5) speedScore = 10;
    else if (medianSec < 10) speedScore = 8;
    else if (medianSec < 20) speedScore = 6;
    else if (medianSec < 30) speedScore = 4;
    else if (medianSec < 45) speedScore = 2;
    else speedScore = 1;

    // Cost (rubric from plan section 2.7)
    var costPerGuide = s.avgCost;
    var costScore;
    if (costPerGuide < 0.005) costScore = 10;
    else if (costPerGuide < 0.02) costScore = 8;
    else if (costPerGuide < 0.05) costScore = 6;
    else if (costPerGuide < 0.10) costScore = 4;
    else if (costPerGuide < 0.20) costScore = 2;
    else costScore = 1;

    // Robustness: (1 - combined failure rate) * 10
    var failureRate = (s.errorRate + s.truncationRate) / 100;
    var robustnessScore = Math.max((1 - failureRate) * 10, 0);

    // Balance: fewer flags = better, normalized 0-10
    // 0 flags = 10, 1 flag avg = 7, 2+ flags avg = 4
    var balanceScore;
    if (s.avgBalanceFlags < 0.5) balanceScore = 10;
    else if (s.avgBalanceFlags < 1) balanceScore = 8;
    else if (s.avgBalanceFlags < 1.5) balanceScore = 7;
    else if (s.avgBalanceFlags < 2) balanceScore = 5;
    else balanceScore = 3;

    s.criterionScores = {
      quality: Math.round(qualityScore * 100) / 100,
      reasoning: Math.round(reasoningScore * 100) / 100,
      json: Math.round(jsonScore * 100) / 100,
      speed: speedScore,
      cost: costScore,
      robustness: Math.round(robustnessScore * 100) / 100,
      balance: balanceScore,
    };

    // Weighted composite (from plan section 4.1)
    // Quality=30%, Reasoning=15%, Accuracy=20% (use quality as proxy since accuracy is manual),
    // JSON=10%, Balance=10%, Speed=5%, Cost=5%, Robustness=5%
    // Note: accuracy is manual-only, so we redistribute its weight to quality for automated scoring
    s.compositeScore = Math.round((
      qualityScore * 0.50 +    // quality + accuracy share (30% + 20%)
      reasoningScore * 0.15 +
      jsonScore * 0.10 +
      balanceScore * 0.10 +
      speedScore * 0.05 +
      costScore * 0.05 +
      robustnessScore * 0.05
    ) * 100) / 100;

    modelScores[m] = s;
  }

  // Build ranking
  var ranking = models.slice().sort(function(a, b) {
    return (modelScores[b].compositeScore || 0) - (modelScores[a].compositeScore || 0);
  });

  return {
    models: modelScores,
    ranking: ranking,
    consensusRaces: Object.keys(consensus).length,
    totalResults: results.length,
    analyzedAt: new Date().toISOString(),
  };
}

// MARK: - Status & Results Retrieval

/**
 * Get current experiment progress from KV.
 * @param {object} env
 * @returns {object|null} Progress object or null
 */
async function getExperimentStatus(env) {
  var raw = await env.ELECTION_DATA.get("experiment:progress");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * Read all experiment results from KV and run analysis.
 * Discovers results by iterating known models/profiles/runs from the summary.
 *
 * @param {object} env
 * @returns {object} Full analysis with per-model scores and composite rankings
 */
async function getExperimentResults(env) {
  // Read summary to know what to look for
  var summaryRaw = await env.ELECTION_DATA.get("experiment:summary");
  if (!summaryRaw) {
    return { error: "No experiment results found. Run an experiment first." };
  }

  var summary;
  try {
    summary = JSON.parse(summaryRaw);
  } catch (e) {
    return { error: "Could not parse experiment summary." };
  }

  var models = summary.models || VALID_LLMS;
  var profiles = summary.profiles || EXPERIMENT_PROFILES.map(function(p) { return p.id; });
  var runs = summary.runs || 3;

  // Collect all results from KV
  var results = [];
  var missing = 0;
  for (var mi = 0; mi < models.length; mi++) {
    for (var pi = 0; pi < profiles.length; pi++) {
      for (var ri = 1; ri <= runs; ri++) {
        var key = "experiment:result:" + models[mi] + ":" + profiles[pi] + ":" + ri;
        var raw = await env.ELECTION_DATA.get(key);
        if (raw) {
          try {
            results.push(JSON.parse(raw));
          } catch (e) {
            missing++;
          }
        } else {
          missing++;
        }
      }
    }
  }

  if (results.length === 0) {
    return { error: "No individual results found in KV.", summary: summary };
  }

  var analysis = analyzeExperimentResults(results);
  analysis.summary = summary;
  analysis.missingResults = missing;

  return analysis;
}

// MARK: - Exports

export {
  EXPERIMENT_PROFILES,
  EXP_COST,
  VALID_LLMS,
  runSingleExperiment,
  runFullExperiment,
  analyzeExperimentResults,
  getExperimentStatus,
  getExperimentResults,
};

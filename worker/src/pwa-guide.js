// Server-side guide generation for PWA
// Ported from ClaudeService.swift

import { logTokenUsage } from "./usage-logger.js";
import { getElectionPhase, ELECTION_PHASES } from "./state-config.js";

const SYSTEM_PROMPT =
  "You are a non-partisan voting guide assistant for Texas elections. " +
  "Your job is to make personalized recommendations based ONLY on the voter's stated values and the candidate data provided. " +
  "You must NEVER recommend a candidate who is not listed in the provided ballot data. " +
  "You must NEVER invent or hallucinate candidate information. " +
  "VOICE: Always address the voter as \"you\" (second person). Never say \"the voter\" or use third person. " +
  "For example, say \"aligns with your values\" not \"aligns with the voter's values\". " +
  "NONPARTISAN RULES: " +
  "- Base every recommendation on the voter's stated issues, values, and policy stances — never on party stereotypes or assumptions about what a voter 'should' want. " +
  "- Use neutral, factual language in all reasoning. Avoid loaded terms, partisan framing, or editorial commentary. " +
  "- Treat all candidates with equal analytical rigor regardless of their positions. " +
  "- For propositions, connect recommendations to the voter's stated values without advocating for or against any ideology. " +
  "SPANISH DIALECT: When generating Spanish content, use neutral Latin American Spanish (español neutro) accessible to all Spanish speakers. Avoid region-specific slang or colloquialisms. Use \"usted\" forms where appropriate. Prefer universally understood vocabulary over country-specific terms. " +
  "Respond with ONLY valid JSON — no markdown, no explanation, no text outside the JSON object.";

const MODELS = ["claude-sonnet-4-6", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// MARK: - Guide Response Caching

/**
 * Build a deterministic SHA-256 hash of the voter profile + ballot data
 * for use as a cache key. Includes all fields that affect guide output.
 *
 * @param {object} profile - Voter profile (topIssues, politicalSpectrum, candidateQualities, policyViews, freeform)
 * @param {object} ballot - Filtered ballot data (after district filtering + county merge)
 * @param {string} party - "republican" or "democrat"
 * @param {string|null} lang - Language code ("en", "es", etc.)
 * @param {number|undefined} readingLevel - Reading level 1-8
 * @param {string|null} llm - LLM provider ("claude", "chatgpt", etc.)
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
async function hashGuideKey(profile, ballot, party, lang, readingLevel, llm) {
  var keyObj = {
    party: party,
    lang: lang || "en",
    readingLevel: readingLevel || 3,
    llm: llm || "claude",
    issues: (profile.topIssues || []).slice().sort(),
    spectrum: profile.politicalSpectrum || "Moderate",
    qualities: (profile.candidateQualities || []).slice().sort(),
    stances: Object.keys(profile.policyViews || {}).sort().map(function(k) {
      return k + ":" + profile.policyViews[k];
    }),
    freeform: profile.freeform || "",
    // Hash ballot race/candidate structure so cache invalidates when ballot data changes
    ballotRaces: ballot.races.map(function(r) {
      return r.office + "|" + (r.district || "") + "|" +
        r.candidates.filter(function(c) { return !c.withdrawn; })
          .map(function(c) { return c.name; }).join(",");
    }).sort(),
    ballotProps: (ballot.propositions || []).map(function(p) {
      return p.number + ":" + p.title;
    }),
  };

  var data = new TextEncoder().encode(JSON.stringify(keyObj));
  var hashBuffer = await crypto.subtle.digest("SHA-256", data);
  var hashArray = new Uint8Array(hashBuffer);
  var hex = "";
  for (var i = 0; i < hashArray.length; i++) {
    hex += hashArray[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export async function handlePWA_Guide(request, env) {
  try {
    // Check election phase — block guide generation after polls close
    var requestUrl = new URL(request.url);
    var stateCode = requestUrl.pathname.startsWith("/dc/") ? "dc" : "tx";
    var testPhase = requestUrl.searchParams.get("test_phase");
    var kvPhase = (testPhase && ELECTION_PHASES.includes(testPhase)) ? testPhase : await env.ELECTION_DATA.get("site_phase:" + stateCode);
    var phase = getElectionPhase(stateCode, { kvPhase });
    if (phase === "post-election" || phase === "election-night") {
      return json({ error: "Guide generation is closed. The primary election has ended.", phase }, 410);
    }

    // Check for cache bypass via query param or request body
    var nocache = requestUrl.searchParams.get("nocache") === "1";

    const { party, profile, districts, lang, countyFips, readingLevel, llm } = await request.json();

    if (!party || !["republican", "democrat"].includes(party)) {
      return json({ error: "party required (republican|democrat)" }, 400);
    }
    if (!profile) {
      return json({ error: "profile required" }, 400);
    }

    // Parallel KV reads — statewide, legacy fallback, county, and manifest are independent
    var [statewideRaw, legacyRaw, countyRaw, manifestRaw] = await Promise.all([
      env.ELECTION_DATA.get("ballot:statewide:" + party + "_primary_2026"),
      env.ELECTION_DATA.get("ballot:" + party + "_primary_2026"),
      countyFips
        ? env.ELECTION_DATA.get("ballot:county:" + countyFips + ":" + party + "_primary_2026")
        : Promise.resolve(null),
      env.ELECTION_DATA.get("manifest"),
    ]);

    // Statewide ballot: prefer new key, fall back to legacy
    var raw = statewideRaw || legacyRaw;
    if (!raw) {
      return json({ error: "No ballot data available" }, 404);
    }
    var ballot = JSON.parse(raw);

    // Merge county-specific races if countyFips provided
    var countyBallotAvailable = false;
    if (countyFips && countyRaw) {
      try {
        var countyBallot = JSON.parse(countyRaw);
        var seenRaces = new Set(ballot.races.map(r => `${r.office}|${r.district || ''}`));
        var dedupedCounty = (countyBallot.races || []).filter(r => !seenRaces.has(`${r.office}|${r.district || ''}`));
        ballot.races = ballot.races.concat(dedupedCounty);
        if (countyBallot.propositions) {
          ballot.propositions = (ballot.propositions || []).concat(countyBallot.propositions);
        }
        countyBallotAvailable = true;
      } catch (e) { /* use statewide-only if merge fails */ }
    }

    // Filter by districts
    if (districts) {
      ballot = filterBallotToDistricts(ballot, districts);
    }

    // --- Guide response caching ---
    var cacheKey = null;
    var cached = false;
    if (!nocache) {
      try {
        var hash = await hashGuideKey(profile, ballot, party, lang, readingLevel, llm);
        cacheKey = "guide_cache:" + hash;
        var cachedRaw = await env.ELECTION_DATA.get(cacheKey);
        if (cachedRaw) {
          var cachedResult = JSON.parse(cachedRaw);
          cachedResult.cached = true;
          console.log("Guide cache HIT for " + party + " (key=" + cacheKey.slice(0, 30) + "...)");
          return json(cachedResult);
        }
      } catch (e) {
        // Cache lookup failed — proceed without cache
        console.log("Guide cache lookup error:", e.message);
        cacheKey = null;
      }
    }

    // Check for cached Spanish translations in KV
    var cachedTranslations = null;
    if (lang === "es") {
      cachedTranslations = await loadCachedTranslations(env, party, countyFips);
    }

    // Build ballot description (with KV caching)
    var ballotDesc;
    var ballotDescCacheKey = null;
    try {
      var ballotDescData = new TextEncoder().encode(JSON.stringify({
        races: ballot.races.map(function(r) {
          return r.office + "|" + (r.district || "") + "|" +
            r.candidates.map(function(c) { return c.name + (c.withdrawn ? "W" : "") + (c.isIncumbent ? "I" : ""); }).join(",");
        }).sort(),
        props: (ballot.propositions || []).map(function(p) { return p.number + ":" + p.title; }),
        electionName: ballot.electionName,
      }));
      var ballotDescHashBuf = await crypto.subtle.digest("SHA-256", ballotDescData);
      var ballotDescHashArr = new Uint8Array(ballotDescHashBuf);
      var ballotDescHex = "";
      for (var h = 0; h < ballotDescHashArr.length; h++) {
        ballotDescHex += ballotDescHashArr[h].toString(16).padStart(2, "0");
      }
      ballotDescCacheKey = "ballot_desc:" + ballotDescHex;
      var cachedDesc = await env.ELECTION_DATA.get(ballotDescCacheKey);
      if (cachedDesc) {
        ballotDesc = cachedDesc;
        console.log("Ballot desc cache HIT (key=" + ballotDescCacheKey.slice(0, 30) + "...)");
      }
    } catch (e) {
      // Cache lookup failed — proceed without cache
      console.log("Ballot desc cache error:", e.message);
      ballotDescCacheKey = null;
    }
    if (!ballotDesc) {
      ballotDesc = buildCondensedBallotDescription(ballot);
      // Cache the description (non-blocking, 1-hour TTL)
      if (ballotDescCacheKey) {
        env.ELECTION_DATA.put(ballotDescCacheKey, ballotDesc, { expirationTtl: 3600 })
          .catch(function(e) { console.log("Ballot desc cache write error:", e.message); });
      }
    }

    // Build prompts (skip candidateTranslations schema if we have cached translations)
    var userPrompt = buildUserPrompt(profile, ballotDesc, ballot, party, lang, readingLevel, cachedTranslations);

    // Call LLM — use smaller token budget when translations are cached
    var effectiveLang = (lang === "es" && cachedTranslations) ? "es_cached" : lang;
    var responseText = await callLLM(env, SYSTEM_PROMPT, userPrompt, effectiveLang, llm);

    // Parse and merge (apply cached translations if available)
    var guideResponse = parseResponse(responseText);
    var mergedBallot = mergeRecommendations(guideResponse, ballot, lang, cachedTranslations);

    // Post-generation partisan balance scoring
    var balanceScore = scorePartisanBalance(guideResponse, ballot);
    if (balanceScore.flags.length > 0) {
      console.log("Partisan balance flags for " + party + " guide:", balanceScore.flags.join("; "));
    }

    // Extract data freshness timestamp from manifest (already loaded in parallel)
    var dataUpdatedAt = null;
    try {
      if (manifestRaw) {
        var manifest = JSON.parse(manifestRaw);
        if (manifest[party] && manifest[party].updatedAt) {
          dataUpdatedAt = manifest[party].updatedAt;
        }
      }
    } catch (e) { /* non-fatal */ }

    var result = {
      ballot: mergedBallot,
      profileSummary: guideResponse.profileSummary,
      llm: llm || "claude",
      countyBallotAvailable: countyFips ? countyBallotAvailable : null,
      dataUpdatedAt: dataUpdatedAt,
      balanceScore: balanceScore,
      skewNote: balanceScore.skewNote,
      translationsCached: lang === "es" ? !!cachedTranslations : null,
      cached: false,
    };

    // Store in cache (non-blocking, 1-hour TTL)
    if (cacheKey) {
      env.ELECTION_DATA.put(cacheKey, JSON.stringify(result), { expirationTtl: 3600 })
        .catch(function(e) { console.log("Guide cache write error:", e.message); });
    }

    return json(result);
  } catch (err) {
    console.error("Guide generation error:", err);
    return json({ error: err.message || "Guide generation failed" }, 500);
  }
}

// MARK: - Profile Summary Regeneration

const SUMMARY_SYSTEM =
  "You are a concise, non-partisan political analyst. Return only plain text, no formatting. " +
  "Describe the voter's views using neutral, respectful language. Never use partisan labels, " +
  "stereotypes, or loaded terms. Focus on their actual stated values and priorities.";

export async function handlePWA_Summary(request, env) {
  try {
    // Check election phase — block summary generation after polls close
    var summaryUrl = new URL(request.url);
    var summaryState = summaryUrl.pathname.startsWith("/dc/") ? "dc" : "tx";
    var summaryTestPhase = summaryUrl.searchParams.get("test_phase");
    var summaryKvPhase = (summaryTestPhase && ELECTION_PHASES.includes(summaryTestPhase)) ? summaryTestPhase : await env.ELECTION_DATA.get("site_phase:" + summaryState);
    var summaryPhase = getElectionPhase(summaryState, { kvPhase: summaryKvPhase });
    if (summaryPhase === "post-election" || summaryPhase === "election-night") {
      return json({ error: "Guide generation is closed. The primary election has ended.", phase: summaryPhase }, 410);
    }

    const { profile, lang, readingLevel, llm } = await request.json();
    if (!profile) {
      return json({ error: "profile required" }, 400);
    }

    var topIssues = (profile.topIssues || []).slice(0, 7);
    var otherIssues = (profile.topIssues || []).slice(7);
    var issues = topIssues.map(function(item, i) { return (i + 1) + ". " + item; }).join(", ");
    if (otherIssues.length) issues += " (also: " + otherIssues.join(", ") + ")";
    var topQuals = (profile.candidateQualities || []).slice(0, 5);
    var qualities = topQuals.map(function(item, i) { return (i + 1) + ". " + item; }).join(", ");
    var stances = Object.keys(profile.policyViews || {})
      .map(function (k) { return k + ": " + profile.policyViews[k]; })
      .join("; ");

    var langInstruction = lang === "es"
      ? "Write your response in neutral Latin American Spanish (español neutro). Avoid regional slang, prefer universally understood vocabulary, use \"usted\" forms. "
      : "";

    var toneInstruction = READING_LEVEL_INSTRUCTIONS[readingLevel] || "";

    var userMessage =
      langInstruction +
      toneInstruction +
      "Write 2-3 sentences describing this person's politics the way they might describe it to a friend. " +
      "Be conversational, specific, and insightful \u2014 synthesize who they are as a voter, don't just list positions. " +
      'NEVER say "I\'m a Democrat" or "I\'m a Republican" or identify with a party label \u2014 focus on their actual views, values, and priorities. ' +
      "Use neutral, respectful language. Never use loaded terms, stereotypes, or partisan framing.\n\n" +
      "- Political spectrum: " + (profile.politicalSpectrum || "Moderate") + "\n" +
      "- Top issues: " + issues + "\n" +
      "- Values in candidates: " + qualities + "\n" +
      "- Policy stances: " + stances + "\n" +
      (profile.freeform ? "- Additional context: " + profile.freeform + "\n" : "") +
      "\nReturn ONLY the summary text \u2014 no JSON, no quotes, no labels.";

    var text = await callLLM(env, SUMMARY_SYSTEM, userMessage, lang, llm);
    return json({ summary: text.trim() });
  } catch (err) {
    console.error("Summary generation error:", err);
    return json({ error: err.message || "Summary generation failed" }, 500);
  }
}

// MARK: - District Filtering

function filterBallotToDistricts(ballot, districts) {
  var districtValues = new Set(
    [
      districts.congressional,
      districts.stateSenate,
      districts.stateHouse,
      districts.countyCommissioner,
      districts.schoolBoard,
    ].filter(Boolean)
  );
  return {
    id: ballot.id,
    party: ballot.party,
    electionDate: ballot.electionDate,
    electionName: ballot.electionName,
    districts: districts,
    races: ballot.races.filter(function (race) {
      if (!race.district) return true;
      return districtValues.has(race.district);
    }),
    propositions: ballot.propositions || [],
  };
}

// MARK: - Condensed Ballot Description

function sortOrder(race) {
  var o = race.office;
  if (o.includes("U.S. Senator")) return 0;
  if (o.includes("U.S. Rep")) return 1;
  if (o.includes("Governor")) return 10;
  if (o.includes("Lt. Governor") || o.includes("Lieutenant")) return 11;
  if (o.includes("Attorney General")) return 12;
  if (o.includes("Comptroller")) return 13;
  if (o.includes("Agriculture")) return 14;
  if (o.includes("Land")) return 15;
  if (o.includes("Railroad")) return 16;
  if (o.includes("State Rep")) return 20;
  if (o.includes("Supreme Court")) return 30;
  if (o.includes("Criminal Appeals")) return 31;
  if (o.includes("Court of Appeals")) return 32;
  if (o.includes("Board of Education")) return 40;
  return 50;
}

function buildCondensedBallotDescription(ballot) {
  var lines = ["ELECTION: " + ballot.electionName, ""];

  var sortedRaces = ballot.races.slice().sort(function (a, b) {
    return sortOrder(a) - sortOrder(b);
  });

  for (var i = 0; i < sortedRaces.length; i++) {
    var race = sortedRaces[i];
    var label = race.district
      ? race.office + " \u2014 " + race.district
      : race.office;
    var activeCandidates = race.candidates.filter(function(c){ return !c.withdrawn; });
    var effectivelyContested = activeCandidates.length > 1;
    var contested = effectivelyContested ? "" : " [UNCONTESTED]";
    lines.push("RACE: " + label + contested);
    for (var j = 0; j < activeCandidates.length; j++) {
      var c = activeCandidates[j];
      var inc = c.isIncumbent ? " (incumbent)" : "";
      lines.push("  - " + c.name + inc);
      // Skip detailed fields for uncontested races to save tokens
      if (effectivelyContested) {
        if (c.keyPositions && c.keyPositions.length) {
          lines.push("    Positions: " + c.keyPositions.slice(0, 5).join("; "));
        }
        if (c.endorsements && c.endorsements.length) {
          lines.push("    Endorsements: " + c.endorsements.slice(0, 5).map(e => {
            if (typeof e === "string") return e;
            return e.type ? `${e.name} (${e.type})` : e.name;
          }).join("; "));
        }
        if (c.pros && c.pros.length) {
          lines.push("    Pros: " + c.pros.slice(0, 5).join("; "));
        }
        if (c.cons && c.cons.length) {
          lines.push("    Cons: " + c.cons.slice(0, 5).join("; "));
        }
      }
    }
    lines.push("");
  }

  if (ballot.propositions && ballot.propositions.length) {
    for (var k = 0; k < ballot.propositions.length; k++) {
      var prop = ballot.propositions[k];
      lines.push("PROPOSITION " + prop.number + ": " + prop.title);
      lines.push("  " + prop.description);
      if (prop.background) lines.push("  Background: " + prop.background);
      if (prop.fiscalImpact)
        lines.push("  Fiscal impact: " + prop.fiscalImpact);
      if (prop.supporters && prop.supporters.length) {
        lines.push("  Supporters: " + prop.supporters.join("; "));
      }
      if (prop.opponents && prop.opponents.length) {
        lines.push("  Opponents: " + prop.opponents.join("; "));
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// MARK: - User Prompt

var READING_LEVEL_INSTRUCTIONS = {
  1: "TONE: Write at a high school reading level. Use simple, everyday language. Avoid jargon and political terminology. Explain concepts as if to someone voting for the first time.\n\n",
  2: "TONE: Write casually, like explaining politics to a friend. Keep it conversational and approachable. Minimize jargon.\n\n",
  3: "",
  4: "TONE: Write with more depth and nuance. Use precise political terminology where helpful. Assume the reader follows politics.\n\n",
  5: "TONE: Write at an expert level, like a political science professor. Use precise terminology, reference policy frameworks and precedents, and assume deep familiarity with political concepts.\n\n",
  6: "TONE: Write EVERYTHING as the Swedish Chef from the Muppets. Use his signature speech patterns — replace words with Muppet-Swedish gibberish (bork bork bork!), add 'zee' and 'de' everywhere, throw in onomatopoeia, and end sentences with 'Bork!' or 'Hurdy gurdy!'. The JSON field values (reasoning, strategicNotes, etc.) should all be in Swedish Chef voice. Keep the actual candidate names and office titles accurate, but everything else should sound like the Swedish Chef is explaining politics. Have fun with it!\n\n",
  7: "TONE: Write EVERYTHING as a folksy Texas cowboy. Use Texas ranch metaphors, say 'y'all', 'reckon', 'fixin' to', 'partner', 'well I'll be', and 'dadgum'. Compare political situations to cattle ranching, rodeos, and wide open spaces. Keep the actual candidate names and office titles accurate, but everything else should sound like a weathered ranch hand explaining politics over a campfire. Throw in the occasional 'yeehaw' for good measure.\n\n",
  8: "TONE: Write EVERYTHING as if President Donald J. Trump is personally giving this voter their ballot advice at a rally. This should be HILARIOUS — the most over-the-top, unmistakable Trump impression possible while still delivering genuinely useful ballot information.\n\nTRUMP SPEECH PATTERNS (use ALL of these liberally throughout):\n- Superlatives on EVERYTHING: 'the best', 'tremendous', 'incredible', 'beautiful', 'fantastic', 'the greatest', 'like nobody has ever seen before', 'the likes of which the world has never known'\n- Repetition for emphasis: say things twice or three times ('believe me, believe me', 'very very strongly', 'big big beautiful')\n- Signature phrases sprinkled EVERYWHERE: 'many people are saying', 'everybody knows it', 'you know it, I know it, everybody knows it', 'a lot of people don\\'t know this', 'not a lot of people know that', 'frankly', 'to be honest with you', 'and by the way'\n- Self-references and brags: 'nobody knows more about [topic] than me', 'I\\'ve been saying this for years', 'I said it first, nobody else was saying it', 'a lot of very smart people have told me'\n- Rally-style audience engagement: 'can you believe it?', 'am I right?', 'is that incredible or what?', 'you love to see it, don\\'t you?', 'and the crowd goes wild'\n- Random CAPS for emphasis: occasionally CAPITALIZE a key word mid-sentence like 'TREMENDOUS', 'HUGE', 'SAD!', 'WRONG!', 'BEAUTIFUL', 'WINNING', 'INCREDIBLE'\n- Tangential asides that loop back: briefly go off-topic ('and by the way, Texas — what a state, maybe the best state, and I won Texas in a LANDSLIDE, everyone remembers that') then return to the ballot point\n- Deals and winning framing: every race is about 'winning', 'making a deal', 'strength', or 'getting tough'\n- Populist language: 'the forgotten men and women', 'the people of Texas', 'the American people are smart, very smart'\n- Dismissive asides about opponents or bad options: 'not good, not good at all', 'a total disaster', 'we\\'ll see what happens', 'give me a break'\n\nCRITICAL RULES:\n- Keep ALL candidate names, office titles, and factual ballot information 100% ACCURATE — the humor is in the DELIVERY, never in changing facts\n- The strategic analysis should still be genuinely useful and match the voter\\'s stated issues/preferences — just delivered in Trump\\'s voice\n- Write the strategicNotes and reasoning fields as if Trump is personally riffing on each race like he\\'s at a podium\n- Open the summary as if addressing a rally crowd in Texas\n- This should make the reader laugh out loud while still learning about their ballot\n\n",
};

function buildUserPrompt(profile, ballotDesc, ballot, party, lang, readingLevel, cachedTranslations) {
  var raceLines = ballot.races.map(function (r) {
    var names = r.candidates.filter(function(c){ return !c.withdrawn; }).map(function (c) {
      return c.name;
    });
    return r.office + ": " + names.join(", ");
  });

  var partyLabel = party.charAt(0).toUpperCase() + party.slice(1);
  var topIssues = (profile.topIssues || []).slice(0, 7);
  var otherIssues = (profile.topIssues || []).slice(7);
  var issues = topIssues.map(function(item, i) { return (i + 1) + ". " + item; }).join(", ");
  if (otherIssues.length) issues += " (also: " + otherIssues.join(", ") + ")";
  var topQuals = (profile.candidateQualities || []).slice(0, 5);
  var qualities = topQuals.map(function(item, i) { return (i + 1) + ". " + item; }).join(", ");
  var stances = Object.keys(profile.policyViews || {})
    .map(function (k) {
      return k + ": " + profile.policyViews[k];
    })
    .join("; ");

  var toneInstruction = READING_LEVEL_INSTRUCTIONS[readingLevel] || "";

  // When Spanish with cached translations, skip the candidateTranslations schema
  var needsLiveTranslations = lang === "es" && !cachedTranslations;

  return (
    "Recommend ONE candidate per race and a stance on each proposition. Be concise.\n\n" +
    toneInstruction +
    "NONPARTISAN: All reasoning must be factual and issue-based. Never use partisan framing, " +
    "loaded terms, or assume what the voter should want based on their party. Treat every candidate " +
    "and proposition with equal analytical rigor. Connect recommendations to the voter's specific " +
    "stated values, not to party-line positions.\n\n" +
    "IMPORTANT: For profileSummary, write 2 sentences in first person \u2014 conversational, specific, no generic labels. " +
    'NEVER say "I\'m a Democrat/Republican" \u2014 focus on values and priorities.' +
    (lang === "es" ? " Write ALL text fields in Spanish (profileSummary, reasoning, strategicNotes, caveats). Use neutral Latin American Spanish (español neutro) — avoid regional slang, prefer universally understood vocabulary, use \"usted\" forms. Keep office names, candidate names, district names, and confidence levels in English." : "") +
    "\n\n" +
    "VOTER: " +
    partyLabel +
    " primary | Spectrum: " +
    (profile.politicalSpectrum || "Moderate") +
    "\n" +
    "Issues: " +
    issues +
    "\n" +
    "Values: " +
    qualities +
    "\n" +
    "Stances: " +
    stances +
    "\n" +
    (profile.freeform ? "Additional context: " + profile.freeform + "\n" : "") +
    "\n" +
    "BALLOT:\n" +
    ballotDesc +
    "\n\n" +
    "VALID CANDIDATES (MUST only use these names):\n" +
    raceLines.join("\n") +
    "\n\n" +
    "Return ONLY this JSON:\n" +
    "{\n" +
    '  "profileSummary": "2 sentences, first person, conversational",\n' +
    '  "races": [\n' +
    "    {\n" +
    '      "office": "exact office name",\n' +
    '      "district": "district or null",\n' +
    '      "recommendedCandidate": "exact name from list",\n' +
    '      "reasoning": "1 sentence why this candidate fits the voter",\n' +
    '      "matchFactors": ["2-3 short phrases citing specific voter priorities that drove this match, e.g. Aligns with your priority: public education funding"],\n' +
    '      "strategicNotes": null,\n' +
    '      "caveats": null,\n' +
    '      "confidence": "Strong Match|Good Match|Best Available|Symbolic Race"\n' +
    "    }\n" +
    "  ],\n" +
    '  "propositions": [\n' +
    "    {\n" +
    '      "number": 1,\n' +
    '      "recommendation": "Lean Yes|Lean No|Your Call",\n' +
    '      "reasoning": "1 sentence connecting to voter",\n' +
    '      "caveats": null,\n' +
    '      "confidence": "Clear Call|Lean|Genuinely Contested"\n' +
    "    }\n" +
    "  ]" +
    (needsLiveTranslations
      ? ',\n  "candidateTranslations": [\n' +
        "    {\n" +
        '      "name": "exact candidate name (do not translate)",\n' +
        '      "summary": "neutral Latin American Spanish translation of candidate summary",\n' +
        '      "keyPositions": ["neutral Latin American Spanish translation of each position"],\n' +
        '      "pros": ["neutral Latin American Spanish translation of each pro"],\n' +
        '      "cons": ["neutral Latin American Spanish translation of each con"]\n' +
        "    }\n" +
        "  ]\n"
      : "\n") +
    "}"
  );
}

// MARK: - Cached Translation Loader

/**
 * Load pre-generated Spanish translations from KV.
 * Checks statewide translations and optionally county-specific translations,
 * merging them into a single array.
 *
 * KV key structure: translations:es:{party}_primary_2026
 *                   translations:es:county:{fips}:{party}_primary_2026
 *
 * @returns {Array|null} Array of translation objects or null if none cached
 */
async function loadCachedTranslations(env, party, countyFips) {
  var translations = [];

  // Load statewide translations
  var statewideKey = "translations:es:" + party + "_primary_2026";
  var statewideRaw = await env.ELECTION_DATA.get(statewideKey);
  if (statewideRaw) {
    try {
      var statewideTx = JSON.parse(statewideRaw);
      if (Array.isArray(statewideTx)) {
        translations = translations.concat(statewideTx);
      }
    } catch (e) { /* skip malformed data */ }
  }

  // Load county-specific translations if countyFips provided
  if (countyFips) {
    var countyKey = "translations:es:county:" + countyFips + ":" + party + "_primary_2026";
    var countyRaw = await env.ELECTION_DATA.get(countyKey);
    if (countyRaw) {
      try {
        var countyTx = JSON.parse(countyRaw);
        if (Array.isArray(countyTx)) {
          // Deduplicate: county translations override statewide for same candidate
          var existingNames = new Set(countyTx.map(function(t) { return t.name; }));
          translations = translations.filter(function(t) { return !existingNames.has(t.name); });
          translations = translations.concat(countyTx);
        }
      } catch (e) { /* skip malformed data */ }
    }
  }

  return translations.length > 0 ? translations : null;
}

// MARK: - Translation Seeding

/**
 * Generate and cache Spanish translations for all candidates in a ballot.
 * Calls Claude to translate candidate summaries, positions, pros, and cons.
 * Stores results in KV under translations:es:{party}_primary_2026.
 *
 * @param {object} env - Worker environment with ELECTION_DATA and ANTHROPIC_API_KEY
 * @param {string} party - "republican" or "democrat"
 * @param {string|null} countyFips - Optional county FIPS code for county-specific translations
 * @returns {object} Result with success status and translation count
 */
export async function handleSeedTranslations(env, party, countyFips) {
  // Load ballot data
  var ballotKey, translationKey;
  if (countyFips) {
    ballotKey = "ballot:county:" + countyFips + ":" + party + "_primary_2026";
    translationKey = "translations:es:county:" + countyFips + ":" + party + "_primary_2026";
  } else {
    ballotKey = "ballot:statewide:" + party + "_primary_2026";
    translationKey = "translations:es:" + party + "_primary_2026";
    // Fallback to legacy key
    var raw = await env.ELECTION_DATA.get(ballotKey);
    if (!raw) {
      ballotKey = "ballot:" + party + "_primary_2026";
      raw = await env.ELECTION_DATA.get(ballotKey);
    }
    if (!raw) {
      return { error: "No ballot data found for " + party };
    }
  }

  var ballotRaw = await env.ELECTION_DATA.get(ballotKey);
  if (!ballotRaw) {
    return { error: "No ballot data found at " + ballotKey };
  }

  var ballot = JSON.parse(ballotRaw);
  if (!ballot.races || !ballot.races.length) {
    return { error: "No races in ballot" };
  }

  // Collect all candidates with translatable text
  var candidates = [];
  for (var i = 0; i < ballot.races.length; i++) {
    var race = ballot.races[i];
    for (var j = 0; j < race.candidates.length; j++) {
      var c = race.candidates[j];
      if (c.withdrawn) continue;
      // Extract base text (handle tone-keyed objects)
      var summary = typeof c.summary === "string" ? c.summary : (c.summary && c.summary["3"] || "");
      var keyPositions = (c.keyPositions || []).map(function(p) {
        return typeof p === "string" ? p : (p && p["3"] || "");
      });
      var pros = (c.pros || []).map(function(p) {
        return typeof p === "string" ? p : (p && p["3"] || "");
      });
      var cons = (c.cons || []).map(function(p) {
        return typeof p === "string" ? p : (p && p["3"] || "");
      });
      if (summary || keyPositions.length || pros.length || cons.length) {
        candidates.push({
          name: c.name,
          office: race.office,
          summary: summary,
          keyPositions: keyPositions,
          pros: pros,
          cons: cons,
        });
      }
    }
  }

  if (candidates.length === 0) {
    return { error: "No candidates with translatable text" };
  }

  var system = "You are a professional translator specializing in Texas political content. " +
    "Translate from English to neutral Latin American Spanish (español neutro) with non-partisan language accessible to all Spanish speakers. " +
    "Avoid region-specific slang or colloquialisms. Use \"usted\" forms where appropriate. Prefer universally understood vocabulary over country-specific terms. " +
    "Keep candidate names, office titles, and district names in English. " +
    "Return ONLY valid JSON.";

  // Call Claude for translation in batches to avoid Worker timeout
  var BATCH_SIZE = 6;
  var translations = [];
  for (var batchStart = 0; batchStart < candidates.length; batchStart += BATCH_SIZE) {
    var batch = candidates.slice(batchStart, batchStart + BATCH_SIZE);
    var batchList = batch.map(function(c) {
      var lines = [];
      lines.push("Candidate: " + c.name + " (" + c.office + ")");
      if (c.summary) lines.push("  summary: " + JSON.stringify(c.summary));
      if (c.keyPositions.length) lines.push("  keyPositions: " + JSON.stringify(c.keyPositions));
      if (c.pros.length) lines.push("  pros: " + JSON.stringify(c.pros));
      if (c.cons.length) lines.push("  cons: " + JSON.stringify(c.cons));
      return lines.join("\n");
    }).join("\n\n");

    var batchPrompt = "Translate ALL of the following Texas election candidate text fields into neutral Latin American Spanish (español neutro). " +
      "Keep candidate names in English. Use neutral, non-partisan language accessible to all Spanish speakers. " +
      "Avoid region-specific slang or colloquialisms. Prefer universally understood vocabulary over country-specific terms. " +
      "Maintain the same meaning and roughly the same length as the originals.\n\n" +
      batchList + "\n\n" +
      "Return a JSON array of objects, one per candidate:\n" +
      "[\n" +
      "  {\n" +
      '    "name": "exact candidate name (do not translate)",\n' +
      '    "summary": "Spanish translation",\n' +
      '    "keyPositions": ["Spanish translations"],\n' +
      '    "pros": ["Spanish translations"],\n' +
      '    "cons": ["Spanish translations"]\n' +
      "  }\n" +
      "]\n\n" +
      "Return ONLY valid JSON — no markdown, no explanation.";

    var res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: system,
        messages: [{ role: "user", content: batchPrompt }],
      }),
    });

    if (!res.ok) {
      var errBody = await res.text();
      return { error: "Claude API error " + res.status + " on batch " + (Math.floor(batchStart / BATCH_SIZE) + 1) + ": " + errBody.slice(0, 200) };
    }

    var data = await res.json();
    var responseText = data.content && data.content[0] && data.content[0].text;
    if (!responseText) {
      return { error: "No text in Claude response for batch " + (Math.floor(batchStart / BATCH_SIZE) + 1) };
    }

    var batchTranslations;
    try {
      var cleaned = responseText.trim();
      if (cleaned.indexOf("```json") === 0) cleaned = cleaned.slice(7);
      else if (cleaned.indexOf("```") === 0) cleaned = cleaned.slice(3);
      if (cleaned.slice(-3) === "```") cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();
      batchTranslations = JSON.parse(cleaned);
    } catch (e) {
      return { error: "Failed to parse translation batch " + (Math.floor(batchStart / BATCH_SIZE) + 1), raw: responseText.slice(0, 300) };
    }

    if (!Array.isArray(batchTranslations)) {
      return { error: "Expected array of translations in batch " + (Math.floor(batchStart / BATCH_SIZE) + 1) };
    }

    translations = translations.concat(batchTranslations);
  }

  // Store in KV
  await env.ELECTION_DATA.put(translationKey, JSON.stringify(translations));

  return {
    success: true,
    party: party,
    countyFips: countyFips || null,
    kvKey: translationKey,
    candidatesTranslated: translations.length,
    totalCandidates: candidates.length,
  };
}

// MARK: - Claude API Call

async function callClaude(env, system, userMessage, lang, component, _isRetry, specificModel) {
  var maxTokens = _isRetry || (lang === "es" ? 8192 : (lang === "es_cached" ? 4096 : 2048));
  var modelList = specificModel ? [specificModel] : MODELS;
  for (var i = 0; i < modelList.length; i++) {
    var model = modelList[i];
    if (i > 0) {
      console.log("[MODEL FALLBACK] Falling back from " + modelList[i - 1] + " to " + model);
    }
    for (var attempt = 0; attempt <= 1; attempt++) {
      var res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model,
          max_tokens: maxTokens,
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (res.status === 200) {
        var data = await res.json();
        var text = data.content && data.content[0] && data.content[0].text;
        if (!text) throw new Error("No text in API response");

        // Log token usage
        if (data.usage && component) {
          console.log("Token usage [" + component + "] model=" + model + " input=" + data.usage.input_tokens + " output=" + data.usage.output_tokens);
          logTokenUsage(env, component, data.usage, model).catch(function() {});
        }

        // Token utilization warning
        if (data.usage && data.usage.output_tokens) {
          var pct = Math.round((data.usage.output_tokens / maxTokens) * 100);
          if (pct >= 75) {
            console.warn("[TOKEN WARNING] Output used " + pct + "% of max_tokens (" + data.usage.output_tokens + "/" + maxTokens + ")");
          }
        }

        // Auto-retry on truncation: if stop_reason is "max_tokens" and we haven't retried yet
        var stopReason = data.stop_reason;
        if (stopReason === "max_tokens" && !_isRetry && maxTokens < 8192) {
          var newMax = Math.min(maxTokens * 2, 8192);
          console.log("[TOKEN RETRY] Retrying with " + newMax + " max_tokens (was " + maxTokens + ")");
          return callClaude(env, system, userMessage, lang, component, newMax, specificModel);
        }

        return text;
      }

      if (res.status === 429) {
        var retryAfter = parseInt(res.headers.get("retry-after") || "0", 10);
        var wait = Math.max(retryAfter, attempt === 0 ? 5 : 15) * 1000;
        if (attempt === 0) {
          await new Promise(function (r) { setTimeout(r, wait); });
          continue;
        }
        // Second 429 — try next model
        if (i < modelList.length - 1) break;
        throw new Error("Rate limited — please try again in a minute");
      }

      if (res.status === 529) {
        if (attempt === 0) {
          await new Promise(function (r) {
            setTimeout(r, 2000);
          });
          continue;
        }
        // Second 529 — try next model
        if (i < modelList.length - 1) break;
        throw new Error("All models overloaded");
      }

      // Other error — try next model
      var body = await res.text();
      if (i < modelList.length - 1) break;
      throw new Error("API error " + res.status + ": " + body.slice(0, 200));
    }
  }
  throw new Error("All models failed");
}

// MARK: - OpenAI-compatible API Call (ChatGPT, Grok)

async function callOpenAICompatible(env, system, userMessage, lang, endpoint, apiKey, model, component, _isRetry) {
  var maxTokens = _isRetry || (lang === "es" ? 8192 : (lang === "es_cached" ? 4096 : 2048));
  for (var attempt = 0; attempt <= 1; attempt++) {
    var res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (res.status === 200) {
      var data = await res.json();
      var text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!text) throw new Error("No text in " + model + " API response");

      // Log token usage (OpenAI format: usage.prompt_tokens / completion_tokens)
      if (data.usage && component) {
        var openaiUsage = { input_tokens: data.usage.prompt_tokens || 0, output_tokens: data.usage.completion_tokens || 0 };
        console.log("Token usage [" + component + "] model=" + model + " input=" + openaiUsage.input_tokens + " output=" + openaiUsage.output_tokens);
        logTokenUsage(env, component, openaiUsage, model).catch(function() {});
      }

      // Token utilization warning
      var outputTokens = data.usage && data.usage.completion_tokens;
      if (outputTokens) {
        var pct = Math.round((outputTokens / maxTokens) * 100);
        if (pct >= 75) {
          console.warn("[TOKEN WARNING] Output used " + pct + "% of max_tokens (" + outputTokens + "/" + maxTokens + ")");
        }
      }

      // Auto-retry on truncation
      var finishReason = data.choices && data.choices[0] && data.choices[0].finish_reason;
      if (finishReason === "length" && !_isRetry && maxTokens < 8192) {
        var newMax = Math.min(maxTokens * 2, 8192);
        console.log("[TOKEN RETRY] Retrying with " + newMax + " max_tokens (was " + maxTokens + ")");
        return callOpenAICompatible(env, system, userMessage, lang, endpoint, apiKey, model, component, newMax);
      }

      return text;
    }

    if (res.status === 429) {
      if (attempt === 0) {
        var retryAfter = parseInt(res.headers.get("retry-after") || "0", 10);
        var wait = Math.max(retryAfter, 5) * 1000;
        await new Promise(function (r) { setTimeout(r, wait); });
        continue;
      }
      throw new Error(model + " rate limited — please try again in a minute");
    }

    if (res.status >= 500) {
      if (attempt === 0) {
        await new Promise(function (r) { setTimeout(r, 2000); });
        continue;
      }
      throw new Error(model + " server error");
    }

    var body = await res.text();
    throw new Error(model + " API error " + res.status + ": " + body.slice(0, 200));
  }
  throw new Error(model + " call failed");
}

// MARK: - Gemini API Call

async function callGemini(env, system, userMessage, lang, component, _isRetry, geminiModel) {
  var maxTokens = _isRetry || (lang === "es" ? 8192 : (lang === "es_cached" ? 4096 : 4096));
  var modelName = geminiModel || "gemini-2.5-flash";
  var endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent?key=" + env.GEMINI_API_KEY;

  for (var attempt = 0; attempt <= 1; attempt++) {
    var res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });

    if (res.status === 200) {
      var data = await res.json();
      var text = data.candidates && data.candidates[0] && data.candidates[0].content &&
        data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text;
      if (!text) throw new Error("No text in Gemini API response");

      // Log token usage (Gemini format: usageMetadata.promptTokenCount / candidatesTokenCount)
      if (data.usageMetadata && component) {
        var geminiUsage = { input_tokens: data.usageMetadata.promptTokenCount || 0, output_tokens: data.usageMetadata.candidatesTokenCount || 0 };
        console.log("Token usage [" + component + "] model=" + modelName + " input=" + geminiUsage.input_tokens + " output=" + geminiUsage.output_tokens);
        logTokenUsage(env, component, geminiUsage, modelName).catch(function() {});
      }

      // Token utilization warning
      var outputTokens = data.usageMetadata && data.usageMetadata.candidatesTokenCount;
      if (outputTokens) {
        var pct = Math.round((outputTokens / maxTokens) * 100);
        if (pct >= 75) {
          console.warn("[TOKEN WARNING] Output used " + pct + "% of max_tokens (" + outputTokens + "/" + maxTokens + ")");
        }
      }

      // Auto-retry on truncation (Gemini uses finishReason: "MAX_TOKENS")
      var finishReason = data.candidates && data.candidates[0] && data.candidates[0].finishReason;
      if (finishReason === "MAX_TOKENS" && !_isRetry && maxTokens < 8192) {
        var newMax = Math.min(maxTokens * 2, 8192);
        console.log("[TOKEN RETRY] Retrying with " + newMax + " max_tokens (was " + maxTokens + ")");
        return callGemini(env, system, userMessage, lang, component, newMax, geminiModel);
      }

      return text;
    }

    if (res.status === 429) {
      if (attempt === 0) {
        await new Promise(function (r) { setTimeout(r, 5000); });
        continue;
      }
      throw new Error("Gemini rate limited — please try again in a minute");
    }

    if (res.status >= 500) {
      if (attempt === 0) {
        await new Promise(function (r) { setTimeout(r, 2000); });
        continue;
      }
      throw new Error("Gemini server error");
    }

    var body = await res.text();
    throw new Error("Gemini API error " + res.status + ": " + body.slice(0, 200));
  }
  throw new Error("Gemini call failed");
}

// MARK: - LLM Router

var VALID_LLMS = ["claude", "claude-haiku", "claude-opus", "chatgpt", "gpt-4o-mini", "gemini", "gemini-pro", "grok"];

async function callLLM(env, system, userMessage, lang, llm) {
  if (!llm || llm === "claude") {
    return callClaude(env, system, userMessage, lang);
  }

  if (llm === "claude-haiku") {
    if (!env.ANTHROPIC_API_KEY) throw new Error("Anthropic API key not configured");
    return callClaude(env, system, userMessage, lang, null, null, "claude-haiku-4-5-20251001");
  }

  if (llm === "claude-opus") {
    if (!env.ANTHROPIC_API_KEY) throw new Error("Anthropic API key not configured");
    return callClaude(env, system, userMessage, lang, null, null, "claude-opus-4-6");
  }

  if (llm === "chatgpt") {
    if (!env.OPENAI_API_KEY) throw new Error("OpenAI API key not configured");
    return callOpenAICompatible(env, system, userMessage, lang,
      "https://api.openai.com/v1/chat/completions", env.OPENAI_API_KEY, "gpt-4o");
  }

  if (llm === "gpt-4o-mini") {
    if (!env.OPENAI_API_KEY) throw new Error("OpenAI API key not configured");
    return callOpenAICompatible(env, system, userMessage, lang,
      "https://api.openai.com/v1/chat/completions", env.OPENAI_API_KEY, "gpt-4o-mini");
  }

  if (llm === "grok") {
    if (!env.GROK_API_KEY) throw new Error("Grok API key not configured");
    return callOpenAICompatible(env, system, userMessage, lang,
      "https://api.x.ai/v1/chat/completions", env.GROK_API_KEY, "grok-3");
  }

  if (llm === "gemini") {
    if (!env.GEMINI_API_KEY) throw new Error("Gemini API key not configured");
    return callGemini(env, system, userMessage, lang);
  }

  if (llm === "gemini-pro") {
    if (!env.GEMINI_API_KEY) throw new Error("Gemini API key not configured");
    return callGemini(env, system, userMessage, lang, null, null, "gemini-2.5-pro");
  }

  throw new Error("Unknown LLM: " + llm + ". Valid options: " + VALID_LLMS.join(", "));
}

// MARK: - Truncated Guide Repair

/**
 * Attempt to repair truncated JSON from a guide response.
 * Finds the last complete race object and reconstructs valid JSON.
 * Marks the result with _truncated: true so callers know it was repaired.
 *
 * @param {string} text - The raw (possibly truncated) JSON text
 * @returns {object|null} Repaired guide response object, or null if repair fails
 */
function repairTruncatedGuide(text) {
  var cleaned = text.trim();
  if (cleaned.indexOf("```json") === 0) cleaned = cleaned.slice(7);
  else if (cleaned.indexOf("```") === 0) cleaned = cleaned.slice(3);
  cleaned = cleaned.replace(/`*$/, "").trim();

  // Try parsing as-is first
  try {
    return JSON.parse(cleaned);
  } catch (e) { /* needs repair */ }

  // Find the start of the JSON object
  var jsonStart = cleaned.indexOf("{");
  if (jsonStart === -1) return null;
  var fragment = cleaned.slice(jsonStart);

  // Strategy: find the last complete race object in the "races" array
  // Look for complete objects by finding patterns like }, { or }, ]
  var result = {};

  // Extract profileSummary if present
  var summaryMatch = fragment.match(/"profileSummary"\s*:\s*"([^"]*)"/);
  if (summaryMatch) {
    result.profileSummary = summaryMatch[1];
  }

  // Extract complete race objects from the races array
  var racesStart = fragment.indexOf('"races"');
  if (racesStart === -1) return null;

  var arrayStart = fragment.indexOf("[", racesStart);
  if (arrayStart === -1) return null;

  // Find all complete race objects by looking for balanced braces
  var races = [];
  var pos = arrayStart + 1;
  while (pos < fragment.length) {
    // Skip whitespace and commas
    while (pos < fragment.length && /[\s,]/.test(fragment[pos])) pos++;
    if (pos >= fragment.length || fragment[pos] !== "{") break;

    // Try to find a complete object starting at pos
    var depth = 0;
    var objStart = pos;
    var inString = false;
    var escaped = false;
    var objEnd = -1;

    for (var i = pos; i < fragment.length; i++) {
      var ch = fragment[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          objEnd = i;
          break;
        }
      }
    }

    if (objEnd === -1) break; // Incomplete object — stop here

    var objText = fragment.slice(objStart, objEnd + 1);
    try {
      var raceObj = JSON.parse(objText);
      if (raceObj.office) {
        races.push(raceObj);
      }
    } catch (e) {
      break; // Malformed object — stop
    }
    pos = objEnd + 1;
  }

  if (races.length === 0) return null;

  result.races = races;
  result.propositions = [];
  result._truncated = true;

  // Try to extract propositions if they exist after races
  var propsStart = fragment.indexOf('"propositions"');
  if (propsStart !== -1) {
    var propsArrayStart = fragment.indexOf("[", propsStart);
    if (propsArrayStart !== -1) {
      var props = [];
      var pPos = propsArrayStart + 1;
      while (pPos < fragment.length) {
        while (pPos < fragment.length && /[\s,]/.test(fragment[pPos])) pPos++;
        if (pPos >= fragment.length || fragment[pPos] !== "{") break;

        var pDepth = 0;
        var pObjStart = pPos;
        var pInString = false;
        var pEscaped = false;
        var pObjEnd = -1;

        for (var j = pPos; j < fragment.length; j++) {
          var pCh = fragment[j];
          if (pEscaped) { pEscaped = false; continue; }
          if (pCh === "\\") { pEscaped = true; continue; }
          if (pCh === '"') { pInString = !pInString; continue; }
          if (pInString) continue;
          if (pCh === "{") pDepth++;
          else if (pCh === "}") {
            pDepth--;
            if (pDepth === 0) { pObjEnd = j; break; }
          }
        }

        if (pObjEnd === -1) break;
        var propText = fragment.slice(pObjStart, pObjEnd + 1);
        try {
          var propObj = JSON.parse(propText);
          if (propObj.number !== undefined) props.push(propObj);
        } catch (e) { break; }
        pPos = pObjEnd + 1;
      }
      if (props.length > 0) result.propositions = props;
    }
  }

  return result;
}

// MARK: - Parse Response

function parseResponse(text) {
  var cleaned = text.trim();
  if (cleaned.indexOf("```json") === 0) cleaned = cleaned.slice(7);
  else if (cleaned.indexOf("```") === 0) cleaned = cleaned.slice(3);
  if (cleaned.slice(-3) === "```") cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Try light sanitization: trailing commas only (safe transform)
    var sanitized = cleaned.replace(/,\s*([}\]])/g, "$1");
    try { return JSON.parse(sanitized); } catch (_) {}
    // Attempt repair for truncated JSON
    var truncationPatterns = [
      /Unterminated string/i,
      /Unexpected end of JSON/i,
      /Expected/i,
      /Unexpected token/i,
    ];
    var isTruncation = truncationPatterns.some(function(p) { return p.test(err.message); });
    if (isTruncation) {
      var repaired = repairTruncatedGuide(cleaned);
      if (repaired) {
        console.warn("[REPAIR] Recovered truncated guide response with " +
          (repaired.races ? repaired.races.length : 0) + " races");
        return repaired;
      }
    }
    throw err;
  }
}

// MARK: - Merge Recommendations

function mergeRecommendations(guideResponse, ballot, lang, cachedTranslations) {
  // Deep clone
  var merged = JSON.parse(JSON.stringify(ballot));

  // Merge candidate translations for Spanish — prefer cached, fall back to LLM-generated
  if (lang === "es") {
    var translationSource = cachedTranslations || guideResponse.candidateTranslations;
    if (translationSource) {
      var txMap = {};
      for (var t = 0; t < translationSource.length; t++) {
        var tx = translationSource[t];
        txMap[tx.name] = tx;
      }
      for (var ri2 = 0; ri2 < merged.races.length; ri2++) {
        for (var ci2 = 0; ci2 < merged.races[ri2].candidates.length; ci2++) {
          var cand = merged.races[ri2].candidates[ci2];
          var tr = txMap[cand.name];
          if (!tr) continue;
          if (tr.summary) cand.summary = tr.summary;
          if (tr.keyPositions && tr.keyPositions.length) cand.keyPositions = tr.keyPositions;
          if (tr.pros && tr.pros.length) cand.pros = tr.pros;
          if (tr.cons && tr.cons.length) cand.cons = tr.cons;
        }
      }
    }
  }

  // Merge race recommendations
  for (var ri = 0; ri < merged.races.length; ri++) {
    var race = merged.races[ri];
    var rec = null;
    var guideRaces = guideResponse.races || [];
    for (var g = 0; g < guideRaces.length; g++) {
      if (
        guideRaces[g].office === race.office &&
        guideRaces[g].district === race.district
      ) {
        rec = guideRaces[g];
        break;
      }
    }
    if (!rec) continue;

    // Clear existing recommendations
    for (var ci = 0; ci < race.candidates.length; ci++) {
      merged.races[ri].candidates[ci].isRecommended = false;
    }
    merged.races[ri].recommendation = null;

    // Find and set recommended candidate (skip withdrawn)
    var candIdx = -1;
    for (var k = 0; k < race.candidates.length; k++) {
      if (race.candidates[k].name === rec.recommendedCandidate && !race.candidates[k].withdrawn) {
        candIdx = k;
        break;
      }
    }
    if (candIdx !== -1) {
      merged.races[ri].candidates[candIdx].isRecommended = true;
      merged.races[ri].recommendation = {
        candidateId: race.candidates[candIdx].id,
        candidateName: rec.recommendedCandidate,
        reasoning: rec.reasoning,
        matchFactors: rec.matchFactors || [],
        strategicNotes: rec.strategicNotes || null,
        caveats: rec.caveats || null,
        confidence: rec.confidence || "Good Match",
      };
    }
  }

  // Merge proposition recommendations
  var props = merged.propositions || [];
  for (var pi = 0; pi < props.length; pi++) {
    var prop = props[pi];
    var prec = null;
    var guideProps = guideResponse.propositions || [];
    for (var p = 0; p < guideProps.length; p++) {
      if (guideProps[p].number === prop.number) {
        prec = guideProps[p];
        break;
      }
    }
    if (!prec) continue;
    merged.propositions[pi].recommendation =
      prec.recommendation || "Your Call";
    merged.propositions[pi].reasoning = prec.reasoning;
    merged.propositions[pi].caveats = prec.caveats || null;
    if (prec.confidence) merged.propositions[pi].confidence = prec.confidence;
  }

  return merged;
}

// MARK: - Post-Generation Partisan Balance Scoring

var CONFIDENCE_SCORES = {
  "Strong Match": 4,
  "Good Match": 3,
  "Best Available": 2,
  "Symbolic Race": 1,
};

/**
 * Score partisan balance of a generated guide.
 * Analyzes recommendations for skew in confidence, reasoning enthusiasm,
 * and match distribution. Runs on every guide generation to detect if
 * the LLM shows uneven treatment across candidates.
 *
 * @param {object} guideResponse - Parsed LLM response with races[] and propositions[]
 * @param {object} ballot - The ballot data with party and candidate info
 * @returns {object} balanceScore with metrics, flags, and optional skew note
 */
function scorePartisanBalance(guideResponse, ballot) {
  var races = guideResponse.races || [];
  var party = ballot.party || "unknown";

  // --- Confidence distribution ---
  var confidenceCounts = { "Strong Match": 0, "Good Match": 0, "Best Available": 0, "Symbolic Race": 0 };
  var totalConfidenceScore = 0;
  var raceCount = 0;

  for (var i = 0; i < races.length; i++) {
    var rec = races[i];
    var conf = rec.confidence || "Good Match";
    if (confidenceCounts[conf] !== undefined) {
      confidenceCounts[conf]++;
    }
    totalConfidenceScore += (CONFIDENCE_SCORES[conf] || 2);
    raceCount++;
  }

  var avgConfidence = raceCount > 0 ? Math.round((totalConfidenceScore / raceCount) * 100) / 100 : 0;

  // --- Reasoning enthusiasm analysis ---
  var reasoningLengths = [];
  var totalReasoningLength = 0;
  for (var j = 0; j < races.length; j++) {
    var reasonLen = (races[j].reasoning || "").length;
    reasoningLengths.push({ office: races[j].office, length: reasonLen });
    totalReasoningLength += reasonLen;
  }
  var avgReasoningLength = raceCount > 0 ? Math.round(totalReasoningLength / raceCount) : 0;

  // --- Match factor analysis ---
  var totalMatchFactors = 0;
  for (var k = 0; k < races.length; k++) {
    totalMatchFactors += (races[k].matchFactors || []).length;
  }
  var avgMatchFactors = raceCount > 0 ? Math.round((totalMatchFactors / raceCount) * 100) / 100 : 0;

  // --- Incumbent vs challenger analysis ---
  var incumbentRecs = 0;
  var challengerRecs = 0;
  var ballotRaces = ballot.races || [];
  for (var m = 0; m < races.length; m++) {
    var recName = races[m].recommendedCandidate;
    for (var n = 0; n < ballotRaces.length; n++) {
      var ballotRace = ballotRaces[n];
      if (ballotRace.office === races[m].office &&
          (ballotRace.district || null) === (races[m].district || null)) {
        var activeCandidates = (ballotRace.candidates || []).filter(function(c) { return !c.withdrawn; });
        if (activeCandidates.length <= 1) break; // skip uncontested
        for (var p = 0; p < activeCandidates.length; p++) {
          if (activeCandidates[p].name === recName) {
            if (activeCandidates[p].isIncumbent) {
              incumbentRecs++;
            } else {
              challengerRecs++;
            }
            break;
          }
        }
        break;
      }
    }
  }

  // --- Strong/Good match ratio (enthusiasm metric) ---
  var highConfidenceCount = confidenceCounts["Strong Match"] + confidenceCounts["Good Match"];
  var enthusiasmRatio = raceCount > 0 ? Math.round((highConfidenceCount / raceCount) * 100) : 0;

  // --- Pro/con text length comparison for recommended vs non-recommended ---
  var recProTotal = 0;
  var recConTotal = 0;
  var nonRecProTotal = 0;
  var nonRecConTotal = 0;
  var recCandCount = 0;
  var nonRecCandCount = 0;

  for (var q = 0; q < races.length; q++) {
    var guideRace = races[q];
    for (var r = 0; r < ballotRaces.length; r++) {
      var bRace = ballotRaces[r];
      if (bRace.office === guideRace.office &&
          (bRace.district || null) === (guideRace.district || null)) {
        var active = (bRace.candidates || []).filter(function(c) { return !c.withdrawn; });
        if (active.length <= 1) break; // skip uncontested
        for (var s = 0; s < active.length; s++) {
          var cand = active[s];
          var prosText = (cand.pros || []).join(" ");
          var consText = (cand.cons || []).join(" ");
          if (cand.name === guideRace.recommendedCandidate) {
            recProTotal += prosText.length;
            recConTotal += consText.length;
            recCandCount++;
          } else {
            nonRecProTotal += prosText.length;
            nonRecConTotal += consText.length;
            nonRecCandCount++;
          }
        }
        break;
      }
    }
  }

  var recAvgPros = recCandCount > 0 ? Math.round(recProTotal / recCandCount) : 0;
  var recAvgCons = recCandCount > 0 ? Math.round(recConTotal / recCandCount) : 0;
  var nonRecAvgPros = nonRecCandCount > 0 ? Math.round(nonRecProTotal / nonRecCandCount) : 0;
  var nonRecAvgCons = nonRecCandCount > 0 ? Math.round(nonRecConTotal / nonRecCandCount) : 0;

  // --- Detect skew ---
  var flags = [];

  // Flag if all contested races recommend incumbents or all recommend challengers
  var contestedCount = incumbentRecs + challengerRecs;
  if (contestedCount >= 3) {
    var incumbentPct = Math.round((incumbentRecs / contestedCount) * 100);
    if (incumbentPct > 80) {
      flags.push("Strong incumbent bias: " + incumbentPct + "% of contested recommendations favor incumbents");
    } else if (incumbentPct < 20) {
      flags.push("Strong challenger bias: " + (100 - incumbentPct) + "% of contested recommendations favor challengers");
    }
  }

  // Flag if enthusiasm ratio is extreme (all high or all low confidence)
  if (raceCount >= 3 && enthusiasmRatio === 100) {
    flags.push("All recommendations rated Strong Match or Good Match — may indicate insufficient critical analysis");
  }

  // Flag if recommended candidates have significantly more pros than non-recommended
  if (recCandCount > 0 && nonRecCandCount > 0 && recAvgPros > 0 && nonRecAvgPros > 0) {
    var prosRatio = recAvgPros / nonRecAvgPros;
    if (prosRatio > 1.5) {
      flags.push("Recommended candidates have " + Math.round(prosRatio * 100 - 100) + "% more pro text than non-recommended — ballot data may favor certain candidates");
    }
  }

  // --- Build skew note for display ---
  var skewNote = null;
  if (flags.length > 0) {
    skewNote = "Note: This guide's recommendations show some patterns worth noting: " + flags.join(". ") + ".";
  }

  return {
    party: party,
    totalRaces: raceCount,
    confidenceDistribution: confidenceCounts,
    avgConfidence: avgConfidence,
    avgReasoningLength: avgReasoningLength,
    avgMatchFactors: avgMatchFactors,
    incumbentRecs: incumbentRecs,
    challengerRecs: challengerRecs,
    enthusiasmPct: enthusiasmRatio,
    recommendedCandidateAvgPros: recAvgPros,
    recommendedCandidateAvgCons: recAvgCons,
    nonRecommendedCandidateAvgPros: nonRecAvgPros,
    nonRecommendedCandidateAvgCons: nonRecAvgCons,
    flags: flags,
    skewNote: skewNote,
  };
}

// MARK: - Incremental JSON Parser for Streaming

/**
 * Creates an incremental parser that extracts complete JSON objects from a
 * streaming text buffer. Uses balanced-brace tracking (same algorithm as
 * repairTruncatedGuide) to detect complete race/proposition objects.
 *
 * @param {object} callbacks - { onProfileSummary(str), onRace(obj), onProposition(obj) }
 * @returns {object} - { feed(chunk), flush() }
 */
function createIncrementalParser(callbacks) {
  var buffer = "";
  var phase = "pre"; // pre | races | between | propositions | done
  var emittedRaces = 0;
  var emittedProps = 0;
  var profileEmitted = false;
  var searchPos = 0;

  function tryExtractProfileSummary() {
    if (profileEmitted) return;
    var match = buffer.match(/"profileSummary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (match) {
      profileEmitted = true;
      // Unescape JSON string
      try {
        var val = JSON.parse('"' + match[1] + '"');
        callbacks.onProfileSummary(val);
      } catch (e) {
        callbacks.onProfileSummary(match[1]);
      }
    }
  }

  function extractObjects(startPos) {
    var objects = [];
    var pos = startPos;
    while (pos < buffer.length) {
      // Skip whitespace and commas
      while (pos < buffer.length && /[\s,]/.test(buffer[pos])) pos++;
      if (pos >= buffer.length || buffer[pos] === "]") break;
      if (buffer[pos] !== "{") break;

      // Find complete object using balanced-brace tracking
      var depth = 0;
      var inString = false;
      var escaped = false;
      var objEnd = -1;

      for (var i = pos; i < buffer.length; i++) {
        var ch = buffer[i];
        if (escaped) { escaped = false; continue; }
        if (ch === "\\") { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) { objEnd = i; break; }
        }
      }

      if (objEnd === -1) break; // Incomplete — wait for more data

      var objText = buffer.slice(pos, objEnd + 1);
      try {
        var obj = JSON.parse(objText);
        objects.push({ obj: obj, endPos: objEnd + 1 });
      } catch (e) {
        break; // Malformed — stop
      }
      pos = objEnd + 1;
    }
    return objects;
  }

  function process() {
    tryExtractProfileSummary();

    if (phase === "pre" || phase === "races") {
      // Look for "races":[
      if (phase === "pre") {
        var racesIdx = buffer.indexOf('"races"', searchPos);
        if (racesIdx === -1) return;
        var arrStart = buffer.indexOf("[", racesIdx);
        if (arrStart === -1) return;
        phase = "races";
        searchPos = arrStart + 1;
      }

      // Extract complete race objects
      var raceResults = extractObjects(searchPos);
      for (var r = 0; r < raceResults.length; r++) {
        if (raceResults[r].obj.office) {
          emittedRaces++;
          callbacks.onRace(raceResults[r].obj);
        }
        searchPos = raceResults[r].endPos;
      }

      // Check if races array is closed
      var afterRaces = buffer.indexOf("]", searchPos);
      if (afterRaces !== -1 && raceResults.length === 0) {
        // The ] might be end of races array — check if no more { before it
        var nextBrace = buffer.indexOf("{", searchPos);
        if (nextBrace === -1 || nextBrace > afterRaces) {
          phase = "between";
          searchPos = afterRaces + 1;
        }
      }
    }

    if (phase === "between" || phase === "propositions") {
      if (phase === "between") {
        var propsIdx = buffer.indexOf('"propositions"', searchPos);
        if (propsIdx === -1) return;
        var propArrStart = buffer.indexOf("[", propsIdx);
        if (propArrStart === -1) return;
        phase = "propositions";
        searchPos = propArrStart + 1;
      }

      var propResults = extractObjects(searchPos);
      for (var p = 0; p < propResults.length; p++) {
        if (propResults[p].obj.number !== undefined) {
          emittedProps++;
          callbacks.onProposition(propResults[p].obj);
        }
        searchPos = propResults[p].endPos;
      }
    }
  }

  return {
    feed: function(chunk) {
      buffer += chunk;
      process();
    },
    flush: function() {
      process();
      return { buffer: buffer, emittedRaces: emittedRaces, emittedProps: emittedProps };
    },
    getBuffer: function() { return buffer; },
  };
}

// MARK: - Streaming Claude API Call

/**
 * Call the Anthropic streaming API. Reads content_block_delta events and
 * feeds text to the provided onText callback.
 *
 * @param {object} env - Worker environment
 * @param {string} system - System prompt
 * @param {string} userMessage - User prompt
 * @param {string} lang - Language code
 * @param {function} onText - Called with each text chunk
 * @returns {object} { fullText, stopReason }
 */
async function callClaudeStreaming(env, system, userMessage, lang, onText) {
  var maxTokens = lang === "es" ? 8192 : (lang === "es_cached" ? 4096 : 2048);

  for (var i = 0; i < MODELS.length; i++) {
    var model = MODELS[i];
    if (i > 0) {
      console.log("[MODEL FALLBACK] Streaming: falling back from " + MODELS[i - 1] + " to " + model);
    }
    for (var attempt = 0; attempt <= 1; attempt++) {
      var res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model,
          max_tokens: maxTokens,
          stream: true,
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (res.status === 200) {
        // Read SSE stream from Anthropic API
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var fullText = "";
        var stopReason = null;
        var sseBuffer = "";

        while (true) {
          var result = await reader.read();
          if (result.done) break;

          sseBuffer += decoder.decode(result.value, { stream: true });
          var lines = sseBuffer.split("\n");
          // Keep the last potentially incomplete line
          sseBuffer = lines.pop() || "";

          for (var li = 0; li < lines.length; li++) {
            var line = lines[li];
            if (!line.startsWith("data: ")) continue;
            var payload = line.slice(6);
            if (payload === "[DONE]") continue;

            try {
              var evt = JSON.parse(payload);
              if (evt.type === "content_block_delta" && evt.delta && evt.delta.type === "text_delta") {
                fullText += evt.delta.text;
                onText(evt.delta.text);
              } else if (evt.type === "message_delta" && evt.delta && evt.delta.stop_reason) {
                stopReason = evt.delta.stop_reason;
              }
            } catch (e) { /* skip malformed event */ }
          }
        }

        return { fullText: fullText, stopReason: stopReason, maxTokens: maxTokens, model: model };
      }

      if (res.status === 429) {
        var retryAfter = parseInt(res.headers.get("retry-after") || "0", 10);
        var wait = Math.max(retryAfter, attempt === 0 ? 5 : 15) * 1000;
        if (attempt === 0) {
          await new Promise(function(r) { setTimeout(r, wait); });
          continue;
        }
        if (i < MODELS.length - 1) break;
        throw new Error("Rate limited — please try again in a minute");
      }

      if (res.status === 529) {
        if (attempt === 0) {
          await new Promise(function(r) { setTimeout(r, 2000); });
          continue;
        }
        if (i < MODELS.length - 1) break;
        throw new Error("All models overloaded");
      }

      var body = await res.text();
      if (i < MODELS.length - 1) break;
      throw new Error("API error " + res.status + ": " + body.slice(0, 200));
    }
  }
  throw new Error("All models failed");
}

// MARK: - SSE Stream Handler

function sseEvent(type, data) {
  return "event: " + type + "\ndata: " + JSON.stringify(data) + "\n\n";
}

/**
 * Streaming guide generation handler. Emits SSE events as race recommendations
 * are generated by the LLM. Compatible with EventSource or fetch+getReader.
 */
export async function handlePWA_GuideStream(request, env) {
  var requestUrl = new URL(request.url);

  // Check election phase — block guide generation after polls close
  var stateCode = requestUrl.pathname.startsWith("/dc/") ? "dc" : "tx";
  var testPhase = requestUrl.searchParams.get("test_phase");
  var kvPhase = (testPhase && ELECTION_PHASES.includes(testPhase)) ? testPhase : await env.ELECTION_DATA.get("site_phase:" + stateCode);
  var phase = getElectionPhase(stateCode, { kvPhase });
  if (phase === "post-election" || phase === "election-night") {
    return new Response("event: error\ndata: " + JSON.stringify({ error: "Guide generation is closed. The primary election has ended.", phase }) + "\n\n", {
      status: 410,
      headers: { "Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*" },
    });
  }

  var nocache = requestUrl.searchParams.get("nocache") === "1";

  var body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response("event: error\ndata: " + JSON.stringify({ error: "Invalid request body" }) + "\n\n", {
      status: 400,
      headers: { "Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*" },
    });
  }

  var party = body.party;
  var profile = body.profile;
  var districts = body.districts;
  var lang = body.lang;
  var countyFips = body.countyFips;
  var readingLevel = body.readingLevel;
  var llm = body.llm;

  if (!party || !["republican", "democrat"].includes(party)) {
    return new Response("event: error\ndata: " + JSON.stringify({ error: "party required (republican|democrat)" }) + "\n\n", {
      status: 400,
      headers: { "Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*" },
    });
  }
  if (!profile) {
    return new Response("event: error\ndata: " + JSON.stringify({ error: "profile required" }) + "\n\n", {
      status: 400,
      headers: { "Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*" },
    });
  }

  // Create the SSE stream
  var streamController;
  var stream = new ReadableStream({
    start: function(controller) { streamController = controller; },
  });
  var encoder = new TextEncoder();

  function write(text) {
    try { streamController.enqueue(encoder.encode(text)); } catch (e) { /* stream closed */ }
  }

  function closeStream() {
    try { streamController.close(); } catch (e) { /* already closed */ }
  }

  // Run the guide generation in the background of the stream
  var streamPromise = (async function() {
    try {
      // Parallel KV reads
      var [statewideRaw, legacyRaw, countyRaw, manifestRaw] = await Promise.all([
        env.ELECTION_DATA.get("ballot:statewide:" + party + "_primary_2026"),
        env.ELECTION_DATA.get("ballot:" + party + "_primary_2026"),
        countyFips
          ? env.ELECTION_DATA.get("ballot:county:" + countyFips + ":" + party + "_primary_2026")
          : Promise.resolve(null),
        env.ELECTION_DATA.get("manifest"),
      ]);

      var raw = statewideRaw || legacyRaw;
      if (!raw) {
        write(sseEvent("error", { error: "No ballot data available" }));
        closeStream();
        return;
      }
      var ballot = JSON.parse(raw);

      // Merge county races
      var countyBallotAvailable = false;
      if (countyFips && countyRaw) {
        try {
          var countyBallot = JSON.parse(countyRaw);
          var seenRaces = new Set(ballot.races.map(function(r) { return r.office + "|" + (r.district || ""); }));
          var dedupedCounty = (countyBallot.races || []).filter(function(r) { return !seenRaces.has(r.office + "|" + (r.district || "")); });
          ballot.races = ballot.races.concat(dedupedCounty);
          if (countyBallot.propositions) {
            ballot.propositions = (ballot.propositions || []).concat(countyBallot.propositions);
          }
          countyBallotAvailable = true;
        } catch (e) { /* statewide-only */ }
      }

      // Filter by districts
      if (districts) {
        ballot = filterBallotToDistricts(ballot, districts);
      }

      // Extract data freshness
      var dataUpdatedAt = null;
      try {
        if (manifestRaw) {
          var manifest = JSON.parse(manifestRaw);
          if (manifest[party] && manifest[party].updatedAt) {
            dataUpdatedAt = manifest[party].updatedAt;
          }
        }
      } catch (e) { /* non-fatal */ }

      // Emit meta event with ballot skeleton (no recommendations)
      var ballotSkeleton = JSON.parse(JSON.stringify(ballot));
      write(sseEvent("meta", {
        party: party,
        ballot: ballotSkeleton,
        cached: false,
        countyBallotAvailable: countyFips ? countyBallotAvailable : null,
      }));

      // Check guide cache
      var cacheKey = null;
      if (!nocache) {
        try {
          var hash = await hashGuideKey(profile, ballot, party, lang, readingLevel, llm);
          cacheKey = "guide_cache:" + hash;
          var cachedRaw = await env.ELECTION_DATA.get(cacheKey);
          if (cachedRaw) {
            var cachedResult = JSON.parse(cachedRaw);
            console.log("Guide stream cache HIT for " + party);
            // Emit all events from cached result
            if (cachedResult.profileSummary) {
              write(sseEvent("profile", { profileSummary: cachedResult.profileSummary }));
            }
            if (cachedResult.ballot && cachedResult.ballot.races) {
              for (var cr = 0; cr < cachedResult.ballot.races.length; cr++) {
                var cachedRace = cachedResult.ballot.races[cr];
                if (cachedRace.recommendation) {
                  write(sseEvent("race", {
                    office: cachedRace.office,
                    district: cachedRace.district || null,
                    recommendation: cachedRace.recommendation,
                    candidates: cachedRace.candidates,
                  }));
                }
              }
            }
            if (cachedResult.ballot && cachedResult.ballot.propositions) {
              for (var cp = 0; cp < cachedResult.ballot.propositions.length; cp++) {
                var cachedProp = cachedResult.ballot.propositions[cp];
                if (cachedProp.recommendation) {
                  write(sseEvent("proposition", {
                    number: cachedProp.number,
                    title: cachedProp.title,
                    recommendation: cachedProp.recommendation,
                    reasoning: cachedProp.reasoning,
                    caveats: cachedProp.caveats || null,
                    confidence: cachedProp.confidence || null,
                  }));
                }
              }
            }
            write(sseEvent("complete", {
              balanceScore: cachedResult.balanceScore,
              dataUpdatedAt: cachedResult.dataUpdatedAt,
              llm: cachedResult.llm || "claude",
              cached: true,
            }));
            closeStream();
            return;
          }
        } catch (e) {
          console.log("Guide stream cache lookup error:", e.message);
          cacheKey = null;
        }
      }

      // Load cached translations for Spanish
      var cachedTranslations = null;
      if (lang === "es") {
        cachedTranslations = await loadCachedTranslations(env, party, countyFips);
      }

      // Build ballot description
      var ballotDesc;
      var ballotDescCacheKey = null;
      try {
        var ballotDescData = new TextEncoder().encode(JSON.stringify({
          races: ballot.races.map(function(r) {
            return r.office + "|" + (r.district || "") + "|" +
              r.candidates.map(function(c) { return c.name + (c.withdrawn ? "W" : "") + (c.isIncumbent ? "I" : ""); }).join(",");
          }).sort(),
          props: (ballot.propositions || []).map(function(p) { return p.number + ":" + p.title; }),
          electionName: ballot.electionName,
        }));
        var ballotDescHashBuf = await crypto.subtle.digest("SHA-256", ballotDescData);
        var ballotDescHashArr = new Uint8Array(ballotDescHashBuf);
        var ballotDescHex = "";
        for (var h = 0; h < ballotDescHashArr.length; h++) {
          ballotDescHex += ballotDescHashArr[h].toString(16).padStart(2, "0");
        }
        ballotDescCacheKey = "ballot_desc:" + ballotDescHex;
        var cachedDesc = await env.ELECTION_DATA.get(ballotDescCacheKey);
        if (cachedDesc) {
          ballotDesc = cachedDesc;
        }
      } catch (e) {
        ballotDescCacheKey = null;
      }
      if (!ballotDesc) {
        ballotDesc = buildCondensedBallotDescription(ballot);
        if (ballotDescCacheKey) {
          env.ELECTION_DATA.put(ballotDescCacheKey, ballotDesc, { expirationTtl: 3600 })
            .catch(function(e) { console.log("Ballot desc cache write error:", e.message); });
        }
      }

      var userPrompt = buildUserPrompt(profile, ballotDesc, ballot, party, lang, readingLevel, cachedTranslations);
      var effectiveLang = (lang === "es" && cachedTranslations) ? "es_cached" : lang;

      // Non-Claude backends: use existing non-streaming path, emit events from parsed result
      if (llm && llm !== "claude") {
        var responseText = await callLLM(env, SYSTEM_PROMPT, userPrompt, effectiveLang, llm);
        var guideResponse = parseResponse(responseText);
        var mergedBallot = mergeRecommendations(guideResponse, ballot, lang, cachedTranslations);
        var balanceScore = scorePartisanBalance(guideResponse, ballot);

        if (guideResponse.profileSummary) {
          write(sseEvent("profile", { profileSummary: guideResponse.profileSummary }));
        }
        for (var nr = 0; nr < mergedBallot.races.length; nr++) {
          var nrace = mergedBallot.races[nr];
          if (nrace.recommendation) {
            write(sseEvent("race", {
              office: nrace.office,
              district: nrace.district || null,
              recommendation: nrace.recommendation,
              candidates: nrace.candidates,
            }));
          }
        }
        for (var np = 0; np < (mergedBallot.propositions || []).length; np++) {
          var nprop = mergedBallot.propositions[np];
          if (nprop.recommendation) {
            write(sseEvent("proposition", {
              number: nprop.number,
              title: nprop.title,
              recommendation: nprop.recommendation,
              reasoning: nprop.reasoning,
              caveats: nprop.caveats || null,
              confidence: nprop.confidence || null,
            }));
          }
        }

        var nonStreamResult = {
          ballot: mergedBallot,
          profileSummary: guideResponse.profileSummary,
          llm: llm,
          countyBallotAvailable: countyFips ? countyBallotAvailable : null,
          dataUpdatedAt: dataUpdatedAt,
          balanceScore: balanceScore,
          skewNote: balanceScore.skewNote,
          translationsCached: lang === "es" ? !!cachedTranslations : null,
          cached: false,
        };
        if (cacheKey) {
          env.ELECTION_DATA.put(cacheKey, JSON.stringify(nonStreamResult), { expirationTtl: 3600 })
            .catch(function(e) { console.log("Guide cache write error:", e.message); });
        }
        write(sseEvent("complete", {
          balanceScore: balanceScore,
          dataUpdatedAt: dataUpdatedAt,
          llm: llm,
          cached: false,
        }));
        closeStream();
        return;
      }

      // Claude streaming path
      var emittedRaceOffices = new Set();
      var emittedPropNumbers = new Set();

      var parser = createIncrementalParser({
        onProfileSummary: function(summary) {
          write(sseEvent("profile", { profileSummary: summary }));
        },
        onRace: function(raceObj) {
          // Merge this race recommendation into ballot and emit
          var raceKey = raceObj.office + "|" + (raceObj.district || "");
          if (emittedRaceOffices.has(raceKey)) return;
          emittedRaceOffices.add(raceKey);

          // Find matching ballot race
          for (var br = 0; br < ballot.races.length; br++) {
            var ballotRace = ballot.races[br];
            if (ballotRace.office === raceObj.office &&
                (ballotRace.district || null) === (raceObj.district || null)) {
              // Build merged race data
              var mergedCandidates = JSON.parse(JSON.stringify(ballotRace.candidates));
              var recommendation = null;
              for (var mc = 0; mc < mergedCandidates.length; mc++) {
                mergedCandidates[mc].isRecommended = false;
              }
              for (var mc2 = 0; mc2 < mergedCandidates.length; mc2++) {
                if (mergedCandidates[mc2].name === raceObj.recommendedCandidate && !mergedCandidates[mc2].withdrawn) {
                  mergedCandidates[mc2].isRecommended = true;
                  recommendation = {
                    candidateId: mergedCandidates[mc2].id,
                    candidateName: raceObj.recommendedCandidate,
                    reasoning: raceObj.reasoning,
                    matchFactors: raceObj.matchFactors || [],
                    strategicNotes: raceObj.strategicNotes || null,
                    caveats: raceObj.caveats || null,
                    confidence: raceObj.confidence || "Good Match",
                  };
                  break;
                }
              }
              write(sseEvent("race", {
                office: ballotRace.office,
                district: ballotRace.district || null,
                recommendation: recommendation,
                candidates: mergedCandidates,
              }));
              break;
            }
          }
        },
        onProposition: function(propObj) {
          if (emittedPropNumbers.has(propObj.number)) return;
          emittedPropNumbers.add(propObj.number);
          write(sseEvent("proposition", {
            number: propObj.number,
            recommendation: propObj.recommendation || "Your Call",
            reasoning: propObj.reasoning,
            caveats: propObj.caveats || null,
            confidence: propObj.confidence || null,
          }));
        },
      });

      var streamResult = await callClaudeStreaming(env, SYSTEM_PROMPT, userPrompt, effectiveLang, function(chunk) {
        parser.feed(chunk);
      });

      parser.flush();

      // Handle truncation
      var fullText = streamResult.fullText;
      if (streamResult.stopReason === "max_tokens") {
        var repaired = repairTruncatedGuide(fullText);
        if (repaired) {
          // Emit any races/props from repaired that weren't already streamed
          var repairedRaces = repaired.races || [];
          for (var rr = 0; rr < repairedRaces.length; rr++) {
            var rrKey = repairedRaces[rr].office + "|" + (repairedRaces[rr].district || "");
            if (!emittedRaceOffices.has(rrKey)) {
              parser.feed(""); // Trigger re-check not needed, just emit directly
              emittedRaceOffices.add(rrKey);
              for (var rb = 0; rb < ballot.races.length; rb++) {
                if (ballot.races[rb].office === repairedRaces[rr].office &&
                    (ballot.races[rb].district || null) === (repairedRaces[rr].district || null)) {
                  var rMergedCands = JSON.parse(JSON.stringify(ballot.races[rb].candidates));
                  var rRec = null;
                  for (var rmc = 0; rmc < rMergedCands.length; rmc++) {
                    rMergedCands[rmc].isRecommended = false;
                    if (rMergedCands[rmc].name === repairedRaces[rr].recommendedCandidate && !rMergedCands[rmc].withdrawn) {
                      rMergedCands[rmc].isRecommended = true;
                      rRec = {
                        candidateId: rMergedCands[rmc].id,
                        candidateName: repairedRaces[rr].recommendedCandidate,
                        reasoning: repairedRaces[rr].reasoning,
                        matchFactors: repairedRaces[rr].matchFactors || [],
                        strategicNotes: repairedRaces[rr].strategicNotes || null,
                        caveats: repairedRaces[rr].caveats || null,
                        confidence: repairedRaces[rr].confidence || "Good Match",
                        _truncated: true,
                      };
                    }
                  }
                  write(sseEvent("race", {
                    office: ballot.races[rb].office,
                    district: ballot.races[rb].district || null,
                    recommendation: rRec,
                    candidates: rMergedCands,
                    _truncated: true,
                  }));
                  break;
                }
              }
            }
          }
          fullText = JSON.stringify(repaired);
        } else if (streamResult.maxTokens < 8192) {
          // Retry non-streaming with doubled tokens
          console.log("[STREAM RETRY] Retrying non-streaming with doubled max_tokens");
          var retryText = await callClaude(env, SYSTEM_PROMPT, userPrompt, effectiveLang, null, Math.min(streamResult.maxTokens * 2, 8192));
          fullText = retryText;
          var retryGuide = parseResponse(retryText);
          var retryMerged = mergeRecommendations(retryGuide, ballot, lang, cachedTranslations);
          // Emit any missing races/props from retry
          for (var rtr = 0; rtr < retryMerged.races.length; rtr++) {
            var rtKey = retryMerged.races[rtr].office + "|" + (retryMerged.races[rtr].district || "");
            if (!emittedRaceOffices.has(rtKey) && retryMerged.races[rtr].recommendation) {
              write(sseEvent("race", {
                office: retryMerged.races[rtr].office,
                district: retryMerged.races[rtr].district || null,
                recommendation: retryMerged.races[rtr].recommendation,
                candidates: retryMerged.races[rtr].candidates,
              }));
            }
          }
          for (var rtp = 0; rtp < (retryMerged.propositions || []).length; rtp++) {
            var rtProp = retryMerged.propositions[rtp];
            if (!emittedPropNumbers.has(rtProp.number) && rtProp.recommendation) {
              write(sseEvent("proposition", {
                number: rtProp.number,
                recommendation: rtProp.recommendation,
                reasoning: rtProp.reasoning,
                caveats: rtProp.caveats || null,
                confidence: rtProp.confidence || null,
              }));
            }
          }
          if (retryGuide.profileSummary && !emittedRaceOffices.size) {
            write(sseEvent("profile", { profileSummary: retryGuide.profileSummary }));
          }
        }
      }

      // Parse full response for caching and balance scoring
      var guideResponseFinal;
      try {
        guideResponseFinal = parseResponse(fullText);
      } catch (e) {
        guideResponseFinal = { races: [], propositions: [] };
      }
      var mergedBallotFinal = mergeRecommendations(guideResponseFinal, ballot, lang, cachedTranslations);
      var balanceScoreFinal = scorePartisanBalance(guideResponseFinal, ballot);

      if (balanceScoreFinal.flags.length > 0) {
        console.log("Partisan balance flags for " + party + " stream guide:", balanceScoreFinal.flags.join("; "));
      }

      // Cache the full result
      var fullResult = {
        ballot: mergedBallotFinal,
        profileSummary: guideResponseFinal.profileSummary,
        llm: llm || "claude",
        countyBallotAvailable: countyFips ? countyBallotAvailable : null,
        dataUpdatedAt: dataUpdatedAt,
        balanceScore: balanceScoreFinal,
        skewNote: balanceScoreFinal.skewNote,
        translationsCached: lang === "es" ? !!cachedTranslations : null,
        cached: false,
      };
      if (cacheKey) {
        env.ELECTION_DATA.put(cacheKey, JSON.stringify(fullResult), { expirationTtl: 3600 })
          .catch(function(e) { console.log("Guide stream cache write error:", e.message); });
      }

      write(sseEvent("complete", {
        balanceScore: balanceScoreFinal,
        dataUpdatedAt: dataUpdatedAt,
        llm: llm || "claude",
        cached: false,
      }));
      closeStream();
    } catch (err) {
      console.error("Guide stream error:", err);
      write(sseEvent("error", { error: err.message || "Guide generation failed" }));
      closeStream();
    }
  })();

  // Return the SSE response immediately — the async function runs via waitUntil-like behavior
  // The stream will be written to as data arrives
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export { sortOrder, parseResponse, filterBallotToDistricts, buildUserPrompt, mergeRecommendations, buildCondensedBallotDescription, callLLM, VALID_LLMS, scorePartisanBalance, CONFIDENCE_SCORES, loadCachedTranslations, hashGuideKey, repairTruncatedGuide, createIncrementalParser, callClaudeStreaming, SYSTEM_PROMPT };

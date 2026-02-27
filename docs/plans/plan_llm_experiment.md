# LLM Model Comparison Experiment Plan

**Goal**: Determine which LLM produces the best voting guide recommendations for Texas Votes, balancing recommendation quality, reasoning depth, factual accuracy, JSON compliance, fairness, speed, and cost.

**Status**: Planning
**Date**: February 2026
**Author**: Joshua Baer + Claude

---

## Table of Contents

1. [Models Under Test](#1-models-under-test)
2. [Evaluation Criteria](#2-evaluation-criteria)
3. [Test Matrix](#3-test-matrix)
4. [Scoring Methodology](#4-scoring-methodology)
5. [Implementation Plan](#5-implementation-plan)
6. [Decision Framework](#6-decision-framework)
7. [Appendix](#7-appendix)

---

## 1. Models Under Test

| Key | Model | Provider | Input $/1M | Output $/1M | Notes |
|-----|-------|----------|-----------|-------------|-------|
| `claude` | Claude Sonnet 4.6 | Anthropic | $3.00 | $15.00 | Current default |
| `claude-haiku` | Claude Haiku 4.5 | Anthropic | $0.80 | $4.00 | Fast/cheap Anthropic |
| `claude-opus` | Claude Opus 4.6 | Anthropic | $15.00 | $75.00 | Premium Anthropic |
| `chatgpt` | GPT-4o | OpenAI | $2.50 | $10.00 | Flagship OpenAI |
| `gpt-4o-mini` | GPT-4o mini | OpenAI | $0.15 | $0.60 | Budget OpenAI |
| `gemini` | Gemini 2.5 Flash | Google | $0.15 | $3.50 | Budget Google |
| `gemini-pro` | Gemini 2.5 Pro | Google | $1.25 | $10.00 | Premium Google |
| `grok` | Grok 3 | xAI | $5.00 | $15.00 | xAI flagship |

**Pricing source**: `EXP_COST` in `pwa.js` (line 1866), cross-referenced with provider pricing pages.

---

## 2. Evaluation Criteria

### 2.1 Recommendation Quality (Weight: 30%)

**Definition**: How well does the model match candidates to the voter's stated preferences, issues, and values?

**Measurement**:
- **Automated**: Cross-model agreement rate. If 6+ of 8 models recommend the same candidate for a race, that is the "consensus pick." Score = % of races where the model matches consensus.
- **Manual**: Human reviewer (1-10 scale) evaluates whether the recommended candidate genuinely aligns with the voter profile. Reviewer reads the voter profile, reviews candidate data, then scores the recommendation without seeing which model produced it (blind review).

**Scoring rubric (1-10)**:
| Score | Meaning |
|-------|---------|
| 9-10 | Recommendation perfectly matches stated priorities with strong justification |
| 7-8 | Good match; minor priorities could be better served |
| 5-6 | Acceptable match; misses some stated values |
| 3-4 | Weak match; recommendation contradicts some stated priorities |
| 1-2 | Clearly wrong; recommendation opposes voter's core values |

### 2.2 Reasoning Depth (Weight: 15%)

**Definition**: Are the explanations specific, substantive, and personalized to the voter's stated values?

**Measurement**:
- **Automated**: Average `reasoning` field character length per race (from `computeExpAnalysis`). Average `matchFactors` count per race.
- **Manual**: Human reviewer scores reasoning quality blind.

**Scoring rubric (1-10)**:
| Score | Meaning |
|-------|---------|
| 9-10 | References specific voter priorities by name, cites candidate positions, explains tradeoffs |
| 7-8 | Connects to voter values but somewhat generic |
| 5-6 | Generic reasoning that could apply to any voter |
| 3-4 | Vague or boilerplate ("this candidate aligns with your values") |
| 1-2 | Empty, irrelevant, or nonsensical reasoning |

### 2.3 Factual Accuracy (Weight: 20%)

**Definition**: Do recommendations reference real endorsements, positions, voting records, and verifiable facts?

**Measurement** (manual only):
- For a random sample of 3 races per profile run, verify each factual claim in the reasoning against the ballot data provided to the LLM.
- Check: Does the model invent endorsements? Cite positions not in the data? Attribute stances to the wrong candidate?

**Scoring rubric (1-10)**:
| Score | Meaning |
|-------|---------|
| 9-10 | All claims verifiable against provided ballot data; no hallucinations |
| 7-8 | Minor embellishments but core facts correct |
| 5-6 | 1-2 factual errors per guide (wrong endorsement, wrong position) |
| 3-4 | Multiple fabricated claims; mixes up candidates |
| 1-2 | Pervasive hallucinations; unreliable |

### 2.4 JSON Compliance (Weight: 10%)

**Definition**: Does the model produce valid, complete, parseable JSON that matches the required schema?

**Measurement** (automated):
- **Parse success rate**: % of responses that `parseResponse()` handles without throwing, including after sanitization and repair.
- **Schema compliance**: % of responses with all required fields (`profileSummary`, `races[]` with `office`, `recommendedCandidate`, `reasoning`, `confidence`, `matchFactors`).
- **Truncation rate**: % of responses where `_truncated: true` (repair was needed) or `stop_reason` was `max_tokens`.
- **Candidate name accuracy**: % of `recommendedCandidate` values that exactly match a name from the `VALID CANDIDATES` list.

**Scoring rubric (1-10)**:
| Score | Meaning |
|-------|---------|
| 9-10 | 100% valid JSON on first parse, all fields present, no truncation |
| 7-8 | Valid after sanitization (trailing commas, markdown fences); all fields present |
| 5-6 | Needs repair; some races missing or truncated |
| 3-4 | Frequent parse failures; missing critical fields |
| 1-2 | Cannot reliably parse; fundamentally broken JSON output |

### 2.5 Balance & Fairness (Weight: 10%)

**Definition**: Are pros and cons balanced across candidates? Is there partisan lean in the recommendations?

**Measurement**:
- **Automated**: Run `scorePartisanBalance()` on each generated guide. Track `skewNote` and flag counts across all profiles.
- **Cross-profile consistency**: For the Progressive and Conservative profiles (same ballot, opposite values), verify that the model makes different recommendations in opposite directions (i.e., it is not stuck recommending the same candidates regardless of voter input).
- **Loaded language detection**: Count uses of partisan framing terms ("radical", "extreme", "common-sense", "pro-family") per guide.

**Scoring rubric (1-10)**:
| Score | Meaning |
|-------|---------|
| 9-10 | Perfectly neutral framing; recommendations flip appropriately for opposite profiles; no loaded language |
| 7-8 | Mostly neutral; 1-2 minor instances of partisan framing |
| 5-6 | Noticeable lean in 3+ races; some loaded language |
| 3-4 | Persistent bias; fails to flip recommendations for opposite profiles |
| 1-2 | Overtly partisan; ignores voter's stated values in favor of a political lean |

### 2.6 Speed (Weight: 5%)

**Definition**: Total wall-clock time from request to complete parsed response.

**Measurement** (automated):
- `expTiming[llmKey]` captures wall-clock seconds from `Date.now()` before fetch to after both party ballots parse.
- Report: median, p90, p99 across all runs.
- Note: Timing is measured client-side via the experiment page, which includes network round-trip to the Cloudflare Worker plus the Worker-to-LLM API call. This is realistic for the user experience.

**Scoring rubric (1-10)**:
| Score | Seconds | Meaning |
|-------|---------|---------|
| 10 | < 5s | Instant feel |
| 8 | 5-10s | Fast, user barely waits |
| 6 | 10-20s | Acceptable with loading animation |
| 4 | 20-30s | Slow, user may abandon |
| 2 | 30-45s | Frustrating |
| 1 | > 45s | Unacceptable |

### 2.7 Cost (Weight: 5%)

**Definition**: Estimated cost per guide generation (both parties combined).

**Measurement** (automated):
- `expCosts[llmKey]` estimates cost from response character count: `estimatedOutputTokens = chars / 4`, `estimatedInputTokens = outputTokens * 1.5`, then applies `EXP_COST` rates.
- Report: average cost per guide, projected monthly cost at 100 guides/day.

**Scoring rubric (1-10)**:
| Score | Cost/guide | Monthly @100/day |
|-------|-----------|-----------------|
| 10 | < $0.005 | < $15 |
| 8 | $0.005-$0.02 | $15-$60 |
| 6 | $0.02-$0.05 | $60-$150 |
| 4 | $0.05-$0.10 | $150-$300 |
| 2 | $0.10-$0.20 | $300-$600 |
| 1 | > $0.20 | > $600 |

### 2.8 Robustness (Weight: 5%)

**Definition**: How often does the model fail, error, truncate, or produce malformed output?

**Measurement** (automated across all runs):
- **Error rate**: % of runs that return an error (API error, timeout, rate limit, no content).
- **Truncation rate**: % of runs where response was truncated (`_truncated: true`, `stop_reason: max_tokens`, or `finish_reason: length`).
- **Retry rate**: % of runs that triggered auto-retry with doubled `max_tokens`.
- **Candidate name mismatch rate**: % of races where `recommendedCandidate` does not exactly match any candidate in the ballot data.

**Scoring rubric (1-10)**:
| Score | Failure rate | Meaning |
|-------|-------------|---------|
| 9-10 | 0% | Perfect reliability |
| 7-8 | 1-5% | Rare issues |
| 5-6 | 5-10% | Occasional failures |
| 3-4 | 10-20% | Unreliable |
| 1-2 | > 20% | Cannot be trusted in production |

---

## 3. Test Matrix

### 3.1 Voter Profiles

Seven profiles designed to cover the political spectrum, issue diversity, demographics, and edge cases relevant to Texas primaries.

#### Profile 1: Progressive Urban (Democrat Primary)

```json
{
  "party": "democrat",
  "politicalSpectrum": "Very Progressive",
  "topIssues": ["Healthcare", "Education", "Abortion/Reproductive Rights", "Climate & Environment", "LGBTQ+ Rights", "Criminal Justice", "Voting & Elections"],
  "candidateQualities": ["Integrity", "Experience", "Leadership", "Diversity", "Collaboration"],
  "policyViews": {
    "Healthcare": "Universal healthcare, expand Medicaid",
    "Immigration": "Path to citizenship, protect DACA",
    "Education": "Increase public school funding, oppose vouchers",
    "Gun Policy": "Assault weapons ban, universal background checks",
    "Abortion": "Codify Roe v. Wade protections"
  },
  "freeform": "I live in Austin and care deeply about reproductive rights and public transit. I want candidates who will stand up to the state legislature on local control issues.",
  "readingLevel": 4
}
```

#### Profile 2: Conservative Rural (Republican Primary)

```json
{
  "party": "republican",
  "politicalSpectrum": "Very Conservative",
  "topIssues": ["Immigration", "Gun Rights/Safety", "Economy & Jobs", "Agriculture/Rural Issues", "Faith/Religious Liberty", "Public Safety", "Energy & Oil/Gas"],
  "candidateQualities": ["Faith & Values", "Business Experience", "Leadership", "Integrity", "Toughness"],
  "policyViews": {
    "Immigration": "Secure the border, deport illegal immigrants",
    "Gun Policy": "Protect Second Amendment, no new restrictions",
    "Economy": "Lower taxes, reduce regulations",
    "Energy": "Expand oil and gas production, no green mandates",
    "Education": "School choice and vouchers, parental rights"
  },
  "freeform": "Rancher in West Texas. Federal government needs to get out of the way. Property rights matter. I want someone who will fight for rural communities.",
  "readingLevel": 3
}
```

#### Profile 3: Moderate Suburban (Republican Primary)

```json
{
  "party": "republican",
  "politicalSpectrum": "Moderate",
  "topIssues": ["Economy & Jobs", "Education", "Healthcare", "Property Tax", "Public Safety", "Water Rights/Scarcity"],
  "candidateQualities": ["Experience", "Collaboration", "Integrity", "Leadership", "Business Experience"],
  "policyViews": {
    "Healthcare": "Market-based solutions with safety net",
    "Education": "Good public schools AND school choice",
    "Economy": "Fiscally responsible, pro-business",
    "Immigration": "Secure border but practical reforms",
    "Gun Policy": "Second Amendment with responsible ownership"
  },
  "freeform": "Suburban mom in the DFW area. I want pragmatic solutions, not culture wars. Tired of both extremes.",
  "readingLevel": 3
}
```

#### Profile 4: Single-Issue Voter -- Immigration (Republican Primary)

```json
{
  "party": "republican",
  "politicalSpectrum": "Conservative",
  "topIssues": ["Immigration", "Immigration", "Immigration", "Public Safety", "Economy & Jobs"],
  "candidateQualities": ["Toughness", "Leadership", "Business Experience"],
  "policyViews": {
    "Immigration": "Complete border wall, end catch and release, mandatory E-Verify, end birthright citizenship",
    "Public Safety": "Support law enforcement",
    "Economy": "America first trade policy"
  },
  "freeform": "Immigration is THE issue. Everything else is secondary. I want the toughest candidate on the border.",
  "readingLevel": 2
}
```

#### Profile 5: First-Time Voter (Democrat Primary)

```json
{
  "party": "democrat",
  "politicalSpectrum": "Lean Progressive",
  "topIssues": ["Education", "Climate & Environment", "Economy & Jobs", "Healthcare", "Housing"],
  "candidateQualities": ["Diversity", "Integrity", "Collaboration"],
  "policyViews": {
    "Education": "Make college more affordable",
    "Climate": "Take climate change seriously",
    "Economy": "Living wage, affordable housing"
  },
  "freeform": "Just turned 18. First time voting. I honestly don't know much about these candidates but I care about my future.",
  "readingLevel": 1
}
```

#### Profile 6: Libertarian-Leaning (Republican Primary)

```json
{
  "party": "republican",
  "politicalSpectrum": "Libertarian",
  "topIssues": ["Economy & Jobs", "Gun Rights/Safety", "Property Tax", "Faith/Religious Liberty", "Criminal Justice"],
  "candidateQualities": ["Integrity", "Business Experience", "Leadership"],
  "policyViews": {
    "Economy": "Eliminate income tax, minimal regulation, reduce government spending",
    "Gun Policy": "Constitutional carry, abolish ATF",
    "Criminal Justice": "End drug war, reduce incarceration",
    "Education": "Abolish Department of Education, full school choice",
    "Healthcare": "Free market healthcare, no mandates"
  },
  "freeform": "Government that governs least governs best. Both parties spend too much. Individual liberty above all.",
  "readingLevel": 5
}
```

#### Profile 7: Spanish-Speaking Moderate (Democrat Primary)

```json
{
  "party": "democrat",
  "politicalSpectrum": "Moderate",
  "topIssues": ["Immigration", "Healthcare", "Education", "Economy & Jobs", "Housing"],
  "candidateQualities": ["Diversity", "Experience", "Collaboration", "Integrity"],
  "policyViews": {
    "Immigration": "Protect DREAMers, path to citizenship for law-abiding immigrants",
    "Healthcare": "Expand coverage for working families",
    "Education": "Bilingual education, well-funded public schools",
    "Economy": "Small business support, fair wages"
  },
  "freeform": "Mi familia ha vivido en Texas por tres generaciones. Quiero candidatos que representen a toda la comunidad.",
  "readingLevel": 3,
  "lang": "es"
}
```

### 3.2 Test Matrix Dimensions

| Dimension | Values | Count |
|-----------|--------|-------|
| Voter profiles | 7 (defined above) | 7 |
| LLM models | 8 (all models) | 8 |
| Repetitions | 3 per combination (consistency) | 3 |
| **Total API calls** | **7 profiles x 8 models x 3 runs x 2 parties** | **336** |

Each run generates recommendations for both Republican and Democrat primaries (or just one party for single-party profiles). The `?nocache=1` flag must be used to bypass guide response caching and force fresh LLM calls.

### 3.3 Profile-to-Party Mapping

| Profile | Party | Ballot |
|---------|-------|--------|
| 1. Progressive Urban | Democrat | Democrat primary |
| 2. Conservative Rural | Republican | Republican primary |
| 3. Moderate Suburban | Republican | Republican primary |
| 4. Single-Issue Immigration | Republican | Republican primary |
| 5. First-Time Voter | Democrat | Democrat primary |
| 6. Libertarian-Leaning | Republican | Republican primary |
| 7. Spanish-Speaking Moderate | Democrat | Democrat primary (`lang=es`) |

**Effective API calls**: 7 profiles x 8 models x 3 runs x 1 party each = **168 API calls**.

### 3.4 Estimated Cost

Based on `EXP_COST` rates and an estimated ~$0.04/guide for Claude Sonnet as the baseline:

| Model | Est. $/guide | 168 calls | 3x runs |
|-------|-------------|-----------|---------|
| claude | ~$0.042 | $7.06 | -- |
| claude-haiku | ~$0.010 | $1.68 | -- |
| claude-opus | ~$0.180 | $30.24 | -- |
| chatgpt | ~$0.028 | $4.70 | -- |
| gpt-4o-mini | ~$0.002 | $0.34 | -- |
| gemini | ~$0.008 | $1.34 | -- |
| gemini-pro | ~$0.024 | $4.03 | -- |
| grok | ~$0.042 | $7.06 | -- |
| **Total** | -- | **~$56** | -- |

Note: Opus is the dominant cost. Consider running Opus with only 1 repetition (instead of 3) to save ~$20, validating consistency via the other two runs.

---

## 4. Scoring Methodology

### 4.1 Weighted Score Formula

Each model receives a **Composite Score (0-10)** calculated as:

```
CompositeScore = (Quality x 0.30) + (Reasoning x 0.15) + (Accuracy x 0.20) +
                 (JSON x 0.10) + (Balance x 0.10) + (Speed x 0.05) +
                 (Cost x 0.05) + (Robustness x 0.05)
```

### 4.2 Per-Criterion Scoring

#### Automated Metrics (collected per run, aggregated across all runs)

| Criterion | Metric | How to Score |
|-----------|--------|-------------|
| Quality | Consensus agreement % | `(agreementWithConsensus / totalContestedRaces) * 10` |
| Reasoning | Avg reasoning length + matchFactors | Normalize: top model = 10, scale others proportionally |
| JSON | Parse success rate | `successRate * 10` (100% = 10) |
| Speed | Median wall-clock seconds | Use rubric from section 2.6 |
| Cost | Average cost per guide | Use rubric from section 2.7 |
| Robustness | `(1 - failureRate) * 10` | Combined error + truncation + retry rate |

#### Manual Metrics (human-scored, blind review)

| Criterion | Method |
|-----------|--------|
| Quality (manual) | Score 5 randomly selected races per profile, averaged |
| Reasoning | Score 5 randomly selected reasonings per profile, averaged |
| Accuracy | Spot-check 3 races per profile for factual claims |
| Balance | Review cross-profile consistency + loaded language scan |

**Final criterion score** = weighted average of automated + manual components:
- Quality: 50% automated consensus, 50% manual review
- Reasoning: 50% automated length/factors, 50% manual quality review
- Accuracy: 100% manual (no reliable automated method)
- JSON: 100% automated
- Balance: 50% automated (`scorePartisanBalance` + cross-profile check), 50% manual framing review
- Speed: 100% automated
- Cost: 100% automated
- Robustness: 100% automated

### 4.3 Statistical Analysis

- **Central tendency**: Report median and mean composite scores per model (median preferred due to small sample).
- **Consistency**: For each model, compute standard deviation of composite scores across the 3 repetitions per profile. Lower SD = more consistent.
- **Significance**: With 3 repetitions x 7 profiles = 21 data points per model, use a Wilcoxon signed-rank test (non-parametric, paired) to determine whether the top-scoring model is significantly better than the current default (Claude Sonnet). Threshold: p < 0.05.
- **Per-profile breakdowns**: Report composite scores per profile to identify models that excel for specific voter types (e.g., "Gemini Pro is best for first-time voters but worst for Spanish-speaking users").

---

## 5. Implementation Plan

### 5.1 Phase 1: Automation Script (Days 1-2)

Build an API-based test runner that bypasses the browser UI and calls the guide endpoint directly.

**Script**: `worker/scripts/run_llm_experiment.sh` (or `.js` for Node)

```bash
# Pseudocode for the experiment runner
for PROFILE in profiles/*.json; do
  for LLM in claude claude-haiku claude-opus chatgpt gpt-4o-mini gemini gemini-pro grok; do
    for RUN in 1 2 3; do
      TIMESTAMP=$(date +%s)

      # Call the API directly (bypasses cache)
      curl -s -X POST "https://txvotes.app/app/api/guide?nocache=1" \
        -H "Content-Type: application/json" \
        -d "{
          \"party\": \"$(jq -r .party $PROFILE)\",
          \"profile\": $(jq .profile $PROFILE),
          \"districts\": null,
          \"lang\": $(jq .lang $PROFILE),
          \"readingLevel\": $(jq .readingLevel $PROFILE),
          \"llm\": \"$LLM\"
        }" \
        -o "results/${LLM}_${PROFILE_NAME}_run${RUN}.json" \
        -w "%{time_total}" > "results/${LLM}_${PROFILE_NAME}_run${RUN}.timing"

      echo "$LLM | $PROFILE_NAME | run $RUN | $(cat results/${LLM}_${PROFILE_NAME}_run${RUN}.timing)s"

      # Rate limit protection: 2s between calls
      sleep 2
    done
  done
done
```

**Important considerations**:
- Use `?nocache=1` on every call to bypass guide response caching.
- Add 2-second delays between calls to respect rate limits (10 req/IP/min on the guide endpoint -- may need to temporarily raise this or whitelist the runner IP).
- At 168 calls with 2s delays + ~15s average generation time = ~48 minutes total runtime. With 3 repetitions, expect ~2.5 hours.
- Save full JSON responses, not just recommendations, to enable post-hoc analysis.
- Log wall-clock timing via `curl -w "%{time_total}"`.

### 5.2 Phase 2: Automated Analysis (Day 3)

Build an analysis script (`worker/scripts/analyze_experiment.js`) that:

1. **Loads all result files** from `results/` directory.
2. **Extracts automated metrics**:
   - Parse success rate (try `JSON.parse`, count failures)
   - Schema compliance (check for required fields)
   - Truncation rate (`_truncated` flag)
   - Candidate name match rate (compare `recommendedCandidate` against ballot data)
   - Reasoning length averages
   - MatchFactor count averages
   - Timing from `.timing` files
   - Cost estimates from response sizes
3. **Computes consensus recommendations**: For each race, find the candidate recommended by the majority of models. Score each model against consensus.
4. **Runs cross-profile consistency check**: For profiles with opposite political leanings on the same ballot, verify recommendations differ.
5. **Runs `scorePartisanBalance()`** on each response (import from `pwa-guide.js`).
6. **Generates a summary report** in markdown.

### 5.3 Phase 3: Manual Review (Days 4-5)

A human reviewer evaluates a stratified sample:

- **Sample size**: 2 profiles x 8 models x 1 run = 16 guides to review in depth.
- **Recommended profiles for manual review**: Profile 1 (Progressive Urban) and Profile 2 (Conservative Rural) -- these are the most distinct, so differences between models will be most visible.
- **Blind review protocol**:
  1. Reviewer receives guide outputs labeled only by anonymous ID (e.g., "Model A", "Model B").
  2. For each guide, reviewer scores 5 contested races on: recommendation quality (1-10), reasoning quality (1-10), factual accuracy (1-10), neutrality (1-10).
  3. Reviewer records any hallucinated facts or loaded language.
  4. After all reviews, unblind and aggregate.

### 5.4 Phase 4: Report & Decision (Day 6)

1. Combine automated and manual scores using the weighted formula.
2. Generate a final ranking table.
3. Create per-profile heatmaps showing which models are best for which voter types.
4. Write up findings with specific examples of where models diverged.
5. Make a recommendation for the default model (or a model routing strategy).

### 5.5 Timeline

| Phase | Duration | What |
|-------|----------|------|
| 1. Build automation | 2 days | Script, profiles, infrastructure |
| 2. Run experiment | 0.5 day | ~2.5 hours of API calls |
| 3. Automated analysis | 1 day | Analysis script, consensus, metrics |
| 4. Manual review | 2 days | Blind review of 16 guides |
| 5. Report & decision | 1 day | Final report, recommendation |
| **Total** | **~6.5 days** | |

---

## 6. Decision Framework

### 6.1 Switching Threshold

The current default is Claude Sonnet. A model should replace it as default only if:

1. **Composite score is >= 0.5 points higher** (on the 0-10 scale) with p < 0.05 significance, OR
2. **Composite score is within 0.3 points** AND cost is **3x or more cheaper**, OR
3. **Composite score is within 0.3 points** AND speed is **2x or faster**.

In other words: meaningful quality improvement justifies a switch regardless of cost, and equivalent quality at dramatically lower cost/speed also justifies a switch.

### 6.2 Disqualification Criteria

A model is **disqualified** from consideration as default if any of the following are true:

- JSON parse failure rate > 10% (unreliable output)
- Error/timeout rate > 5% (unreliable availability)
- Factual accuracy score < 6.0 (hallucination risk too high)
- Balance/fairness score < 6.0 (partisan lean unacceptable for a nonpartisan guide)
- Candidate name mismatch rate > 5% (recommends people not on the ballot)

### 6.3 Model Routing Strategy

Rather than a single default, the experiment may reveal that a **routing strategy** is optimal:

| Scenario | Recommended Model |
|----------|-------------------|
| Default (English) | Winner of this experiment |
| Spanish guides | May need a different model if Spanish quality varies significantly |
| Budget mode / high traffic | Cheapest model scoring >= 7.0 composite |
| Premium mode (user opt-in) | Highest quality model regardless of cost |
| Fallback (rate limit / error) | Second-cheapest model scoring >= 7.0 composite |

### 6.4 Cost-Quality Tradeoff Visualization

Plot each model on a scatter chart:
- X-axis: Cost per guide (log scale)
- Y-axis: Composite quality score (0-10)
- Identify the **Pareto frontier** (models where no other model is both cheaper AND better).
- The default should be on the Pareto frontier.

### 6.5 When to Re-Run

Re-run this experiment when:
- A provider releases a significant model update (e.g., GPT-5, Claude 5, Gemini 3)
- A new provider/model becomes available (e.g., Llama via Groq)
- Pricing changes by more than 30% for any model
- The ballot data structure changes significantly (new election cycle, new races)
- 6 months have elapsed since the last run (model capabilities drift)

---

## 7. Appendix

### 7.1 Data Collection Format

Each result file (`results/{model}_{profile}_{run}.json`) should contain:

```json
{
  "model": "claude",
  "profile": "progressive_urban",
  "run": 1,
  "timestamp": "2026-02-27T15:00:00Z",
  "timing_seconds": 12.4,
  "http_status": 200,
  "error": null,
  "response": { ... },
  "parse_success": true,
  "truncated": false,
  "candidate_name_mismatches": [],
  "schema_complete": true,
  "cost_estimate": 0.042,
  "partisan_balance_score": { ... }
}
```

### 7.2 Existing Infrastructure Reuse

The experiment leverages these existing components:

| Component | File | What it provides |
|-----------|------|-----------------|
| `callLLM()` router | `pwa-guide.js:980` | Routes to all 8 models via a single `llm` parameter |
| `parseResponse()` | `pwa-guide.js:1176` | JSON parsing with sanitization and truncation repair |
| `scorePartisanBalance()` | `pwa-guide.js:1323` | Post-generation bias scoring |
| `computeExpAnalysis()` | `pwa.js:2933` | Agreement %, confidence, reasoning length comparison |
| `EXP_COST` | `pwa.js:1866` | Per-model pricing data |
| `LLM_META` | `pwa.js:2676` | Model names, colors, providers |
| `expGenerate()` | `pwa.js:2886` | Browser-based experiment runner (for manual validation) |
| Guide caching | `pwa-guide.js:136` | `?nocache=1` bypass for fresh LLM calls |
| Rate limiting | `index.js:7170` | 10 req/IP/min on guide endpoint |

### 7.3 Rate Limit Considerations

The guide endpoint is rate-limited to 10 requests per IP per minute. With 168 calls, running at 2-second intervals would hit the rate limit. Options:

1. **Temporarily increase the rate limit** for the experiment runner's IP (requires a code change to whitelist).
2. **Add a longer delay**: 7 seconds between calls stays under 10/min. This extends runtime to ~3.5 hours for all 168 calls.
3. **Run from the Cloudflare Worker itself** via an admin endpoint that bypasses rate limiting (preferred -- see section 7.4).

### 7.4 Admin Batch Experiment Endpoint (Recommended)

The most efficient approach is to add a new admin endpoint:

```
POST /api/admin/llm-experiment
Authorization: Bearer $ADMIN_SECRET
Content-Type: application/json

{
  "profiles": [...],
  "models": ["claude", "chatgpt", ...],
  "runs": 3
}
```

This endpoint would:
1. Bypass rate limiting (admin-authenticated).
2. Call `callLLM()` directly (no HTTP overhead).
3. Capture server-side timing (more accurate than client-side).
4. Capture actual token usage from API responses (not estimates).
5. Store results in KV under `experiment:` prefix with a TTL.
6. Return a summary with a link to detailed results.

This avoids all rate-limit and network-overhead issues and produces the most accurate metrics.

### 7.5 Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Rate limits from LLM providers (especially xAI, OpenAI) | Space calls 5+ seconds apart; run over 2-3 hours |
| Opus cost blowup (~$30 for 168 calls) | Run Opus with 1 repetition instead of 3, saving ~$20 |
| Ballot data changes mid-experiment | Run all calls within a single day before daily updater runs |
| Network variability affecting timing | Use median of 3 runs; note that server-side timing is more reliable |
| Human reviewer bias | Blind review protocol (anonymous model IDs) |
| Small sample size (3 runs) | Supplement with cross-model consensus analysis; flag results with high variance |

### 7.6 Expected Outcomes (Hypotheses)

Based on existing anecdotal data from the experiment page:

1. **Claude Sonnet** will likely score highest overall on quality + reasoning + accuracy, but at moderate cost.
2. **Claude Opus** will score highest on reasoning depth and factual accuracy, but its 5x cost premium may not justify the quality delta.
3. **GPT-4o** will be competitive with Claude Sonnet on quality, with similar cost.
4. **Gemini Flash** will be the cost leader (10x cheaper) with acceptable quality, making it the best "budget default" candidate.
5. **GPT-4o mini** will be cheapest but may struggle with JSON compliance and reasoning depth.
6. **Grok 3** may show partisan lean (trained on X/Twitter data) that hurts its balance/fairness score.
7. **Claude Haiku** will be the best speed/cost tradeoff within the Anthropic family.
8. **Gemini Pro** will compete with Claude Sonnet at slightly lower cost.

### 7.7 Success Criteria

The experiment is successful if it produces:

1. A clear ranking of all 8 models by composite score.
2. A justified recommendation for the default model (or confirmation that Claude Sonnet remains the best choice).
3. A Pareto frontier identifying the best cost-quality tradeoffs.
4. Per-profile insights about which models serve which voter types best.
5. A reusable automation framework for re-running the experiment when models update.

# Texas Votes TODO List

---

## Open

### Data & Content

#### County Ballot Gaps
_From data audit (Feb 23). All 254 counties now have ballot keys. Some have empty/failed data._

- [x] Seed 23 missing counties — all FIPS 48445-48507 now have ballot data in KV
- [x] Retry failed county ballots — Galveston (48167) and Jefferson (48245) both seeded successfully
- [x] Seed missing party ballots — Kaufman (48257), Nueces (48303), McLennan (48309), Gregg (48183) all now have both party ballots
- [ ] Re-seed empty county ballots — Randall (48381), Smith (48423), Archer (48009), Austin County (48015) have 0 races but real contested races exist. Seeder silently returned empty arrays. (Investigation documented in docs/plans/empty_county_investigation.md)

#### Statewide Candidate Data Gaps
_From data audit. 65 statewide candidates, most fields 95%+ filled._

- [x] Fill Michael Berlanga (R-Comptroller) data — added background, 6 key positions, 4 endorsements, polling (4% UH Hobby poll), fundraising (minimal), expanded pros to 5 and cons to 5. **WARNING: Live data still shows 0 pros / 2 cons as of Feb 23 — data was likely overwritten by daily updater before the min-pros validation was added. Needs re-patching via fix_balance_data.sh (see Balance of Pros/Cons P0 below).**
- [x] Fill sparse candidate data — 35 field updates across both ballots. Polling now 0% missing (was 25%), fundraising 0% (was 12%), endorsements 37% (was 40%, 24 candidates genuinely have none)
- [x] Add source citations to all candidates — Ballotpedia + TX SOS URLs added to all 65 statewide candidates

#### Precinct Maps
- [ ] Seed precinct maps for remaining top 30 counties — 10/30 done; ran script for remaining 20 but all returned empty (ZIP-to-commissioner-precinct data not available via web search for smaller counties). May need manual research or GIS data sources.

#### County Info
- [ ] Enrich county_info for remaining ~104 counties — elections websites, phone numbers, vote center status for smallest/rural counties. 150/254 now have real data, ~104 still have template info

#### Other Data Tasks
- [x] Fix seeding script error handling — added error classification (AUTH/RATE_LIMIT/SERVER/etc), KV-based progress tracking, failed steps NOT marked completed, `reset` option via API, auth errors abort immediately. 16 new tests (50 total).
- [x] Candidate contact outreach — research complete for 50+ candidates with campaign websites, contact emails, contact persons, Twitter/X handles (see docs/plans/candidate_contacts.md). Most campaigns require website contact forms rather than direct email.

### Features
- [ ] Show Share + Regenerate Summary buttons side by side on wide screens — currently stacked vertically on all screen sizes. Use flexbox row layout with media query so they display side-by-side on tablet/desktop but stay stacked on iPhone
- [ ] Design a candidate/community data submission system — allow candidates and others to submit data for races with limited info. Must be trusted, not spammable or gameable (needs verification/moderation design)
- [x] Add filter by county to candidates list — dropdown with All Counties / Statewide Only / per-county options, race count indicator, statewide races always visible per county, Spanish translations
- [ ] Make city/region support self-service — configuration-driven approach so any city/region can set up their own voting guide without code changes
- [ ] Create versions for runoffs and general election — support multiple election cycles beyond the primary (detailed plan at docs/plans/plan_runoff_general_election.md, 4-phase timeline March-October)
- [x] Add Related Links sections to transparency pages — add "Nonpartisan by Design" link to bottom of Data Quality page, and replicate the Data Quality page's Related Links section on AI Audit, Nonpartisan, and Open Source pages (cross-linking between all transparency pages)
- [ ] Create new txvotes repo in GitHub — fresh copy of the code without all the dev history
- [ ] **Plan Colorado expansion** — Enter planning mode and figure out how to expand the platform to Colorado. Research CO election structure, counties, ballot format, data sources, and what needs to change in the codebase (multi-state routing, KV key namespacing, branding, etc.). Write the plan to `docs/plans/plan_colorado_expansion.md`.
- [ ] **Plan Washington DC primaries** — Enter planning mode and figure out how to support DC primaries. Research DC election structure, wards, ANCs, ballot format, data sources, and codebase changes needed (DC has no counties, unique local government structure). Write the plan to `docs/plans/plan_dc_primaries.md`.
- [ ] Show website traffic stats publicly — expose a public-facing page with site traffic/usage stats (currently only visible via admin analytics at `/admin/analytics`)
- [ ] Design a public stats page — show as much activity and usage data as possible without being a security risk (traffic, guides generated, LLM usage, county coverage, etc.)
- [ ] Fix happy-dom test errors — `interview-flow.test.js` and `interview-edge-cases.test.js` fail with "Cannot find package 'happy-dom'" when running via `npx vitest`. Need to install happy-dom as a dev dependency or fix vitest config.
- [ ] **Verify all public-facing pages are fully translated to Spanish** — Fetch raw HTML output of every public page with `?lang=es` and check for untranslated English strings. Systematic audit of all `data-t` attributes vs TR dictionaries.
- [ ] **Simplify ballot page top section** — The area above the race cards is getting too busy: AI disclaimer box + AI Limitations text + Cheat Sheet/Share buttons + "Spread the word" CTA all stack up. Consolidate or collapse some of these elements to reduce clutter before users reach the actual races.
- [ ] **Translate all remaining English on Spanish pages** — Multiple static pages (`/how-it-works`, `/nonpartisan`, `/audit`, etc.) have large blocks of English body text when viewed with `?lang=es`. The headings are translated but many paragraph bodies, bullet points, and descriptions remain in English. Affected pages visible in screenshots: "What Does This App Do?" section body text, "How It Works" step descriptions, source list bullets, nonpartisan safeguards text, AI audit descriptions, balance check explanations, "Flag this info" section, data transparency section, and source ranking policy details.
- [ ] **Use neutral Spanish dialect in all AI prompts** — Instruct all Spanish translation prompts (guide generation, candidate translations, summary generation) to use a neutral/standard Latin American Spanish dialect accessible to the broadest audience (avoid region-specific slang, use "usted" forms where appropriate, prefer universally understood vocabulary). Update `SYSTEM_PROMPT`, `buildUserPrompt()`, and `handleSeedTranslations()` prompt instructions in `pwa-guide.js`.
- [ ] **Update existing KV-cached translations to neutral dialect** — Re-run `POST /api/election/seed-translations` for both parties (and any county translations) after updating the prompts to regenerate all cached Spanish candidate translations in the neutral dialect. Verify via the app with `?lang=es`.

### Audit Score Improvements
_Latest audit (Feb 23): ChatGPT 7.5, Gemini 7.5, Claude 8.2, Grok 7.8 (avg 7.8/10). Dimension averages: Bias 8.3, Accuracy 7.0, Framing 8.0, Pros/Cons 7.3, Transparency 9.3. Lowest: Accuracy (7.0) and Pros/Cons (7.3)._

- [ ] Add human spot-checking of AI-generated candidate data — manual review process for AI-generated summaries, pros/cons, and endorsements to catch errors
- [x] Add automated balance checks for pros/cons — balance-check.js module, /api/balance-check endpoint, integrated into data quality dashboard (53 tests)
- [x] Surface collected pros/cons directly in recommendation output — strengths (green) and concerns (orange) boxes in ballot recommendation view
- [x] Create simplified transparency page for non-technical users — /how-it-works with 4-step walkthrough, plain language, linked from all transparency pages
- [x] Add user-facing error/bias reporting mechanism — "Flag this info" button on candidate cards, modal with issue types, sends to flagged@txvotes.app
- [x] Implement automated bias test suite — same voter profile with swapped party ballots, measure recommendation shifts and flag asymmetries. Publishable evidence of fairness. (61 tests, 5 voter profiles, 4 reusable helpers — see docs/plans/plan_bias_test_suite.md)

#### Factual Accuracy (7.0/10 — lowest dimension, all four auditors scored 7)

- [ ] Add cross-referencing against Ballotpedia/Vote Smart — verify AI-generated candidate positions, endorsements, and backgrounds against established independent databases before publishing. *Flagged by: Claude. Improves: Accuracy.*
- [ ] Create fallback to verified static datasets — when AI web search fails, returns contradictory results, or contradicts official filings, automatically fall back to pre-verified data from official sources (SOS filings, county clerk records). *Flagged by: Grok, synthesis. Improves: Accuracy.*
- [x] Add AI limitations disclaimer on recommendation pages — persistent footer on ballot view: "Recommendations are AI-generated from web sources and may contain errors or outdated information. Always verify candidate positions through official sources before voting." Spanish translation included. *Flagged by: Grok. Improves: Accuracy, Transparency.*
- [x] Enhance error logging for AI search failures — `ErrorCollector` class with 8 categories, `detectLowQualitySources()`, wired into daily updater at 8 capture points. `GET /admin/errors` dashboard with 7-day overview. KV persistence with 14-day retention. 33 new tests. *Flagged by: Grok, ChatGPT. Improves: Accuracy.*
- [ ] Add per-data-point confidence indicators — flag individual candidate fields (positions, endorsements, fundraising) as "verified" vs "AI-inferred" based on source quality tier. Show this to users on candidate profile pages. *Flagged by: Gemini, Claude. Improves: Accuracy, Transparency.*

#### Balance of Pros/Cons (7.3/10 — second-lowest dimension)

_Current balance score: 78/100 (Republican 70, Democrat 85). Up from 51/100 after fix_balance_data_v2.sh patched 19 candidates on production (Feb 24). Remaining flags: 6 warning-level specificity_gap on Republican (all District 10 candidates), 3 warning-level specificity_gap on Democrat (Hinojosa, Bell, Moore)._

##### P0: Run the existing fix script (+15 pts Republican)
- [x] Execute fix_balance_data.sh to patch KV data — fix_balance_data_v2.sh created and run on production. 19 candidates patched (11 Dem, 8 Rep). Combined score 51→78. All critical flags eliminated.

##### P1: Fix Democrat specificity gaps (+20 pts Democrat)
- [x] Rewrite Gina Hinojosa (D-Governor) pros with specific references — 5 new specific pros added via fix_balance_data_v2.sh (years served, SB 1 opposition, editorial endorsements, school board tenure). Specificity_gap warning persists due to low specificity indicators in text.
- [x] Rewrite Vikki Goodwin (D-Lt Governor) pros with specific references — 5 new specific pros added (term count, Appropriations Committee, MPA from UT, fundraising $159K).
- [x] Rewrite Donna Howard (D-State Rep 48) pros with specific references — 5 new specific pros added (tenure since 2006, nursing career, UT degree).
- [x] Fix Sarah Eckhardt (D-Comptroller) cons with specific references — 5 new pros + 4 cons added. Count_imbalance and length_imbalance flags eliminated.

##### P2: Equalize pros/cons word counts to fix sentiment_asymmetry (-36 pts at stake)
- [x] Expand terse Democrat pros to 8-12 words each — All 11 candidates patched via fix_balance_data_v2.sh (Crockett, Hassan, Hinojosa, Bell, Goodwin, Head, Eckhardt, Casar, Tovo, Garibay, Howard). Democrat score 36→85.
- [x] Expand terse Republican pros to match cons word length — 8 candidates patched (Berlanga, Patrick, Huffines, Miller, Middleton, Wright, Sharon, Brown). Republican score 65→70.

##### P3: Tune balance-check.js thresholds (alternative to P2 data fixes)
- [x] Raise sentiment_asymmetry word count ratio threshold from 1.5x to 2.0x — threshold was already at `> 2.0` in balance-check.js. Also requires absolute difference >= 3 words. Test updated to verify.
- [x] Raise specificity_gap ratio threshold from 3.0x to 5.0x for info-level flags — threshold was already at `>= 5` in balance-check.js. WARNING-level thresholds (when one side is entirely 0) unchanged. Test updated and new test added verifying 4x ratio does NOT trigger info flag.

##### Previously identified items (updated status)
- [x] Add qualitative sentiment scoring to balance checks — implemented in balance-check.js: `analyzeSentiment()` with strong positive/negative/hedging word detection, `checkCandidateBalance()` flags sentiment_asymmetry at info/warning levels. 53 tests. *Flagged by: ChatGPT, Claude. Improves: Pros/Cons.*
- [x] Set actionable thresholds for mandatory balance correction — `getCandidatesNeedingRebalance(ballot)` function added to balance-check.js. Scans ballot for candidates with CRITICAL flags (missing_pros, missing_cons, missing_both) and returns structured results for automatic re-research. Updater already integrates `checkSingleCandidateBalance()` with auto-correction up to MAX_BALANCE_CORRECTIONS_PER_RUN=10 per daily run. 8 new tests. *Flagged by: Grok. Improves: Pros/Cons.*
- [x] Publish per-race balance check results on data quality page — "Balance by Race" section on /data-quality page shows per-race scores with color coding, expandable per-candidate scores, flag counts by severity, and overall party balance scores. Links to raw JSON at /api/balance-check. Spanish translations included. 9 new tests in routes.test.js. *Flagged by: Grok. Improves: Pros/Cons, Transparency.*
- [x] Add specificity and verifiability scoring to pros/cons — implemented in balance-check.js: `scoreSpecificity()` with 20+ indicator patterns, `scoreSpecificityArray()`, `matchesGenericPhrase()` with 57 known generic phrases. Flags specificity_gap and generic_content. 53 tests. *Flagged by: Gemini. Improves: Pros/Cons, Accuracy.*
- [x] Fix existing critical balance flags before March 3 — All critical flags eliminated. Berlanga now has 5 pros. fix_balance_data_v2.sh run on production Feb 24. Combined balance score 51→78. *Flagged by: balance-check.js. Improves: Pros/Cons.*

#### Framing & Bias (8.0/10 and 8.3/10 — moderate)

- [x] Audit policy deep-dive option wording for parallel structure — rebalanced all 20 deep-dive topics: replaced "Balanced" labels with neutral "Mixed"/"Combined"/"Accommodate both"; replaced biased "reform" in Criminal Justice question; added "Expand gun rights" and "Strengthen law enforcement" options so conservative positions get equal representation; fixed "tax burden" loaded language; expanded pithy descriptions for equal word counts; synced TR dictionary and audit export (index.js). All 1217 tests pass. *Flagged by: Claude, Grok, Gemini, synthesis. Improves: Framing.*
- [x] Restrict novelty tones on recommendation screens — prominent amber warning banner on ballot page when Cowboy active. "Switch to Standard" button regenerates guide in neutral tone. Dismissible but re-appears on each visit. Spanish translations. *Flagged by: Grok, ChatGPT (original audit). Improves: Framing.*
- [x] Add post-generation partisan balance scoring — `scorePartisanBalance()` in pwa-guide.js with confidence distribution, incumbent/challenger bias, pro/con text analysis, 4 flag types. Runs after every guide generation. Comprehensive tests.


### Code Review Findings (PR #2)

_From automated code review of "Add automated AI audit runner" (interview-flow-tests branch)._

- [x] **[P0]** Fix `_pickedIssues`/`_pickedQuals` restoration bug — persist picked counts in save(), restore before padding in load()
- [x] **[P1]** Update CLAUDE.md test count — updated to 581 tests across 10 files with per-file breakdown
- [x] **[P1]** Add `audit-runner.js` to CLAUDE.md Architecture section
- [x] **[P1]** Add new test files to CLAUDE.md — all 10 test files listed with counts
- [x] **[P1]** Update CLAUDE.md reading level docs — added level 7 (Texas cowboy)
- [x] **[P2]** Fix county seeder source attribution — scoped per-candidate, matching updater.js pattern
- [x] **[P2]** Remove dead code in `validateRaceUpdate` — removed unreachable dedup/cap checks
- [x] **[P2]** County seeder bypasses `validateRaceUpdate` — now validates before KV writes
- [x] **[P3]** Election Day cache invalidation timing — skip cache invalidation on Election Day to avoid peak-load rebuilds

### PWA Bugs
- [x] Back button on first "Talk to Me" page doesn't work — Phase 0 now renders welcome screen, back from Phase 1 returns to it
- [x] Phase 0 should render the website home page, not the welcome screen — Phase 0 now redirects to landing page (/), ?start=1 auto-advances to Phase 1
- [x] Error 1101 on /data-quality page — `updateLog.log` is an array but code called `.match()` expecting a string. Fixed array/string handling, added try/catch safety net.
- [x] County filter on /candidates page not filtering — county ballot data in KV was missing `countyName` field. Fixed by extracting FIPS from KV key name and looking up county name. Travis County now appears.
- [x] Ballot page footer showed "Nonpartisan by Design · Privacy Policy · v25" — changed to "Texas Votes · How It Works · Privacy"

### Daily Updater & Freshness
- [ ] Add county ballots and voting info to daily updater refresh — currently only statewide races are auto-updated; county ballots, county_info, and precinct maps are seeded once and never refreshed
- [ ] Design a post-Election Day site and have it ready to automatically switch when the polls close — currently the site shows stale "March 3, 2026" messaging with no post-election UX, no runoff messaging, no results. After election ends, app still shows "Vote Now" CTAs and generates guides for concluded races.
- [x] Put more accurate text for unseeded county polling hours — replaced Travis County-specific fallback with generic statewide text ("Early voting hours vary by county")

### Security (Brad Feld external assessment, Feb 24)
_External black-box assessment of txvotes.app public surface. No source code access, no active exploitation. Ranked by severity._

#### Pre-Election (fix before March 3)
- [x] **[S1] Rate-limit guide generation API (HIGH)** — Per-IP rate limiting added to /app/api/guide and /app/api/summary (10 req/IP/min). KV-based tracking with auto-expiring keys. Returns 429 with Retry-After. Fails open on KV errors. rate-limit.js module with 24 tests. Deployed.
- [x] **[S2] Remove verbatim system prompts from /api/audit/export (HIGH)** — New `buildPublicAuditExportData()` serves redacted export: prompts replaced with methodology summaries, model versions genericized, tone injection text removed. Internal `buildAuditExportData()` unchanged for audit runner. 62 tests updated. Deployed.
- [x] **[S7] Add security.txt disclosure policy (LOW-MEDIUM)** — `/.well-known/security.txt` returns RFC 9116 compliant response with security@txvotes.app contact, expiry, canonical URL, and policy link. 5 new tests. Deployed.

#### Post-Election
- [ ] **[S3] Harden daily updater against data poisoning (MEDIUM-HIGH)** — The updater uses Claude web_search to refresh candidate data. The audit export documents exact source hierarchy and validation thresholds. An attacker could create SEO-optimized fake pages to inject false endorsements, polling, or positions that persist in KV. Fix: cross-reference AI search results against a known-good source allowlist.
- [ ] **[S4] Prevent KV key enumeration (MEDIUM)** — The audit export reveals KV key patterns (`ballot:statewide:{party}_primary_2026`, `county_info:{fips}`). If any endpoint accepts KV keys as parameters, an attacker could enumerate all stored data. Fix: audit all endpoints that read KV keys for user-supplied input, restrict to known patterns.
- [ ] **[S5] Validate and sanitize event tracking endpoint (MEDIUM)** — `/app/api/ev` accepts arbitrary POST data with no auth or input validation. If event data renders in admin dashboards without sanitization, this is a stored XSS vector. Also allows analytics poisoning. Fix: validate event schema, sanitize before rendering.
- [ ] **[S6] Audit Census geocoder proxy for SSRF/logging (MEDIUM)** — The Worker proxies addresses to the Census Bureau Geocoder. If the address parameter isn't validated server-side, minor SSRF risk exists. If any logging misconfiguration exists, addresses could be retained unintentionally. Fix: validate address input, verify no logging of PII.
- [ ] **[S8] Mitigate client-side data tampering on shared computers (LOW)** — All user data in localStorage. On shared computers (libraries, kiosks), an attacker could pre-load manipulated ballot data so the next user sees biased recommendations. Fix: integrity check on stored data, or session-based storage.
- [ ] **[S9] Add security headers (CSP, X-Frame-Options) (LOW)** — Missing or unverified Content-Security-Policy, X-Frame-Options, and other security headers. The app could be embedded in an iframe on a phishing site (clickjacking) or be vulnerable to inline script injection. Fix: add proper security headers in the Worker response.

### Staleness & Caching (from audit)
_Audit found 12 stale data risks across KV, service worker, localStorage, and daily updater._

#### HIGH
- [x] **[H1]** Add TTL to `candidates_index` KV cache — `expirationTtl: 3600` (1 hour)
- [x] **[H2]** PWA ballot refresh now merges county races — detects new races by office|district key and appends them
- [x] **[H3]** Deduplicate statewide + county race merge in guide generation — filters by office|district before concat

#### MEDIUM
- [x] **[M1]** Use manifest version for cache invalidation — addressed by H1 TTL
- [x] **[M2]** Service worker cache expiration — stale fallbacks (>1hr) discarded; API responses remain network-only
- [x] **[M3]** Post-election cache auto-transition — addressed by H1 TTL + M2

#### LOW
- [x] **[L1]** Add staleness warning to localStorage data — banner "Your ballot data may be outdated. Tap to refresh." after 48 hours
- [x] **[L2]** Add TTL to county_info KV writes — `expirationTtl: 604800` (7 days)
- [x] **[L3]** Add TTL to precinct_map KV writes — `expirationTtl: 2592000` (30 days)
- [x] **[L4]** Reduce PWA manifest cache duration — `max-age=3600` (1 hour)

### Truncation Detection & Prevention
_After the max_tokens outage (Feb 23). LLM responses were truncated at 2048 tokens, causing "Unterminated string in JSON" errors. Fixed by raising to 4096 and adding stop_reason checks. These items prevent recurrence._

#### Immediate
- [x] **Add token utilization logging (warn at 75%+)** — Implemented in callClaude, callOpenAICompatible, and callGemini in pwa-guide.js. Logs output token utilization % and warns when >75% of max_tokens.
- [x] **Cap pros/cons to 5 items in buildCondensedBallotDescription** — Implemented in pwa-guide.js: c.pros, c.cons, endorsements, keyPositions limited to .slice(0, 5).
- [x] **Surface specific error messages in PWA client** — PWA now displays specific error messages from repResult.error/demResult.error when available.

#### Short-term
- [x] **Add repairTruncatedGuide() for partial JSON recovery** — Implemented in pwa-guide.js. Finds last complete race object in truncated JSON, reconstructs valid JSON. parseResponse() attempts repair before throwing. Marks with _truncated: true.
- [x] **Show ballot size metric on /data-quality page** — Token budget section added to handleDataQuality() in index.js with condensed ballot char count per party, estimated prompt tokens, remaining output budget, and warnings.
- [x] **Add large-ballot test fixture and token budget audit test** — Large-ballot fixture created in tests/fixtures/. token-budget.test.js validates buildCondensedBallotDescription output fits within max_tokens with headroom. Truncation-specific parseResponse tests added.

#### Medium-term
- [x] **Auto-retry with higher max_tokens on truncation** — Implemented in callClaude, callOpenAICompatible, and callGemini. When stop_reason is "max_tokens" and maxTokens < 8192, retries once with doubled limit (capped at 8192).
- [x] **Add post-update ballot size checks to updater and county-seeder** — Ballot size logged via buildCondensedBallotDescription after KV writes. Warns if >6000 estimated tokens. stop_reason checks added to LLM callers.

### Monitoring & Alerts
- [x] Design a way to get notified about app problems — implemented /health public endpoint (5 checks: KV, ballots, cron freshness, audit freshness, API key), /admin/status dashboard, Discord webhook alerting, cron health checks. 28 new tests. Deployed.

### API Usage Optimization
_From Claude API usage review (Feb 22). Recurring cost ~$26/month (updater $20 + audit $5.70). Per-guide cost $0.02-$0.07._

#### High Impact
- [x] Cache Spanish candidate translations in KV — `loadCachedTranslations()` checks KV before guide generation. `POST /api/election/seed-translations` admin endpoint seeds translations. Saves ~$0.030 per Spanish guide (~40% reduction). 25 new tests.
- [x] Reduce daily updater frequency for stale races — staleness tracking via `stale_tracker` KV key; races with 3+ consecutive null updates switch to every-3-days. Lower-ballot races use max_uses=3. 24 new tests. Saves ~$12/month.
- [ ] Consider Gemini 2.5 Flash as default guide LLM — 10x cheaper input, 6x cheaper output ($0.30/$2.50 vs $3/$15). Guide cost drops from ~$0.042 to ~$0.006. Needs quality validation and A/B testing. Users can already select Gemini manually.

#### Medium Impact
- [x] Log actual token usage from API responses — usage-logger.js module tracks input/output tokens per component (guide, updater, seeder). `GET /api/admin/usage?date=YYYY-MM-DD` endpoint with cost estimates.
- [x] Enable Anthropic prompt caching for guide generation — system prompt uses `cache_control: { type: "ephemeral" }`. No beta header needed (GA). Both guide and summary endpoints benefit.
- [x] Batch tone regeneration after daily updates — `didCandidateTextChange()` detects modifications, `generateCandidateTone()` regenerates levels 1/4/7 with 2s delays. ~$0.036/candidate.

#### Post-Election
- [ ] Architecture review for general elections — more races, more candidates, higher traffic. May need response caching (cache guide responses by profile hash for 1 hour).

### Ballot Generation Speed
_From speed optimization research (Feb 23). Current guide generation takes 10-30+ seconds._

**Current architecture:** Client fires two parallel `fetch('/app/api/guide')` calls (one per party). Each call: 2-3 sequential KV reads (statewide ballot, county ballot, manifest) → build condensed ballot text → single LLM call (claude-sonnet-4-6, max_tokens 4096/8192 for Spanish) → parse JSON → merge → partisan balance scoring → return. No streaming, no caching, no pre-computation of prompt content.

#### Streaming & Perceived Latency
- [ ] **Stream LLM responses to client via SSE** — Currently the worker waits for the entire LLM response before returning anything (~8-20s of silence). Switch to Server-Sent Events (SSE) so the client can show partial JSON (e.g., profileSummary and first few races) as they arrive. Requires: streaming API calls (Anthropic supports `stream: true`), chunked SSE relay in the worker, incremental JSON parsing on the client. _Estimated: perceived time-to-first-content drops from 10-20s to 2-4s. Total wall-clock unchanged but feels dramatically faster._
- [ ] **Show per-race results as they stream in** — As each race recommendation streams from the LLM, parse and render it immediately in the loading screen. Voter sees races populating one-by-one like a live feed. Pairs with SSE above. _Estimated: perceived wait drops to ~2s for first race card._

#### Model Choice
- [ ] **Default to Gemini 2.5 Flash for guide generation** — Already wired up as an option (`llm=gemini`). Gemini Flash is significantly faster (typically 2-5s vs 8-15s for Sonnet) and 10x cheaper. Needs A/B quality validation: generate 20 guides with both models, compare recommendation quality, reasoning depth, and JSON compliance. If quality is acceptable, make it the default with Claude as fallback. _Estimated: 5-10s reduction in wall-clock time per party ballot._
- [ ] **Use Claude Haiku 3.5 as a fast fallback** — When Sonnet is rate-limited or overloaded (429/529), fall back to Haiku instead of retrying the same slow model. Haiku is ~3x faster than Sonnet with acceptable quality for recommendation generation. Add to MODELS array as a third option. _Estimated: eliminates 5-15s retry delays on overload._

#### Prompt Size Reduction
- [x] **Strip pros/cons/endorsements from uncontested races** — Uncontested races now only include candidate name + incumbent status. 20-30% token reduction for ballots with 5+ uncontested races.
- [ ] **Truncate endorsement lists to top 3 per candidate** — Some candidates have 8+ endorsements in the ballot data, all serialized into the prompt. Cap at 3 most notable endorsements. _Estimated: 0.5-1s from token reduction on endorsement-heavy ballots._
- [x] **Pre-filter ballot before building description** — `filterBallotToDistricts()` already runs before `buildCondensedBallotDescription()` in the correct sequence. District races are filtered out when districts are provided.

#### KV Read Optimization
- [x] **Parallelize KV reads in handlePWA_Guide** — `Promise.all()` for statewide + legacy + county + manifest reads. Eliminates 2-4 sequential round trips. Manifest now loads at start instead of after LLM call.
- [x] **Eliminate legacy fallback KV read** — Legacy `ballot:{party}_primary_2026` keys deleted from KV, fallback code removed from index.js and updater.js.

#### Response Caching
- [x] **Cache guide responses by profile hash** — SHA-256 hash of voter profile + ballot data. KV cache with 1-hour auto-expiry. `?nocache=1` bypass. Cache hits return instantly (~50ms vs 10-20s). Deterministic key includes sorted issues/qualities, readingLevel, llm, lang, and ballot race/prop fingerprints.
- [x] **Cache the condensed ballot description string in KV** — Implemented: `buildCondensedBallotDescription()` output cached in KV keyed by `ballot_desc:` + SHA-256 hash, 1-hour TTL. Cache hit/miss logged.

#### max_tokens Tuning
- [x] **~~Reduce max_tokens for English guides from 4096 to 2048~~** — Current values: 2048 English, 4096 Spanish cached, 8192 Spanish fresh. Auto-retry with doubled max_tokens on truncation now handles edge cases. stop_reason/finish_reason truncation detection added to all 3 LLM providers.

#### Architecture Changes (Higher Effort)
- [ ] **Pre-generate guide skeletons at ballot update time** — When the daily updater refreshes ballot data, pre-generate ballot descriptions and cache them. At guide time, the LLM call only needs the voter profile + pre-built ballot text, skipping all ballot-building logic. _Estimated: 50-100ms savings on worker CPU, main benefit is code simplicity._
- [ ] **Split guide generation into parallel per-category LLM calls** — Instead of one big prompt with all races, split into 3-4 parallel calls: federal races, state executive, judicial, local. Each call has a smaller prompt and returns faster. Merge results on the worker. Risk: more API calls = more rate limit exposure, and profileSummary must be generated separately. _Estimated: wall-clock could drop 30-50% (from max-of-parallel vs sum-of-sequential), but adds complexity and error handling._

### Memory Management
_From memory management review (Feb 22). 13 issues found across localStorage, service worker cache, KV retention, and state cleanup._

#### Quick Wins
- [x] Fix reset to remove orphaned localStorage keys — added 6 missing removeItem calls (data_updated timestamps + 4 LLM compare keys)
- [x] Clean up legacy `atx_votes_*` keys after migration — already implemented; migration block deletes all 6 atx_votes_* keys after copying
- [x] Remove dead mascot timer code — removed empty stubs, setTimeout call, and 2 stopMascotTimer() calls

#### Pre-Election Polish
- [x] Add localStorage quota warning — QuotaExceededError detection and toast already existed; added missing Spanish translation
- [x] Simplify service worker registration — replaced 8-line nuclear unregister-all pattern with single register() call. skipWaiting() + Cache-Control: no-cache suffice.
- [x] Delete legacy KV ballot keys — both legacy keys deleted from KV, fallback code removed from index.js

#### Post-Election Prep
- [x] Add election-cycle expiration to localStorage — `electionExpired` state flag, yellow banner with "Clear & Start Fresh" / "Keep for Reference" buttons, triggers 7 days after election date. Spanish translations included.
- [x] Build KV cleanup admin endpoint — `POST /api/admin/cleanup` with ADMIN_SECRET, cursor-paginated KV enumeration, 16 category buckets, 14-day stale detection. Dry-run by default. 32 tests.
- [x] Cap update and audit log retention — both updater.js and audit-runner.js now delete logs older than 14 days after writing new ones
- [x] Expand manifest with election-cycle metadata — added electionCycle, electionDate, schemaVersion fields (backward compatible)

### Infrastructure

- [ ] Replace atxvotes-api worker with Cloudflare redirect rule — atxvotes.app only does 301 redirects to txvotes.app now (cron moved to usvotes-api). Replace the worker with a Cloudflare Bulk Redirect rule to eliminate the redundant worker entirely.
- [ ] Rename txvotes-api worker to usvotes-api in Cloudflare dashboard — config already uses `usvotes-api` but deploying requires the old name since `txvotes-api` owns the routes. Unassign routes from `txvotes-api` in the dashboard, then deploy with `usvotes-api` name. Temporarily reverted in wrangler.txvotes.toml to keep deploys working.

### Collaboration Readiness

#### Branch Protection (P0)
- [x] Enable branch protection on `main` — require pull requests (no direct pushes), require at least 1 review before merging, require status checks to pass

#### CI / Automated Testing (P0)
- [x] Add GitHub Actions workflow (`.github/workflows/test.yml`) — runs `vitest run` on every PR and push to main. Blocks merge if tests fail.

#### Secrets Audit (P1)
- [ ] Add `.env*` to `.gitignore` — repo is public, no `.env` entry exists yet. Prevents accidental secret commits.
- [ ] Verify `CF_BEACON_TOKEN` in `wrangler.toml` is acceptable to have in plaintext — it's a low-risk analytics beacon token, but confirm it's not sensitive. All real secrets go through `wrangler secret put`.

#### Contributor Onboarding Docs (P1)
- [ ] Add CONTRIBUTING.md or expand README with partner onboarding — how to get Cloudflare/Anthropic API keys for local dev, which wrangler config to use (`-c wrangler.txvotes.toml` footgun), PR workflow (feature branches → PR → review → merge), how to run tests locally.

#### Deploy Process (P2)
- [ ] Agree on deploy rules — who can deploy, deploy from main only, manual vs CI-triggered deploys. Currently anyone with `npx wrangler deploy` access can push to production. Consider adding a deploy step to GitHub Actions that triggers on merge to main.

---

## Done

<details>
<summary>Data & Content (16 resolved)</summary>

- [x] Expand coverage to all of Texas — generalize beyond Austin/Travis County to support all Texas counties, districts, and races statewide
- [x] Add statewide issues: Gun Rights/Safety, Abortion/Reproductive Rights, Water Rights/Scarcity, Agriculture/Rural Issues, Faith/Religious Liberty
- [x] Broaden deep dives for rural Texas — Housing (property rights/taxes vs density), Transportation (rural roads vs light rail), Immigration (remove Austin city-council framing)
- [x] Add candidate qualities: Faith & Values, Business Experience
- [x] Data coverage dashboard — `/admin/coverage` shows candidate completeness, tone variants, county info, and county ballot coverage across all 254 counties
- [x] Fix district resolution — Census geocoder + filterBallotToDistricts() already work; fixed by populating county ballot data and moving Travis races out of statewide
- [x] Move Travis County races out of statewide ballot — Commissioner Pct 2/4 moved to `ballot:county:48453:democrat_primary_2026`
- [x] Fill missing headshots — all 73 statewide candidates now have .jpg headshots
- [x] Remove Polymarket stats — remove prediction market odds from the app
- [x] Pre-generate candidate tone variants — summary/strengths/concerns for all 73 statewide candidates across 7 tones
- [x] Seed county_info for all 254 counties — basic template data (early voting hours, Election Day hours, TX SOS links) for every county
- [x] Enrich county_info for top 30 counties — real elections websites, phone numbers, vote center status from verified sources
- [x] Enrich county_info for counties 31-130 — 75 more counties updated with real elections websites, phones, vote center status
- [x] Seed precinct maps for top 10 counties — 534 ZIP-to-commissioner-precinct mappings uploaded to KV, GIS-verified for 8 of 10 counties
- [x] Create statewide ballot keys — `ballot:statewide:{party}_primary_2026` created from legacy keys
- [x] Fix Andrew White withdrawal — marked as withdrawn in Democrat governor race (dropped out Jan 5, 2026, endorsed Hinojosa)

</details>

<details>
<summary>PWA Bugs (8 resolved)</summary>

- [x] Proposition explanations not translated
- [x] Proposition badges not translated
- [x] Profile summary not translated
- [x] Language switcher low contrast in dark mode
- [x] Spanish nav tab labels wrapping
- [x] White screen on first deploy
- [x] "Station" Easter egg
- [x] Race card navigation always goes to senate race

</details>

<details>
<summary>PWA Improvements (31 resolved)</summary>

- [x] Service worker cache-first → network-first
- [x] Tab bar not visible
- [x] Tab icons match iOS
- [x] Landing page: link to web app
- [x] Custom print cheat sheet
- [x] Recommendation badge wrapping
- [x] Desktop top nav
- [x] Dismissible disclaimer
- [x] Race cards — candidate count and chevron
- [x] Footer links on all pages
- [x] Enhanced Voting Info page
- [x] Cheat sheet party switcher
- [x] Election info header card
- [x] Candidate cards redesign
- [x] Proposition cards redesign
- [x] Address form privacy note
- [x] Qualities picker icons
- [x] Address verification
- [x] Candidate descriptions full-width
- [x] Candidate photos / headshots (60/62 found)
- [x] Proposition Spanish translations
- [x] Ballot race card headshots
- [x] Free-form "Anything else?" field
- [x] Tug-of-war loading animation
- [x] Cheat sheet print layout bigger
- [x] Footer links on all static pages
- [x] Translate candidate ballot data for Spanish
- [x] Headshots on uncontested race cards
- [x] Skip welcome screen from landing page
- [x] Remove "Print" from cheat sheet button
- [x] Spanish language toggle on landing page

</details>

<details>
<summary>PWA Features (15 resolved)</summary>

- [x] PWA web app (single-page app, no build step)
- [x] Server-side guide generation via Claude API
- [x] Background ballot refresh
- [x] Send Feedback + credits on profile
- [x] "I Voted" tracking and sticker
- [x] Spanish translation / i18n (200+ strings)
- [x] Regenerate profile summary
- [x] Accessibility (ARIA, keyboard nav, reduced motion)
- [x] Candidate profile page — `/candidates` directory with side-by-side R/D columns, `/candidate/:slug` detail pages
- [x] Fireworks animation after "I Voted"
- [x] Make the app more patriotic visually
- [x] Make the app more viral — share buttons, Web Share API
- [x] Volunteer opportunities near you
- [x] Post-voting share prompt
- [x] Swedish Chef easter egg

</details>

<details>
<summary>UI/UX (20 resolved)</summary>

- [x] Fix progress bar animation
- [x] Reading level slider on profile
- [x] Wider content area on desktop
- [x] Ballot page overflows on iPhone
- [x] "Use my location" is broken
- [x] Update researching loading screen main text based on tone 6 and 7
- [x] Apply tone to AI personal summary on profile page
- [x] Put "Texas Votes (Cowboy)" in the title of the link for vanity URLs
- [x] Fix back button on /cowboy and /chef
- [x] Always show a back button in the interview flow
- [x] Race card description text doesn't use full card width on desktop
- [x] Geolocate button to auto-fill address
- [x] Balance loading screen timing
- [x] Fix formatting on static pages (iPhone 17 Pro)
- [x] Put Texas flag on the home page
- [x] Red/white/blue loading stars — replaced blue dot progress indicators with alternating red, white, and blue star animations
- [x] Remove progress bar — dropped red-to-blue progress bar, kept only flashing stars during guide generation
- [x] Footer stars white — changed red accent stars next to "Made in Texas" to white in both static pages and PWA footers
- [x] Home page text cleanup — split "Works on any device / No app download needed" into two lines, simplified privacy line to "No personal data collected"
- [x] iPhone width overflow fixes — 18 CSS fixes (min-width:0, overflow-wrap, flex-wrap, table-layout:fixed) to prevent horizontal scrolling on small screens

</details>

<details>
<summary>Features (31 resolved)</summary>

- [x] Bigger easter egg emoji bursts — doubled font-size (40-88px) for cowboy/bork
- [x] Fireworks "I Voted" animation — 8 staggered shells, patriotic colors, burst particles
- [x] Sample ballot page — /sample with R/D switcher, 12 race cards, propositions, SAMPLE watermark
- [x] Confidence explanations — "Why this match?" matchFactors per candidate
- [x] Source ranking policy — 7-tier hierarchy in AI prompts, documented publicly
- [x] Issue list expansion — added Criminal Justice, Energy & Oil/Gas, LGBTQ+ Rights, Voting & Elections (21 total)
- [x] LLM choice — URL flags for alternate LLMs (?gemini, ?grok, ?chatgpt) + hidden debug/comparison view
- [x] Cowboy & Swedish Chef easter eggs — type "yeehaw" for Cowboy, "bork" for Swedish Chef on profile page
- [x] Remove Candidates link from footer — contextual links per page (4-6 links, no self-links)
- [x] Smart contextual footers — all 12 page footers redesigned with relevant cross-links
- [x] Priority picker "−" button — visible minus on filled slots, complements "+" on pool items
- [x] Sample ballot page — /sample with fictional races, SAMPLE watermark, R/D context
- [x] Source citations — capture URLs from Claude web_search responses, display on profiles and ballot
- [x] Endorsement context labels — structured {name, type} with 9-category taxonomy
- [x] Data quality dashboard — /data-quality with freshness, coverage, completeness, county checker
- [x] Limited data badges — isSparseCandidate() shows badge when pros/cons/endorsements sparse
- [x] Normalized interview labels — editorial pass on all 16 deep dive options, symmetric language
- [x] Data Last Verified timestamps — fmtDate() shows last-updated date on ballot page
- [x] County coverage labeling — banner when local races unavailable for user's county
- [x] Deploy to txvotes.app — separate Cloudflare Worker (`txvotes-api`) sharing KV with `atxvotes-api`. DNS active, worker deployed, secrets set. atxvotes.app redirects to txvotes.app.
- [x] Change issues and candidate trait selection to "sort by priority" — drag-to-reorder lists with touch/mouse drag + arrow buttons. Priority dividers at position 5 (issues) and 3 (qualities). Ranked format in prompts. 71 tests passing.
- [x] Analytics event tracking — 18 events via Cloudflare Analytics Engine (interview flow, guide gen, shares, I Voted, page views). Privacy-safe, sendBeacon, Do Not Track respected.
- [x] Open source page — `/open-source` with tech stack, AI review cards, how to contribute, MIT license. Footer links on all static pages.
- [x] Design Texas Votes logo — "Star & Stripes Shield" (Concept C). Favicon with dark mode, apple-touch-icon, PWA manifest icons (192/512/maskable), topnav, hero, landing page, og-image all updated.
- [x] Register related domain names — dallasvotes.app, houstonvotes.app, etc. (research at docs/plans/plan_domains.md)
- [x] AI audit infrastructure — `/audit` page, `/api/audit/export` endpoint, and audit prompt template created (docs/plans/ai_audit_prompt.md). Ready to submit to ChatGPT, Gemini, and Grok.
- [x] President Trump easter egg tone — tone 8 with rally-style language, superlatives, CAPS emphasis, tangential asides, 18 funny loading messages, keyboard/tap/vanity URL triggers. Removed Governor Abbott tone (redundant).
- [x] Stronger Trump tone — rewrote system prompt with detailed speech patterns (repetition, self-references, audience engagement, dismissive asides), expanded loading messages to 18, punchier status overrides.
- [x] Share summary button — added share button on profile page next to regenerate, uses Web Share API with clipboard fallback
- [x] 7-tap secret menu — tap "Powered by Claude" text 7 times to open easter egg overlay with Cowboy, Chef, and Trump options. iPhone-friendly alternative to keyboard triggers.
- [x] Funny loading phrases — 18 tone-specific loading messages each for cowboy, chef, and trump modes during guide generation
- [x] Cowboy keyword trigger fix — added "cowboy" as alternate trigger alongside "yeehaw", extended easter egg triggers to work on ballot page too
- [x] Canvas-based fireworks — full-screen canvas with devicePixelRatio, 16 shells, gravity, particle trails, glow, twinkle effects replacing DOM-based fireworks

</details>

<details>
<summary>Infrastructure (8 resolved)</summary>

- [x] Cloudflare Web Analytics
- [x] /app/clear resets all user data
- [x] Language switch debounce
- [x] Update privacy policy
- [x] Safari favicon fix — PNG favicon, proper ICO multi-resolution, apple-touch-icon as PNG, reordered link tags for Safari compatibility
- [x] OG image fix — converted og-image from SVG to 1200x630 PNG for social platform link previews (Facebook, Twitter, iMessage)
- [x] Custom OG images for vanity URLs — unique preview images for /cowboy, /chef, /clear routes
- [x] Clear page OG title — added proper title/description meta tags for /app/clear link previews

</details>

<details>
<summary>Testing (3 resolved)</summary>

- [x] Interview flow UI tests (47 tests, 8 phases)
- [x] Verify candidate-to-race accuracy
- [x] Partisan bias audit

</details>

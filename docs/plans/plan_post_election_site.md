# Plan: Post-Election Day Site Transition

**Todolist item L156:** Design a post-Election Day site and have it ready to automatically switch when the polls close.

**Date:** 2026-02-28
**Status:** Planning

---

## 1. Audit: What References March 3 / Pre-Election Behavior

### 1.1 Static Pages (index.js)

Every static page served by `index.js` has hardcoded "March 3, 2026" text and "Build My Voting Guide" CTAs that link to `/tx/app?start=1`. These need to change after Election Day.

| Page | Line(s) | Element | What it says now |
|------|---------|---------|------------------|
| Landing `/` | 675 | Badge | `Texas Primary — March 3, 2026` |
| Landing `/` | 677 | CTA button | `Build My Voting Guide` -> `/tx/app?start=1` |
| Landing `/` | 678 | Link | `See a Sample Ballot` |
| Sample `/sample` | 963 | Date | `Tuesday, March 3, 2026` |
| Sample `/sample` | 1455 | CTA | `Get Your Personalized Ballot` -> `/tx/app?start=1` |
| How It Works | 1629 | CTA banner | `Build My Voting Guide` |
| Nonpartisan | 1764 | CTA banner | `Build My Voting Guide` |
| Open Source | 2043 | CTA banner | `Build My Voting Guide` |
| Support/FAQ | 3335 | CTA banner | `Build My Voting Guide` |
| Support/FAQ | 3352 | Text | "covers the March 3, 2026 Texas Primary Election" |
| Privacy | 3450 | CTA banner | `Build My Voting Guide` |
| Press Kit | 3610 | CTA banner | `Build My Voting Guide` |
| Candidate Profile | 4326 | CTA banner | `Build My Voting Guide` |
| All Candidates | 4490 | Subtitle | `2026 Texas Primary Election — March 3, 2026` |
| All Candidates | 4492 | CTA banner | `Build My Voting Guide` |
| Data Quality | 4998 | CTA banner | `Build My Voting Guide` |
| Stats | 5448 | CTA banner | `Build My Voting Guide` |
| DC Coming Soon | 639 | Badge | `DC Primary Election — June 16, 2026` |

**Total:** 12+ static pages with CTA banners, ~3 with hardcoded date text.

There are also Spanish translations for each of these strings that must be updated in parallel.

### 1.2 PWA App (pwa.js)

The PWA is a ~4500-line JS string array. Key election-date references:

| Location | Line(s) | Element | What it does |
|----------|---------|---------|-------------|
| Welcome screen | 1943 | Badge | `Texas Primary — March 3, 2026` |
| Ballot header | 2225 | Date | `Tuesday, March 3, 2026` |
| Cheat sheet meta | 2390 | Date | `March 3, 2026` |
| Vote Info countdown | 3377-3416 | Countdown card | Shows days until election, "Today is Election Day!", or "Election Day has passed" |
| Vote Info key dates | 3447-3456 | Date rows | Registration deadline, early voting, Election Day dates |
| Early voting card | 3469 | Date range | `Feb 17 - 27, 2026` |
| Election expired banner | 2267-2278 | Banner | Shows 7+ days after election: "The primary is over" with Clear/Keep buttons |
| I Voted sticker | 4228-4229 | Canvas | Hardcoded `new Date(2026,2,3)` for "Early!" label |
| Share text | 4121 | Share | `Get your free personalized voting guide at https://txvotes.app` |
| Share voted text | 4235 | Share | `I voted in the Texas Primary!` |
| Share prompt | 4437-4446 | Overlay | `Now help 3 friends do the same.` |
| Election date in localStorage | 1824, 1864 | Init | Stores `tx_votes_election_date` = `2026-03-03` |
| Election expired flag | 1862-1868 | State | Sets `S.electionExpired = true` after 7 days past election |
| `buildGuide()` | 3965-4008 | Function | Makes fresh Claude API calls to generate guides |
| Party badge on renderWelcome | 1943 | Badge | `Texas Primary — March 3, 2026` |
| Interview flow | 1921-1932 | Phases 0-8 | All interview phases still accessible |

### 1.3 Guide Generation (pwa-guide.js)

| Location | Line(s) | Element |
|----------|---------|---------|
| KV keys | 98-103 | `ballot:statewide:{party}_primary_2026` |
| System prompt | 6-19 | "non-partisan voting guide assistant for Texas elections" (present tense) |
| API endpoints | 81, 1745 | `handlePWA_Guide`, `handlePWA_GuideStream` — no election date check |

Guide generation has **no server-side guard** against post-election calls. It will happily burn Claude API credits generating guides for concluded races.

### 1.4 Updater / Cron (updater.js, index.js)

| Location | Line(s) | Element |
|----------|---------|---------|
| `ELECTION_DAY` constant | 313 | `"2026-03-03"` |
| `runDailyUpdate()` guard | 885-888 | Stops after `ELECTION_DAY + "T23:59:59Z"` |
| `runCountyRefresh()` guard | 1879-1882 | Same guard |
| Cron AI audit guard | 8088-8089 | Stops after `2026-03-04T00:00:00Z` |

The updater already stops. But the cron handler still runs and writes `cron_status` entries daily. The health check keeps running.

### 1.5 State Config (state-config.js)

| Line | Field |
|------|-------|
| 8 | `tx.electionDate: '2026-03-03'` |
| 18 | `dc.electionDate: '2026-06-16'` |

This is the canonical source for election dates but is **not currently used** by the PWA client or most server-side code (which hardcodes dates instead).

### 1.6 County Seeder (county-seeder.js)

All prompts reference "March 3, 2026 Texas Primary Election" (lines 161, 227, etc.). Post-election, seeding new counties is irrelevant and these prompts would be incorrect, but `runCountyRefresh()` already has its election day guard.

### 1.7 OG/Meta Descriptions

The landing page and PWA meta descriptions say "Build your personalized voting guide for Texas elections." These are evergreen enough to survive post-election, but the `pageHead` descriptions on some pages reference active voting language.

---

## 2. Auto-Switch Mechanism

### 2.1 Recommended Approach: Time-Based with KV Override

Use a **hybrid approach**: automatic time-based switching that can be overridden via KV config.

**Server-side (index.js):**

```js
// New helper at top of index.js
function getElectionPhase(stateCode = 'tx') {
  const config = STATE_CONFIG[stateCode];
  const now = new Date();
  const electionDay = new Date(config.electionDate + 'T00:00:00');
  const pollsClose = new Date(config.electionDate + 'T19:00:00-06:00'); // 7 PM CT
  const dayAfter = new Date(electionDay.getTime() + 24 * 60 * 60 * 1000);

  if (now < pollsClose) return 'pre-election';
  if (now < dayAfter) return 'election-night';     // Polls closed, results coming in
  return 'post-election';
}
```

**KV override** (for manual control):
- Key: `site_phase:tx` with value `pre-election | election-night | post-election | runoff`
- If present, overrides the time-based calculation
- Settable via admin API: `POST /api/admin/set-phase { phase: "runoff" }`
- Useful for: testing, early switch, runoff transition

**Client-side (pwa.js):**
- The PWA already gets ballot data from the server; add a `phase` field to the guide API response or a new lightweight `/app/api/phase` endpoint
- Alternatively, the PWA can compute its own phase using the same time-based logic since it already has `_ed` (election date) in localStorage

### 2.2 Why Not Config-Only?

A purely manual KV toggle requires someone to remember to flip it at 7 PM on election night. Time-based ensures the switch happens automatically even if no one is watching. The KV override is the escape hatch.

### 2.3 Timing Details

Texas polls close at 7:00 PM Central Time on March 3, 2026.
- Pre-election: before 2026-03-03T19:00:00-06:00 (7 PM CT)
- Election Night: 7 PM CT March 3 through midnight CT March 4
- Post-election: after midnight CT March 4
- Runoff: set manually via KV when runoff races are certified (typically 1-2 weeks after primary)

---

## 3. Post-Election UX

### 3.1 Election Night (Polls Closed, March 3 Evening)

**Landing page (`/`):**
- Replace badge: `Texas Primary — March 3, 2026` -> `Polls Are Closed — March 3, 2026`
- Replace CTA button: `Build My Voting Guide` -> `View Election Results`
  - Link to Texas SOS results: `https://results.texas-election.com/races`
  - Or keep link to `/tx/app` for users who already have guides
- Add a prominent results link card below the CTA
- Keep "See a Sample Ballot" link (it's educational)

**PWA app (`/tx/app`):**
- Welcome screen: Replace `Build My Guide` button with `Polls Are Closed` message + results links
- For users WITH existing guides: Show their guide as read-only with a banner: "Polls have closed. Your guide is available for reference."
- For users WITHOUT guides: Show "The primary election has ended" message with results links; do NOT start the interview flow
- Vote Info tab: Replace countdown with "Polls are closed. Results are being tallied."
- Keep the "I Voted" sticker and confetti for anyone who hasn't marked voted yet (they may have voted and want to celebrate)

**API behavior:**
- `handlePWA_Guide` / `handlePWA_GuideStream`: Return a 410 Gone response: `{ error: "Guide generation is closed. The March 3 primary has ended.", phase: "post-election" }`
- This prevents burning API credits on post-election guide requests

### 3.2 Post-Election (March 4 Onward)

**Landing page:**
- Replace badge: `March 3 Primary — Results`
- Replace CTA: `View Primary Results` -> Texas SOS results page
- Add section: "What's Next — Primary Runoff" with date and explanation
- Add link: "View your ballot for reference" -> `/tx/app`

**PWA app:**
- Existing guides remain accessible in read-only mode
- The yellow "election expired" banner (already exists at line 2267) should trigger immediately (not after 7 days)
  - Change the 7-day delay to 0 days for the post-election phase
  - Update banner text: "The March 3 primary has ended. Your ballot is available for reference." + results link
  - Remove "Clear & Start Fresh" button (nowhere fresh to start yet)
  - Replace with "View Results" link to SOS
- Interview flow: Phase 0 already redirects to landing page; the landing page will show post-election messaging
- Disable "Build My Guide" button on welcome screen
- The share prompt should change: "Share with friends for the runoff election" instead of "help 3 friends decide"

**All static pages:**
- CTA banners on every page (How It Works, Privacy, etc.) should change from `Build My Voting Guide` to `View Primary Results` or just be hidden
- The FAQ "Which elections are covered?" answer should update

### 3.3 Results Links

Primary results sources:
- Texas SOS Election Night Returns: `https://results.texas-election.com/races`
- County-level results: `https://results.texas-election.com/county/{countyName}`
- Ballotpedia: `https://ballotpedia.org/Texas_elections,_2026`

The results links should be configurable in `state-config.js`:
```js
tx: {
  ...existing,
  resultsUrl: 'https://results.texas-election.com/races',
  runoffDate: '2026-05-26',  // Filled in after primary when known
}
```

### 3.4 Guide Accessibility (Read-Only Reference)

Users who generated guides before polls closed should be able to:
- View their guide on the My Ballot tab (data is in localStorage)
- Switch between Republican and Democratic ballots
- Print their cheat sheet (even post-election for record-keeping)
- Share their guide (share text should update to past tense)
- See candidate profiles (the data remains in KV)

Users should NOT be able to:
- Start a new interview
- Generate a new guide (API returns 410)
- Use the "Retry" button if they had an error (it would try to call the API)

### 3.5 What to Disable

| Feature | Action |
|---------|--------|
| Interview flow (phases 1-7) | Block entry; redirect to post-election message |
| Guide generation API | Return 410 Gone |
| "Build My Guide" button | Replace with "View Results" or hide |
| Daily updater cron | Already stops (existing guard) |
| County seeder | Already stops (existing guard) |
| AI audit cron | Already stops (existing guard) |
| "I Voted" button | Keep (for post-vote celebration) |
| Share app text | Update to past tense |
| Candidate profiles `/candidates` | Keep accessible (reference) |
| Data Quality page | Keep (shows data provenance) |

---

## 4. Runoff Transition

### 4.1 Texas Primary Runoff Timeline

Texas primary runoffs occur when no candidate receives >50% of the vote. Key dates:
- Primary: March 3, 2026
- Runoff races certified: ~1-2 weeks after primary (Secretary of State certifies)
- Runoff Election Day: Typically 4th Tuesday after primary = **March 31, 2026** (or per SOS announcement)
- Early voting for runoff: ~1 week before runoff day

### 4.2 Runoff Data Model

Runoff races are a subset of primary races where no one got 50%+. The data model needs:

```json
{
  "id": "ballot:statewide:republican_runoff_2026",
  "electionName": "2026 Republican Primary Runoff",
  "electionDate": "2026-03-31",
  "races": [
    {
      "office": "U.S. Senator",
      "candidates": [
        { "name": "Candidate A", "description": "..." },
        { "name": "Candidate B", "description": "..." }
      ]
    }
  ]
}
```

KV keys: `ballot:statewide:{party}_runoff_2026`, `ballot:county:{fips}:{party}_runoff_2026`

### 4.3 Transitioning to Runoff Mode

1. **Manual trigger via admin API:** `POST /api/admin/set-phase { phase: "runoff" }` writes `site_phase:tx = "runoff"` to KV
2. **Seed runoff ballot data:** Create runoff ballot JSON with the subset of races + updated candidate info. This can be done via a new seeder or manual KV writes.
3. **Update state-config.js:** Set `runoffDate`, or better, store runoff date in KV under `election_config:tx:runoff_date`
4. **Site switches to runoff UX:**
   - Landing page: `Primary Runoff — March 31, 2026` badge, `Build My Runoff Guide` CTA
   - PWA: New interview flow targets runoff races only (fewer races = shorter interview)
   - Guide generation reads from `_runoff_2026` KV keys
   - Vote Info tab shows runoff key dates
   - Primary guide remains accessible via a "View Primary Results" link

### 4.4 Runoff Guide Generation

Runoff guides are simpler (2 candidates per race, no propositions typically). The same guide generation pipeline works with:
- Updated `ELECTION_CYCLE` constant or KV config: `runoff_2026`
- Ballot data keyed under `ballot:statewide:{party}_runoff_2026`
- Shorter interviews (fewer deep-dive questions since it's only a few races)
- System prompt: "You are a non-partisan voting guide assistant for the Texas primary runoff election."

### 4.5 After Runoff

After the runoff election, the site enters a dormant state until the next election cycle (November 2026 general election or whenever the next data is seeded).

---

## 5. Implementation Phases

### Phase 1: Election Phase Detection (Estimated: Small, ~2-3 hours)

**Files:** `worker/src/state-config.js`, `worker/src/index.js`

1. Add `getElectionPhase(stateCode)` function to `state-config.js` (or a new `election-phase.js` module)
   - Returns `'pre-election' | 'election-night' | 'post-election' | 'runoff'`
   - Time-based with KV override (`site_phase:{stateCode}`)
2. Add admin endpoint: `POST /api/admin/set-phase` to write the KV override
3. Add admin endpoint: `GET /api/admin/phase` to read current phase
4. Add results URL and runoff date fields to `STATE_CONFIG`
5. Write tests for phase detection logic (boundary cases around poll close time)

**Complexity:** Low. Pure logic + 2 simple admin endpoints.

### Phase 2: Server-Side API Guards (Estimated: Small, ~1-2 hours)

**Files:** `worker/src/pwa-guide.js`, `worker/src/index.js`

1. In `handlePWA_Guide` and `handlePWA_GuideStream`: Check election phase before calling Claude API
   - If `post-election`, return `{ error: "The March 3 primary has ended. Guide generation is closed.", phase: "post-election" }` with 410 status
   - If `runoff`, switch to runoff ballot keys (future phase)
2. Requires reading `site_phase:tx` from KV (one additional KV read, can be parallelized with existing reads)
3. Add corresponding tests

**Complexity:** Low. Single conditional at top of two functions.

### Phase 3: Static Page Post-Election Variants (Estimated: Medium, ~4-6 hours)

**Files:** `worker/src/index.js`

1. Create a helper `ctaBanner(stateCode, phase)` that returns the appropriate CTA HTML based on election phase:
   - Pre-election: `Build My Voting Guide` -> `/tx/app?start=1`
   - Post-election: `View Primary Results` -> SOS results URL
   - Runoff: `Build My Runoff Guide` -> `/tx/app?start=1` (with runoff context)
2. Replace all 12+ hardcoded `cta-banner` divs with calls to `ctaBanner()`
3. Update the landing page badge to use `getElectionPhase()`:
   - Pre: `Texas Primary — March 3, 2026`
   - Post: `March 3 Primary — Complete`
   - Runoff: `Primary Runoff — [date]`
4. Update FAQ "Which elections are covered?" to be phase-aware
5. Update Spanish translations for all new strings
6. Add a "View Results" card to the landing page for post-election phase

**Complexity:** Medium. Many pages to update, but the pattern is repetitive. The CTA helper makes it systematic.

### Phase 4: PWA Post-Election UX (Estimated: Large, ~6-10 hours)

**Files:** `worker/src/pwa.js`

This is the most complex phase because pwa.js is a 4500-line string array.

1. **Add phase detection to PWA client:**
   - Either: Add a `/app/api/phase` endpoint that returns `{ phase, resultsUrl, runoffDate }` and call it on load
   - Or: Compute phase client-side using election date from localStorage (simpler, no extra API call, but can't be overridden from server)
   - Recommended: Add phase to the existing guide API response + client-side fallback for users who haven't called the API

2. **Welcome screen (`renderWelcome`):**
   - Add conditional: if post-election, replace `Build My Guide` button with results message
   - Show: "The March 3 primary has ended." + `View Results` link + `View Your Ballot` link (if guide exists)

3. **Ballot view (`renderBallot`):**
   - Move the election expired banner to trigger immediately in post-election (change 7-day delay to 0)
   - Update banner text: "The March 3 primary has ended. Your ballot is saved for reference."
   - Replace "Clear & Start Fresh" with "View Results" link
   - Keep "Keep for Reference" button
   - Add a "View Results" link card at top of ballot

4. **Vote Info (`renderVoteInfo`):**
   - Post-election countdown: Already shows "Election Day has passed" (line 3414)
   - But still shows "I Voted!" button post-election — keep this (users may want to celebrate late)
   - Replace polling location card with results link
   - Replace key dates card with "What's Next" card (runoff dates when known)

5. **Interview flow (`renderInterview`):**
   - If phase is post-election, redirect from any interview phase to ballot view (or landing page)
   - `buildGuide()` should check phase before calling API; show user-friendly error if post-election

6. **Share texts:**
   - `shareApp()` text: Update from "Get your free personalized voting guide" to "Check your primary results"
   - `shareStickerImage()` text: Update from "Build your personalized voting guide" to phase-appropriate text
   - Share prompt: Skip entirely in post-election (no one needs convincing to use a concluded election tool)

7. **Translations:** Add Spanish translations for all new strings (results messaging, runoff text, etc.)

**Complexity:** High. The string-array format of pwa.js makes changes tedious but not conceptually difficult.

### Phase 5: Cron & Background Updates (Estimated: Small, ~1-2 hours)

**Files:** `worker/src/index.js` (cron handler), `worker/src/updater.js`

1. The daily updater already stops — no changes needed
2. The health check can continue running post-election (useful to monitor KV health)
3. Consider adding a post-election cron task: periodic check of SOS results page and store last-checked timestamp in KV
4. The AI audit cron already stops — no changes needed

**Complexity:** Low. Mostly verifying existing guards work correctly.

### Phase 6: Runoff Ballot Support (Estimated: Medium-Large, ~4-8 hours)

**Files:** `worker/src/pwa-guide.js`, `worker/src/updater.js`, `worker/src/index.js`, `worker/src/pwa.js`, `worker/src/state-config.js`

1. Add `ELECTION_CYCLE` awareness: if phase is `runoff`, guide generation reads from `_runoff_2026` keys
2. Add admin endpoint to seed runoff ballot data (or extend existing county seeder)
3. Update PWA to show runoff-specific messaging when phase is `runoff`
4. Update key dates, countdown, and registration info for runoff
5. The interview flow can be simplified for runoffs (fewer races)
6. Update the daily updater to work with runoff ballot keys when active

**Complexity:** Medium-Large. This is essentially a mini version of the original election setup but scoped to a subset of races.

### Phase 7: Testing (Estimated: Medium, ~3-4 hours)

**Files:** New test file `worker/src/__tests__/post-election.test.js` or additions to existing test files

1. Test `getElectionPhase()` with various dates and KV overrides
2. Test guide API 410 response in post-election phase
3. Test CTA banner helper for all phases
4. Test that PWA renders correctly in post-election mode (happy-dom tests)
5. Test KV override mechanism
6. Test runoff key switching

---

## 6. Summary of Key Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Switch trigger | Time-based (7 PM CT) + KV override | Automatic, no human needed, but manually overridable |
| Guide generation | Block with 410 after polls close | Prevents wasting Claude API credits |
| Existing guides | Keep in localStorage, read-only | Users may reference their guide after voting |
| Interview flow | Block new interviews post-election | No point generating guides for concluded races |
| Results links | Texas SOS results page | Official, real-time, authoritative |
| CTA buttons | Replace with "View Results" | Clear post-election action |
| Static pages | Phase-aware CTA helper | One function, 12+ pages updated consistently |
| Runoff transition | Manual KV phase set + new ballot keys | Runoff races aren't known until results certified |
| Candidate profiles | Keep accessible | Valuable reference even post-election |
| Share prompts | Update to post-election text or hide | Don't encourage sharing a stale tool |

---

## 7. Files Changed (Estimated)

| File | Changes |
|------|---------|
| `worker/src/state-config.js` | Add `resultsUrl`, `runoffDate` fields; add `getElectionPhase()` |
| `worker/src/index.js` | Phase-aware CTA helper; admin endpoints; landing page variants; 12+ CTA replacements |
| `worker/src/pwa.js` | Phase detection; welcome screen; ballot banner; vote info; interview guard; share text; translations |
| `worker/src/pwa-guide.js` | 410 guard at top of `handlePWA_Guide` and `handlePWA_GuideStream` |
| `worker/src/updater.js` | No changes needed (guards already exist) |
| New: `worker/src/election-phase.js` | (Optional) Extract phase logic into its own module for testability |
| Test files | New or extended tests for phase detection, API guards, UI rendering |

---

## 8. Pre-Election Prep Checklist

These items should be done BEFORE March 3 so the site transitions cleanly:

- [ ] Implement Phase 1 (election phase detection)
- [ ] Implement Phase 2 (API guards)
- [ ] Implement Phase 3 (static page variants)
- [ ] Implement Phase 4 (PWA post-election UX)
- [ ] Test with KV override set to `post-election` on staging
- [ ] Prepare results URLs (verify Texas SOS election night URL is correct for 2026)
- [ ] Prepare admin runbook: how to manually set phase if needed
- [ ] Deploy to production before March 3
- [ ] Verify time-based auto-switch will trigger at 7 PM CT March 3
- [ ] After polls close: verify site transitioned correctly
- [ ] After results certified: set phase to `runoff` if applicable

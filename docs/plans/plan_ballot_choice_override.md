# Plan: Ballot Choice Override

**Status:** Draft
**Author:** Auto-generated from codebase analysis
**Date:** 2026-02-23

## Problem

After the interview flow generates a personalized voting guide, users have no way to disagree with a recommendation or select a different candidate. The ballot page displays AI recommendations as final, which undermines user agency and misses an opportunity to collect feedback that could improve future recommendations.

## Goals

1. Let users tap a different candidate in any race to override the AI recommendation
2. Visually distinguish AI-recommended vs. user-overridden choices
3. Optionally collect anonymous "why did you change this?" feedback
4. Reflect overrides on the printable cheat sheet
5. Aggregate override patterns server-side to improve future prompt engineering

---

## 1. UI Design

### 1a. Race Card Override (Ballot List View)

Currently, `renderRaceCard()` (pwa.js ~line 2250) renders each race as a card showing:
- Office name + district
- Confidence badge (via `confBadge()`)
- Recommended candidate name + reasoning
- Candidate avatar bubbles (recommended one gets a blue border via `isRecommended`)

**Change:** Add a small override indicator on the race card when the user has overridden. The card already links to the race detail page (`data-action="nav" data-to="#/race/{idx}"`), so the actual override interaction happens on the race detail view, not the card itself.

On the race card, when an override exists:
- Replace the recommended candidate name with the user's chosen candidate name
- Show a small "You changed this" badge in muted style next to the confidence badge
- Change the avatar border highlight from the AI pick to the user's pick

### 1b. Race Detail Override (Race Detail View)

Currently, `renderRaceDetail()` (pwa.js ~line 2348) shows:
- A green recommendation box with the AI pick, reasoning, match factors, strengths, concerns
- All candidate cards below, each expandable

**Change:** Add selection capability to each candidate card:

1. **Tap-to-select on candidate cards**: Each candidate card in the "All Candidates" section gets a "Choose this candidate" button (or the whole card becomes tappable for selection). When tapped:
   - The selected candidate gets a visual highlight (colored left border + "Your Pick" badge)
   - If different from the AI recommendation, the AI recommendation box changes to show:
     - A dimmed version of the original recommendation with strikethrough on the name
     - Text: "AI recommended {name}, but you chose {other name}"
     - An "Undo" button to restore the AI pick

2. **"Why did you change this?" prompt**: After selecting a non-AI candidate, a collapsible text area appears below the recommendation box:
   - Placeholder: "What made you choose differently? (optional, anonymous)"
   - A "Submit feedback" button (only if text is entered)
   - A "Skip" link to dismiss
   - Clear note: "This feedback is anonymous and helps improve recommendations for everyone."

3. **Undo capability**: A persistent "Restore AI pick" button appears whenever an override is active, allowing the user to revert.

### 1c. Visual Language

| State | Visual Treatment |
|-------|-----------------|
| AI recommended (default) | Green `rec-box` with checkmark, blue border on avatar |
| User override (different from AI) | Orange/amber left border on chosen card, "Your Pick" badge in amber, dimmed AI rec box |
| User confirmed AI pick | Green `rec-box` unchanged, plus subtle "Confirmed" text |
| Override with feedback submitted | Same as override + small "Feedback sent" checkmark |

### 1d. Proposition Overrides

`renderPropCard()` (pwa.js ~line 2294) renders proposition cards with Lean Yes / Lean No / Your Call badges. Add similar override capability:
- Tap to cycle between "FOR" / "AGAINST" / "Skip" on each proposition
- Show original AI recommendation in muted text when overridden

---

## 2. Data Model

### 2a. Client-Side (localStorage)

**New localStorage key:** `tx_votes_overrides`

```json
{
  "republican": {
    "Governor": {
      "originalCandidate": "Jane Smith",
      "chosenCandidate": "John Doe",
      "reason": "I met him at a town hall and liked his education plan",
      "reasonSubmitted": true,
      "timestamp": "2026-02-23T15:30:00Z"
    },
    "U.S. Senator": {
      "originalCandidate": "Alice Johnson",
      "chosenCandidate": "Alice Johnson",
      "confirmed": true,
      "timestamp": "2026-02-23T15:31:00Z"
    },
    "State Representative \u2014 District 46": {
      "originalCandidate": "Bob Wilson",
      "chosenCandidate": "Carol Davis",
      "reason": "",
      "reasonSubmitted": false,
      "timestamp": "2026-02-23T15:32:00Z"
    }
  },
  "democrat": {}
}
```

**Key structure:** `overrides[party][raceKey]` where `raceKey` = `race.office` for statewide races, or `race.office + " \u2014 " + race.district` for district races. This matches the existing label format used throughout the codebase (e.g., line 2252: `race.office+(race.district?' \u2014 '+race.district:'')`).

**Override object fields:**
- `originalCandidate` (string) -- the AI's recommended candidate name
- `chosenCandidate` (string) -- the user's chosen candidate name
- `confirmed` (boolean, optional) -- true if user explicitly confirmed the AI pick
- `reason` (string) -- user's optional explanation (empty string if skipped)
- `reasonSubmitted` (boolean) -- whether the reason was sent to the server
- `timestamp` (ISO string) -- when the override was made

**Proposition overrides** use a similar structure under a `propositions` sub-key:
```json
{
  "republican": {
    "_propositions": {
      "1": { "originalRec": "Lean Yes", "chosenRec": "AGAINST", "reason": "", "timestamp": "..." },
      "4": { "originalRec": "Lean No", "chosenRec": "FOR", "reason": "...", "timestamp": "..." }
    }
  }
}
```

### 2b. State Object (`S`)

Add to the `S` state object (pwa.js ~line 1460):
```js
overrides: {}
```

### 2c. save() and load() Changes

**save()** (pwa.js ~line 1624): Add after the existing `localStorage.setItem` calls:
```js
if (Object.keys(S.overrides).length) {
  localStorage.setItem('tx_votes_overrides', JSON.stringify(S.overrides));
}
```

**load()** (pwa.js ~line 1645): Add after existing load logic:
```js
var ov = localStorage.getItem('tx_votes_overrides');
if (ov) S.overrides = JSON.parse(ov);
```

**Clear/start-over** (pwa.js ~lines 3011-3017): Add `localStorage.removeItem('tx_votes_overrides')` to both clear paths.

### 2d. Helper Functions

Add to pwa.js utility section:

```js
function getRaceKey(race) {
  return race.office + (race.district ? ' \u2014 ' + race.district : '');
}

function getOverride(race) {
  var party = S.selectedParty;
  var key = getRaceKey(race);
  return S.overrides[party] && S.overrides[party][key] || null;
}

function setOverride(race, candidateName, reason) {
  var party = S.selectedParty;
  if (!S.overrides[party]) S.overrides[party] = {};
  var key = getRaceKey(race);
  var orig = race.recommendation ? race.recommendation.candidateName : null;
  S.overrides[party][key] = {
    originalCandidate: orig,
    chosenCandidate: candidateName,
    reason: reason || '',
    reasonSubmitted: false,
    timestamp: new Date().toISOString()
  };
  save();
}

function clearOverride(race) {
  var party = S.selectedParty;
  var key = getRaceKey(race);
  if (S.overrides[party]) {
    delete S.overrides[party][key];
    save();
  }
}

function getEffectiveChoice(race) {
  var ov = getOverride(race);
  if (ov) return ov.chosenCandidate;
  return race.recommendation ? race.recommendation.candidateName : null;
}
```

---

## 3. Feedback Collection

### 3a. Client-to-Server Flow

When a user enters a reason and taps "Submit feedback":

1. **Client** sends a POST to `/app/api/override-feedback` with:
   ```json
   {
     "party": "republican",
     "race": "Governor",
     "from": "Jane Smith",
     "to": "John Doe",
     "reason": "I met him at a town hall and liked his education plan",
     "lang": "en"
   }
   ```
   No user ID, no IP logging, no PII. Just the race, the swap, and the reason.

2. **Client** marks `reasonSubmitted: true` in the local override object so it does not re-send.

3. **Server** appends the feedback to a KV key (see below).

### 3b. Server-Side Storage (KV)

**KV key pattern:** `feedback:overrides:{party}:{race_key}`

Example: `feedback:overrides:republican:Governor`

**Value format** (JSON array, append semantics):
```json
[
  {
    "from": "Jane Smith",
    "to": "John Doe",
    "reason": "I met him at a town hall and liked his education plan",
    "lang": "en",
    "ts": "2026-02-23T15:30:00Z"
  },
  {
    "from": "Jane Smith",
    "to": "Bob Jones",
    "reason": "Better on border security",
    "lang": "en",
    "ts": "2026-02-23T16:45:00Z"
  }
]
```

**Append semantics implementation** in `index.js`:
```js
async function handleOverrideFeedback(request, env) {
  const body = await request.json();
  const { party, race, from, to, reason, lang } = body;

  // Validate required fields
  if (!party || !race || !from || !to) {
    return new Response('Missing fields', { status: 400 });
  }

  // Sanitize reason (max 500 chars, strip PII patterns)
  const safeReason = (reason || '').slice(0, 500);

  const kvKey = `feedback:overrides:${party}:${race}`;
  const existing = await env.ELECTION_DATA.get(kvKey, 'json') || [];

  // Cap at 500 entries per race to prevent unbounded growth
  if (existing.length >= 500) {
    existing.shift(); // drop oldest
  }

  existing.push({
    from,
    to,
    reason: safeReason,
    lang: lang || 'en',
    ts: new Date().toISOString()
  });

  await env.ELECTION_DATA.put(kvKey, JSON.stringify(existing));
  return new Response(null, { status: 204 });
}
```

### 3c. Privacy Considerations

- **No PII collected**: No name, email, IP, device ID, or any user identifier
- **Reason is optional**: The text field is clearly labeled "optional" and "anonymous"
- **Capped storage**: Max 500 entries per race key prevents abuse
- **Rate limiting**: Reuse the existing `isRateLimited()` function from the analytics handler
- **No tracking**: Override feedback does not participate in the analytics pipeline
- **Privacy page update**: Add a line to `/privacy` explaining that optional anonymous feedback about recommendation changes may be collected to improve the AI
- **Consent flow**: The feedback submission is a deliberate user action (type text, then tap submit). There is no passive/automatic collection.
- **Right to not participate**: The "Skip" link makes it trivially easy to not provide feedback

### 3d. Analytics Events

Add to `VALID_EVENTS` in index.js:
```
"override_set", "override_undo", "override_feedback"
```

Track via existing `trk()`:
- `trk('override_set', { d1: raceKey, d2: candidateName })` -- when user selects a different candidate
- `trk('override_undo', { d1: raceKey })` -- when user restores AI pick
- `trk('override_feedback', { d1: raceKey })` -- when user submits a reason

---

## 4. AI Training Signal

### 4a. Aggregate Override Patterns

Build an admin endpoint `/admin/override-stats` (protected by `ADMIN_SECRET`) that reads all `feedback:overrides:*` keys and produces a summary:

```json
{
  "totalOverrides": 847,
  "byRace": {
    "Governor": {
      "total": 142,
      "swaps": [
        { "from": "Jane Smith", "to": "John Doe", "count": 89, "topReasons": ["education plan", "town hall", "local endorsements"] },
        { "from": "Jane Smith", "to": "Bob Jones", "count": 53, "topReasons": ["border security", "tax policy"] }
      ]
    }
  },
  "overrideRate": 0.17,
  "racesWithHighOverrideRate": [
    { "race": "Governor", "rate": 0.34, "note": "1 in 3 users override this race" }
  ]
}
```

### 4b. Prompt Engineering Feedback Loop

When override rates are high for a specific race, this signals the AI may be:
- Weighting certain issues incorrectly for that race
- Missing important local context
- Using stale information about a candidate
- Framing the recommendation with insufficient nuance

**Action items based on override data:**
1. Races with >25% override rate get flagged for manual review
2. Common "why" themes get extracted (via keyword analysis or a periodic Claude summarization)
3. Extracted themes feed into `pwa-guide.js` prompt adjustments:
   - Add instructions like "Note: many users who prioritize {issue} prefer {candidate} for {reason}"
   - Adjust confidence levels: high-override races should use "Best Available" rather than "Strong Match"
4. Override patterns can also inform the `county-seeder.js` pipeline -- if users consistently say "wrong info about X", that signals data quality issues

### 4c. Dashboard View

Add to the existing admin tooling (accessible at `/admin/overrides` with Bearer auth):
- Table: Race | Total Overrides | Override Rate | Top Swap | Top Reason
- Sortable by override rate
- Drill-down: click a race to see all feedback entries
- Time filter: last 7 days, last 30 days, all time

This can be a simple HTML page served from `index.js`, similar to the existing `/admin/status` and `/admin/analytics` pages.

---

## 5. Cheat Sheet Integration

### 5a. renderCheatSheet() Changes

Currently (pwa.js ~line 2196), the cheat sheet contested races table uses:
```js
var vote = r.recommendation ? esc(r.recommendation.candidateName) : '\u2014';
```

**Change:** Use the effective choice (override or AI pick):
```js
var ov = getOverride(r);
var vote = ov ? esc(ov.chosenCandidate) : (r.recommendation ? esc(r.recommendation.candidateName) : '\u2014');
var isOverridden = ov && ov.chosenCandidate !== ov.originalCandidate;
```

**Visual treatment in cheat sheet table:**
- Default (AI pick): candidate name in bold, no special styling
- Overridden: candidate name in bold + a small "(your pick)" annotation + original AI rec in light gray strikethrough below
- This ensures the printed cheat sheet shows what the user actually wants to vote for

### 5b. Proposition Overrides in Cheat Sheet

Same pattern: check for proposition override before displaying the recommendation badge.

### 5c. Print Stylesheet

The existing `@media print` styles (in the CSS section of pwa.js) should:
- Show override annotations
- Hide the "Undo" buttons and feedback prompts
- Include a subtle footer note: "* = Your override of AI recommendation"

---

## 6. Implementation Plan

### Phase 1: Core Override (Client-Side Only)

**Files to modify:**
- `worker/src/pwa.js`

**Changes:**
1. Add `overrides: {}` to the `S` state object (~line 1461)
2. Add `tx_votes_overrides` to `save()` (~line 1624) and `load()` (~line 1645)
3. Add `tx_votes_overrides` to both clear/start-over paths (~lines 3011, 3032)
4. Add helper functions: `getRaceKey()`, `getOverride()`, `setOverride()`, `clearOverride()`, `getEffectiveChoice()`
5. Modify `renderRaceCard()` (~line 2250) to show overridden candidate name and "You changed" indicator
6. Modify `renderRaceDetail()` (~line 2348) to add "Choose this candidate" buttons on each candidate card
7. Add `data-action="override-candidate"` handler in the click event listener (~line 2940)
8. Add `data-action="undo-override"` handler
9. Modify `renderCheatSheet()` (~line 2164) to use `getEffectiveChoice()`
10. Add translations for new strings to the `TR` dictionary

**Estimated LOC:** ~120 lines added to `APP_JS` array

### Phase 2: Feedback Collection

**Files to modify:**
- `worker/src/pwa.js` (feedback UI)
- `worker/src/index.js` (API endpoint)

**Changes:**
1. Add "Why did you change this?" collapsible text area in `renderRaceDetail()` after override
2. Add `data-action="submit-override-feedback"` handler that POSTs to `/app/api/override-feedback`
3. Add `handleOverrideFeedback()` function in `index.js`
4. Add route: `if (url.pathname === "/app/api/override-feedback")` in the POST section (~line 5675)
5. Add CORS handling for the new endpoint
6. Add `override_set`, `override_undo`, `override_feedback` to `VALID_EVENTS`

**Estimated LOC:** ~80 lines in pwa.js, ~40 lines in index.js

### Phase 3: Analytics & Admin Dashboard

**Files to modify:**
- `worker/src/index.js`

**Changes:**
1. Add `/admin/overrides` endpoint (GET, Bearer auth)
2. Read all `feedback:overrides:*` keys from KV
3. Aggregate into summary statistics
4. Render as HTML dashboard page

**Estimated LOC:** ~150 lines in index.js

### Phase 4: Proposition Overrides

**Files to modify:**
- `worker/src/pwa.js`

**Changes:**
1. Add proposition override UI to `renderPropCard()` (~line 2294)
2. Extend the override data model to include `_propositions` sub-key
3. Update cheat sheet proposition table to use overrides

**Estimated LOC:** ~60 lines

### Phase 5: Privacy & Polish

**Files to modify:**
- `worker/src/index.js` (privacy page)
- `worker/src/pwa.js` (translations, edge cases)

**Changes:**
1. Update `/privacy` page to mention anonymous override feedback
2. Add all new translation strings for Spanish (`lang=es`)
3. Handle edge cases: no recommendation on race, withdrawn candidates, uncontested races (no override needed)
4. Test with novelty tones (Swedish Chef, Cowboy, Trump) to ensure overrides persist across tone switches
5. Ensure `reprocessGuide()` preserves existing overrides (or prompts user)

---

## 7. Testing Plan

### Unit Tests (worker/tests/)

Add to existing vitest test suite:

1. **Override storage**: set override, verify localStorage, clear override, verify removal
2. **Race key generation**: test `getRaceKey()` with and without district
3. **Effective choice**: test `getEffectiveChoice()` returns override when present, AI pick when not
4. **Cheat sheet rendering**: verify overridden race shows user's pick, not AI's pick
5. **Save/load round-trip**: verify overrides survive save + load cycle
6. **Clear resets overrides**: verify start-over clears `tx_votes_overrides`

### Manual QA Checklist

- [ ] Override a candidate in a key race, verify race card updates
- [ ] Override a candidate, navigate away and back, verify override persists
- [ ] Override a candidate, print cheat sheet, verify it shows the override
- [ ] Submit feedback reason, verify it reaches KV
- [ ] Undo an override, verify original AI pick restores
- [ ] Switch parties, verify overrides are party-scoped
- [ ] Clear all data, verify overrides are cleared
- [ ] Test in Spanish mode (lang=es)
- [ ] Test with novelty tones active
- [ ] Test on mobile (touch targets for candidate selection)
- [ ] Test offline (override should work without network; feedback submission queues or warns)

---

## 8. KV Write Budget

Current Cloudflare plan: 1M writes/month.

Estimated additional KV writes from this feature:
- Each feedback submission = 1 KV read + 1 KV write (append to array)
- Assume 10% of users submit feedback, ~3 overrides each = ~0.3 writes per user
- At 1,000 daily users = ~300 writes/day = ~9,000 writes/month
- Well within the 1M/month budget

The override data itself stays in localStorage (no KV cost). Only the optional "why" feedback hits KV.

---

## 9. Open Questions

1. **Should overrides survive a guide reprocess?** When a user changes their reading tone and the guide is regenerated via `reprocessGuide()`, candidate names may shift (e.g., AI changes its pick). Overrides keyed by race should still work, but the `originalCandidate` field may become stale. Options:
   - Clear overrides on reprocess (simplest, with a warning toast)
   - Keep overrides and show a "recommendation changed" indicator

2. **Confirmation vs. implicit agreement**: Should we also track when users explicitly confirm the AI pick (adds a "Looks good" button)? This gives richer signal than just tracking disagreements. Downside: extra UI noise.

3. **Should proposition overrides use the same feedback endpoint?** Or a separate one? Propositions are structurally different (FOR/AGAINST vs. candidate name). Recommend: same endpoint with a `type: "proposition"` field.

4. **Multi-LLM compare mode**: The app has a hidden LLM comparison feature (`#/debug/compare`). When users compare Claude vs. ChatGPT ballots, should overrides apply across all LLMs? Recommend: overrides are per-party, not per-LLM.

5. **Override counter in tab bar**: Should the ballot tab icon show a badge count of overrides? Could be useful but also noisy. Defer to user testing.

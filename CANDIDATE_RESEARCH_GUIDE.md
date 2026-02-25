# Candidate Research Guide

A structured process for researching candidates and populating ATXVotes election data.

---

## Data Fields to Populate

Each candidate needs:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Full name as it appears on the ballot |
| `party` | Yes | Party affiliation |
| `isIncumbent` | Yes | Currently holds this office? |
| `isRecommended` | No | Set later during guide generation |
| `summary` | Yes | 1-2 sentence bio — who they are and why they matter in this race |
| `background` | Yes | Career history, offices held, professional background |
| `keyPositions` | Yes | 3-6 policy stances (short phrases) |
| `endorsements` | Yes | Notable endorsements (orgs, officials, newspapers) |
| `pros` | Yes | 3-5 strengths relevant to the office |
| `cons` | Yes | 2-4 weaknesses, gaps, or concerns |
| `fundraising` | No | Fundraising summary (leading, competitive, minimal, self-funded, etc.) |
| `polling` | No | Polling position if available (frontrunner, competitive, longshot, etc.) |

---

## Research Process

### Step 1: Identify All Races

Start with the official ballot. Sources:

- **Texas Secretary of State** — certified candidate lists
- **Travis County Clerk** — local ballot lookup by address
- **Ballotpedia** — comprehensive race listings
- **Vote411.org** (League of Women Voters) — voter guides by address

Prompt:
> List all races on the [PARTY] primary ballot for [DATE] in Austin, TX (Travis County). Include federal, state, and local races. For each race, note the office name, district number if applicable, and whether it's contested.

### Step 2: Gather Candidate Lists Per Race

For each race, confirm every candidate on the ballot.

Prompt:
> Who are the candidates in the [YEAR] [PARTY] primary for [OFFICE] in [DISTRICT]? List each candidate's full name as it appears on the ballot and whether they are the incumbent.

### Step 3: Research Individual Candidates

For each candidate, gather structured information. Work through one race at a time.

#### 3a: Background and Bio

Prompt:
> Research [CANDIDATE NAME], candidate for [OFFICE] in the [YEAR] [PARTY] primary in Texas.
>
> Provide:
> - A 1-2 sentence summary of who they are and their significance in this race
> - Their professional and political background (offices held, career, education)
> - 4-6 key policy positions stated in short phrases
> - Notable endorsements (elected officials, organizations, newspapers, unions)
> - 3-5 strengths as a candidate for this specific office
> - 2-4 weaknesses, concerns, or gaps
>
> Focus on what's most relevant to this specific office. Cite sources where possible.

#### 3b: Fundraising

Prompt:
> What is the fundraising picture for [CANDIDATE NAME] in the [YEAR] [OFFICE] race?
> How much have they raised? How does it compare to other candidates in this race?
> Summarize in one phrase: "Strong — leading fundraising", "Competitive", "Minimal — grassroots only", "Self-funded", etc.

Sources:
- **OpenSecrets.org** — federal races
- **Texas Ethics Commission (TEC)** — state/local races, campaign finance reports
- **FEC.gov** — federal candidate filings

#### 3c: Polling

Prompt:
> Is there any public polling for the [YEAR] [PARTY] primary for [OFFICE] in Texas?
> If yes, summarize the candidate's position. If no, assess their standing based on endorsements, fundraising, name recognition, and media coverage.
> Summarize in one phrase: "Frontrunner", "Competitive — within striking distance", "Longshot", "Unknown — no polling available", etc.

### Step 4: Assess Race Characteristics

For each race, determine:

Prompt:
> For the [YEAR] [PARTY] primary for [OFFICE]:
> - Is this race contested (more than one candidate)?
> - Is this a key race? (competitive, high-impact, or unusually consequential)
> - Are there meaningful policy or strategic differences between candidates?
> - Any important context (redistricting, scandal, open seat, national implications)?

### Step 5: Format as JSON

Once research is complete, format into the election data JSON structure.

Prompt:
> Format the following candidate research into JSON matching this structure:
>
> ```json
> {
>   "office": "Office Name",
>   "candidates": [
>     {
>       "name": "Full Name",
>       "party": "Party",
>       "isIncumbent": false,
>       "isRecommended": false,
>       "summary": "1-2 sentence bio",
>       "background": "Career and political history",
>       "keyPositions": ["Position 1", "Position 2"],
>       "endorsements": ["Endorser 1", "Endorser 2"],
>       "pros": ["Strength 1", "Strength 2"],
>       "cons": ["Weakness 1", "Weakness 2"],
>       "fundraising": "Summary phrase",
>       "polling": "Summary phrase"
>     }
>   ],
>   "isContested": true,
>   "isKeyRace": false
> }
> ```
>
> [PASTE RESEARCH HERE]

---

## Research Sources by Office Type

### Federal Races (U.S. Senate, U.S. House)
- Ballotpedia, OpenSecrets, FEC.gov, VoteSmart.org
- Texas Tribune, Houston Chronicle, Dallas Morning News
- Candidate campaign websites
- Congressional voting records (if incumbent): congress.gov, GovTrack

### State Races (Governor, Lt. Gov, AG, Comptroller, Land Commissioner, Railroad Commissioner, State Legislature)
- Ballotpedia, Texas Tribune, Texas Ethics Commission
- Legislative voting records: capitol.texas.gov
- Texas Monthly endorsements and analysis
- Reform Austin, Texas Observer

### Local/Judicial Races
- Travis County Clerk, Austin American-Statesman
- League of Women Voters (Vote411.org) — candidate questionnaires
- Austin Chronicle endorsements
- Texas Appleseed, Texas Fair Defense Project (judicial races)

---

## Propositions Research

Propositions use a different data structure than candidates. Each proposition needs:

| Field | Required | Description |
|-------|----------|-------------|
| `number` | Yes | Proposition number on the ballot |
| `title` | Yes | Short title (3-6 words) |
| `description` | Yes | Plain-language explanation of what a Yes vote means |
| `recommendation` | No | Set later during guide generation ("Lean Yes", "Lean No", "Your Call") |
| `reasoning` | No | Set later during guide generation |
| `background` | Yes | 2-4 sentences: what's the current law, why it's on the ballot |
| `fiscalImpact` | Yes | Estimated cost/savings, or "Non-binding advisory" for platform signals |
| `supporters` | Yes | Array of organizations/groups supporting |
| `opponents` | Yes | Array of organizations/groups opposing |
| `ifPasses` | Yes | What happens if Yes wins |
| `ifFails` | Yes | What happens if No wins |

**Note:** `caveats` and `confidence` are generated at runtime by the AI guide builder based on the voter's profile, similar to race recommendations.

### Proposition Research Prompt

> Research [PROPOSITION DESCRIPTION] on the [YEAR] [PARTY] primary ballot in Texas.
>
> Provide:
> - 2-4 sentence background (what's the current law, why it's on the ballot, relevant recent legislation)
> - Fiscal impact (estimated cost/savings, or note if non-binding)
> - Organizations/groups supporting (as a list)
> - Organizations/groups opposing (as a list)
> - What happens if it passes
> - What happens if it fails
>
> Format as:
> ```json
> {
>   "number": 1,
>   "title": "Short Title",
>   "description": "Plain-language explanation of what a Yes vote means",
>   "recommendation": "Your Call",
>   "reasoning": "Brief neutral reasoning",
>   "background": "2-4 sentences of context",
>   "fiscalImpact": "Non-binding advisory. If enacted, ...",
>   "supporters": ["Org 1", "Org 2"],
>   "opponents": ["Org 1", "Org 2"],
>   "ifPasses": "What happens if Yes wins",
>   "ifFails": "What happens if No wins"
> }
> ```

---

## Quality Checklist

Before finalizing candidate data:

- [ ] Every candidate on the official ballot is included
- [ ] Names match official ballot exactly
- [ ] Incumbent status is verified
- [ ] Summary is neutral and factual (1-2 sentences)
- [ ] Key positions reflect the candidate's stated platform, not assumptions
- [ ] Endorsements are verified (not just rumored)
- [ ] Pros and cons are balanced and specific to the office
- [ ] Fundraising/polling data has a clear time reference
- [ ] Uncontested races are marked `isContested: false`
- [ ] Key races are identified based on competitiveness and impact
- [ ] No duplicate candidates across races

Before finalizing proposition data:

- [ ] Every proposition on the official ballot is included
- [ ] Proposition numbers match the official ballot
- [ ] Background provides accurate legal/legislative context
- [ ] Fiscal impact is specific (or clearly marked "Non-binding advisory")
- [ ] Supporters and opponents arrays are populated with real organizations
- [ ] ifPasses and ifFails describe concrete outcomes
- [ ] JSON validates without errors

---

## Updating Existing Data

When refreshing data for a subsequent election cycle:

1. Start from the previous cycle's JSON as a template
2. Remove candidates who are no longer running
3. Update incumbency status
4. Re-research all returning candidates (positions and endorsements change)
5. Add new candidates
6. Re-assess which races are key races
7. Update fundraising and polling with current data

---

## Notes

- The `isRecommended` field and `recommendation` block are generated at runtime by the AI guide builder based on the user's profile. Do not hardcode recommendations during research.
- Keep summaries and pros/cons concise. The app displays this in compact mobile views.
- When in doubt about a candidate's position, check their campaign website first, then media coverage. Avoid inferring positions from party affiliation alone.

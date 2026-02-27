# Washington DC Primary Elections — Expansion Plan

**Goal**: Extend txvotes.app to support Washington DC's June 16, 2026 primary elections alongside the existing Texas March 3, 2026 primary.

**Status**: Planning  
**Date**: February 2026

---

## 1. DC Election Overview

### 1.1 Election Structure

DC has a fundamentally different government structure from Texas:

| Feature | Texas | DC |
|---------|-------|----|
| Primary date | March 3, 2026 | June 16, 2026 |
| Primary type | Closed | Semi-open (Initiative 83) |
| Voting method | Traditional | Ranked-choice voting (Initiative 83) |
| Subdivisions | 254 counties | 8 wards, 37 ANCs, ~296 SMDs |
| State FIPS | 48 | 11 |

### 1.2 Offices on the 2026 DC Ballot

**Citywide offices:**
- Mayor (open seat — Bowser term-limited)
- Attorney General
- Council Chair
- Council At-Large (2 seats)
- U.S. House Delegate (non-voting, open seat — Norton retiring)
- Shadow U.S. Senator
- Shadow U.S. Representative (open seat)

**Ward-specific offices (wards 1, 3, 5, 7 in 2026):**
- Council Ward seats
- State Board of Education

**Hyper-local:**
- ANC commissioners (~296 SMDs, all seats)

### 1.3 Ranked-Choice Voting (New in 2026)

Initiative 83 introduces semi-open primaries and RCV. Voters rank up to 5 candidates per race.

### 1.4 Party Landscape

DC is ~76% Democrat, ~16% Independent, ~6% Republican. The Democratic primary is the de facto general election for most races.

---

## 2. Data Sources

| Source | URL | Data |
|--------|-----|------|
| DC Board of Elections | dcboe.org | Official filings, sample ballots |
| Ballotpedia | ballotpedia.org | Candidate lists, office descriptions |
| Open Data DC | opendata.dc.gov | Election datasets via API |
| DC MAR API | citizenatlas.dc.gov | Address-to-ward/ANC/SMD mapping |
| DC Office of Campaign Finance | ocf.dc.gov | Fundraising data |

---

## 3. Architecture Decisions

### 3.1 Single codebase, state-aware routing

Same worker handles TX and DC. State detected via URL path prefix (`/dc/app` for DC, `/app` for TX).

### 3.2 STATE_CONFIG object

Centralize all state-specific settings (election date, parties, issues, source tiers, branding).

### 3.3 RCV Recommendation Schema

Guide responses for DC include ranked recommendations instead of single picks.

---

## 4. KV Key Namespacing

Prefix DC keys with `dc:`:
- `dc:ballot:citywide:{party}_primary_2026`
- `dc:ballot:ward:{ward}:{party}_primary_2026`
- `dc:ward_info:{ward}`
- `dc:manifest`

TX keys remain unchanged for backward compatibility (Phase 1), migrate to `tx:` prefix later.

---

## 5. Address-to-District Mapping

DC uses the MAR API (citizenatlas.dc.gov) instead of Census geocoder. Returns ward, ANC, SMD, voting precinct. Census geocoder as fallback.

---

## 6. Interview Flow Changes

- State selector on first visit
- DC-specific issues (DC Statehood, Metro/WMATA, Government Accountability)
- 4-party selection (Democrat, Republican, Statehood Green, Libertarian + Independent option)
- Address form defaults to DC/Washington

---

## 7. Implementation Phases

1. **Multi-State Infrastructure** (1-2 weeks) — STATE_CONFIG, KV namespacing, state threading
2. **DC Address Resolution** (1 week) — MAR API integration
3. **DC Ballot Data Pipeline** (2 weeks) — Citywide/ward ballot seeding
4. **Interview Flow & PWA** (2 weeks) — State selector, DC issues, RCV UI
5. **Guide Generation for DC** (1-2 weeks) — RCV prompts, ranking schema
6. **Routing, Branding & Polish** (1 week) — /dc/ routes, OG images
7. **Testing & Launch** (1 week) — Full QA, soft launch

**Target**: Mid-May 2026 (4 weeks before DC primary)

---

## 8. Open Questions

- [ ] Register dcvotes.app or usvotes.app?
- [ ] RCV ranking depth (full 5 or top 2-3)?
- [ ] Include ANC commissioner races?
- [ ] Support all 4 parties or just Dem + Rep?
- [ ] TX KV key migration timing?
- [ ] DC MAR API key management?

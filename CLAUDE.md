# US Votes

## Deployment

Primary deployment target is **txvotes.app**. Deploys happen automatically when PRs merge to `main` via GitHub Actions (`.github/workflows/deploy.yml`).

Manual deploy (if needed):
```bash
cd worker && npx wrangler deploy -c wrangler.txvotes.toml
```

After deploying, users may need to visit `https://txvotes.app/app/clear` to flush the service worker cache.

**WARNING:** `npx wrangler deploy` (no `-c` flag) deploys to the legacy atxvotes.app worker. Always use `-c wrangler.txvotes.toml` for txvotes.app.

### Two Workers, Shared KV

| Site | Worker | Config |
|------|--------|--------|
| **txvotes.app** (primary) | `usvotes-api` | `wrangler.txvotes.toml` |
| **atxvotes.app** (legacy) | `atxvotes-api` | `wrangler.toml` |

Both workers share the same `ELECTION_DATA` KV namespace. Daily cron runs on `usvotes-api`; `atxvotes-api` only handles redirects.

### Secrets (txvotes.app)

```bash
cd worker
npx wrangler secret put ANTHROPIC_API_KEY -c wrangler.txvotes.toml
npx wrangler secret put ADMIN_SECRET -c wrangler.txvotes.toml
```

## Architecture

- **worker/src/index.js** — Cloudflare Worker entry point, routing, static pages
- **worker/src/pwa.js** — Single-file PWA: HTML, CSS, and JS served inline from the worker
- **worker/src/pwa-guide.js** — Claude API integration for personalized voting guide generation
- **worker/src/county-seeder.js** — Data population pipeline for county races/info via Claude + web_search
- **worker/src/updater.js** — Daily updater cron (runs on usvotes-api)
- **worker/src/audit-runner.js** — Automated AI audit runner (submits methodology export to ChatGPT, Gemini, Grok, Claude APIs for bias scoring)
- **worker/src/balance-check.js** — API balance/quota checker (`/api/balance-check` endpoint)
- **worker/src/llm-experiment.js** — LLM model comparison experiment runner (7 voter profiles, automated scoring, consensus analysis)

## Testing

```bash
cd worker && npx vitest run
```

### Worktree Testing

Git worktrees (`.claude/worktrees/`) do not include `node_modules`. Before running tests in a worktree, install dependencies first:
```bash
cd worker && npm install && npx vitest run
```

2233 tests across 28 test files:

- **interview-flow.test.js** — Interview flow UI tests (happy-dom + vitest)
- **index-helpers.test.js** — Helper functions, route patterns, candidate profiles, data quality
- **pwa-guide.test.js** — Guide generation, prompt building, ballot filtering, merging, truncation repair, cache key hashing
- **routes.test.js** — Slug generation, sparse candidates, escaping, routing
- **audit-runner.test.js** — AI audit score parsing, provider calls, validation
- **audit-export.test.js** — Audit export sources, completeness, nonpartisan safeguards
- **interview-edge-cases.test.js** — Edge cases for reading levels, state init, navigation
- **updater.test.js** — Daily update validation, election day cutoff, source extraction
- **bias-test.test.js** — Prompt symmetry, loaded language, cross-party treatment
- **county-seeder.test.js** — County info seeding, ballot seeding, precinct maps
- **balance-check.test.js** — Balance scoring, sentiment analysis, specificity checks, rebalance detection
- **token-budget.test.js** — Token budget calculations, large-ballot fixtures, truncation handling
- **new-features.test.js** — Confidence indicators, caching, novelty warnings, data quality page, ballot size checks
- **pwa-ui-features.test.js** — PWA UI feature tests, deep dive framing/balance, error handling, Spanish translations
- **streaming.test.js** — SSE streaming: incremental JSON parser, streaming handler, cache hits, event format
- **smoke.test.js** — Basic smoke tests for deployment validation
- **stats.test.js** — Public stats page rendering, security, caching, i18n, graceful degradation
- **rate-limit.test.js** — Rate limiting logic and edge cases
- **llm-experiment.test.js** — LLM experiment profiles, runner, analysis, scoring, admin endpoints

## Key Patterns

- The PWA is a single inline `<script>` built from a JS array joined with `\n` (`APP_JS`)
- pwa.js is very large (~2300+ lines as string array) — use Grep to find references, read in chunks
- Translations use a `TR` dictionary with `t(key)` function; `lang=es` for Spanish
- Guide generation piggybacks candidate translations onto the same Claude API call when `lang=es`
- Interview flow: Phase 0=auto-advance, 1=Tone, 2=Issues, 3=Spectrum, 4=DeepDives, 5=Qualities, 6=Freeform, 7=Address, 8=Building
- Reading level 1-5 maps to tone instructions in pwa-guide.js; level 7 is the Texas Cowboy easter egg
- Easter egg triggers: keyboard shortcuts ("yeehaw"/"cowboy" for Cowboy), 7-tap secret menu on "Powered by Claude" text, vanity URL /cowboy
- Novelty tone (level 7) shows a warning banner on the ballot page reminding users it's a fun mode
- Guide response caching: SHA-256 hash of inputs, 1-hour TTL in KV, `?nocache=1` query param bypasses cache
- Ballot description caching: `buildCondensedBallotDescription()` output cached in KV keyed by ballot hash, 1-hour TTL
- max_tokens for guide: 2048 English, 4096 Spanish cached, 8192 Spanish fresh
- Token utilization logging: warns at 75%+ of max_tokens; auto-retry with doubled max_tokens (capped at 8192) on truncation
- `repairTruncatedGuide()` attempts partial JSON recovery before throwing on truncated responses
- KV reads in handlePWA_Guide are parallelized via `Promise.all()`
- Uncontested races are stripped of detailed descriptions in ballot data

## Footer Consistency

- There are two sets of footers: static pages (index.js) and PWA app (pwa.js)
- When changing footer styling (colors, links, layout), BOTH must be updated
- Static page footers are in `handleXxx()` functions in index.js
- PWA footer is in the APP_JS string array in pwa.js

## County Seeder

- Error classification system categorizes failures for retry logic
- KV-based progress tracking allows resuming interrupted batch seeds
- 150/254 Texas counties enriched; ~104 still on template data

## Audit System

- Audit runner supports 4 providers: ChatGPT, Gemini, Claude, Grok
- After deploying, always check `/data-quality` and `/audit` pages for regressions
- Cron automations stop after election day

## Contributing Workflow

- **Branch protection** is enabled on `main` — all changes require a PR with passing CI and 1 approving review
- **CI** runs via GitHub Actions (`.github/workflows/test.yml`) on every PR and push to main
- **Auto-deploy** runs via GitHub Actions (`.github/workflows/deploy.yml`) on push to main — deploys to txvotes.app automatically
- **Auto-merge** is enabled — PRs merge automatically once CI passes and review is approved
- **Auto-delete branches** — head branches are deleted after PR merge
- Feature branches → PR → passing tests → review → merge → auto-deploy
- Never push directly to `main` (admins can bypass in emergencies)

### Claude Code workflow

When making code changes, ALWAYS use the feature branch workflow:

1. Create a feature branch: `git checkout -b descriptive-branch-name`
2. Make changes and run tests: `cd worker && npx vitest run`
3. Commit to the feature branch (never directly to `main`)
4. Push and open a PR: `git push -u origin <branch> && gh pr create`
5. Do NOT push directly to `main` — branch protection will reject it

## README

- **Always update README.md** when making changes that affect architecture, file structure, test counts, features, or deployment
- Keep test count (`2233+ tests across 28 test files`) current after adding/removing tests
- Keep file structure tree current after adding/removing source files

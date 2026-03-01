# US Votes

**[txvotes.app](https://txvotes.app)** — A personalized AI voting guide for US elections. Walks any voter through a quick interview about their values, looks up their specific ballot, researches every candidate, and generates personalized recommendations with a printable cheat sheet.

## How It Works

1. **Interview** (2 minutes) — Tap through questions about your top issues, political approach, policy views, candidate qualities, and which primary you're voting in
2. **Address** — Enter your home address so we can find your exact districts and ballot
3. **AI Research** — Claude researches every candidate on your ballot and matches them to your stated values
4. **Your Guide** — Browse personalized recommendations with pros, cons, strategic notes, and honest caveats
5. **Cheat Sheet** — A printable one-page summary to take to the polls

Available in English and Spanish.

## Architecture

A single Cloudflare Worker serves the entire app — landing page, PWA, API routes, and daily election data updates. No build step, no bundler, no framework. Everything is inline JavaScript and CSS.

- **Cloudflare Worker** — serves HTML, handles API routes, runs scheduled updates
- **Claude API** — powers voter profile analysis and candidate recommendations (server-side, secrets never reach the client)
- **KV Storage** — caches election ballot data, guide responses, and ballot descriptions
- **Census Geocoder** — looks up congressional/state districts from street address
- **Local-first** — all voter data stored in `localStorage`, nothing on our servers

## File Structure

```
worker/src/
├── index.js           # Router, landing page, static pages, API endpoints
├── pwa.js             # PWA single-page app (HTML/CSS/JS inline, ~3800 lines)
├── pwa-guide.js       # Server-side Claude API calls for guide + summary
├── county-seeder.js   # Data population pipeline for county races via Claude + web_search
├── updater.js         # Daily cron job to refresh election data in KV
├── audit-runner.js    # AI audit runner (ChatGPT, Gemini, Claude, Grok bias scoring)
├── balance-check.js   # API balance/quota checker
├── rate-limit.js      # Rate limiting
└── usage-logger.js    # Usage logging
worker/tests/
├── 28 test files      # 2233+ tests (vitest + happy-dom)
worker/public/
├── headshots/         # Candidate headshot images
├── og-image*.png/svg  # Open Graph social sharing images
└── favicon*/apple-*   # Favicons and app icons
```

## Deployment

Primary deployment target is **txvotes.app**:

```bash
cd worker && npx wrangler deploy -c wrangler.txvotes.toml
```

| Site | Worker | Config |
|------|--------|--------|
| **txvotes.app** (primary) | `usvotes-api` | `wrangler.txvotes.toml` |
| **atxvotes.app** (legacy) | `atxvotes-api` | `wrangler.toml` |

Both workers share the same `ELECTION_DATA` KV namespace. Daily cron runs on `usvotes-api`; `atxvotes-api` only handles redirects.

## Setup

```bash
cd worker
npx wrangler dev
```

Visit `http://localhost:8787/app` for the PWA, or `http://localhost:8787/` for the landing page.

Requires secrets configured via Wrangler:
```bash
npx wrangler secret put ANTHROPIC_API_KEY -c wrangler.txvotes.toml
npx wrangler secret put ADMIN_SECRET -c wrangler.txvotes.toml
```

## Contributing

**Branch protection is enabled on `main`.** All changes require a pull request with passing CI and at least one approving review.

**Workflow:**
1. Create a feature branch: `git checkout -b my-feature`
2. Make changes and run tests locally: `cd worker && npx vitest run`
3. Push and open a PR: `git push -u origin my-feature && gh pr create`
4. CI runs automatically — tests must pass before merging
5. Get a review, then merge — auto-deploy to txvotes.app on merge

**Automation:**
- **CI** — tests run on every PR and push to main (`.github/workflows/test.yml`)
- **Auto-deploy** — merges to main deploy to txvotes.app automatically (`.github/workflows/deploy.yml`)
- **Auto-merge** — PRs merge automatically once CI passes and review is approved
- **Auto-delete branches** — head branches are cleaned up after merge

## Testing

```bash
cd worker && npx vitest run
```

2233+ tests across 28 test files covering interview flows, guide generation, routing, bias detection, token budgets, audit scoring, rate limiting, SSE streaming, public stats, and more.

## Key Features

- **Interview flow** — 8-phase guided interview (tone, issues, spectrum, deep dives, qualities, freeform, address, building)
- **Bilingual** — Full English/Spanish support via `TR` dictionary with `t(key)` function
- **Smart caching** — SHA-256 hashed guide responses (1-hour TTL), ballot description caching
- **Truncation repair** — Auto-retry with doubled token budget on truncation, partial JSON recovery
- **AI audit system** — Automated bias scoring across 4 AI providers (ChatGPT, Gemini, Claude, Grok)
- **County seeder** — Batch data enrichment pipeline for all 254 Texas counties
- **Easter eggs** — Texas Cowboy mode (reading level 7), secret menu, vanity URLs

## Credits

Created by [Joshua Baer](https://joshuabaer.com), Austin TX — 2025
Powered by [Claude](https://anthropic.com) (Anthropic)

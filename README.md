# Texas Votes

**[txvotes.app](https://txvotes.app)** — A personalized AI voting guide for Texas. Walks any voter through a quick interview about their values, looks up their specific ballot, researches every candidate, and generates personalized recommendations with a printable cheat sheet.

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
├── 16 test files      # 1232+ tests (vitest + happy-dom)
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
| **txvotes.app** (primary) | `txvotes-api` | `wrangler.txvotes.toml` |
| **atxvotes.app** (legacy) | `atxvotes-api` | `wrangler.toml` |

Both workers share the same `ELECTION_DATA` KV namespace. Daily cron runs on `atxvotes-api` only; `txvotes-api` reads the same data.

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

## Testing

```bash
cd worker && npx vitest run
```

1232+ tests across 16 test files covering interview flows, guide generation, routing, bias detection, token budgets, audit scoring, rate limiting, and more.

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

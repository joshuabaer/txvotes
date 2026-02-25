# ATX Votes

A personalized voting guide for Austin, Texas. Walks any voter through a quick interview about their values, looks up their specific ballot, researches every candidate, and generates personalized recommendations with a printable cheat sheet.

## How It Works

1. **Interview** (2 minutes) — Tap through questions about your top issues, political approach, policy views, candidate qualities, and which primary you're voting in
2. **Address** — Enter your home address so we can find your exact districts and ballot
3. **AI Research** — Claude researches every candidate on your ballot and matches them to your stated values
4. **Your Guide** — Browse personalized recommendations with pros, cons, strategic notes, and honest caveats
5. **Cheat Sheet** — A printable one-page summary to take to the polls (since Travis County doesn't allow phones in the booth)

## Architecture

A single Cloudflare Worker serves the entire app — landing page, PWA, API routes, and daily election data updates. No build step, no bundler, no framework. Everything is inline JavaScript and CSS.

- **Cloudflare Worker** — serves HTML, handles API routes, runs scheduled updates
- **Claude API** — powers voter profile analysis and candidate recommendations (server-side, secrets never reach the client)
- **KV Storage** — caches election ballot data, refreshed daily via cron
- **Census Geocoder** — looks up congressional/state districts from street address
- **Local-first** — all voter data stored in `localStorage`, nothing on our servers

## File Structure

```
worker/src/
├── index.js        # Router, landing page, static pages, API endpoints
├── pwa.js          # PWA single-page app (HTML/CSS/JS inline)
├── pwa-guide.js    # Server-side Claude API calls for guide + summary
└── updater.js      # Daily cron job to refresh election data in KV
worker/public/
└── headshots/      # Candidate headshot images (static assets)
```

## Setup

```bash
cd worker
npx wrangler dev
```

Visit `http://localhost:8787/app` for the PWA, or `http://localhost:8787/` for the landing page.

Requires secrets configured via `npx wrangler secret put`:
- `ANTHROPIC_API_KEY` — your Anthropic API key
- `ADMIN_SECRET` — secret for the manual election data trigger endpoint

## Deploy

```bash
cd worker
npx wrangler deploy
```

## Credits

Created by Joshua Baer, Austin TX — February 2026
Powered by Claude (Anthropic)

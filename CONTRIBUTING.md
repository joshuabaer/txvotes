# Contributing to US Votes

Thanks for your interest in contributing to [txvotes.app](https://txvotes.app)! This guide covers everything you need to get started.

## Prerequisites

- **Node.js** and **npm**
- **Cloudflare account** with the [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npx wrangler`)
- **API keys:**
  - `ANTHROPIC_API_KEY` (required) — powers guide generation and candidate research
  - `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROK_API_KEY` (optional) — for multi-LLM audit scoring

## Getting Started

```bash
git clone git@github.com:joshuabaer/txvotes.git
cd txvotes/worker
npm install
```

Configure secrets for local development:

```bash
npx wrangler secret put ANTHROPIC_API_KEY -c wrangler.txvotes.toml
npx wrangler secret put ADMIN_SECRET -c wrangler.txvotes.toml
```

Start the local dev server:

```bash
npx wrangler dev -c wrangler.txvotes.toml
```

Visit `http://localhost:8787/app` for the PWA, or `http://localhost:8787/` for the landing page.

> **Footgun warning:** Always use `-c wrangler.txvotes.toml`. Running bare `npx wrangler deploy` (no `-c` flag) deploys to the legacy **atxvotes.app** worker, not txvotes.app.

## Running Tests

```bash
cd worker && npx vitest run
```

1629+ tests across 19 test files. Tests use **vitest** + **happy-dom** for DOM testing. Always run the full test suite before submitting a PR.

## Architecture Overview

The entire app is a single Cloudflare Worker -- no build step, no bundler, no framework.

| File | Purpose |
|------|---------|
| `worker/src/index.js` | Main entry point, routing, static pages |
| `worker/src/pwa.js` | Single-file PWA served inline (~3800 lines as a string array) |
| `worker/src/pwa-guide.js` | Claude API integration for guide generation |
| `worker/src/county-seeder.js` | Data population pipeline for county races via Claude + web_search |
| `worker/src/updater.js` | Daily cron job to refresh election data in KV |
| `worker/src/audit-runner.js` | Automated AI audit runner (ChatGPT, Gemini, Claude, Grok) |
| `worker/src/balance-check.js` | API balance/quota checker |

## Code Style Notes

- **pwa.js** is a JS string array joined with `\n` to produce the entire PWA HTML/CSS/JS. Edit carefully -- it's not a normal source file.
- **Translations** use `data-t` attributes and a `TR` dictionary with a `t(key)` helper function. Spanish is activated with `lang=es`.
- **Two sets of footers** exist: static pages (in `index.js`) and the PWA app (in `pwa.js`). If you change footer styling, update both.

## Pull Request Workflow

Branch protection is enabled on `main` -- no direct pushes allowed.

1. **Create a feature branch:** `git checkout -b my-feature`
2. **Make changes and run tests:** `cd worker && npx vitest run`
3. **Push and open a PR:** `git push -u origin my-feature && gh pr create`
4. **CI runs automatically** -- tests must pass before merging
5. **Get a review** (1 approval required), then merge

**Automation after merge:**
- **Auto-merge** kicks in once CI passes and review is approved
- **Auto-deploy** pushes to txvotes.app via GitHub Actions
- **Auto-delete** cleans up the head branch

## Reporting Issues

Please use [GitHub Issues](https://github.com/joshuabaer/txvotes/issues) for bugs and feature requests.

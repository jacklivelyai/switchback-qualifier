# Switch Back Qualifier Landing Page

## What This Is

A single landing page that sits between a Facebook ad and a free novella signup. Visitors from the ad land here, read a first-chapter excerpt, and if they're interested enough to scroll through it, they reach a signup form at the bottom. This filters out low-intent freebie seekers and retains genuine thriller readers.

Two Facebook ads (V3 and V7) now run as an A/B test, pointing at the landing page with `?v=1` and `?v=2`. Subscribers are tagged with an `ad_variant` custom field in MailerLite. A read-only dashboard monitors test performance.

## Live URLs

- **Production:** https://switchback-qualifier.netlify.app
- **Dashboard:** https://switchback-qualifier.netlify.app/dashboard.html (noindex, not linked from landing page)
- **Repo:** https://github.com/jacklivelyai/switchback-qualifier

## Project Structure

```
switchback-qualifier/
├── CLAUDE.md           ← You are here
├── .gitignore          (.env, .DS_Store, .netlify)
├── index.html          Single-file landing page (HTML + inline CSS + JS)
├── dashboard.html      A/B test dashboard (inline CSS + JS, noindex)
├── NETLIFY-SETUP.md    Manual Netlify setup instructions (legacy — CLI handles deploy now)
├── netlify/
│   └── functions/
│       ├── subscribe.js      Serverless MailerLite API proxy for signups
│       └── dashboard-api.js  Dashboard backend (?action=stats, ?action=test-pipeline)
└── images/
    ├── jack-lively-logo.webp   Header logo
    └── switch-back-cover.jpg   Book cover (optimized, 323KB)
```

## Tech Stack

- **Plain HTML/CSS/JS.** No frameworks, no build step, no bundler.
- **MailerLite API** for email signup (via Netlify Function proxy) and dashboard data.
- **Netlify** for hosting. Deployed via `netlify deploy --prod --dir=.` from repo root.
- **GitHub** repo: `jacklivelyai/switchback-qualifier`. Auto-deploy from GitHub is NOT configured — deploy manually via Netlify CLI after pushing.

## Design Decisions

- **Dark navy theme** (`#0d1f2d` background) matching the author's existing book pages
- **Inter** (sans-serif) for headings ("SWITCH BACK", "Chapter One")
- **Source Sans 3** for body text
- **Playfair Display** for the signup section heading and excerpt drop cap
- **Logo is an image** (`jack-lively-logo.webp`), not rendered text
- **Email-only signup** — no name field

## Content Sources

All content inputs live in the Obsidian project folder:
`/Users/ramonbloomberg/Dropbox/OBSIDIAN FOLDER/!AGENT MACRO/LEAD FUNNEL BOT/`

- Blurb and excerpt text: `SwitchBack excerpt and Blurb.md`
- Project spec: `Agent Micro - Reader Funnel — Qualifier Test.md`
- Cross-agent memory: `memory.md`

## Constraints — Do NOT

- Add frameworks, build tools, or compile steps
- Hardcode the MailerLite API key in committed source (stored as Netlify env var `MAILERLITE_API_KEY`)
- Modify the existing Facebook LeadGen flow in MailerLite — this test runs in parallel

## Deploy Workflow

```bash
# From /Users/ramonbloomberg/switchback-qualifier
git add <files>
git commit -m "description"
git push origin main
netlify deploy --prod --dir=.
```

## MailerLite Integration

- Signup form POSTs to `/.netlify/functions/subscribe`, which proxies to MailerLite API
- Subscribers go into group `QUALIFIER TEST - SWITCHBACK` (ID: `180021804830558048`)
- URL param `?v=` is captured and stored as `ad_variant` custom field on the subscriber
- Automation `LVL 01 QUALIFIER - SWITCHBACK` (ID: `180021816997185231`) delivers the ebook
- API key stored as Netlify env var, never in source

## Dashboard

- `dashboard.html` + `dashboard-api.js` — read-only A/B test monitor
- Shows subscriber counts per variant, engagement rates, automation health
- "Test Everything" button runs 5 pipeline health checks
- Auto-refreshes every 60 seconds
- No authentication (internal tool, URL not public, noindex)
- No page-hit tracking — Facebook Ads Manager + Meta Pixel cover top-of-funnel metrics

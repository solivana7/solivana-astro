# SoliVana Astro

**Astrology for self-reflection and entertainment.**

Live at [astro.solivana.io](https://astro.solivana.io) — part of the [SoliVana](https://solivana.io) wellness-AI suite.

## What it does

SoliVana Astro turns a birth date, time, and place into a personalized astrological reading that blends two traditions:

- **Vedic (Jyotish)** — sidereal chart, lagna, nakshatras, yogas, Vimshottari dasha timeline
- **Western (tropical)** — Placidus houses, aspects, psychological portrait

The AI pipeline writes an eight-chapter master report — executive summary, six interpretation chapters (life purpose, finances, health & vitality, relationships, career & business, timing & forecast), and a five-year action plan — then renders it to **PDF**, **DOCX**, and an **iCal** file of key dates and dasha transitions, delivered by email and downloadable for 30 days.

## Architecture

```
birth data → Swiss Ephemeris chart → Claude section pipeline → synthesis → exports
```

1. **Chart calculation** — a Python microservice (`api/chart-calculate.py`, flatlib) computes the full chart; a JS fallback route (`swisseph`) takes over if the primary is unavailable, with retries between them. Results are cached in Postgres by a canonical birth-param hash.
2. **Reading pipeline** — a Next.js `after()` background job generates each chapter with Claude through structured prompt builders, synthesizes the master report, renders PDF/DOCX/iCal, stores reports as private blobs, and emails the download link.
3. **Data layer** — Vercel Postgres (Neon) via Drizzle ORM; private Vercel Blob storage streams downloads only through an expiry-checked route.
4. **Hygiene** — a daily Vercel cron (`04:00 UTC`) deletes readings older than 30 days together with their blobs, in batches.

## Engineering highlights

- Fully typed `ChartData` schema shared from the ephemeris layer to the prompt builders to the export renderers
- Zod-validated API input, guarded internal chart endpoints (`x-internal-secret`) and cron (`CRON_SECRET` bearer)
- Offline geocoding over a bundled GeoNames `cities15000` dataset — no external location API at runtime
- Retry with fallback between the Python and JS chart services; chart cache keyed by canonical birth params
- 15 Vitest suites / 87 tests covering the pipeline, routes, report generators, and cron, plus a Playwright smoke suite

## Stack

- **Framework:** Next.js 16 (App Router, React 19, Tailwind 4, shadcn/ui)
- **Chart:** Swiss Ephemeris (`swisseph` JS + flatlib Python service)
- **AI:** Anthropic Claude (OpenAI-compatible endpoint), model override via env
- **Data:** Vercel Postgres (Neon) + Drizzle ORM, Vercel Blob
- **Exports:** `@react-pdf/renderer`, `docx`, `ical-generator`
- **Email:** Resend · **Payments:** Stripe Payment Link

## Environment variables

Names only — no values are committed. See `.env.example` for the full list.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store token |
| `ANTHROPIC_API_KEY` | Claude API key |
| `AI_MODEL` | Optional model override (default `claude-sonnet-4-6`) |
| `RESEND_API_KEY` / `FROM_EMAIL` | Transactional email |
| `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` | Payment Link checkout |
| `INTERNAL_API_SECRET` | Internal chart-endpoint shared secret |
| `CRON_SECRET` | Cleanup-cron bearer token |
| `APP_URL` | Public app URL |

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your own values
npx drizzle-kit migrate
npm run dev
```

Tests: `npm test` (Vitest) · `npm run test:e2e` (Playwright) · `npm run typecheck` · `npm run lint`

---

Portfolio — code shared for review, not licensed for reuse.

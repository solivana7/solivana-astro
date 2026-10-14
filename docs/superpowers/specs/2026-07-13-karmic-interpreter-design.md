# Karmic Interpreter — Design Specification

> **Status note (2026-07-20):** This is the original approved design. As implemented, the app differs in a few places: the AI provider is **Anthropic Claude** (`claude-sonnet-4-6` via the OpenAI-compatible endpoint), not Kimi/Moonshot; Postgres and Blob are **Vercel-managed resources** (Neon integration + private store `karmic-reports`), not manually pasted env vars; production serves **astro.solivana.io**; report downloads stream **private** blobs through the download route rather than public signed URLs. `AGENTS.md` is the living source of truth; where this document and the code disagree, the code wins.

**Date:** 2026-07-13  
**Status:** Approved for implementation  
**Repo:** `karmic-interpreter-app`  
**Deployment:** Vercel via GitHub integration

## 1. Summary

Build **Karmic Interpreter**, a full-stack web application that generates comprehensive dual-system (Vedic + Western) astrological natal chart readings from a user's birth data. The app produces a 100+ page personalized reading with interactive chart wheels, AI-generated interpretations covering all life areas, downloadable reports (DOCX, PDF), and a calendar export (.ics) containing all major milestones and reminders.

## 2. Goals

- Let users enter birth data via a polished, multi-step form with location autocomplete.
- Calculate precise Vedic and Western chart data using Swiss Ephemeris / flatlib.
- Generate six AI interpretation sections plus a synthesized master report via the Kimi / Moonshot API.
- Render interactive SVG chart wheels (Vedic South Indian and Western circular).
- Export DOCX, PDF, and ICS files and deliver them by email via Resend.
- Deploy automatically to Vercel on every push to GitHub.
- Make the experience viral and shareable: cinematic landing, shareable chart images, post-reading referrals.

## 3. Architecture

We will use **Approach A: a Vercel-native Next.js monolith**.

- **Frontend & API:** Next.js 15+ App Router (React 19, TypeScript, Tailwind CSS 3.4, shadcn/ui).
- **Database:** Vercel Postgres (Neon) — replaces the spec's SQLite because Vercel's filesystem is ephemeral.
- **Object storage:** Vercel Blob for generated DOCX, PDF, and ICS files.
- **Chart engine:** Vercel Python serverless function running `flatlib` + `swisseph`. A JS ephemeris fallback is included for resilience.
- **AI:** Kimi / Moonshot API (`moonshot-v1-128k`) called from Next.js API routes.
- **Email:** Resend.
- **Geocoding:** Nominatim OpenStreetMap API (free, no key).
- **Report generation:**
  - DOCX: `docx` npm package.
  - PDF: `@react-pdf/renderer` or `puppeteer-core` with Vercel-compatible Chrome.
  - ICS: `ical-generator`.

### 3.1 System Diagram (High Level)

```
Browser
  │
  ▼
Next.js App (Vercel)
  ├── App Router pages (/, /reading, /reading/[id]/processing, /reading/[id])
  ├── App Router API routes (/api/reading/*, /api/chart/calculate)
  ├── Python Vercel function (/api/chart-calculate.py)
  │
  ├── Vercel Postgres (users, readings, report_sections, chart_cache)
  ├── Vercel Blob (report files)
  │
  ├── Kimi / Moonshot AI
  ├── Resend
  └── Nominatim
```

## 4. Data Model

### 4.1 `users`

| Column     | Type        | Notes |
| ---------- | ----------- | ----- |
| id         | UUID PK     |       |
| name       | text        |       |
| email      | text unique |       |
| created_at | timestamp   |       |

### 4.2 `readings`

| Column           | Type          | Notes                                          |
| ---------------- | ------------- | ---------------------------------------------- |
| id               | UUID PK       |                                                |
| user_id          | FK → users.id |                                                |
| status           | text          | `pending`, `processing`, `completed`, `failed` |
| birth_data_json  | jsonb         |                                                |
| chart_data_json  | jsonb         | null until calculated                          |
| focus_areas_json | jsonb         | default all six areas                          |
| progress         | integer       | 0–100                                          |
| current_step     | text          | human-readable step                            |
| created_at       | timestamp     |                                                |
| completed_at     | timestamp     | nullable                                       |
| expires_at       | timestamp     | 30 days from creation                          |
| report_docx_url  | text          | Vercel Blob URL                                |
| report_pdf_url   | text          | Vercel Blob URL                                |
| report_ics_url   | text          | Vercel Blob URL                                |
| tokens_used      | integer       |                                                |
| ai_model         | text          | default `moonshot-v1-128k`                     |
| error_message    | text          | nullable                                       |

### 4.3 `report_sections`

| Column       | Type             | Notes                                                                       |
| ------------ | ---------------- | --------------------------------------------------------------------------- |
| id           | UUID PK          |                                                                             |
| reading_id   | FK → readings.id |                                                                             |
| section_type | text             | `life_purpose`, `finances`, `health`, `relationships`, `business`, `timing` |
| title        | text             |                                                                             |
| content      | text             | markdown                                                                    |
| generated_at | timestamp        |                                                                             |
| tokens_used  | integer          |                                                                             |

### 4.4 `chart_cache`

| Column          | Type      | Notes                            |
| --------------- | --------- | -------------------------------- |
| chart_hash      | text PK   | SHA256 of canonical birth params |
| chart_data_json | jsonb     |                                  |
| created_at      | timestamp |                                  |

## 5. API Routes

| Method | Route                                   | Purpose                                             |
| ------ | --------------------------------------- | --------------------------------------------------- |
| POST   | `/api/reading/create`                   | Submit birth data, create reading, trigger pipeline |
| GET    | `/api/reading/[id]/status`              | Poll status, progress, current step, report URLs    |
| GET    | `/api/reading/[id]/result`              | Return reading, chart data, sections                |
| GET    | `/api/reading/[id]/download?format=docx | pdf                                                 | ics` | Redirect to signed Vercel Blob URL |
| POST   | `/api/chart/calculate`                  | Calculate chart (Python function or JS fallback)    |
| GET    | `/api/geocode?q=...`                    | Proxy Nominatim autocomplete                        |

## 6. Frontend Pages & Components

### 6.1 Pages

- `/` — Landing page: cinematic hero, starfield canvas, feature grid, social proof, sample report CTA.
- `/reading` — Multi-step birth form (name/email → birth details → location → focus areas).
- `/reading/[id]/processing` — Animated progress pipeline, polls status every 3s, auto-redirects.
- `/reading/[id]` — Results dashboard: sticky nav, markdown sections, interactive chart wheel, downloads, share CTA.

### 6.2 Key Components

- `StarfieldBackground` — Canvas 2D particle system.
- `BirthForm` — Step wizard with validation and location autocomplete.
- `ProcessingView` — 6-stage animated progress.
- `ResultsDashboard` — 3-column layout.
- `ChartWheelVedic` — SVG South Indian square chart.
- `ChartWheelWestern` — SVG circular chart.
- `ReportSection` — Markdown renderer with custom styling.
- `CalendarExportCard` — Prominent .ics download + Google Calendar import.
- `ShareCard` — Chart image export, referral link, gift-a-reading CTA.

## 7. Chart Engine

Primary: **Python serverless function** (`api/chart-calculate.py`) using `flatlib`.

Input: `{ date, time, timezone, lat, lon }`
Output: `ChartData` JSON matching the spec's structure:

- `birthInfo`
- `planets` (tropical + sidereal + nakshatra)
- `houses`
- `vedicSummary`
- `westernSummary`
- `dashaTimeline`
- `yogas`
- `westernAspects`

Fallback: a JS ephemeris library (`swisseph` or `ephemeris-js`) in `/api/chart/calculate` if the Python function is unavailable.

Cache: Results are cached in `chart_cache` by SHA256 hash of normalized birth parameters.

Note on Python functions with Next.js: Vercel supports Python serverless functions in a root-level `api/` directory (e.g., `api/chart-calculate.py`). These coexist with Next.js App Router API routes (`app/api/...`) and are served at the same `/api/*` path namespace.

## 8. AI Interpretation Pipeline

The pipeline runs inside the `create` API route (or a dedicated serverless invocation) and updates the `readings` row as it progresses.

1. **Calculate chart** (10%) — fetch or compute `ChartData`.
2. **Render chart SVGs** (20%) — generate Vedic and Western SVG strings.
3. **Generate sections** (30%–60%) — 6 parallel calls to Kimi API:
   - `life_purpose`
   - `finances`
   - `health`
   - `relationships`
   - `business`
   - `timing`
4. **Synthesize master report** (70%) — combine sections into one cohesive markdown document with executive summary, integrated 5-year plan, and technical appendix.
5. **Generate exports** (80%–95%) — DOCX, PDF, ICS, uploaded to Vercel Blob.
6. **Finalize** (100%) — mark complete, send Resend email.

Each prompt is stored in `lib/prompts/` and follows the spec's persona + context + mission structure.

### 8.1 Calendar Export Requirements

The ICS must include **all major milestones** extracted from the Timing section and other relevant transits. Categories: `Opportunity`, `Warning`, `Transition`, `Advice`. Each event has a `VALARM` reminder 3–7 days before. The UI provides a prominent "Download Calendar (.ics)" button and a Google Calendar import link.

## 9. Report Generation

- **DOCX:** `docx` npm package with custom styling (Georgia headings, Inter body, warm colors).
- **PDF:** `@react-pdf/renderer` or `puppeteer-core` rendered from the master markdown/HTML.
- **ICS:** `ical-generator` with all-day events and VALARM reminders.

Files are uploaded to Vercel Blob and served via signed download URLs.

## 10. Deployment & Operations

- **GitHub repo:** `karmic-interpreter-app`
- **Vercel project:** linked to the GitHub repo for automatic deploys on push.
- **Environment variables (Vercel):**
  - `DATABASE_URL` — Vercel Postgres connection string
  - `BLOB_READ_WRITE_TOKEN` — Vercel Blob token
  - `KIMI_API_KEY` — Moonshot API key
  - `RESEND_API_KEY` — Resend API key
  - `FROM_EMAIL` — sender email
  - `APP_URL` — production app URL
  - `NODE_ENV`
- **Migrations:** Drizzle Kit run locally against `DATABASE_URL` before deploy; Vercel build step can also run migrations.
- **Rate limiting:** 3 reading creations per email per day.

## 11. Error Handling & Resilience

- Chart calculation: 3 retries with exponential backoff; JS fallback if Python fails.
- AI section generation: per-section retry (2 attempts); failure marks reading as failed with a user-facing message.
- Report generation: retry once; if a single export fails, mark reading complete but omit that file.
- Vercel function timeout: target < 300s. If the pipeline risks exceeding, split stage 3 (AI sections) into a background continuation pattern.
- Failed readings show a "Try again" button and preserve submitted birth data.

## 12. Testing Strategy

- **Unit:** Zod validation, prompt builders, chart hash functions.
- **Integration:** API route tests with mocked Kimi/Resend/Nominatim.
- **E2E:** Playwright flow from form submission to results page (mock AI responses).
- **Validation:** Lisbon reference chart must match spec constants.

## 13. Out of Scope for v1

- User accounts / login history
- Payments / subscriptions
- Relationship compatibility reports
- Transit forecasts
- Multi-language support
- Admin dashboard

## 14. Open Questions / Decisions

- Confirm Vercel Pro plan for 300s function timeout, or design queue-based continuation.
- Confirm `FROM_EMAIL` domain is verified in Resend.
- Confirm Kimi API credits sufficient for development testing.

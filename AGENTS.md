<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Karmic Interpreter Conventions

## Infrastructure

All backing services are Vercel-managed and visible in the dashboard under Storage:

- **Postgres:** Neon integration `karmic-postgres` — sets `DATABASE_URL` and the `POSTGRES_*` family for all environments.
- **Blob:** private store `karmic-reports` — reports are private blobs; downloads stream through `/api/reading/[id]/download` after its expiry check.
- **Domain:** production serves `https://astro.solivana.io` (assigned to this project; `APP_URL` points there).

Provision new services through Vercel integrations (dashboard → Storage), never by pasting manual env vars. `vercel env pull` fetches working local credentials, so local dev runs the full stack.

## Database

- Use `lib/db/index.ts` for all database queries and connection access.
- Schema lives in `lib/db/schema.ts`.
- Run `npx drizzle-kit generate` after any schema change to generate a new migration.
- Apply migrations with `npx drizzle-kit migrate`.

## Workflow

- Before committing, all must pass: `npm test`, `npm run typecheck`, `npm run lint`.
- Conventional commits (`feat`/`fix`/`chore`/`test`/`docs`).
- Pushing to `dev` auto-deploys to production. After a deploy, verify the full reading flow with a real request (create → status → result → download).

## Serverless gotchas

- Post-response work (the reading pipeline) must run via `after()` from `next/server` — floating promises get frozen by the platform mid-run. Routes using `after` set `export const maxDuration = 300`.
- Tests call route handlers without a request scope, so `after` is mocked as a no-op in the vitest files that exercise those routes.
- `swisseph` is imported dynamically in the chart fallback route so builds don't require the native module; the route returns 503 when it's unavailable.

## Data

- **Cities:** `lib/data/cities.json` (GeoNames cities15000, CC-BY) powers `/api/geocode` offline; rebuild with `node scripts/build-cities.mjs`.
- **Expiry:** a daily Vercel cron (`vercel.json` → `/api/cron/cleanup`) deletes readings 30+1 days old with their blobs, in batches of 200.

## Environment Variables

The following variables are required for the app to run:

- `DATABASE_URL` — PostgreSQL connection string (managed by the Neon integration)
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob token (managed by the Blob store connection)
- `ANTHROPIC_API_KEY` — Anthropic (Claude) API key
- `AI_MODEL` — Optional Claude model override (defaults to `claude-sonnet-4-6`)
- `INTERNAL_API_SECRET` — Shared secret for internal chart endpoints (`x-internal-secret` header)
- `CRON_SECRET` — Bearer token for the daily cleanup cron (`/api/cron/cleanup`)
- `RESEND_API_KEY` — Resend API key
- `FROM_EMAIL` — Sender email address
- `APP_URL` — Public app URL

Keep `.env.local` out of Git. It is already ignored; do not commit it. Use `.env.example` for documenting required variables.

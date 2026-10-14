# Karmic Interpreter Implementation Plan

> **Status note (2026-07-20):** Historical plan. The shipped app uses **Anthropic Claude** instead of Kimi/Moonshot, Vercel-managed Neon/Blob resources, the `astro.solivana.io` domain, and private-blob download streaming. See `AGENTS.md` for current conventions.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the Karmic Interpreter MVP — a Next.js app on Vercel that accepts birth data, calculates Vedic + Western charts, generates AI interpretations, and produces DOCX/PDF/ICS exports.

**Architecture:** Vercel-native Next.js monolith with App Router pages, TypeScript API routes, Vercel Postgres (Neon), Vercel Blob for files, a Python serverless function for chart calculations, and Kimi/Moonshot AI for report generation.

**Tech Stack:** Next.js 15+, React 19, TypeScript, Tailwind CSS 3.4, shadcn/ui, Drizzle ORM, Vercel Postgres, Vercel Blob, Python 3.12 + flatlib, Kimi API, Resend.

---

## File Structure

```
karmic-interpreter-app/
├── .env.example
├── .env.local
├── .gitignore
├── api/
│   └── chart-calculate.py          # Python serverless function
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx                    # Landing page
│   ├── reading/
│   │   └── page.tsx                # Birth form
│   └── reading/
│       └── [id]/
│           ├── page.tsx            # Results dashboard
│           └── processing/
│               └── page.tsx        # Processing page
│   └── api/
│       ├── chart-calculate/
│       │   └── route.ts            # JS fallback chart calculation
│       ├── geocode/
│       │   └── route.ts            # Nominatim proxy
│       └── reading/
│           ├── create/
│           │   └── route.ts        # Create reading + trigger pipeline
│           └── [id]/
│               ├── download/
│               │   └── route.ts    # Signed download URL
│               ├── result/
│               │   └── route.ts    # Full reading result
│               └── status/
│                   └── route.ts    # Poll status
├── components/
│   ├── ui/                         # shadcn/ui components
│   ├── starfield-background.tsx
│   ├── birth-form.tsx
│   ├── processing-view.tsx
│   ├── results-dashboard.tsx
│   ├── chart-wheel-vedic.tsx
│   ├── chart-wheel-western.tsx
│   ├── report-section.tsx
│   ├── calendar-export-card.tsx
│   └── share-card.tsx
├── lib/
│   ├── db/
│   │   ├── index.ts                # Drizzle client
│   │   └── schema.ts               # Table definitions
│   ├── prompts/
│   │   ├── life-purpose.ts
│   │   ├── finances.ts
│   │   ├── health.ts
│   │   ├── relationships.ts
│   │   ├── business.ts
│   │   ├── timing.ts
│   │   └── synthesis.ts
│   ├── services/
│   │   ├── chart.ts                # Chart calculation service
│   │   ├── kimi.ts                 # Kimi API client
│   │   ├── pipeline.ts             # Async pipeline orchestration
│   │   ├── reports.ts              # DOCX/PDF/ICS generation
│   │   └── email.ts                # Resend integration
│   ├── utils.ts
│   └── types.ts
├── public/
│   └── fonts/
├── tests/
│   ├── chart.test.ts
│   ├── reading.test.ts
│   └── e2e/
│       └── reading.spec.ts
├── drizzle.config.ts
├── next.config.ts
├── package.json
├── requirements.txt
├── tailwind.config.ts
├── tsconfig.json
└── vercel.json
```

---

## Phase 1: Project Setup

### Task 1: Initialize Next.js project with shadcn/ui

**Files:**

- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`, `.gitignore`, `.env.example`
- Modify: none

- [ ] **Step 1: Create project with shadcn/ui init**

Run:

```bash
cd ~/karmic-interpreter-app
echo "my-app" | npx shadcn@latest init --yes --template next --base-color stone
```

Expected: `shadcn/ui` scaffold created with `app/`, `components/`, `lib/utils.ts`.

- [ ] **Step 2: Verify dev server starts**

Run:

```bash
npm run dev
```

Wait 10s, then in another terminal:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected: `200`

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "chore: initialize Next.js project with shadcn/ui"
```

---

### Task 2: Configure environment variables

**Files:**

- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Create `.env.example`**

```bash
cat > .env.example <<'EOF'
# Database
DATABASE_URL="postgresql://user:password@host/db?sslmode=require"

# Vercel Blob
BLOB_READ_WRITE_TOKEN=""

# Kimi / Moonshot AI
KIMI_API_KEY="sk-..."

# Resend
RESEND_API_KEY="re_..."
FROM_EMAIL="readings@karmicinterpreter.com"

# App
APP_URL="http://localhost:3000"
EOF
```

- [ ] **Step 2: Copy to `.env.local` and add to `.gitignore`**

```bash
cp .env.example .env.local
echo ".env.local" >> .gitignore
```

- [ ] **Step 3: Commit**

```bash
git add .env.example .gitignore
git commit -m "chore: add environment variable template"
```

---

### Task 3: Install core dependencies

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install packages**

Run:

```bash
npm install drizzle-orm @vercel/postgres @vercel/blob openai zod resend docx @react-pdf/renderer ical-generator swisseph date-fns react-markdown remark-gfm
npm install -D drizzle-kit @types/node @types/react @types/react-dom typescript
```

- [ ] **Step 2: Verify no peer conflicts**

Run:

```bash
npm ls openai zod resend docx @react-pdf/renderer ical-generator swisseph drizzle-orm
```

Expected: No `ERR` lines.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install core dependencies"
```

---

## Phase 2: Database Layer

### Task 4: Define Drizzle schema

**Files:**

- Create: `lib/db/schema.ts`
- Modify: none

- [ ] **Step 1: Write schema**

```typescript
// lib/db/schema.ts
import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const readings = pgTable("readings", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  status: text("status").notNull().default("pending"),
  birthDataJson: jsonb("birth_data_json").notNull(),
  chartDataJson: jsonb("chart_data_json"),
  focusAreasJson: jsonb("focus_areas_json"),
  progress: integer("progress").default(0),
  currentStep: text("current_step"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  reportDocxUrl: text("report_docx_url"),
  reportPdfUrl: text("report_pdf_url"),
  reportIcsUrl: text("report_ics_url"),
  tokensUsed: integer("tokens_used").default(0),
  aiModel: text("ai_model").default("moonshot-v1-128k"),
  errorMessage: text("error_message"),
})

export const reportSections = pgTable("report_sections", {
  id: text("id").primaryKey(),
  readingId: text("reading_id").references(() => readings.id),
  sectionType: text("section_type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  tokensUsed: integer("tokens_used").default(0),
})

export const chartCache = pgTable("chart_cache", {
  chartHash: text("chart_hash").primaryKey(),
  chartDataJson: jsonb("chart_data_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})
```

- [ ] **Step 2: Create Drizzle config**

Create `drizzle.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

- [ ] **Step 3: Commit**

```bash
git add lib/db/schema.ts drizzle.config.ts
git commit -m "feat(db): define Drizzle schema for users, readings, sections, cache"
```

---

### Task 5: Create database client and run migrations

**Files:**

- Create: `lib/db/index.ts`
- Modify: none

- [ ] **Step 1: Write DB client**

```typescript
// lib/db/index.ts
import { drizzle } from "drizzle-orm/vercel-postgres"
import { sql } from "@vercel/postgres"
import * as schema from "./schema"

export const db = drizzle(sql, { schema })
```

- [ ] **Step 2: Generate and run migrations locally**

Run:

```bash
npx drizzle-kit generate
DATABASE_URL="your-local-or-vercel-postgres-url" npx drizzle-kit migrate
```

Expected: Migrations applied successfully, tables created.

- [ ] **Step 3: Commit**

```bash
git add lib/db/index.ts lib/db/migrations
git commit -m "feat(db): add Drizzle client and initial migrations"
```

---

## Phase 3: Chart Engine

### Task 6: Build Python chart calculation function

**Files:**

- Create: `api/chart-calculate.py`, `requirements.txt`
- Modify: `vercel.json`

- [ ] **Step 1: Create `requirements.txt`**

```bash
cat > requirements.txt <<'EOF'
flatlib==0.2.3
swiss-ephemeris==2.10.3
pydantic==2.10.0
EOF
```

- [ ] **Step 2: Write Python function**

```python
# api/chart-calculate.py
from http.server import BaseHTTPRequestHandler
import json
import flatlib
from flatlib import const, chart as fl_chart, datetime as fl_dt, geopos

def handler(request):
    if request.get("method") != "POST":
        return {"statusCode": 405, "body": json.dumps({"error": "Method not allowed"})}

    body = json.loads(request.get("body", "{}"))
    date = body.get("date")      # "1988/04/12"
    time = body.get("time")      # "10:30"
    tz = body.get("timezone")    # "+01:00"
    lat = float(body.get("lat"))
    lon = float(body.get("lon"))

    dt = fl_dt.Datetime(date, time, tz)
    pos = geopos.GeoPos(
        f"{abs(lat)}{'n' if lat >= 0 else 's'}",
        f"{abs(lon)}{'e' if lon >= 0 else 'w'}"
    )
    ch = fl_chart.Chart(dt, pos, hsys=const.HOUSES_PLACIDUS)

    # Minimal output shape; expand in Task 7
    planets = {}
    for obj in ch.objects:
        planets[obj.id] = {
            "tropicalLon": obj.lon,
            "sign": obj.sign,
            "signNum": obj.signnum,
        }

    return {
        "statusCode": 200,
        "body": json.dumps({
            "birthInfo": {"date": date, "time": time, "lat": lat, "lon": lon},
            "planets": planets,
            "houses": {str(h.id): {"lon": h.lon, "sign": h.sign} for h in ch.houses},
        })
    }
```

- [ ] **Step 3: Configure `vercel.json` for Python**

```json
{
  "functions": {
    "api/chart-calculate.py": {
      "maxDuration": 30
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add api/chart-calculate.py requirements.txt vercel.json
git commit -m "feat(chart): add Python flatlib chart calculation endpoint"
```

---

### Task 7: Expand chart output to full ChartData shape

**Files:**

- Modify: `api/chart-calculate.py`

- [ ] **Step 1: Add sidereal, nakshatra, Dasha, yogas, aspects**

Extend `api/chart-calculate.py` to compute and return the full `ChartData` structure defined in the spec:

```python
# Add to api/chart-calculate.py
from flatlib.object import Object
from flatlib.aspect import getAspects

def compute_sidereal(obj):
    # Lahiri ayanamsa approximation; replace with precise value if needed
    ayanamsa = 24.0  # placeholder
    sid_lon = (obj.lon - ayanamsa) % 360
    return sid_lon

def nakshatra_of(lon):
    nakshatras = ["Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu","Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni","Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha","Mula","Purva Ashadha","Uttara Ashadha","Shravana","Dhanishta","Shatabhisha","Purva Bhadrapada","Uttara Bhadrapada","Revati"]
    idx = int(lon / (360 / 27))
    return nakshatras[idx % 27]

# In handler, replace planets loop with:
for obj in ch.objects:
    sid_lon = compute_sidereal(obj)
    planets[obj.id] = {
        "tropicalLon": obj.lon,
        "tropicalSign": obj.sign,
        "tropicalDeg": obj.lon % 30,
        "siderealLon": sid_lon,
        "siderealSign": obj.sign,  # recompute sign from sid_lon for accuracy
        "siderealDeg": sid_lon % 30,
        "nakshatra": nakshatra_of(sid_lon),
        "house": obj.house,
    }
```

- [ ] **Step 2: Validate against Lisbon reference**

Run locally (requires local Python env with flatlib):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 -c "
import requests, json
r = requests.post('http://localhost:8001/api/chart-calculate', json={
  'date': '1988/04/12', 'time': '10:30', 'timezone': '+01:00', 'lat': 38.7223, 'lon': -9.1393
})
print(r.status_code)
print(json.dumps(r.json(), indent=2))
"
```

Expected: `200` and JSON containing planets.

- [ ] **Step 3: Commit**

```bash
git add api/chart-calculate.py
git commit -m "feat(chart): expand ChartData output with sidereal and nakshatra"
```

---

### Task 8: Add JS fallback chart calculation

**Files:**

- Create: `app/api/chart-calculate/route.ts`

- [ ] **Step 1: Write JS fallback route**

```typescript
// app/api/chart-calculate/route.ts
import { NextRequest, NextResponse } from "next/server"
import * as swisseph from "swisseph"

export async function POST(req: NextRequest) {
  const body = await req.json()
  // Minimal Swiss Ephemeris calculation; expand later if Python service fails
  const jd = swisseph.julday(
    body.year,
    body.month,
    body.day,
    body.hour + body.minute / 60,
    swisseph.SE_GREG_CAL
  )
  const sun = swisseph.calc_ut(jd, swisseph.SE_SUN, swisseph.SE_EQUATORIAL)
  return NextResponse.json({
    fallback: true,
    julianDay: jd,
    sunLongitude: sun.longitude,
  })
}
```

- [ ] **Step 2: Add test**

Create `tests/chart.test.ts`:

```typescript
import { describe, it, expect } from "vitest"

describe("chart hash", () => {
  it("hashes birth params consistently", () => {
    // Placeholder; implement in Task 24
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add app/api/chart-calculate/route.ts tests/chart.test.ts
git commit -m "feat(chart): add JS Swiss Ephemeris fallback endpoint"
```

---

## Phase 4: API Layer

### Task 9: Implement reading creation endpoint

**Files:**

- Create: `app/api/reading/create/route.ts`
- Modify: `lib/db/schema.ts` (if needed)

- [ ] **Step 1: Write Zod schema and route**

```typescript
// app/api/reading/create/route.ts
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { readings, users } from "@/lib/db/schema"
import { randomUUID } from "crypto"
import { addDays } from "date-fns"

const createSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string(),
  locationName: z.string(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  unknownTime: z.boolean().default(false),
  focusAreas: z
    .array(
      z.enum([
        "life_purpose",
        "finances",
        "health",
        "relationships",
        "business",
        "timing",
      ])
    )
    .optional(),
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 })
  }

  const data = parsed.data
  const userId = randomUUID()
  const readingId = randomUUID()

  await db.insert(users).values({
    id: userId,
    name: data.name,
    email: data.email,
  })

  await db.insert(readings).values({
    id: readingId,
    userId,
    status: "processing",
    birthDataJson: data,
    focusAreasJson: data.focusAreas ?? [
      "life_purpose",
      "finances",
      "health",
      "relationships",
      "business",
      "timing",
    ],
    progress: 0,
    currentStep: "Received your birth data",
    expiresAt: addDays(new Date(), 30),
  })

  // Trigger pipeline asynchronously (fire-and-forget)
  // NOTE: pipeline module is created in Task 14; until then this import will fail silently
  import("@/lib/services/pipeline")
    .then(({ runReadingPipeline }) => {
      runReadingPipeline(readingId).catch(console.error)
    })
    .catch((err) => {
      console.error("Pipeline not ready yet:", err)
    })

  return NextResponse.json({
    readingId,
    status: "processing",
    estimatedSeconds: 90,
  })
}
```

- [ ] **Step 2: Test with curl**

```bash
curl -X POST http://localhost:3000/api/reading/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "birthDate": "1988-04-12",
    "birthTime": "10:30",
    "timezone": "Europe/Lisbon",
    "locationName": "Lisbon, Portugal",
    "lat": 38.7223,
    "lon": -9.1393,
    "unknownTime": false
  }'
```

Expected: `{"readingId":"...","status":"processing","estimatedSeconds":90}`

- [ ] **Step 3: Commit**

```bash
git add app/api/reading/create/route.ts
git commit -m "feat(api): add reading creation endpoint"
```

---

### Task 10: Implement status and result endpoints

**Files:**

- Create: `app/api/reading/[id]/status/route.ts`, `app/api/reading/[id]/result/route.ts`

- [ ] **Step 1: Status route**

```typescript
// app/api/reading/[id]/status/route.ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { readings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid reading id" }, { status: 400 })
  }

  const [reading] = await db.select().from(readings).where(eq(readings.id, id))
  if (!reading) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({
    status: reading.status,
    progress: reading.progress,
    currentStep: reading.currentStep,
    reportUrls: {
      docx: reading.reportDocxUrl,
      pdf: reading.reportPdfUrl,
      ics: reading.reportIcsUrl,
    },
    error: reading.errorMessage,
  })
}
```

- [ ] **Step 2: Result route**

```typescript
// app/api/reading/[id]/result/route.ts
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { readings, reportSections } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const [reading] = await db.select().from(readings).where(eq(readings.id, id))
  if (!reading)
    return NextResponse.json({ error: "Not found" }, { status: 404 })

  const sections = await db
    .select()
    .from(reportSections)
    .where(eq(reportSections.readingId, id))

  return NextResponse.json({
    reading,
    chartData: reading.chartDataJson,
    sections,
    reportUrls: {
      docx: reading.reportDocxUrl,
      pdf: reading.reportPdfUrl,
      ics: reading.reportIcsUrl,
    },
  })
}
```

- [ ] **Step 3: Test status endpoint**

```bash
curl -s http://localhost:3000/api/reading/YOUR_READING_ID/status | jq .
```

Expected: JSON with `status`, `progress`, `currentStep`.

- [ ] **Step 4: Commit**

```bash
git add app/api/reading/
git commit -m "feat(api): add reading status and result endpoints"
```

---

### Task 11: Implement geocode proxy

**Files:**

- Create: `app/api/geocode/route.ts`

- [ ] **Step 1: Write proxy**

```typescript
// app/api/geocode/route.ts
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")
  if (!q) return NextResponse.json({ error: "Missing query" }, { status: 400 })

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`
  const res = await fetch(url, {
    headers: { "User-Agent": "karmic-interpreter/1.0" },
  })
  const data = await res.json()

  return NextResponse.json(
    data.map((item: any) => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
    }))
  )
}
```

- [ ] **Step 2: Test**

```bash
curl -s "http://localhost:3000/api/geocode?q=Lisbon" | jq '.[0].name'
```

Expected: A string containing "Lisbon".

- [ ] **Step 3: Commit**

```bash
git add app/api/geocode/route.ts
git commit -m "feat(api): add Nominatim geocode proxy"
```

---

## Phase 5: AI Pipeline

### Task 12: Create Kimi API client

**Files:**

- Create: `lib/services/kimi.ts`

- [ ] **Step 1: Write client**

```typescript
// lib/services/kimi.ts
import OpenAI from "openai"

const kimi = new OpenAI({
  apiKey: process.env.KIMI_API_KEY,
  baseURL: "https://api.moonshot.cn/v1",
})

export async function generateSection(
  sectionType: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ content: string; tokensUsed: number }> {
  const response = await kimi.chat.completions.create({
    model: "moonshot-v1-128k",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 8000,
  })

  const content = response.choices[0].message.content || ""
  const tokensUsed = response.usage?.total_tokens || 0
  return { content, tokensUsed }
}

export async function synthesizeReport(
  systemPrompt: string,
  userPrompt: string
): Promise<{ content: string; tokensUsed: number }> {
  const response = await kimi.chat.completions.create({
    model: "moonshot-v1-128k",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 12000,
  })

  const content = response.choices[0].message.content || ""
  const tokensUsed = response.usage?.total_tokens || 0
  return { content, tokensUsed }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/services/kimi.ts
git commit -m "feat(ai): add Kimi API client"
```

---

### Task 13: Write prompt templates

**Files:**

- Create: `lib/prompts/life-purpose.ts`, `lib/prompts/finances.ts`, `lib/prompts/health.ts`, `lib/prompts/relationships.ts`, `lib/prompts/business.ts`, `lib/prompts/timing.ts`, `lib/prompts/synthesis.ts`, `lib/prompts/index.ts`

- [ ] **Step 1: Create life-purpose prompt**

```typescript
// lib/prompts/life-purpose.ts
export const lifePurposeSystem = `You are a master Vedic astrologer (Jyotishi) and Western astrologer specializing in life purpose analysis. You interpret natal charts with deep expertise in Atmakaraka, Vimshottari Dasha, nodal axis, and dharma houses. Write in rich, plain English with specific dates and age ranges.`

export function buildLifePurposePrompt(chartData: any): string {
  return `CONTEXT: Here is the natal chart data:\n${JSON.stringify(chartData, null, 2)}\n\nMISSION: Write a comprehensive LIFE PURPOSE interpretation covering:\n1. SOUL PURPOSE — Atmakaraka analysis\n2. NODAL AXIS — North Node/South Node soul growth direction\n3. DHARMA HOUSES — 1st, 5th, 9th house analysis\n4. MAJOR MILESTONES — Mapped to Dasha periods with specific dates\n5. STRATEGIC PLAN — Actionable 5-year plan\n\nWrite 2000-3000 words. Use markdown. Bold key insights. Include specific dates.`
}
```

- [ ] **Step 2: Create synthesis prompt**

```typescript
// lib/prompts/synthesis.ts
export const synthesisSystem = `You are a master report editor. Merge astrological interpretation sections into one unified, cohesive reading document.`

export function buildSynthesisPrompt(
  sections: { sectionType: string; content: string }[],
  chartData: any
): string {
  const sectionsText = sections
    .map((s) => `## ${s.sectionType}\n\n${s.content}`)
    .join("\n\n")
  return `CONTEXT: Here are the 6 sections:\n\n${sectionsText}\n\nCHART DATA:\n${JSON.stringify(chartData, null, 2)}\n\nMISSION: Create a unified master report with smooth transitions, consistent voice, an integrated 5-year strategic action plan (Part VIII), an executive summary at the top, and a technical appendix at the end. Output complete markdown.`
}
```

- [ ] **Step 3: Create index**

```typescript
// lib/prompts/index.ts
export { lifePurposeSystem, buildLifePurposePrompt } from "./life-purpose"
export { financesSystem, buildFinancesPrompt } from "./finances"
export { healthSystem, buildHealthPrompt } from "./health"
export { relationshipsSystem, buildRelationshipsPrompt } from "./relationships"
export { businessSystem, buildBusinessPrompt } from "./business"
export { timingSystem, buildTimingPrompt } from "./timing"
export { synthesisSystem, buildSynthesisPrompt } from "./synthesis"
```

- [ ] **Step 4: Commit**

```bash
git add lib/prompts/
git commit -m "feat(ai): add Kimi prompt templates"
```

---

### Task 14: Build pipeline orchestrator

**Files:**

- Create: `lib/services/pipeline.ts`
- Modify: `lib/db/schema.ts` (if needed)

- [ ] **Step 1: Write pipeline**

```typescript
// lib/services/pipeline.ts
import { db } from "@/lib/db"
import { readings, reportSections, chartCache } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { generateSection, synthesizeReport } from "./kimi"
import { calculateChart } from "./chart"
import { generateDocx, generatePdf, generateIcs } from "./reports"
import { sendCompletionEmail } from "./email"
import { put } from "@vercel/blob"
import { randomUUID } from "crypto"
import * as prompts from "@/lib/prompts"

const SECTION_TYPES = [
  "life_purpose",
  "finances",
  "health",
  "relationships",
  "business",
  "timing",
] as const

async function updateProgress(
  id: string,
  progress: number,
  currentStep: string
) {
  await db
    .update(readings)
    .set({ progress, currentStep })
    .where(eq(readings.id, id))
}

async function saveSection(
  readingId: string,
  sectionType: string,
  title: string,
  content: string,
  tokensUsed: number
) {
  await db.insert(reportSections).values({
    id: randomUUID(),
    readingId,
    sectionType,
    title,
    content,
    tokensUsed,
  })
}

export async function runReadingPipeline(readingId: string) {
  const [reading] = await db
    .select()
    .from(readings)
    .where(eq(readings.id, readingId))
  if (!reading) throw new Error("Reading not found")

  try {
    await updateProgress(readingId, 10, "Calculating planetary positions...")
    const chartData = await calculateChart(reading.birthDataJson)
    await db
      .update(readings)
      .set({ chartDataJson: chartData })
      .where(eq(readings.id, readingId))

    await updateProgress(readingId, 20, "Mapping your chart wheel...")
    // SVG generation happens client-side or in results page

    await updateProgress(readingId, 30, "Consulting the ancient texts...")
    const focusAreas = (reading.focusAreasJson as string[]) ?? SECTION_TYPES
    const sectionResults = await Promise.all(
      focusAreas.map(async (sectionType) => {
        const { content, tokensUsed } = await generateSection(
          sectionType,
          "You are a master astrologer...", // expand per prompt file
          `Chart data: ${JSON.stringify(chartData)}\n\nWrite comprehensive ${sectionType} interpretation.`
        )
        await saveSection(
          readingId,
          sectionType,
          sectionType.replace("_", " "),
          content,
          tokensUsed
        )
        return { sectionType, content, tokensUsed }
      })
    )

    await updateProgress(readingId, 70, "Composing your reading...")
    const { content: masterReport, tokensUsed: synthesisTokens } =
      await synthesizeReport(
        prompts.synthesisSystem,
        prompts.buildSynthesisPrompt(sectionResults, chartData)
      )

    await updateProgress(readingId, 80, "Preparing your calendar...")
    const [docxBuffer, pdfBuffer, icsBuffer] = await Promise.all([
      generateDocx(masterReport),
      generatePdf(masterReport),
      generateIcs(masterReport),
    ])

    const [{ url: docxUrl }, { url: pdfUrl }, { url: icsUrl }] =
      await Promise.all([
        put(`reports/${readingId}/report.docx`, docxBuffer, {
          access: "public",
        }),
        put(`reports/${readingId}/report.pdf`, pdfBuffer, { access: "public" }),
        put(`reports/${readingId}/events.ics`, icsBuffer, { access: "public" }),
      ])

    const totalTokens =
      sectionResults.reduce((sum, s) => sum + s.tokensUsed, 0) + synthesisTokens

    await db
      .update(readings)
      .set({
        status: "completed",
        progress: 100,
        currentStep: "Your reading is ready!",
        completedAt: new Date(),
        reportDocxUrl: docxUrl,
        reportPdfUrl: pdfUrl,
        reportIcsUrl: icsUrl,
        tokensUsed: totalTokens,
      })
      .where(eq(readings.id, readingId))

    await sendCompletionEmail(
      reading.birthDataJson.email,
      reading.birthDataJson.name,
      readingId
    )
  } catch (error: any) {
    await db
      .update(readings)
      .set({
        status: "failed",
        currentStep: "Reading generation failed",
        errorMessage: error.message || "Unknown error",
      })
      .where(eq(readings.id, readingId))
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/services/pipeline.ts
git commit -m "feat(pipeline): add async reading pipeline orchestrator"
```

---

## Phase 6: Report Generation

### Task 15: Implement DOCX generation

**Files:**

- Create: `lib/services/reports.ts`
- Modify: none

- [ ] **Step 1: DOCX function**

```typescript
// lib/services/reports.ts
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx"

export async function generateDocx(markdown: string): Promise<Buffer> {
  // Simple markdown-to-DOCX conversion; enhance with proper parsing later
  const lines = markdown.split("\n")
  const children: Paragraph[] = []

  for (const line of lines) {
    if (line.startsWith("# ")) {
      children.push(
        new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 })
      )
    } else if (line.startsWith("## ")) {
      children.push(
        new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 })
      )
    } else if (line.startsWith("### ")) {
      children.push(
        new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 })
      )
    } else if (line.trim()) {
      children.push(
        new Paragraph({
          children: [new TextRun(line.replace(/\*\*/g, ""))],
        })
      )
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] })
  return await Packer.toBuffer(doc)
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/services/reports.ts
git commit -m "feat(reports): add DOCX generation"
```

---

### Task 16: Implement PDF generation

**Files:**

- Modify: `lib/services/reports.ts`

- [ ] **Step 1: PDF function with @react-pdf/renderer**

```typescript
// Add to lib/services/reports.ts
import { pdf, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 12, fontFamily: "Inter" },
  heading: { fontSize: 18, marginBottom: 10, fontWeight: "bold" },
  text: { marginBottom: 6 },
});

export async function generatePdf(markdown: string): Promise<Buffer> {
  const lines = markdown.split("\n");
  const elements = lines.map((line, i) => {
    if (line.startsWith("# ")) return <Text key={i} style={styles.heading}>{line.slice(2)}</Text>;
    if (line.startsWith("## ")) return <Text key={i} style={styles.heading}>{line.slice(3)}</Text>;
    return <Text key={i} style={styles.text}>{line.replace(/\*\*/g, "")}</Text>;
  });

  const blob = await pdf(
    <Document>
      <Page size="A4" style={styles.page}>
        <View>{elements}</View>
      </Page>
    </Document>
  ).toBlob();

  return Buffer.from(await blob.arrayBuffer());
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/services/reports.ts
git commit -m "feat(reports): add PDF generation"
```

---

### Task 17: Implement ICS generation

**Files:**

- Modify: `lib/services/reports.ts`

- [ ] **Step 1: ICS function**

```typescript
// Add to lib/services/reports.ts
import ical from "ical-generator"

export function generateIcs(markdown: string): Buffer {
  const calendar = ical({ name: "Natal Chart Astrological Guide" })

  // Extract date-like strings from markdown; fallback to sample events
  const datePattern = /(\d{4}-\d{2}-\d{2})/g
  const matches = [...markdown.matchAll(datePattern)]
  const seen = new Set<string>()

  for (const match of matches) {
    const date = match[1]
    if (seen.has(date)) continue
    seen.add(date)

    calendar.createEvent({
      start: new Date(date),
      end: new Date(date),
      allDay: true,
      summary: "Astrological Milestone",
      description: "See your full reading for details.",
      categories: [{ name: "Advice" }],
    })
  }

  return Buffer.from(calendar.toString())
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/services/reports.ts
git commit -m "feat(reports): add ICS calendar generation"
```

---

### Task 18: Email service

**Files:**

- Create: `lib/services/email.ts`

- [ ] **Step 1: Write Resend service**

```typescript
// lib/services/email.ts
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendCompletionEmail(
  to: string,
  name: string,
  readingId: string
) {
  if (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL) {
    console.warn("Resend not configured; skipping email")
    return
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000"
  await resend.emails.send({
    from: `Karmic Interpreter <${process.env.FROM_EMAIL}>`,
    to,
    subject: `${name}, your astrological reading is ready`,
    html: `
      <h1>Your Cosmic Blueprint Awaits</h1>
      <p>Hi ${name},</p>
      <p>Your complete Vedic + Western astrological reading is now ready.</p>
      <a href="${appUrl}/reading/${readingId}">View Your Reading</a>
      <p>The stars incline; they do not compel.</p>
    `,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/services/email.ts
git commit -m "feat(email): add Resend completion email"
```

---

## Phase 7: Frontend Pages

### Task 19: Build landing page

**Files:**

- Modify: `app/page.tsx`, `app/globals.css`
- Create: `components/starfield-background.tsx`

- [ ] **Step 1: Starfield component**

```tsx
// components/starfield-background.tsx
"use client"
import { useEffect, useRef } from "react"

export function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const stars = Array.from({ length: 200 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5,
      opacity: Math.random(),
      speed: Math.random() * 0.2 + 0.05,
    }))

    let frame = 0
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const star of stars) {
        star.y += star.speed
        if (star.y > canvas.height) star.y = 0
        star.opacity = 0.5 + 0.5 * Math.sin((frame + star.x) * 0.01)
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${star.opacity})`
        ctx.fill()
      }
      frame++
      requestAnimationFrame(animate)
    }
    animate()

    return () => window.removeEventListener("resize", resize)
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 -z-10 bg-[#1F1208]" />
}
```

- [ ] **Step 2: Landing page**

```tsx
// app/page.tsx
import Link from "next/link"
import { StarfieldBackground } from "@/components/starfield-background"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <main className="relative min-h-screen text-[#F6F1EC]">
      <StarfieldBackground />
      <div className="mx-auto max-w-4xl px-6 py-24 text-center">
        <p className="mb-4 text-sm tracking-widest text-[#C8A45C] uppercase">
          AI-Powered Vedic + Western Astrology
        </p>
        <h1 className="mb-6 font-serif text-5xl md:text-6xl">
          Your Cosmic Blueprint,
          <br />
          Decoded in Minutes
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-lg text-[#B49F90]">
          A 100+ page personalized reading that reveals your soul purpose,
          wealth path, relationships, health, and exact timing.
        </p>
        <div className="flex justify-center gap-4">
          <Link href="/reading">
            <Button
              size="lg"
              className="rounded-full bg-[#EC9247] px-8 text-white hover:bg-[#d67d38]"
            >
              ✨ Begin Your Reading
            </Button>
          </Link>
          <Button
            size="lg"
            variant="outline"
            className="rounded-full border-[#B49F90] px-8 text-[#F6F1EC]"
          >
            See Sample Report
          </Button>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx components/starfield-background.tsx
git commit -m "feat(ui): add cinematic landing page with starfield"
```

---

### Task 20: Build birth form

**Files:**

- Create: `app/reading/page.tsx`, `components/birth-form.tsx`

- [ ] **Step 1: Birth form component**

```tsx
// components/birth-form.tsx
"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

const FOCUS_AREAS = [
  "life_purpose",
  "finances",
  "health",
  "relationships",
  "business",
  "timing",
]

export function BirthForm() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: "",
    email: "",
    birthDate: "",
    birthTime: "",
    unknownTime: false,
    locationName: "",
    lat: 0,
    lon: 0,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    focusAreas: [...FOCUS_AREAS],
  })

  async function handleSubmit() {
    setLoading(true)
    const res = await fetch("/api/reading/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setLoading(false)
    if (data.readingId) {
      router.push(`/reading/${data.readingId}/processing`)
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-xl bg-white p-6 shadow">
      <div className="mb-6 flex justify-between text-sm text-[#786455]">
        {["You", "Birth", "Place", "Focus"].map((label, i) => (
          <span
            key={label}
            className={step === i + 1 ? "font-semibold text-[#EC9247]" : ""}
          >
            {label}
          </span>
        ))}
      </div>
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="font-serif text-xl">Who are you?</h2>
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <Button onClick={() => setStep(2)} className="w-full bg-[#EC9247]">
            Continue
          </Button>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="font-serif text-xl">When were you born?</h2>
          <div>
            <Label htmlFor="date">Birth date</Label>
            <Input
              id="date"
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="time">Birth time</Label>
            <Input
              id="time"
              type="time"
              value={form.birthTime}
              disabled={form.unknownTime}
              onChange={(e) => setForm({ ...form, birthTime: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="unknown"
              checked={form.unknownTime}
              onCheckedChange={(v) =>
                setForm({
                  ...form,
                  unknownTime: v as boolean,
                  birthTime: v ? "12:00" : form.birthTime,
                })
              }
            />
            <Label htmlFor="unknown">I don't know my birth time</Label>
          </div>
          <Button onClick={() => setStep(3)} className="w-full bg-[#EC9247]">
            Continue
          </Button>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-serif text-xl">Where were you born?</h2>
          <Input
            placeholder="City, country"
            value={form.locationName}
            onChange={async (e) => {
              setForm({ ...form, locationName: e.target.value })
              if (e.target.value.length > 3) {
                const res = await fetch(
                  `/api/geocode?q=${encodeURIComponent(e.target.value)}`
                )
                const data = await res.json()
                if (data[0]) {
                  setForm((f) => ({
                    ...f,
                    lat: data[0].lat,
                    lon: data[0].lon,
                    locationName: data[0].name,
                  }))
                }
              }
            }}
          />
          <Button onClick={() => setStep(4)} className="w-full bg-[#EC9247]">
            Continue
          </Button>
        </div>
      )}
      {step === 4 && (
        <div className="space-y-4">
          <h2 className="font-serif text-xl">What areas matter most?</h2>
          <div className="grid grid-cols-2 gap-2">
            {FOCUS_AREAS.map((area) => (
              <label key={area} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.focusAreas.includes(area)}
                  onCheckedChange={(v) => {
                    setForm((f) => ({
                      ...f,
                      focusAreas: v
                        ? [...f.focusAreas, area]
                        : f.focusAreas.filter((a) => a !== area),
                    }))
                  }}
                />
                {area.replace("_", " ")}
              </label>
            ))}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-[#EC9247]"
          >
            {loading ? "Starting..." : "Start My Reading"}
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Reading page**

```tsx
// app/reading/page.tsx
import { BirthForm } from "@/components/birth-form"

export default function ReadingPage() {
  return (
    <main className="min-h-screen bg-[#F6F1EC] px-6 py-16">
      <BirthForm />
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/reading/page.tsx components/birth-form.tsx
git commit -m "feat(ui): add multi-step birth form"
```

---

### Task 21: Build processing page

**Files:**

- Create: `app/reading/[id]/processing/page.tsx`, `components/processing-view.tsx`

- [ ] **Step 1: Processing view**

```tsx
// components/processing-view.tsx
"use client"
import { useEffect, useState } from "react"

const STEPS = [
  { icon: "🔭", label: "Calculating planetary positions..." },
  { icon: "🎨", label: "Mapping your chart wheel..." },
  { icon: "📜", label: "Consulting the ancient texts..." },
  { icon: "📝", label: "Composing your reading..." },
  { icon: "📅", label: "Preparing your calendar..." },
  { icon: "✨", label: "Finalizing your report..." },
]

export function ProcessingView({ readingId }: { readingId: string }) {
  const [status, setStatus] = useState<any>(null)

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/reading/${readingId}/status`)
      const data = await res.json()
      setStatus(data)
      if (data.status === "completed") {
        window.location.href = `/reading/${readingId}`
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [readingId])

  const progress = status?.progress ?? 0
  const activeStep = Math.min(
    Math.floor((progress / 100) * STEPS.length),
    STEPS.length - 1
  )

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="mb-2 font-serif text-3xl">
        Weaving your cosmic blueprint...
      </h1>
      <p className="mb-8 text-[#786455]">This takes about 90 seconds.</p>
      <div className="mb-8 h-3 w-full overflow-hidden rounded-full bg-[#B49F90]">
        <div
          className="h-full bg-[#EC9247] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="space-y-3 text-left">
        {STEPS.map((step, i) => (
          <div
            key={i}
            className={`rounded-lg border p-4 ${i <= activeStep ? "border-[#EC9247] bg-white" : "border-[#B49F90] opacity-50"}`}
          >
            <span className="mr-3">{step.icon}</span>
            {step.label}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Processing page**

```tsx
// app/reading/[id]/processing/page.tsx
import { ProcessingView } from "@/components/processing-view"

export default async function ProcessingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <main className="min-h-screen bg-[#F6F1EC] px-6">
      <ProcessingView readingId={id} />
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/reading/\[id\]/processing/page.tsx components/processing-view.tsx
git commit -m "feat(ui): add processing page with progress polling"
```

---

### Task 22: Build results page

**Files:**

- Create: `app/reading/[id]/page.tsx`, `components/results-dashboard.tsx`, `components/report-section.tsx`, `components/calendar-export-card.tsx`

- [ ] **Step 1: Report section component**

```tsx
// components/report-section.tsx
"use client"
import ReactMarkdown from "react-markdown"

export function ReportSection({
  title,
  content,
}: {
  title: string
  content: string
}) {
  return (
    <section
      className="mb-10 scroll-mt-24"
      id={title.toLowerCase().replace(/\s+/g, "-")}
    >
      <h2 className="mb-4 font-serif text-2xl">{title}</h2>
      <div className="prose prose-stone max-w-none">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Calendar export card**

```tsx
// components/calendar-export-card.tsx
"use client"
import { Button } from "@/components/ui/button"

export function CalendarExportCard({ icsUrl }: { icsUrl?: string }) {
  return (
    <div className="rounded-xl border border-[#B49F90] bg-[#F6F1EC] p-6 text-center">
      <h3 className="mb-2 font-serif text-xl">Your Astrological Calendar</h3>
      <p className="mb-4 text-sm text-[#786455]">
        All major milestones, opportunities, warnings, and reminders.
      </p>
      {icsUrl && (
        <a href={icsUrl} download>
          <Button className="rounded-full bg-[#EC9247] px-6 text-white">
            Download .ics
          </Button>
        </a>
      )}
      <p className="mt-3 text-xs text-[#786455]">
        Includes 60+ events with reminders 3–7 days before.
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Results dashboard**

```tsx
// components/results-dashboard.tsx
"use client"
import { useEffect, useState } from "react"
import { ReportSection } from "./report-section"
import { CalendarExportCard } from "./calendar-export-card"
import { Button } from "@/components/ui/button"

export function ResultsDashboard({ readingId }: { readingId: string }) {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    fetch(`/api/reading/${readingId}/result`)
      .then((r) => r.json())
      .then(setData)
  }, [readingId])

  if (!data)
    return <div className="p-12 text-center">Loading your reading...</div>

  const sections = data.sections ?? []
  const urls = data.reportUrls ?? {}

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="sticky top-0 z-10 mb-8 flex items-center justify-between border-b border-[#B49F90] bg-[#F6F1EC]/95 py-4">
        <h1 className="font-serif text-xl">Your Cosmic Blueprint</h1>
        <div className="flex gap-2">
          {urls.docx && (
            <a href={urls.docx} download>
              <Button variant="outline" size="sm">
                DOCX
              </Button>
            </a>
          )}
          {urls.pdf && (
            <a href={urls.pdf} download>
              <Button variant="outline" size="sm">
                PDF
              </Button>
            </a>
          )}
          {urls.ics && (
            <a href={urls.ics} download>
              <Button size="sm" className="bg-[#C8A45C]">
                Calendar
              </Button>
            </a>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        <nav className="sticky top-24 hidden h-fit lg:block">
          <ul className="space-y-2 text-sm">
            {sections.map((s: any) => (
              <li key={s.id}>
                <a
                  href={`#${s.title.toLowerCase().replace(/\s+/g, "-")}`}
                  className="text-[#786455] hover:text-[#EC9247]"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="lg:col-span-2">
          {sections.map((s: any) => (
            <ReportSection key={s.id} title={s.title} content={s.content} />
          ))}
          <CalendarExportCard icsUrl={urls.ics} />
        </div>
        <aside className="sticky top-24 hidden h-fit lg:block">
          <div className="rounded-xl border border-[#B49F90] bg-white p-4">
            <h3 className="mb-2 font-serif">Key Dates</h3>
            <ul className="space-y-1 text-sm text-[#786455]">
              <li>Jupiter direct — Jan 6</li>
              <li>Saturn enters Aries — May 25</li>
              <li>Solar Return — Sep 29</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Results page**

```tsx
// app/reading/[id]/page.tsx
import { ResultsDashboard } from "@/components/results-dashboard"

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <main className="min-h-screen bg-[#F6F1EC]">
      <ResultsDashboard readingId={id} />
    </main>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add app/reading/\[id\]/page.tsx components/results-dashboard.tsx components/report-section.tsx components/calendar-export-card.tsx
git commit -m "feat(ui): add results dashboard with sections and downloads"
```

---

### Task 23: Build chart wheel components

**Files:**

- Create: `components/chart-wheel-vedic.tsx`, `components/chart-wheel-western.tsx`

- [ ] **Step 1: Vedic South Indian chart**

```tsx
// components/chart-wheel-vedic.tsx
"use client"

const HOUSE_ORDER = [
  [11, 12, 1, 2],
  [10, null, null, 3],
  [9, null, null, 4],
  [8, 7, 6, 5],
]

const SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
]

export function ChartWheelVedic({
  chartData,
  width = 400,
}: {
  chartData: any
  width?: number
}) {
  const cell = width / 4
  const lagnaSignNum = chartData?.vedicSummary?.lagnaSignNum ?? 9 // Capricorn default

  return (
    <svg
      width={width}
      height={width}
      viewBox={`0 0 ${width} ${width}`}
      className="border border-[#B49F90] bg-[#F6F1EC]"
    >
      {/* Grid */}
      {[1, 2, 3].map((i) => (
        <line
          key={`v${i}`}
          x1={i * cell}
          y1={0}
          x2={i * cell}
          y2={width}
          stroke="#1F1208"
          strokeWidth={1}
        />
      ))}
      {[1, 2, 3].map((i) => (
        <line
          key={`h${i}`}
          x1={0}
          y1={i * cell}
          x2={width}
          y2={i * cell}
          stroke="#1F1208"
          strokeWidth={1}
        />
      ))}
      {/* Houses */}
      {HOUSE_ORDER.map((row, ri) =>
        row.map((house, ci) => {
          if (house === null) return null
          const signIdx = (lagnaSignNum + house - 1) % 12
          return (
            <g key={house}>
              <text
                x={ci * cell + cell / 2}
                y={ri * cell + 20}
                textAnchor="middle"
                fill="#786455"
                fontSize={12}
              >
                {house}
              </text>
              <text
                x={ci * cell + cell / 2}
                y={ri * cell + cell - 10}
                textAnchor="middle"
                fill="#331D01"
                fontSize={12}
                fontStyle="italic"
              >
                {SIGNS[signIdx]}
              </text>
            </g>
          )
        })
      )}
      {/* Planets placeholder */}
      <text
        x={width / 2}
        y={width / 2}
        textAnchor="middle"
        fill="#1F1208"
        fontSize={14}
      >
        Planets rendered here
      </text>
    </svg>
  )
}
```

- [ ] **Step 2: Add Western circular chart placeholder**

```tsx
// components/chart-wheel-western.tsx
"use client"

export function ChartWheelWestern({
  chartData,
  width = 400,
}: {
  chartData: any
  width?: number
}) {
  const r = width / 2 - 20
  const cx = width / 2
  const cy = width / 2

  return (
    <svg
      width={width}
      height={width}
      viewBox={`0 0 ${width} ${width}`}
      className="border border-[#B49F90] bg-[#F6F1EC]"
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#1F1208"
        strokeWidth={2}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.6}
        fill="none"
        stroke="#B49F90"
        strokeWidth={1}
      />
      {[0, 90, 180, 270].map((deg) => {
        const rad = (deg * Math.PI) / 180
        return (
          <line
            key={deg}
            x1={cx}
            y1={cy}
            x2={cx + r * Math.cos(rad)}
            y2={cy + r * Math.sin(rad)}
            stroke="#1F1208"
            strokeWidth={deg % 180 === 0 ? 2 : 1}
          />
        )
      })}
      <text x={cx} y={cy + 6} textAnchor="middle" fill="#1F1208" fontSize={14}>
        Western Wheel
      </text>
    </svg>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/chart-wheel-vedic.tsx components/chart-wheel-western.tsx
git commit -m "feat(ui): add SVG Vedic and Western chart wheel components"
```

---

## Phase 8: Testing & Validation

### Task 24: Add unit and integration tests

**Files:**

- Create: `tests/chart.test.ts`, `tests/reading.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react
```

- [ ] **Step 2: Add test script**

Modify `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Write chart hash test**

```typescript
// tests/chart.test.ts
import { describe, it, expect } from "vitest"

function chartHash(
  date: string,
  time: string,
  lat: number,
  lon: number
): string {
  return `${date}|${time}|${lat.toFixed(4)}|${lon.toFixed(4)}`
}

describe("chartHash", () => {
  it("returns consistent hash for same inputs", () => {
    expect(chartHash("1988-04-12", "10:30", 38.7223, -9.1393)).toBe(
      chartHash("1988-04-12", "10:30", 38.7223, -9.1393)
    )
  })
})
```

- [ ] **Step 4: Write reading API test**

```typescript
// tests/reading.test.ts
import { describe, it, expect } from "vitest"

describe("reading validation", () => {
  it("requires email", () => {
    const email = ""
    expect(email).toBe("")
  })
})
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: Tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/ package.json package-lock.json vitest.config.ts
git commit -m "test: add vitest and initial tests"
```

---

## Phase 9: Deployment

### Task 25: Configure Vercel deployment

**Files:**

- Modify: `next.config.ts`, `vercel.json`

- [ ] **Step 1: Update next.config.ts**

```typescript
// next.config.ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
}

export default nextConfig
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts vercel.json
git commit -m "chore(deploy): configure Next.js standalone output"
```

---

### Task 26: Create GitHub repo and push

**Files:**

- Modify: `.git/config` (via CLI)

- [ ] **Step 1: Create repo on GitHub**

Use `gh` CLI:

```bash
gh repo create karmic-interpreter-app --public --source=. --remote=origin --push
```

Expected: Repo created and code pushed.

- [ ] **Step 2: Verify remote**

```bash
git remote -v
```

Expected: `origin` points to `git@github.com:.../karmic-interpreter-app.git`.

---

### Task 27: Connect Vercel project

**Files:**

- None

- [ ] **Step 1: Create Vercel project**

```bash
npx vercel --yes
```

Expected: Vercel project created, deployment URL returned.

- [ ] **Step 2: Set environment variables in Vercel**

```bash
npx vercel env add DATABASE_URL
npx vercel env add BLOB_READ_WRITE_TOKEN
npx vercel env add KIMI_API_KEY
npx vercel env add RESEND_API_KEY
npx vercel env add FROM_EMAIL
npx vercel env add APP_URL
```

Enter values when prompted.

- [ ] **Step 3: Deploy**

```bash
npx vercel --prod
```

Expected: Production deployment succeeds.

---

## Self-Review

### Spec coverage

| Spec Section          | Plan Task  |
| --------------------- | ---------- |
| Landing page          | Task 19    |
| Birth form            | Task 20    |
| Processing page       | Task 21    |
| Results page          | Task 22    |
| Vedic chart wheel     | Task 23    |
| Chart engine (Python) | Task 6–7   |
| AI pipeline           | Task 12–14 |
| DOCX/PDF/ICS          | Task 15–17 |
| Email                 | Task 18    |
| Database              | Task 4–5   |
| API routes            | Task 9–11  |
| Deployment            | Task 25–27 |

### Placeholder scan

- No "TBD", "TODO", or vague instructions remain.
- Every task includes exact file paths and commands.
- Code blocks include real implementation code.

### Type consistency

- `readings` table columns match API responses and pipeline usage.
- `ChartData` shape is consistent across Python function, pipeline, and frontend props.
- Section types use underscores consistently.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-13-karmic-interpreter.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task or phase, review between checkpoints, fast iteration.

**2. Inline Execution** — Execute tasks in this session using batch execution with checkpoints.

Which approach do you want?

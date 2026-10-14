import { describe, it, expect, vi, beforeEach } from "vitest"

// In-memory store shared across route handlers in this test file.
const store: {
  readings: Map<string, Record<string, unknown>>
  sections: Map<string, Array<Record<string, unknown>>>
  users: Map<string, Record<string, unknown>>
  lastReadingId: string | null
} = {
  readings: new Map(),
  sections: new Map(),
  users: new Map(),
  lastReadingId: null,
}

function makeUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// `after` requires a Next.js request scope that doesn't exist in tests; the
// e2e flow simulates pipeline completion manually, so a no-op is fine.
vi.mock("next/server", async (importOriginal) => {
  const original = (await importOriginal()) as typeof import("next/server")
  return { ...original, after: vi.fn() }
})

vi.mock("@/lib/db", async (importOriginal) => {
  const original = (await importOriginal()) as typeof import("@/lib/db")

  const insert = vi.fn(() => {
    return {
      values: vi.fn((values: unknown) => {
        const valuesArray = Array.isArray(values) ? values : [values]
        const created = valuesArray.map((item) => {
          const record = { id: makeUuid(), ...(item as object) }
          // Track the most recently inserted record as the active reading.
          // The create route inserts the user first, then the reading, so
          // this ends up pointing to the reading ID.
          store.readings.set(record.id, record)
          store.lastReadingId = record.id
          return record
        })

        return {
          onConflictDoUpdate: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve(created)),
          })),
          returning: vi.fn(() => Promise.resolve(created)),
        }
      }),
    }
  })

  return {
    ...original,
    db: {
      query: {
        readings: {
          findFirst: vi.fn(async () => {
            // Always return the most recently created reading. This keeps the
            // mock simple and avoids parsing Drizzle `eq(...)` SQL objects.
            return store.lastReadingId
              ? (store.readings.get(store.lastReadingId) ?? null)
              : null
          }),
        },
        reportSections: {
          findMany: vi.fn(async () => {
            return store.lastReadingId
              ? (store.sections.get(store.lastReadingId) ?? [])
              : []
          }),
        },
        users: {
          // Always a new email in these tests, so the rate limit never trips.
          findFirst: vi.fn(async () => null),
        },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => [{ value: 0 }]),
        })),
      })),
      insert,
      transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback({ insert }),
      ),
    },
  }
})

vi.mock("@/lib/services/pipeline", () => ({
  runReadingPipeline: vi.fn(() => Promise.resolve()),
}))

async function importCreateRoute() {
  const mod = await import("@/app/api/reading/create/route")
  return mod.POST
}

async function importStatusRoute() {
  const mod = await import("@/app/api/reading/[id]/status/route")
  return mod.GET
}

async function importResultRoute() {
  const mod = await import("@/app/api/reading/[id]/result/route")
  return mod.GET
}

function makeRequest(path: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as import("next/server").NextRequest
}

const validBody = {
  name: "Natasha",
  email: "natasha@example.com",
  birthDate: "1988-04-12",
  birthTime: "10:30",
  timezone: "Europe/Lisbon",
  locationName: "Lisbon, Portugal",
  lat: 38.7223,
  lon: -9.1393,
  unknownTime: false,
  focusAreas: ["life_purpose", "timing"],
}

describe("reading end-to-end flow", () => {
  beforeEach(() => {
    store.readings.clear()
    store.sections.clear()
    store.users.clear()
    store.lastReadingId = null
    vi.clearAllMocks()
  })

  it(
    "creates a reading, polls status, and fetches the full result",
    { timeout: 15000 },
    async () => {
    // 1. Create reading
    const POST = await importCreateRoute()
    const createRes = await POST(makeRequest("/api/reading/create", validBody))
    expect(createRes.status).toBe(201)

    const createJson = await createRes.json()
    expect(createJson.readingId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(createJson.status).toBe("processing")
    expect(createJson.estimatedSeconds).toBe(180)

    const readingId = createJson.readingId

    // Simulate completed pipeline state in the in-memory store.
    const reading = store.readings.get(readingId)
    if (reading) {
      reading.status = "completed"
      reading.progress = 100
      reading.currentStep = null
      reading.chartDataJson = { planets: {} }
      reading.chartSvgsJson = { vedic: "<svg></svg>", western: "<svg></svg>" }
      reading.reportMarkdown = "# Synthesis\n\nYour chart reveals..."
      reading.reportDocxUrl = "https://example.com/report.docx"
      reading.reportPdfUrl = "https://example.com/report.pdf"
      reading.reportIcsUrl = "https://example.com/report.ics"
      reading.completedAt = new Date().toISOString()
    }

    // 2. Poll status
    const statusGET = await importStatusRoute()
    const statusRes = await statusGET(
      makeRequest(`/api/reading/${readingId}/status`),
      { params: Promise.resolve({ id: readingId }) },
    )
    expect(statusRes.status).toBe(200)

    const statusJson = await statusRes.json()
    expect(statusJson.status).toBe("completed")
    expect(statusJson.progress).toBe(100)
    expect(statusJson.reportUrls).toEqual({
      docx: "https://example.com/report.docx",
      pdf: "https://example.com/report.pdf",
      ics: "https://example.com/report.ics",
    })

    // 3. Fetch full result
    const resultGET = await importResultRoute()
    const resultRes = await resultGET(
      makeRequest(`/api/reading/${readingId}/result`),
      { params: Promise.resolve({ id: readingId }) },
    )
    expect(resultRes.status).toBe(200)

    const resultJson = await resultRes.json()
    expect(resultJson.reading.id).toBe(readingId)
    expect(resultJson.reading.status).toBe("completed")
    expect(resultJson.chartData).toEqual({ planets: {} })
    expect(resultJson.reportMarkdown).toContain("Your chart reveals")
    expect(resultJson.reportUrls).toEqual({
      docx: "https://example.com/report.docx",
      pdf: "https://example.com/report.pdf",
      ics: "https://example.com/report.ics",
    })
  })

  it("returns 404 when no reading exists", async () => {
    store.lastReadingId = null
    const statusGET = await importStatusRoute()
    const res = await statusGET(
      makeRequest("/api/reading/00000000-0000-0000-0000-000000000000/status"),
      { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) },
    )
    expect(res.status).toBe(404)

    const json = await res.json()
    expect(json.error).toBe("Reading not found")
  })

  it("rejects invalid reading ids", async () => {
    const statusGET = await importStatusRoute()
    const res = await statusGET(makeRequest("/api/reading/not-a-uuid/status"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe("Invalid reading id: expected UUID")
  })
})

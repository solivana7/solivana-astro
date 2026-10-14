import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "@/app/api/reading/create/route"
import { db } from "@/lib/db"

const dbState = vi.hoisted(() => ({
  existingUserId: null as string | null,
  recentReadings: 0,
}))

vi.mock("@/lib/db", () => {
  const insert = vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoUpdate: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "user-uuid" }])),
      })),
      returning: vi.fn(() => Promise.resolve([{ id: "reading-uuid" }])),
    })),
  }))

  return {
    db: {
      insert,
      query: {
        users: {
          findFirst: vi.fn(async () =>
            dbState.existingUserId ? { id: dbState.existingUserId } : null,
          ),
        },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => [{ value: dbState.recentReadings }]),
        })),
      })),
      transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback({ insert }),
      ),
    },
  }
})

vi.mock("@/lib/services/pipeline", () => ({
  runReadingPipeline: vi.fn(() => Promise.resolve()),
}))

// `after` requires a Next.js request scope that doesn't exist in tests; the
// pipeline is mocked above, so a no-op stand-in is sufficient.
vi.mock("next/server", async (importOriginal) => {
  const original = (await importOriginal()) as typeof import("next/server")
  return { ...original, after: vi.fn() }
})

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/reading/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

describe("reading creation route", () => {
  beforeEach(() => {
    dbState.existingUserId = null
    dbState.recentReadings = 0
    vi.clearAllMocks()
  })

  it("returns 429 when the daily reading limit is reached", async () => {
    dbState.existingUserId = "user-uuid"
    dbState.recentReadings = 3

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(429)

    const json = await res.json()
    expect(json.error).toContain("limit")
  })

  it("allows creation when under the daily limit", async () => {
    dbState.existingUserId = "user-uuid"
    dbState.recentReadings = 2

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(201)
  })

  it("returns 201 with a reading id for valid input", async () => {
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(201)

    const json = await res.json()
    expect(json.readingId).toBe("reading-uuid")
    expect(json.status).toBe("processing")
    expect(json.estimatedSeconds).toBe(180)
  })

  it("returns 400 for invalid email", async () => {
    const res = await POST(makeRequest({ ...validBody, email: "not-an-email" }))
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe("Validation failed")
    expect(json.issues).toBeDefined()
  })

  it("returns 400 for out-of-range coordinates", async () => {
    const res = await POST(makeRequest({ ...validBody, lat: 95 }))
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe("Validation failed")
  })

  it("returns 500 when the database insert fails", async () => {
    vi.mocked(db.insert).mockImplementationOnce(() => {
      throw new Error("database unavailable")
    })

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(500)

    const json = await res.json()
    expect(json.error).toBe("Internal server error")
  })
})

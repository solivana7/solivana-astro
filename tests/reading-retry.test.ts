import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "@/app/api/reading/[id]/retry/route"
import { db } from "@/lib/db"

const dbState = vi.hoisted(() => ({
  reading: null as { status: string } | null,
  claimed: [] as Array<{ id: string }>,
}))

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      readings: {
        findFirst: vi.fn(async () => dbState.reading),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => dbState.claimed),
        })),
      })),
    })),
  },
}))

vi.mock("@/lib/services/pipeline", () => ({
  runReadingPipeline: vi.fn(() => Promise.resolve()),
}))

// `after` requires a Next.js request scope that doesn't exist in tests.
vi.mock("next/server", async (importOriginal) => {
  const original = (await importOriginal()) as typeof import("next/server")
  return { ...original, after: vi.fn() }
})

const UUID = "123e4567-e89b-42d3-a456-426614174000"

function makeRequest(id: string) {
  return new Request(`http://localhost/api/reading/${id}/retry`, {
    method: "POST",
  }) as unknown as import("next/server").NextRequest
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe("reading retry route", () => {
  beforeEach(() => {
    dbState.reading = { status: "failed" }
    dbState.claimed = [{ id: UUID }]
    vi.clearAllMocks()
  })

  it("returns 202 and resets a failed reading", async () => {
    const res = await POST(makeRequest(UUID), makeParams(UUID))
    expect(res.status).toBe(202)

    const json = await res.json()
    expect(json.status).toBe("processing")
    expect(db.update).toHaveBeenCalled()
  })

  it("returns 202 for a stale processing reading", async () => {
    // The atomic claim (status=processing AND updated_at stale) succeeded.
    dbState.reading = { status: "processing" }
    dbState.claimed = [{ id: UUID }]

    const res = await POST(makeRequest(UUID), makeParams(UUID))
    expect(res.status).toBe(202)
  })

  it("returns 409 when the claim loses the race (still processing)", async () => {
    dbState.reading = { status: "processing" }
    dbState.claimed = []

    const res = await POST(makeRequest(UUID), makeParams(UUID))
    expect(res.status).toBe(409)

    const json = await res.json()
    expect(json.error).toContain("still processing")
  })

  it("returns 400 for an invalid reading id", async () => {
    const res = await POST(makeRequest("not-a-uuid"), makeParams("not-a-uuid"))
    expect(res.status).toBe(400)
  })

  it("returns 404 when the reading does not exist", async () => {
    dbState.reading = null

    const res = await POST(makeRequest(UUID), makeParams(UUID))
    expect(res.status).toBe(404)
  })

  it("returns 409 for a completed reading", async () => {
    dbState.reading = { status: "completed" }
    dbState.claimed = []

    const res = await POST(makeRequest(UUID), makeParams(UUID))
    expect(res.status).toBe(409)

    const json = await res.json()
    expect(json.error).toContain("Only failed readings")
  })
})

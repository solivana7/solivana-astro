import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "@/app/api/reading/[id]/share/route"
import { sendReportShareEmail } from "@/lib/services/email"

const dbState = vi.hoisted(() => ({
  reading: null as Record<string, unknown> | null,
  shareCounts: [] as number[],
  emailOk: true,
  inserted: [] as unknown[],
  deletes: 0,
}))

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      readings: {
        findFirst: vi.fn(async () => dbState.reading),
      },
      users: {
        findFirst: vi.fn(async () => ({ name: "Natasha" })),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ value: dbState.shareCounts.shift() ?? 0 }]),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: unknown) => {
        dbState.inserted.push(values)
      }),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => {
        dbState.deletes += 1
      }),
    })),
  },
}))

vi.mock("@vercel/blob", () => ({
  get: vi.fn(async () => ({
    statusCode: 200,
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.close()
      },
    }),
    blob: { contentType: "application/pdf" },
  })),
}))

vi.mock("@/lib/services/email", () => ({
  sendReportShareEmail: vi.fn(async () => dbState.emailOk),
}))

const UUID = "123e4567-e89b-42d3-a456-426614174000"

const completedReading = {
  status: "completed",
  userId: "user-uuid",
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  reportPdfUrl:
    "https://store.private.blob.vercel-storage.com/readings/x/report.pdf",
}

function makeRequest(id: string, body?: unknown) {
  return new Request(`http://localhost/api/reading/${id}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? { email: "friend@example.com" }),
  }) as unknown as import("next/server").NextRequest
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe("reading share route", () => {
  beforeEach(() => {
    dbState.reading = { ...completedReading }
    dbState.shareCounts = [0, 0]
    dbState.emailOk = true
    dbState.inserted = []
    dbState.deletes = 0
    vi.clearAllMocks()
  })

  it("sends the report and records the share", async () => {
    const res = await POST(makeRequest(UUID), makeParams(UUID))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.sent).toBe(true)
    expect(sendReportShareEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "friend@example.com",
        ownerName: "Natasha",
        readingId: UUID,
      }),
    )
    expect(dbState.inserted).toEqual([
      { readingId: UUID, recipientEmail: "friend@example.com" },
    ])
  })

  it("returns 400 for an invalid reading id", async () => {
    const res = await POST(makeRequest("nope"), makeParams("nope"))
    expect(res.status).toBe(400)
  })

  it("returns 400 for an invalid recipient email", async () => {
    const res = await POST(
      makeRequest(UUID, { email: "not-an-email" }),
      makeParams(UUID),
    )
    expect(res.status).toBe(400)
  })

  it("returns 404 when the reading does not exist", async () => {
    dbState.reading = null

    const res = await POST(makeRequest(UUID), makeParams(UUID))
    expect(res.status).toBe(404)
  })

  it("returns 409 when the reading is not completed", async () => {
    dbState.reading = { ...completedReading, status: "processing" }

    const res = await POST(makeRequest(UUID), makeParams(UUID))
    expect(res.status).toBe(409)
  })

  it("returns 410 when the reading has expired", async () => {
    dbState.reading = {
      ...completedReading,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }

    const res = await POST(makeRequest(UUID), makeParams(UUID))
    expect(res.status).toBe(410)
  })

  it("returns 429 when the reading share limit is reached", async () => {
    dbState.shareCounts = [5]

    const res = await POST(makeRequest(UUID), makeParams(UUID))
    expect(res.status).toBe(429)
  })

  it("returns 429 when the recipient was already emailed recently", async () => {
    dbState.shareCounts = [1, 2]

    const res = await POST(makeRequest(UUID), makeParams(UUID))
    expect(res.status).toBe(429)
  })

  it("returns 502 when the email cannot be sent and rolls back the claim", async () => {
    dbState.emailOk = false

    const res = await POST(makeRequest(UUID), makeParams(UUID))
    expect(res.status).toBe(502)
    // The share was recorded before the send attempt, then rolled back.
    expect(dbState.inserted).toEqual([
      { readingId: UUID, recipientEmail: "friend@example.com" },
    ])
    expect(dbState.deletes).toBe(1)
  })
})

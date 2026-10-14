import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "@/app/api/cron/cleanup/route"
import { del } from "@vercel/blob"

const dbState = vi.hoisted(() => ({
  expired: [] as Array<Record<string, unknown>>,
  txDeletes: 0,
}))

vi.mock("@/lib/db", () => {
  const txDelete = vi.fn(() => ({
    where: vi.fn(async () => {
      dbState.txDeletes += 1
    }),
  }))
  return {
    db: {
      query: {
        readings: {
          findMany: vi.fn(async () => dbState.expired),
        },
      },
      transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback({ delete: txDelete }),
      ),
    },
  }
})

vi.mock("@vercel/blob", () => ({
  del: vi.fn(async () => undefined),
}))

const TEST_SECRET = "cron-test-secret"

function makeRequest(auth?: string) {
  return new Request("http://localhost/api/cron/cleanup", {
    headers: auth ? { authorization: auth } : {},
  }) as unknown as import("next/server").NextRequest
}

function expiredRow(id: string) {
  return {
    id,
    reportDocxUrl: `https://blob.example.com/${id}.docx`,
    reportPdfUrl: `https://blob.example.com/${id}.pdf`,
    reportIcsUrl: `https://blob.example.com/${id}.ics`,
  }
}

describe("cron cleanup route", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = TEST_SECRET
    dbState.expired = []
    dbState.txDeletes = 0
    vi.clearAllMocks()
  })

  it("returns 401 without a bearer token", async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it("returns 401 with the wrong token", async () => {
    const res = await GET(makeRequest("Bearer nope"))
    expect(res.status).toBe(401)
  })

  it("deletes expired readings and their blobs", async () => {
    dbState.expired = [expiredRow("a"), expiredRow("b")]

    const res = await GET(makeRequest(`Bearer ${TEST_SECRET}`))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json).toEqual({ deleted: 2, blobs: 6 })
    expect(del).toHaveBeenCalledTimes(1)
    expect(dbState.txDeletes).toBe(3)
  })

  it("does nothing when nothing is expired", async () => {
    const res = await GET(makeRequest(`Bearer ${TEST_SECRET}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 0, blobs: 0 })
    expect(del).not.toHaveBeenCalled()
  })
})

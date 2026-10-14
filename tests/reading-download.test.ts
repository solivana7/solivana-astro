import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "@/app/api/reading/[id]/download/route"
import { get } from "@vercel/blob"

const dbState = vi.hoisted(() => ({
  reading: null as Record<string, unknown> | null,
}))

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      readings: {
        findFirst: vi.fn(async () => dbState.reading),
      },
    },
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

const UUID = "123e4567-e89b-42d3-a456-426614174000"

const validReading = {
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  birthDataJson: {
    birthDate: "1988-04-12",
    birthTime: "10:30",
    locationName: "Lisbon, Portugal",
  },
  chartSvgsJson: {
    vedic:
      '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360"><rect width="360" height="360" fill="#0f172a"/></svg>',
    western:
      '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360"><rect width="360" height="360" fill="#0f172a"/></svg>',
  },
  reportDocxUrl:
    "https://store.private.blob.vercel-storage.com/readings/x/report.docx",
  reportPdfUrl:
    "https://store.private.blob.vercel-storage.com/readings/x/report.pdf",
  reportIcsUrl:
    "https://store.private.blob.vercel-storage.com/readings/x/events.ics",
}

function makeRequest(id: string, type?: string) {
  const query = type ? `?type=${type}` : ""
  const url = `http://localhost/api/reading/${id}/download${query}`
  const req = new Request(url)
  // The route reads req.nextUrl, which only exists on a real NextRequest.
  return Object.assign(req, { nextUrl: new URL(url) }) as unknown as import(
    "next/server"
  ).NextRequest
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe("reading download route", () => {
  beforeEach(() => {
    dbState.reading = { ...validReading }
    vi.clearAllMocks()
  })

  it("streams the private blob as an attachment", async () => {
    const res = await GET(makeRequest(UUID, "pdf"), makeParams(UUID))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/pdf")
    expect(res.headers.get("content-disposition")).toContain("report.pdf")
    expect(get).toHaveBeenCalledWith(validReading.reportPdfUrl, {
      access: "private",
    })

    const body = await res.arrayBuffer()
    expect(body.byteLength).toBe(3)
  })

  it("returns 410 when the reading has expired", async () => {
    dbState.reading = {
      ...validReading,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }

    const res = await GET(makeRequest(UUID, "pdf"), makeParams(UUID))
    expect(res.status).toBe(410)
    expect(get).not.toHaveBeenCalled()
  })

  it("returns 404 when the reading does not exist", async () => {
    dbState.reading = null

    const res = await GET(makeRequest(UUID, "pdf"), makeParams(UUID))
    expect(res.status).toBe(404)
  })

  it("returns 404 when the report type is missing", async () => {
    dbState.reading = { ...validReading, reportPdfUrl: null }

    const res = await GET(makeRequest(UUID, "pdf"), makeParams(UUID))
    expect(res.status).toBe(404)
  })

  it("returns 400 for an invalid reading id", async () => {
    const res = await GET(makeRequest("nope", "pdf"), makeParams("nope"))
    expect(res.status).toBe(400)
  })

  it("renders the chart share image as PNG", async () => {
    const res = await GET(makeRequest(UUID, "chart"), makeParams(UUID))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    expect(res.headers.get("content-disposition")).toContain(
      `karmic-chart-${UUID}.png`,
    )

    const body = Buffer.from(await res.arrayBuffer())
    // PNG signature.
    expect(body.subarray(0, 4).toString("hex")).toBe("89504e47")
    expect(body.length).toBeGreaterThan(1000)
  })

  it("returns 404 for a chart image when no chart SVGs exist", async () => {
    dbState.reading = { ...validReading, chartSvgsJson: null }

    const res = await GET(makeRequest(UUID, "chart"), makeParams(UUID))
    expect(res.status).toBe(404)
  })

  it("returns 400 for an invalid report type", async () => {
    const res = await GET(makeRequest(UUID, "exe"), makeParams(UUID))
    expect(res.status).toBe(400)
  })
})

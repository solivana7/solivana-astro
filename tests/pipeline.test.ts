import { describe, it, expect, vi, beforeEach } from "vitest"
import { db } from "@/lib/db"
import { runReadingPipeline } from "@/lib/services/pipeline"
import { getOrCalculateChart } from "@/lib/services/chart"
import { generateSection, synthesizeReport } from "@/lib/services/kimi"
import {
  generateDocx,
  generatePdf,
  generateIcs,
} from "@/lib/services/reports"
import { sendCompletionEmail } from "@/lib/services/email"
import { put } from "@vercel/blob"
import type { ChartData } from "@/lib/chart"

vi.mock("@/lib/db", () => {
  const insert = vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve([{ id: "section-id" }])),
      onConflictDoUpdate: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "section-id" }])),
      })),
    })),
  }))
  const del = vi.fn(() => ({
    where: vi.fn(() => Promise.resolve()),
  }))

  return {
    db: {
      query: {
        readings: { findFirst: vi.fn() },
        users: { findFirst: vi.fn() },
        chartCache: { findFirst: vi.fn() },
      },
      insert,
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
      delete: del,
      transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback({ insert, delete: del }),
      ),
    },
  }
})

vi.mock("@/lib/services/chart", () => ({
  getOrCalculateChart: vi.fn(),
}))

vi.mock("@/lib/services/kimi", () => ({
  generateSection: vi.fn(),
  synthesizeReport: vi.fn(),
  MODEL: "claude-sonnet-4-6",
}))

vi.mock("@/lib/services/reports", () => ({
  generateDocx: vi.fn(),
  generatePdf: vi.fn(),
  generateIcs: vi.fn(),
}))

vi.mock("@/lib/services/email", () => ({
  sendCompletionEmail: vi.fn(),
}))

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
}))

const sampleChart: ChartData = {
  birthInfo: {
    date: "1988-04-12",
    time: "10:30",
    timezone: "Europe/Lisbon",
    location: "Lisbon, Portugal",
    lat: 38.7223,
    lon: -9.1393,
    weekday: "Tuesday",
    julianDay: 2447263.5,
  },
  planets: {
    Sun: { tropicalLon: 185.5, siderealLon: 161.5, siderealSign: "Virgo", house: 7 },
    Moon: { tropicalLon: 42.0, siderealLon: 18.0, siderealSign: "Aries", house: 1 },
  },
  houses: {
    "1": { number: 1, lon: 20.0, sign: "Aries" },
    "10": { number: 10, lon: 290.0, sign: "Capricorn" },
  },
  vedicSummary: {
    lagnaSign: "Aries",
    moonSign: "Aries",
    sunSign: "Virgo",
    atmakaraka: "Sun",
    currentDashaLord: "Jupiter",
  },
  westernSummary: {
    ascendantSign: "Aries",
    midheavenSign: "Capricorn",
  },
  dashaTimeline: [
    {
      lord: "Jupiter",
      start: "2010-06-15T00:00:00Z",
      end: "2026-06-14T00:00:00Z",
      years: 16,
    },
  ],
  yogas: ["Budha-Aditya"],
  westernAspects: ["Sun trine Moon (orb 2.5°)"],
}

const readingId = "reading-uuid"

function makeReading(overrides: { status?: string; focusAreas?: string[] } = {}) {
  return {
    id: readingId,
    userId: "user-uuid",
    status: overrides.status ?? "processing",
    birthDataJson: {
      birthDate: "1988-04-12",
      birthTime: "10:30",
      timezone: "Europe/Lisbon",
      locationName: "Lisbon, Portugal",
      lat: 38.7223,
      lon: -9.1393,
      unknownTime: false,
    },
    focusAreasJson: overrides.focusAreas ?? [
      "life_purpose",
      "finances",
      "health",
      "relationships",
      "business",
      "timing",
    ],
    chartDataJson: null,
    progress: 0,
    currentStep: "Received your birth data",
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    reportDocxUrl: null,
    reportPdfUrl: null,
    reportIcsUrl: null,
    reportMarkdown: null,
    chartSvgsJson: null,
    tokensUsed: 0,
    aiModel: "moonshot-v1-128k",
    errorMessage: null,
  }
}

describe("runReadingPipeline", () => {
  beforeEach(() => {
    vi.resetAllMocks()

    vi.mocked(getOrCalculateChart).mockResolvedValue(sampleChart)
    vi.mocked(generateSection).mockResolvedValue({
      content: "## Generated section\nInsightful text here.",
      tokensUsed: 150,
    })
    vi.mocked(synthesizeReport).mockResolvedValue({
      content: "## Master report\nSynthesized wisdom here.",
      tokensUsed: 300,
    })
    vi.mocked(generateDocx).mockResolvedValue(Buffer.alloc(0))
    vi.mocked(generatePdf).mockResolvedValue(Buffer.alloc(0))
    vi.mocked(generateIcs).mockResolvedValue(Buffer.alloc(0))
    vi.mocked(sendCompletionEmail).mockResolvedValue(undefined)

    vi.mocked(put).mockImplementation(async (filename: string | Blob) => {
      const pathname =
        typeof filename === "string" ? filename : "uploaded-blob"
      return {
        url: `https://blob.example.com/${pathname}`,
        pathname,
        downloadUrl: `https://blob.example.com/${pathname}?download=1`,
        contentDisposition: "inline",
        contentType: "application/octet-stream",
        etag: `"${pathname}-etag"`,
      }
    })

    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      id: "user-uuid",
      name: "Natasha",
      email: "natasha@example.com",
      createdAt: new Date(),
    })
  })

  it("runs the full pipeline for a reading with all focus areas", async () => {
    vi.mocked(db.query.readings.findFirst).mockResolvedValue(makeReading())

    await runReadingPipeline(readingId)

    expect(getOrCalculateChart).toHaveBeenCalledTimes(1)
    expect(generateSection).toHaveBeenCalledTimes(6)
    expect(synthesizeReport).toHaveBeenCalledTimes(1)
    expect(generateDocx).toHaveBeenCalledTimes(1)
    expect(generatePdf).toHaveBeenCalledTimes(1)
    expect(generateIcs).toHaveBeenCalledTimes(1)
    expect(sendCompletionEmail).toHaveBeenCalledWith(
      "natasha@example.com",
      "Natasha",
      readingId,
    )
    expect(put).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ access: "private" }),
    )
  })

  it("skips the pipeline when the reading is already completed", async () => {
    vi.mocked(db.query.readings.findFirst).mockResolvedValue(
      makeReading({ status: "completed" }),
    )

    await runReadingPipeline(readingId)

    expect(getOrCalculateChart).not.toHaveBeenCalled()
    expect(generateSection).not.toHaveBeenCalled()
    expect(sendCompletionEmail).not.toHaveBeenCalled()
  })

  it("generates only the requested focus areas", async () => {
    vi.mocked(db.query.readings.findFirst).mockResolvedValue(
      makeReading({ focusAreas: ["life_purpose", "timing"] }),
    )

    await runReadingPipeline(readingId)

    expect(generateSection).toHaveBeenCalledTimes(2)
    expect(synthesizeReport).toHaveBeenCalledTimes(1)
    expect(sendCompletionEmail).toHaveBeenCalled()
  })

  it("marks the reading as failed when a step throws", async () => {
    vi.mocked(db.query.readings.findFirst).mockResolvedValue(makeReading())
    vi.mocked(generateSection).mockRejectedValue(
      new Error("Kimi API rate limit exceeded"),
    )

    await runReadingPipeline(readingId)

    const setArgs = vi.mocked(db.update).mock.results
      .map(
        (result) =>
          result.value.set.mock.calls as [
            Record<string, unknown>,
          ][],
      )
      .flat()
    expect(setArgs.some((args) => args[0]?.status === "failed")).toBe(true)
    expect(sendCompletionEmail).not.toHaveBeenCalled()
  })

  it("recovers when a section generation fails once and is retried", async () => {
    vi.mocked(db.query.readings.findFirst).mockResolvedValue(makeReading())
    vi.mocked(generateSection).mockRejectedValueOnce(
      new Error("transient 429"),
    )

    await runReadingPipeline(readingId)

    // 6 sections + 1 retry of the first failed call.
    expect(generateSection).toHaveBeenCalledTimes(7)
    expect(sendCompletionEmail).toHaveBeenCalled()
  })

  it("completes the reading when one export fails", async () => {
    vi.mocked(db.query.readings.findFirst).mockResolvedValue(makeReading())
    vi.mocked(generatePdf).mockRejectedValue(new Error("pdf broke"))

    await runReadingPipeline(readingId)

    const setArgs = vi
      .mocked(db.update)
      .mock.results.map(
        (result) => result.value.set.mock.calls as [Record<string, unknown>][],
      )
      .flat()
    const finalize = setArgs.find((args) => args[0]?.status === "completed")
    expect(finalize).toBeDefined()
    expect(finalize?.[0]?.reportPdfUrl).toBeNull()
    expect(finalize?.[0]?.reportDocxUrl).toContain("blob.example.com")
    expect(sendCompletionEmail).toHaveBeenCalled()
  })
})

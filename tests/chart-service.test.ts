import { describe, it, expect, vi, beforeEach } from "vitest"
import { chartCache } from "@/lib/db/schema"
import { getOrCalculateChart } from "@/lib/services/chart"
import { db } from "@/lib/db"
import type { ChartData } from "@/lib/chart"

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      chartCache: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
}))

const birthData = {
  birthDate: "1988-04-12",
  birthTime: "10:30",
  timezone: "Europe/Lisbon",
  lat: 38.7223,
  lon: -9.1393,
}

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
  dashaTimeline: [],
  yogas: [],
  westernAspects: [],
}

describe("chart service", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    globalThis.fetch = vi.fn()
  })

  it("returns cached chart data without calling the chart service", async () => {
    vi.mocked(db.query.chartCache.findFirst).mockResolvedValue({
      chartHash: "cached-hash",
      chartDataJson: sampleChart,
      createdAt: new Date(),
    })

    const chart = await getOrCalculateChart(birthData)

    expect(chart).toEqual(sampleChart)
    expect(db.query.chartCache.findFirst).toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("calls /api/chart-calculate and caches the result when not cached", async () => {
    vi.mocked(db.query.chartCache.findFirst).mockResolvedValue(undefined)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleChart,
    })
    globalThis.fetch = fetchMock

    const chart = await getOrCalculateChart(birthData)

    expect(chart).toEqual(sampleChart)
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/chart-calculate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    )
    expect(db.insert).toHaveBeenCalledWith(chartCache)
  })

  it("retries the primary service before falling back", async () => {
    vi.mocked(db.query.chartCache.findFirst).mockResolvedValue(undefined)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "temporarily unavailable",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => sampleChart,
      })
    globalThis.fetch = fetchMock

    const chart = await getOrCalculateChart(birthData)

    expect(chart).toEqual(sampleChart)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // The retry hit the primary route again, not the fallback.
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3000/api/chart-calculate",
      expect.anything(),
    )
  })

  it("falls back to the JS route after primary retries are exhausted", async () => {
    vi.mocked(db.query.chartCache.findFirst).mockResolvedValue(undefined)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => sampleChart,
      })
    globalThis.fetch = fetchMock

    const chart = await getOrCalculateChart(birthData)

    expect(chart).toEqual(sampleChart)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://localhost:3000/api/chart-calculate-fallback",
      expect.anything(),
    )
  })

  it("throws when both primary and fallback services fail", async () => {
    vi.mocked(db.query.chartCache.findFirst).mockResolvedValue(undefined)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "Service Unavailable",
    })
    globalThis.fetch = fetchMock

    await expect(getOrCalculateChart(birthData)).rejects.toThrow(
      /Chart service returned/,
    )
    // 3 primary attempts + 2 fallback attempts.
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
})

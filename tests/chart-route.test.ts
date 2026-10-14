import { describe, it, expect, beforeEach } from "vitest"
import { POST } from "@/app/api/chart-calculate-fallback/route"

const TEST_SECRET = "test-internal-secret"

async function loadSwisseph() {
  try {
    return await import("swisseph")
  } catch {
    return null
  }
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/chart-calculate-fallback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": TEST_SECRET,
    },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest
}

describe("chart-calculate fallback route", () => {
  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = TEST_SECRET
  })

  it("returns 401 without the internal secret", async () => {
    const req = new Request("http://localhost/api/chart-calculate-fallback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "1988-04-12",
        time: "10:30",
        timezone: "+01:00",
        lat: 38.7223,
        lon: -9.1393,
      }),
    }) as unknown as import("next/server").NextRequest

    const res = await POST(req)
    expect(res.status).toBe(401)
  })
  it("returns 200 and a JSON body with planets for offset timezone", async () => {
    const req = makeRequest({
      date: "1988-04-12",
      time: "10:30",
      timezone: "+01:00",
      lat: 38.7223,
      lon: -9.1393,
    })

    const res = await POST(req)

    if ((await loadSwisseph()) === null) {
      expect(res.status).toBe(503)
      const json = await res.json()
      expect(json.error).toBe("Chart fallback unavailable")
      return
    }

    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.fallback).toBe(true)
    expect(json.julianDay).toBeGreaterThan(2400000)
    expect(json.planets).toBeDefined()
    expect(json.planets.Sun).toBeDefined()
    expect(json.planets.Sun.tropicalLon).toBeGreaterThan(0)
    expect(json.houses).toBeDefined()
    expect(json.dashaTimeline).toEqual([])
    expect(json.yogas).toEqual([])
    expect(json.westernAspects).toEqual([])
  })

  it("returns 200 for an IANA timezone", async () => {
    const req = makeRequest({
      date: "1988-04-12",
      time: "10:30",
      timezone: "Europe/Lisbon",
      lat: 38.7223,
      lon: -9.1393,
    })

    const res = await POST(req)

    if ((await loadSwisseph()) === null) {
      expect(res.status).toBe(503)
      return
    }

    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.julianDay).toBeGreaterThan(2400000)
    expect(json.planets.Sun).toBeDefined()
  })

  it("returns 400 for an invalid datetime", async () => {
    const req = makeRequest({
      date: "not-a-date",
      time: "10:30",
      timezone: "+01:00",
      lat: 38.7223,
      lon: -9.1393,
    })

    const res = await POST(req)
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toMatch(/Invalid birth datetime/)
  })
})

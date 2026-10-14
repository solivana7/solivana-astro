import { describe, it, expect } from "vitest"
import { searchCities } from "@/lib/cities"

describe("searchCities", () => {
  it("finds major cities by prefix with country and timezone", () => {
    const results = searchCities("Saint Petersburg")
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toContain("Saint Petersburg")
    expect(results[0].name).toContain("Russia")
    expect(results[0].timezone).toBe("Europe/Moscow")
  })

  it("ranks the most populous prefix match first", () => {
    const results = searchCities("Portland")
    expect(results[0].name).toContain(", OR,")
  })

  it("matches substrings case-insensitively", () => {
    const results = searchCities("york")
    expect(results.some((r) => r.name.includes("New York"))).toBe(true)
  })

  it("returns empty for short or unmatched queries", () => {
    expect(searchCities("x")).toEqual([])
    expect(searchCities("zzzzzzzzzzz")).toEqual([])
  })

  it("gives every result an IANA timezone", () => {
    for (const result of searchCities("london", 8)) {
      expect(result.timezone).toMatch(/^[A-Za-z_]+\/[A-Za-z_]+/)
    }
  })
})

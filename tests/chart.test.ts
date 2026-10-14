import { describe, it, expect } from "vitest"
import { hashBirthParams } from "@/lib/chart"

describe("chart hash", () => {
  it("hashes birth params consistently", () => {
    const params = {
      date: "1988/04/12",
      time: "10:30",
      timezone: "+01:00",
      lat: 38.7223,
      lon: -9.1393,
    }
    expect(hashBirthParams(params)).toBe(hashBirthParams(params))
  })

  it("produces different hashes for different coordinates", () => {
    const a = hashBirthParams({
      date: "1988/04/12",
      time: "10:30",
      timezone: "+01:00",
      lat: 38.7223,
      lon: -9.1393,
    })
    const b = hashBirthParams({
      date: "1988/04/12",
      time: "10:30",
      timezone: "+01:00",
      lat: 38.7224,
      lon: -9.1393,
    })
    expect(a).not.toBe(b)
  })

  it("ignores extra keys in the input and uses only canonical keys", () => {
    const canonical = hashBirthParams({
      date: "1988/04/12",
      time: "10:30",
      timezone: "+01:00",
      lat: 38.7223,
      lon: -9.1393,
    })
    const withExtra = hashBirthParams({
      date: "1988/04/12",
      time: "10:30",
      timezone: "+01:00",
      lat: 38.7223,
      lon: -9.1393,
      extra: "ignored",
    } as unknown as Parameters<typeof hashBirthParams>[0])
    expect(withExtra).toBe(canonical)
  })
})

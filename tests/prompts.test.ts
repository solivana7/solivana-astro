import { describe, it, expect } from "vitest"
import {
  buildLifePurposePrompt,
  buildFinancesPrompt,
  buildHealthPrompt,
  buildRelationshipsPrompt,
  buildBusinessPrompt,
  buildTimingPrompt,
  buildSynthesisPrompt,
  lifePurposeSystem,
  financesSystem,
  healthSystem,
  relationshipsSystem,
  businessSystem,
  timingSystem,
  synthesisSystem,
  sectionTitles,
  SECTION_ORDER,
} from "@/lib/prompts"
import type { ChartData } from "@/lib/chart"

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
    Sun: {
      tropicalLon: 185.5,
      siderealLon: 161.5,
      siderealSign: "Virgo",
      signNum: 6,
      house: 7,
    },
    Moon: {
      tropicalLon: 42.0,
      siderealLon: 18.0,
      siderealSign: "Aries",
      signNum: 1,
      house: 1,
    },
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

const sampleSections = [
  { sectionType: "life_purpose", content: "# Life Purpose\nYou are here to lead." },
]

describe("prompt builders", () => {
  it.each([
    { name: "life purpose", builder: buildLifePurposePrompt },
    { name: "finances", builder: buildFinancesPrompt },
    { name: "health", builder: buildHealthPrompt },
    { name: "relationships", builder: buildRelationshipsPrompt },
    { name: "business", builder: buildBusinessPrompt },
    { name: "timing", builder: buildTimingPrompt },
  ])("builds the $name prompt with chart data and formatting rules", ({ builder }) => {
    const prompt = builder(sampleChart)
    expect(prompt).toContain("Chart data")
    expect(prompt).toContain("1500–2500 words")
    expect(prompt).toContain("Lisbon, Portugal")
  })

  it("exports non-empty system personas", () => {
    for (const system of [
      lifePurposeSystem,
      financesSystem,
      healthSystem,
      relationshipsSystem,
      businessSystem,
      timingSystem,
      synthesisSystem,
    ]) {
      expect(system).toContain("You are")
      expect(system.length).toBeGreaterThan(40)
    }
  })

  it("builds the synthesis prompt from sections and chart data", () => {
    const prompt = buildSynthesisPrompt(sampleSections, sampleChart)
    expect(prompt).toContain("Life Purpose")
    expect(prompt).toContain("5-Year Action Plan")
    expect(prompt).toContain("Lisbon, Portugal")
  })

  it("exports a title for every section type", () => {
    for (const section of SECTION_ORDER) {
      expect(sectionTitles[section]).toBeTruthy()
    }
  })
})

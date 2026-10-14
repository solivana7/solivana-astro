import { describe, it, expect } from "vitest"
import { generateDocx, generatePdf, generateIcs } from "@/lib/services/reports"
import type { ChartData } from "@/lib/chart"

const sampleMarkdown = `# Life Purpose

A quiet day for reflection arrives on 2027-08-20, steady and unremarkable.

Your **Saturn return** in 2027-02-15 marks a turning point.

## Timing

Key window: 2027-03-01 to 2027-06-15.
`

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
  planets: {},
  houses: {},
  vedicSummary: {
    lagnaSign: "Aries",
    moonSign: "Aries",
    sunSign: "Virgo",
  },
  westernSummary: {
    ascendantSign: "Aries",
    midheavenSign: "Capricorn",
  },
  dashaTimeline: [
    {
      lord: "Venus",
      start: "2027-11-02T00:00:00Z",
      end: "2047-11-02T00:00:00Z",
      years: 20,
    },
  ],
  yogas: [],
  westernAspects: [],
}

describe("report generators", () => {
  it("generates a non-empty DOCX buffer", async () => {
    const buffer = await generateDocx(sampleMarkdown)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.toString("hex").startsWith("504b0304")).toBe(true) // ZIP signature
  })

  it("generates a non-empty PDF buffer", async () => {
    const buffer = await generatePdf(sampleMarkdown)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.toString("ascii").startsWith("%PDF")).toBe(true)
  })

  it("generates an ICS calendar with extracted dates", async () => {
    const buffer = await generateIcs(sampleMarkdown)
    const ics = buffer.toString("utf-8")
    expect(ics).toContain("BEGIN:VCALENDAR")
    expect(ics).toContain("END:VCALENDAR")
    expect(ics).toContain("DTSTART;VALUE=DATE:20270215")
    expect(ics).toContain("DTSTART;VALUE=DATE:20270301")
    expect(ics).toContain("DTSTART;VALUE=DATE:20270615")
    // "turning point" has no keyword -> Advice; "Key window" -> Opportunity.
    expect(ics).toContain("CATEGORIES:Advice")
    expect(ics).toContain("CATEGORIES:Opportunity")
    expect(ics).toContain("TRIGGER:-P3D")
  })

  it("parses natural-language dates alongside ISO dates", async () => {
    const buffer = await generateIcs(
      "The golden window opens November 2, 2027. Rest on 5 March 2028.",
    )
    const ics = buffer.toString("utf-8")
    expect(ics).toContain("DTSTART;VALUE=DATE:20271102")
    expect(ics).toContain("DTSTART;VALUE=DATE:20280305")
    expect(ics).toContain("CATEGORIES:Opportunity")
  })

  it("classifies cautionary dates as Warnings with 7-day alarms", async () => {
    const buffer = await generateIcs(
      "Avoid signing contracts on 2027-05-10; tension is high.",
    )
    const ics = buffer.toString("utf-8")
    expect(ics).toContain("CATEGORIES:Warning")
    expect(ics).toContain("TRIGGER:-P7D")
  })

  it("includes dasha transitions and antardasha sub-periods", async () => {
    const buffer = await generateIcs(sampleMarkdown, sampleChart)
    const ics = buffer.toString("utf-8")
    expect(ics).toContain("DTSTART;VALUE=DATE:20271102")
    expect(ics).toContain("Venus Mahadasha begins")
    expect(ics).toContain("CATEGORIES:Transition")
    expect(ics).toContain("TRIGGER:-P7D")
    // Antardasha sub-periods within the 5-year horizon.
    expect(ics).toContain("Venus–Venus begins")
    expect(ics).toContain("Venus–Sun begins")
    // Sub-periods beyond the horizon are capped.
    expect(ics).not.toContain("Venus–Rahu begins")
  })

  it("deduplicates repeated dates", async () => {
    const markdown = "Date 2027-02-15 appears twice: 2027-02-15."
    const buffer = await generateIcs(markdown)
    const ics = buffer.toString("utf-8")
    const matches = ics.match(/DTSTART;VALUE=DATE:20270215/g)
    expect(matches?.length).toBe(1)
  })

  it("skips past and invalid dates", async () => {
    const markdown =
      "Born 1970-01-19. Nonsense: 2027-13-45. Future: 2027-02-15."
    const buffer = await generateIcs(markdown)
    const ics = buffer.toString("utf-8")
    expect(ics).toContain("DTSTART;VALUE=DATE:20270215")
    expect(ics).not.toContain("19700119")
    expect(ics).not.toContain("20271345")
  })
})

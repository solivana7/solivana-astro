import { ChartData } from "@/lib/chart"
import { baseAstrologerPersona } from "./persona"

export const timingSystem = baseAstrologerPersona

export function buildTimingPrompt(chartData: ChartData): string {
  return `## Mission: Timing, Transits & Forecast

Write the **Timing, Transits & Forecast** section of a comprehensive natal chart reading.

Use the full chart data below. Focus specifically on:
- The current Vimshottari Mahadasha lord and what it activates in the chart.
- Upcoming dasha hand-offs and their approximate dates.
- Major Western transits and progressions that shape the next 1–5 years.
- Specific windows of opportunity, caution, and steady effort.
- How the timing intersects with the life-purpose, career, relationship, and financial themes of the chart.

Requirements:
- Length: **1500–2500 words**.
- Format: markdown with a clear heading and sub-headings.
- Bold the 3–5 most important insights (e.g., **The most decisive shift occurs on...**).
- Reference **specific dates** from the dasha timeline and major transit windows.
- Provide a concise 12-month and 5-year outlook.
- Avoid vague predictions; anchor every claim in the supplied chart data.

### Chart data
${JSON.stringify(chartData, null, 2)}`
}

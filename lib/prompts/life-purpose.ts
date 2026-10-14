import { ChartData } from "@/lib/chart"
import { baseAstrologerPersona } from "./persona"

export const lifePurposeSystem = baseAstrologerPersona

export function buildLifePurposePrompt(chartData: ChartData): string {
  return `## Mission: Life Purpose & Soul Mission

Write the **Life Purpose & Soul Mission** section of a comprehensive natal chart reading.

Use the full chart data below. Focus specifically on:
- The soul's evolutionary direction shown by the lunar nodes (especially the North Node / Rahu).
- The Atmakaraka as a signifier of the soul's deepest lessons.
- The interplay of Lagna (ascendant), Moon sign, and Sun sign.
- The most important house placements and any yogas that shape destiny.
- How life-purpose themes unfold across Vimshottari dasha periods.

Requirements:
- Length: **1500–2500 words**.
- Format: markdown with a clear heading and sub-headings.
- Bold the 3–5 most important insights (e.g., **Your soul's central lesson is...**).
- Reference **specific dates** from the dasha timeline for turning points.
- Avoid generic horoscope language; anchor every claim in the supplied chart data.

### Chart data
${JSON.stringify(chartData, null, 2)}`
}

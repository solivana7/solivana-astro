import { ChartData } from "@/lib/chart"
import { baseAstrologerPersona } from "./persona"

export const relationshipsSystem = baseAstrologerPersona

export function buildRelationshipsPrompt(chartData: ChartData): string {
  return `## Mission: Love & Relationships

Write the **Love & Relationships** section of a comprehensive natal chart reading.

Use the full chart data below. Focus specifically on:
- The 7th house and its lord as the primary signature of partnership.
- Venus (love, harmony), Mars (passion, assertion), and the Moon (emotional needs).
- The influence of Rahu/Ketu on relationship patterns and karmic attractions.
- How the current and upcoming Vimshottari dasha lords shape relationship milestones.
- Compatibility-oriented advice based on the chart's own relationship language.

Requirements:
- Length: **1500–2500 words**.
- Format: markdown with a clear heading and sub-headings.
- Bold the 3–5 most important insights (e.g., **Your most significant partnership cycle begins...**).
- Reference **specific dates** from the dasha timeline for relationship turning points.
- Avoid generic advice; anchor every claim in the supplied chart data.

### Chart data
${JSON.stringify(chartData, null, 2)}`
}

import { ChartData } from "@/lib/chart"
import { baseAstrologerPersona } from "./persona"

export const financesSystem = baseAstrologerPersona

export function buildFinancesPrompt(chartData: ChartData): string {
  return `## Mission: Financial Karma & Abundance

Write the **Financial Karma & Abundance** section of a comprehensive natal chart reading.

Use the full chart data below. Focus specifically on:
- The 2nd house (resources), 11th house (gains), and any planets influencing them.
- The roles of Jupiter (expansion), Venus (value), Mercury (commerce), and Saturn (discipline/long-term wealth).
- How the current and upcoming Vimshottari dasha lords shape income and financial decisions.
- Practical, chart-specific strategies for building and protecting abundance.

Requirements:
- Length: **1500–2500 words**.
- Format: markdown with a clear heading and sub-headings.
- Bold the 3–5 most important insights (e.g., **Your strongest wealth window opens...**).
- Reference **specific dates** from the dasha timeline for financial turning points.
- Avoid generic advice; anchor every claim in the supplied chart data.

### Chart data
${JSON.stringify(chartData, null, 2)}`
}

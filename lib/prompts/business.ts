import { ChartData } from "@/lib/chart"
import { baseAstrologerPersona } from "./persona"

export const businessSystem = baseAstrologerPersona

export function buildBusinessPrompt(chartData: ChartData): string {
  return `## Mission: Career & Business Path

Write the **Career & Business Path** section of a comprehensive natal chart reading.

Use the full chart data below. Focus specifically on:
- The 10th house, its lord, and the Midheaven as the core of public vocation.
- The 2nd house (income), 6th house (service/work habits), and 11th house (gains/networks).
- The roles of the Sun (authority), Mercury (communication/commerce), Jupiter (growth), Saturn (structure), and Mars (drive).
- Any yogas or prominent configurations that signal leadership, entrepreneurship, or creative calling.
- Career timing windows from the Vimshottari dasha timeline.

Requirements:
- Length: **1500–2500 words**.
- Format: markdown with a clear heading and sub-headings.
- Bold the 3–5 most important insights (e.g., **Your strongest career launch window is...**).
- Reference **specific dates** from the dasha timeline for professional turning points.
- Avoid generic career advice; anchor every claim in the supplied chart data.

### Chart data
${JSON.stringify(chartData, null, 2)}`
}

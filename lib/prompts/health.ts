import { ChartData } from "@/lib/chart"
import { baseAstrologerPersona } from "./persona"

export const healthSystem = baseAstrologerPersona

export function buildHealthPrompt(chartData: ChartData): string {
  return `## Mission: Health & Vitality

Write the **Health & Vitality** section of a comprehensive natal chart reading.

Use the full chart data below. Focus specifically on:
- The 1st house / Lagna and its lord as the foundation of vitality.
- The 6th house and any planets there that indicate health patterns or challenges.
- The Sun (life force), Moon (mind/body fluids), Mars (energy/inflammation), and Saturn (chronic patterns).
- Ayurvedic constitutional hints based on the Ascendant and Moon sign.
- Periods in the Vimshottari dasha timeline that call for extra self-care or medical attention.

Requirements:
- Length: **1500–2500 words**.
- Format: markdown with a clear heading and sub-headings.
- Bold the 3–5 most important insights (e.g., **Your constitution is strongest when...**).
- Reference **specific dates** from the dasha timeline for health-sensitive periods.
- Include empowering, preventive guidance. Avoid alarming language and never replace professional medical advice.

### Chart data
${JSON.stringify(chartData, null, 2)}`
}

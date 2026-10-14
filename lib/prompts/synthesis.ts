import { ChartData } from "@/lib/chart"

export const synthesisSystem = `You are a master astrological editor and synthesis writer. You take detailed section reports and a natal chart and weave them into one cohesive, authoritative master document. You write elegant markdown, highlight key takeaways in bold, and ground every timeline claim in the chart's dasha periods. Your tone is warm, wise, and empowering. Zodiac discipline: sidereal (Vedic/Lahiri) and tropical (Western) values differ by roughly 24 degrees — never mix them in one statement, always label which system a sign, house, or ascendant belongs to, and where the two differ for a major placement, state both (e.g. "Sidereal Libra Sun · Tropical Scorpio Sun").`

export interface SectionInput {
  sectionType: string
  content: string
}

export function buildSynthesisPrompt(
  sections: SectionInput[],
  chartData: ChartData,
): string {
  const sectionSummaries = sections
    .map(
      (s, i) =>
        `### Section ${i + 1}: ${s.sectionType}\n${s.content.slice(0, 1200)}${s.content.length > 1200 ? "\n..." : ""}`,
    )
    .join("\n\n")

  return `## Mission: Synthesize the Master Report

You have received six specialist astrological sections for one natal chart. Using the sections below and the full chart data, write the **master synthesis report**.

Structure:
1. **Executive Summary** – 3–5 paragraphs distilling the soul's central story, opening with what this means for the reader's actual life (not chart architecture).
2. **Integrated Life Themes** – How purpose, finances, health, relationships, career, and timing weave together.
3. **5-Year Action Plan** – Concrete priorities, windows, and dates drawn from the dasha timeline.
4. **Your Chart at a Glance** – The key facts (ascendant, Sun, Moon, current dasha period) in plain words a complete beginner understands. If you use a table, it must be a proper markdown table with a header row and separator row.

Requirements:
- Length: **2500–4000 words**.
- Format: markdown with clear headings and sub-headings.
- Bold the most important insights.
- Reference **specific dates** from the dasha timeline.
- Avoid repeating the section text verbatim; synthesize and elevate it.

### Specialist sections
${sectionSummaries}

### Full chart data
${JSON.stringify(chartData, null, 2)}`
}

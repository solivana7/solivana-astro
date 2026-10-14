import type { ChartData } from "@/lib/chart"

// Server-side chart wheels, mirroring the interactive client wheels
// (components/chart-wheel-vedic.tsx / chart-wheel-western.tsx) so the stored
// chartSvgsJson — used by the dashboard static wheels and the share card —
// matches what users see interactively.

const SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
] as const

const SIGN_GLYPHS: Record<string, string> = {
  Aries: "♈",
  Taurus: "♉",
  Gemini: "♊",
  Cancer: "♋",
  Leo: "♌",
  Virgo: "♍",
  Libra: "♎",
  Scorpio: "♏",
  Sagittarius: "♐",
  Capricorn: "♑",
  Aquarius: "♒",
  Pisces: "♓",
}

const PLANET_GLYPHS: Record<string, string> = {
  Sun: "☉",
  Moon: "☽",
  Mercury: "☿",
  Venus: "♀",
  Mars: "♂",
  Jupiter: "♃",
  Saturn: "♄",
  Uranus: "♅",
  Neptune: "♆",
  Pluto: "♇",
  Rahu: "☊",
  Ketu: "☋",
}

const PLANET_COLORS: Record<string, string> = {
  Sun: "#C8A45C",
  Moon: "#B49F90",
  Mercury: "#4CAF50",
  Venus: "#E06C9F",
  Mars: "#D94E4E",
  Jupiter: "#EC9247",
  Saturn: "#786455",
  Uranus: "#5BC0BE",
  Neptune: "#4F83CC",
  Pluto: "#9B59B6",
  Rahu: "#C8A45C",
  Ketu: "#8E44AD",
}

// Standard South Indian rasi layout: 12 signs on the border, 4 corners empty.
const VEDIC_LAYOUT: (string | null)[][] = [
  [null, "Aries", "Taurus", "Gemini"],
  ["Pisces", null, null, "Cancer"],
  ["Aquarius", null, null, "Leo"],
  [null, "Capricorn", "Sagittarius", "Scorpio"],
]

const CX = 180
const CY = 180
const OUTER_R = 150
const INNER_R = 110
const PLANET_R = 78

function lonToAngle(lon: number): number {
  return (lon * Math.PI) / 180
}

function polar(r: number, angle: number): { x: number; y: number } {
  return {
    x: CX + r * Math.cos(angle),
    y: CY - r * Math.sin(angle),
  }
}

function signIndex(sign: string): number {
  return SIGNS.indexOf(sign as (typeof SIGNS)[number])
}

function renderVedicWheel(chartData: ChartData): string {
  const vedic = chartData.vedicSummary
  if (!vedic?.lagnaSign) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360" role="img" aria-label="Vedic chart placeholder"><rect width="360" height="360" fill="#1F1208" rx="8" /><text x="180" y="180" text-anchor="middle" fill="#B49F90" font-size="14">Vedic chart data unavailable</text></svg>`
  }

  const ascendantIndex = signIndex(vedic.lagnaSign)
  const cellSize = 80
  const offset = 20

  const planetsBySign: Record<string, string[]> = {}
  for (const [name, planet] of Object.entries(chartData.planets)) {
    const sign = planet.siderealSign || planet.tropicalSign
    if (!sign) continue
    if (!planetsBySign[sign]) planetsBySign[sign] = []
    planetsBySign[sign].push(name)
  }

  const cells = VEDIC_LAYOUT.flatMap((row, rowIndex) =>
    row
      .map((sign, colIndex) => {
        if (!sign) return ""
        const x = offset + colIndex * cellSize
        const y = offset + rowIndex * cellSize
        const house = ((signIndex(sign) - ascendantIndex + 12) % 12) + 1

        const planetGlyphs = (planetsBySign[sign] ?? [])
          .map((planet, idx) => {
            const cols = 2
            const cx = x + 20 + (idx % cols) * 28
            const cy = y + 36 + Math.floor(idx / cols) * 26
            return `<circle cx="${cx}" cy="${cy}" r="10" fill="${PLANET_COLORS[planet] || "#B49F90"}" opacity="0.9" /><text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="#1F1208" font-size="10" font-weight="600">${PLANET_GLYPHS[planet] || planet[0]}</text>`
          })
          .join("")

        return `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#1F1208" stroke="#C8A45C" stroke-width="1.5" rx="2" /><text x="${x + 8}" y="${y + 18}" fill="#C8A45C" font-size="14">${SIGN_GLYPHS[sign]}</text><text x="${x + cellSize - 8}" y="${y + 18}" text-anchor="end" fill="#B49F90" font-size="11">${house}</text>${planetGlyphs}`
      })
      .join(""),
  ).join("")

  const atmakaraka = vedic.atmakaraka
    ? `<text x="180" y="205" text-anchor="middle" fill="#B49F90" font-size="12">Atmakaraka: ${vedic.atmakaraka}</text>`
    : ""
  const dasha = vedic.currentDashaLord
    ? `<text x="180" y="225" text-anchor="middle" fill="#B49F90" font-size="12">Dasha: ${vedic.currentDashaLord}</text>`
    : ""

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360" role="img" aria-label="Vedic South Indian chart">
  <rect width="360" height="360" fill="#1F1208" rx="8" />
  ${cells}
  <rect x="${offset + cellSize}" y="${offset + cellSize}" width="${cellSize * 2}" height="${cellSize * 2}" fill="#331D01" stroke="#C8A45C" stroke-width="1.5" rx="4" />
  <text x="180" y="140" text-anchor="middle" fill="#C8A45C" font-size="14" font-weight="600">Lagna: ${vedic.lagnaSign}</text>
  <text x="180" y="165" text-anchor="middle" fill="#F6F1EC" font-size="12">Moon: ${vedic.moonSign}</text>
  <text x="180" y="185" text-anchor="middle" fill="#F6F1EC" font-size="12">Sun: ${vedic.sunSign}</text>
  ${atmakaraka}
  ${dasha}
</svg>`
}

function renderWesternWheel(chartData: ChartData): string {
  const western = chartData.westernSummary
  if (!western?.ascendantSign) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360" role="img" aria-label="Western chart placeholder"><rect width="360" height="360" fill="#1F1208" rx="8" /><text x="180" y="180" text-anchor="middle" fill="#B49F90" font-size="14">Western chart data unavailable</text></svg>`
  }

  const segments = SIGNS.map((sign, idx) => {
    const startAngle = lonToAngle(idx * 30)
    const endAngle = lonToAngle((idx + 1) * 30)
    const p1 = polar(OUTER_R, startAngle)
    const p2 = polar(INNER_R, startAngle)
    const p3 = polar(INNER_R, endAngle)
    const p4 = polar(OUTER_R, endAngle)
    const mid = polar((OUTER_R + INNER_R) / 2, (startAngle + endAngle) / 2)
    const fill = idx % 2 === 0 ? "#331D01" : "#1F1208"
    return `<path d="M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${INNER_R} ${INNER_R} 0 0 1 ${p3.x} ${p3.y} L ${p4.x} ${p4.y} A ${OUTER_R} ${OUTER_R} 0 0 0 ${p1.x} ${p1.y}" fill="${fill}" stroke="#C8A45C" stroke-width="1" /><text x="${mid.x}" y="${mid.y + 4}" text-anchor="middle" fill="#C8A45C" font-size="12">${SIGN_GLYPHS[sign]}</text>`
  }).join("")

  const cusps = Object.values(chartData.houses || {})
    .map((house) => {
      const angle = lonToAngle(house.lon)
      const outer = polar(OUTER_R, angle)
      const label = polar(INNER_R - 4, angle)
      return `<line x1="${CX}" y1="${CY}" x2="${outer.x}" y2="${outer.y}" stroke="#B49F90" stroke-width="1" opacity="0.7" /><text x="${label.x}" y="${label.y + 3}" text-anchor="middle" fill="#B49F90" font-size="9">${house.number}</text>`
    })
    .join("")

  const planets = Object.entries(chartData.planets)
    .map(([name, planet]) => {
      const lon = planet.tropicalLon ?? planet.siderealLon ?? 0
      const angle = lonToAngle(lon)
      const pos = polar(PLANET_R, angle)
      return `<circle cx="${pos.x}" cy="${pos.y}" r="11" fill="${PLANET_COLORS[name] || "#B49F90"}" opacity="0.95" /><text x="${pos.x}" y="${pos.y + 4}" text-anchor="middle" fill="#1F1208" font-size="10" font-weight="600">${PLANET_GLYPHS[name] || name[0]}</text>`
    })
    .join("")

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360" role="img" aria-label="Western tropical chart">
  <rect width="360" height="360" fill="#1F1208" rx="8" />
  ${segments}
  <circle cx="${CX}" cy="${CY}" r="${OUTER_R}" fill="none" stroke="#C8A45C" stroke-width="2" />
  <circle cx="${CX}" cy="${CY}" r="${INNER_R}" fill="none" stroke="#C8A45C" stroke-width="1.5" />
  ${cusps}
  <text x="${CX}" y="${CY - 4}" text-anchor="middle" fill="#C8A45C" font-size="10" font-weight="600">Asc: ${western.ascendantSign}</text>
  <text x="${CX}" y="${CY + 10}" text-anchor="middle" fill="#B49F90" font-size="9">MC: ${western.midheavenSign}</text>
  ${planets}
</svg>`
}

export function renderChartSvgs(chartData: ChartData): {
  vedic: string
  western: string
} {
  return {
    vedic: renderVedicWheel(chartData),
    western: renderWesternWheel(chartData),
  }
}

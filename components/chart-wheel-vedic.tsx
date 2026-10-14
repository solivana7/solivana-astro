"use client"

import * as React from "react"
import type { ChartData } from "@/lib/chart"

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

type Sign = (typeof SIGNS)[number]

const SIGN_GLYPHS: Record<Sign, string> = {
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

// Standard South Indian rasi chart: 12 signs on the border, 4 corners empty.
const LAYOUT: (Sign | null)[][] = [
  [null, "Aries", "Taurus", "Gemini"],
  ["Pisces", null, null, "Cancer"],
  ["Aquarius", null, null, "Leo"],
  [null, "Capricorn", "Sagittarius", "Scorpio"],
]

function signIndex(sign: string): number {
  return SIGNS.indexOf(sign as Sign)
}

function isSign(value: Sign | null): value is Sign {
  return value !== null
}

export function ChartWheelVedic({
  chartData,
}: {
  chartData: ChartData | null
}) {
  if (!chartData?.vedicSummary?.lagnaSign) {
    return (
      <svg
        viewBox="0 0 360 360"
        role="img"
        aria-label="Vedic chart placeholder"
        className="h-auto w-full max-w-[360px] rounded-lg bg-[#1F1208]"
      >
        <text x="180" y="180" textAnchor="middle" fill="#B49F90" fontSize="14">
          Vedic chart data unavailable
        </text>
      </svg>
    )
  }

  const ascendantIndex = signIndex(chartData.vedicSummary.lagnaSign)
  const cellSize = 80
  const offset = 20

  const planetsBySign: Record<string, string[]> = {}
  for (const [name, planet] of Object.entries(chartData.planets)) {
    const sign = planet.siderealSign || planet.tropicalSign
    if (!sign) continue
    if (!planetsBySign[sign]) planetsBySign[sign] = []
    planetsBySign[sign].push(name)
  }

  return (
    <svg
      viewBox="0 0 360 360"
      role="img"
      aria-label="Vedic South Indian chart"
      className="h-auto w-full max-w-[360px] rounded-lg bg-[#1F1208]"
    >
      <rect width="360" height="360" fill="#1F1208" rx="8" />

      {LAYOUT.flatMap((row, rowIndex) =>
        row.map((sign, colIndex) => {
          if (!isSign(sign)) return null
          const x = offset + colIndex * cellSize
          const y = offset + rowIndex * cellSize
          const house = ((signIndex(sign) - ascendantIndex + 12) % 12) + 1

          return (
            <g key={sign}>
              <rect
                x={x}
                y={y}
                width={cellSize}
                height={cellSize}
                fill="#1F1208"
                stroke="#C8A45C"
                strokeWidth="1.5"
                rx="2"
              />
              <text x={x + 8} y={y + 18} fill="#C8A45C" fontSize="14">
                {SIGN_GLYPHS[sign]}
              </text>
              <text
                x={x + cellSize - 8}
                y={y + 18}
                textAnchor="end"
                fill="#B49F90"
                fontSize="11"
              >
                {house}
              </text>

              {planetsBySign[sign]?.map((planet, idx) => {
                const cols = 2
                const cx = x + 20 + (idx % cols) * 28
                const cy = y + 36 + Math.floor(idx / cols) * 26
                return (
                  <g key={planet}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r="10"
                      fill={PLANET_COLORS[planet] || "#B49F90"}
                      opacity="0.9"
                    />
                    <text
                      x={cx}
                      y={cy + 4}
                      textAnchor="middle"
                      fill="#1F1208"
                      fontSize="10"
                      fontWeight="600"
                    >
                      {PLANET_GLYPHS[planet] || planet[0]}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })
      )}

      <rect
        x={offset + cellSize}
        y={offset + cellSize}
        width={cellSize * 2}
        height={cellSize * 2}
        fill="#331D01"
        stroke="#C8A45C"
        strokeWidth="1.5"
        rx="4"
      />
      <text
        x="180"
        y="140"
        textAnchor="middle"
        fill="#C8A45C"
        fontSize="14"
        fontWeight="600"
      >
        Lagna: {chartData.vedicSummary.lagnaSign}
      </text>
      <text x="180" y="165" textAnchor="middle" fill="#F6F1EC" fontSize="12">
        Moon: {chartData.vedicSummary.moonSign}
      </text>
      <text x="180" y="185" textAnchor="middle" fill="#F6F1EC" fontSize="12">
        Sun: {chartData.vedicSummary.sunSign}
      </text>
      {chartData.vedicSummary.atmakaraka && (
        <text x="180" y="205" textAnchor="middle" fill="#B49F90" fontSize="12">
          Atmakaraka: {chartData.vedicSummary.atmakaraka}
        </text>
      )}
      {chartData.vedicSummary.currentDashaLord && (
        <text x="180" y="225" textAnchor="middle" fill="#B49F90" fontSize="12">
          Dasha: {chartData.vedicSummary.currentDashaLord}
        </text>
      )}
    </svg>
  )
}

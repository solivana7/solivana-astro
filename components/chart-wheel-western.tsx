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

const CX = 180
const CY = 180
const OUTER_R = 150
const INNER_R = 110
const PLANET_R = 78

function lonToAngle(lon: number): number {
  // Aries 0° at 3 o'clock, increasing counter-clockwise.
  return (lon * Math.PI) / 180
}

function polar(r: number, angle: number) {
  // Round to 2 decimals: trig results can differ in the last ULP between the
  // server and browser JS engines, which breaks React hydration matching.
  return {
    x: Math.round((CX + r * Math.cos(angle)) * 100) / 100,
    y: Math.round((CY - r * Math.sin(angle)) * 100) / 100,
  }
}

export function ChartWheelWestern({
  chartData,
}: {
  chartData: ChartData | null
}) {
  if (!chartData?.westernSummary?.ascendantSign) {
    return (
      <svg
        viewBox="0 0 360 360"
        role="img"
        aria-label="Western chart placeholder"
        className="h-auto w-full max-w-[360px] rounded-lg bg-[#1F1208]"
      >
        <text x="180" y="180" textAnchor="middle" fill="#B49F90" fontSize="14">
          Western chart data unavailable
        </text>
      </svg>
    )
  }

  const houses = Object.values(chartData.houses || {})

  return (
    <svg
      viewBox="0 0 360 360"
      role="img"
      aria-label="Western tropical chart"
      className="h-auto w-full max-w-[360px] rounded-lg bg-[#1F1208]"
    >
      <rect width="360" height="360" fill="#1F1208" rx="8" />

      {/* Zodiac segments */}
      {SIGNS.map((_, idx) => {
        const startAngle = lonToAngle(idx * 30)
        const endAngle = lonToAngle((idx + 1) * 30)
        const p1 = polar(OUTER_R, startAngle)
        const p2 = polar(INNER_R, startAngle)
        const p3 = polar(INNER_R, endAngle)
        const p4 = polar(OUTER_R, endAngle)
        const mid = polar((OUTER_R + INNER_R) / 2, (startAngle + endAngle) / 2)
        const fill = idx % 2 === 0 ? "#331D01" : "#1F1208"

        return (
          <g key={idx}>
            <path
              d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${INNER_R} ${INNER_R} 0 0 1 ${p3.x} ${p3.y} L ${p4.x} ${p4.y} A ${OUTER_R} ${OUTER_R} 0 0 0 ${p1.x} ${p1.y}`}
              fill={fill}
              stroke="#C8A45C"
              strokeWidth="1"
            />
            <text
              x={mid.x}
              y={mid.y + 4}
              textAnchor="middle"
              fill="#C8A45C"
              fontSize="12"
            >
              {SIGN_GLYPHS[SIGNS[idx]]}
            </text>
          </g>
        )
      })}

      {/* Outer and inner rings */}
      <circle
        cx={CX}
        cy={CY}
        r={OUTER_R}
        fill="none"
        stroke="#C8A45C"
        strokeWidth="2"
      />
      <circle
        cx={CX}
        cy={CY}
        r={INNER_R}
        fill="none"
        stroke="#C8A45C"
        strokeWidth="1.5"
      />

      {/* House cusp lines */}
      {houses.map((house) => {
        const angle = lonToAngle(house.lon)
        const outer = polar(OUTER_R, angle)
        const label = polar(INNER_R - 4, angle)
        return (
          <g key={house.number}>
            <line
              x1={CX}
              y1={CY}
              x2={outer.x}
              y2={outer.y}
              stroke="#B49F90"
              strokeWidth="1"
              opacity="0.7"
            />
            <text
              x={label.x}
              y={label.y + 3}
              textAnchor="middle"
              fill="#B49F90"
              fontSize="9"
            >
              {house.number}
            </text>
          </g>
        )
      })}

      {/* Center label */}
      <text
        x={CX}
        y={CY - 4}
        textAnchor="middle"
        fill="#C8A45C"
        fontSize="10"
        fontWeight="600"
      >
        Asc: {chartData.westernSummary.ascendantSign}
      </text>
      <text x={CX} y={CY + 10} textAnchor="middle" fill="#B49F90" fontSize="9">
        MC: {chartData.westernSummary.midheavenSign}
      </text>

      {/* Planets */}
      {Object.entries(chartData.planets).map(([name, planet]) => {
        const lon = planet.tropicalLon ?? planet.siderealLon ?? 0
        const angle = lonToAngle(lon)
        const pos = polar(PLANET_R, angle)
        return (
          <g key={name}>
            <circle
              cx={pos.x}
              cy={pos.y}
              r="11"
              fill={PLANET_COLORS[name] || "#B49F90"}
              opacity="0.95"
            />
            <text
              x={pos.x}
              y={pos.y + 4}
              textAnchor="middle"
              fill="#1F1208"
              fontSize="10"
              fontWeight="600"
            >
              {PLANET_GLYPHS[name] || name[0]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

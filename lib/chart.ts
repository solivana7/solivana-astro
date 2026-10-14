import { createHash } from "crypto"

export interface BirthParams {
  date: string
  time: string
  timezone: string
  lat: number
  lon: number
}

export interface ChartPlanet {
  tropicalLon: number
  tropicalSign?: string
  tropicalDeg?: number
  siderealLon?: number
  siderealSign?: string
  siderealDeg?: number
  nakshatra?: string
  nakshatraIdx?: number
  pada?: number
  nakshatraLord?: string
  signNum?: number
  vedicSignNum?: number
  /** Placidus house (tropical/Western). */
  house?: number
  /** Whole-sign house counted from the sidereal lagna (Vedic). */
  vedicHouse?: number
}

export interface ChartHouse {
  number: number
  lon: number
  sign: string
}

export interface BirthInfo {
  date: string
  time: string
  timezone: string
  location?: string
  lat: number
  lon: number
  weekday?: string
  julianDay?: number
}

export interface VedicSummary {
  lagnaSign: string
  moonSign: string
  sunSign: string
  atmakaraka?: string | null
  currentDashaLord?: string | null
}

export interface WesternSummary {
  ascendantSign: string
  midheavenSign: string
}

export interface DashaPeriod {
  lord: string
  start: string
  end: string
  years: number
}

export interface ChartData {
  birthInfo: BirthInfo
  planets: Record<string, ChartPlanet>
  houses: Record<string, ChartHouse>
  vedicSummary: VedicSummary
  westernSummary: WesternSummary
  dashaTimeline: DashaPeriod[]
  yogas: string[]
  westernAspects: string[]
}

export function hashBirthParams(params: BirthParams): string {
  const canonicalObj = {
    date: params.date,
    time: params.time,
    timezone: params.timezone,
    lat: Number(params.lat).toFixed(4),
    lon: Number(params.lon).toFixed(4),
  }
  const canonical = JSON.stringify(canonicalObj, Object.keys(canonicalObj).sort())
  return createHash("sha256").update(canonical).digest("hex")
}

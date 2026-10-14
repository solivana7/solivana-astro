import citiesData from "./data/cities.json"
import countriesData from "./data/countries.json"

interface CityEntry {
  n: string // ASCII name
  c: string // country code
  a: string // admin1 code (state/region, e.g. "CA")
  la: number
  lo: number
  p: number // population, for ranking
  tz: string // IANA timezone
}

export interface CityResult {
  name: string
  lat: number
  lon: number
  timezone?: string
}

const cities = citiesData as CityEntry[]
const countries = countriesData as Record<string, string>

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

function displayName(city: CityEntry): string {
  const country = countries[city.c] ?? city.c
  // Two-letter admin codes (US/CA/AU states) disambiguate same-name cities.
  return /^[A-Z]{2}$/.test(city.a)
    ? `${city.n}, ${city.a}, ${country}`
    : `${city.n}, ${country}`
}

function toResult(city: CityEntry): CityResult {
  return {
    name: displayName(city),
    lat: city.la,
    lon: city.lo,
    timezone: city.tz,
  }
}

/**
 * Search the bundled GeoNames dataset (34k cities, population >= 15k).
 * Prefix matches rank first, then substring matches, each by population.
 */
export function searchCities(query: string, limit = 8): CityResult[] {
  const needle = normalize(query.trim())
  if (needle.length < 2) return []

  const prefix: CityEntry[] = []
  const contains: CityEntry[] = []

  for (const city of cities) {
    const hay = normalize(city.n)
    if (hay.startsWith(needle)) {
      prefix.push(city)
    } else if (hay.includes(needle)) {
      contains.push(city)
    }
  }

  const byPopulation = (a: CityEntry, b: CityEntry) => b.p - a.p
  prefix.sort(byPopulation)
  contains.sort(byPopulation)

  const seen = new Set<string>()
  const results: CityResult[] = []
  for (const city of [...prefix, ...contains]) {
    const key = displayName(city)
    if (seen.has(key)) continue
    seen.add(key)
    results.push(toResult(city))
    if (results.length >= limit) break
  }

  return results
}

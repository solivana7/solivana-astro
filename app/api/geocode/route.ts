import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { searchCities, type CityResult } from "@/lib/cities"

interface NominatimResult {
  display_name: string
  lat: string
  lon: string
}

type GeocodeResult = CityResult[]

interface CacheEntry {
  data: GeocodeResult
  expiresAt: number
}

const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_CACHE_SIZE = 100
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX = 10

const geocodeCache = new Map<string, CacheEntry>()
const requestTimestamps = new Map<string, number[]>()

// Prune stale rate-limiter entries globally every 60 seconds so the Map cannot
// grow unbounded from transient IP keys.
setInterval(() => {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  for (const [ip, timestamps] of requestTimestamps) {
    const recent = timestamps.filter((t) => t > windowStart)
    if (recent.length === 0) {
      requestTimestamps.delete(ip)
    } else {
      requestTimestamps.set(ip, recent)
    }
  }
}, 60_000)

function evictOldest() {
  const oldest = geocodeCache.keys().next().value
  if (oldest !== undefined) {
    geocodeCache.delete(oldest)
  }
}

function getCached(query: string): GeocodeResult | null {
  const entry = geocodeCache.get(query)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    geocodeCache.delete(query)
    return null
  }
  return entry.data
}

function setCached(query: string, data: GeocodeResult) {
  if (geocodeCache.size >= MAX_CACHE_SIZE && !geocodeCache.has(query)) {
    evictOldest()
  }
  geocodeCache.set(query, { data, expiresAt: Date.now() + CACHE_TTL_MS })
}

function getClientIp(req: NextRequest): string {
  // Vercel appends the real client IP last; earlier entries are spoofable.
  const forwarded = req.headers.get("x-forwarded-for")
  return forwarded?.split(",").at(-1)?.trim() ?? "unknown"
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = requestTimestamps.get(ip) ?? []
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const recent = timestamps.filter((t) => t > windowStart)
  if (recent.length === 0) {
    requestTimestamps.delete(ip)
  } else {
    requestTimestamps.set(ip, recent)
  }
  return recent.length >= RATE_LIMIT_MAX
}

function recordRequest(ip: string) {
  const timestamps = requestTimestamps.get(ip) ?? []
  timestamps.push(Date.now())
  requestTimestamps.set(ip, timestamps)
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")

  if (!query || !query.trim()) {
    return NextResponse.json(
      { error: "Missing query parameter: q" },
      { status: 400 },
    )
  }

  const queryParse = z.string().min(1).max(200).safeParse(query)
  if (!queryParse.success) {
    return NextResponse.json(
      { error: "Invalid query parameter: q" },
      { status: 400 },
    )
  }

  // The bundled GeoNames dataset (34k cities) covers nearly every query and
  // costs nothing per call; Nominatim only tops up small-town searches.
  const local = searchCities(queryParse.data, 8)
  if (local.length >= 5) {
    return NextResponse.json(local)
  }

  const ip = getClientIp(req)
  if (isRateLimited(ip)) {
    return NextResponse.json(local.length > 0 ? local : { error: "Rate limit exceeded" }, {
      status: local.length > 0 ? 200 : 429,
    })
  }
  recordRequest(ip)

  const normalizedQuery = query.trim().toLowerCase()
  const cached = getCached(normalizedQuery)
  if (cached) {
    return NextResponse.json(cached)
  }

  try {
    const url =
      "https://nominatim.openstreetmap.org/search?" +
      new URLSearchParams({
        q: query,
        format: "json",
        limit: "8",
      }).toString()

    const res = await fetch(url, {
      headers: {
        "User-Agent": "KarmicInterpreter/0.0.1 (astro.solivana.io)",
      },
    })

    if (!res.ok) {
      return NextResponse.json(local, { status: 200 })
    }

    const data = (await res.json()) as NominatimResult[]

    const seen = new Set(local.map((r) => r.name.toLowerCase()))
    const merged = [...local]
    for (const item of data) {
      const name = item.display_name
      if (seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      merged.push({ name, lat: Number(item.lat), lon: Number(item.lon) })
      if (merged.length >= 8) break
    }

    setCached(normalizedQuery, merged)

    return NextResponse.json(merged)
  } catch (error) {
    console.error(error)
    // The offline dataset still answers even when Nominatim is down.
    return NextResponse.json(local)
  }
}

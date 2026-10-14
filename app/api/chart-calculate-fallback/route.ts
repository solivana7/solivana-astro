import { NextRequest, NextResponse } from "next/server"

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
]

function parseOffsetMinutes(timezone: string): number | null {
  const normalized = timezone.trim()
  if (/^(UTC|GMT|Z)$/i.test(normalized)) {
    return 0
  }

  const match = normalized.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/)
  if (!match) {
    return null
  }

  const sign = match[1] === "+" ? 1 : -1
  const hours = parseInt(match[2], 10)
  const minutes = parseInt(match[3] || "0", 10)

  if (minutes >= 60 || hours > 14) {
    throw new Error(`Invalid timezone offset: ${timezone}`)
  }

  return sign * (hours * 60 + minutes)
}

function getIANAOffsetMinutes(utcTimestamp: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })

  const parts = formatter.formatToParts(new Date(utcTimestamp))
  const tzName = parts.find((part) => part.type === "timeZoneName")?.value || ""
  const offsetStr = tzName.replace("GMT", "")

  if (!offsetStr) {
    throw new Error(`Could not determine offset for timezone: ${timeZone}`)
  }

  const parsed = parseOffsetMinutes(offsetStr)
  if (parsed === null) {
    throw new Error(`Invalid offset from timezone: ${timeZone}`)
  }

  return parsed
}

function localToUtcTimestamp(date: string, time: string, timeZone: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date format: ${date}`)
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error(`Invalid time format: ${time}`)
  }

  const targetMs = Date.parse(`${date}T${time}:00Z`)
  if (Number.isNaN(targetMs)) {
    throw new Error(`Invalid date/time: ${date} ${time}`)
  }

  const offsetMinutes = parseOffsetMinutes(timeZone)
  if (offsetMinutes !== null) {
    return targetMs - offsetMinutes * 60 * 1000
  }

  // IANA timezone: solve t = targetLocalMs - offset(t, tz)
  let t = targetMs
  for (let i = 0; i < 10; i++) {
    const offset = getIANAOffsetMinutes(t, timeZone)
    const nextT = targetMs - offset * 60 * 1000
    if (Math.abs(nextT - t) < 1000) {
      return nextT
    }
    t = nextT
  }

  return t
}

export async function POST(req: NextRequest) {
  // Internal endpoint: called only by our own chart service, which signs the
  // request with a shared secret. Public traffic burns paid function time.
  const secret = process.env.INTERNAL_API_SECRET
  if (!secret || req.headers.get("x-internal-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const date = String(body.date ?? "")
  const time = String(body.time ?? "")
  const timezone = String(body.timezone ?? "")
  // Number(null) === 0 would silently yield a Null-Island chart; require real numbers.
  const lat = typeof body.lat === "number" ? body.lat : Number.NaN
  const lon = typeof body.lon === "number" ? body.lon : Number.NaN

  if (
    !date ||
    !time ||
    !timezone ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return NextResponse.json(
      { error: "Missing or invalid fields: date, time, timezone, lat, lon" },
      { status: 400 },
    )
  }

  let utcDate: Date
  try {
    const utcMs = localToUtcTimestamp(date, time, timezone)
    utcDate = new Date(utcMs)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: `Invalid birth datetime: ${message}` },
      { status: 400 },
    )
  }

  try {
    // Dynamically import swisseph so that builds don't fail when the native
    // module isn't compiled (e.g. local dev without C++ build tools). The
    // primary chart calculation is handled by the Python function; this route
    // is only a fallback.
    const swisseph = await import("swisseph")

    const PLANETS = [
      { id: "Sun", body: swisseph.SE_SUN },
      { id: "Moon", body: swisseph.SE_MOON },
      { id: "Mercury", body: swisseph.SE_MERCURY },
      { id: "Venus", body: swisseph.SE_VENUS },
      { id: "Mars", body: swisseph.SE_MARS },
      { id: "Jupiter", body: swisseph.SE_JUPITER },
      { id: "Saturn", body: swisseph.SE_SATURN },
      { id: "North Node", body: swisseph.SE_MEAN_NODE },
    ]

    const jd = swisseph.swe_julday(
      utcDate.getUTCFullYear(),
      utcDate.getUTCMonth() + 1,
      utcDate.getUTCDate(),
      utcDate.getUTCHours() +
        utcDate.getUTCMinutes() / 60 +
        utcDate.getUTCSeconds() / 3600,
      swisseph.SE_GREG_CAL,
    )

    const planets: Record<
      string,
      {
        tropicalLon: number
        siderealLon: null
        sign: string
        signNum: number
      }
    > = {}

    for (const { id, body: planetBody } of PLANETS) {
      const result = swisseph.swe_calc_ut(jd, planetBody, swisseph.SEFLG_SWIEPH)
      if ("error" in result) {
        continue
      }
      const lon = "longitude" in result ? result.longitude : 0
      planets[id] = {
        tropicalLon: lon,
        siderealLon: null,
        sign: SIGNS[Math.floor(lon / 30) % 12],
        signNum: Math.floor(lon / 30) % 12,
      }
    }

    return NextResponse.json({
      fallback: true,
      julianDay: jd,
      birthInfo: {
        date,
        time,
        timezone,
        lat,
        lon,
      },
      planets,
      houses: {},
      dashaTimeline: [],
      yogas: [],
      westernAspects: [],
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "Chart fallback unavailable" },
      { status: 503 },
    )
  }
}

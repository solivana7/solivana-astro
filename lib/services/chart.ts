import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { chartCache } from "@/lib/db/schema"
import {
  hashBirthParams,
  type BirthParams,
  type ChartData,
} from "@/lib/chart"

export interface BirthData {
  birthDate: string
  birthTime: string
  timezone: string
  locationName?: string
  lat: number
  lon: number
  unknownTime?: boolean
}

function chartServiceUrl(): string {
  const base =
    process.env.APP_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  return base.replace(/\/$/, "")
}

async function fetchChartData(url: string, payload: object): Promise<ChartData> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Chart endpoints are internal-only; both check this shared secret.
      "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Chart service returned ${response.status}: ${text}`)
  }

  return (await response.json()) as ChartData
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Retry a chart endpoint with linear backoff before giving up. */
async function fetchWithRetries(
  url: string,
  payload: object,
  attempts: number,
): Promise<ChartData> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetchChartData(url, payload)
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await sleep(500 * attempt)
      }
    }
  }
  throw lastError
}

export async function getOrCalculateChart(
  birthData: BirthData,
): Promise<ChartData> {
  const params: BirthParams = {
    date: birthData.birthDate,
    time: birthData.birthTime,
    timezone: birthData.timezone,
    lat: birthData.lat,
    lon: birthData.lon,
  }

  const chartHash = hashBirthParams(params)

  const cached = await db.query.chartCache.findFirst({
    where: eq(chartCache.chartHash, chartHash),
  })
  if (cached) {
    return cached.chartDataJson as ChartData
  }

  const payload = {
    date: birthData.birthDate,
    time: birthData.birthTime,
    timezone: birthData.timezone,
    lat: birthData.lat,
    lon: birthData.lon,
  }

  const baseUrl = chartServiceUrl()
  // Primary: 3 attempts with backoff. Fallback (degraded data): 2 attempts.
  const chartData = await fetchWithRetries(
    `${baseUrl}/api/chart-calculate`,
    payload,
    3,
  ).catch(async (error) => {
    console.warn(
      "Primary chart-calculate failed after retries, falling back to JS route:",
      error,
    )
    return fetchWithRetries(`${baseUrl}/api/chart-calculate-fallback`, payload, 2)
  })

  await db
    .insert(chartCache)
    .values({ chartHash, chartDataJson: chartData })
    .onConflictDoUpdate({
      target: chartCache.chartHash,
      set: { chartDataJson: chartData },
    })

  return chartData
}

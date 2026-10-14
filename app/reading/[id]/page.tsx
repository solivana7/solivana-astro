import Link from "next/link"
import { z } from "zod"
import type { Metadata } from "next"

import { ResultsDashboard } from "@/components/results-dashboard"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import type { ChartData } from "@/lib/chart"

const chartHouseSchema = z.object({
  number: z.number(),
  lon: z.number(),
  sign: z.string(),
})

const chartPlanetSchema = z.object({
  tropicalLon: z.number(),
  tropicalSign: z.string().optional(),
  tropicalDeg: z.number().optional(),
  siderealLon: z.number().optional(),
  siderealSign: z.string().optional(),
  siderealDeg: z.number().optional(),
  nakshatra: z.string().optional(),
  nakshatraIdx: z.number().optional(),
  pada: z.number().optional(),
  nakshatraLord: z.string().optional(),
  signNum: z.number().optional(),
  vedicSignNum: z.number().optional(),
  house: z.number().optional(),
})

const birthInfoSchema = z.object({
  date: z.string(),
  time: z.string(),
  timezone: z.string(),
  location: z.string().optional(),
  lat: z.number(),
  lon: z.number(),
  weekday: z.string().optional(),
  julianDay: z.number().optional(),
})

const vedicSummarySchema = z.object({
  lagnaSign: z.string(),
  moonSign: z.string(),
  sunSign: z.string(),
  atmakaraka: z.string().nullable().optional(),
  currentDashaLord: z.string().nullable().optional(),
})

const westernSummarySchema = z.object({
  ascendantSign: z.string(),
  midheavenSign: z.string(),
})

const dashaPeriodSchema = z.object({
  lord: z.string(),
  start: z.string(),
  end: z.string(),
  years: z.number(),
})

const chartDataSchema = z.object({
  birthInfo: birthInfoSchema,
  planets: z.record(z.string(), chartPlanetSchema),
  houses: z.record(z.string(), chartHouseSchema),
  vedicSummary: vedicSummarySchema,
  westernSummary: westernSummarySchema,
  dashaTimeline: z.array(dashaPeriodSchema),
  yogas: z.array(z.string()),
  westernAspects: z.array(z.string()),
})

interface ResultResponse {
  reading: {
    id: string
    status: string
    progress: number
    currentStep: string | null
    focusAreas: string[]
    createdAt: string
    completedAt: string | null
    expiresAt: string
  }
  chartData: unknown
  chartSvgs: { vedic: string; western: string } | null
  sections: {
    id: string
    sectionType: string
    title: string
    content: string
    generatedAt: string
    tokensUsed: number
  }[]
  reportMarkdown: string | null
  reportUrls: {
    docx: string | null
    pdf: string | null
    ics: string | null
  }
  error?: string
}

function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

// Shared links unfurl into the reading's chart card (rendered on demand).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const imageUrl = `${appUrl()}/api/reading/${id}/download?type=chart`
  return {
    title: "Your Karmic reading",
    openGraph: {
      title: "Your Karmic reading · SoliVana Astro",
      description:
        "A Vedic + Western natal chart reading, decoded in minutes.",
      images: [{ url: imageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      images: [imageUrl],
    },
  }
}

async function fetchResult(id: string): Promise<ResultResponse | null> {
  try {
    const res = await fetch(`${appUrl()}/api/reading/${id}/result`, {
      cache: "no-store",
    })

    if (!res.ok) return null
    return (await res.json()) as ResultResponse
  } catch {
    return null
  }
}

export default async function ReadingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await fetchResult(id)

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F6F1EC] px-6">
        <div className="text-center">
          <h1 className="text-2xl font-medium text-[#1F1208]">
            Reading not found
          </h1>
          <p className="mt-2 text-[#786455]">
            Readings live for 30 days, then return to the sky. This link may
            have expired — or it was never ours.
          </p>
          <Button
            nativeButton={false}
            className="mt-6 bg-[#EC9247] text-[#1F1208]"
            render={<Link href="/" />}
          >
            Return home
          </Button>
        </div>
      </main>
    )
  }

  if (data.reading.status !== "completed") {
    const statusCopy: Record<string, string> = {
      processing: "Your reading is being woven",
      failed: "Your reading hit a snag",
      pending: "Your reading is queued",
    }
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F6F1EC] px-6">
        <div className="text-center">
          <h1 className="text-2xl font-medium text-[#1F1208]">
            {statusCopy[data.reading.status] ?? "Your reading is on its way"}
          </h1>
          <p className="mt-2 text-[#786455]">
            Current step: {data.reading.currentStep || "Starting"}
          </p>
          <Button
            nativeButton={false}
            className="mt-6 bg-[#EC9247] text-[#1F1208]"
            render={<Link href={`/reading/${id}/processing`} />}
          >
            Check progress
          </Button>
        </div>
      </main>
    )
  }

  const parsedChart = chartDataSchema.safeParse(data.chartData)
  const chartData: ChartData | null = parsedChart.success
    ? (parsedChart.data as ChartData)
    : null

  return (
    <>
      <SiteHeader />
      <ResultsDashboard
        reading={data.reading}
        chartData={chartData}
        chartSvgs={data.chartSvgs}
        sections={data.sections}
        reportMarkdown={data.reportMarkdown}
        reportUrls={data.reportUrls}
      />
    </>
  )
}

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { get } from "@vercel/blob"
import { db } from "@/lib/db"
import { readings } from "@/lib/db/schema"
import { renderShareImage } from "@/lib/chart/share-image"

const ALLOWED_TYPES = ["docx", "pdf", "ics", "chart"] as const
type ReportType = (typeof ALLOWED_TYPES)[number]
type BlobType = Exclude<ReportType, "chart">

const REPORT_COLUMNS: Record<BlobType, "reportDocxUrl" | "reportPdfUrl" | "reportIcsUrl"> = {
  docx: "reportDocxUrl",
  pdf: "reportPdfUrl",
  ics: "reportIcsUrl",
}

function filenameFor(id: string, type: BlobType, url: string): string {
  try {
    const pathname = new URL(url).pathname
    const base = pathname.split("/").pop()
    if (base) return base
  } catch {
    // fall through
  }
  return `reading-${id}.${type}`
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const idParse = z.string().uuid().safeParse(id)
  if (!idParse.success) {
    return NextResponse.json(
      { error: "Invalid reading id: expected UUID" },
      { status: 400 },
    )
  }

  const type = req.nextUrl.searchParams.get("type") ?? "docx"
  if (!ALLOWED_TYPES.includes(type as ReportType)) {
    return NextResponse.json(
      { error: `Invalid type: must be one of ${ALLOWED_TYPES.join(", ")}` },
      { status: 400 },
    )
  }

  try {
    const reading = await db.query.readings.findFirst({
      where: eq(readings.id, id),
      columns: {
        expiresAt: true,
        birthDataJson: true,
        chartSvgsJson: true,
        reportDocxUrl: true,
        reportPdfUrl: true,
        reportIcsUrl: true,
      },
    })

    if (!reading) {
      return NextResponse.json({ error: "Reading not found" }, { status: 404 })
    }

    if (reading.expiresAt && new Date(reading.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: "Reading has expired" },
        { status: 410 },
      )
    }

    // The share card image is rendered on demand, not stored as a blob.
    if (type === "chart") {
      const birth = reading.birthDataJson as {
        birthDate?: string
        birthTime?: string
        locationName?: string
      } | null
      const png = await renderShareImage(
        reading.chartSvgsJson as { vedic?: string; western?: string } | null,
        birth
          ? {
              date: birth.birthDate,
              time: birth.birthTime,
              locationName: birth.locationName,
            }
          : null,
      )
      if (!png) {
        return NextResponse.json(
          { error: "No chart image available for this reading" },
          { status: 404 },
        )
      }
      return new Response(new Uint8Array(png), {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": `attachment; filename="karmic-chart-${id}.png"`,
          "Cache-Control": "private, no-store",
        },
      })
    }

    const column = REPORT_COLUMNS[type as BlobType]
    const url = reading[column]

    if (!url) {
      return NextResponse.json(
        { error: `No ${type} report available for this reading` },
        { status: 404 },
      )
    }

    // Reports are stored as private blobs, so the route streams the file
    // after the checks above instead of handing out a permanent public URL.
    const file = await get(url, { access: "private" })
    if (!file || file.statusCode !== 200) {
      return NextResponse.json(
        { error: "Report file not found" },
        { status: 404 },
      )
    }

    return new Response(file.stream, {
      headers: {
        "Content-Type": file.blob.contentType,
        "Content-Disposition": `attachment; filename="${filenameFor(id, type as BlobType, url)}"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { readings, reportSections } from "@/lib/db/schema"

export async function GET(
  _req: NextRequest,
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

  try {
    const reading = await db.query.readings.findFirst({
      where: eq(readings.id, id),
      columns: {
        id: true,
        status: true,
        progress: true,
        currentStep: true,
        focusAreasJson: true,
        createdAt: true,
        completedAt: true,
        expiresAt: true,
        chartDataJson: true,
        chartSvgsJson: true,
        reportDocxUrl: true,
        reportPdfUrl: true,
        reportIcsUrl: true,
        reportMarkdown: true,
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

    const sections = await db.query.reportSections.findMany({
      where: eq(reportSections.readingId, id),
      orderBy: asc(reportSections.generatedAt),
      columns: {
        id: true,
        sectionType: true,
        title: true,
        content: true,
        generatedAt: true,
        tokensUsed: true,
      },
    })

    return NextResponse.json({
      reading: {
        id: reading.id,
        status: reading.status,
        progress: reading.progress ?? 0,
        currentStep: reading.currentStep ?? null,
        focusAreas: reading.focusAreasJson,
        createdAt: reading.createdAt,
        completedAt: reading.completedAt ?? null,
        expiresAt: reading.expiresAt,
      },
      chartData: reading.chartDataJson ?? null,
      chartSvgs: reading.chartSvgsJson ?? null,
      sections,
      reportMarkdown: reading.reportMarkdown ?? null,
      reportUrls: {
        docx: reading.reportDocxUrl ?? null,
        pdf: reading.reportPdfUrl ?? null,
        ics: reading.reportIcsUrl ?? null,
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

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { readings } from "@/lib/db/schema"

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
        status: true,
        progress: true,
        currentStep: true,
        reportDocxUrl: true,
        reportPdfUrl: true,
        reportIcsUrl: true,
        errorMessage: true,
      },
    })

    if (!reading) {
      return NextResponse.json({ error: "Reading not found" }, { status: 404 })
    }

    return NextResponse.json({
      status: reading.status,
      progress: reading.progress ?? 0,
      currentStep: reading.currentStep ?? null,
      reportUrls: {
        docx: reading.reportDocxUrl ?? null,
        pdf: reading.reportPdfUrl ?? null,
        ics: reading.reportIcsUrl ?? null,
      },
      error: reading.errorMessage ? "Processing failed" : null,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}

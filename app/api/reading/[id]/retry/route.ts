import { after, NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, eq, lt, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { readings } from "@/lib/db/schema"

// The retried pipeline runs via `after` within this invocation (see create).
export const maxDuration = 300

// A reading stuck in "processing" longer than this is considered abandoned
// (the platform killed the invocation mid-run) and may be retried.
const STALE_PROCESSING_MS = 10 * 60 * 1000

export async function POST(
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
      columns: { status: true },
    })

    if (!reading) {
      return NextResponse.json({ error: "Reading not found" }, { status: 404 })
    }

    // Claim the retry atomically so two concurrent requests can't both start
    // a pipeline. Claimable states: failed, or stale processing.
    const [claimed] = await db
      .update(readings)
      .set({
        status: "processing",
        progress: 0,
        currentStep: "Received your birth data",
        errorMessage: null,
      })
      .where(
        and(
          eq(readings.id, id),
          or(
            eq(readings.status, "failed"),
            and(
              eq(readings.status, "processing"),
              lt(
                readings.updatedAt,
                new Date(Date.now() - STALE_PROCESSING_MS),
              ),
            ),
          ),
        ),
      )
      .returning({ id: readings.id })

    if (!claimed) {
      return NextResponse.json(
        {
          error:
            reading.status === "completed"
              ? "Only failed readings can be retried"
              : "Reading is still processing",
        },
        { status: 409 },
      )
    }

    // Keep the invocation alive via waitUntil until the pipeline settles
    // (a floating promise gets frozen by the platform — see create route).
    after(async () => {
      try {
        const { runReadingPipeline } = await import("@/lib/services/pipeline")
        await runReadingPipeline(id)
      } catch (error) {
        console.error("Pipeline trigger failed:", error)
      }
    })

    return NextResponse.json({ status: "processing" }, { status: 202 })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}

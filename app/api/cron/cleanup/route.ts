import { NextRequest, NextResponse } from "next/server"
import { inArray, lt } from "drizzle-orm"
import { del } from "@vercel/blob"
import { db } from "@/lib/db"
import { readings, reportSections, reportShares } from "@/lib/db/schema"

export const maxDuration = 300

// Run cap per invocation; the cron runs daily, so backlogs drain over days.
const BATCH_LIMIT = 200
// Small grace window past the advertised 30-day expiry before hard deletion.
const GRACE_MS = 24 * 60 * 60 * 1000

// Vercel Cron calls this route daily with a Bearer token (see vercel.json).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const cutoff = new Date(Date.now() - GRACE_MS)
    const expired = await db.query.readings.findMany({
      where: lt(readings.expiresAt, cutoff),
      columns: {
        id: true,
        reportDocxUrl: true,
        reportPdfUrl: true,
        reportIcsUrl: true,
      },
      limit: BATCH_LIMIT,
    })

    if (expired.length === 0) {
      return NextResponse.json({ deleted: 0, blobs: 0 })
    }

    const blobUrls = expired
      .flatMap((r) => [r.reportDocxUrl, r.reportPdfUrl, r.reportIcsUrl])
      .filter((url): url is string => Boolean(url))

    if (blobUrls.length > 0) {
      await del(blobUrls)
    }

    const ids = expired.map((r) => r.id)
    await db.transaction(async (tx) => {
      await tx
        .delete(reportSections)
        .where(inArray(reportSections.readingId, ids))
      await tx
        .delete(reportShares)
        .where(inArray(reportShares.readingId, ids))
      await tx.delete(readings).where(inArray(readings.id, ids))
    })

    return NextResponse.json({ deleted: ids.length, blobs: blobUrls.length })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, count, eq, gt } from "drizzle-orm"
import { get } from "@vercel/blob"
import { db } from "@/lib/db"
import { readings, reportShares, users } from "@/lib/db/schema"
import { sendReportShareEmail } from "@/lib/services/email"

// Anti-abuse limits for an unauthenticated email-sending endpoint.
const MAX_SHARES_PER_READING_PER_DAY = 5
const MAX_SHARES_PER_RECIPIENT_PER_DAY = 2
const DAY_MS = 24 * 60 * 60 * 1000

const shareSchema = z.object({
  email: z.string().email(),
})

export async function POST(
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

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const bodyParse = shareSchema.safeParse(body)
  if (!bodyParse.success) {
    return NextResponse.json(
      { error: "A valid recipient email is required" },
      { status: 400 },
    )
  }

  // Normalize so the recipient cap can't be dodged with case variants.
  const recipient = bodyParse.data.email.trim().toLowerCase()

  try {
    const reading = await db.query.readings.findFirst({
      where: eq(readings.id, id),
      columns: {
        status: true,
        userId: true,
        expiresAt: true,
        reportPdfUrl: true,
      },
    })

    if (!reading) {
      return NextResponse.json({ error: "Reading not found" }, { status: 404 })
    }

    if (reading.status !== "completed") {
      return NextResponse.json(
        { error: "Only completed readings can be shared" },
        { status: 409 },
      )
    }

    if (reading.expiresAt && new Date(reading.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: "Reading has expired" },
        { status: 410 },
      )
    }

    if (!reading.reportPdfUrl) {
      return NextResponse.json(
        { error: "No PDF report available for this reading" },
        { status: 404 },
      )
    }

    const since = new Date(Date.now() - DAY_MS)

    const [readingShares] = await db
      .select({ value: count() })
      .from(reportShares)
      .where(
        and(eq(reportShares.readingId, id), gt(reportShares.sentAt, since)),
      )

    if ((readingShares?.value ?? 0) >= MAX_SHARES_PER_READING_PER_DAY) {
      return NextResponse.json(
        { error: "This reading has been shared enough for today" },
        { status: 429 },
      )
    }

    const [recipientShares] = await db
      .select({ value: count() })
      .from(reportShares)
      .where(
        and(
          eq(reportShares.recipientEmail, recipient),
          gt(reportShares.sentAt, since),
        ),
      )

    if ((recipientShares?.value ?? 0) >= MAX_SHARES_PER_RECIPIENT_PER_DAY) {
      return NextResponse.json(
        { error: "We just sent this there — give it a day" },
        { status: 429 },
      )
    }

    const file = await get(reading.reportPdfUrl, { access: "private" })
    if (!file || file.statusCode !== 200) {
      return NextResponse.json(
        { error: "Report file not found" },
        { status: 502 },
      )
    }
    const pdfBuffer = Buffer.from(
      await new Response(file.stream).arrayBuffer(),
    )

    const owner = await db.query.users.findFirst({
      where: eq(users.id, reading.userId),
      columns: { name: true },
    })

    // Record the share before sending so a failed send never goes uncounted;
    // roll it back if the send fails.
    await db
      .insert(reportShares)
      .values({ readingId: id, recipientEmail: recipient })

    const sent = await sendReportShareEmail({
      to: recipient,
      ownerName: owner?.name ?? "Someone",
      readingId: id,
      pdfBuffer,
    })

    if (!sent) {
      await db
        .delete(reportShares)
        .where(
          and(
            eq(reportShares.readingId, id),
            eq(reportShares.recipientEmail, recipient),
          ),
        )
      return NextResponse.json(
        { error: "The email could not be sent" },
        { status: 502 },
      )
    }

    return NextResponse.json({ sent: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}

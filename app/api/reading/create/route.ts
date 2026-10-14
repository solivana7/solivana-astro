import { after, NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { and, count, eq, gt, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { users, readings, paymentTokens } from "@/lib/db/schema"
import { hasStripe } from "@/lib/stripe"

// The pipeline runs via `after` within this invocation, so the route must
// stay alive for the whole pipeline (~90s). 300s is the Hobby plan maximum.
export const maxDuration = 300

// Spec §10: at most this many reading creations per email per rolling 24h.
const MAX_READINGS_PER_DAY = 3
const DAY_MS = 24 * 60 * 60 * 1000

const createReadingSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birthTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string(),
  locationName: z.string(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  unknownTime: z.boolean().default(false),
  // One-use token from a paid Stripe checkout (see verify-payment route).
  // Required when Stripe is configured; ignored in free (unconfigured) mode.
  paymentToken: z.string().max(200).optional(),
  focusAreas: z
    .array(
      z.enum([
        "life_purpose",
        "finances",
        "health",
        "relationships",
        "business",
        "timing",
      ]),
    )
    .optional(),
})

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parseResult = createReadingSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parseResult.error.issues },
      { status: 400 },
    )
  }

  const data = parseResult.data
  // Normalize so lookups, the unique constraint, and rate-limit counts all
  // agree — Postgres text comparisons are case-sensitive.
  const email = data.email.trim().toLowerCase()

  try {
    // Payment gate (PetView pattern): when Stripe is configured, a reading
    // costs one paid checkout session. Unconfigured = free mode for dev/tests.
    if (hasStripe()) {
      if (!data.paymentToken) {
        return NextResponse.json(
          { error: "payment_required", paid: false },
          { status: 402 },
        )
      }
      const token = await db.query.paymentTokens.findFirst({
        where: and(
          eq(paymentTokens.stripeSessionId, data.paymentToken),
          isNull(paymentTokens.usedAt),
        ),
        columns: { id: true },
      })
      if (!token) {
        return NextResponse.json(
          { error: "payment_required", paid: false },
          { status: 402 },
        )
      }
    }

    // Enforce the per-email daily limit before creating anything.
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email),
      columns: { id: true },
    })

    if (existingUser) {
      const [row] = await db
        .select({ value: count() })
        .from(readings)
        .where(
          and(
            eq(readings.userId, existingUser.id),
            gt(readings.createdAt, new Date(Date.now() - DAY_MS)),
          ),
        )

      if ((row?.value ?? 0) >= MAX_READINGS_PER_DAY) {
        return NextResponse.json(
          {
            error: `Three readings a day is the limit, by design. Yours resets tomorrow.`,
          },
          { status: 429 },
        )
      }
    }

    const reading = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ name: data.name, email })
        .onConflictDoUpdate({
          target: users.email,
          set: { name: data.name },
        })
        .returning({ id: users.id })

      if (!user) {
        throw new Error("Failed to create or resolve user")
      }

      const birthData = {
        birthDate: data.birthDate,
        birthTime: data.birthTime,
        timezone: data.timezone,
        locationName: data.locationName,
        lat: data.lat,
        lon: data.lon,
        unknownTime: data.unknownTime,
      }

      const [created] = await tx
        .insert(readings)
        .values({
          userId: user.id,
          status: "processing",
          progress: 0,
          currentStep: "Received your birth data",
          birthDataJson: birthData,
          focusAreasJson: data.focusAreas,
          expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
        })
        .returning({ id: readings.id })

      if (!created) {
        throw new Error("Failed to create reading")
      }

      // Burn the payment token only after the reading exists.
      if (hasStripe() && data.paymentToken) {
        await tx
          .update(paymentTokens)
          .set({ usedAt: new Date() })
          .where(eq(paymentTokens.stripeSessionId, data.paymentToken))
      }

      return created
    })

    // Run the pipeline after the response is sent. `after` extends the
    // serverless invocation via waitUntil until the pipeline settles — a
    // plain floating promise gets frozen by the platform mid-run.
    after(async () => {
      try {
        const { runReadingPipeline } = await import("@/lib/services/pipeline")
        await runReadingPipeline(reading.id)
      } catch (error) {
        console.error("Pipeline trigger failed:", error)
      }
    })

    return NextResponse.json(
      {
        readingId: reading.id,
        status: "processing",
        estimatedSeconds: 180,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    )
  }
}

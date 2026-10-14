import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { paymentTokens } from "@/lib/db/schema"
import { hasStripe, getPaidSessionEmail } from "@/lib/stripe"

// Landing URL for the Stripe Payment Link success redirect
// (/reading?session_id={CHECKOUT_SESSION_ID}). Confirms the session is paid
// and mints the one-use token the create route requires. The session id
// itself acts as the token — unguessable and unique-constrained.
export async function GET(req: NextRequest) {
  if (!hasStripe()) {
    return NextResponse.json(
      { error: "Payments are not configured" },
      { status: 503 },
    )
  }

  const sessionId = req.nextUrl.searchParams.get("session_id")
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 })
  }

  try {
    const email = await getPaidSessionEmail(sessionId)
    if (email === null) {
      return NextResponse.json(
        { error: "Payment not completed", paid: false },
        { status: 402 },
      )
    }

    await db
      .insert(paymentTokens)
      .values({ stripeSessionId: sessionId, email })
      .onConflictDoNothing({ target: paymentTokens.stripeSessionId })

    return NextResponse.json({ paid: true, token: sessionId })
  } catch (error) {
    console.error("verify-payment failed:", error)
    return NextResponse.json(
      { error: "Could not verify payment" },
      { status: 500 },
    )
  }
}

import Stripe from "stripe"

// Server-only Stripe client, created lazily so builds and tests without keys
// keep working. When unset, payment gating fails open (free readings) —
// mirrors the PetView pattern where missing Stripe config means free access.
let client: Stripe | null = null

export function hasStripe(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured")
  if (!client) {
    client = new Stripe(key)
  }
  return client
}

// Returns the buyer email when the checkout session is settled, else null.
// Accepts 'no_payment_required' as well: 100%-off coupons (e.g. LAUNCH)
// complete without a charge.
export async function getPaidSessionEmail(
  sessionId: string,
): Promise<string | null> {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return null
  const session = await getStripe().checkout.sessions.retrieve(sessionId)
  const settled =
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required"
  if (!settled) return null
  return session.customer_details?.email ?? null
}

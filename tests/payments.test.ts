import { describe, it, expect, vi, beforeEach } from "vitest"

// Payment gate on the create route (PetView pattern): when Stripe is
// configured, creating a reading requires an unused payment token.

const store = {
  tokens: new Map<string, Record<string, unknown>>(),
  lastUser: { id: "user-1" } as { id: string } | null,
}

vi.mock("next/server", async (importOriginal) => {
  const original = (await importOriginal()) as typeof import("next/server")
  return { ...original, after: vi.fn() }
})

vi.mock("@/lib/stripe", () => ({
  hasStripe: () => true,
  getStripe: vi.fn(),
  getPaidSessionEmail: vi.fn(),
}))

vi.mock("@/lib/db", () => {
  const insert = vi.fn((table: { _: string }) => ({
    values: vi.fn((values: Record<string, unknown>) => {
      if (String(table).includes("payment_tokens")) {
        store.tokens.set(values.stripeSessionId as string, {
          id: "tok-1",
          usedAt: null,
          ...values,
        })
      }
      return {
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([store.lastUser])),
        })),
        onConflictDoNothing: vi.fn(() => Promise.resolve()),
        returning: vi.fn(() => Promise.resolve([{ id: "reading-1" }])),
      }
    }),
  }))

  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
  }))

  return {
    db: {
      insert,
      update,
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ value: 0 }])),
        })),
      })),
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ insert, update }),
      ),
      query: {
        users: {
          findFirst: vi.fn(() => Promise.resolve(null)),
        },
        paymentTokens: {
          findFirst: vi.fn(({ where }: { where: unknown }) => {
            void where
            const tok = [...store.tokens.values()].find(
              (t) => t.usedAt === null,
            )
            return Promise.resolve(tok ? { id: tok.id } : null)
          }),
        },
      },
    },
  }
})

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/reading/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never
}

const validBody = {
  name: "Test",
  email: "test@example.com",
  birthDate: "1990-01-01",
  birthTime: "12:00",
  timezone: "UTC",
  locationName: "Lisbon",
  lat: 38.7,
  lon: -9.1,
  unknownTime: false,
}

describe("create route payment gate", () => {
  beforeEach(() => {
    store.tokens.clear()
  })

  it("rejects with 402 when no payment token is supplied", async () => {
    const { POST } = await import("@/app/api/reading/create/route")
    const res = await POST(makeRequest(validBody) as never)
    expect(res.status).toBe(402)
  })

  it("rejects with 402 when the token is unknown or already used", async () => {
    const { POST } = await import("@/app/api/reading/create/route")
    const res = await POST(
      makeRequest({ ...validBody, paymentToken: "cs_live_missing" }) as never,
    )
    expect(res.status).toBe(402)
  })

  it("creates the reading and burns a valid token", async () => {
    store.tokens.set("cs_live_ok", {
      id: "tok-1",
      stripeSessionId: "cs_live_ok",
      usedAt: null,
    })
    const { POST } = await import("@/app/api/reading/create/route")
    const res = await POST(
      makeRequest({ ...validBody, paymentToken: "cs_live_ok" }) as never,
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { readingId?: string }
    expect(body.readingId).toBe("reading-1")
  })
})

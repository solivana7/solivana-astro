import { Pool, neonConfig } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-serverless"
import ws from "ws"
import * as schema from "./schema"

// The Neon serverless driver talks to the pooler over websockets instead of
// holding raw TCP connections open — the right fit for short-lived lambdas.
neonConfig.webSocketConstructor = ws

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Small pool: each warm lambda gets its own, and Neon caps total connections.
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

export const db = drizzle(pool, { schema })

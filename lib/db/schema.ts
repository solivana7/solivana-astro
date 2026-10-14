import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

export const readings = pgTable(
  "readings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    status: text("status").notNull().default("pending"),
    birthDataJson: jsonb("birth_data_json").notNull(),
    chartDataJson: jsonb("chart_data_json"),
    focusAreasJson: jsonb("focus_areas_json")
      .notNull()
      .default([
        "life_purpose",
        "finances",
        "health",
        "relationships",
        "business",
        "timing",
      ]),
    progress: integer("progress").default(0),
    currentStep: text("current_step"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    reportDocxUrl: text("report_docx_url"),
    reportPdfUrl: text("report_pdf_url"),
    reportIcsUrl: text("report_ics_url"),
    reportMarkdown: text("report_markdown"),
    chartSvgsJson: jsonb("chart_svgs_json"),
    tokensUsed: integer("tokens_used").default(0),
    aiModel: text("ai_model").default("claude-sonnet-4-6"),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("readings_user_created_idx").on(table.userId, table.createdAt),
  ],
)

export const reportSections = pgTable(
  "report_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    readingId: uuid("reading_id")
      .references(() => readings.id)
      .notNull(),
    sectionType: text("section_type").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    tokensUsed: integer("tokens_used").default(0),
  },
  (table) => [index("report_sections_reading_idx").on(table.readingId)],
)

export const reportShares = pgTable(
  "report_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    readingId: uuid("reading_id")
      .references(() => readings.id)
      .notNull(),
    recipientEmail: text("recipient_email").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("report_shares_reading_sent_idx").on(table.readingId, table.sentAt),
    index("report_shares_recipient_sent_idx").on(
      table.recipientEmail,
      table.sentAt,
    ),
  ],
)

export const chartCache = pgTable("chart_cache", {
  chartHash: text("chart_hash").primaryKey(),
  chartDataJson: jsonb("chart_data_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
})

// One paid Stripe checkout session = one reading creation. The session id
// itself is the bearer token (unguessable); used_at flips on first use.
export const paymentTokens = pgTable("payment_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
})

ALTER TABLE "readings" ALTER COLUMN "ai_model" SET DEFAULT 'claude-sonnet-4-6';--> statement-breakpoint
ALTER TABLE "readings" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "readings_user_created_idx" ON "readings" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "report_sections_reading_idx" ON "report_sections" USING btree ("reading_id");--> statement-breakpoint
CREATE INDEX "report_shares_reading_sent_idx" ON "report_shares" USING btree ("reading_id","sent_at");--> statement-breakpoint
CREATE INDEX "report_shares_recipient_sent_idx" ON "report_shares" USING btree ("recipient_email","sent_at");
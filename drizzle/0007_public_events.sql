ALTER TABLE "events" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
CREATE INDEX "events_public_idx" ON "events" USING btree ("visibility","starts_at");
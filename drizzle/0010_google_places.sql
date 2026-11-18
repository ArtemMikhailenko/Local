CREATE TABLE "google_places" (
	"id" text PRIMARY KEY NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"place" jsonb NOT NULL,
	"has_details" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "google_places_geo_idx" ON "google_places" USING btree ("lat","lng");
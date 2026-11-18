CREATE TABLE "site_photos" (
	"place_id" text PRIMARY KEY NOT NULL,
	"url" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);

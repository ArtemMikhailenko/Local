CREATE TABLE "google_photos" (
	"key" text PRIMARY KEY NOT NULL,
	"uri" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);

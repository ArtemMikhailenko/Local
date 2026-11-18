CREATE TABLE "area_cache" (
	"cell" text PRIMARY KEY NOT NULL,
	"venues" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);

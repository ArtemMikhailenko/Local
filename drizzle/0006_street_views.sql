CREATE TABLE "api_usage" (
	"day" text NOT NULL,
	"api" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_usage_day_api_pk" PRIMARY KEY("day","api")
);
--> statement-breakpoint
CREATE TABLE "street_views" (
	"key" text PRIMARY KEY NOT NULL,
	"pano_id" text,
	"heading" integer,
	"status" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);

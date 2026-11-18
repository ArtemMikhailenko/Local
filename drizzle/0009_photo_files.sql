CREATE TABLE "photo_files" (
	"key" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

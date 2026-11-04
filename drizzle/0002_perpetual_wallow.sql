CREATE TABLE "generation_quota" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "generation_quota_key_unique" UNIQUE("key")
);

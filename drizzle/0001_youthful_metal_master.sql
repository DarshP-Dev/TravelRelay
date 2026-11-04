CREATE TABLE "trip_generation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"trip_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"proposal" jsonb,
	"confirmed" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_generation_trip_id_unique" UNIQUE("trip_id")
);
--> statement-breakpoint
ALTER TABLE "trip" ADD COLUMN "itinerary" jsonb;--> statement-breakpoint
ALTER TABLE "trip_generation" ADD CONSTRAINT "trip_generation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_generation" ADD CONSTRAINT "trip_generation_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_owner_idx" ON "trip_generation" USING btree ("user_id");
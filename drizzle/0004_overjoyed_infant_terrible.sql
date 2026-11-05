CREATE TABLE "itinerary_edit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"mutation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"operation" jsonb NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"assessment" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip" ADD COLUMN "itinerary_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "itinerary_edit" ADD CONSTRAINT "itinerary_edit_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_edit" ADD CONSTRAINT "itinerary_edit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "itinerary_edit_mutation_idx" ON "itinerary_edit" USING btree ("trip_id","mutation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "itinerary_edit_version_idx" ON "itinerary_edit" USING btree ("trip_id","version");--> statement-breakpoint
CREATE INDEX "itinerary_edit_owner_idx" ON "itinerary_edit" USING btree ("user_id","trip_id");
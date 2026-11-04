CREATE TABLE "trip_generation_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"trip_id" uuid NOT NULL,
	"phase" text NOT NULL,
	"attempt" integer NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"usage" jsonb,
	"validation" jsonb NOT NULL,
	"normalization" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_generation_attempt" ADD CONSTRAINT "trip_generation_attempt_generation_id_trip_generation_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."trip_generation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_generation_attempt" ADD CONSTRAINT "trip_generation_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_generation_attempt" ADD CONSTRAINT "trip_generation_attempt_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_phase_attempt_idx" ON "trip_generation_attempt" USING btree ("generation_id","phase","attempt");--> statement-breakpoint
CREATE INDEX "generation_attempt_owner_idx" ON "trip_generation_attempt" USING btree ("user_id","trip_id");
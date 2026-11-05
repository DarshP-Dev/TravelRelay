CREATE TABLE "agent_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turn_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"usage" jsonb,
	"latency_ms" integer,
	"validation" jsonb NOT NULL,
	"tool_proposals" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_conversation" (
	"trip_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"draft" text DEFAULT '' NOT NULL,
	"draft_version" integer DEFAULT 0 NOT NULL,
	"turn_count" integer DEFAULT 0 NOT NULL,
	"active_turn_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turn_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"base_version" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"summary" text NOT NULL,
	"actions" jsonb NOT NULL,
	"assigned_ids" jsonb NOT NULL,
	"request" jsonb NOT NULL,
	"preview" jsonb NOT NULL,
	"applied_edit_id" uuid,
	"applied_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_proposal_turn_id_unique" UNIQUE("turn_id")
);
--> statement-breakpoint
CREATE TABLE "agent_proposal_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"revision" integer NOT NULL,
	"event" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_turn" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"mutation_id" uuid NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"context_version" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"response" jsonb,
	"error" text,
	"error_stage" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "itinerary_edit" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "itinerary_edit" ADD COLUMN "proposal_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_attempt" ADD CONSTRAINT "agent_attempt_turn_id_agent_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."agent_turn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_attempt" ADD CONSTRAINT "agent_attempt_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_attempt" ADD CONSTRAINT "agent_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversation" ADD CONSTRAINT "agent_conversation_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversation" ADD CONSTRAINT "agent_conversation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_proposal" ADD CONSTRAINT "agent_proposal_turn_id_agent_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."agent_turn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_proposal" ADD CONSTRAINT "agent_proposal_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_proposal" ADD CONSTRAINT "agent_proposal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_proposal_event" ADD CONSTRAINT "agent_proposal_event_proposal_id_agent_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."agent_proposal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_proposal_event" ADD CONSTRAINT "agent_proposal_event_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_proposal_event" ADD CONSTRAINT "agent_proposal_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turn" ADD CONSTRAINT "agent_turn_trip_id_agent_conversation_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."agent_conversation"("trip_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turn" ADD CONSTRAINT "agent_turn_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_attempt_number_idx" ON "agent_attempt" USING btree ("turn_id","attempt");--> statement-breakpoint
CREATE INDEX "agent_attempt_owner_idx" ON "agent_attempt" USING btree ("user_id","trip_id");--> statement-breakpoint
CREATE INDEX "agent_conversation_owner_idx" ON "agent_conversation" USING btree ("user_id","trip_id");--> statement-breakpoint
CREATE INDEX "agent_proposal_owner_idx" ON "agent_proposal" USING btree ("user_id","trip_id");--> statement-breakpoint
CREATE INDEX "agent_proposal_event_owner_idx" ON "agent_proposal_event" USING btree ("user_id","trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_turn_mutation_idx" ON "agent_turn" USING btree ("trip_id","mutation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_turn_ordinal_idx" ON "agent_turn" USING btree ("trip_id","ordinal");--> statement-breakpoint
CREATE INDEX "agent_turn_owner_idx" ON "agent_turn" USING btree ("user_id","trip_id");
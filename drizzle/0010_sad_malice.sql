CREATE TABLE "recovery_attempt" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"preferences" text NOT NULL,
	"status" text NOT NULL,
	"itinerary_version" integer NOT NULL,
	"wallet_version" integer NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applied_option_id" uuid,
	"provider" text,
	"model" text,
	"usage" jsonb,
	"latency_ms" integer,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_attempt_status_check" CHECK ("recovery_attempt"."status" in ('queued','generating','ready','failed','interrupted','rejected','applied')),
	CONSTRAINT "recovery_attempt_mode_check" CHECK ("recovery_attempt"."mode" in ('ai','rest','refund_only'))
);
--> statement-breakpoint
CREATE TABLE "recovery_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"booking_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"provenance" text NOT NULL,
	"reason" text NOT NULL,
	"original" jsonb NOT NULL,
	"replacement_activity_id" uuid,
	"edit_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_case_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "recovery_case_replacement_activity_id_unique" UNIQUE("replacement_activity_id"),
	CONSTRAINT "recovery_case_provenance_check" CHECK ("recovery_case"."provenance" = 'sandbox-simulation')
);
--> statement-breakpoint
ALTER TABLE "recovery_attempt" ADD CONSTRAINT "recovery_attempt_case_id_recovery_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."recovery_case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_case" ADD CONSTRAINT "recovery_case_edit_id_itinerary_edit_id_fk" FOREIGN KEY ("edit_id") REFERENCES "public"."itinerary_edit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_booking_owner_identity_idx" ON "paypal_booking" USING btree ("id","trip_id","user_id","activity_id");--> statement-breakpoint
ALTER TABLE "recovery_case" ADD CONSTRAINT "recovery_case_booking_id_trip_id_user_id_activity_id_paypal_booking_id_trip_id_user_id_activity_id_fk" FOREIGN KEY ("booking_id","trip_id","user_id","activity_id") REFERENCES "public"."paypal_booking"("id","trip_id","user_id","activity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recovery_attempt_case_idx" ON "recovery_attempt" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_attempt_active_idx" ON "recovery_attempt" USING btree ("case_id") WHERE "recovery_attempt"."status" in ('queued','generating');--> statement-breakpoint
CREATE INDEX "recovery_case_owner_idx" ON "recovery_case" USING btree ("trip_id","user_id");--> statement-breakpoint
CREATE FUNCTION travelrelay_recovery_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Recovery cancellation evidence is immutable' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) - 'replacement_activity_id' - 'edit_id' - 'resolved_at' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'replacement_activity_id' - 'edit_id' - 'resolved_at' - 'updated_at')
     OR (OLD.edit_id IS NOT NULL AND (NEW.edit_id, NEW.replacement_activity_id) IS DISTINCT FROM (OLD.edit_id, OLD.replacement_activity_id))
     OR (OLD.resolved_at IS NOT NULL AND NEW.resolved_at IS DISTINCT FROM OLD.resolved_at) THEN
    RAISE EXCEPTION 'Recovery cancellation evidence is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER recovery_case_evidence_immutable BEFORE UPDATE OR DELETE ON recovery_case FOR EACH ROW EXECUTE FUNCTION travelrelay_recovery_evidence_immutable();

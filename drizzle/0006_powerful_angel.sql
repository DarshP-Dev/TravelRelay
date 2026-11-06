CREATE TABLE "financial_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"intent_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"verification" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"operation_key" text NOT NULL,
	"reconciliation_ref" text NOT NULL,
	"original_currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"fee_minor" bigint DEFAULT 0 NOT NULL,
	"order_id" text,
	"capture_id" text,
	"refund_id" text,
	"outcome" jsonb,
	"fx" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_event_amount_valid" CHECK ("financial_event"."amount_minor" >= 0 and "financial_event"."amount_minor" <= 1000000000000 and "financial_event"."fee_minor" >= 0 and "financial_event"."fee_minor" <= 1000000000000),
	CONSTRAINT "financial_event_proof_valid" CHECK (("financial_event"."kind" in ('intent_created','intent_canceled') and "financial_event"."provider" = 'planning' and "financial_event"."verification" = 'user-planning') or ("financial_event"."kind" not in ('intent_created','intent_canceled') and "financial_event"."provider" = 'paypal-sandbox' and "financial_event"."verification" in ('provider-api','verified-webhook') and "financial_event"."order_id" is not null)),
	CONSTRAINT "financial_event_kind_valid" CHECK ("financial_event"."kind" in ('intent_created','intent_canceled','checkout_pending','authorized','payment_pending','captured','payment_failed','payment_canceled','refund_pending','refund_completed','refund_failed','reversal_completed'))
);
--> statement-breakpoint
CREATE TABLE "fx_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"snapshot_id" uuid,
	"retry_after" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_snapshot" (
	"id" uuid PRIMARY KEY NOT NULL,
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"rate" text NOT NULL,
	"provider" text NOT NULL,
	"data" jsonb NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_wallet" (
	"trip_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"local_currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_version_valid" CHECK ("trip_wallet"."version" >= 0),
	CONSTRAINT "wallet_currency_valid" CHECK ("trip_wallet"."local_currency" in ('CAD','USD','EUR','GBP','JPY','AUD'))
);
--> statement-breakpoint
CREATE TABLE "wallet_intent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"activity_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"supplier" text NOT NULL,
	"original_currency" text NOT NULL,
	"original_minor" bigint NOT NULL,
	"display_currency" text NOT NULL,
	"estimated_display_minor" bigint NOT NULL,
	"fx_snapshot_id" uuid NOT NULL,
	"fx" jsonb NOT NULL,
	"accepted_stale_rate" boolean DEFAULT false NOT NULL,
	"itinerary_version" integer NOT NULL,
	"activity_snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_intent_amounts_valid" CHECK ("wallet_intent"."original_minor" >= 0 and "wallet_intent"."original_minor" <= 1000000000000 and "wallet_intent"."estimated_display_minor" >= 0 and "wallet_intent"."estimated_display_minor" <= 1000000000000),
	CONSTRAINT "wallet_intent_status_valid" CHECK ("wallet_intent"."status" in ('planned','canceled')),
	CONSTRAINT "wallet_intent_currency_valid" CHECK ("wallet_intent"."original_currency" in ('CAD','USD','EUR','GBP','JPY','AUD') and "wallet_intent"."display_currency" in ('CAD','USD','EUR','GBP','JPY','AUD'))
);
--> statement-breakpoint
CREATE TABLE "wallet_mutation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"request" jsonb NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "trip_id_owner_idx" ON "trip" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_owner_pair_idx" ON "trip_wallet" USING btree ("trip_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_intent_owner_idx" ON "wallet_intent" USING btree ("id","trip_id","user_id");--> statement-breakpoint
ALTER TABLE "financial_event" ADD CONSTRAINT "financial_event_intent_id_trip_id_user_id_wallet_intent_id_trip_id_user_id_fk" FOREIGN KEY ("intent_id","trip_id","user_id") REFERENCES "public"."wallet_intent"("id","trip_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_cache" ADD CONSTRAINT "fx_cache_snapshot_id_fx_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."fx_snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_wallet" ADD CONSTRAINT "trip_wallet_trip_id_user_id_trip_id_user_id_fk" FOREIGN KEY ("trip_id","user_id") REFERENCES "public"."trip"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_intent" ADD CONSTRAINT "wallet_intent_fx_snapshot_id_fx_snapshot_id_fk" FOREIGN KEY ("fx_snapshot_id") REFERENCES "public"."fx_snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_intent" ADD CONSTRAINT "wallet_intent_trip_id_user_id_trip_wallet_trip_id_user_id_fk" FOREIGN KEY ("trip_id","user_id") REFERENCES "public"."trip_wallet"("trip_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_mutation" ADD CONSTRAINT "wallet_mutation_trip_id_user_id_trip_wallet_trip_id_user_id_fk" FOREIGN KEY ("trip_id","user_id") REFERENCES "public"."trip_wallet"("trip_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_event_sequence_idx" ON "financial_event" USING btree ("trip_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_provider_event_idx" ON "financial_event" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_operation_idx" ON "financial_event" USING btree ("provider","operation_key");--> statement-breakpoint
CREATE INDEX "financial_owner_idx" ON "financial_event" USING btree ("user_id","trip_id","intent_id");--> statement-breakpoint
CREATE INDEX "fx_pair_date_idx" ON "fx_snapshot" USING btree ("base","quote","retrieved_at");--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_active_activity_idx" ON "wallet_intent" USING btree ("trip_id","activity_id") WHERE "wallet_intent"."status" = 'planned';--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_mutation_version_idx" ON "wallet_mutation" USING btree ("trip_id","version");--> statement-breakpoint

-- Immutable evidence: no caller, cascade or maintenance update can rewrite the
-- ledger, prior request receipts or rate snapshots. Corrections append events.
CREATE FUNCTION travelrelay_finance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Financial evidence is append-only' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER financial_event_immutable BEFORE UPDATE OR DELETE ON financial_event FOR EACH ROW EXECUTE FUNCTION travelrelay_finance_immutable();
--> statement-breakpoint
CREATE TRIGGER fx_snapshot_immutable BEFORE UPDATE OR DELETE ON fx_snapshot FOR EACH ROW EXECUTE FUNCTION travelrelay_finance_immutable();
--> statement-breakpoint
CREATE TRIGGER wallet_mutation_immutable BEFORE UPDATE OR DELETE ON wallet_mutation FOR EACH ROW EXECUTE FUNCTION travelrelay_finance_immutable();
--> statement-breakpoint
CREATE FUNCTION travelrelay_intent_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at')
     OR (NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'planned' AND NEW.status = 'canceled')) THEN
    RAISE EXCEPTION 'Original financial intent is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER wallet_intent_immutable BEFORE UPDATE ON wallet_intent FOR EACH ROW EXECUTE FUNCTION travelrelay_intent_immutable();

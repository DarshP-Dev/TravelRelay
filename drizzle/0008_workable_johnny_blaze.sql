CREATE TABLE "paypal_booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"activity_id" uuid NOT NULL,
	"merchant_id" text NOT NULL,
	"order_id" text,
	"capture_id" text,
	"last_reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paypal_booking_intent_id_unique" UNIQUE("intent_id"),
	CONSTRAINT "paypal_booking_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "paypal_booking_capture_id_unique" UNIQUE("capture_id")
);
--> statement-breakpoint
CREATE TABLE "paypal_operation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"requested_minor" bigint NOT NULL,
	"provider_id" text,
	"provider_status" text,
	"issue" text,
	"settlement" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paypal_operation_valid" CHECK ("paypal_operation"."kind" in ('order', 'capture', 'refund') and "paypal_operation"."status" in ('sending', 'uncertain', 'pending', 'verified', 'failed') and "paypal_operation"."requested_minor" between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "paypal_webhook_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paypal_booking" ADD CONSTRAINT "paypal_booking_intent_id_trip_id_user_id_wallet_intent_id_trip_id_user_id_fk" FOREIGN KEY ("intent_id","trip_id","user_id") REFERENCES "public"."wallet_intent"("id","trip_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paypal_operation" ADD CONSTRAINT "paypal_operation_booking_id_paypal_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."paypal_booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paypal_booking_owner_idx" ON "paypal_booking" USING btree ("trip_id","user_id");--> statement-breakpoint
CREATE INDEX "paypal_operation_booking_idx" ON "paypal_operation" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_operation_single_idx" ON "paypal_operation" USING btree ("booking_id","kind") WHERE "paypal_operation"."kind" <> 'refund';--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_operation_provider_idx" ON "paypal_operation" USING btree ("kind","provider_id");
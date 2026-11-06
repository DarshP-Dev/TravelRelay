-- Versioned metadata backfill only: native amounts/status/proof never change.
ALTER TABLE "financial_event" ADD COLUMN "display_currency" text;--> statement-breakpoint
ALTER TABLE "financial_event" ADD COLUMN "estimated_display_minor" bigint;--> statement-breakpoint
ALTER TABLE "financial_event" ADD COLUMN "estimated_fee_minor" bigint;--> statement-breakpoint
DROP TRIGGER financial_event_immutable ON financial_event;--> statement-breakpoint
UPDATE financial_event SET
  display_currency = fx->>'quote',
  estimated_display_minor = ROUND(amount_minor::numeric * (fx->>'rate')::numeric * CASE WHEN fx->>'quote' = 'JPY' THEN 1 ELSE 100 END / CASE WHEN fx->>'base' = 'JPY' THEN 1 ELSE 100 END)::bigint,
  estimated_fee_minor = ROUND(fee_minor::numeric * (fx->>'rate')::numeric * CASE WHEN fx->>'quote' = 'JPY' THEN 1 ELSE 100 END / CASE WHEN fx->>'base' = 'JPY' THEN 1 ELSE 100 END)::bigint;
--> statement-breakpoint
CREATE TRIGGER financial_event_immutable BEFORE UPDATE OR DELETE ON financial_event FOR EACH ROW EXECUTE FUNCTION travelrelay_finance_immutable();--> statement-breakpoint
ALTER TABLE "financial_event" ALTER COLUMN "display_currency" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_event" ALTER COLUMN "estimated_display_minor" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "financial_event" ALTER COLUMN "estimated_fee_minor" SET NOT NULL;

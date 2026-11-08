import { z } from "zod";
import { currencySchema, minorSchema } from "./money";
export const financialCategories = [
  "flights",
  "accommodation",
  "food",
  "localTransport",
  "activities",
] as const;
export const financialCategorySchema = z.enum(financialCategories);
export const providerEventKinds = [
  "checkout_pending",
  "authorized",
  "payment_pending",
  "captured",
  "payment_failed",
  "payment_canceled",
  "refund_pending",
  "refund_completed",
  "refund_failed",
  "reversal_completed",
] as const;
export const eventKinds = [
  "intent_created",
  "intent_canceled",
  "intent_fx_refreshed",
  ...providerEventKinds,
] as const;
export type FinancialEventKind = (typeof eventKinds)[number];
export const fxSnapshotSchema = z
  .object({
    id: z.uuid(),
    base: currencySchema,
    quote: currencySchema,
    rate: z.string().max(64),
    provider: z.enum(["frankfurter-ecb", "identity"]),
    sourceDate: z.iso.date(),
    retrievedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    sourceUrl: z.url(),
    rounding: z.literal("half-up-per-line"),
  })
  .strict();
export type FxSnapshot = z.infer<typeof fxSnapshotSchema>;
export type FxQuote = {
  snapshot: FxSnapshot;
  stale: boolean;
  warning: string | null;
};
const quoteInput = {
  activityId: z.uuid(),
  recoveryCaseId: z.uuid().optional(),
  refreshIntentId: z.uuid().optional(),
  amount: z.string().max(30),
  currency: currencySchema,
  supplier: z.string().trim().max(160),
  itineraryVersion: z.number().int().min(0),
  walletVersion: z.number().int().min(0),
};
export const walletRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview_quote"), ...quoteInput }).strict(),
  z
    .object({
      action: z.literal("save_quote"),
      ...quoteInput,
      mutationId: z.uuid(),
      fxSnapshotId: z.uuid(),
      acknowledgeStaleRate: z.boolean().optional(),
      acknowledgeOverBudget: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("cancel_intent"),
      intentId: z.uuid(),
      walletVersion: z.number().int().min(0),
      mutationId: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("settings"),
      localCurrency: currencySchema,
      walletVersion: z.number().int().min(0),
      mutationId: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("convert"),
      amount: z.string().max(30),
      base: currencySchema,
      quote: currencySchema,
    })
    .strict(),
]);
export type WalletRequest = z.infer<typeof walletRequestSchema>;

// Domain outcomes, NOT SDK/wire models. A future server verifier must establish
// the merchant, order, capture/refund status and amounts before returning one.
export const providerOutcomeSchema = z
  .object({
    provider: z.literal("paypal-sandbox"),
    verification: z.enum(["provider-api", "verified-webhook"]),
    eventId: z.string().min(1).max(160),
    reconciliationRef: z.string().min(1).max(160),
    kind: z.enum(providerEventKinds),
    currency: currencySchema,
    amountMinor: minorSchema,
    feeMinor: minorSchema.default(0),
    feeCurrency: currencySchema.nullable().default(null),
    feeTreatment: z
      .enum([
        "additional-traveler-cost",
        "included-in-capture",
        "merchant-fee",
        "unknown",
      ])
      .default("unknown"),
    orderId: z.string().min(1).max(160),
    captureId: z.string().min(1).max(160).nullable(),
    refundId: z.string().min(1).max(160).nullable(),
    reversalId: z.string().min(1).max(160).nullable().default(null),
    occurredAt: z.iso.datetime(),
    chargedCurrency: currencySchema.nullable().default(null),
    chargedMinor: minorSchema.nullable().default(null),
  })
  .strict();
export type ProviderOutcome = z.infer<typeof providerOutcomeSchema>;
export type LedgerEvent = {
  id: string;
  kind: FinancialEventKind;
  amountMinor: number;
  feeMinor: number;
  currency: z.infer<typeof currencySchema>;
  orderId: string | null;
  captureId: string | null;
  refundId: string | null;
  occurredAt: string;
  feeTreatment?: ProviderOutcome["feeTreatment"];
};

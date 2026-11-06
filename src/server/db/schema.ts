import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  uuid,
  jsonb,
  uniqueIndex,
  index,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { TripIntent } from "../../lib/trip-intent";
import type { CityProposal, Itinerary } from "../../lib/itinerary";
import type { ModelUsage } from "../ai/contracts";
import type { ValidationChecks } from "../ai/audit";
import type { ItineraryNormalization } from "../../lib/itinerary-normalization";
import type {
  EditRequest,
  ScheduleAssessment,
} from "../../lib/itinerary-editing";
import type {
  AgentAction,
  AgentResponse,
  AgentPreview,
} from "../../lib/agent-contracts";
import type {
  FxSnapshot,
  FinancialEventKind,
  ProviderOutcome,
} from "../../lib/finance-contracts";
import type { Currency } from "../../lib/money";
import type { BudgetCategory } from "../../lib/itinerary-budget";

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  ...timestamps(),
});
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (table) => [index("session_user_idx").on(table.userId)],
);
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps(),
  },
  (table) => [
    index("account_user_idx").on(table.userId),
    uniqueIndex("account_provider_idx").on(table.providerId, table.accountId),
  ],
);
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps(),
});
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
// Isolated from Better Auth: its rate-limit cleanup prunes old rows globally.
export const generationQuota = pgTable("generation_quota", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const draft = pgTable(
  "trip_draft",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slot: text("slot").notNull(),
    data: jsonb("data").$type<TripIntent>().notNull(),
    version: integer("version").default(1).notNull(),
    archived: boolean("archived").notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("active_draft_slot_idx")
      .on(table.userId, table.slot)
      .where(sql`${table.archived} = false`),
  ],
);
export const trip = pgTable(
  "trip",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => draft.id)
      .unique(),
    data: jsonb("data").$type<TripIntent>().notNull(),
    itinerary: jsonb("itinerary").$type<Itinerary>(),
    itineraryVersion: integer("itinerary_version").default(0).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("trip_owner_idx").on(table.userId),
    uniqueIndex("trip_id_owner_idx").on(table.id, table.userId),
  ],
);

export const fxSnapshot = pgTable(
  "fx_snapshot",
  {
    id: uuid("id").primaryKey(),
    base: text("base").$type<Currency>().notNull(),
    quote: text("quote").$type<Currency>().notNull(),
    rate: text("rate").notNull(),
    provider: text("provider").notNull(),
    data: jsonb("data").$type<FxSnapshot>().notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("fx_pair_date_idx").on(t.base, t.quote, t.retrievedAt)],
);
export const fxCache = pgTable("fx_cache", {
  key: text("key").primaryKey(),
  snapshotId: uuid("snapshot_id").references(() => fxSnapshot.id),
  retryAfter: timestamp("retry_after", { withTimezone: true })
    .notNull()
    .defaultNow(),
  leaseUntil: timestamp("lease_until", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const tripWallet = pgTable(
  "trip_wallet",
  {
    tripId: uuid("trip_id").primaryKey(),
    userId: text("user_id").notNull(),
    version: integer("version").notNull().default(0),
    localCurrency: text("local_currency").$type<Currency>().notNull(),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      columns: [t.tripId, t.userId],
      foreignColumns: [trip.id, trip.userId],
    }),
    uniqueIndex("wallet_owner_pair_idx").on(t.tripId, t.userId),
    check("wallet_version_valid", sql`${t.version} >= 0`),
    check(
      "wallet_currency_valid",
      sql`${t.localCurrency} in ('CAD','USD','EUR','GBP','JPY','AUD')`,
    ),
  ],
);
export const walletIntent = pgTable(
  "wallet_intent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id").notNull(),
    userId: text("user_id").notNull(),
    activityId: uuid("activity_id").notNull(),
    category: text("category").$type<BudgetCategory>().notNull(),
    title: text("title").notNull(),
    supplier: text("supplier").notNull(),
    originalCurrency: text("original_currency").$type<Currency>().notNull(),
    originalMinor: bigint("original_minor", { mode: "number" }).notNull(),
    displayCurrency: text("display_currency").$type<Currency>().notNull(),
    estimatedDisplayMinor: bigint("estimated_display_minor", {
      mode: "number",
    }).notNull(),
    fxSnapshotId: uuid("fx_snapshot_id")
      .notNull()
      .references(() => fxSnapshot.id),
    fx: jsonb("fx").$type<FxSnapshot>().notNull(),
    acceptedStaleRate: boolean("accepted_stale_rate").notNull().default(false),
    itineraryVersion: integer("itinerary_version").notNull(),
    activitySnapshot: jsonb("activity_snapshot")
      .$type<{
        title: string;
        location: string;
        date: string;
        startMinute: number;
        durationMinutes: number;
      }>()
      .notNull(),
    status: text("status")
      .$type<"planned" | "canceled">()
      .notNull()
      .default("planned"),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      columns: [t.tripId, t.userId],
      foreignColumns: [tripWallet.tripId, tripWallet.userId],
    }),
    uniqueIndex("wallet_intent_owner_idx").on(t.id, t.tripId, t.userId),
    uniqueIndex("wallet_active_activity_idx")
      .on(t.tripId, t.activityId)
      .where(sql`${t.status} = 'planned'`),
    check(
      "wallet_intent_amounts_valid",
      sql`${t.originalMinor} >= 0 and ${t.originalMinor} <= 1000000000000 and ${t.estimatedDisplayMinor} >= 0 and ${t.estimatedDisplayMinor} <= 1000000000000`,
    ),
    check(
      "wallet_intent_status_valid",
      sql`${t.status} in ('planned','canceled')`,
    ),
    check(
      "wallet_intent_currency_valid",
      sql`${t.originalCurrency} in ('CAD','USD','EUR','GBP','JPY','AUD') and ${t.displayCurrency} in ('CAD','USD','EUR','GBP','JPY','AUD')`,
    ),
  ],
);
export const paypalBooking = pgTable(
  "paypal_booking",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    intentId: uuid("intent_id").notNull().unique(),
    tripId: uuid("trip_id").notNull(),
    userId: text("user_id").notNull(),
    activityId: uuid("activity_id").notNull(),
    merchantId: text("merchant_id").notNull(),
    orderId: text("order_id").unique(),
    captureId: text("capture_id").unique(),
    lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      columns: [t.intentId, t.tripId, t.userId],
      foreignColumns: [
        walletIntent.id,
        walletIntent.tripId,
        walletIntent.userId,
      ],
    }),
    index("paypal_booking_owner_idx").on(t.tripId, t.userId),
  ],
);
export const paypalOperation = pgTable(
  "paypal_operation",
  {
    id: uuid("id").primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => paypalBooking.id),
    kind: text("kind").$type<"order" | "capture" | "refund">().notNull(),
    status: text("status")
      .$type<"sending" | "uncertain" | "pending" | "verified" | "failed">()
      .notNull(),
    requestedMinor: bigint("requested_minor", { mode: "number" }).notNull(),
    providerId: text("provider_id"),
    providerStatus: text("provider_status"),
    issue: text("issue"),
    settlement: jsonb("settlement").$type<Record<string, string>>(),
    ...timestamps(),
  },
  (t) => [
    index("paypal_operation_booking_idx").on(t.bookingId),
    uniqueIndex("paypal_operation_single_idx")
      .on(t.bookingId, t.kind)
      .where(sql`${t.kind} <> 'refund'`),
    uniqueIndex("paypal_operation_provider_idx").on(t.kind, t.providerId),
    check(
      "paypal_operation_valid",
      sql`${t.kind} in ('order', 'capture', 'refund') and ${t.status} in ('sending', 'uncertain', 'pending', 'verified', 'failed') and ${t.requestedMinor} between 1 and 500`,
    ),
  ],
);
export const paypalWebhookReceipt = pgTable("paypal_webhook_receipt", {
  id: text("id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const walletMutation = pgTable(
  "wallet_mutation",
  {
    id: uuid("id").primaryKey(),
    tripId: uuid("trip_id").notNull(),
    userId: text("user_id").notNull(),
    request: jsonb("request").$type<Record<string, unknown>>().notNull(),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tripId, t.userId],
      foreignColumns: [tripWallet.tripId, tripWallet.userId],
    }),
    uniqueIndex("wallet_mutation_version_idx").on(t.tripId, t.version),
  ],
);
export const financialEvent = pgTable(
  "financial_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id").notNull(),
    userId: text("user_id").notNull(),
    intentId: uuid("intent_id").notNull(),
    sequence: integer("sequence").notNull(),
    kind: text("kind").$type<FinancialEventKind>().notNull(),
    provider: text("provider").notNull(),
    verification: text("verification").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    operationKey: text("operation_key").notNull(),
    reconciliationRef: text("reconciliation_ref").notNull(),
    originalCurrency: text("original_currency").$type<Currency>().notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    feeMinor: bigint("fee_minor", { mode: "number" }).notNull().default(0),
    displayCurrency: text("display_currency").$type<Currency>().notNull(),
    estimatedDisplayMinor: bigint("estimated_display_minor", {
      mode: "number",
    }).notNull(),
    estimatedFeeMinor: bigint("estimated_fee_minor", {
      mode: "number",
    }).notNull(),
    orderId: text("order_id"),
    captureId: text("capture_id"),
    refundId: text("refund_id"),
    outcome: jsonb("outcome").$type<ProviderOutcome>(),
    fx: jsonb("fx").$type<FxSnapshot>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.intentId, t.tripId, t.userId],
      foreignColumns: [
        walletIntent.id,
        walletIntent.tripId,
        walletIntent.userId,
      ],
    }),
    uniqueIndex("financial_event_sequence_idx").on(t.tripId, t.sequence),
    uniqueIndex("financial_provider_event_idx").on(
      t.provider,
      t.providerEventId,
    ),
    uniqueIndex("financial_operation_idx").on(t.provider, t.operationKey),
    index("financial_owner_idx").on(t.userId, t.tripId, t.intentId),
    check(
      "financial_event_amount_valid",
      sql`${t.amountMinor} >= 0 and ${t.amountMinor} <= 1000000000000 and ${t.feeMinor} >= 0 and ${t.feeMinor} <= 1000000000000`,
    ),
    check(
      "financial_event_proof_valid",
      sql`(${t.kind} in ('intent_created','intent_canceled') and ${t.provider} = 'planning' and ${t.verification} = 'user-planning') or (${t.kind} not in ('intent_created','intent_canceled') and ${t.provider} = 'paypal-sandbox' and ${t.verification} in ('provider-api','verified-webhook') and ${t.orderId} is not null)`,
    ),
    check(
      "financial_event_kind_valid",
      sql`${t.kind} in ('intent_created','intent_canceled','checkout_pending','authorized','payment_pending','captured','payment_failed','payment_canceled','refund_pending','refund_completed','refund_failed','reversal_completed')`,
    ),
  ],
);
export const generation = pgTable(
  "trip_generation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .unique()
      .references(() => trip.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    proposal: jsonb("proposal").$type<CityProposal>(),
    confirmed: boolean("confirmed").notNull().default(false),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    ...timestamps(),
  },
  (table) => [index("generation_owner_idx").on(table.userId)],
);

export const itineraryEdit = pgTable(
  "itinerary_edit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trip.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mutationId: uuid("mutation_id").notNull(),
    version: integer("version").notNull(),
    operation: jsonb("operation").$type<EditRequest["operation"]>().notNull(),
    before: jsonb("before").$type<Itinerary>().notNull(),
    after: jsonb("after").$type<Itinerary>().notNull(),
    assessment: jsonb("assessment").$type<ScheduleAssessment>().notNull(),
    source: text("source").notNull().default("manual"),
    proposalId: uuid("proposal_id"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("itinerary_edit_mutation_idx").on(t.tripId, t.mutationId),
    uniqueIndex("itinerary_edit_version_idx").on(t.tripId, t.version),
    index("itinerary_edit_owner_idx").on(t.userId, t.tripId),
  ],
);

export const generationAttempt = pgTable(
  "trip_generation_attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generationId: uuid("generation_id")
      .notNull()
      .references(() => generation.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trip.id, { onDelete: "cascade" }),
    phase: text("phase").notNull(),
    attempt: integer("attempt").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    status: text("status").notNull().default("started"),
    usage: jsonb("usage").$type<ModelUsage>(),
    validation: jsonb("validation").$type<ValidationChecks>().notNull(),
    normalization: jsonb("normalization").$type<ItineraryNormalization>(),
    error: text("error"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("generation_phase_attempt_idx").on(
      table.generationId,
      table.phase,
      table.attempt,
    ),
    index("generation_attempt_owner_idx").on(table.userId, table.tripId),
  ],
);

export const agentConversation = pgTable(
  "agent_conversation",
  {
    tripId: uuid("trip_id")
      .primaryKey()
      .references(() => trip.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    draft: text("draft").notNull().default(""),
    draftVersion: integer("draft_version").notNull().default(0),
    turnCount: integer("turn_count").notNull().default(0),
    activeTurnId: uuid("active_turn_id"),
    ...timestamps(),
  },
  (t) => [index("agent_conversation_owner_idx").on(t.userId, t.tripId)],
);
export const agentTurn = pgTable(
  "agent_turn",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => agentConversation.tripId, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    mutationId: uuid("mutation_id").notNull(),
    text: text("text").notNull(),
    status: text("status").notNull().default("queued"),
    contextVersion: integer("context_version"),
    attempts: integer("attempts").notNull().default(0),
    leaseToken: uuid("lease_token"),
    response: jsonb("response").$type<AgentResponse>(),
    error: text("error"),
    errorStage: text("error_stage"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("agent_turn_mutation_idx").on(t.tripId, t.mutationId),
    uniqueIndex("agent_turn_ordinal_idx").on(t.tripId, t.ordinal),
    index("agent_turn_owner_idx").on(t.userId, t.tripId),
  ],
);
export const agentProposal = pgTable(
  "agent_proposal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turnId: uuid("turn_id")
      .notNull()
      .unique()
      .references(() => agentTurn.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trip.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    baseVersion: integer("base_version").notNull(),
    status: text("status").notNull().default("pending"),
    summary: text("summary").notNull(),
    actions: jsonb("actions").$type<AgentAction[]>().notNull(),
    assignedIds: jsonb("assigned_ids").$type<string[]>().notNull(),
    request: jsonb("request").$type<EditRequest>().notNull(),
    preview: jsonb("preview").$type<AgentPreview>().notNull(),
    appliedEditId: uuid("applied_edit_id"),
    appliedVersion: integer("applied_version"),
    ...timestamps(),
  },
  (t) => [index("agent_proposal_owner_idx").on(t.userId, t.tripId)],
);
export const agentAttempt = pgTable(
  "agent_attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turnId: uuid("turn_id")
      .notNull()
      .references(() => agentTurn.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trip.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    status: text("status").notNull().default("started"),
    usage: jsonb("usage").$type<ModelUsage>(),
    latencyMs: integer("latency_ms"),
    validation: jsonb("validation")
      .$type<{
        stage: string;
        errors: string[];
        contextBytes?: number;
        contextVersion?: number;
        contextTurns?: number;
      }>()
      .notNull(),
    toolProposals: jsonb("tool_proposals").$type<AgentAction[]>(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("agent_attempt_number_idx").on(t.turnId, t.attempt),
    index("agent_attempt_owner_idx").on(t.userId, t.tripId),
  ],
);
export const agentProposalEvent = pgTable(
  "agent_proposal_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => agentProposal.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trip.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    event: text("event").notNull(),
    data: jsonb("data")
      .$type<{ baseVersion: number; preview?: AgentPreview; editId?: string }>()
      .notNull(),
    ...timestamps(),
  },
  (t) => [index("agent_proposal_event_owner_idx").on(t.userId, t.tripId)],
);

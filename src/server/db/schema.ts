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
  (table) => [index("trip_owner_idx").on(table.userId)],
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

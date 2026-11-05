import { z } from "zod";
import { activityCategories } from "./activity-metadata";
import type { PlanningBudget } from "./itinerary-budget";
import type { ScheduleAssessment, scheduleChanges } from "./itinerary-editing";

// A single bounded proposal envelope, never arbitrary tool names/code/SQL.
// Null means unchanged/unused. IDs, dates, currency and provenance are checked
// against the saved trip by the server, not trusted from the provider.
export const agentActionSchema = z
  .object({
    type: z.enum([
      "add_activity",
      "remove_activity",
      "update_activity",
      "move_activity",
      "resize_activity",
      "replace_activity",
    ]),
    activityId: z.uuid().nullable(),
    dayId: z.uuid().nullable(),
    title: z.string().trim().min(1).max(160).nullable(),
    description: z.string().trim().min(1).max(1200).nullable(),
    category: z.enum(activityCategories).nullable(),
    location: z.string().trim().min(1).max(200).nullable(),
    city: z.string().trim().min(1).max(120).nullable(),
    startMinute: z.number().int().min(0).max(1439).nullable(),
    durationMinutes: z.number().int().min(15).max(480).nullable(),
    bufferBeforeMinutes: z.number().int().min(15).max(240).nullable(),
    costMinor: z.number().int().min(0).max(1_000_000_000_000).nullable(),
    currency: z.enum(["CAD", "USD", "EUR", "GBP", "JPY", "AUD"]).nullable(),
  })
  .strict();
export const agentResponseSchema = z
  .object({
    answer: z.string().trim().min(1).max(6000),
    activityIds: z.array(z.uuid()).max(30),
    uncertainties: z.array(z.string().trim().min(1).max(300)).max(6),
    proposal: z
      .object({
        summary: z.string().trim().min(1).max(600),
        actions: z.array(agentActionSchema).min(1).max(12),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type AgentAction = z.infer<typeof agentActionSchema>;
export type AgentResponse = z.infer<typeof agentResponseSchema>;
export type AgentPreview = {
  version: number;
  canSave: boolean;
  assessment: ScheduleAssessment;
  changes: ReturnType<typeof scheduleChanges>;
  budgetDeltaMinor: number;
  overBudget: boolean;
  beforeBudget: PlanningBudget;
  afterBudget: PlanningBudget;
};
const proposalIdentity = {
  proposalId: z.uuid(),
  revision: z.number().int().min(1),
};
export const agentRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("send"),
      mutationId: z.uuid(),
      text: z.string().trim().min(1).max(2000),
      draftVersion: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      action: z.literal("draft"),
      text: z.string().max(2000),
      version: z.number().int().min(0),
    })
    .strict(),
  z.object({ action: z.literal("retry"), turnId: z.uuid() }).strict(),
  z
    .object({
      action: z.literal("approve"),
      ...proposalIdentity,
      acknowledgeOverBudget: z.boolean().optional(),
    })
    .strict(),
  z.object({ action: z.literal("reject"), ...proposalIdentity }).strict(),
  z
    .object({ action: z.literal("refresh_preview"), ...proposalIdentity })
    .strict(),
  z
    .object({ action: z.literal("request_changes"), ...proposalIdentity })
    .strict(),
]);
export const agentIsActive = (status: string) =>
  ["queued", "generating", "validating"].includes(status);
export const agentStageLabel = (status: string) =>
  ({
    queued: "Request saved · waiting to start",
    generating: "Reading your saved trip with AI",
    validating: "Checking the response and proposed changes",
    ready: "Response saved",
    failed: "Response failed",
    interrupted: "Response interrupted",
  })[status] ?? "Check saved status";

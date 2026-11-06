import { z } from "zod";
import { agentActionSchema } from "./agent-contracts";
import type { AgentPreview } from "./agent-contracts";
import type { EditRequest } from "./itinerary-editing";
import type { SavedActivity } from "./itinerary";
import type { FxSnapshot } from "./finance-contracts";

export const recoveryResponseSchema = z.strictObject({
  alternatives: z
    .array(
      z.strictObject({
        kind: z.enum(["reschedule", "similar", "different", "free"]),
        rationale: z.string().trim().min(1).max(400),
        action: agentActionSchema,
      }),
    )
    .max(4),
});
export type RecoveryKind =
  | z.infer<typeof recoveryResponseSchema>["alternatives"][number]["kind"]
  | "rest"
  | "refund_only";
export type CancellationSnapshot = {
  date: string;
  dayId: string;
  activity: SavedActivity;
  bookingTitle: string;
  quoteMinor: number;
  capturedMinor: number;
  refundedMinor: number;
  currency: "USD";
  fx: FxSnapshot;
};
export type RecoveryOption = {
  id: string;
  kind: RecoveryKind;
  rationale: string;
  request: EditRequest;
  preview: AgentPreview;
  replacementActivityId: string | null;
  replacementEstimateMinor: number | null;
  projectionBeforeMinor: number;
  projectionAfterMinor: number;
  projectionHeadroomMinor: number;
};

const caseId = z.uuid();
export const recoveryRequest = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("simulate"),
    bookingId: z.uuid(),
    reason: z.string().trim().min(3).max(240),
  }),
  z.strictObject({
    action: z.literal("suggest"),
    caseId,
    mutationId: z.uuid(),
    preferences: z.string().trim().max(600),
  }),
  z.strictObject({
    action: z.literal("baseline"),
    caseId,
    mutationId: z.uuid(),
    kind: z.enum(["rest", "refund_only"]),
  }),
  z.strictObject({ action: z.literal("reject"), caseId, attemptId: z.uuid() }),
  z.strictObject({
    action: z.literal("apply"),
    caseId,
    attemptId: z.uuid(),
    optionId: z.uuid(),
    acknowledgeUnverified: z.literal(true),
    acknowledgeOverBudget: z.boolean().optional(),
  }),
  z.strictObject({ action: z.literal("finish"), caseId }),
]);

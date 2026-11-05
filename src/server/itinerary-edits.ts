import { and, desc, eq } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import type { Database } from "./db/connection";
import { itineraryEdit, trip } from "./db/schema";
import { createTripStore, RequestError } from "./trips";
import {
  editRequestSchema,
  applyActivityOperation,
  assessManualSchedule,
  materializeActivities,
  recomputeEditedBudget,
  scheduleChanges,
} from "../lib/itinerary-editing";
import { venueReferences } from "./venue-references";
import type { Itinerary } from "../lib/itinerary";
import { randomUUID } from "node:crypto";

type EditOrigin = { source?: "ai-proposal"; proposalId?: string };
type EditTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type CommitOptions = EditOrigin & {
  onRecorded?: (tx: EditTransaction, editId: string) => Promise<void>;
};

export function createItineraryEditor(db: Database) {
  const trips = createTripStore(db);
  async function read(userId: string, id: string) {
    const saved = await trips.read(userId, id);
    if (!saved.itinerary)
      throw new RequestError(
        409,
        "Generate and save a complete itinerary before editing activities.",
      );
    const history = await db
      .select({
        id: itineraryEdit.id,
        version: itineraryEdit.version,
        operation: itineraryEdit.operation,
        source: itineraryEdit.source,
        proposalId: itineraryEdit.proposalId,
        createdAt: itineraryEdit.createdAt,
      })
      .from(itineraryEdit)
      .where(
        and(eq(itineraryEdit.userId, userId), eq(itineraryEdit.tripId, id)),
      )
      .orderBy(desc(itineraryEdit.version))
      .limit(20);
    return {
      itinerary: saved.itinerary,
      intent: saved.data,
      version: saved.itineraryVersion,
      history,
      assessment: assessManualSchedule(
        materializeActivities(saved.itinerary),
        saved.data,
        venueReferences,
      ),
    };
  }
  async function preview(
    userId: string,
    id: string,
    input: unknown,
    origin: EditOrigin = {},
  ) {
    const state = await read(userId, id),
      request = editRequestSchema.parse(input);
    if (state.version !== request.version)
      throw new RequestError(
        409,
        "This itinerary changed in another tab. Reload the saved version before applying your edit.",
      );
    let candidate: Itinerary;
    if (request.operation.action === "restore") {
      if (state.history[0]?.id !== request.operation.editId)
        throw new RequestError(
          409,
          "Only the latest saved edit can be undone. Reload the history.",
        );
      const [entry] = await db
        .select()
        .from(itineraryEdit)
        .where(
          and(
            eq(itineraryEdit.id, request.operation.editId),
            eq(itineraryEdit.tripId, id),
            eq(itineraryEdit.userId, userId),
          ),
        );
      if (!entry) throw new RequestError(404, "Edit not found.");
      candidate = materializeActivities(entry.before);
    } else {
      try {
        candidate = applyActivityOperation(
          state.itinerary,
          state.intent,
          request.operation,
        );
      } catch (error) {
        throw new RequestError(
          422,
          error instanceof Error ? error.message : "Review this edit.",
        );
      }
    }
    if (request.operation.action !== "restore") {
      const operations =
        request.operation.action === "batch"
          ? request.operation.operations
          : [request.operation];
      for (const op of operations) {
        if (op.action !== "add" && op.action !== "update") continue;
        const a = candidate.days
          .flatMap((d) => d.activities)
          .find((a) => a.id === op.activityId);
        if (!a) continue;
        const before = state.itinerary.days
          .flatMap((d) => d.activities)
          .find((item) => item.id === op.activityId);
        a.lastEditSource = origin.source ?? "manual";
        if (origin.source) {
          if (op.action === "add") a.origin = "ai";
          if (!before || before.costMinor !== a.costMinor)
            a.estimateSource = "ai-estimate";
        }
      }
    }
    // Undo restores the previous allowance/estimates too; ordinary edits retain
    // the current additional allowance, never a second copy of itemized food.
    recomputeEditedBudget(
      candidate,
      request.operation.action === "restore" ? candidate : state.itinerary,
      state.intent,
    );
    const assessment = assessManualSchedule(
      candidate,
      state.intent,
      venueReferences,
    );
    const changes = scheduleChanges(
      materializeActivities(state.itinerary),
      candidate,
    );
    return {
      version: state.version,
      candidate,
      assessment,
      changes,
      budgetDeltaMinor: candidate.totalMinor - state.itinerary.totalMinor,
      overBudget: (candidate.budget?.remainingMinor ?? 0) < 0,
      canSave: assessment.errors.length === 0,
      request,
    };
  }
  async function commit(
    userId: string,
    id: string,
    input: unknown,
    options: CommitOptions = {},
  ) {
    await trips.read(userId, id);
    const request = editRequestSchema.parse(input);
    const [previous] = await db
      .select({
        version: itineraryEdit.version,
        operation: itineraryEdit.operation,
        source: itineraryEdit.source,
        proposalId: itineraryEdit.proposalId,
      })
      .from(itineraryEdit)
      .where(
        and(
          eq(itineraryEdit.tripId, id),
          eq(itineraryEdit.userId, userId),
          eq(itineraryEdit.mutationId, request.mutationId),
        ),
      );
    if (previous) {
      if (
        previous.version !== request.version + 1 ||
        !isDeepStrictEqual(previous.operation, request.operation) ||
        previous.source !== (options.source ?? "manual") ||
        (previous.proposalId ?? null) !== (options.proposalId ?? null)
      )
        throw new RequestError(
          409,
          "This save identifier was already used for a different edit. Reload the saved version.",
        );
      return read(userId, id);
    }
    const result = await preview(userId, id, request, options);
    if (!result.canSave)
      throw new RequestError(
        422,
        result.assessment.errors.map((e) => e.message).join(" "),
      );
    if (result.overBudget && !request.acknowledgeOverBudget)
      throw new RequestError(
        422,
        "Acknowledge the budget overrun before saving this estimate. The reserve stays protected.",
      );
    const saved = await trips.read(userId, id);
    const candidate = result.candidate;
    // Current checks are manual, not a claim that generation-quality gates ran
    // again. Original generation metadata survives in the immutable audit before.
    delete candidate.quality;
    delete candidate.normalization;
    candidate.manualEdit = {
      revision: request.version + 1,
      updatedAt: new Date().toISOString(),
      warnings: result.assessment.warnings.map((w) => w.message),
    };
    candidate.priceSource = "mixed-estimate";
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(trip)
        .set({
          itinerary: candidate,
          itineraryVersion: request.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(trip.id, id),
            eq(trip.userId, userId),
            eq(trip.itineraryVersion, request.version),
          ),
        )
        .returning();
      if (!updated)
        throw new RequestError(
          409,
          "This itinerary changed before the edit was saved. Reload and review your change again.",
        );
      const editId = randomUUID();
      await tx.insert(itineraryEdit).values({
        id: editId,
        tripId: id,
        userId,
        mutationId: request.mutationId,
        version: request.version + 1,
        operation: request.operation,
        before: saved.itinerary!,
        after: candidate,
        assessment: result.assessment,
        source: options.source ?? "manual",
        proposalId: options.proposalId,
      });
      await options.onRecorded?.(tx, editId);
    });
    return read(userId, id);
  }
  return { read, preview, commit };
}

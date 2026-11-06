import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import {
  recoveryAttempt as attempt,
  recoveryCase as cases,
  tripWallet,
} from "./db/schema";
import type { Database } from "./db/connection";
import type { TripModel } from "./model";
import { ModelFailure } from "./ai/contracts";
import {
  createGenerationQuota,
  GenerationQuotaError,
  type GenerationLimits,
} from "./generation-quota";
import { STALE_JOB_MS } from "../lib/generation-timing";
import {
  recoveryRequest,
  recoveryResponseSchema,
  type RecoveryKind,
  type RecoveryOption,
} from "../lib/recovery-contracts";
import {
  editRequestSchema,
  materializeActivities,
} from "../lib/itinerary-editing";
import {
  agentOperations,
  assertGroundedResponse,
  buildAgentContext,
  planningBudget,
} from "./agent-context";
import type { createItineraryEditor } from "./itinerary-edits";
import type { createCommerce, CommerceState } from "./paypal-commerce";
import type { createWallet } from "./wallet";
import { RequestError } from "./trips";

type Case = typeof cases.$inferSelect;
type Attempt = typeof attempt.$inferSelect;
type Booking = CommerceState["bookings"][number];
const active = ["queued", "generating"] as const;
const notSettled = new Set(["sending", "pending", "uncertain"]);
const maxAttempts = 24;

function activityAt(
  saved: Awaited<ReturnType<ReturnType<typeof createItineraryEditor>["read"]>>,
  activityId: string,
) {
  const plan = materializeActivities(saved.itinerary);
  for (const day of plan.days) {
    const activity = day.activities.find((a) => a.id === activityId);
    if (activity) return { date: day.date, dayId: day.id!, activity };
  }
  throw new RequestError(
    409,
    "This activity is no longer in the saved itinerary. Review the booking separately.",
  );
}

function phase(
  entry: Case,
  runs: Attempt[],
  original: Booking,
  replacement: Booking | null,
) {
  const refund = original.operations.filter((o) => o.kind === "refund").at(-1);
  const checkout = replacement?.operations.at(-1);
  if (
    original.needsReview ||
    replacement?.needsReview ||
    refund?.status === "uncertain" ||
    checkout?.status === "uncertain"
  )
    return "attention";
  if (refund && notSettled.has(refund.status)) return "refund_pending";
  if (checkout && notSettled.has(checkout.status)) return "replacement_pending";
  if (replacement && !replacement.payment.capturedMinor)
    return checkout?.status === "failed" ||
      checkout?.providerStatus === "VOIDED"
      ? "replacement_failed"
      : "replacement_pending";
  if (refund?.status === "failed") return "refund_failed";
  if (entry.resolvedAt) return "complete";
  if (entry.editId) return "itinerary_updated";
  const latest = runs[0];
  if (latest && active.some((status) => status === latest.status))
    return "finding_options";
  if (runs.some((run) => run.status === "ready")) return "review";
  return "canceled";
}

export function createRecovery(
  db: Database,
  editor: ReturnType<typeof createItineraryEditor>,
  wallet: ReturnType<typeof createWallet>,
  commerce: ReturnType<typeof createCommerce>,
  model: TripModel,
  enabled: boolean,
  limits?: GenerationLimits,
  clock: () => number = Date.now,
) {
  const quota = createGenerationQuota(db, limits, clock);
  const now = () => new Date(clock());
  const scope = (userId: string, tripId: string) =>
    and(eq(cases.userId, userId), eq(cases.tripId, tripId));

  async function owned(userId: string, tripId: string, id: string) {
    const [entry] = await db
      .select()
      .from(cases)
      .where(and(scope(userId, tripId), eq(cases.id, id)));
    if (!entry) throw new RequestError(404, "Recovery case not found.");
    return entry;
  }

  async function status(userId: string, tripId: string) {
    const [saved, finance, bookings, entries] = await Promise.all([
      editor.read(userId, tripId),
      wallet.read(userId, tripId),
      commerce.read(userId, tripId),
      db
        .select()
        .from(cases)
        .where(scope(userId, tripId))
        .orderBy(desc(cases.createdAt)),
    ]);
    const ids = entries.map((entry) => entry.id);
    const runs = ids.length
      ? await db
          .select()
          .from(attempt)
          .where(inArray(attempt.caseId, ids))
          .orderBy(desc(attempt.createdAt), desc(attempt.id))
      : [];
    // Reads report timed-out jobs without starting work or writing provider state.
    for (const run of runs) {
      if (
        active.some((state) => state === run.status) &&
        clock() - run.updatedAt.getTime() > STALE_JOB_MS
      ) {
        run.status = "interrupted";
        run.error =
          "The suggestion worker stopped. Request new suggestions when ready.";
      }
    }
    return {
      enabled,
      aiAvailable: !!model.recover,
      itineraryVersion: saved.version,
      walletVersion: finance.version,
      currency: finance.currency,
      financial: {
        capturedNetEstimateMinor: finance.summary.actualHomeMinor,
        unallocatedMinor: finance.budget.remainingMinor,
        projectionHeadroomMinor: finance.summary.projectedRemainingMinor,
        reserveMinor: finance.budget.reserveMinor,
      },
      eligibleBookings: enabled
        ? bookings.bookings
            .filter(
              (b) =>
                b.captureId &&
                b.payment.capturedMinor > 0 &&
                !entries.some((e) => e.bookingId === b.id) &&
                saved.itinerary.days.some((d) =>
                  d.activities.some((a) => a.id === b.activityId),
                ),
            )
            .map(({ id, title }) => ({ id, title }))
        : [],
      cases: entries.flatMap((entry) => {
        const original = bookings.bookings.find(
          (b) => b.id === entry.bookingId,
        );
        if (!original) return [];
        const replacement = entry.replacementActivityId
          ? bookings.bookings.find(
              (b) => b.activityId === entry.replacementActivityId,
            )
          : undefined;
        const quote = finance.intents.find((i) => i.id === original.intentId)!;
        const replacementQuote = entry.replacementActivityId
          ? finance.intents.find(
              (i) =>
                i.activityId === entry.replacementActivityId &&
                i.status === "planned",
            )
          : undefined;
        const history = runs.filter((run) => run.caseId === entry.id);
        const summarize = (booking: Booking) => ({
          id: booking.id,
          payment: booking.payment,
          refundableMinor: booking.refundableMinor,
          canOperate: booking.canOperate,
          operations: booking.operations.map(
            ({
              id,
              kind,
              status,
              providerStatus,
              requestedMinor,
              createdAt,
            }) => ({
              id,
              kind,
              status,
              providerStatus,
              requestedMinor,
              createdAt,
            }),
          ),
        });
        return [
          {
            id: entry.id,
            reason: entry.reason,
            provenance: entry.provenance,
            activityId: entry.activityId,
            original: entry.original,
            payment: summarize(original),
            fx: quote.fx,
            replacement: replacement ? summarize(replacement) : null,
            replacementActivityId: entry.replacementActivityId,
            replacementExists: finance.activities.some(
              (a) => a.id === entry.replacementActivityId,
            ),
            replacementQuote: replacementQuote
              ? {
                  id: replacementQuote.id,
                  originalMinor: replacementQuote.originalMinor,
                  originalCurrency: replacementQuote.originalCurrency,
                  estimatedDisplayMinor: replacementQuote.estimatedDisplayMinor,
                  fx: replacementQuote.fx,
                }
              : null,
            phase: phase(entry, history, original, replacement ?? null),
            editId: entry.editId,
            resolvedAt: entry.resolvedAt?.toISOString() ?? null,
            createdAt: entry.createdAt.toISOString(),
            attempts: history.map(
              ({
                id,
                mode,
                preferences,
                status,
                itineraryVersion,
                walletVersion,
                options,
                appliedOptionId,
                error,
                findings,
                createdAt,
              }) => ({
                id,
                mode,
                preferences,
                status,
                itineraryVersion,
                walletVersion,
                options,
                appliedOptionId,
                error,
                findings,
                createdAt: createdAt.toISOString(),
              }),
            ),
          },
        ];
      }),
    };
  }

  async function simulate(
    userId: string,
    tripId: string,
    bookingId: string,
    reason: string,
  ) {
    if (!enabled)
      throw new RequestError(
        403,
        "Sandbox cancellation simulation is disabled.",
      );
    const [previous] = await db
      .select()
      .from(cases)
      .where(and(scope(userId, tripId), eq(cases.bookingId, bookingId)));
    if (previous) {
      if (previous.reason !== reason)
        throw new RequestError(
          409,
          "This booking already has a recorded cancellation.",
        );
      return;
    }
    const [saved, payments, finance] = await Promise.all([
      editor.read(userId, tripId),
      commerce.read(userId, tripId),
      wallet.read(userId, tripId),
    ]);
    const booking = payments.bookings.find((item) => item.id === bookingId);
    if (!booking) throw new RequestError(404, "Booking not found.");
    if (!booking.captureId || !booking.payment.capturedMinor)
      throw new RequestError(
        409,
        "Only a booking with a verified Sandbox capture is eligible.",
      );
    const quote = finance.intents.find((i) => i.id === booking.intentId)!;
    const [inserted] = await db
      .insert(cases)
      .values({
        tripId,
        userId,
        bookingId,
        activityId: booking.activityId,
        provenance: "sandbox-simulation",
        reason,
        original: {
          ...activityAt(saved, booking.activityId),
          bookingTitle: booking.title,
          quoteMinor: quote.estimatedDisplayMinor,
          currency: "USD",
          capturedMinor: booking.payment.capturedMinor,
          refundedMinor: booking.payment.refundedMinor,
          fx: quote.fx,
        },
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted) {
      const [existing] = await db
        .select()
        .from(cases)
        .where(and(scope(userId, tripId), eq(cases.bookingId, bookingId)));
      if (!existing || existing.reason !== reason)
        throw new RequestError(
          409,
          "This booking already has a recorded cancellation.",
        );
    }
  }

  async function validateOptions(
    userId: string,
    tripId: string,
    entry: Case,
    run: Attempt,
    raw: unknown,
  ) {
    const saved = await editor.read(userId, tripId);
    const finance = await wallet.read(userId, tripId);
    if (
      saved.version !== run.itineraryVersion ||
      finance.version !== run.walletVersion ||
      finance.itineraryVersion !== saved.version
    )
      throw new RequestError(
        409,
        "The trip or wallet changed. Request fresh suggestions before reviewing.",
      );
    const affected = activityAt(saved, entry.activityId);
    const plan = materializeActivities(saved.itinerary);
    const options: RecoveryOption[] = [],
      findings: string[] = [];
    async function add(
      kind: RecoveryKind,
      rationale: string,
      action?: import("../lib/agent-contracts").AgentAction,
    ) {
      const id = randomUUID();
      let replacementActivityId: string | null = null;
      const remove = {
        action: "delete" as const,
        activityId: entry.activityId,
      };
      let operation: unknown = remove;
      if (action) {
        const claims = [
          rationale,
          action.title,
          action.description,
          action.location,
        ].join(" ");
        assertGroundedResponse(
          {
            answer: claims,
            activityIds: [],
            uncertainties: [],
            proposal: null,
          },
          plan,
        );
        if (
          /\b(?:guaranteed availability|confirmed (?:booking|inventory|reservation|availability)|verified (?:price|availability)|refund (?:guaranteed|completed))\b/i.test(
            claims,
          )
        )
          throw new RequestError(
            422,
            "The suggestion made an unsupported verification claim.",
          );
        if (kind === "reschedule") {
          if (
            action.type !== "move_activity" ||
            action.activityId !== entry.activityId
          )
            throw new RequestError(
              422,
              "Only the canceled activity can be moved.",
            );
        } else {
          if (
            action.type !== "add_activity" ||
            action.activityId !== null ||
            action.dayId !== affected.dayId ||
            action.startMinute === null ||
            action.durationMinutes === null ||
            action.costMinor === null ||
            action.startMinute < affected.activity.startMinute ||
            action.startMinute + action.durationMinutes >
              affected.activity.startMinute + affected.activity.durationMinutes
          )
            throw new RequestError(
              422,
              "A replacement must fit inside the canceled slot on the affected day.",
            );
          if (kind === "free" && action.costMinor !== 0)
            throw new RequestError(
              422,
              "A free alternative cannot include an estimated charge.",
            );
          if (
            kind === "similar" &&
            Math.abs(action.costMinor - affected.activity.costMinor) >
              Math.ceil(affected.activity.costMinor * 0.25)
          )
            throw new RequestError(
              422,
              "A similar-price alternative must be within 25% of the saved estimate.",
            );
          replacementActivityId = randomUUID();
        }
        const translated = agentOperations(
          plan,
          [action],
          [replacementActivityId ?? randomUUID()],
        );
        operation = replacementActivityId
          ? { action: "batch", operations: [remove, ...translated.operations] }
          : translated;
      }
      const request = editRequestSchema.parse({
        version: saved.version,
        mutationId: id,
        operation,
      });
      const result = await editor.preview(userId, tripId, request, {
        source: run.mode === "ai" ? "ai-proposal" : undefined,
        proposalId: id,
      });
      if (!result.changes.length)
        throw new RequestError(
          422,
          "The suggestion does not change the itinerary.",
        );
      const projected = await wallet.read(userId, tripId, result.candidate);
      if (
        projected.version !== finance.version ||
        projected.itineraryVersion !== saved.version
      )
        throw new RequestError(
          409,
          "The trip or wallet changed during review. Request new suggestions.",
        );
      options.push({
        id,
        kind,
        rationale,
        request,
        replacementActivityId,
        replacementEstimateMinor: action
          ? (action.costMinor ?? affected.activity.costMinor)
          : null,
        projectionBeforeMinor: finance.summary.projectedMinor,
        projectionAfterMinor: projected.summary.projectedMinor,
        projectionHeadroomMinor: projected.summary.projectedRemainingMinor,
        preview: {
          version: result.version,
          canSave: result.canSave,
          assessment: result.assessment,
          changes: result.changes,
          budgetDeltaMinor: result.budgetDeltaMinor,
          overBudget:
            result.overBudget || projected.summary.projectedRemainingMinor < 0,
          beforeBudget: planningBudget(saved.itinerary, saved.intent),
          afterBudget: result.candidate.budget!,
        },
      });
    }
    if (run.mode === "rest")
      await add(
        "rest",
        "Remove the canceled activity and keep the time open for rest.",
      );
    else if (run.mode === "refund_only")
      await add(
        "refund_only",
        "Remove the canceled activity and review any eligible refund separately.",
      );
    else {
      const output = recoveryResponseSchema.parse(raw);
      const kinds = new Set<RecoveryKind>();
      for (const alternative of output.alternatives) {
        if (kinds.has(alternative.kind)) {
          findings.push("A duplicate alternative type was skipped.");
          continue;
        }
        try {
          await add(
            alternative.kind,
            alternative.rationale,
            alternative.action,
          );
          kinds.add(alternative.kind);
        } catch (error) {
          if (!(error instanceof RequestError) || error.status !== 422)
            throw error;
          findings.push(error.message);
        }
      }
      if (!options.length)
        findings.push(
          "No AI alternatives could be reviewed. You can leave the time free or review a refund.",
        );
    }
    return { options, findings };
  }

  async function run(
    userId: string,
    tripId: string,
    caseId: string,
    attemptId: string,
  ) {
    const entry = await owned(userId, tripId, caseId);
    const [claimed] = await db
      .update(attempt)
      .set({ status: "generating", updatedAt: now() })
      .where(
        and(
          eq(attempt.id, attemptId),
          eq(attempt.caseId, entry.id),
          eq(attempt.status, "queued"),
          gte(attempt.updatedAt, new Date(clock() - STALE_JOB_MS)),
        ),
      )
      .returning();
    if (!claimed) return;
    let release: (() => Promise<void>) | undefined;
    const started = clock();
    const generating = and(
      eq(attempt.id, attemptId),
      eq(attempt.status, "generating"),
    );
    try {
      if (entry.editId || entry.resolvedAt)
        throw new RequestError(409, "This recovery plan was already applied.");
      if (claimed.mode !== "ai" || !model.recover)
        throw new RequestError(
          503,
          "AI recovery is unavailable. You can still leave the time free.",
        );
      const [saved, finance, payments] = await Promise.all([
        editor.read(userId, tripId),
        wallet.read(userId, tripId),
        commerce.read(userId, tripId),
      ]);
      if (
        saved.version !== claimed.itineraryVersion ||
        finance.version !== claimed.walletVersion ||
        finance.itineraryVersion !== saved.version ||
        payments.walletVersion !== finance.version
      )
        throw new RequestError(
          409,
          "The trip or wallet changed. Request new suggestions.",
        );
      const booking = payments.bookings.find((b) => b.id === entry.bookingId)!;
      const affected = activityAt(saved, entry.activityId);
      const context = buildAgentContext(
        saved,
        claimed.preferences || "Suggest alternatives for the canceled slot.",
        [],
        {
          affected,
          reason: entry.reason,
          provenance: entry.provenance,
          originalEstimateMinor: entry.original.activity.costMinor,
          payment: booking.payment,
          currency: "USD",
          refundableMinor: booking.canOperate ? booking.refundableMinor : 0,
          planningReschedule:
            "Only an unverified planning move can be suggested. There is no supplier rescheduling integration.",
          projectedHeadroomMinor: finance.summary.projectedRemainingMinor,
          protectedReserveMinor: finance.budget.reserveMinor,
          locationEvidence:
            "Use only supplied coordinates and venue references. A new location is unverified and will have no map pin.",
        },
      );
      release = await quota.acquire(userId);
      const output = await model.recover(context.input, {
        purpose: "assistant",
        onUsage: async (usage) => {
          await db
            .update(attempt)
            .set({ usage })
            .where(eq(attempt.id, attemptId));
        },
      });
      const result = await validateOptions(
        userId,
        tripId,
        entry,
        claimed,
        output,
      );
      await db
        .update(attempt)
        .set({
          ...result,
          status: "ready",
          latencyMs: clock() - started,
          updatedAt: now(),
        })
        .where(generating);
    } catch (error) {
      const publicMessage =
        error instanceof RequestError ||
        error instanceof ModelFailure ||
        error instanceof GenerationQuotaError
          ? error.message
          : "Recovery suggestions could not be validated. The trip and payment records are unchanged.";
      await db
        .update(attempt)
        .set({
          status: "failed",
          error: publicMessage,
          latencyMs: clock() - started,
          updatedAt: now(),
        })
        .where(generating);
    } finally {
      await release?.();
    }
  }

  async function action(userId: string, tripId: string, raw: unknown) {
    await editor.read(userId, tripId);
    const input = recoveryRequest.parse(raw);
    const read = () => status(userId, tripId);
    if (input.action === "simulate") {
      await simulate(userId, tripId, input.bookingId, input.reason);
      return { state: await read() };
    }
    const entry = await owned(userId, tripId, input.caseId);
    if (input.action === "suggest" || input.action === "baseline") {
      if (entry.editId || entry.resolvedAt)
        throw new RequestError(
          409,
          "A recovery plan was already applied for this cancellation.",
        );
      const finance = await wallet.read(userId, tripId);
      const mode = input.action === "suggest" ? "ai" : input.kind;
      const preferences = input.action === "suggest" ? input.preferences : "";
      const created = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(cases)
          .where(eq(cases.id, entry.id))
          .for("update");
        if (locked.editId || locked.resolvedAt)
          throw new RequestError(409, "A recovery plan was already applied.");
        await tx
          .update(attempt)
          .set({
            status: "interrupted",
            error: "The suggestion worker stopped.",
            updatedAt: now(),
          })
          .where(
            and(
              eq(attempt.caseId, entry.id),
              inArray(attempt.status, active),
              lt(attempt.updatedAt, new Date(clock() - STALE_JOB_MS)),
            ),
          );
        const [duplicate] = await tx
          .select()
          .from(attempt)
          .where(eq(attempt.id, input.mutationId));
        if (duplicate) {
          if (
            duplicate.caseId !== entry.id ||
            duplicate.mode !== mode ||
            duplicate.preferences !== preferences
          )
            throw new RequestError(
              409,
              "This review identifier is already in use.",
            );
          return duplicate.status === "queued" ? duplicate : null;
        }
        const history = await tx
          .select({ status: attempt.status })
          .from(attempt)
          .where(eq(attempt.caseId, entry.id))
          .limit(maxAttempts);
        if (history.length >= maxAttempts)
          throw new RequestError(
            429,
            "This recovery case reached its review limit.",
          );
        if (
          history.some((item) => active.some((state) => state === item.status))
        )
          throw new RequestError(
            409,
            "Wait for the current recovery review to finish.",
          );
        const [saved] = await tx
          .insert(attempt)
          .values({
            id: input.mutationId,
            caseId: entry.id,
            status: "queued",
            mode,
            preferences,
            itineraryVersion: finance.itineraryVersion,
            walletVersion: finance.version,
            provider: mode === "ai" ? (model.provider ?? "unknown") : null,
            model: mode === "ai" ? model.name : null,
            createdAt: now(),
            updatedAt: now(),
          })
          .returning();
        return saved;
      });
      if (created && mode !== "ai") {
        try {
          const result = await validateOptions(
            userId,
            tripId,
            entry,
            created,
            null,
          );
          await db
            .update(attempt)
            .set({ ...result, status: "ready", updatedAt: now() })
            .where(
              and(eq(attempt.id, created.id), eq(attempt.status, "queued")),
            );
        } catch (error) {
          await db
            .update(attempt)
            .set({
              status: "failed",
              error:
                "The itinerary changed or the slot is unavailable. Review again.",
              updatedAt: now(),
            })
            .where(
              and(eq(attempt.id, created.id), eq(attempt.status, "queued")),
            );
          throw error;
        }
      }
      return {
        state: await read(),
        queued:
          created && mode === "ai"
            ? { caseId: entry.id, attemptId: created.id }
            : undefined,
      };
    }
    if (input.action === "finish") {
      const current = (await read()).cases.find(
        (item) => item.id === entry.id,
      )!;
      if (
        !entry.editId ||
        ["attention", "refund_pending", "replacement_pending"].includes(
          current.phase,
        )
      )
        throw new RequestError(
          409,
          "Save an itinerary choice and reconcile any outstanding payments before finishing.",
        );
      if (!entry.resolvedAt)
        await db
          .update(cases)
          .set({ resolvedAt: now(), updatedAt: now() })
          .where(
            and(eq(cases.id, entry.id), eq(cases.updatedAt, entry.updatedAt)),
          );
      return { state: await read() };
    }
    const [review] = await db
      .select()
      .from(attempt)
      .where(
        and(eq(attempt.id, input.attemptId), eq(attempt.caseId, entry.id)),
      );
    if (!review) throw new RequestError(404, "Recovery review not found.");
    if (input.action === "reject") {
      const [rejected] = await db
        .update(attempt)
        .set({ status: "rejected", updatedAt: now() })
        .where(and(eq(attempt.id, review.id), eq(attempt.status, "ready")))
        .returning();
      if (!rejected && review.status !== "rejected")
        throw new RequestError(409, "This review is no longer pending.");
      return { state: await read() };
    }
    const option = review.options.find((item) => item.id === input.optionId);
    if (
      review.status === "applied" &&
      review.appliedOptionId === input.optionId
    )
      return { state: await read(), itineraryChanged: false };
    if (
      !option ||
      review.status !== "ready" ||
      !option.preview.canSave ||
      entry.editId ||
      entry.resolvedAt
    )
      throw new RequestError(
        409,
        "This recovery option is no longer available to apply.",
      );
    if (option.preview.overBudget && !input.acknowledgeOverBudget)
      throw new RequestError(
        422,
        "Acknowledge the projected overrun while keeping the reserve protected.",
      );
    await editor.commit(
      userId,
      tripId,
      { ...option.request, acknowledgeOverBudget: input.acknowledgeOverBudget },
      {
        source: review.mode === "ai" ? "ai-proposal" : undefined,
        proposalId: option.id,
        onRecorded: async (tx, editId) => {
          const [locked] = await tx
            .select()
            .from(tripWallet)
            .where(
              and(eq(tripWallet.tripId, tripId), eq(tripWallet.userId, userId)),
            )
            .for("update");
          if (locked?.version !== review.walletVersion)
            throw new RequestError(
              409,
              "TripWallet changed. Review a fresh suggestion before approving.",
            );
          const [updated] = await tx
            .update(cases)
            .set({
              editId,
              replacementActivityId: option.replacementActivityId,
              updatedAt: now(),
            })
            .where(
              and(eq(cases.id, entry.id), eq(cases.updatedAt, entry.updatedAt)),
            )
            .returning();
          const [applied] = await tx
            .update(attempt)
            .set({
              status: "applied",
              appliedOptionId: option.id,
              updatedAt: now(),
            })
            .where(and(eq(attempt.id, review.id), eq(attempt.status, "ready")))
            .returning();
          if (!updated || !applied)
            throw new RequestError(
              409,
              "The recovery review changed before it could be saved.",
            );
        },
      },
    );
    return { state: await read(), itineraryChanged: true };
  }

  async function links(userId: string, tripId: string) {
    return db
      .select({
        id: cases.id,
        activityId: cases.activityId,
        bookingId: cases.bookingId,
        replacementActivityId: cases.replacementActivityId,
      })
      .from(cases)
      .where(scope(userId, tripId));
  }
  async function assistantContext(userId: string, tripId: string) {
    const saved = await db
      .select({
        activityId: cases.activityId,
        replacementActivityId: cases.replacementActivityId,
        provenance: cases.provenance,
        itineraryUpdated: cases.editId,
        finished: cases.resolvedAt,
      })
      .from(cases)
      .where(scope(userId, tripId))
      .orderBy(desc(cases.createdAt))
      .limit(8);
    if (!saved.length) return undefined;
    return {
      cases: saved.map(
        ({
          activityId,
          replacementActivityId,
          provenance,
          itineraryUpdated,
          finished,
        }) => ({
          activityId,
          replacementActivityId,
          provenance,
          itineraryUpdated: !!itineraryUpdated,
          finished: !!finished,
        }),
      ),
      instruction:
        "For questions about a simulated cancellation, direct the traveler to the Trip Recovery workspace for options and Bookings for verified payment history. The standard conversation cannot verify or execute financial actions.",
    };
  }
  return { read: status, action, run, links, assistantContext };
}

export type RecoveryState = Awaited<
  ReturnType<ReturnType<typeof createRecovery>["read"]>
>;

import { randomUUID } from "node:crypto";
import { and, eq, lt, inArray, sql, asc } from "drizzle-orm";
import { z } from "zod";
import {
  validateGenerationIntent,
  validateItinerary,
  validateProposal,
  type CityProposal,
  type Itinerary,
  PlanningError,
  itineraryOutputSchema,
  proposalSchema,
} from "../lib/itinerary";
import { generation, generationAttempt, trip } from "./db/schema";
import {
  createGenerationQuota,
  GenerationQuotaError,
  type GenerationLimits,
} from "./generation-quota";
import type { Database } from "./db/connection";
import type { TripModel } from "./model";
import { createTripStore, RequestError } from "./trips";
import { validateItineraryQuality } from "../lib/itinerary-quality";
import {
  dayRoleLabels,
  isTransitDay,
  travelTimingSchema,
  type TravelTiming,
} from "../lib/travel-days";
import type { TripIntent } from "../lib/trip-intent";
import { venueReferences } from "./venue-references";
import { normalizeTravelBuffers } from "../lib/itinerary-normalization";
import { ModelFailure, type ModelCallContext } from "./ai/contracts";
import { initialValidationChecks, type ValidationStage } from "./ai/audit";
import type { ItineraryNormalization } from "../lib/itinerary-normalization";
import { STALE_JOB_MS } from "../lib/generation-timing";

const reviewLegacyTiming =
  "Review the tentative transit days for this saved destination before generating.";

function confirmTravelTiming(
  proposal: CityProposal,
  intent: TripIntent,
  timing?: TravelTiming,
) {
  if (proposal.travelTiming) {
    if (timing)
      throw new RequestError(
        409,
        "Use the saved travel assumptions or adjust a copy of your trip.",
      );
    return proposal;
  }
  if (!timing) throw new RequestError(422, reviewLegacyTiming);
  try {
    return validateProposal({ ...proposal, travelTiming: timing }, intent);
  } catch (error) {
    if (error instanceof PlanningError)
      throw new RequestError(422, error.message);
    throw error;
  }
}

export function createGenerationStore(
  db: Database,
  model: TripModel,
  limits?: GenerationLimits,
) {
  const trips = createTripStore(db);
  const quota = createGenerationQuota(db, limits);
  async function read(userId: string, tripId: string) {
    await trips.read(userId, tripId);
    // A crashed host must not strand the user in a permanent loading state.
    const expired = await db
      .update(generation)
      .set({
        status: "failed",
        error:
          "Generation was interrupted. Your saved input is safe; retry when ready.",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(generation.userId, userId),
          eq(generation.tripId, tripId),
          inArray(generation.status, [
            "queued",
            "choosing",
            "generating",
            "validating",
          ]),
          lt(generation.updatedAt, new Date(Date.now() - STALE_JOB_MS)),
        ),
      )
      .returning();
    if (expired.length)
      await db
        .update(generationAttempt)
        .set({
          status: "interrupted",
          error: "The worker was interrupted; provider usage may be unknown.",
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(
              generationAttempt.generationId,
              expired.map((row) => row.id),
            ),
            eq(generationAttempt.userId, userId),
            eq(generationAttempt.status, "started"),
          ),
        );
    const job =
      (
        await db
          .select()
          .from(generation)
          .where(
            and(eq(generation.userId, userId), eq(generation.tripId, tripId)),
          )
      )[0] ?? null;
    if (!job) return null;
    const audits = await db
      .select()
      .from(generationAttempt)
      .where(
        and(
          eq(generationAttempt.userId, userId),
          eq(generationAttempt.tripId, tripId),
          eq(generationAttempt.generationId, job.id),
        ),
      )
      .orderBy(asc(generationAttempt.createdAt), asc(generationAttempt.id));
    return { ...job, audits };
  }
  return {
    read,
    async action(userId: string, tripId: string, input: unknown) {
      const { action, travelTiming } = z
        .object({
          action: z.enum(["start", "confirm", "retry"]),
          travelTiming: travelTimingSchema.optional(),
        })
        .strict()
        .refine(
          ({ action, travelTiming }) => action !== "start" || !travelTiming,
        )
        .parse(input);
      const saved = await trips.read(userId, tripId);
      let intent: TripIntent;
      try {
        intent = validateGenerationIntent(saved.data);
      } catch (error) {
        throw new RequestError(
          422,
          error instanceof Error ? error.message : "Review your trip details.",
        );
      }
      if (saved.itinerary)
        throw new RequestError(
          409,
          "This trip already has a completed itinerary.",
        );
      let job = await read(userId, tripId);
      if (!job) {
        if (action !== "start")
          throw new RequestError(409, "Start destination planning first.");
        await db
          .insert(generation)
          .values({ userId, tripId })
          .onConflictDoNothing();
        job = await read(userId, tripId);
      } else if (action === "confirm") {
        if (job.status !== "awaiting_confirmation" || !job.proposal)
          throw new RequestError(
            409,
            "A destination must be ready for confirmation first.",
          );
        await db
          .update(generation)
          .set({
            status: "queued",
            confirmed: true,
            attempts: 0,
            error: null,
            proposal: confirmTravelTiming(job.proposal, intent, travelTiming),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(generation.id, job.id),
              eq(generation.status, "awaiting_confirmation"),
            ),
          );
      } else if (action === "retry") {
        if (job.status !== "failed" || job.attempts >= 3)
          throw new RequestError(
            409,
            "Retry is unavailable. Review your saved trip or try a new planning draft.",
          );
        if (travelTiming && !job.confirmed)
          throw new RequestError(
            409,
            "Confirm a destination before supplying transit days.",
          );
        const proposal =
          job.confirmed && job.proposal
            ? confirmTravelTiming(job.proposal, intent, travelTiming)
            : job.proposal;
        await db
          .update(generation)
          .set({
            status: "queued",
            error: null,
            proposal,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(generation.id, job.id),
              eq(generation.status, "failed"),
              lt(generation.attempts, 3),
            ),
          );
      }
      return (await read(userId, tripId))!;
    },
    async run(userId: string, tripId: string) {
      const job = await read(userId, tripId);
      if (!job || job.status !== "queued") return;
      if (job.confirmed && !job.proposal?.travelTiming) {
        await db
          .update(generation)
          .set({
            status: "failed",
            error: reviewLegacyTiming,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(generation.id, job.id),
              eq(generation.status, "queued"),
              eq(generation.updatedAt, job.updatedAt),
            ),
          );
        return;
      }
      const now = new Date();
      const [claimed] = await db
        .update(generation)
        .set({
          status: job.confirmed ? "generating" : "choosing",
          attempts: sql`${generation.attempts}+1`,
          updatedAt: now,
        })
        .where(and(eq(generation.id, job.id), eq(generation.status, "queued")))
        .returning();
      if (!claimed) return; // Atomic claim: repeated POSTs never duplicate model calls.
      const lease = and(
        eq(generation.id, job.id),
        eq(generation.attempts, claimed.attempts),
        eq(generation.updatedAt, now),
      );
      let release: (() => Promise<void>) | undefined;
      let auditId: string | undefined,
        auditStatus = "failed";
      let stage: ValidationStage = "provider",
        auditError: string | null = null;
      let normalization: ItineraryNormalization | undefined;
      const checks = initialValidationChecks();
      try {
        release = await quota.acquire(userId);
        const saved = await trips.read(userId, tripId);
        const intent = validateGenerationIntent(saved.data);
        const [audit] = await db
          .insert(generationAttempt)
          .values({
            generationId: job.id,
            userId,
            tripId,
            phase: claimed.confirmed ? "itinerary" : "proposal",
            attempt: claimed.attempts,
            provider: model.provider ?? "test-or-legacy",
            model: model.name,
            validation: checks,
          })
          .returning();
        auditId = audit.id;
        const context: ModelCallContext = {
          onUsage: async (usage) => {
            await db
              .update(generationAttempt)
              .set({ usage, updatedAt: new Date() })
              .where(eq(generationAttempt.id, audit.id));
          },
        };
        if (!claimed.confirmed) {
          const output = await model.propose(intent, context);
          checks.provider = "passed";
          stage = "schema";
          const parsed = proposalSchema.parse(output);
          checks.schema = "passed";
          stage = "domain";
          const proposal = validateProposal(parsed, intent);
          checks.domain = "passed";
          stage = "persistence";
          const updated = await db
            .update(generation)
            .set({
              proposal,
              status: "awaiting_confirmation",
              updatedAt: new Date(),
            })
            .where(lease)
            .returning();
          auditStatus = updated.length ? "accepted" : "superseded";
          checks.persistence = updated.length ? "passed" : "not-run";
          return;
        }
        if (!claimed.proposal)
          throw new PlanningError(
            "Confirm your destination before generating.",
          );
        const output = await model.generate(intent, claimed.proposal, context);
        checks.provider = "passed";
        const [validating] = await db
          .update(generation)
          .set({ status: "validating" })
          .where(lease)
          .returning();
        if (!validating) {
          auditStatus = "superseded";
          return;
        }
        stage = "schema";
        const parsed = itineraryOutputSchema.parse(output);
        checks.schema = "passed";
        stage = "normalization";
        const normalized = normalizeTravelBuffers(parsed, intent);
        normalization = normalized.normalization;
        checks.normalization = "passed";
        stage = "domain";
        const { plan, reserveMinor, totalMinor, budget } = validateItinerary(
          normalized.plan,
          intent,
          claimed.proposal,
        );
        checks.domain = "passed";
        stage = "quality";
        const quality = validateItineraryQuality(
          plan,
          intent,
          claimed.proposal,
          venueReferences,
          budget.expenses.flatMap((expense) =>
            expense.category === "food" || expense.category === "localTransport"
              ? [
                  {
                    dayIndex: expense.dayIndex,
                    activityIndex: expense.activityIndex,
                    category:
                      expense.category === "food"
                        ? ("dining" as const)
                        : ("transport" as const),
                  },
                ]
              : [],
          ),
        );
        checks.quality = "passed";
        const itinerary: Itinerary = {
          ...plan,
          schemaVersion: 2,
          base: claimed.proposal,
          reserveMinor,
          totalMinor,
          generatedAt: new Date().toISOString(),
          model: model.name,
          priceSource: "ai-estimate",
          quality,
          normalization: normalized.normalization,
          budget,
          days: plan.days.map((day, index) => ({
            ...day,
            title: isTransitDay(quality.days[index].role)
              ? dayRoleLabels[quality.days[index].role]
              : day.title,
            id: randomUUID(),
            activities: day.activities.map((activity) => ({
              ...activity,
              id: randomUUID(),
            })),
          })),
        };
        itinerary.budget = {
          ...budget,
          expenses: budget.expenses.map((expense) => ({
            ...expense,
            dayId: itinerary.days[expense.dayIndex].id,
            activityId:
              itinerary.days[expense.dayIndex].activities[expense.activityIndex]
                .id,
          })),
        };
        stage = "persistence";
        const committed = await db.transaction(async (tx) => {
          const [ownedLease] = await tx
            .update(generation)
            .set({ status: "complete", error: null, updatedAt: new Date() })
            .where(and(lease, eq(generation.status, "validating")))
            .returning();
          if (!ownedLease) return false;
          await tx
            .update(trip)
            .set({ itinerary, updatedAt: new Date() })
            .where(and(eq(trip.id, tripId), eq(trip.userId, userId)));
          return true;
        });
        auditStatus = committed ? "accepted" : "superseded";
        checks.persistence = committed ? "passed" : "not-run";
      } catch (error) {
        if (error instanceof ModelFailure && error.stage === "schema") {
          checks.provider = "passed";
          stage = "schema";
        }
        checks[stage] = "failed";
        // Only model/validation messages are exposed, never provider bodies or keys.
        const message =
          error instanceof z.ZodError
            ? "The response failed itinerary validation. Please retry."
            : error instanceof PlanningError
              ? error.message
              : "Generation failed. Please retry.";
        auditError = message.slice(0, 1600);
        await db
          .update(generation)
          .set({
            status: "failed",
            error: message.slice(0, 1600),
            // Local admission denials did not call a model and do not exhaust retries.
            ...(error instanceof GenerationQuotaError
              ? { attempts: claimed.attempts - 1 }
              : {}),
            updatedAt: new Date(),
          })
          .where(lease);
      } finally {
        try {
          if (auditId)
            await db
              .update(generationAttempt)
              .set({
                status: auditStatus,
                validation: checks,
                normalization,
                error: auditError,
                updatedAt: new Date(),
              })
              .where(eq(generationAttempt.id, auditId));
        } finally {
          if (release) await release();
        }
      }
    },
  };
}

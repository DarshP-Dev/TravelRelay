import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./db/connection";
import {
  agentConversation as conversation,
  agentTurn as turn,
  agentAttempt as attempt,
  agentProposal as proposal,
  agentProposalEvent as proposalEvent,
} from "./db/schema";
import { createItineraryEditor } from "./itinerary-edits";
import { RequestError } from "./trips";
import {
  agentRequestSchema,
  agentResponseSchema,
  type AgentPreview,
  type AgentAction,
} from "../lib/agent-contracts";
import {
  agentOperations,
  assertGroundedResponse,
  buildAgentContext,
  planningBudget,
} from "./agent-context";
import {
  createGenerationQuota,
  GenerationQuotaError,
  type GenerationLimits,
} from "./generation-quota";
import type { TripModel } from "./model";
import { ModelFailure } from "./ai/contracts";
import { editRequestSchema } from "../lib/itinerary-editing";
import { STALE_JOB_MS } from "../lib/generation-timing";

const active = ["queued", "generating", "validating"];
export function createTravelAgent(
  db: Database,
  model: TripModel,
  limits?: GenerationLimits,
  clock: () => number = Date.now,
  recoveryContext?: (
    userId: string,
    tripId: string,
  ) => Promise<object | undefined>,
) {
  const editor = createItineraryEditor(db),
    quota = createGenerationQuota(db, limits, clock);
  const now = () => new Date(clock());
  async function ensure(userId: string, tripId: string) {
    await editor.read(userId, tripId);
    await db
      .insert(conversation)
      .values({ tripId, userId })
      .onConflictDoNothing();
  }
  async function recover(userId: string, tripId: string) {
    await db.transaction(async (tx) => {
      const expired = await tx
        .update(turn)
        .set({
          status: "interrupted",
          leaseToken: null,
          error:
            "The response was interrupted. Your message and saved trip are safe. Check the status, then explicitly retry if needed.",
          errorStage: "interrupted",
          updatedAt: now(),
        })
        .where(
          and(
            eq(turn.userId, userId),
            eq(turn.tripId, tripId),
            inArray(turn.status, active),
            lt(turn.updatedAt, new Date(clock() - STALE_JOB_MS)),
          ),
        )
        .returning();
      if (!expired.length) return;
      const ids = expired.map((t) => t.id);
      await tx
        .update(conversation)
        .set({ activeTurnId: null, updatedAt: now() })
        .where(
          and(
            eq(conversation.userId, userId),
            eq(conversation.tripId, tripId),
            inArray(conversation.activeTurnId, ids),
          ),
        );
      await tx
        .update(attempt)
        .set({ status: "interrupted", updatedAt: now() })
        .where(
          and(
            eq(attempt.userId, userId),
            inArray(attempt.turnId, ids),
            eq(attempt.status, "started"),
          ),
        );
    });
  }
  async function read(userId: string, tripId: string, before?: number) {
    const saved = await editor.read(userId, tripId);
    await recover(userId, tripId);
    const [thread] = await db
      .select()
      .from(conversation)
      .where(
        and(eq(conversation.tripId, tripId), eq(conversation.userId, userId)),
      );
    const records = await db
      .select()
      .from(turn)
      .where(
        and(
          eq(turn.userId, userId),
          eq(turn.tripId, tripId),
          before ? lt(turn.ordinal, before) : undefined,
        ),
      )
      .orderBy(desc(turn.ordinal))
      .limit(20);
    const ids = records.map((t) => t.id);
    const proposals = ids.length
      ? await db
          .select()
          .from(proposal)
          .where(
            and(
              eq(proposal.userId, userId),
              eq(proposal.tripId, tripId),
              inArray(proposal.turnId, ids),
            ),
          )
      : [];
    const audits = ids.length
      ? await db
          .select()
          .from(attempt)
          .where(
            and(
              eq(attempt.userId, userId),
              eq(attempt.tripId, tripId),
              inArray(attempt.turnId, ids),
            ),
          )
          .orderBy(asc(attempt.attempt))
      : [];
    const pids = proposals.map((p) => p.id);
    const events = pids.length
      ? await db
          .select({
            id: proposalEvent.id,
            proposalId: proposalEvent.proposalId,
            event: proposalEvent.event,
            revision: proposalEvent.revision,
            createdAt: proposalEvent.createdAt,
          })
          .from(proposalEvent)
          .where(
            and(
              eq(proposalEvent.userId, userId),
              eq(proposalEvent.tripId, tripId),
              inArray(proposalEvent.proposalId, pids),
            ),
          )
          .orderBy(desc(proposalEvent.createdAt))
          .limit(120)
      : [];
    return {
      draft: thread?.draft ?? "",
      draftVersion: thread?.draftVersion ?? 0,
      activeTurnId: thread?.activeTurnId ?? null,
      totalTurns: thread?.turnCount ?? 0,
      currentVersion: saved.version,
      currency: saved.itinerary.currency,
      budget: planningBudget(saved.itinerary, saved.intent),
      days: saved.itinerary.days.map((d, i) => ({
        id: d.id,
        date: d.date,
        title: d.title,
        number: i + 1,
      })),
      activities: saved.itinerary.days.flatMap((d) =>
        d.activities.map((a) => ({ id: a.id, title: a.title, dayId: d.id })),
      ),
      hasOlder: records.length > 0 && records.at(-1)!.ordinal > 1,
      turns: records.reverse().map((t) => ({
        id: t.id,
        ordinal: t.ordinal,
        mutationId: t.mutationId,
        text: t.text,
        status: t.status,
        contextVersion: t.contextVersion,
        response: t.response,
        error: t.error,
        errorStage: t.errorStage,
        attempts: t.attempts,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        proposal: proposals.find((p) => p.turnId === t.id)
          ? (() => {
              const p = proposals.find((p) => p.turnId === t.id)!;
              return {
                id: p.id,
                revision: p.revision,
                baseVersion: p.baseVersion,
                status: p.status,
                summary: p.summary,
                preview: p.preview,
                appliedVersion: p.appliedVersion,
                stale:
                  p.status !== "approved" && p.baseVersion !== saved.version,
                events: events
                  .filter((e) => e.proposalId === p.id)
                  .map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
              };
            })()
          : null,
        audits: audits
          .filter((a) => a.turnId === t.id)
          .map((a) => ({
            id: a.id,
            attempt: a.attempt,
            provider: a.provider,
            model: a.model,
            status: a.status,
            usage: a.usage,
            latencyMs: a.latencyMs,
            validation: a.validation,
            createdAt: a.createdAt.toISOString(),
          })),
      })),
    };
  }
  async function previewActions(
    userId: string,
    tripId: string,
    id: string,
    actions: AgentAction[],
    assignedIds: string[],
  ) {
    const saved = await editor.read(userId, tripId);
    const request = editRequestSchema.parse({
      version: saved.version,
      mutationId: id,
      operation: agentOperations(saved.itinerary, actions, assignedIds),
    });
    const result = await editor.preview(userId, tripId, request, {
      source: "ai-proposal",
      proposalId: id,
    });
    const value: AgentPreview = {
      version: result.version,
      canSave: result.canSave,
      assessment: result.assessment,
      changes: result.changes,
      budgetDeltaMinor: result.budgetDeltaMinor,
      overBudget: result.overBudget,
      beforeBudget: planningBudget(saved.itinerary, saved.intent),
      afterBudget: result.candidate.budget!,
    };
    if (!value.changes.length) {
      value.canSave = false;
      value.assessment.errors.push({
        code: "no-change",
        message: "The proposal does not change the saved itinerary.",
      });
    }
    return { request, preview: value };
  }
  async function run(userId: string, tripId: string, turnId: string) {
    await editor.read(userId, tripId);
    const lease = randomUUID();
    const [claimed] = await db
      .update(turn)
      .set({
        status: "generating",
        leaseToken: lease,
        error: null,
        errorStage: null,
        updatedAt: now(),
      })
      .where(
        and(
          eq(turn.id, turnId),
          eq(turn.userId, userId),
          eq(turn.tripId, tripId),
          eq(turn.status, "queued"),
        ),
      )
      .returning();
    if (!claimed) return;
    let release: (() => Promise<void>) | undefined,
      auditId: string | undefined,
      phase = "context",
      providerStarted = clock();
    try {
      if (!model.respond)
        throw new ModelFailure(
          "The travel assistant is not configured on this server. Your message is saved.",
        );
      const saved = await editor.read(userId, tripId);
      const history = await db
        .select({
          text: turn.text,
          response: turn.response,
          status: turn.status,
          contextVersion: turn.contextVersion,
          proposalStatus: proposal.status,
        })
        .from(turn)
        .leftJoin(proposal, eq(proposal.turnId, turn.id))
        .where(
          and(
            eq(turn.userId, userId),
            eq(turn.tripId, tripId),
            lt(turn.ordinal, claimed.ordinal),
          ),
        )
        .orderBy(desc(turn.ordinal))
        .limit(8);
      const context = buildAgentContext(
        saved,
        claimed.text,
        history.reverse(),
        await recoveryContext?.(userId, tripId),
      );
      phase = "quota";
      release = await quota.acquire(userId);
      auditId = randomUUID();
      await db.transaction(async (tx) => {
        const [owned] = await tx
          .update(turn)
          .set({
            attempts: claimed.attempts + 1,
            contextVersion: saved.version,
            updatedAt: now(),
          })
          .where(
            and(
              eq(turn.id, turnId),
              eq(turn.leaseToken, lease),
              eq(turn.status, "generating"),
            ),
          )
          .returning();
        if (!owned)
          throw new RequestError(
            409,
            "This response was superseded before the model request.",
          );
        await tx.insert(attempt).values({
          id: auditId!,
          turnId,
          tripId,
          userId,
          attempt: claimed.attempts + 1,
          provider: model.provider ?? "unknown",
          model: model.name,
          validation: {
            stage: "context",
            errors: [],
            contextBytes: context.bytes,
            contextVersion: saved.version,
            contextTurns: context.historyTurns,
          },
        });
      });
      phase = "provider";
      providerStarted = clock();
      const output = await model.respond(context.input, {
        purpose: "assistant",
        onUsage: async (usage) => {
          await db
            .update(attempt)
            .set({
              usage,
              latencyMs: Math.min(
                2_147_483_647,
                Math.max(0, clock() - providerStarted),
              ),
              updatedAt: now(),
            })
            .where(and(eq(attempt.id, auditId!), eq(attempt.userId, userId)));
        },
      });
      phase = "schema";
      const result = agentResponseSchema.parse(output);
      await db
        .update(attempt)
        .set({
          toolProposals: result.proposal?.actions ?? [],
          latencyMs: Math.min(
            2_147_483_647,
            Math.max(0, clock() - providerStarted),
          ),
          updatedAt: now(),
        })
        .where(eq(attempt.id, auditId));
      phase = "grounding";
      assertGroundedResponse(result, saved.itinerary);
      const [validating] = await db
        .update(turn)
        .set({ status: "validating", updatedAt: now() })
        .where(
          and(
            eq(turn.id, turnId),
            eq(turn.leaseToken, lease),
            eq(turn.status, "generating"),
          ),
        )
        .returning();
      if (!validating)
        throw new RequestError(
          409,
          "This response was interrupted; a late result was not published.",
        );
      phase = "proposal";
      const id = randomUUID(),
        assignedIds = result.proposal?.actions.map(() => randomUUID()) ?? [];
      const proposed = result.proposal
        ? await previewActions(
            userId,
            tripId,
            id,
            result.proposal.actions,
            assignedIds,
          )
        : null;
      const errors =
        proposed?.preview.assessment.errors.map((e) => e.message) ?? [];
      await db.transaction(async (tx) => {
        const [owned] = await tx
          .update(turn)
          .set({
            status: "ready",
            response: result,
            error: null,
            errorStage: null,
            leaseToken: null,
            updatedAt: now(),
          })
          .where(
            and(
              eq(turn.id, turnId),
              eq(turn.userId, userId),
              eq(turn.leaseToken, lease),
              eq(turn.status, "validating"),
            ),
          )
          .returning();
        if (!owned)
          throw new RequestError(
            409,
            "This response was interrupted; a late result was not published.",
          );
        if (proposed && result.proposal) {
          await tx.insert(proposal).values({
            id,
            tripId,
            userId,
            turnId,
            baseVersion: proposed.request.version,
            status: proposed.preview.canSave ? "pending" : "invalid",
            summary: result.proposal.summary,
            actions: result.proposal.actions,
            assignedIds,
            request: proposed.request,
            preview: proposed.preview,
          });
          await tx.insert(proposalEvent).values({
            proposalId: id,
            tripId,
            userId,
            revision: 1,
            event: "proposed",
            data: {
              baseVersion: proposed.request.version,
              preview: proposed.preview,
            },
          });
        }
        await tx
          .update(attempt)
          .set({
            status: errors.length ? "proposal-conflicts" : "completed",
            validation: {
              stage: errors.length ? "proposal-conflicts" : "passed",
              errors,
              contextBytes: context.bytes,
              contextVersion: saved.version,
              contextTurns: context.historyTurns,
            },
            updatedAt: now(),
          })
          .where(eq(attempt.id, auditId!));
        await tx
          .update(conversation)
          .set({ activeTurnId: null, updatedAt: now() })
          .where(
            and(
              eq(conversation.tripId, tripId),
              eq(conversation.userId, userId),
              eq(conversation.activeTurnId, turnId),
            ),
          );
      });
    } catch (cause) {
      const message =
        cause instanceof GenerationQuotaError
          ? "TravelRelay's shared AI capacity or quota is unavailable. Your message is saved; explicitly retry later."
          : cause instanceof RequestError || cause instanceof ModelFailure
            ? cause.message
            : cause instanceof z.ZodError
              ? "The AI response did not match the strict assistant schema. Nothing was changed; retry only when ready."
              : "The AI response could not be completed. Your message and trip are saved; check the status before explicitly retrying.";
      if (cause instanceof ModelFailure && cause.stage === "schema")
        phase = "schema";
      await db.transaction(async (tx) => {
        const [owned] = await tx
          .update(turn)
          .set({
            status: "failed",
            error: message,
            errorStage: phase,
            leaseToken: null,
            updatedAt: now(),
          })
          .where(
            and(
              eq(turn.id, turnId),
              eq(turn.userId, userId),
              eq(turn.leaseToken, lease),
              inArray(turn.status, active),
            ),
          )
          .returning();
        if (auditId)
          await tx
            .update(attempt)
            .set({
              status: owned ? "failed" : "superseded",
              validation: { stage: phase, errors: [message] },
              latencyMs: Math.min(
                2_147_483_647,
                Math.max(0, clock() - providerStarted),
              ),
              updatedAt: now(),
            })
            .where(eq(attempt.id, auditId));
        if (owned)
          await tx
            .update(conversation)
            .set({ activeTurnId: null, updatedAt: now() })
            .where(
              and(
                eq(conversation.tripId, tripId),
                eq(conversation.userId, userId),
                eq(conversation.activeTurnId, turnId),
              ),
            );
      });
    } finally {
      await release?.();
    }
  }
  async function action(userId: string, tripId: string, input: unknown) {
    await editor.read(userId, tripId);
    const request = agentRequestSchema.parse(input);
    await ensure(userId, tripId);
    await recover(userId, tripId);
    let queuedTurnId: string | undefined,
      itineraryChanged = false;
    if (request.action === "draft") {
      const [updated] = await db
        .update(conversation)
        .set({
          draft: request.text,
          draftVersion: request.version + 1,
          updatedAt: now(),
        })
        .where(
          and(
            eq(conversation.tripId, tripId),
            eq(conversation.userId, userId),
            eq(conversation.draftVersion, request.version),
          ),
        )
        .returning();
      if (!updated)
        throw new RequestError(
          409,
          "Your message draft changed in another tab. Review the saved draft before overwriting it.",
        );
    } else if (request.action === "send") {
      const [old] = await db
        .select()
        .from(turn)
        .where(
          and(
            eq(turn.tripId, tripId),
            eq(turn.userId, userId),
            eq(turn.mutationId, request.mutationId),
          ),
        );
      if (old) {
        if (old.text !== request.text)
          throw new RequestError(
            409,
            "This message identifier was already used for different text.",
          );
        if (old.status === "queued") queuedTurnId = old.id;
      } else {
        const id = randomUUID();
        await db.transaction(async (tx) => {
          const [reserved] = await tx
            .update(conversation)
            .set({
              activeTurnId: id,
              turnCount: sql`${conversation.turnCount}+1`,
              draft: "",
              draftVersion: sql`${conversation.draftVersion}+1`,
              updatedAt: now(),
            })
            .where(
              and(
                eq(conversation.tripId, tripId),
                eq(conversation.userId, userId),
                isNull(conversation.activeTurnId),
                eq(conversation.draftVersion, request.draftVersion),
                lt(conversation.turnCount, 200),
              ),
            )
            .returning();
          if (!reserved)
            throw new RequestError(
              409,
              "Another response is active, the message draft changed, or this trip reached its 200-message limit. Reload the saved conversation before retrying.",
            );
          await tx.insert(turn).values({
            id,
            tripId,
            userId,
            ordinal: reserved.turnCount,
            mutationId: request.mutationId,
            text: request.text,
          });
        });
        queuedTurnId = id;
      }
    } else if (request.action === "retry") {
      const [record] = await db
        .select()
        .from(turn)
        .where(
          and(
            eq(turn.id, request.turnId),
            eq(turn.tripId, tripId),
            eq(turn.userId, userId),
          ),
        );
      if (!record) throw new RequestError(404, "Message not found.");
      if (
        !["failed", "interrupted"].includes(record.status) ||
        record.attempts >= 3
      )
        throw new RequestError(
          409,
          "Only a failed/interrupted response below three admitted attempts can be explicitly retried.",
        );
      await db.transaction(async (tx) => {
        const [reserved] = await tx
          .update(conversation)
          .set({ activeTurnId: record.id, updatedAt: now() })
          .where(
            and(
              eq(conversation.tripId, tripId),
              eq(conversation.userId, userId),
              isNull(conversation.activeTurnId),
            ),
          )
          .returning();
        if (!reserved)
          throw new RequestError(
            409,
            "Wait for the active response before retrying.",
          );
        const [retried] = await tx
          .update(turn)
          .set({
            status: "queued",
            error: null,
            errorStage: null,
            leaseToken: null,
            updatedAt: now(),
          })
          .where(
            and(
              eq(turn.id, record.id),
              eq(turn.userId, userId),
              inArray(turn.status, ["failed", "interrupted"]),
              lt(turn.attempts, 3),
            ),
          )
          .returning();
        if (!retried)
          throw new RequestError(
            409,
            "This response changed before retrying. Reload its saved status.",
          );
      });
      queuedTurnId = record.id;
    } else {
      const [p] = await db
        .select()
        .from(proposal)
        .where(
          and(
            eq(proposal.id, request.proposalId),
            eq(proposal.tripId, tripId),
            eq(proposal.userId, userId),
          ),
        );
      if (!p) throw new RequestError(404, "Proposal not found.");
      if (request.action === "approve" && p.status === "approved")
        return { state: await read(userId, tripId), itineraryChanged: false };
      if (p.revision !== request.revision)
        throw new RequestError(
          409,
          "This proposal preview changed. Review its latest revision before acting.",
        );
      if (!["pending", "invalid", "stale"].includes(p.status))
        throw new RequestError(
          409,
          "This proposal is closed. Its approval cannot be replayed.",
        );
      if (request.action === "approve") {
        const current = await editor.read(userId, tripId);
        if (current.version !== p.baseVersion) {
          await db
            .update(proposal)
            .set({ status: "stale", updatedAt: now() })
            .where(
              and(
                eq(proposal.id, p.id),
                eq(proposal.revision, p.revision),
                eq(proposal.status, p.status),
              ),
            );
          throw new RequestError(
            409,
            "The itinerary changed after this preview. Refresh and review the proposal against the saved version before approving.",
          );
        }
        if (!p.preview.canSave || p.status !== "pending")
          throw new RequestError(
            422,
            "This proposal has unresolved validation conflicts and cannot be approved.",
          );
        await editor.commit(
          userId,
          tripId,
          {
            ...p.request,
            acknowledgeOverBudget: request.acknowledgeOverBudget,
          },
          {
            source: "ai-proposal",
            proposalId: p.id,
            onRecorded: async (tx, editId) => {
              const [approved] = await tx
                .update(proposal)
                .set({
                  status: "approved",
                  appliedEditId: editId,
                  appliedVersion: p.baseVersion + 1,
                  updatedAt: now(),
                })
                .where(
                  and(
                    eq(proposal.id, p.id),
                    eq(proposal.userId, userId),
                    eq(proposal.tripId, tripId),
                    eq(proposal.revision, p.revision),
                    eq(proposal.status, "pending"),
                    eq(proposal.baseVersion, p.baseVersion),
                  ),
                )
                .returning();
              if (!approved)
                throw new RequestError(
                  409,
                  "This proposal changed before approval. Nothing was committed; review its saved status.",
                );
              await tx.insert(proposalEvent).values({
                proposalId: p.id,
                tripId,
                userId,
                revision: p.revision,
                event: "approved",
                data: { baseVersion: p.baseVersion, editId },
              });
            },
          },
        );
        itineraryChanged = true;
      } else if (request.action === "refresh_preview") {
        if (p.revision >= 50)
          throw new RequestError(
            409,
            "This proposal reached its preview revision limit. Request a new suggestion.",
          );
        const refreshed = await previewActions(
          userId,
          tripId,
          p.id,
          p.actions,
          p.assignedIds,
        );
        await db.transaction(async (tx) => {
          const [updated] = await tx
            .update(proposal)
            .set({
              request: refreshed.request,
              preview: refreshed.preview,
              baseVersion: refreshed.request.version,
              revision: p.revision + 1,
              status: refreshed.preview.canSave ? "pending" : "invalid",
              updatedAt: now(),
            })
            .where(
              and(
                eq(proposal.id, p.id),
                eq(proposal.userId, userId),
                eq(proposal.revision, p.revision),
                eq(proposal.status, p.status),
              ),
            )
            .returning();
          if (!updated)
            throw new RequestError(
              409,
              "The proposal changed while refreshing. Review its saved preview.",
            );
          await tx.insert(proposalEvent).values({
            proposalId: p.id,
            tripId,
            userId,
            revision: p.revision + 1,
            event: "preview-refreshed",
            data: {
              baseVersion: refreshed.request.version,
              preview: refreshed.preview,
            },
          });
        });
      } else {
        await db.transaction(async (tx) => {
          const status =
            request.action === "reject" ? "rejected" : "changes-requested";
          const [updated] = await tx
            .update(proposal)
            .set({ status, updatedAt: now() })
            .where(
              and(
                eq(proposal.id, p.id),
                eq(proposal.userId, userId),
                eq(proposal.revision, p.revision),
                eq(proposal.status, p.status),
              ),
            )
            .returning();
          if (!updated)
            throw new RequestError(
              409,
              "The proposal changed before this action. Review its saved status.",
            );
          await tx.insert(proposalEvent).values({
            proposalId: p.id,
            tripId,
            userId,
            revision: p.revision,
            event: status,
            data: { baseVersion: p.baseVersion },
          });
        });
      }
    }
    return {
      state: await read(userId, tripId),
      queuedTurnId,
      itineraryChanged,
    };
  }
  return { read, action, run };
}
export type AssistantState = Awaited<
  ReturnType<ReturnType<typeof createTravelAgent>["read"]>
>;

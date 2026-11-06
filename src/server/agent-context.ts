import { budgetMinor, type Itinerary } from "../lib/itinerary";
import {
  materializeActivities,
  editableActivitySchema,
  type EditRequest,
} from "../lib/itinerary-editing";
import { calculatePlanningBudget } from "../lib/itinerary-budget";
import type { TripIntent } from "../lib/trip-intent";
import type { AgentAction, AgentResponse } from "../lib/agent-contracts";
import type { createItineraryEditor } from "./itinerary-edits";
import { RequestError } from "./trips";
import { normalized } from "../lib/activity-semantics";

type EditorState = Awaited<
  ReturnType<ReturnType<typeof createItineraryEditor>["read"]>
>;
type HistoryItem = {
  text: string;
  response: AgentResponse | null;
  status: string;
  contextVersion: number | null;
  proposalStatus?: string | null;
};
export const AGENT_CONTEXT_BYTES = 96_000;
export function planningBudget(plan: Itinerary, intent: TripIntent) {
  return (
    plan.budget ??
    calculatePlanningBudget(plan, intent, budgetMinor(intent)).budget
  );
}
export function buildAgentContext(
  state: EditorState,
  text: string,
  history: HistoryItem[],
  recovery?: object,
) {
  const plan = materializeActivities(state.itinerary);
  const input = {
    schemaVersion: 1,
    request: text,
    trip: {
      base: plan.base,
      version: state.version,
      travelers: state.intent.travelers,
      preferences: {
        pace: state.intent.pace,
        interests: state.intent.selected,
        style: state.intent.style,
        mustSee: state.intent.mustSee,
        avoids: state.intent.avoids,
        dietary: state.intent.dietary,
        accessibility: state.intent.accessibility,
      },
      budget: planningBudget(plan, state.intent),
      days: plan.days.map((d) => ({
        id: d.id,
        date: d.date,
        title: d.title,
        activities: d.activities.map((a) => ({
          id: a.id,
          title: a.title,
          description: a.description.slice(0, 180),
          category: a.category,
          location: a.location,
          latitude: a.latitude,
          longitude: a.longitude,
          coordinateSource: a.coordinateSource,
          startMinute: a.startMinute,
          endMinute: a.startMinute + a.durationMinutes,
          durationMinutes: a.durationMinutes,
          bufferBeforeMinutes: a.bufferBeforeMinutes,
          costMinor: a.costMinor,
          currency: plan.currency,
          estimateSource: a.estimateSource,
        })),
      })),
      venueReferences: state.assessment.references ?? [],
      existingScheduleFindings: state.assessment,
    },
    history: history.slice(-8).map((t) => ({
      user: t.text,
      assistant: t.response?.answer.slice(0, 1600) ?? null,
      status: t.status,
      basedOnVersion: t.contextVersion,
      proposalStatus: t.proposalStatus ?? null,
      previousProposal: t.response?.proposal ?? null,
    })),
    ...(recovery && { recovery }),
    uncertainty:
      "Only explicitly supplied financial facts are known to the assistant. Costs, coordinates, travel times, arrival/departure windows and unsourced hours are estimates. Published references are dated snapshots, not future availability guarantees. Saved proposals/history are not proof that an action was applied; current saved trip data is authoritative.",
    omitted: {
      activityDescriptionsTruncated: true,
      olderConversationTurns: Math.max(0, history.length - 8),
      descriptionTextRemoved: false,
    },
  };
  // Preserve every ID, time, cost and location. Only optional prose/history may
  // be shortened; fail before a provider call if essential context is too large.
  const size = () => Buffer.byteLength(JSON.stringify(input), "utf8");
  if (size() > AGENT_CONTEXT_BYTES) {
    for (const d of input.trip.days)
      for (const a of d.activities) a.description = "";
    input.omitted.descriptionTextRemoved = true;
  }
  while (size() > AGENT_CONTEXT_BYTES && input.history.length) {
    input.history.shift();
    input.omitted.olderConversationTurns++;
  }
  if (size() > AGENT_CONTEXT_BYTES)
    throw new RequestError(
      422,
      "This itinerary is too large for the bounded assistant context. Use the manual editor or simplify the plan; no model request was made.",
    );
  return { input, bytes: size(), historyTurns: input.history.length };
}

// Translate typed intentions to the SAME editor operations used manually.
// Add IDs are server assigned once and reused on refresh; existing IDs stay stable.
export function agentOperations(
  plan: Itinerary,
  actions: AgentAction[],
  assignedIds: string[],
): Extract<EditRequest["operation"], { action: "batch" }> {
  const saved = materializeActivities(plan),
    seen = new Set<string>();
  const operations = actions.map((action, index) => {
    const a = action;
    const existing = saved.days
      .flatMap((d) => d.activities)
      .find((item) => item.id === a.activityId);
    const originalDay = saved.days.find((d) =>
      d.activities.some((item) => item.id === a.activityId),
    );
    if (a.type !== "add_activity" && !existing)
      throw new RequestError(
        422,
        "A proposed activity ID does not belong to this saved itinerary. Request a revised suggestion.",
      );
    if (a.activityId) {
      if (seen.has(a.activityId))
        throw new RequestError(
          422,
          "Combine changes to the same activity in one explicit action.",
        );
      seen.add(a.activityId);
    }
    if (a.currency !== null && a.currency !== plan.currency)
      throw new RequestError(
        422,
        "The assistant cannot change the trip currency or convert estimates.",
      );
    if (a.city !== null && normalized(a.city) !== normalized(plan.base.city))
      throw new RequestError(
        422,
        "The proposal must preserve the confirmed single base city.",
      );
    const changed = Object.entries(a)
      .filter(
        ([key, value]) =>
          !["type", "activityId"].includes(key) && value !== null,
      )
      .map(([key]) => key);
    if (a.type === "remove_activity") {
      if (changed.length)
        throw new RequestError(
          422,
          "A removal must not contain hidden activity changes.",
        );
      return { action: "delete" as const, activityId: existing!.id };
    }
    if (
      a.type === "move_activity" &&
      (!changed.length ||
        changed.some((k) => !["dayId", "startMinute"].includes(k)))
    )
      throw new RequestError(
        422,
        "A move may change only its day and start time.",
      );
    if (
      a.type === "resize_activity" &&
      (changed.length !== 1 || changed[0] !== "durationMinutes")
    )
      throw new RequestError(
        422,
        "A resize must change only the explicit duration.",
      );
    if (
      (a.type === "update_activity" || a.type === "replace_activity") &&
      !changed.length
    )
      throw new RequestError(422, "The proposal contains no activity change.");
    if (a.type === "add_activity" && a.activityId !== null)
      throw new RequestError(
        422,
        "New activity IDs must be assigned by the server.",
      );
    const full = a.type === "add_activity" || a.type === "replace_activity";
    if (
      full &&
      [
        a.dayId,
        a.title,
        a.description,
        a.category,
        a.location,
        a.city,
        a.startMinute,
        a.durationMinutes,
        a.bufferBeforeMinutes,
        a.costMinor,
        a.currency,
      ].some((v) => v === null)
    )
      throw new RequestError(
        422,
        "An addition or replacement needs complete activity details, date, time and cost estimate.",
      );
    if (a.location !== null && a.city === null)
      throw new RequestError(
        422,
        "A location change must explicitly preserve the base city.",
      );
    const dayId = a.dayId ?? originalDay!.id;
    if (!saved.days.some((d) => d.id === dayId))
      throw new RequestError(422, "The proposed day is outside this trip.");
    const locationChanged =
      !existing || (a.location !== null && a.location !== existing.location);
    const data = editableActivitySchema.parse({
      title: a.title ?? existing!.title,
      description: a.description ?? existing!.description,
      category: a.category ?? existing!.category!,
      location: a.location ?? existing!.location,
      latitude: locationChanged ? null : existing!.latitude,
      longitude: locationChanged ? null : existing!.longitude,
      startMinute: a.startMinute ?? existing!.startMinute,
      durationMinutes: a.durationMinutes ?? existing!.durationMinutes,
      bufferBeforeMinutes:
        a.bufferBeforeMinutes ?? existing!.bufferBeforeMinutes,
      costMinor: a.costMinor ?? existing!.costMinor,
      currency: plan.currency,
      links: existing?.links ?? [],
    });
    return existing
      ? {
          action: "update" as const,
          activityId: existing.id,
          dayId,
          data,
        }
      : {
          action: "add" as const,
          activityId: assignedIds[index],
          dayId,
          data,
        };
  });
  return { action: "batch", operations };
}
export function assertGroundedResponse(
  response: AgentResponse,
  plan: Itinerary,
) {
  const ids = new Set(plan.days.flatMap((d) => d.activities.map((a) => a.id)));
  if (response.activityIds.some((id) => !ids.has(id)))
    throw new RequestError(
      422,
      "The answer referenced an activity outside this saved itinerary.",
    );
  // Model text is never an execution receipt. Reject clear first-person success
  // claims rather than showing them beside a still-unapproved proposal.
  if (
    /\b(?:I|we|TravelRelay)\s+(?:(?:have|has|successfully)\s+)*(?:booked|charged|refunded|paid|purchased|applied|saved|rescheduled|updated|deleted)\b/i.test(
      response.answer,
    )
  )
    throw new RequestError(
      422,
      "The assistant claimed an action had already succeeded. Nothing was applied; request a revised response.",
    );
}

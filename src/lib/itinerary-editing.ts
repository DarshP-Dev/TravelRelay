import { z } from "zod";
import {
  activityCategories,
  safeReferenceSchema,
  type ActivityCategory,
} from "./activity-metadata";
import {
  budgetMinor,
  distanceKm,
  type Itinerary,
  type SavedActivity,
} from "./itinerary";
import { calculatePlanningBudget } from "./itinerary-budget";
import { expenseCategory, normalized } from "./activity-semantics";
import {
  dayPolicies,
  estimatedTravelBuffer,
  type VenueReference,
} from "./itinerary-quality";
import { isTransitDay } from "./travel-days";
import { activityContext } from "./venue-classification";
import type { TripIntent } from "./trip-intent";

export const editableActivitySchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(1200),
    category: z.enum(activityCategories),
    location: z.string().trim().min(1).max(200),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    startMinute: z.number().int().min(0).max(1439),
    durationMinutes: z.number().int().min(15).max(480),
    bufferBeforeMinutes: z.number().int().min(15).max(240),
    costMinor: z.number().int().min(0).max(1_000_000_000_000),
    currency: z.enum(["CAD", "USD", "EUR", "GBP", "JPY", "AUD"]),
    links: z.array(safeReferenceSchema).max(5),
  })
  .strict()
  .refine(
    (a) => (a.latitude === null) === (a.longitude === null),
    "Supply both coordinates, or leave both blank.",
  );
const identity = { activityId: z.uuid() };
export const activityOperationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("add"),
      ...identity,
      dayId: z.uuid(),
      data: editableActivitySchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      ...identity,
      dayId: z.uuid(),
      data: editableActivitySchema,
    })
    .strict(),
  z.object({ action: z.literal("delete"), ...identity }).strict(),
  z
    .object({
      action: z.literal("reorder"),
      ...identity,
      direction: z.enum(["earlier", "later"]),
    })
    .strict(),
]);
export const editOperationSchema = z.discriminatedUnion("action", [
  ...activityOperationSchema.options,
  z
    .object({
      action: z.literal("batch"),
      operations: z.array(activityOperationSchema).min(1).max(12),
    })
    .strict(),
  z.object({ action: z.literal("restore"), editId: z.uuid() }).strict(),
]);
export const editRequestSchema = z
  .object({
    version: z.number().int().min(0),
    mutationId: z.uuid(),
    operation: editOperationSchema,
    acknowledgeOverBudget: z.boolean().optional(),
  })
  .strict();
export type EditRequest = z.infer<typeof editRequestSchema>;
export type EditableActivity = z.infer<typeof editableActivitySchema>;
export type EditIssue = {
  code: string;
  message: string;
  activityId?: string;
  dayId?: string;
};
export type ScheduleReference = {
  activityId: string;
  name: string;
  sourceUrl: string;
  checkedOn: string;
  openMinute?: number;
  closeMinute?: number;
  lastAdmissionMinute?: number;
};
export type ScheduleAssessment = {
  errors: EditIssue[];
  warnings: EditIssue[];
  references?: ScheduleReference[];
};
export function categoryFor(
  activity: SavedActivity,
  plan?: Itinerary,
  dayIndex = 0,
  activityIndex = 0,
): ActivityCategory {
  if (activity.category) return activity.category;
  const cat =
    plan?.budget?.expenses.find(
      (e) =>
        e.activityId === activity.id ||
        (e.dayIndex === dayIndex && e.activityIndex === activityIndex),
    )?.category ?? expenseCategory(activity);
  return cat === "food"
    ? "food"
    : cat === "localTransport"
      ? "transport"
      : "culture";
}
export function hasCoordinates(a: {
  latitude: number | null;
  longitude: number | null;
}): a is { latitude: number; longitude: number } {
  return (
    a.latitude !== null &&
    a.longitude !== null &&
    Number.isFinite(a.latitude) &&
    Number.isFinite(a.longitude)
  );
}
export function requiredTravel(
  previous: SavedActivity,
  current: SavedActivity,
  intent: TripIntent,
) {
  return hasCoordinates(previous) && hasCoordinates(current)
    ? estimatedTravelBuffer(
        {
          ...previous,
          latitude: previous.latitude,
          longitude: previous.longitude,
        },
        {
          ...current,
          latitude: current.latitude,
          longitude: current.longitude,
        },
        intent,
      )
    : 15 + (intent.accessibility ? 10 : 0);
}
export function materializeActivities(original: Itinerary): Itinerary {
  const copy = structuredClone(original);
  copy.days.forEach((day, di) =>
    day.activities.forEach((a, ai) => {
      a.category = categoryFor(a, original, di, ai);
      a.links ??= [];
      a.origin ??= "ai";
      a.estimateSource ??= "ai-estimate";
      a.coordinateSource ??= hasCoordinates(a) ? "ai-estimate" : "missing";
    }),
  );
  return copy;
}
export function applyActivityOperation(
  original: Itinerary,
  intent: TripIntent,
  operation: Exclude<EditRequest["operation"], { action: "restore" }>,
): Itinerary {
  if (operation.action === "batch") {
    return operation.operations.reduce(
      (plan, item) => applyActivityOperation(plan, intent, item),
      original,
    );
  }
  const plan = materializeActivities(original);
  const day = plan.days.find((d) =>
    d.activities.some((a) => a.id === operation.activityId),
  );
  const activity = day?.activities.find((a) => a.id === operation.activityId);
  if (operation.action !== "add" && !activity)
    throw Error("Activity not found in this itinerary.");
  if (operation.action === "add" || operation.action === "update") {
    const target = plan.days.find((d) => d.id === operation.dayId);
    if (!target) throw Error("Choose a day within this trip.");
    if (operation.action === "add" && activity)
      throw Error("This activity identifier already exists.");
    if (operation.data.currency !== plan.currency)
      throw Error(
        "Keep estimates in the trip currency. No currency conversion is available.",
      );
    const { currency: _currency, ...data } = operation.data;
    if (_currency !== intent.currency)
      throw Error("Trip currency does not match.");
    if (activity)
      day!.activities = day!.activities.filter((a) => a.id !== activity.id);
    target.activities.push({
      ...activity,
      ...data,
      id: operation.activityId,
      city: plan.base.city,
      origin: activity?.origin ?? "manual",
      estimateSource:
        !activity || activity.costMinor !== data.costMinor
          ? "manual-estimate"
          : activity.estimateSource,
      coordinateSource:
        data.latitude === null
          ? "missing"
          : !activity ||
              activity.latitude !== data.latitude ||
              activity.longitude !== data.longitude
            ? "user-entered"
            : activity.coordinateSource,
    });
  } else if (operation.action === "delete")
    day!.activities = day!.activities.filter(
      (a) => a.id !== operation.activityId,
    );
  else {
    const list = [...day!.activities].sort(
      (a, b) => a.startMinute - b.startMinute,
    );
    const index = list.findIndex((a) => a.id === operation.activityId),
      next = index + (operation.direction === "earlier" ? -1 : 1);
    if (next < 0 || next >= list.length)
      throw Error("This activity cannot move further in that direction.");
    const firstStart = list[0].startMinute;
    [list[index], list[next]] = [list[next], list[index]];
    list.forEach((a, i) => {
      if (!i) a.startMinute = firstStart;
      else {
        a.bufferBeforeMinutes = Math.max(
          a.bufferBeforeMinutes,
          requiredTravel(list[i - 1], a, intent),
        );
        a.startMinute =
          list[i - 1].startMinute +
          list[i - 1].durationMinutes +
          a.bufferBeforeMinutes;
      }
    });
    day!.activities = list;
  }
  plan.days.forEach((d) =>
    d.activities.sort(
      (a, b) => a.startMinute - b.startMinute || a.id.localeCompare(b.id),
    ),
  );
  return plan;
}
export function recomputeEditedBudget(
  plan: Itinerary,
  previous: Itinerary,
  intent: TripIntent,
) {
  // Keep existing unitemized allowances explicit; changed itemized costs change
  // the inclusive allocation exactly once. Reserve is never spent by an edit.
  const baseline =
    previous.budget ??
    calculatePlanningBudget(previous, intent, budgetMinor(intent)).budget;
  const sum = (category: ActivityCategory) =>
    plan.days
      .flatMap((d) => d.activities)
      .filter((a) => a.category === category)
      .reduce((s, a) => s + a.costMinor, 0);
  const allowance = (category: string) =>
    baseline.allocations.find((a) => a.category === category)
      ?.unitemizedAllowanceMinor ?? 0;
  plan.foodMinor = sum("food") + allowance("food");
  plan.localTransportMinor = sum("transport") + allowance("localTransport");
  const { budget, issues } = calculatePlanningBudget(
    plan,
    intent,
    budgetMinor(intent),
    (di, ai) =>
      plan.days[di].activities[ai].category === "food"
        ? "food"
        : plan.days[di].activities[ai].category === "transport"
          ? "localTransport"
          : "activities",
  );
  if (issues.length) throw Error(issues.join(" "));
  budget.expenses = budget.expenses.map((e) => {
    const d = plan.days[e.dayIndex],
      a = d.activities[e.activityIndex];
    return {
      ...e,
      dayId: d.id,
      activityId: a.id,
      source: a.estimateSource ?? "ai-estimate",
    };
  });
  plan.budget = budget;
  plan.totalMinor = budget.totalWithReserveMinor;
  plan.reserveMinor = budget.reserveMinor;
  return budget;
}
export function assessManualSchedule(
  plan: Itinerary,
  intent: TripIntent,
  references: VenueReference[],
): ScheduleAssessment {
  const errors: EditIssue[] = [],
    warnings: EditIssue[] = [];
  const publishedReferences: ScheduleReference[] = [];
  const policies = dayPolicies(intent, plan.base),
    seen = new Set<string>(),
    visitedReferences = new Set<string>();
  const add = (
    target: EditIssue[],
    code: string,
    message: string,
    activity?: SavedActivity,
    dayId?: string,
  ) =>
    target.push({
      code,
      message,
      ...(activity ? { activityId: activity.id } : {}),
      ...(dayId ? { dayId } : {}),
    });
  if (plan.days.flatMap((d) => d.activities).length > 200)
    add(errors, "resource-limit", "Keep the trip to at most 200 activities.");
  for (const [di, day] of plan.days.entries()) {
    const policy = policies[di];
    if (isTransitDay(policy.role)) {
      if (day.activities.length)
        add(
          errors,
          "transit-activity",
          `Day ${di + 1} is reserved for transit and cannot contain destination activities.`,
          undefined,
          day.id,
        );
      continue;
    }
    if (day.activities.length > 30)
      add(
        errors,
        "day-limit",
        "Keep each day to at most 30 activities.",
        undefined,
        day.id,
      );
    if (
      day.activities.length < policy.minActivities ||
      day.activities.length > policy.maxActivities
    )
      add(
        warnings,
        "pace",
        `Day ${di + 1} differs from the ${intent.pace} pace guideline.`,
        undefined,
        day.id,
      );
    for (const [ai, a] of day.activities.entries()) {
      if (seen.has(a.id))
        add(
          errors,
          "duplicate-id",
          "Activity identifiers must remain unique.",
          a,
        );
      seen.add(a.id);
      const end = a.startMinute + a.durationMinutes;
      if (end > 1440 || a.startMinute < a.bufferBeforeMinutes)
        add(
          errors,
          "day-boundary",
          `${a.title} extends outside its calendar day or arrival buffer.`,
          a,
        );
      if (policy.role === "arrival" && ai === 0 && a.bufferBeforeMinutes < 30)
        add(
          errors,
          "arrival-buffer",
          "Allow at least 30 minutes of arrival/settling buffer.",
          a,
        );
      if (a.startMinute < policy.startMinute || end > policy.endMinute)
        add(
          warnings,
          "travel-assumption",
          `${a.title} differs from the original travel-day planning window. Check your actual travel arrangements.`,
          a,
        );
      if (hasCoordinates(a)) {
        if (distanceKm(plan.base, a) > 50)
          add(
            errors,
            "geography",
            `${a.title} is outside the 50 km single-base-city boundary.`,
            a,
          );
      } else
        add(
          warnings,
          "missing-coordinates",
          `${a.title} has no coordinates; geographic transfer time cannot be checked. The minimum buffer still applies.`,
          a,
        );
      const previous = day.activities[ai - 1];
      if (previous) {
        const required = requiredTravel(previous, a, intent),
          gap = a.startMinute - previous.startMinute - previous.durationMinutes;
        if (gap < 0)
          add(errors, "overlap", `${a.title} overlaps ${previous.title}.`, a);
        if (
          a.bufferBeforeMinutes < required ||
          gap < Math.max(required, a.bufferBeforeMinutes)
        )
          add(
            errors,
            "travel-buffer",
            `${a.title} needs at least ${required} minutes travel/arrival buffer (${gap} minutes available; ${a.bufferBeforeMinutes} declared).`,
            a,
          );
      }
      const context = activityContext(a),
        title = context.title;
      const ref = references.find(
        (r) =>
          normalized(r.city) === normalized(plan.base.city) &&
          r.aliases.some((alias) => {
            const name = normalized(alias);
            return (
              context.identity.startsWith(name) ||
              (title.includes(name) &&
                !/\b(exterior|outside|near|around)\b/.test(title))
            );
          }),
      );
      if (ref) {
        if (visitedReferences.has(ref.id))
          add(
            warnings,
            "duplicate-venue",
            `${ref.name} appears more than once. Check that the repeat visit is intentional.`,
            a,
          );
        visitedReferences.add(ref.id);
        const hours = ref.weekly[new Date(`${day.date}T12:00:00Z`).getUTCDay()];
        publishedReferences.push({
          activityId: a.id,
          name: ref.name,
          sourceUrl: ref.sourceUrl,
          checkedOn: ref.checkedOn,
          ...(hours
            ? {
                openMinute: hours.open,
                closeMinute: hours.close,
                lastAdmissionMinute: hours.lastAdmission,
              }
            : {}),
        });
        if (
          !hours ||
          ref.closedDates.includes(day.date.slice(5)) ||
          a.startMinute < hours.open ||
          end > hours.close ||
          a.startMinute > hours.lastAdmission
        )
          add(
            errors,
            "published-hours",
            `${ref.name} conflicts with its dated published hours (${ref.checkedOn}).`,
            a,
          );
        if (hasCoordinates(a) && distanceKm(ref, a) > 1)
          add(
            errors,
            "venue-location",
            `${ref.name}'s coordinates conflict with the stored venue reference.`,
            a,
          );
      } else if (
        (a.category === "shopping" ||
          (/\b(museum|musee|temple|shrine|palace|gallery|cathedral|castle)\b/.test(
            `${title} ${context.identity}`,
          ) &&
            !/\b(walk|stroll|exterior|outside)\b/.test(title) &&
            (a.category !== "food" ||
              /\b(visit|inside|admission)\b/.test(title)))) &&
        (a.startMinute < 600 || end > 1020)
      )
        add(
          errors,
          "unverified-venue-window",
          `${a.title} has no source-checked hours; keep an indoor visit within 10:00–17:00.`,
          a,
        );
      if (a.durationMinutes < 30)
        add(
          warnings,
          "duration",
          `${a.title} is shorter than the original experience-duration guideline.`,
          a,
        );
      if (
        (/\blunch\b/.test(title) &&
          (a.startMinute < 690 || a.startMinute > 870)) ||
        (/\b(dinner|supper)\b/.test(title) &&
          (a.startMinute < 1080 || a.startMinute > 1260))
      )
        add(
          warnings,
          "meal-time",
          `${a.title} starts outside the original meal guideline (lunch 11:30–14:30, dinner 18:00–21:00). Confirm meal service or adjust the time.`,
          a,
        );
    }
    if (!day.activities.some((a) => a.category === "food"))
      add(
        warnings,
        "meals",
        `Day ${di + 1} has no itemized food stop. Leave room for substantial meals.`,
        undefined,
        day.id,
      );
  }
  if ((plan.budget?.remainingMinor ?? 0) < 0)
    add(
      warnings,
      "over-budget",
      `This edit exceeds the selected budget including the protected reserve. Explicit acknowledgement is required.`,
    );
  return { errors, warnings, references: publishedReferences };
}
export function scheduleChanges(before: Itinerary, after: Itinerary) {
  const rows = (p: Itinerary) =>
    p.days.flatMap((d) =>
      d.activities.map((a) => ({ dayId: d.id, date: d.date, activity: a })),
    );
  const a = rows(before),
    b = rows(after);
  return [...new Set([...a, ...b].map((r) => r.activity.id))].flatMap((id) => {
    const old = a.find((r) => r.activity.id === id),
      next = b.find((r) => r.activity.id === id);
    return JSON.stringify(old) === JSON.stringify(next)
      ? []
      : [{ activityId: id, before: old ?? null, after: next ?? null }];
  });
}

import type { Itinerary } from "./itinerary";
import { categoryFor } from "./itinerary-editing";
import type { ActivityCategory } from "./activity-metadata";
import {
  dayRoleLabels,
  isTransitDay,
  travelDayRole,
  travelWindow,
} from "./travel-days";
// A shared display-only wall-clock axis. Resource rows carry the actual trip
// dates; no browser-timezone conversion is written back to the itinerary.
export const scheduleClock = (minute: number) =>
  new Date(2000, 0, 1, 0, minute);
const categoryColors: Record<ActivityCategory, string> = {
  culture: "#466898",
  food: "#8b6234",
  transport: "#476a77",
  outdoors: "#277452",
  shopping: "#785381",
  entertainment: "#6a5698",
  relaxation: "#42756c",
  other: "#52665e",
};
export function schedulerData(plan: Itinerary) {
  const window = travelWindow(plan.days.length, plan.base.travelTiming);
  return {
    resources: plan.days.map((d, i) => {
      const role = travelDayRole(i, window);
      return {
        id: d.id,
        name: `Day ${i + 1} · ${d.date}${isTransitDay(role) ? ` · ${dayRoleLabels[role]}` : ""}`,
      };
    }),
    events: plan.days.flatMap((d, dayIndex) =>
      d.activities.map((a, index) => ({
        id: a.id,
        resourceId: d.id,
        name: a.title,
        durationUnit: "minute",
        eventColor: categoryColors[categoryFor(a, plan, dayIndex, index)],
        startDate: scheduleClock(a.startMinute),
        endDate: scheduleClock(a.startMinute + a.durationMinutes),
      })),
    ),
  };
}
export function schedulerChange(
  plan: Itinerary,
  activityId: string,
  dayId: string,
  start: Date,
  end: Date,
) {
  const dayIndex = plan.days.findIndex((d) => d.id === dayId);
  if (dayIndex < 0) throw Error("Drop the activity on a day of this trip.");
  if (
    isTransitDay(
      travelDayRole(
        dayIndex,
        travelWindow(plan.days.length, plan.base.travelTiming),
      ),
    )
  )
    throw Error(
      "This day is reserved for transit. Choose a day at the destination.",
    );
  const found = plan.days
    .flatMap((d) => d.activities)
    .find((a) => a.id === activityId);
  if (!found) throw Error("Activity not found.");
  const startMinute = (start.getTime() - scheduleClock(0).getTime()) / 60000;
  const endMinute = (end.getTime() - scheduleClock(0).getTime()) / 60000;
  if (
    !Number.isInteger(startMinute) ||
    !Number.isInteger(endMinute) ||
    startMinute < 0 ||
    endMinute > 1440 ||
    endMinute - startMinute < 15 ||
    endMinute - startMinute > 480
  )
    throw Error(
      "Keep the activity inside one trip day, with a duration of 15–480 minutes.",
    );
  return {
    activityId,
    dayId,
    startMinute,
    durationMinutes: endMinute - startMinute,
  };
}
export function escapeScheduleText(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

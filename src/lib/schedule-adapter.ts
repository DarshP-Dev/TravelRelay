import type { Itinerary } from "./itinerary";
// A shared display-only wall-clock axis. Resource rows carry the actual trip
// dates; no browser-timezone conversion is written back to the itinerary.
export const scheduleClock = (minute: number) =>
  new Date(2000, 0, 1, 0, minute);
export function schedulerData(plan: Itinerary) {
  return {
    resources: plan.days.map((d, i) => ({
      id: d.id,
      name: `Day ${i + 1} · ${d.date}`,
    })),
    events: plan.days.flatMap((d) =>
      d.activities.map((a) => ({
        id: a.id,
        resourceId: d.id,
        name: a.title,
        durationUnit: "minute",
        eventColor: "#197c72",
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
  if (!plan.days.some((d) => d.id === dayId))
    throw Error("Drop the activity on a day of this trip.");
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

import { itineraryOutputSchema, PlanningError } from "./itinerary";
import type { TripIntent } from "./trip-intent";
import { estimatedTravelBuffer } from "./itinerary-quality";

export type BufferCorrection = {
  dayIndex: number;
  activityIndex: number;
  originalMinutes: number;
  correctedMinutes: number;
  availableGapMinutes: number;
  basis: "distance-based-minimum";
};
export type ItineraryNormalization = {
  version: 1;
  corrections: BufferCorrection[];
};

export function normalizeTravelBuffers(input: unknown, intent: TripIntent) {
  // Strict parsing first rejects extra metadata, invalid types/ranges and unsafe
  // costs. Zod clones the input: the recorded provider response stays immutable.
  const plan = itineraryOutputSchema.parse(input);
  const corrections: BufferCorrection[] = [];
  plan.days.forEach((day, dayIndex) =>
    day.activities.forEach((activity, activityIndex) => {
      const previous = day.activities[activityIndex - 1];
      if (!previous) return; // Actual arrival time is unknown; do not invent it.
      const minimum = estimatedTravelBuffer(previous, activity, intent);
      const gap =
        activity.startMinute - previous.startMinute - previous.durationMinutes;
      if (gap < minimum)
        throw new PlanningError(
          `${activity.title} has only ${gap} minutes between activities; at least ${minimum} estimated travel minutes are required. Activity times were not changed.`,
        );
      if (activity.bufferBeforeMinutes < minimum) {
        corrections.push({
          dayIndex,
          activityIndex,
          originalMinutes: activity.bufferBeforeMinutes,
          correctedMinutes: minimum,
          availableGapMinutes: gap,
          basis: "distance-based-minimum",
        });
        activity.bufferBeforeMinutes = minimum;
      }
    }),
  );
  return { plan, normalization: { version: 1 as const, corrections } };
}

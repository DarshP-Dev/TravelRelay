import { z } from "zod";
import { completeIntentSchema, tripDays, type TripIntent } from "./trip-intent";
import type { ItineraryQuality } from "./itinerary-quality";
import type { ItineraryNormalization } from "./itinerary-normalization";
import type { ActivityMetadata } from "./activity-metadata";
import {
  dateAfter,
  insufficientTravelWindow,
  isTransitDay,
  sameDayTravel,
  travelDayRole,
  travelTimingSchema,
  travelWindow,
} from "./travel-days";
import {
  calculatePlanningBudget,
  type PlanningBudget,
} from "./itinerary-budget";

export { tripDays } from "./trip-intent";
export { dateAfter } from "./travel-days";
export class PlanningError extends Error {}

const text = z.string().min(1).max(1200);
const minor = z.number().int().min(0).max(1_000_000_000_000);
export const proposalSchema = z
  .object({
    feasible: z.boolean(),
    explanation: text,
    city: z.string().min(1).max(120),
    country: z.string().min(1).max(120),
    timeZone: z.string().min(1).max(100),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    travelTiming: travelTimingSchema.optional(),
  })
  .strict();
export const structuredProposalSchema = proposalSchema.required({
  travelTiming: true,
});
export type CityProposal = z.infer<typeof proposalSchema>;
export const activitySchema = z
  .object({
    title: z.string().min(1).max(160),
    description: text,
    city: z.string().min(1).max(120),
    location: z.string().min(1).max(200),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    startMinute: z.number().int().min(0).max(1439),
    durationMinutes: z.number().int().min(15).max(480),
    bufferBeforeMinutes: z.number().int().min(15).max(240),
    costMinor: minor,
  })
  .strict();
export const itineraryOutputSchema = z
  .object({
    feasible: z.boolean(),
    explanation: text,
    city: z.string().min(1).max(120),
    currency: z.string().max(3),
    introduction: text,
    flightsMinor: minor,
    accommodationMinor: minor,
    foodMinor: minor,
    localTransportMinor: minor,
    days: z
      .array(
        z
          .object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            title: z.string().min(1).max(160),
            activities: z.array(activitySchema).max(7),
          })
          .strict(),
      )
      .max(14),
  })
  .strict();
export type ModelItinerary = z.infer<typeof itineraryOutputSchema>;
export type SavedActivity = Omit<
  z.infer<typeof activitySchema>,
  "latitude" | "longitude"
> &
  ActivityMetadata & {
    id: string;
    latitude: number | null;
    longitude: number | null;
  };
export type Itinerary = Omit<ModelItinerary, "days"> & {
  schemaVersion: 1 | 2;
  base: CityProposal;
  reserveMinor: number;
  totalMinor: number;
  generatedAt: string;
  model: string;
  priceSource: "ai-estimate" | "mixed-estimate";
  quality?: ItineraryQuality;
  budget?: PlanningBudget;
  normalization?: ItineraryNormalization;
  manualEdit?: { revision: number; updatedAt: string; warnings: string[] };
  days: (Omit<ModelItinerary["days"][number], "activities"> & {
    id: string;
    activities: SavedActivity[];
  })[];
};
export function budgetMinor(intent: TripIntent) {
  const [whole, decimals = ""] = intent.budget.split(".");
  return (
    Number(whole) * (intent.currency === "JPY" ? 1 : 100) +
    (intent.currency === "JPY" ? 0 : Number(decimals.padEnd(2, "0")))
  );
}
export function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(
    amount / (currency === "JPY" ? 1 : 100),
  );
}
export function validateGenerationIntent(input: unknown): TripIntent {
  const intent = completeIntentSchema.parse(input);
  if (tripDays(intent) > 14)
    throw new PlanningError(
      "AI generation currently supports 1–14 days. Your saved intent is preserved; create a shorter trip to generate an itinerary.",
    );
  return intent;
}
export function validateProposal(
  input: unknown,
  intent: TripIntent,
): CityProposal {
  const value = proposalSchema.parse(input);
  if (!value.feasible) throw new PlanningError(value.explanation);
  new Intl.DateTimeFormat("en", { timeZone: value.timeZone }).format();
  const timestamp = Date.parse(value.startDate);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value.startDate
  )
    throw new PlanningError(
      "The suggested travel dates were invalid. Retry destination planning.",
    );
  if (
    intent.flexible
      ? !value.startDate.startsWith(`${intent.month}-`)
      : value.startDate !== intent.start
  )
    throw new PlanningError(
      "The suggested dates do not match your request. Retry destination planning.",
    );
  const timing = value.travelTiming ?? sameDayTravel;
  if (!travelWindow(tripDays(intent), timing).fits)
    throw new PlanningError(insufficientTravelWindow);
  return { ...value, travelTiming: timing };
}
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad,
    dLng = (b.longitude - a.longitude) * rad;
  return (
    6371 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(dLat / 2) ** 2 +
            Math.cos(a.latitude * rad) *
              Math.cos(b.latitude * rad) *
              Math.sin(dLng / 2) ** 2,
        ),
      ),
    )
  );
}
export function validateItinerary(
  input: unknown,
  intent: TripIntent,
  base: CityProposal,
) {
  const plan = itineraryOutputSchema.parse(input);
  if (!plan.feasible) throw new PlanningError(plan.explanation);
  if (
    plan.city !== base.city ||
    plan.currency !== intent.currency ||
    plan.days.length !== tripDays(intent)
  )
    throw new PlanningError(
      "The itinerary did not match the confirmed city, currency or trip length. Please retry.",
    );
  const cap = { relaxed: 3, balanced: 5, packed: 7 }[intent.pace];
  const window = travelWindow(tripDays(intent), base.travelTiming);
  if (!window.fits) throw new PlanningError(insufficientTravelWindow);
  for (const [index, day] of plan.days.entries()) {
    if (
      day.date !== dateAfter(base.startDate, index) ||
      day.activities.length > cap
    )
      throw new PlanningError(
        "The itinerary did not respect your dates or travel pace. Please retry.",
      );
    const inTransit = isTransitDay(travelDayRole(index, window));
    if (inTransit && day.activities.length)
      throw new PlanningError(
        `Day ${index + 1} is reserved for transit and cannot contain destination activities.`,
      );
    if (!inTransit && !day.activities.length)
      throw new PlanningError(
        `Day ${index + 1} needs a destination activity. Only transit days can be empty.`,
      );
    let previous: z.infer<typeof activitySchema> | undefined;
    for (const activity of day.activities) {
      const requiredBuffer = previous
        ? Math.max(
            15,
            Math.ceil((distanceKm(previous, activity) / 20) * 60) + 10,
          )
        : 15;
      if (
        activity.city !== base.city ||
        distanceKm(base, activity) > 50 ||
        activity.bufferBeforeMinutes < requiredBuffer ||
        activity.startMinute + activity.durationMinutes > 1440 ||
        activity.startMinute < activity.bufferBeforeMinutes ||
        (previous &&
          activity.startMinute <
            previous.startMinute +
              previous.durationMinutes +
              activity.bufferBeforeMinutes)
      )
        throw new PlanningError(
          "The itinerary needs safer timing, travel buffers or single-city locations. Please retry.",
        );
      previous = activity;
    }
  }
  const { budget, issues } = calculatePlanningBudget(
    plan,
    intent,
    budgetMinor(intent),
  );
  if (issues.length) throw new PlanningError(issues.join(" "));
  const { reserveMinor, totalWithReserveMinor: totalMinor } = budget;
  if (!Number.isSafeInteger(totalMinor) || totalMinor > budgetMinor(intent))
    throw new PlanningError(
      "These estimates exceed your budget including a 10% spending reserve. Adjust your budget or preferences, or retry. No itinerary was accepted.",
    );
  if (
    plan.foodMinor === 0 ||
    (intent.scope === "entire" &&
      (plan.flightsMinor === 0 ||
        (window.destinationNights > 0 && plan.accommodationMinor === 0)))
  )
    throw new PlanningError(
      "The cost estimate omitted essential food, travel or accommodation. Please retry.",
    );
  return { plan, reserveMinor, totalMinor, budget };
}

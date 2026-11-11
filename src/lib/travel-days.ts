import { z } from "zod";

export const travelTimingSchema = z
  .object({
    outboundTransitDays: z.number().int().min(0).max(13),
    returnTransitDays: z.number().int().min(0).max(13),
  })
  .strict();

export type TravelTiming = z.infer<typeof travelTimingSchema>;
export const sameDayTravel: TravelTiming = {
  outboundTransitDays: 0,
  returnTransitDays: 0,
};

export const dayRoleLabels = {
  "outbound-transit": "Outbound transit",
  arrival: "Arrival day",
  full: "Full sightseeing day",
  departure: "Departure day",
  "return-transit": "Return transit",
  "single-day": "Same-day visit",
} as const;

export type DayRole = keyof typeof dayRoleLabels;

export function isTransitDay(role?: DayRole) {
  return role === "outbound-transit" || role === "return-transit";
}

export function dateAfter(start: string, days: number) {
  return new Date(Date.parse(start) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function travelWindow(
  totalDays: number,
  timing: TravelTiming = sameDayTravel,
) {
  const destinationDays =
    totalDays - timing.outboundTransitDays - timing.returnTransitDays;
  return {
    totalDays,
    destinationDays,
    fullDays: Math.max(0, destinationDays - 2),
    destinationNights: Math.max(0, destinationDays - 1),
    arrivalIndex: timing.outboundTransitDays,
    departureIndex: totalDays - timing.returnTransitDays - 1,
    fits: destinationDays >= (totalDays === 1 ? 1 : 2),
  };
}

export function travelDayRole(
  index: number,
  window: ReturnType<typeof travelWindow>,
): DayRole {
  if (index < window.arrivalIndex) return "outbound-transit";
  if (index > window.departureIndex) return "return-transit";
  if (window.totalDays === 1) return "single-day";
  if (index === window.arrivalIndex) return "arrival";
  if (index === window.departureIndex) return "departure";
  return "full";
}

export const insufficientTravelWindow =
  "The travel window does not leave enough time for separate arrival and departure on a multi-day trip. Review your travel timing or adjust a copy of your dates.";

export function travelWindowLabel(window: ReturnType<typeof travelWindow>) {
  return [
    `${window.totalDays} travel-window ${window.totalDays === 1 ? "day" : "days"}`,
    `${window.destinationDays} at the destination`,
    `${window.fullDays} full sightseeing ${window.fullDays === 1 ? "day" : "days"}`,
    `${window.destinationNights} destination ${window.destinationNights === 1 ? "night" : "nights"}`,
  ].join(" · ");
}

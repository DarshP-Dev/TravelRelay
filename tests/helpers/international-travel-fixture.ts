import {
  dateAfter,
  type CityProposal,
  type ModelItinerary,
} from "../../src/lib/itinerary";
import { initialIntent } from "../../src/lib/trip-intent";

// The saved flexible Toronto–Tokyo request and the travel assumptions shown
// in the failed job. Activities below are authored test data.
export const intent = {
  ...initialIntent("tokyo"),
  departure: "Toronto",
  travelersConfirmed: true,
  flexible: true,
  month: "2026-12",
  duration: 7,
  budget: "3000",
};
export const oldProposal: CityProposal = {
  feasible: true,
  city: "Tokyo",
  country: "Japan",
  latitude: 35.68,
  longitude: 139.76,
  timeZone: "Asia/Tokyo",
  startDate: "2026-12-07",
  explanation:
    "Expect outbound travel December 7, Tokyo arrival December 8, four full local days and departure December 13.",
};
export const tokyo = {
  ...oldProposal,
  travelTiming: { outboundTransitDays: 1, returnTransitDays: 0 },
};
export const flightConflict =
  "The supplied timing requirements conflict. December 7 is in transit from Toronto, with arrival in Tokyo on December 8.";

export function fixturePlan(): ModelItinerary {
  const stop = (
    title: string,
    location: string,
    startMinute: number,
    durationMinutes = 60,
    costMinor = 0,
  ) => ({
    title,
    location,
    city: tokyo.city,
    latitude: tokyo.latitude,
    longitude: tokyo.longitude,
    startMinute,
    durationMinutes,
    bufferBeforeMinutes: 30,
    costMinor,
    description:
      "Spend time here exploring the area at your own pace and noticing the details along the way.",
  });
  return {
    city: "Tokyo",
    currency: "USD",
    feasible: true,
    explanation:
      "Tentative Tokyo planning estimates. Check timing and prices independently.",
    introduction:
      "Spend four full days exploring Tokyo, with time for local food and neighborhood culture.",
    flightsMinor: 150_000,
    accommodationMinor: 70_000,
    foodMinor: 42_000,
    localTransportMinor: 18_000,
    days: [
      [],
      [stop("Historic neighborhood walk", "Marunouchi", 960)],
      ...[
        ["Asakusa", "Nakamise market"],
        ["Ueno", "Ameyoko market"],
        ["Ginza", "Ginza department store"],
        ["Nihonbashi", "Nihonbashi boutiques"],
      ].map(([area, shopping]) => [
        stop("Historic district walk", area, 600, 90),
        stop(
          "Set-menu lunch",
          `${area} neighborhood dining street`,
          750,
          60,
          2300,
        ),
        stop("Browse local shops", shopping, 900, 60, 1500),
      ]),
      [stop("Neighborhood garden walk", "Kiyosumi Gardens", 600)],
    ].map((activities, index) => ({
      date: dateAfter(tokyo.startDate, index),
      title: index === 0 ? "Outbound travel day" : `Tokyo day ${index + 1}`,
      activities,
    })),
  };
}

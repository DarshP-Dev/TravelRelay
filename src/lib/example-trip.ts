import { initialIntent } from "./trip-intent";
import {
  validateItinerary,
  type Itinerary,
  type ModelItinerary,
  type CityProposal,
} from "./itinerary";

// Hand-authored public demonstration. Never inserted as a user's generated trip.
export const exampleIntent = {
  ...initialIntent(),
  destination: "Paris",
  departure: "London",
  start: "2027-04-15",
  end: "2027-04-17",
  travelers: 2,
  budget: "900",
  currency: "EUR" as const,
  scope: "spending" as const,
  pace: "relaxed" as const,
  selected: ["Culture", "Food"],
};
const base: CityProposal = {
  feasible: true,
  explanation:
    "An editorial illustration of a single-city escape, not an AI recommendation.",
  city: "Paris",
  country: "France",
  timeZone: "Europe/Paris",
  latitude: 48.8566,
  longitude: 2.3522,
  startDate: "2027-04-15",
};
const stops = [
  {
    date: "2027-04-15",
    title: "Arrive gently, follow the river",
    activities: [
      {
        title: "A riverside first look",
        description:
          "Leave the morning for arrival, then enjoy a gentle walk along the Seine. Adapt the route to your energy and access needs.",
        location: "Île de la Cité riverside",
        latitude: 48.853,
        longitude: 2.3499,
        startMinute: 840,
        durationMinutes: 75,
        costMinor: 0,
      },
      {
        title: "Café time in the Latin Quarter",
        description:
          "Allow an unhurried stop to settle in. Meals are covered by the separate food estimate.",
        location: "Latin Quarter",
        latitude: 48.8493,
        longitude: 2.347,
        startMinute: 960,
        durationMinutes: 90,
        costMinor: 0,
      },
    ],
  },
  {
    date: "2027-04-16",
    title: "Art, gardens, and a slower afternoon",
    activities: [
      {
        title: "An art-filled morning",
        description:
          "A museum visit is one possible way to spend the morning. Check official opening times, access arrangements and ticket availability yourself.",
        location: "Musée d’Orsay",
        latitude: 48.86,
        longitude: 2.3266,
        startMinute: 600,
        durationMinutes: 150,
        costMinor: 5000,
      },
      {
        title: "Room to linger in the gardens",
        description:
          "After a generous lunch break, explore the gardens at your own pace. There is no reservation associated with this example.",
        location: "Tuileries Garden",
        latitude: 48.8635,
        longitude: 2.3275,
        startMinute: 840,
        durationMinutes: 90,
        costMinor: 0,
      },
    ],
  },
  {
    date: "2027-04-17",
    title: "Neighborhood discoveries, then home",
    activities: [
      {
        title: "A neighborhood morning",
        description:
          "Enjoy a quiet neighborhood walk and window-shopping before leaving room for departure. Store opening times are not assumed or confirmed.",
        location: "Le Marais",
        latitude: 48.8575,
        longitude: 2.3622,
        startMinute: 540,
        durationMinutes: 60,
        costMinor: 0,
      },
      {
        title: "A final coffee and a little breathing room",
        description:
          "Pause near your neighborhood, then keep the afternoon free for your own onward travel arrangements.",
        location: "Place des Vosges",
        latitude: 48.8556,
        longitude: 2.3655,
        startMinute: 645,
        durationMinutes: 45,
        costMinor: 0,
      },
    ],
  },
];
const plan: ModelItinerary = {
  feasible: true,
  explanation:
    "Hand-authored example with illustrative group costs. Travel and accommodation are assumed covered separately. Prices, accessibility and future availability are unverified; dated published-hours references do not confirm a visit.",
  city: "Paris",
  currency: "EUR",
  introduction:
    "Three gentle days of neighborhood walks, art, and café stops, with one Paris base and room between plans.",
  flightsMinor: 0,
  accommodationMinor: 0,
  foodMinor: 24000,
  localTransportMinor: 6000,
  days: stops.map((day) => ({
    ...day,
    activities: day.activities.map((activity) => ({
      ...activity,
      city: "Paris",
      bufferBeforeMinutes: 30,
    })),
  })),
};
const checked = validateItinerary(plan, exampleIntent, base);
export const exampleItinerary: Omit<
  Itinerary,
  "generatedAt" | "model" | "priceSource"
> = {
  ...checked.plan,
  schemaVersion: 2,
  base,
  reserveMinor: checked.reserveMinor,
  totalMinor: checked.totalMinor,
  budget: {
    ...checked.budget,
    expenses: checked.budget.expenses.map((expense) => ({
      ...expense,
      source: "editorial-example",
    })),
  },
  days: checked.plan.days.map((day, index) => ({
    ...day,
    id: `example-day-${index + 1}`,
    activities: day.activities.map((activity, number) => ({
      ...activity,
      id: `example-day-${index + 1}-activity-${number + 1}`,
    })),
  })),
};

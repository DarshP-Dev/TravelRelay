import type { VenueReference } from "../lib/itinerary-quality";

// Manually source-checked published information. Never set by model output.
// Recheck with the venue before travel: exceptions and future schedules can change.
// Visit ends use published gallery-closing times, before building closure.
const standard = { open: 570, close: 1050, lastAdmission: 1020 };
export const venueReferences: VenueReference[] = [
  {
    id: "paris-musee-orsay",
    name: "Musée d’Orsay",
    city: "Paris",
    aliases: ["Musée d’Orsay", "Musee d Orsay", "Orsay Museum"],
    latitude: 48.86,
    longitude: 2.3266,
    sourceUrl: "https://www.musee-orsay.fr/en/visit",
    checkedOn: "2026-11-04",
    scope: "published-hours",
    category: "indoor-attraction",
    attractionType: "museum",
    closedDates: ["05-01", "12-25"],
    weekly: {
      0: standard,
      1: null,
      2: standard,
      3: standard,
      4: { open: 570, close: 1275, lastAdmission: 1260 },
      5: standard,
      6: standard,
    },
  },
];

import { dateAfter, type Itinerary } from "./itinerary";
import { destinationPhoto, tripDays, type TripIntent } from "./trip-intent";

export type DashboardTrip = {
  id: string;
  data: TripIntent;
  itinerary: Itinerary | null;
  generationStatus: string | null;
};

export type DashboardHeroTrip = {
  id: string;
  name: string;
  country?: string;
  photo: { image: string; alt: string };
  inspirationPhoto: boolean;
  dates?: string;
  details?: string;
  status?: string;
  description?: string;
  action: { label: string; href: string };
};

export type DashboardDraft = {
  id: string;
  slot: string;
  data: TripIntent;
};

const inspirationPhoto = {
  image: "/images/alpine-hero.avif",
  alt: "An alpine valley at sunrise",
};

const planningStatuses: Record<string, { status: string; action: string }> = {
  failed: { status: "Planning needs attention", action: "Review generation" },
  awaiting_confirmation: {
    status: "Destination awaiting confirmation",
    action: "Confirm destination",
  },
  queued: { status: "Generation queued", action: "View progress" },
  choosing: { status: "Choosing a destination", action: "View progress" },
  generating: { status: "Itinerary in progress", action: "View progress" },
  validating: { status: "Checking the itinerary", action: "View progress" },
};

const calendar = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function dashboardDate(date: string) {
  return calendar.format(new Date(date));
}

function featuredPhoto(destination: string, country?: string) {
  const [city, ...qualifiers] = destination
    .split(",")
    .map((part) => part.trim());
  const photo = destinationPhoto(city);
  const expectedCountry = country ?? qualifiers.at(-1);
  return !expectedCountry ||
    photo?.country.toLowerCase() === expectedCountry.toLowerCase()
    ? photo
    : undefined;
}

function travelDates(trip: DashboardTrip) {
  if (trip.itinerary) {
    const start = trip.itinerary.base.startDate;
    return { start, end: dateAfter(start, trip.itinerary.days.length - 1) };
  }
  if (trip.data.flexible) {
    const start = trip.data.month + "-01";
    const nextMonth = new Date(start);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    return { start, end: dateAfter(nextMonth.toISOString().slice(0, 10), -1) };
  }
  return { start: trip.data.start, end: trip.data.end };
}

export function chooseDashboardTrip(
  trips: readonly DashboardTrip[],
  requested: string | undefined,
  today: string,
) {
  const ownedSelection = trips.find((trip) => trip.id === requested);
  if (ownedSelection) return ownedSelection;

  const upcoming = trips.filter((trip) => travelDates(trip).end >= today);
  const upcomingWithItinerary = upcoming.filter((trip) => trip.itinerary);
  const candidates = upcomingWithItinerary.length
    ? upcomingWithItinerary
    : upcoming;
  return (
    candidates.sort((a, b) =>
      travelDates(a).start.localeCompare(travelDates(b).start),
    )[0] ?? trips[0]
  );
}

export function dashboardTripHero(
  trip: DashboardTrip,
  today: string,
): DashboardHeroTrip {
  const { data, itinerary } = trip;
  const name =
    itinerary?.base.city ??
    (data.mode === "known" ? data.destination : "Destination to discover");
  const photo = featuredPhoto(name, itinerary?.base.country);
  const dates = travelDates(trip);
  const past = dates.end < today;
  const planning = planningStatuses[trip.generationStatus ?? ""] ?? {
    status: "Saved trip plan",
    action: "Continue planning",
  };
  const days = itinerary?.days.length ?? tripDays(data);
  const href = `/trips/${trip.id}`;
  const status = itinerary
    ? past
      ? "Past trip"
      : dates.start <= today
        ? "Current travel dates"
        : "Upcoming trip"
    : planning.status;
  return {
    id: trip.id,
    name,
    country: itinerary?.base.country,
    photo: photo ?? inspirationPhoto,
    inspirationPhoto: !photo,
    dates:
      data.flexible && !itinerary
        ? `Around ${new Intl.DateTimeFormat("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(dates.start))}`
        : dates.start === dates.end
          ? dashboardDate(dates.start)
          : calendar.formatRange(new Date(dates.start), new Date(dates.end)),
    details: `${days} ${days === 1 ? "day" : "days"} · ${data.travelers} ${data.travelers === 1 ? "traveler" : "travelers"}`,
    status,
    action: itinerary
      ? { label: past ? "Revisit your trip" : "Open your trip", href }
      : { label: planning.action, href: href + "/generate" },
  };
}

export function dashboardDraftHref(draft: DashboardDraft) {
  if (draft.slot === "blank") return "/trips/new";
  const [key, value] = draft.slot.startsWith("revision:")
    ? ["source", draft.slot.slice(9)]
    : ["template", draft.slot];
  return `/trips/new?${key}=${encodeURIComponent(value)}`;
}

export function dashboardWelcomeHero(
  draft?: DashboardDraft,
): DashboardHeroTrip {
  const destination =
    draft?.data.mode === "known" ? draft.data.destination : "";
  const photo = featuredPhoto(destination);
  return {
    id: draft?.id ?? "welcome",
    name:
      destination ||
      (draft ? "Your next trip is taking shape" : "Where will you go next?"),
    photo: photo ?? inspirationPhoto,
    inspirationPhoto: !photo,
    status: draft ? "Saved draft" : undefined,
    description: draft
      ? `Pick up your saved plan at step ${draft.data.step + 1} of 4.`
      : "Shape an itinerary around the places, pace and budget that feel right for you.",
    action: draft
      ? { label: "Resume your draft", href: dashboardDraftHref(draft) }
      : { label: "Create a trip", href: "/trips/new" },
  };
}

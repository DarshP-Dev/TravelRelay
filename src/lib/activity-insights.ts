import type { ActivityCategory } from "./activity-metadata";
import type { Itinerary, SavedActivity } from "./itinerary";

export type InsightTarget = {
  name: string;
  city: string;
  country: string;
  address: string;
  category?: ActivityCategory;
  coordinates: { latitude: number; longitude: number } | null;
};

export type PlaceReview = {
  text: string;
  rating: number;
  date?: string;
  relativeDate?: string;
  url: string;
  author: { name: string; url?: string; avatar?: string };
};

export type ActivityInsightsResult =
  | {
      status: "matched";
      name: string;
      address?: string;
      url: string;
      rating?: number;
      ratingCount?: number;
      reviews: PlaceReview[];
      attributions: { name: string; url?: string }[];
    }
  | {
      status:
        | "disabled"
        | "generic"
        | "unmatched"
        | "ambiguous"
        | "quota"
        | "unavailable";
    };

export function placeText(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{Mark}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

const address =
  /(?:^\d+\s|^(?:rue|quai|esplanade|avenue|boulevard|calle|via|piazza|plaza)\b|\b(?:street|road|lane|drive|avenue|boulevard|strasse|straat|esplanade)$)/;
const generic =
  /^(?:(?:local|central|nearby|traditional|neighborhood|city) )*(?:restaurant|cafe|bistro|bakery|market|museum|park|hotel|city center|old town|city centre|train station|airport|various locations|to be decided|tbd)$/;

export function insightTarget(
  activity: SavedActivity,
  base: Pick<Itinerary["base"], "city" | "country">,
  category = activity.category,
): InsightTarget | null {
  const [name, ...parts] = activity.location
    .split(/[,;·]/)
    .map((s) => s.trim());
  const identity = placeText(name),
    title = placeText(activity.title);
  if (
    identity.length < 3 ||
    [base.city, base.country].some((value) => placeText(value) === identity) ||
    address.test(identity) ||
    generic.test(identity) ||
    category === "transport" ||
    /\b(?:walk|stroll|self guided|free time|window shopping|in transit|check in|check out)\b/.test(
      title,
    )
  )
    return null;
  return {
    name,
    city: base.city,
    country: base.country,
    address: parts.filter((part) => address.test(placeText(part))).join(", "),
    category,
    coordinates:
      activity.latitude !== null && activity.longitude !== null
        ? { latitude: activity.latitude, longitude: activity.longitude }
        : null,
  };
}

export function venueQuery(target: InsightTarget) {
  return [target.name, target.address, target.city, target.country]
    .filter(Boolean)
    .join(", ");
}

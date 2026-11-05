import { foodCue, normalized, type Activity } from "./activity-semantics";
import { distanceKm, type CityProposal } from "./itinerary";
import type { VenueReference } from "./itinerary-quality";

export type VenueCategory =
  | "indoor-attraction"
  | "dining"
  | "outdoor"
  | "transport"
  | "shopping"
  | "entertainment"
  | "unknown";
export type ActivityCategoryHint = {
  dayIndex: number;
  activityIndex: number;
  category: VenueCategory;
};
export type VenueClassification = {
  category: VenueCategory;
  basis:
    | "published-venue-metadata"
    | "structured-activity-category"
    | "activity-context"
    | "unknown";
  attractionType?: "museum" | "gallery" | "temple" | "palace" | "other";
  ambiguous: boolean;
};
const attraction =
  /\b(museum|musee|gallery|palace|castle|cathedral|basilica|temple|shrine|exhibition|aquarium|zoo|visitor centre|visitor center)\b/;
const street =
  /\b(rue|quai|avenue|boulevard|street|road|lane|drive|way|calle|via|platz|strasse|straat)\b/;
const visit = /\b(visit|tour|admission|entry|inside|explore|exhibition)\b/;
const exterior = /\b(exterior|outside|past|near|around|view from|walk by)\b/;

// Remove address clauses before activity-type inference. A location such as
// "Museum Street" is an address, not evidence of visiting a museum.
export function activityContext(
  activity: Pick<Activity, "title" | "location">,
) {
  const title = normalized(activity.title);
  const beforeAddress = title.replace(
    /\b(?:on|at|along|near|around|by|off)\s+(?=[^,]*\b(?:rue|quai|avenue|boulevard|street|road|lane|drive|way|calle|via)\b).*$/,
    "",
  );
  const cleanTitle = beforeAddress
    .replace(/\b(?:rue|quai|boulevard|calle|via)\b.*$/, "")
    .replace(
      /\b(?:temple|museum|musee|gallery)(?:\s+[a-z0-9]+){0,2}\s+(?:street|road|lane|drive|way|avenue|boulevard|platz|strasse|straat)\b/g,
      "",
    )
    .trim();
  const identity = normalized(activity.location.split(",")[0]);
  return { title: cleanTitle, identity: street.test(identity) ? "" : identity };
}
function directReference(
  activity: Activity,
  base: CityProposal,
  refs: VenueReference[],
) {
  const title = activityContext(activity).title,
    location = normalized(activity.location.split(",")[0]);
  return refs.find(
    (ref) =>
      normalized(ref.city) === normalized(base.city) &&
      distanceKm(ref, activity) <= 1 &&
      ref.aliases.some((alias) => {
        const name = normalized(alias);
        const directLocation =
          location === name ||
          (!street.test(location) && location.startsWith(`${name} `));
        const directTitle =
          title.includes(name) && !exterior.test(title) && !foodCue.test(title);
        return directLocation || directTitle;
      }),
  );
}
export function classifyVenue(
  activity: Activity,
  base: CityProposal,
  refs: VenueReference[] = [],
  categoryHint?: VenueCategory,
) {
  const context = activityContext(activity),
    text = `${context.title} ${context.identity}`;
  const reference = directReference(activity, base, refs);
  const type = (value: string): VenueClassification["attractionType"] =>
    /\b(museum|musee)\b/.test(value)
      ? "museum"
      : /\bgallery\b/.test(value)
        ? "gallery"
        : /\b(temple|shrine)\b/.test(value)
          ? "temple"
          : /\b(palace|castle)\b/.test(value)
            ? "palace"
            : "other";
  const hasAttraction = attraction.test(text);
  const foodActivity = foodCue.test(context.title);
  const outdoorActivity =
    /\b(walk|stroll|promenade|garden|park|hike|hiking|riverbank|waterside)\b/.test(
      context.title,
    );
  const indoorIntent =
    hasAttraction &&
    (visit.test(context.title) || (!foodActivity && !outdoorActivity));
  let classification: VenueClassification;
  if (reference) {
    classification = {
      category: reference.category ?? "indoor-attraction",
      basis: "published-venue-metadata",
      attractionType: reference.attractionType ?? type(reference.name),
      ambiguous: false,
    };
  } else if (categoryHint && categoryHint !== "unknown") {
    // Structured data does not license a contradictory declared outdoor/food
    // activity to bypass an explicit indoor visit. Flag the ambiguity instead.
    classification = {
      category: categoryHint,
      basis: "structured-activity-category",
      ambiguous: indoorIntent && categoryHint !== "indoor-attraction",
      ...(categoryHint === "indoor-attraction"
        ? { attractionType: type(text) }
        : {}),
    };
  } else if (indoorIntent && foodActivity) {
    classification = {
      category: "unknown",
      basis: "activity-context",
      ambiguous: true,
    };
  } else if (indoorIntent) {
    classification = {
      category: "indoor-attraction",
      basis: "activity-context",
      attractionType: type(text),
      ambiguous: false,
    };
  } else if (foodActivity)
    classification = {
      category: "dining",
      basis: "activity-context",
      ambiguous: false,
    };
  else if (outdoorActivity)
    classification = {
      category: "outdoor",
      basis: "activity-context",
      ambiguous: false,
    };
  else if (/\b(boutique|shopping|mall)\b/.test(context.title))
    classification = {
      category: "shopping",
      basis: "activity-context",
      ambiguous: false,
    };
  else if (hasAttraction)
    classification = {
      category: "unknown",
      basis: "activity-context",
      ambiguous: true,
    };
  else
    classification = {
      category: "unknown",
      basis: "unknown",
      ambiguous: false,
    };
  return { classification, reference, interestText: normalized(text) };
}

import { z } from "zod";
import {
  safeReferenceSchema,
  type ActivityCategory,
} from "../lib/activity-metadata";
import {
  placeText,
  venueQuery,
  type ActivityInsightsResult,
  type InsightTarget,
  type PlaceReview,
} from "../lib/activity-insights";
import { distanceKm } from "../lib/itinerary";

const endpoint = "https://places.googleapis.com/v1/places";
const discoveryFields =
  "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.primaryType,places.types";
const reviewFields =
  "id,displayName,formattedAddress,googleMapsUri,rating,userRatingCount,attributions,reviews.rating,reviews.text,reviews.originalText,reviews.publishTime,reviews.relativePublishTimeDescription,reviews.authorAttribution,reviews.googleMapsUri";
const placeId = z.string().regex(/^[a-zA-Z0-9_-]{1,256}$/);
const label = z.string().trim().min(1).max(320);
const link = z.string().max(2048);
const localizedName = z.object({ text: label });
const coordinates = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
const candidateSchema = z.object({
  id: placeId,
  displayName: localizedName,
  formattedAddress: label.optional(),
  addressComponents: z.array(
    z.object({
      longText: label,
      shortText: label.optional(),
      types: z.array(z.string()),
    }),
  ),
  location: coordinates,
  primaryType: z.string().optional(),
  types: z.array(z.string()),
});
const searchSchema = z.strictObject({
  places: z.array(z.unknown()).max(5).default([]),
  nextPageToken: z.string().max(4096).optional(),
});
const stars = z.number().min(1).max(5);
const reviewSchema = z.object({
  rating: stars,
  text: z.object({ text: z.string().max(20_000) }).optional(),
  originalText: z.object({ text: z.string().max(20_000) }).optional(),
  publishTime: z.iso.datetime().optional(),
  relativePublishTimeDescription: label.optional(),
  googleMapsUri: link,
  authorAttribution: z.object({
    displayName: label,
    uri: link.optional(),
    photoUri: link.optional(),
  }),
});
const detailsSchema = z.object({
  id: placeId,
  displayName: localizedName,
  formattedAddress: label.optional(),
  googleMapsUri: link,
  rating: stars.optional(),
  userRatingCount: z.number().int().nonnegative().optional(),
  attributions: z
    .array(z.object({ provider: label, providerUri: link.optional() }))
    .max(20)
    .default([]),
  reviews: z.array(z.unknown()).max(5).default([]),
});

const dining =
  /^(?:.*_restaurant|restaurant|cafe|coffee_shop|tea_house|bakery|bar|pub|food_court|dessert_shop|ice_cream_shop)$/;
const culture =
  /^(?:museum|art_gallery|cultural_center|historical_(?:place|landmark)|monument|church|hindu_temple|place_of_worship|synagogue|mosque|library|tourist_attraction)$/;
const outdoors =
  /^(?:park|national_park|garden|botanical_garden|hiking_area|beach|observation_deck|zoo|tourist_attraction)$/;
const retail = /^(?:market|shopping_mall|.*_store|store|.*_shop)$/;
const entertainment =
  /^(?:performing_arts_theater|movie_theater|amusement_park|aquarium|concert_hall|comedy_club|tourist_attraction)$/;
const relaxation = /^(?:spa|sauna|wellness_center|massage_spa|park|garden)$/;
const categoryTypes: Partial<Record<ActivityCategory, RegExp>> = {
  food: dining,
  culture,
  outdoors,
  shopping: retail,
  entertainment,
  relaxation,
};
const venueTypes = [
  dining,
  culture,
  outdoors,
  retail,
  entertainment,
  relaxation,
];
const broadTypes = new Set([
  "establishment",
  "point_of_interest",
  "tourist_attraction",
  "food",
  "store",
  "place_of_worship",
]);
function compatible(
  place: z.infer<typeof candidateSchema>,
  category?: ActivityCategory,
) {
  if (place.types.includes("lodging") || place.primaryType === "hotel")
    return false;
  const primary = place.primaryType;
  const types = primary && !broadTypes.has(primary) ? [primary] : place.types;
  const wanted = (category && categoryTypes[category]) || null;
  return types.some((type) =>
    wanted
      ? wanted.test(type)
      : venueTypes.some((pattern) => pattern.test(type)),
  );
}

const countryAliases: Record<string, string> = {
  usa: "us",
  "united states": "us",
  "united states of america": "us",
  uk: "gb",
  "united kingdom": "gb",
  "great britain": "gb",
  england: "gb",
};
const countryIdentity = (value: string) =>
  countryAliases[placeText(value)] ?? placeText(value);
function agreesWithCity(
  place: z.infer<typeof candidateSchema>,
  target: InsightTarget,
) {
  const country = place.addressComponents.find((part) =>
    part.types.includes("country"),
  );
  if (
    !country ||
    ![country.longText, country.shortText ?? ""].some(
      (part) => countryIdentity(part) === countryIdentity(target.country),
    )
  )
    return false;
  const city = placeText(target.city);
  return place.addressComponents.some((part) => {
    const name = placeText(part.longText);
    return (
      (part.types.some(
        (type) => type === "locality" || type === "postal_town",
      ) &&
        name === city) ||
      (city === "tokyo" &&
        part.types.includes("administrative_area_level_1") &&
        ["tokyo", "tokyo metropolis"].includes(name))
    );
  });
}

function matchingPlaces(
  input: unknown,
  target: InsightTarget,
  base: z.infer<typeof coordinates>,
) {
  const valid = searchSchema.parse(input).places.flatMap((value) => {
    const parsed = candidateSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  return [
    ...new Map(
      valid
        .filter(
          (place) =>
            placeText(place.displayName.text) === placeText(target.name) &&
            agreesWithCity(place, target) &&
            compatible(place, target.category) &&
            distanceKm(place.location, base) <= 35 &&
            (!target.coordinates ||
              distanceKm(place.location, target.coordinates) <= 1.5) &&
            (!target.address ||
              ` ${placeText(place.formattedAddress ?? "")} `.includes(
                ` ${placeText(target.address)} `,
              )),
        )
        .map((place) => [place.id, place]),
    ).values(),
  ];
}

function googleUrl(value?: string, avatar = false) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return undefined;
    const allowed = avatar
      ? /^lh\d+\.googleusercontent\.com$/.test(url.hostname)
      : url.hostname === "maps.google.com" ||
        url.hostname === "maps.app.goo.gl" ||
        (["www.google.com", "google.com"].includes(url.hostname) &&
          /^\/maps(?:\/|$)/.test(url.pathname));
    return allowed ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function toReview(raw: unknown): PlaceReview[] {
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return [];
  const review = parsed.data;
  const text = review.originalText?.text || review.text?.text;
  const url = googleUrl(review.googleMapsUri);
  if (!text?.trim() || !url) return [];
  return [
    {
      text,
      rating: review.rating,
      date: review.publishTime,
      relativeDate: review.relativePublishTimeDescription,
      url,
      author: {
        name: review.authorAttribution.displayName,
        url: googleUrl(review.authorAttribution.uri),
        avatar: googleUrl(review.authorAttribution.photoUri, true),
      },
    },
  ];
}

class PlacesQuotaError extends Error {}
export function createGooglePlaces(options: {
  key: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}) {
  const request = options.fetch ?? fetch;
  return async (
    target: InsightTarget,
    base: z.infer<typeof coordinates>,
  ): Promise<ActivityInsightsResult> => {
    const start = performance.now();
    const signal = AbortSignal.timeout(options.timeoutMs ?? 7000);
    let searches = 0,
      details = 0,
      outcome = "unavailable";
    async function call(
      url: string,
      fields: string,
      body?: unknown,
    ): Promise<unknown> {
      const response = await request(url, {
        method: body ? "POST" : "GET",
        headers: {
          "X-Goog-Api-Key": options.key,
          "X-Goog-FieldMask": fields,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        redirect: "error",
        signal,
      });
      if (response.status === 429) throw new PlacesQuotaError();
      if (!response.ok) throw new Error("Places request rejected");
      return response.json();
    }
    try {
      searches++;
      const { latitude, longitude } = target.coordinates ?? base;
      const result = await call(`${endpoint}:searchText`, discoveryFields, {
        textQuery: venueQuery(target),
        languageCode: "en",
        pageSize: 5,
        locationBias: {
          circle: {
            center: { latitude, longitude },
            radius: target.coordinates ? 1500 : 15000,
          },
        },
      });
      const matches = matchingPlaces(result, target, base);
      if (matches.length !== 1) {
        const status = matches.length ? "ambiguous" : "unmatched";
        outcome = status;
        return { status };
      }
      const match = matches[0];
      signal.throwIfAborted();
      details++;
      const place = detailsSchema.parse(
        await call(`${endpoint}/${match.id}?languageCode=en`, reviewFields),
      );
      const url = googleUrl(place.googleMapsUri);
      if (
        !url ||
        place.id !== match.id ||
        placeText(place.displayName.text) !== placeText(match.displayName.text)
      )
        throw new Error("Place identity changed during lookup");
      outcome = "matched";
      return {
        status: "matched",
        name: place.displayName.text,
        address: place.formattedAddress,
        url,
        rating: place.rating,
        ratingCount: place.userRatingCount,
        reviews: place.reviews.flatMap(toReview),
        attributions: place.attributions.map(({ provider, providerUri }) => ({
          name: provider,
          url: safeReferenceSchema.safeParse({
            label: "Source",
            url: providerUri,
          }).success
            ? providerUri
            : undefined,
        })),
      };
    } catch (error) {
      if (error instanceof PlacesQuotaError) {
        outcome = "quota";
        return { status: "quota" };
      }
      if (signal.aborted) outcome = "timeout";
      else if (error instanceof z.ZodError || error instanceof SyntaxError)
        outcome = "invalid-response";
      return { status: "unavailable" };
    } finally {
      console.info(
        JSON.stringify({
          event: "activity-insights.google-places",
          outcome,
          searches,
          details,
          estimatedListCostUsd: (searches * 32 + details * 25) / 1000,
          elapsedMs: Math.round(performance.now() - start),
        }),
      );
    }
  };
}

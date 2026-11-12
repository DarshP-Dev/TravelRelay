"use client";

import Image from "next/image";
import { ArrowUpRight, Camera, Instagram, Music2, Star } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  referenceSource,
  safeReferenceSchema,
  type ActivityCategory,
  type ActivityReference,
} from "@/lib/activity-metadata";
import {
  insightTarget,
  venueQuery,
  type ActivityInsightsResult,
  type InsightTarget,
  type PlaceReview,
} from "@/lib/activity-insights";
import type { Itinerary, SavedActivity } from "@/lib/itinerary";
import "./activity-insights.css";

const external = { target: "_blank", rel: "noopener noreferrer" } as const;
const number = new Intl.NumberFormat("en");
const date = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const messages = {
  disabled:
    "Traveler reviews are currently unavailable in TravelRelay. You can look up the venue on Google Maps.",
  generic:
    "Reviews are available for activities with a single identifiable venue.",
  unmatched:
    "We couldn’t confidently match this activity to a Google Maps venue.",
  ambiguous:
    "More than one Google Maps venue fits this activity. Check the location on Google Maps.",
  quota:
    "The review lookup limit has been reached. Try again later or open Google Maps.",
  unavailable: "Traveler reviews are temporarily unavailable.",
  changed:
    "The itinerary changed. Reload the saved itinerary to look up reviews.",
  signedOut: "Sign in again to look up traveler reviews.",
};
type Result = ActivityInsightsResult | { status: "changed" | "signedOut" };

function ReviewList({ reviews }: { reviews: PlaceReview[] }) {
  return (
    <ul className="insight-reviews">
      {reviews.map((review, index) => {
        const characters = Array.from(review.text);
        const excerpt =
          characters.length > 400
            ? characters.slice(0, 400).join("").trimEnd() + "…"
            : review.text;
        const author = review.author;
        return (
          <li key={`${review.url}:${index}`}>
            <div className="insight-review-author">
              {author.avatar && (
                <Image
                  className="insight-avatar"
                  src={author.avatar}
                  alt=""
                  width={34}
                  height={34}
                  unoptimized
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                  }}
                />
              )}
              <div>
                {author.url ? (
                  <a href={author.url} {...external}>
                    {author.name}
                  </a>
                ) : (
                  <strong>{author.name}</strong>
                )}
                <small>
                  {review.date ? (
                    <time dateTime={review.date}>
                      {date.format(new Date(review.date))}
                    </time>
                  ) : (
                    review.relativeDate
                  )}
                </small>
              </div>
              <span className="insight-stars">
                <Star size={14} aria-hidden="true" /> {review.rating}/5
              </span>
            </div>
            <blockquote>
              <p>{excerpt}</p>
            </blockquote>
            <a className="insight-link" href={review.url} {...external}>
              Original review <ArrowUpRight size={13} aria-hidden="true" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function GoogleReviews({
  result,
}: {
  result: Extract<Result, { status: "matched" }>;
}) {
  return (
    <div className="insight-google">
      <Image
        className="insight-google-brand"
        src="/images/google-maps-attribution.svg"
        alt="Google Maps"
        width={98}
        height={18}
        unoptimized
      />
      <strong>{result.name}</strong>
      {result.address && <p className="insight-note">{result.address}</p>}
      <div className="insight-rating">
        {result.rating !== undefined ? (
          <span className="insight-stars">
            <Star size={16} aria-hidden="true" /> {result.rating.toFixed(1)}/5
          </span>
        ) : (
          <small>Average rating unavailable</small>
        )}
        {result.ratingCount !== undefined && (
          <small>
            {number.format(result.ratingCount)}{" "}
            {result.ratingCount === 1 ? "rating" : "ratings"}
          </small>
        )}
      </div>
      {result.reviews.length ? (
        <>
          <ReviewList reviews={result.reviews.slice(0, 2)} />
          {result.reviews.length > 2 && (
            <details className="insight-more">
              <summary>More reviews ({result.reviews.length - 2})</summary>
              <ReviewList reviews={result.reviews.slice(2)} />
            </details>
          )}
          <p className="insight-note">
            A selection of reviews provided by Google Maps.
          </p>
        </>
      ) : (
        <p className="insight-note">
          Google Maps did not return any attributable written reviews for this
          venue.
        </p>
      )}
      {result.attributions.map(({ name, url }, index) => (
        <p className="insight-note" key={`${name}:${index}`}>
          Additional attribution ·{" "}
          {url ? (
            <a href={url} {...external}>
              {name}
            </a>
          ) : (
            name
          )}
        </p>
      ))}
      <a className="insight-link" href={result.url} {...external}>
        View venue on Google Maps <ArrowUpRight size={13} aria-hidden="true" />
      </a>
    </div>
  );
}

function ActivityInsights({
  tripId,
  activityId,
  version,
  venue,
}: {
  tripId: string;
  activityId: string;
  version: number;
  venue: InsightTarget | null;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result>();
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function load() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setResult(undefined);
    try {
      const response = await fetch(
        `/api/trips/${tripId}/activities/${activityId}/insights?version=${version}`,
        {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        },
      );
      const state: Result =
        response.status === 401
          ? { status: "signedOut" }
          : response.status === 409
            ? { status: "changed" }
            : response.status === 429
              ? { status: "quota" }
              : response.ok
                ? await response.json()
                : { status: "unavailable" };
      if (!controller.signal.aborted) setResult(state);
    } catch {
      if (!controller.signal.aborted) setResult({ status: "unavailable" });
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <section className="activity-insights" aria-labelledby={`${id}-title`}>
      <h5 id={`${id}-title`}>
        <Star size={17} aria-hidden="true" /> What travelers are saying
      </h5>
      {venue ? (
        <>
          <button
            type="button"
            className="insight-link"
            aria-controls={`${id}-reviews`}
            aria-expanded={visible}
            aria-disabled={loading || undefined}
            onClick={() => {
              if (loading) return;
              setVisible(!visible);
              if (!visible && !result) void load();
            }}
          >
            {visible ? "Hide traveler reviews" : "Show traveler reviews"}
          </button>
          <div id={`${id}-reviews`} hidden={!visible}>
            <p
              className={
                result?.status === "matched" ? "sr-only" : "insight-note"
              }
              role="status"
            >
              {loading
                ? "Looking up this saved venue on Google Maps…"
                : result?.status === "matched"
                  ? `Reviews loaded for ${result.name}.`
                  : result && messages[result.status]}
            </p>
            {result?.status === "matched" ? (
              <GoogleReviews result={result} />
            ) : (
              result && (
                <div className="insight-actions">
                  {(result.status === "unavailable" ||
                    result.status === "quota") && (
                    <button
                      type="button"
                      className="insight-link"
                      onClick={() => void load()}
                    >
                      Try again
                    </button>
                  )}
                  <a
                    className="insight-link"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueQuery(venue))}`}
                    {...external}
                  >
                    Search Google Maps{" "}
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </a>
                </div>
              )
            )}
          </div>
        </>
      ) : (
        <p className="insight-note">{messages.generic}</p>
      )}
    </section>
  );
}

function ActivityInspiration({
  links,
  venue,
}: {
  links?: ActivityReference[];
  venue: InsightTarget | null;
}) {
  const references = (links ?? []).flatMap((link) => {
    const parsed = safeReferenceSchema.safeParse(link);
    return parsed.success ? [parsed.data] : [];
  });
  if (!references.length && !venue) return null;
  return (
    <section className="activity-insights activity-inspiration">
      <h5>
        <Camera size={17} aria-hidden="true" /> See the experience
      </h5>
      {references.length ? (
        <ul className="insight-references">
          {references.map(({ url, label }, index) => {
            const source = referenceSource(url);
            const Icon =
              source === "Instagram"
                ? Instagram
                : source === "TikTok"
                  ? Music2
                  : ArrowUpRight;
            return (
              <li key={`${url}:${index}`}>
                <a className="insight-link" href={url} {...external}>
                  <Icon size={15} aria-hidden="true" /> {source} · {label}{" "}
                  <ArrowUpRight size={13} aria-hidden="true" />
                </a>
                <small>Saved reference · post and creator unverified</small>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="insight-note">
          Add a public Instagram or TikTok link from Edit to keep it with this
          activity.
        </p>
      )}
      {venue &&
        !references.some(({ url }) => referenceSource(url) === "TikTok") && (
          <a
            className="insight-link"
            href={`https://www.tiktok.com/search?q=${encodeURIComponent(`${venue.name} ${venue.city}`)}`}
            {...external}
          >
            <Music2 size={15} aria-hidden="true" /> Search TikTok for this venue{" "}
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        )}
    </section>
  );
}

export function ActivityDiscovery({
  activity,
  base,
  category,
  tripId,
  version,
  showReviews,
}: {
  activity: SavedActivity;
  base: Itinerary["base"];
  category: ActivityCategory;
  tripId: string;
  version: number;
  showReviews: boolean;
}) {
  const venue = insightTarget(activity, base, category);
  return (
    <>
      {showReviews && (
        <ActivityInsights
          key={version}
          tripId={tripId}
          activityId={activity.id}
          version={version}
          venue={venue}
        />
      )}
      <ActivityInspiration links={activity.links} venue={venue} />
    </>
  );
}

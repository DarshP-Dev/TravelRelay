import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DestinationImage } from "./destination-image";
import { destinationPhoto } from "@/lib/trip-intent";
import { money, type Itinerary } from "@/lib/itinerary";

type Plan = Omit<Itinerary, "generatedAt" | "model" | "priceSource">;
export function itineraryDayHref(tripId: string, dayId: string) {
  return `/trips/${tripId}/itinerary#day-${dayId}`;
}
export function ItineraryDayOverview({
  plan,
  tripId,
}: {
  plan: Plan;
  tripId: string;
}) {
  const photo = destinationPhoto(plan.base.city);
  const card = (day: Plan["days"][number], index: number) => (
    <article className="overview-day-card" key={day.id}>
      <Link
        href={itineraryDayHref(tripId, day.id)}
        aria-label={`Open day ${index + 1}: ${day.title}`}
      >
        <div className="overview-day-photo">
          <DestinationImage
            src={photo?.image ?? "/images/cinque-terre.jpg"}
            alt={photo?.alt ?? "Cinque Terre — default travel inspiration"}
          />
          <span>Destination inspiration</span>
        </div>
        <div className="overview-day-body">
          <p className="eyebrow">
            DAY {index + 1} · {day.date}
          </p>
          {plan.manualEdit && (
            <small className="inline-note">
              Original day theme · current activities below
            </small>
          )}
          <h3>{day.title}</h3>
          <ul>
            {day.activities.slice(0, 3).map((activity) => (
              <li key={activity.id}>{activity.title}</li>
            ))}
          </ul>
          <p className="inline-note">
            {day.activities.length} activities ·{" "}
            {money(
              day.activities.reduce((sum, a) => sum + a.costMinor, 0),
              plan.currency,
            )}{" "}
            {plan.currency} itemized estimates, included in trip allocations
          </p>
          <span className="section-link">
            Open this day <ArrowUpRight size={16} aria-hidden="true" />
          </span>
        </div>
      </Link>
    </article>
  );
  return (
    <section
      className="itinerary-overview-days"
      aria-label="Your days at a glance"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR DAYS, AT A GLANCE</p>
          <h2>A little to look forward to.</h2>
        </div>
        <Link className="section-link" href={`/trips/${tripId}/itinerary`}>
          Full itinerary <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <p className="inline-note">
        Open a day for its full schedule, travel buffers and information
        sources. Activities and prices are estimates; nothing is booked.
      </p>
      <div className="overview-day-grid">{plan.days.slice(0, 3).map(card)}</div>
      {plan.days.length > 3 && (
        <details className="overview-more-days">
          <summary>View all {plan.days.length} days</summary>
          <div className="overview-day-grid">
            {plan.days.slice(3).map((day, index) => card(day, index + 3))}
          </div>
        </details>
      )}
    </section>
  );
}

import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import { DestinationImage } from "@/components/destination-image";
import type { CuratedTrip } from "@/lib/curated-trips";

export function TripCard({
  trip,
  expanded = false,
}: {
  trip: CuratedTrip;
  expanded?: boolean;
}) {
  return (
    <article className="trip-card">
      <div className="trip-card-image">
        <DestinationImage src={trip.image} alt={trip.alt} />
        <span className="photo-badge">{trip.style}</span>
        <span className="trip-days">{trip.days} days</span>
      </div>
      <div className="trip-card-body">
        <p className="location">
          <MapPin size={13} aria-hidden="true" />
          {trip.city}, {trip.country}
        </p>
        <h3>
          <Link href={`/explore/${trip.id}`}>{trip.title}</Link>
        </h3>
        <p className="trip-description">{trip.description}</p>
        {expanded && (
          <Link className="section-link" href={`/explore/${trip.id}`}>
            Preview this trip <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        )}
        {expanded && (
          <details className="day-preview">
            <summary>Peek at the day themes</summary>
            <ul>
              {trip.preview.map((day) => (
                <li key={day}>{day}</li>
              ))}
            </ul>
            <p>Editorial ideas; no schedule or availability verified.</p>
          </details>
        )}
        <div className="trip-card-bottom">
          <div>
            <span className="estimate-value">
              ${trip.estimate.toLocaleString("en-US")} <small>USD</small>
            </span>
            <span className="estimate-label">
              Illustrative spending budget / person
            </span>
            <span className="estimate-label">
              Excludes flights & accommodation · non-live
            </span>
          </div>
          <Link
            href={`/trips/new?template=${trip.id}`}
            className="card-arrow"
            aria-label={`Customize This Trip: ${trip.title}`}
          >
            <ArrowUpRight size={21} aria-hidden="true" />
          </Link>
        </div>
        {expanded && (
          <Link
            className="customize-link"
            href={`/trips/new?template=${trip.id}`}
          >
            Customize This Trip <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
    </article>
  );
}

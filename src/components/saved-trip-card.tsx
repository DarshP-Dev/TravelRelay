import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DestinationImage } from "./destination-image";
import { destinationPhoto, type TripIntent } from "@/lib/trip-intent";
import type { Itinerary } from "@/lib/itinerary";
import { dateAfter } from "@/lib/itinerary";
export function SavedTripCard({
  trip,
}: {
  trip: { id: string; data: TripIntent; itinerary?: Itinerary | null };
}) {
  const photo = destinationPhoto(
    trip.itinerary?.base.city ??
      (trip.data.mode === "known" ? trip.data.destination : ""),
  );
  return (
    <article className="trip-card">
      <div className="trip-card-image">
        <DestinationImage
          src={photo?.image ?? "/images/cinque-terre.jpg"}
          alt={
            photo?.alt ?? "Cinque Terre coast — default destination inspiration"
          }
        />
        <span className="photo-badge">
          {trip.itinerary ? "AI itinerary · Saved" : "Saved trip intent"}
        </span>
      </div>
      <div className="trip-card-body">
        <p className="location">
          {trip.itinerary
            ? `${trip.itinerary.days.length} days · AI estimates`
            : "Itinerary not generated"}
        </p>
        <h3>
          {trip.itinerary?.base.city ??
            (trip.data.mode === "known"
              ? trip.data.destination
              : "An escape to discover")}
        </h3>
        <p className="trip-description">
          {trip.itinerary
            ? `${trip.itinerary.base.startDate} → ${dateAfter(trip.itinerary.base.startDate, trip.itinerary.days.length - 1)}`
            : trip.data.flexible
              ? `${trip.data.month} · ${trip.data.duration} days`
              : `${trip.data.start} → ${trip.data.end}`}{" "}
          · {trip.data.travelers}{" "}
          {trip.data.travelers === 1 ? "traveler" : "travelers"}
        </p>
        <Link className="section-link" href={`/trips/${trip.id}`}>
          Open trip <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DestinationImage } from "./destination-image";
import { destinationPhoto, type TripIntent } from "@/lib/trip-intent";
export function SavedTripCard({
  trip,
}: {
  trip: { id: string; data: TripIntent };
}) {
  const photo = destinationPhoto(
    trip.data.mode === "known" ? trip.data.destination : "",
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
        <span className="photo-badge">Saved trip intent</span>
      </div>
      <div className="trip-card-body">
        <p className="location">Itinerary not generated</p>
        <h3>
          {trip.data.mode === "known"
            ? trip.data.destination
            : "An escape to discover"}
        </h3>
        <p className="trip-description">
          {trip.data.flexible
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

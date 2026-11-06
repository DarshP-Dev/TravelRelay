import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DestinationImage } from "./destination-image";
import { destinationPhoto, type TripIntent } from "@/lib/trip-intent";
import type { Itinerary } from "@/lib/itinerary";
import { dateAfter, money, budgetMinor } from "@/lib/itinerary";
export function SavedTripCard({
  trip,
}: {
  trip: {
    id: string;
    data: TripIntent;
    itinerary?: Itinerary | null;
    generationStatus?: string | null;
  };
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
          {trip.itinerary
            ? trip.itinerary.manualEdit
              ? "Personal itinerary · Saved"
              : "AI itinerary · Saved"
            : trip.generationStatus === "failed"
              ? "Planning needs attention"
              : trip.generationStatus === "awaiting_confirmation"
                ? "Confirm your destination"
                : trip.generationStatus
                  ? "Planning in progress"
                  : "Saved trip intent"}
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
        {trip.itinerary && (
          <div className="saved-card-budget">
            <p>
              Allocation + reserve{" "}
              <strong>
                {money(trip.itinerary.totalMinor, trip.itinerary.currency)}{" "}
                {trip.itinerary.currency}
              </strong>
            </p>
            <p>
              Reserve{" "}
              {money(trip.itinerary.reserveMinor, trip.itinerary.currency)} ·
              Unallocated{" "}
              {money(
                trip.itinerary.budget?.remainingMinor ??
                  budgetMinor(trip.data) - trip.itinerary.totalMinor,
                trip.itinerary.currency,
              )}
            </p>
            <small>
              Group planning estimates · financial history in TripWallet
            </small>
          </div>
        )}
        <Link
          className="section-link"
          href={`/trips/${trip.id}${!trip.itinerary && trip.generationStatus ? "/generate" : ""}`}
        >
          {!trip.itinerary && trip.generationStatus
            ? "Continue planning"
            : "Open trip"}{" "}
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

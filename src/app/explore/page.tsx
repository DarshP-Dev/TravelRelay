import type { Metadata } from "next";
import { TripCard } from "@/components/trip-card";
import { PageHeading } from "@/components/ui";
import { curatedTrips } from "@/lib/curated-trips";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return (
    <div className="container page-content">
      <PageHeading
        eyebrow="FOLLOW YOUR CURIOSITY"
        title="Somewhere new starts here."
        description="Six thoughtful starting points. Find a place that feels like you, then make it your own."
      />
      <div className="notice">
        <strong>Editorial inspiration</strong>
        <p>
          These are hand-authored examples, not AI-generated trips. All budgets
          are illustrative per-person USD spending estimates, excluding flights
          and accommodation. Prices and availability have not been verified.
        </p>
      </div>
      <div className="trip-grid explore-grid">
        {curatedTrips.map((trip) => (
          <TripCard key={trip.id} trip={trip} expanded />
        ))}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { DestinationShowcase } from "@/components/destination-showcase";
import { curatedTrips } from "@/lib/curated-trips";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return (
    <div className="editorial-explore">
      <DestinationShowcase id="explore-journeys" trips={curatedTrips} />
    </div>
  );
}

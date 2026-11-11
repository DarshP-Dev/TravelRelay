import type { Metadata } from "next";
import { DestinationShowcase } from "@/components/destination-showcase";
import { Eyebrow } from "@/components/ui";
import { curatedTrips } from "@/lib/curated-trips";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return (
    <div className="editorial-explore">
      <div className="container">
        <div className="editorial-explore-heading">
          <Eyebrow>Curated journeys</Eyebrow>
          <h1>
            Somewhere new
            <br />
            starts <em>here.</em>
          </h1>
          <p>
            Six thoughtful starting points. Find a place that feels like you,
            then make the trip your own.
          </p>
        </div>
        <DestinationShowcase id="explore-journeys" trips={curatedTrips} />
      </div>
    </div>
  );
}

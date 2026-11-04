import { PageHeading, ButtonLink } from "@/components/ui";
import { ItineraryView } from "@/components/itinerary-view";
import { exampleIntent, exampleItinerary } from "@/lib/example-trip";
import { validateItineraryQuality } from "@/lib/itinerary-quality";
import { venueReferences } from "@/server/venue-references";
export const metadata = { title: "Example trip — editorial demonstration" };
export default function ExampleTripPage() {
  const quality = validateItineraryQuality(
    exampleItinerary,
    exampleIntent,
    exampleItinerary.base,
    venueReferences,
  );
  return (
    <div className="container page-content">
      <PageHeading
        eyebrow="EDITORIAL EXAMPLE · AVAILABLE WITHOUT AI"
        title="A little time in Paris."
        description="A read-only illustration of a TravelRelay itinerary. Explore it even when live generation is unavailable."
      >
        <ButtonLink href="/trips/new">Plan your own trip</ButtonLink>
      </PageHeading>
      <div className="notice">
        <strong>
          Hand-authored example · Not AI-generated or saved to your account.
        </strong>
        <p>
          Dates and group costs are illustrative. No availability, bookings,
          payments or live prices are shown. Opening this page makes no AI or
          PayPal request.
        </p>
      </div>
      <section className="panel">
        <ItineraryView
          itinerary={{ ...exampleItinerary, quality }}
          intent={exampleIntent}
          example
        />
      </section>
    </div>
  );
}

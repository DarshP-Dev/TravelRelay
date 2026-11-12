import type { Metadata } from "next";
import { requireUser } from "@/server/session";
import { getApp } from "@/server/runtime";
import { SavedTripCard } from "@/components/saved-trip-card";
import { Plus } from "lucide-react";
import {
  ButtonLink,
  EmptyState,
  PageHeading,
  SectionLink,
} from "@/components/ui";
import "@/components/dashboard.css";

export const metadata: Metadata = { title: "My Trips" };

export default async function TripsPage() {
  const user = await requireUser("/trips");
  const trips = await (await getApp()).trips.list(user.id);
  return (
    <>
      <PageHeading
        eyebrow="YOUR PERSONAL DEPARTURE BOARD"
        title="Every adventure, in one place."
        description="Your complete itineraries and saved plans, ready to return to."
      >
        <ButtonLink href="/trips/new">
          <Plus size={17} aria-hidden="true" />
          Create Trip
        </ButtonLink>
      </PageHeading>
      {trips.length ? (
        <div className="trip-grid dashboard-saved-list">
          {trips.map((trip) => (
            <SavedTripCard key={trip.id} trip={trip} />
          ))}
        </div>
      ) : (
        <div className="panel">
          <EmptyState
            title="Make room for your next adventure."
            description="You haven’t saved a trip yet. Start a plan or find a little inspiration. Your drafts are available from the dashboard."
            action={
              <div className="empty-actions">
                <ButtonLink href="/trips/new">
                  Explore the trip planner
                </ButtonLink>
                <SectionLink href="/explore">Browse inspirations</SectionLink>
              </div>
            }
          />
        </div>
      )}
    </>
  );
}

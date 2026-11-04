import type { Metadata } from "next";
import { Plus } from "lucide-react";
import {
  ButtonLink,
  EmptyState,
  PageHeading,
  SectionLink,
} from "@/components/ui";

export const metadata: Metadata = { title: "My Trips" };

export default function TripsPage() {
  return (
    <div className="container page-content">
      <PageHeading
        eyebrow="YOUR PERSONAL DEPARTURE BOARD"
        title="Every adventure, in one place."
        description="Your saved plans will have a home here."
      >
        <ButtonLink href="/trips/new">
          <Plus size={17} aria-hidden="true" />
          Create Trip
        </ButtonLink>
      </PageHeading>
      <div className="panel">
        <EmptyState
          title="Make room for your next adventure."
          description="Trip saving and sign-in are coming in the remaining Milestone 1 work. For now, explore the planning form or find a little inspiration."
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
    </div>
  );
}

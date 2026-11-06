import type { Metadata } from "next";
import { ArrowUpRight, Plus } from "lucide-react";
import { DestinationImage } from "@/components/destination-image";
import { TripCard } from "@/components/trip-card";
import { ButtonLink, Eyebrow, PageHeading, SectionLink } from "@/components/ui";
import { curatedTrips } from "@/lib/curated-trips";
import { requireUser } from "@/server/session";
import { getApp } from "@/server/runtime";
import { SavedTripCard } from "@/components/saved-trip-card";
import Link from "next/link";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const app = await getApp();
  const [trips, drafts] = await Promise.all([
    app.trips.list(user.id),
    app.trips.listDrafts(user.id),
  ]);
  return (
    <div className="container page-content">
      <PageHeading
        eyebrow="A WORLD OF POSSIBILITIES"
        title={
          trips.length
            ? "Your next chapter is taking shape."
            : "Your next chapter is unwritten."
        }
        description="A little space to dream, a place to bring it all together."
      >
        <ButtonLink href="/trips/new">
          <Plus size={17} aria-hidden="true" />
          Create Trip
        </ButtonLink>
      </PageHeading>
      <div className="notice">
        <strong>
          {trips.length
            ? "Your saved trips"
            : "Your adventure starts with an idea."}
        </strong>
        <p>
          {trips.length
            ? "Your plans and completed AI itineraries are saved to your account. TripWallet separates planning estimates from financial history; checkout and supplier reservations aren’t connected yet."
            : "No saved trips yet. Start a plan or explore a little inspiration. No bookings or spending records have been created."}
        </p>
      </div>
      {trips.length > 0 ? (
        <section className="trip-grid saved-trips">
          {trips.map((trip) => (
            <SavedTripCard key={trip.id} trip={trip} />
          ))}
        </section>
      ) : (
        <section className="dashboard-hero">
          <DestinationImage
            src="/images/lake-braies.jpg"
            alt="Lake Braies and the surrounding Dolomite mountains"
            priority
            sizes="100vw"
          />
          <div className="dashboard-hero-overlay" />
          <div className="dashboard-hero-copy">
            <Eyebrow>YOUR ADVENTURE STARTS WITH AN IDEA</Eyebrow>
            <h2>
              Where have you
              <br />
              been dreaming of?
            </h2>
            <p>A favorite city. A slower pace. Something entirely new.</p>
            <ButtonLink href="/trips/new">
              Shape your next trip <ArrowUpRight size={18} aria-hidden="true" />
            </ButtonLink>
          </div>
        </section>
      )}
      <div className="dashboard-summary">
        <div>
          <span>Saved trips</span>
          <strong>{trips.length}</strong>
          <p>
            {trips.length
              ? "Saved intent and completed itineraries, together."
              : "Your saved trips will appear here."}
          </p>
        </div>
        <div>
          <span>Trip budgets</span>
          <strong>Planning only</strong>
          <p>
            Planning estimates will be kept separate from verified spending.
          </p>
        </div>
        <div>
          <span>Something to look forward to</span>
          <SectionLink href="/explore">Find your inspiration</SectionLink>
          <p>Start with one of our editorial destination ideas.</p>
        </div>
      </div>
      {drafts.length > 0 && (
        <section className="panel draft-list">
          <h2>Pick up where you left off.</h2>
          {drafts.map((draft) => (
            <Link
              className="section-link"
              key={draft.id}
              href={`/trips/new${draft.slot.startsWith("revision:") ? `?source=${draft.slot.slice(9)}` : draft.slot !== "blank" ? `?template=${draft.slot}` : ""}`}
            >
              Continue {draft.data.destination || "your trip draft"} · Step{" "}
              {draft.data.step + 1}
            </Link>
          ))}
        </section>
      )}
      <section className="section">
        <div className="section-heading">
          <div>
            <Eyebrow>A LITTLE INSPIRATION</Eyebrow>
            <h2>Let curiosity lead.</h2>
          </div>
          <SectionLink href="/explore">View all destinations</SectionLink>
        </div>
        <div className="trip-grid">
          {curatedTrips.slice(3).map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      </section>
    </div>
  );
}

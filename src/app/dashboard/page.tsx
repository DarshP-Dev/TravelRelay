import type { Metadata } from "next";
import { ArrowUpRight, Plus } from "lucide-react";
import { DestinationImage } from "@/components/destination-image";
import { TripCard } from "@/components/trip-card";
import { ButtonLink, Eyebrow, PageHeading, SectionLink } from "@/components/ui";
import { curatedTrips } from "@/lib/curated-trips";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="container page-content">
      <PageHeading
        eyebrow="A WORLD OF POSSIBILITIES"
        title="Your next chapter is unwritten."
        description="A little space to dream, a place to bring it all together."
      >
        <ButtonLink href="/trips/new">
          <Plus size={17} aria-hidden="true" />
          Create Trip
        </ButtonLink>
      </PageHeading>
      <div className="notice">
        <strong>You’re exploring the foundation preview.</strong>
        <p>
          Sign-in and trip persistence are not connected yet. There are no saved
          trips, bookings, or spending records in this dashboard.
        </p>
      </div>
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
      <div className="dashboard-summary">
        <div>
          <span>Saved trips</span>
          <strong>Not connected</strong>
          <p>Your trips will appear here once persistence is available.</p>
        </div>
        <div>
          <span>Trip budgets</span>
          <strong>Not connected</strong>
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

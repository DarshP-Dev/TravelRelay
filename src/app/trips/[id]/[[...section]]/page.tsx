import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  Compass,
  Sparkles,
  Wallet,
} from "lucide-react";
import { ButtonLink, EmptyState, PageHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Trip workspace preview" };

const tabs = [
  { path: "", label: "Overview" },
  { path: "/itinerary", label: "Itinerary" },
  { path: "/wallet", label: "TripWallet" },
  { path: "/bookings", label: "Bookings" },
  { path: "/explore", label: "Explore" },
];

// Only the explicitly labeled preview exists in this foundation milestone.
export const dynamicParams = false;

export function generateStaticParams() {
  return tabs.map((tab) => ({
    id: "preview",
    section: tab.path ? [tab.path.slice(1)] : [],
  }));
}

const content = {
  "": {
    title: "Your whole trip will come together here.",
    description:
      "Daily plans, budget summaries, and booking details will appear after a real trip is saved and generated. This is an empty layout preview, not a trip record.",
    icon: Compass,
  },
  itinerary: {
    title: "Leave room for the days ahead.",
    description:
      "Your day-by-day timeline will appear after validated AI generation is connected. No activities, times, or availability have been generated.",
    icon: CalendarDays,
  },
  wallet: {
    title: "A thoughtful home for your trip budget.",
    description:
      "TripWallet will be a planning ledger, not a PayPal balance. Budget allocation, verified spending, refunds, and FX estimates are not connected yet.",
    icon: Wallet,
  },
  bookings: {
    title: "Booking details, without the guesswork.",
    description:
      "There are no reservations or payments here. Supported demo merchant experiences and server-verified PayPal Sandbox checkout will be introduced later.",
    icon: BookOpen,
  },
  explore: {
    title: "Find something that fits your trip.",
    description:
      "Context-aware discovery will follow a saved, generated itinerary. For now, browse our hand-curated destination inspirations.",
    icon: Compass,
  },
};

export default async function TripWorkspacePage({
  params,
}: {
  params: Promise<{ id: string; section?: string[] }>;
}) {
  const { id, section } = await params;
  const active = section?.[0] ?? "";
  if (
    id !== "preview" ||
    (section?.length ?? 0) > 1 ||
    !Object.hasOwn(content, active)
  )
    notFound();
  const selected = content[active as keyof typeof content];
  return (
    <div className="container page-content">
      <PageHeading
        eyebrow="TRIP WORKSPACE · LAYOUT PREVIEW"
        title="A home for your next adventure."
        description="One calm space for the details, the decisions, and everything in between."
      />
      <div className="notice">
        <strong>No saved trip is open.</strong>
        <p>
          This public shell demonstrates navigation only. Authentication, trip
          storage, AI, and financial services are not connected.
        </p>
      </div>
      <nav className="trip-tabs" aria-label="Trip sections">
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            href={`/trips/preview${tab.path}`}
            aria-current={active === tab.path.slice(1) ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="workspace-layout">
        <section className="panel workspace-main">
          {active === "" && (
            <div className="workspace-metrics">
              {["Total budget", "Projected costs", "Unallocated budget"].map(
                (label) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>—</strong>
                    <small>No trip data</small>
                  </div>
                ),
              )}
            </div>
          )}
          <EmptyState
            icon={<selected.icon size={30} aria-hidden="true" />}
            title={selected.title}
            description={selected.description}
            action={
              <ButtonLink
                href={active === "explore" ? "/explore" : "/trips/new"}
              >
                {active === "explore"
                  ? "Browse inspirations"
                  : "Explore the planning form"}
              </ButtonLink>
            }
          />
        </section>
        <details className="assistant-panel">
          <summary>
            <Sparkles size={18} aria-hidden="true" />
            Ask TravelRelay
          </summary>
          <div className="assistant-content">
            <div className="assistant-symbol">
              <Sparkles size={28} aria-hidden="true" />
            </div>
            <h2>
              A little help,
              <br />
              alongside your plans.
            </h2>
            <p>
              Your context-aware trip companion will live here. AI is not
              connected in this foundation preview.
            </p>
            <p>
              Future suggestions will need your review and approval. No changes,
              purchases, or refunds can be made here.
            </p>
            <label className="field">
              Message TravelRelay
              <textarea
                disabled
                placeholder="AI assistant coming in a later milestone"
                rows={3}
              />
            </label>
          </div>
        </details>
      </div>
    </div>
  );
}

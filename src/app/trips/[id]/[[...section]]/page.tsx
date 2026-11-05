import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getApp } from "@/server/runtime";
import { RequestError } from "@/server/trips";
import { destinationPhoto } from "@/lib/trip-intent";
import { DestinationImage } from "@/components/destination-image";
import {
  BookOpen,
  CalendarDays,
  Compass,
  Sparkles,
  Wallet,
} from "lucide-react";
import { ButtonLink, EmptyState, PageHeading } from "@/components/ui";
import { ItineraryView } from "@/components/itinerary-view";
import { ItineraryWorkspace } from "@/components/itinerary-workspace";

export const metadata: Metadata = { title: "Trip workspace" };

const tabs = [
  { path: "", label: "Overview" },
  { path: "/itinerary", label: "Itinerary" },
  { path: "/wallet", label: "TripWallet" },
  { path: "/bookings", label: "Bookings" },
  { path: "/explore", label: "Explore" },
];

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
  if ((section?.length ?? 0) > 1 || !Object.hasOwn(content, active)) notFound();
  const user = await requireUser(`/trips/${id}${active ? `/${active}` : ""}`);
  const saved = await (async () => {
    if (id === "preview") return null;
    try {
      return await (await getApp()).trips.read(user.id, id);
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) notFound();
      throw error;
    }
  })();
  const photo = destinationPhoto(
    saved?.data.mode === "known" ? saved.data.destination : "",
  );
  const selected = content[active as keyof typeof content];
  const editingSnapshot =
    saved?.itinerary && active === "itinerary"
      ? await (await getApp()).itineraryEditor.read(user.id, id)
      : null;
  return (
    <div className="container page-content">
      <PageHeading
        eyebrow={
          saved?.itinerary
            ? "YOUR PERSONAL ITINERARY"
            : saved
              ? "SAVED TRIP INTENT"
              : "TRIP WORKSPACE · LAYOUT PREVIEW"
        }
        title={
          saved?.itinerary
            ? `${saved.itinerary.base.city}, ${saved.itinerary.base.country}`
            : saved
              ? saved.data.mode === "known"
                ? saved.data.destination
                : "Your escape, taking shape."
              : "A home for your next adventure."
        }
        description="One calm space for the details, the decisions, and everything in between."
      />
      <div className="notice">
        <strong>
          {saved?.itinerary
            ? "Your complete itinerary is saved."
            : saved
              ? "Your trip intent is saved."
              : "No saved trip is open."}
        </strong>
        <p>
          {saved?.itinerary
            ? saved.itinerary.manualEdit
              ? "This itinerary combines your edits and AI estimates. Costs and schedules are planning estimates, not verified availability or prices. No bookings, payments or spending records have been created."
              : "Activities, costs and schedules are AI estimates, not verified availability or prices. No bookings, payments or spending records have been created."
            : saved
              ? "Your dates, budget, and preferences are stored in your account. Confirm one base city to generate your personalized itinerary."
              : "This is a layout preview. No saved trip is open, and AI and financial services aren’t connected."}
        </p>
      </div>
      <nav className="trip-tabs" aria-label="Trip sections">
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            href={`/trips/${id}${tab.path}`}
            aria-current={active === tab.path.slice(1) ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="workspace-layout">
        <section className="panel workspace-main">
          {saved?.itinerary &&
            ["", "itinerary"].includes(active) &&
            (active === "itinerary" ? (
              <ItineraryWorkspace
                key={id}
                tripId={id}
                snapshot={editingSnapshot!}
              />
            ) : (
              <ItineraryView
                itinerary={saved.itinerary}
                intent={saved.data}
                timeline={active === "itinerary"}
                tripId={id}
              />
            ))}
          {saved && !saved.itinerary && active === "" && (
            <>
              <div className="saved-trip-hero">
                <DestinationImage
                  src={photo?.image ?? "/images/cinque-terre.jpg"}
                  alt={
                    photo?.alt ??
                    "Cinque Terre — default destination inspiration"
                  }
                  priority
                  sizes="100vw"
                />
                <span>Destination inspiration · Itinerary not generated</span>
              </div>
              <div className="saved-intent-details">
                <h2>Your trip, at a glance</h2>
                <dl className="review-list">
                  {[
                    [
                      "Destination",
                      saved.data.mode === "known"
                        ? saved.data.destination
                        : saved.data.vibe,
                    ],
                    ["Leaving from", saved.data.departure],
                    [
                      "Dates",
                      saved.data.flexible
                        ? `${saved.data.month} · ${saved.data.duration} days`
                        : `${saved.data.start} → ${saved.data.end}`,
                    ],
                    [
                      "Travelers & pace",
                      `${saved.data.travelers} · ${saved.data.pace}`,
                    ],
                    [
                      "Total budget",
                      `${new Intl.NumberFormat("en-CA", { style: "currency", currency: saved.data.currency }).format(Number(saved.data.budget))} ${saved.data.currency} · ${saved.data.scope === "entire" ? "Entire vacation" : "Spending only"}`,
                    ],
                    ["Spending style", saved.data.style],
                    [
                      "Interests",
                      saved.data.selected.join(", ") || "Open to discovery",
                    ],
                    ["Must-see", saved.data.mustSee || "None specified"],
                    ["Avoids", saved.data.avoids || "None specified"],
                    [
                      "Dietary preferences",
                      saved.data.dietary || "None specified",
                    ],
                    [
                      "Accessibility preferences",
                      saved.data.accessibility || "None specified",
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="inline-note">
                  Destination input is saved as intent. A country, region or
                  vibe will still need a confirmed base city before generation.
                  No availability or costs have been verified.
                </p>
              </div>
            </>
          )}
          {!(saved?.itinerary && ["", "itinerary"].includes(active)) && (
            <EmptyState
              icon={<selected.icon size={30} aria-hidden="true" />}
              title={selected.title}
              description={
                saved && ["", "itinerary"].includes(active)
                  ? "Your planning intent is stored. Continue to destination confirmation and real AI generation. Your input remains saved throughout."
                  : selected.description
              }
              action={
                <ButtonLink
                  href={
                    saved &&
                    !saved.itinerary &&
                    ["", "itinerary"].includes(active)
                      ? `/trips/${id}/generate`
                      : active === "explore"
                        ? "/explore"
                        : "/trips/new"
                  }
                >
                  {saved &&
                  !saved.itinerary &&
                  ["", "itinerary"].includes(active)
                    ? "Create my itinerary"
                    : active === "explore"
                      ? "Browse inspirations"
                      : "Explore the planning form"}
                </ButtonLink>
              }
            />
          )}
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
              Your context-aware trip companion will live here. AI trip editing
              is not available yet.
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

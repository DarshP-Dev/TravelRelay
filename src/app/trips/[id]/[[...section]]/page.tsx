import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { getApp } from "@/server/runtime";
import { RequestError } from "@/server/trips";
import { destinationPhoto } from "@/lib/trip-intent";
import { DestinationImage } from "@/components/destination-image";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Compass,
  LayoutGrid,
  LifeBuoy,
  Wallet,
} from "lucide-react";
import { ButtonLink, EmptyState, PageHeading } from "@/components/ui";
import { ItineraryView } from "@/components/itinerary-view";
import { ItineraryWorkspace } from "@/components/itinerary-workspace";
import { TripWorkspaceShell } from "@/components/trip-workspace-shell";
import { TripWallet, WalletPreview } from "@/components/trip-wallet";
import { TripRecovery } from "@/components/trip-recovery";
import { assistantSuggestions } from "@/lib/assistant-suggestions";
import { dashboardTripHero } from "@/lib/dashboard-trips";
import {
  DashboardAssistant,
  DashboardBookings,
  DashboardWallet,
} from "@/components/dashboard-widgets";
import "@/components/dashboard.css";
import "@/components/premium-workspace.css";

export const metadata: Metadata = { title: "Trip workspace" };

const tabs = [
  { path: "", label: "Overview", icon: LayoutGrid },
  { path: "/itinerary", label: "Itinerary", icon: CalendarDays },
  { path: "/bookings", label: "Bookings", icon: BookOpen },
  { path: "/wallet", label: "TripWallet", icon: Wallet },
  { path: "/recovery", label: "Recovery", icon: LifeBuoy },
  { path: "/explore", label: "Explore", icon: Compass },
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
  recovery: {
    title: "Keep your trip moving when plans change.",
    description: "Trip Recovery opens once you have a saved itinerary.",
    icon: Compass,
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
  searchParams,
}: {
  params: Promise<{ id: string; section?: string[] }>;
  searchParams: Promise<{
    recovery?: string | string[];
    assistant?: string | string[];
    activity?: string | string[];
  }>;
}) {
  const { id, section } = await params;
  const active = section?.[0] ?? "";
  if ((section?.length ?? 0) > 1 || !Object.hasOwn(content, active)) notFound();
  const query = await searchParams;
  const assistantKey =
    active === "itinerary" &&
    typeof query.assistant === "string" &&
    Object.hasOwn(assistantSuggestions, query.assistant)
      ? (query.assistant as keyof typeof assistantSuggestions)
      : undefined;
  const user = await requireUser(
    `/trips/${id}${active ? `/${active}` : ""}${assistantKey ? `?assistant=${assistantKey}` : ""}`,
  );
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
  const plan = saved?.itinerary;
  const overviewTrip = saved && { ...saved, generationStatus: null };
  const featured =
    overviewTrip &&
    dashboardTripHero(overviewTrip, new Date().toISOString().slice(0, 10));
  const assistantActivity =
    active === "itinerary" && typeof query.activity === "string"
      ? plan?.days
          .flatMap((day) => day.activities)
          .find((item) => item.id === query.activity)
      : undefined;
  const suggestion = assistantActivity
    ? {
        label: "Draft an alternatives request",
        prompt: `What could I do instead of “${assistantActivity.title}” in my saved itinerary?`,
      }
    : assistantKey
      ? assistantSuggestions[assistantKey]
      : undefined;
  const selected = content[active as keyof typeof content];
  const editingSnapshot =
    saved?.itinerary && active === "itinerary"
      ? await (await getApp()).itineraryEditor.read(user.id, id)
      : null;
  const assistantSnapshot = saved?.itinerary
    ? await (await getApp()).travelAgent.read(user.id, id)
    : null;
  const walletSnapshot =
    saved && ["", "wallet", "bookings"].includes(active)
      ? await (await getApp()).wallet.read(user.id, id)
      : null;
  const commerceSnapshot =
    saved && ["itinerary", "wallet", "bookings"].includes(active)
      ? await (await getApp()).commerce.read(user.id, id)
      : null;
  const recoverySnapshot =
    saved?.itinerary && active === "recovery"
      ? await (await getApp()).recovery.read(user.id, id)
      : null;
  const recoveryLinks =
    saved?.itinerary && ["", "itinerary", "wallet", "bookings"].includes(active)
      ? await (await getApp()).recovery.links(user.id, id)
      : null;
  const recoveryId = active === "bookings" ? query.recovery : undefined;
  const requestedReplacement = recoveryLinks?.find(
    (entry) => entry.id === recoveryId,
  )?.replacementActivityId;
  const replacementActivityId =
    requestedReplacement &&
    walletSnapshot?.activities.some(
      (activity) => activity.id === requestedReplacement,
    ) &&
    !walletSnapshot.intents.some(
      (intent) =>
        intent.activityId === requestedReplacement &&
        intent.status === "planned",
    )
      ? requestedReplacement
      : undefined;
  const recoveryBookings: Record<
    string,
    { id: string; role: "original" | "replacement" }
  > = {};
  for (const entry of recoveryLinks ?? []) {
    recoveryBookings[entry.bookingId] = { id: entry.id, role: "original" };
    for (const booking of commerceSnapshot?.bookings ?? []) {
      if (booking.activityId === entry.replacementActivityId)
        recoveryBookings[booking.id] ??= { id: entry.id, role: "replacement" };
    }
  }
  return (
    <div
      className="container page-content trip-workspace-container"
      data-section={active || "overview"}
    >
      {plan && featured && ["", "itinerary"].includes(active) ? (
        <header
          className={active ? "trip-editor-header" : "trip-overview-hero"}
        >
          {(!active || !featured.inspirationPhoto) && (
            <div className="trip-header-photo" aria-hidden="true">
              <DestinationImage
                src={featured.photo.image}
                alt=""
                priority
                sizes={active ? "(max-width: 760px) 75vw, 50vw" : "95vw"}
              />
            </div>
          )}
          <div className="trip-header-copy">
            {active ? (
              <>
                <p className="eyebrow">
                  {plan.base.city}, {plan.base.country} · {featured.dates}
                </p>
                <h1>Itinerary</h1>
                <p>
                  Plan each day in {plan.base.city}, with times shown in{" "}
                  {plan.base.timeZone}.
                </p>
              </>
            ) : (
              <>
                <p className="trip-overview-status">
                  {featured.status} · Saved itinerary
                </p>
                <h1>
                  {plan.base.city}, {plan.base.country}
                </h1>
                <p>
                  {featured.dates} · {featured.details}
                </p>
                <Link
                  className="button button-primary"
                  href={`/trips/${id}/itinerary`}
                >
                  Open itinerary <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
                {featured.inspirationPhoto && <small>Travel inspiration</small>}
              </>
            )}
          </div>
        </header>
      ) : (
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
      )}
      {!(plan && ["", "itinerary"].includes(active)) && (
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
                ? "This itinerary combines your edits and AI estimates. Costs and schedules are planning estimates, not verified availability or prices. TripWallet keeps planning references separate from verified financial events."
                : "Activities, costs and schedules are AI estimates, not verified availability or prices. TripWallet keeps planning references separate from verified financial events."
              : saved
                ? "Your dates, budget, and preferences are stored in your account. Confirm one base city to generate your personalized itinerary."
                : "This is a layout preview. No saved trip is open, and AI and financial services aren’t connected."}
          </p>
        </div>
      )}
      <nav className="trip-tabs" aria-label="Trip sections">
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            href={`/trips/${id}${tab.path}`}
            aria-current={active === tab.path.slice(1) ? "page" : undefined}
          >
            <tab.icon size={18} strokeWidth={1.8} aria-hidden="true" />
            {tab.label}
          </Link>
        ))}
      </nav>
      <TripWorkspaceShell
        key={`${id}:${assistantActivity?.id ?? assistantKey ?? ""}`}
        tripId={id}
        userId={user.id}
        initial={assistantSnapshot}
        suggestion={suggestion}
        initiallyOpen={active !== ""}
      >
        <section className="panel workspace-main">
          {saved?.itinerary &&
            ["", "itinerary"].includes(active) &&
            (active === "itinerary" ? (
              <ItineraryWorkspace
                key={id}
                tripId={id}
                snapshot={editingSnapshot!}
                sandboxBookings={commerceSnapshot?.bookings}
                recoveryCases={Object.fromEntries(
                  (recoveryLinks ?? []).map((entry) => [
                    entry.activityId,
                    entry.id,
                  ]),
                )}
              />
            ) : (
              <ItineraryView
                itinerary={saved.itinerary}
                intent={saved.data}
                presentation="overview"
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
          {walletSnapshot && active === "" && !plan && (
            <WalletPreview state={walletSnapshot} />
          )}
          {active === "" && plan && overviewTrip && featured && (
            <>
              <div className="trip-overview-widgets dashboard-widget-grid">
                <DashboardWallet tripId={id} wallet={walletSnapshot} />
                <DashboardBookings tripId={id} wallet={walletSnapshot} />
                <DashboardAssistant trip={overviewTrip} featured={featured} />
              </div>
              {recoveryLinks?.length ? (
                <section className="dashboard-widget trip-overview-recovery">
                  <h2>
                    <LifeBuoy size={19} aria-hidden="true" /> Trip Recovery
                  </h2>
                  <p>
                    {recoveryLinks.length} saved{" "}
                    {recoveryLinks.length === 1 ? "case" : "cases"} for this
                    trip.
                  </p>
                  <Link
                    className="dashboard-link"
                    href={`/trips/${id}/recovery`}
                  >
                    Review recovery history{" "}
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </section>
              ) : null}
            </>
          )}
          {walletSnapshot && ["wallet", "bookings"].includes(active) && (
            <TripWallet
              key={`${id}:${active}:${recoveryId ?? ""}`}
              initial={walletSnapshot}
              bookings={active === "bookings"}
              commerce={commerceSnapshot!}
              recoveryLinks={recoveryLinks ? recoveryBookings : undefined}
              replacementActivityId={replacementActivityId}
              replacementCaseId={
                replacementActivityId && typeof recoveryId === "string"
                  ? recoveryId
                  : undefined
              }
            />
          )}
          {recoverySnapshot && (
            <TripRecovery key={id} tripId={id} initial={recoverySnapshot} />
          )}
          {!(saved?.itinerary && ["", "itinerary"].includes(active)) &&
            !recoverySnapshot &&
            !(walletSnapshot && ["wallet", "bookings"].includes(active)) && (
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
      </TripWorkspaceShell>
    </div>
  );
}

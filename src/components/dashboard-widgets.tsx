import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Compass,
  LifeBuoy,
  ShieldCheck,
  Sparkles,
  Ticket,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { DestinationImage } from "./destination-image";
import {
  dashboardDate,
  dashboardDraftHref,
  type DashboardDraft,
  type DashboardHeroTrip,
  type DashboardTrip,
} from "@/lib/dashboard-trips";
import { assistantSuggestions } from "@/lib/assistant-suggestions";
import { curatedTrips } from "@/lib/curated-trips";
import { money } from "@/lib/itinerary";
import {
  dayRoleLabels,
  isTransitDay,
  travelDayRole,
  travelWindow,
} from "@/lib/travel-days";
import type { WalletState } from "@/server/wallet";

function DashboardLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link className="dashboard-link" href={href}>
      {children} <ArrowUpRight size={16} aria-hidden="true" />
    </Link>
  );
}

function DashboardWidget({
  title,
  icon: Icon,
  className,
  children,
}: {
  title: string;
  icon: typeof Compass;
  className: string;
  children: ReactNode;
}) {
  return (
    <section className={`dashboard-widget ${className}`}>
      <h2>
        <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function NextStep({
  trip,
  featured,
  drafts,
  wallet,
}: {
  trip?: DashboardTrip;
  featured: DashboardHeroTrip;
  drafts: readonly DashboardDraft[];
  wallet: WalletState | null;
}) {
  const draft = drafts[0];
  const pendingPayment = wallet?.intents.some(({ state }) =>
    [
      "checkout_pending",
      "authorized",
      "payment_pending",
      "refund_pending",
      "payment_failed",
      "refund_failed",
    ].includes(state.status),
  );
  const next =
    !trip || featured.status === "Past trip"
      ? draft
        ? {
            title: "Pick up your saved draft",
            text: `Your choices are saved through step ${draft.data.step + 1} of 4.`,
            label: "Resume your draft",
            href: dashboardDraftHref(draft),
          }
        : {
            title: "Start with a destination",
            text: "Choose somewhere you love or explore ideas, then set the pace, dates, and group budget.",
            label: "Plan a new trip",
            href: "/trips/new",
          }
      : !trip.itinerary
        ? {
            title: featured.status,
            text: "Your trip details are saved. Open the planner to see the current generation status and available actions.",
            ...featured.action,
          }
        : pendingPayment
          ? {
              title: "Review a booking update",
              text: "Check the latest Sandbox payment or refund status for this trip.",
              label: "Review bookings",
              href: `/trips/${trip.id}/bookings`,
            }
          : draft
            ? {
                title: "Continue your saved draft",
                text: `Your itinerary is saved. You also have a draft at step ${draft.data.step + 1} of 4.`,
                label: "Resume your draft",
                href: dashboardDraftHref(draft),
              }
            : {
                title: "Your itinerary is ready",
                text: "Review the day-by-day plan and check venue hours and availability before you go.",
                label: "Review itinerary",
                href: `/trips/${trip.id}/itinerary`,
              };
  const remainingDrafts = drafts.filter(
    (item) => dashboardDraftHref(item) !== next.href,
  );

  return (
    <DashboardWidget
      title="Next step"
      icon={Compass}
      className="dashboard-next"
    >
      <h3>{next.title}</h3>
      <p>{next.text}</p>
      <DashboardLink href={next.href}>{next.label}</DashboardLink>
      {!!remainingDrafts.length && (
        <details className="dashboard-drafts">
          <summary>Saved drafts ({remainingDrafts.length})</summary>
          {remainingDrafts.map((item) => (
            <DashboardLink key={item.id} href={dashboardDraftHref(item)}>
              {item.data.destination || "Trip draft"} · Step{" "}
              {item.data.step + 1}
            </DashboardLink>
          ))}
        </details>
      )}
    </DashboardWidget>
  );
}

function DashboardItinerary({
  trip,
  featured,
  today,
}: {
  trip: DashboardTrip;
  featured: DashboardHeroTrip;
  today: string;
}) {
  const itinerary = trip.itinerary;
  const firstDay = Math.max(
    0,
    itinerary?.days.findIndex((day) => day.date >= today) ?? 0,
  );
  const travel = itinerary
    ? travelWindow(itinerary.days.length, itinerary.base.travelTiming)
    : null;

  return (
    <DashboardWidget
      title="Your itinerary"
      icon={CalendarDays}
      className="dashboard-itinerary"
    >
      {itinerary && travel ? (
        <>
          <p className="dashboard-widget-caption">
            {itinerary.days.length}-day travel window · {itinerary.base.city}
          </p>
          <ol className="dashboard-day-list">
            {itinerary.days.slice(firstDay, firstDay + 3).map((day, offset) => {
              const index = firstDay + offset;
              const role = travelDayRole(index, travel);
              return (
                <li key={day.id}>
                  <Link href={`/trips/${trip.id}/itinerary#day-${day.id}`}>
                    <span className="dashboard-day-photo" aria-hidden="true">
                      {isTransitDay(role) || featured.inspirationPhoto ? (
                        <CalendarDays size={22} />
                      ) : (
                        <DestinationImage
                          src={featured.photo.image}
                          alt=""
                          sizes="105px"
                        />
                      )}
                    </span>
                    <span className="dashboard-day-copy">
                      <small>
                        Day {index + 1} ·{" "}
                        <time dateTime={day.date}>
                          {dashboardDate(day.date)}
                        </time>
                      </small>
                      <strong>
                        {isTransitDay(role) ? dayRoleLabels[role] : day.title}
                      </strong>
                      <span>
                        {isTransitDay(role)
                          ? "Reserved for travel"
                          : day.activities
                              .slice(0, 2)
                              .map((activity) => activity.title)
                              .join(" · ") || "No scheduled activities"}
                      </span>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ol>
          <DashboardLink href={`/trips/${trip.id}/itinerary`}>
            Full itinerary
          </DashboardLink>
        </>
      ) : (
        <>
          <p>Day plans will appear here when your itinerary is saved.</p>
          <DashboardLink href={featured.action.href}>
            {featured.action.label}
          </DashboardLink>
        </>
      )}
    </DashboardWidget>
  );
}

export function DashboardWallet({
  tripId,
  wallet,
}: {
  tripId: string;
  wallet: WalletState | null;
}) {
  const href = `/trips/${tripId}/wallet`;
  const budget = wallet?.budget;
  const currency = wallet?.currency;
  const actual =
    wallet?.summary.native.filter((total) => total.capturedMinor > 0) ?? [];
  return (
    <DashboardWidget
      title="TripWallet"
      icon={Wallet}
      className="dashboard-wallet"
    >
      {budget && currency ? (
        <>
          <p className="dashboard-wallet-total">
            {money(budget.selectedBudgetMinor, currency)}{" "}
            <small>{currency} group budget</small>
          </p>
          <div className="dashboard-budget-bar" aria-hidden="true">
            <span
              data-budget="planned"
              style={{ flexGrow: budget.allocatedMinor }}
            />
            <span
              data-budget="reserve"
              style={{ flexGrow: budget.reserveMinor }}
            />
            <span
              data-budget="remaining"
              style={{ flexGrow: Math.max(0, budget.remainingMinor) }}
            />
          </div>
          <dl className="dashboard-budget-legend">
            <div data-budget="planned">
              <dt>Planned allocation</dt>
              <dd>{money(budget.allocatedMinor, currency)}</dd>
            </div>
            <div data-budget="reserve">
              <dt>Emergency reserve</dt>
              <dd>{money(budget.reserveMinor, currency)}</dd>
            </div>
            <div data-budget="remaining">
              <dt>
                {budget.remainingMinor < 0 ? "Over budget" : "Unallocated"}
              </dt>
              <dd>{money(Math.abs(budget.remainingMinor), currency)}</dd>
            </div>
          </dl>
          <div className="dashboard-actual">
            <strong>Verified PayPal Sandbox activity</strong>
            {actual.length ? (
              <ul>
                {actual.map((entry) => (
                  <li key={entry.currency}>
                    {money(entry.netMinor, entry.currency)} {entry.currency} net
                    {entry.refundedMinor > 0 &&
                      ` · ${money(entry.refundedMinor, entry.currency)} refunded`}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No verified Sandbox payments for this trip.</p>
            )}
          </div>
        </>
      ) : (
        <p>TripWallet is temporarily unavailable.</p>
      )}
      <DashboardLink href={href}>Open TripWallet</DashboardLink>
    </DashboardWidget>
  );
}

export function DashboardAssistant({
  trip,
  featured,
}: {
  trip: DashboardTrip;
  featured: DashboardHeroTrip;
}) {
  return (
    <DashboardWidget
      title="AI travel companion"
      icon={Sparkles}
      className="dashboard-assistant"
    >
      {trip.itinerary ? (
        <>
          <p className="dashboard-widget-caption">
            Ask TravelRelay about {featured.name}.
          </p>
          <div className="dashboard-assistant-links">
            {(
              [
                ["itinerary", CalendarDays],
                ["budget", Wallet],
              ] as const
            ).map(([key, Icon]) => (
              <DashboardLink
                key={key}
                href={`/trips/${trip.id}/itinerary?assistant=${key}`}
              >
                <Icon size={17} aria-hidden="true" />
                {assistantSuggestions[key].label}
              </DashboardLink>
            ))}
            <DashboardLink href={`/trips/${trip.id}/recovery`}>
              <LifeBuoy size={17} aria-hidden="true" /> Handle a canceled
              activity
            </DashboardLink>
          </div>
        </>
      ) : (
        <>
          <p>
            Save an itinerary to ask about this trip, its schedule, or its
            budget.
          </p>
          <DashboardLink href={featured.action.href}>
            {featured.action.label}
          </DashboardLink>
        </>
      )}
    </DashboardWidget>
  );
}

const bookingStatuses: Record<string, string> = {
  checkout_pending: "Checkout pending",
  authorized: "Authorized · awaiting capture",
  payment_pending: "Payment pending",
  captured: "Sandbox payment verified",
  refunded: "Sandbox payment refunded",
  partially_refunded: "Sandbox payment partially refunded",
  refund_pending: "Sandbox refund pending",
  payment_failed: "Payment failed",
  payment_canceled: "Payment canceled",
};

export function DashboardBookings({
  tripId,
  wallet,
}: {
  tripId: string;
  wallet: WalletState | null;
}) {
  const items = wallet?.intents ?? [];
  return (
    <DashboardWidget
      title="Bookings & payments"
      icon={Ticket}
      className="dashboard-bookings"
    >
      {!wallet ? (
        <p>Booking activity is temporarily unavailable.</p>
      ) : items.length ? (
        <>
          <ul className="dashboard-booking-list">
            {[...items]
              .reverse()
              .slice(0, 3)
              .map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.state.status === "unpaid"
                      ? item.status === "planned"
                        ? "Planning quote"
                        : "Closed planning quote"
                      : (bookingStatuses[item.state.status] ??
                        item.state.status.replaceAll("_", " "))}
                  </span>
                  {item.state.capturedMinor > 0 && (
                    <small>
                      {money(item.state.capturedMinor, item.originalCurrency)}{" "}
                      {item.originalCurrency} captured
                      {item.state.refundedMinor > 0 &&
                        ` · ${money(item.state.refundedMinor, item.originalCurrency)} refunded`}
                    </small>
                  )}
                </li>
              ))}
          </ul>
          <p className="dashboard-booking-note">
            <ShieldCheck size={15} aria-hidden="true" /> Planning quotes and
            Sandbox payments do not reserve supplier inventory.
          </p>
        </>
      ) : (
        <p>No planning quotes or PayPal Sandbox activity for this trip yet.</p>
      )}
      <DashboardLink href={`/trips/${tripId}/bookings`}>
        Open bookings
      </DashboardLink>
    </DashboardWidget>
  );
}

function DashboardInspiration({
  photo,
  interests,
}: {
  photo: string;
  interests: readonly string[];
}) {
  const relevance = (journey: (typeof curatedTrips)[number]) =>
    journey.interests.filter((interest) => interests.includes(interest)).length;
  const [pick] = curatedTrips
    .filter((journey) => journey.image !== photo)
    .sort((a, b) => relevance(b) - relevance(a));
  return (
    <section className="dashboard-widget dashboard-inspiration">
      <h2>
        <Compass size={19} aria-hidden="true" /> Explore a curated journey
      </h2>
      <div className="dashboard-inspiration-photo">
        <DestinationImage
          src={pick.image}
          alt={pick.alt}
          sizes="(max-width: 700px) 90vw, 30vw"
        />
        <div className="dashboard-inspiration-copy">
          <h3>{pick.title}</h3>
          <p>
            {pick.country} · {pick.days}-day curated journey
          </p>
          <DashboardLink href={`/explore/${pick.id}`}>
            Explore the journey
          </DashboardLink>
        </div>
      </div>
    </section>
  );
}

export function DashboardWidgets({
  trip,
  featured,
  drafts,
  wallet,
  today,
}: {
  trip?: DashboardTrip;
  featured: DashboardHeroTrip;
  drafts: readonly DashboardDraft[];
  wallet: WalletState | null;
  today: string;
}) {
  return (
    <div className="dashboard-widget-grid" data-has-trip={!!trip}>
      {trip && (
        <>
          <DashboardItinerary trip={trip} featured={featured} today={today} />
          <DashboardWallet tripId={trip.id} wallet={wallet} />
          <DashboardAssistant trip={trip} featured={featured} />
        </>
      )}
      <NextStep
        trip={trip}
        featured={featured}
        drafts={drafts}
        wallet={wallet}
      />
      {trip && <DashboardBookings tripId={trip.id} wallet={wallet} />}
      <DashboardInspiration
        photo={featured.photo.image}
        interests={trip?.data.selected ?? drafts[0]?.data.selected ?? []}
      />
    </div>
  );
}

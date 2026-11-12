import type { Metadata } from "next";
import { DashboardTripHero } from "@/components/dashboard-trip-hero";
import { DashboardWidgets } from "@/components/dashboard-widgets";
import {
  chooseDashboardTrip,
  dashboardTripHero,
  dashboardWelcomeHero,
} from "@/lib/dashboard-trips";
import { requireUser } from "@/server/session";
import { getApp } from "@/server/runtime";
import "@/components/dashboard.css";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ trip?: string | string[] }>;
}) {
  const { trip: requested } = await searchParams;
  const user = await requireUser();
  const app = await getApp();
  const [trips, drafts] = await Promise.all([
    app.trips.list(user.id),
    app.trips.listDrafts(user.id),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const selected = chooseDashboardTrip(
    trips,
    typeof requested === "string" ? requested : undefined,
    today,
  );
  const featured = selected
    ? dashboardTripHero(selected, today)
    : dashboardWelcomeHero(drafts[0]);
  const wallet = selected
    ? await app.wallet.read(user.id, selected.id).catch(() => null)
    : null;
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <>
      <header className="dashboard-heading">
        <h1>{firstName ? `Welcome, ${firstName}` : "Your travel dashboard"}</h1>
      </header>
      <DashboardTripHero
        featured={featured}
        trips={trips.map((trip) => dashboardTripHero(trip, today))}
      />
      <DashboardWidgets
        trip={selected}
        featured={featured}
        drafts={drafts}
        wallet={wallet}
        today={today}
      />
    </>
  );
}

import Link from "next/link";
import {
  Compass,
  LayoutDashboard,
  Luggage,
  Plus,
  Ticket,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import "./dashboard.css";

export function DashboardShell({
  active,
  tripId,
  children,
}: {
  active: "dashboard" | "trips";
  tripId?: string;
  children: ReactNode;
}) {
  const destinations = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/trips", label: "My Trips", icon: Luggage },
    { href: "/explore", label: "Explore", icon: Compass },
    { href: "/trips/new", label: "Create Trip", icon: Plus },
    ...(tripId
      ? [{ href: `/trips/${tripId}/bookings`, label: "Bookings", icon: Ticket }]
      : []),
    { href: "/profile", label: "Profile", icon: UserRound },
  ];
  return (
    <div className="travel-dashboard">
      <div className="travel-dashboard-canvas">
        <nav className="travel-dashboard-nav" aria-label="Travel dashboard">
          {destinations.map(({ href, label, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              aria-label={label}
              title={label}
              aria-current={
                href === (active === "dashboard" ? "/dashboard" : "/trips")
                  ? "page"
                  : undefined
              }
            >
              <Icon size={22} strokeWidth={1.7} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="travel-dashboard-main">{children}</div>
      </div>
    </div>
  );
}

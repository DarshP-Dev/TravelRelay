import {
  Compass,
  LayoutDashboard,
  Luggage,
  Plus,
  UserRound,
} from "lucide-react";

export const appNavigation = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    private: true,
  },
  { href: "/trips", label: "My Trips", icon: Luggage, private: true },
  { href: "/explore", label: "Explore", icon: Compass, private: false },
  { href: "/trips/new", label: "Create Trip", icon: Plus, private: false },
] as const;

export const accountRoute = {
  href: "/profile",
  label: "Profile",
  icon: UserRound,
} as const;

export function isActiveAppRoute(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/trips")
    return pathname.startsWith("/trips/") && pathname !== "/trips/new";
  return href === "/explore" && pathname.startsWith("/explore/");
}

export function isAppRoute(pathname: string) {
  return (
    pathname === accountRoute.href ||
    appNavigation.some(({ href }) => isActiveAppRoute(pathname, href))
  );
}

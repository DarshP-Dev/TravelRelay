"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Plus, UserRound, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const navigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/trips", label: "My Trips" },
  { href: "/explore", label: "Explore" },
];

function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

const subscribeToNothing = () => () => {};
const atPageTop = () => true;
const isAtPageTop = () => window.scrollY < 24;

function Brand() {
  return (
    <Link href="/" className="brand" aria-label="TravelRelay home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M20.9 3.1a2 2 0 0 1 0 2.8l-4.5 4.5 1.8 7.8-1.8 1.8-3.6-6-4.4 4.3.1 2.3-1.4 1.4-1.7-3.4L2 16.9l1.4-1.4 2.3.1 4.3-4.4-6-3.6 1.8-1.8 7.8 1.8 4.5-4.5a2 2 0 0 1 2.8 0Z" />
        </svg>
      </span>
      Travel<span className="brand-light">Relay</span>
      <span className="brand-dot">.</span>
    </Link>
  );
}

export function SiteHeader() {
  const {
    data: session,
    isPending,
    error: sessionError,
  } = authClient.useSession();
  const pathname = usePathname();
  const home = pathname === "/";
  const overHero = useSyncExternalStore(
    home ? subscribeToScroll : subscribeToNothing,
    home ? isAtPageTop : atPageTop,
    atPageTop,
  );
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const query = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => {
      if (!home && query.matches) setOpenPath(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenPath(null);
        toggleRef.current?.focus();
      }
    };
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !navRef.current?.contains(event.target) &&
        !toggleRef.current?.contains(event.target)
      )
        setOpenPath(null);
    };
    query.addEventListener("change", closeOnDesktop);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      query.removeEventListener("change", closeOnDesktop);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [home, open]);

  function active(href: string) {
    return (
      pathname === href ||
      (href === "/trips" &&
        pathname.startsWith("/trips/") &&
        pathname !== "/trips/new")
    );
  }

  return (
    <header
      className={`site-header${home ? " site-header--cinematic" : ""}${home && overHero ? " site-header--on-image" : ""}`}
    >
      <div className="header-inner">
        <Brand />
        <button
          ref={toggleRef}
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="global-navigation"
          aria-label={
            home ? "Menu" : open ? "Close navigation" : "Open navigation"
          }
          onClick={() => setOpenPath(open ? null : pathname)}
        >
          {home && <span>Menu</span>}
          {open ? (
            <X size={22} aria-hidden="true" />
          ) : (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3 8h18M9 16h12" />
            </svg>
          )}
        </button>
        <nav
          ref={navRef}
          id="global-navigation"
          className={`global-nav ${open ? "is-open" : ""}`}
          aria-label="Global navigation"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpenPath(null);
          }}
        >
          <div className="nav-links">
            {(session
              ? navigation
              : [
                  { href: "/explore", label: "Explore" },
                  { href: "/#how-it-works", label: "How it works" },
                ]
            ).map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={active(href) ? "nav-link active" : "nav-link"}
                aria-current={active(href) ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="nav-actions">
            {!session && (
              <Link href="/login" className="nav-link">
                {isPending
                  ? "Account…"
                  : sessionError
                    ? "Account unavailable"
                    : "Sign in"}
              </Link>
            )}
            <Link
              href="/trips/new"
              className="button button-primary nav-create"
              aria-current={pathname === "/trips/new" ? "page" : undefined}
            >
              <Plus size={16} aria-hidden="true" />
              Create Trip
            </Link>
            {session && (
              <Link
                href="/profile"
                className="profile-link"
                aria-label="Profile"
                aria-current={pathname === "/profile" ? "page" : undefined}
              >
                <UserRound size={20} aria-hidden="true" />
                <span>Profile</span>
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

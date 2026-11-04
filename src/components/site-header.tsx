"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, Plus, UserRound, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const navigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/trips", label: "My Trips" },
  { href: "/explore", label: "Explore" },
];

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="TravelRelay home">
      <span className="brand-mark">
        <ArrowUpRight size={23} strokeWidth={2.5} aria-hidden="true" />
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
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const query = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => {
      if (query.matches) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !navRef.current?.contains(event.target) &&
        !toggleRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    query.addEventListener("change", closeOnDesktop);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      query.removeEventListener("change", closeOnDesktop);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);

  function active(href: string) {
    return (
      pathname === href ||
      (href === "/trips" &&
        pathname.startsWith("/trips/") &&
        pathname !== "/trips/new")
    );
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <button
          ref={toggleRef}
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="global-navigation"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen(!open)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <nav
          ref={navRef}
          id="global-navigation"
          className={`global-nav ${open ? "is-open" : ""}`}
          aria-label="Global navigation"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
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

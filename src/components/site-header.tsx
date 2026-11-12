"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  accountRoute,
  appNavigation,
  isActiveAppRoute,
  isAppRoute,
} from "@/lib/app-navigation";

function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

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

function HeaderControls({
  pathname,
  signedIn,
}: {
  pathname: string;
  signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    navRef.current?.querySelector("a")?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !controlsRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);
  const AccountIcon = accountRoute.icon;
  const menuLinks = [
    ...appNavigation.filter((route) => signedIn || !route.private),
    ...(signedIn
      ? [accountRoute]
      : [
          { href: "/#how-it-works", label: "How it works" },
          { href: "/login", label: "Sign in" },
        ]),
  ];

  return (
    <div
      className="header-controls"
      ref={controlsRef}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
    >
      {signedIn && (
        <Link
          className="header-account"
          href={accountRoute.href}
          aria-label="Account profile"
          aria-current={pathname === accountRoute.href ? "page" : undefined}
          title="Account profile"
          onClick={() => setOpen(false)}
        >
          <AccountIcon size={22} strokeWidth={1.7} aria-hidden="true" />
        </Link>
      )}
      <button
        ref={toggleRef}
        type="button"
        className="menu-toggle"
        aria-expanded={open}
        aria-controls="global-navigation"
        aria-label="Menu"
        onClick={() => setOpen(!open)}
      >
        <span>Menu</span>
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
        className="global-nav"
        data-open={open}
        inert={!open}
        aria-label="Global navigation"
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a")) {
            setOpen(false);
            toggleRef.current?.focus();
          }
        }}
      >
        <div className="nav-links">
          {menuLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="nav-link"
              aria-current={
                isActiveAppRoute(pathname, href) ? "page" : undefined
              }
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function SiteHeader() {
  const { data: session } = authClient.useSession();
  const pathname = usePathname();
  const home = pathname === "/";
  const atTop = useSyncExternalStore(subscribeToScroll, isAtPageTop, atPageTop);
  const variant = home
    ? "site-header--home"
    : isAppRoute(pathname)
      ? "site-header--workspace"
      : "site-header--interior";

  return (
    <header
      className={`site-header site-header--cinematic ${variant}${home && atTop ? " site-header--on-image" : ""}`}
      data-scrolled={!atTop}
    >
      <div className="header-inner">
        <Brand />
        <HeaderControls
          key={pathname}
          pathname={pathname}
          signedIn={!!session}
        />
      </div>
    </header>
  );
}

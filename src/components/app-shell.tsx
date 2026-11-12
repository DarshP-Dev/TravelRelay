"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  appNavigation,
  isActiveAppRoute,
  isAppRoute,
} from "@/lib/app-navigation";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const internal = isAppRoute(pathname);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={internal ? "travel-app" : undefined}
    >
      {internal ? (
        <div className="travel-app-canvas">
          <nav className="travel-app-rail" aria-label="Travel workspace">
            {appNavigation.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={
                  isActiveAppRoute(pathname, href) ? "page" : undefined
                }
              >
                <Icon size={22} strokeWidth={1.7} aria-hidden="true" />
                <span aria-hidden="true">{label}</span>
              </Link>
            ))}
          </nav>
          <div className="travel-app-content">{children}</div>
        </div>
      ) : (
        children
      )}
    </main>
  );
}

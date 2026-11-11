"use client";

import { DashboardShell } from "@/components/dashboard-shell";

export default function DashboardError({ retry }: { retry: () => void }) {
  return (
    <DashboardShell active="dashboard">
      <section className="dashboard-widget dashboard-error" role="alert">
        <h1>Your dashboard is temporarily unavailable.</h1>
        <button type="button" className="button button-primary" onClick={retry}>
          Try again
        </button>
      </section>
    </DashboardShell>
  );
}

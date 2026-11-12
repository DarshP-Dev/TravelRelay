import "@/components/dashboard.css";

export default function DashboardLoading() {
  return (
    <div className="dashboard-loading" role="status">
      <p>Loading your trips…</p>
      <div className="dashboard-skeleton-hero" aria-hidden="true" />
      <div className="dashboard-skeleton-widgets" aria-hidden="true">
        <span />
        <span />
      </div>
    </div>
  );
}

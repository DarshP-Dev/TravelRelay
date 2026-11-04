"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container page-content">
      <div className="empty-state" role="alert">
        <h1>Something interrupted the journey.</h1>
        <p>We couldn’t load this page. Try again in a moment.</p>
        <button className="button button-primary" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </div>
  );
}

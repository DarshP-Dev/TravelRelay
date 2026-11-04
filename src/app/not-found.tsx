import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="container page-content">
      <EmptyState
        title="A little off the beaten path."
        description="This page or trip isn’t available. No trip records are connected in this foundation preview."
        action={<ButtonLink href="/">Back to TravelRelay</ButtonLink>}
      />
    </div>
  );
}

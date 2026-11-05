import type { Metadata } from "next";
import { TripWizard } from "@/components/trip-wizard";
import { PageHeading } from "@/components/ui";
import { getTemplate } from "@/lib/curated-trips";
import { requireUser } from "@/server/session";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Create Trip" };

export default async function CreateTripPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; source?: string }>;
}) {
  const { template: templateId, source } = await searchParams;
  const template = getTemplate(templateId);
  if (templateId && !template) notFound();
  if (templateId && source) notFound();
  const user = await requireUser(
    `/trips/new${source ? `?source=${encodeURIComponent(source)}` : template ? `?template=${template.id}` : ""}`,
  );
  return (
    <div className="container page-content wizard-page">
      <PageHeading
        eyebrow="LET’S MAKE ROOM FOR SOMETHING GOOD"
        title="What does your next adventure look like?"
        description="A few thoughtful details. A trip that feels like you."
      />
      <TripWizard
        key={`${user.id}:${source ?? template?.id ?? "new"}`}
        template={source ? undefined : template}
        sourceTripId={source}
        userId={user.id}
      />
    </div>
  );
}

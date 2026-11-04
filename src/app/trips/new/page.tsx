import type { Metadata } from "next";
import { TripWizard } from "@/components/trip-wizard";
import { PageHeading } from "@/components/ui";
import { getTemplate } from "@/lib/curated-trips";

export const metadata: Metadata = { title: "Create Trip" };

export default async function CreateTripPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const { template: templateId } = await searchParams;
  const template = getTemplate(templateId);
  return (
    <div className="container page-content wizard-page">
      <PageHeading
        eyebrow="LET’S MAKE ROOM FOR SOMETHING GOOD"
        title="What does your next adventure look like?"
        description="A few thoughtful details. A trip that feels like you."
      />
      <TripWizard key={template?.id ?? "new"} template={template} />
    </div>
  );
}

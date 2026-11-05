import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { curatedTrips, getTemplate } from "@/lib/curated-trips";
import { DestinationImage } from "@/components/destination-image";
import { ButtonLink, PageHeading } from "@/components/ui";

export const dynamicParams = false;
export function generateStaticParams() {
  return curatedTrips.map((trip) => ({ templateId: trip.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ templateId: string }>;
}): Promise<Metadata> {
  const template = getTemplate((await params).templateId);
  return { title: template?.title ?? "Inspiration not found" };
}
export default async function CuratedPreviewPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const template = getTemplate((await params).templateId);
  if (!template) notFound();
  return (
    <div className="container page-content curated-preview">
      <Link href="/explore" className="section-link">
        <ArrowLeft size={16} aria-hidden="true" /> All inspirations
      </Link>
      <PageHeading
        eyebrow={`${template.city.toUpperCase()} · ${template.country.toUpperCase()}`}
        title={template.title}
        description={template.description}
      />
      <div className="curated-preview-layout">
        <div className="curated-preview-photo">
          <DestinationImage
            src={template.image}
            alt={template.alt}
            priority
            sizes="(min-width: 900px) 65vw, 100vw"
          />
          <span className="photo-badge">
            {template.style} · {template.days}-day inspiration
          </span>
        </div>
        <section className="panel curated-preview-details">
          <p className="eyebrow">A STARTING POINT, MADE PERSONAL</p>
          <h2>One base. Your own rhythm.</h2>
          <p>
            Start in {template.city}, {template.country}, with{" "}
            {template.interests.join(", ").toLowerCase()} in mind. Change the
            destination, interests or length in the planner whenever you like.
          </p>
          <p className="curated-preview-estimate">
            ${template.estimate.toLocaleString("en-US")}{" "}
            <small>USD / person</small>
          </p>
          <p>
            Illustrative spending estimate for {template.days} days. Flights and
            accommodation excluded. Not a verified price, quote or booking.
          </p>
          <ButtonLink href={`/trips/new?template=${template.id}`}>
            Customize This Trip <ArrowUpRight size={17} aria-hidden="true" />
          </ButtonLink>
          <p className="inline-note">
            Choose your dates, departure city, traveler count and group budget.
            Sign in to keep your draft; AI generation starts only when you
            request it.
          </p>
        </section>
      </div>
      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A FEW DAYS TO IMAGINE</p>
            <h2>The feeling, before the details.</h2>
          </div>
        </div>
        <div className="curated-theme-grid">
          {template.preview.map((theme) => (
            <article className="panel curated-theme" key={theme}>
              <h3>{theme}</h3>
              <p>
                An editorial theme to adapt to your dates, pace and preferences.
                Timing, venues and availability are unverified.
              </p>
            </article>
          ))}
        </div>
        <p className="inline-note">
          Hand-authored inspiration, not a generated itinerary. Personalization
          uses your selected AI provider and passes the same schedule, geography
          and budget checks as a custom trip. All generated days remain in one
          confirmed base city.
        </p>
      </section>
    </div>
  );
}

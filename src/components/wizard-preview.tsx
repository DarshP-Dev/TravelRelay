import { DestinationImage } from "./destination-image";
import { destinationPhoto, type TripIntent } from "@/lib/trip-intent";

export function WizardPreview({
  draft,
  budgetLabel,
  dateLabel,
  status,
}: {
  draft: TripIntent;
  budgetLabel: string;
  dateLabel: string;
  status: string;
}) {
  const photo = destinationPhoto(
    draft.mode === "known" ? draft.destination : "",
  );
  return (
    <aside className="wizard-photo-summary">
      <div className="wizard-destination-photo">
        <DestinationImage
          src={photo?.image ?? "/images/cinque-terre.jpg"}
          alt={photo?.alt ?? "Colorful coastal houses in Cinque Terre, Italy"}
          priority
          sizes="(max-width: 900px) 100vw, 45vw"
        />
        <div className="wizard-photo-overlay" />
        <div className="wizard-photo-caption">
          <span className="eyebrow">A LITTLE INSPIRATION</span>
          <h3>{photo?.city ?? "A world of possibility."}</h3>
          <p>
            {photo
              ? `${photo.country} · Destination inspiration`
              : "Cinque Terre, Italy · Default inspiration"}
          </p>
        </div>
      </div>
      <details className="wizard-live-summary" open>
        <summary>Your trip, taking shape</summary>
        <div>
          <dl>
            <div>
              <dt>Your starting point</dt>
              <dd>
                {draft.mode === "known"
                  ? draft.destination || "Anywhere you’re dreaming of"
                  : draft.vibe || "Following a feeling"}
              </dd>
            </div>
            <div>
              <dt>Dates & travelers</dt>
              <dd>
                {dateLabel} · {draft.travelers}{" "}
                {draft.travelers === 1 ? "traveler" : "travelers"}
              </dd>
            </div>
            <div>
              <dt>Planning budget</dt>
              <dd>
                {budgetLabel} ·{" "}
                {draft.scope === "entire" ? "Entire vacation" : "Spending only"}
              </dd>
            </div>
            <div>
              <dt>Your pace & interests</dt>
              <dd>
                {draft.pace} ·{" "}
                {draft.selected.join(", ") || "Open to discovery"}
              </dd>
            </div>
          </dl>
          <p className="inline-note">
            {status === "saved"
              ? "Draft saved to your account."
              : "See draft save status above the form."}{" "}
            Photography is inspiration. No itinerary, availability, or booking
            has been generated.
          </p>
        </div>
      </details>
    </aside>
  );
}

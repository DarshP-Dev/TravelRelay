import { DestinationImage } from "./destination-image";
import { destinationPhoto, type TripIntent } from "@/lib/trip-intent";
import { budgetMinor, dateAfter, money, type Itinerary } from "@/lib/itinerary";
import { planningBudgetSummary } from "@/lib/budget-presentation";
import type { VenueCheck, DayRole } from "@/lib/itinerary-quality";
import { ItineraryBudgetView, budgetLabels } from "./itinerary-budget-view";
import { ItineraryDayOverview } from "./itinerary-day-overview";
import type { ReactNode } from "react";
function clock(minute: number) {
  return `${Math.floor(minute / 60)
    .toString()
    .padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`;
}
function VenueInformation({
  reference,
  example,
}: {
  reference?: VenueCheck;
  example: boolean;
}) {
  return (
    <div className="venue-evidence">
      {reference ? (
        <>
          <span>Published hours reference</span>
          {reference.publishedWindow && (
            <small>
              Published visit window:{" "}
              {clock(reference.publishedWindow.openMinute)}–
              {clock(reference.publishedWindow.endMinute)}. Last admission:{" "}
              {clock(reference.publishedWindow.lastAdmissionMinute)}.
            </small>
          )}
          <a href={reference.sourceUrl} target="_blank" rel="noreferrer">
            Official venue information
          </a>
          <small>
            Source checked {reference.checkedOn}. Future hours and availability
            still need confirmation; costs remain estimates.
          </small>
        </>
      ) : (
        <>
          <span>Venue hours unverified</span>
          <small>
            {example ? "Illustrative time" : "AI-estimated time"} · Check
            opening hours, access and availability directly.
          </small>
        </>
      )}
    </div>
  );
}
const dayLabels: Record<DayRole, string> = {
  arrival: "Arrival day",
  full: "Full day",
  departure: "Departure day",
  "single-day": "Local day plan",
};
export function ItineraryView({
  itinerary: plan,
  intent,
  timeline = false,
  example = false,
  tripId,
  children,
}: {
  itinerary: Omit<Itinerary, "generatedAt" | "model" | "priceSource">;
  intent: TripIntent;
  timeline?: boolean;
  example?: boolean;
  tripId?: string;
  children?: ReactNode;
}) {
  const photo = destinationPhoto(plan.base.city);
  return (
    <div className="completed-itinerary">
      <div className="saved-trip-hero">
        <DestinationImage
          src={photo?.image ?? "/images/cinque-terre.jpg"}
          alt={photo?.alt ?? "Cinque Terre — default travel inspiration"}
          priority
          sizes="100vw"
        />
        <span>
          {photo
            ? `${plan.base.city} · Destination inspiration`
            : "Cinque Terre · Default inspiration, not your destination"}
        </span>
      </div>
      {plan.manualEdit && (
        <div className="notice">
          <strong>
            Your edited itinerary · revision {plan.manualEdit.revision}
          </strong>
          <p>
            Activity estimates and schedules include your changes. Original AI
            generation audits are preserved. This save made no additional AI
            request or payment. Original generated summaries/themes remain
            labeled below; current activities and estimates are authoritative.
          </p>
        </div>
      )}
      {!example &&
        !plan.manualEdit &&
        (plan.schemaVersion !== 2 || (plan.quality?.version ?? 0) < 3) && (
          <div className="notice">
            <strong>Saved before the latest reliability checks.</strong>
            <p>
              This plan retains its original estimates and has not been
              revalidated against the newer meal, buffer-normalization and
              budget-allocation rules.
            </p>
          </div>
        )}
      <div className="itinerary-intro">
        {plan.manualEdit && (
          <p className="inline-note">
            Original generated trip introduction · refer to the current
            activities for your edited plan.
          </p>
        )}
        <p className="eyebrow">
          {example
            ? "EDITORIAL EXAMPLE · ONE PARIS BASE"
            : "ONE CITY. YOUR KIND OF DAYS."}
        </p>
        <h2>{plan.base.city}, at your pace.</h2>
        <p>{plan.introduction}</p>
        <p>
          {plan.base.startDate} →{" "}
          {dateAfter(plan.base.startDate, plan.days.length - 1)} ·{" "}
          {intent.travelers} {intent.travelers === 1 ? "traveler" : "travelers"}{" "}
          · Local time: {plan.base.timeZone}
        </p>
        <p className="inline-note">
          Selected group budget: {money(budgetMinor(intent), intent.currency)}{" "}
          {intent.currency} ·{" "}
          {intent.scope === "entire"
            ? "Entire vacation"
            : "Spending only; flights and accommodation excluded"}
          .
        </p>
        {plan.quality && (
          <p className="inline-note">
            Travel-day windows are planning assumptions. Check your actual
            arrival and departure times.
          </p>
        )}
      </div>
      {plan.quality ? (
        <details className="itinerary-assumptions">
          <summary>Planning assumptions & information sources</summary>
          <ul>
            {plan.quality.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
          <p>
            Suggested interest matches:{" "}
            {plan.quality.interestCoverage
              .map((item) => item.interest)
              .join(", ") || "Open to discovery"}
            . Review whether each suggested experience suits you.
          </p>
          {!!plan.normalization?.corrections.length && (
            <div className="normalization-note">
              <strong>Travel buffer corrections</strong>
              <ul>
                {plan.normalization.corrections.map((correction) => (
                  <li
                    key={`${correction.dayIndex}-${correction.activityIndex}`}
                  >
                    Day {correction.dayIndex + 1},{" "}
                    {
                      plan.days[correction.dayIndex].activities[
                        correction.activityIndex
                      ].title
                    }
                    : {correction.originalMinutes} →{" "}
                    {correction.correctedMinutes} minutes, within the existing{" "}
                    {correction.availableGapMinutes}-minute gap. Activity times
                    were unchanged.
                  </li>
                ))}
              </ul>
            </div>
          )}
        </details>
      ) : null}
      <div className="workspace-metrics">
        <div>
          <span>
            {plan.budget
              ? "Plan allocation + reserve"
              : "Estimated group total"}
          </span>
          <strong>{money(plan.totalMinor, plan.currency)}</strong>
          <small>
            {plan.currency} ·{" "}
            {intent.scope === "entire"
              ? "Entire vacation"
              : "Spending only · flights & stay excluded"}
          </small>
        </div>
        <div>
          <span>Emergency reserve included</span>
          <strong>{money(plan.reserveMinor, plan.currency)}</strong>
          <small>10% of your selected budget</small>
        </div>
        <div>
          <span>
            {plan.budget ? "Unallocated budget remaining" : "Budget remaining"}
          </span>
          <strong>
            {money(
              plan.budget?.remainingMinor ??
                budgetMinor(intent) - plan.totalMinor,
              plan.currency,
            )}
          </strong>
          <small>Planning estimate · financial history in TripWallet</small>
        </div>
      </div>
      {tripId && !timeline && !example && (
        <ItineraryDayOverview plan={plan} tripId={tripId} />
      )}
      <div className="itinerary-costs">
        <h3>What the estimate includes</h3>
        {plan.budget ? (
          <ItineraryBudgetView budget={plan.budget} />
        ) : (
          <>
            <p className="inline-note">
              Legacy estimate: category allocations and itemized costs were not
              reconciled under the newer rules. Saved amounts are unchanged.
            </p>
            <dl className="review-list">
              {[
                ["Return travel", plan.flightsMinor],
                ["Accommodation", plan.accommodationMinor],
                ["Food", plan.foodMinor],
                ["Local transport", plan.localTransportMinor],
                [
                  "Activities",
                  plan.days.reduce(
                    (s, d) =>
                      s + d.activities.reduce((n, a) => n + a.costMinor, 0),
                    0,
                  ),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>
                    {label}
                    {intent.scope === "spending" &&
                    (label === "Return travel" || label === "Accommodation")
                      ? " · excluded from budget"
                      : ""}
                  </dt>
                  <dd>{money(Number(value), plan.currency)}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        <p className="inline-note">
          {plan.budget
            ? planningBudgetSummary(plan.budget)
            : `The saved plan includes ${money(plan.reserveMinor, plan.currency)} emergency reserve. Remaining unallocated budget: ${money(budgetMinor(intent) - plan.totalMinor, plan.currency)}.`}{" "}
          {example
            ? "All prices, locations, durations and schedules are illustrative."
            : plan.manualEdit
              ? "Prices and schedules include AI and manual estimates. Published hours references are dated snapshots, not future availability guarantees."
              : "Prices, locations, durations and unsourced schedules are AI estimates. Published hours references are dated snapshots, not future availability guarantees."}{" "}
          Verify details and accessibility directly before travel. No bookings
          or availability have been confirmed.
        </p>
      </div>
      {(timeline || example || !tripId) &&
        (children ?? (
          <>
            {timeline && (
              <nav className="itinerary-day-nav" aria-label="Itinerary days">
                {plan.days.map((day, index) => (
                  <a href={`#day-${day.id}`} key={day.id}>
                    Day {index + 1}
                    <small>{day.date}</small>
                  </a>
                ))}
              </nav>
            )}
            <div
              className={
                timeline
                  ? "itinerary-days itinerary-timeline"
                  : "itinerary-days"
              }
            >
              {plan.days.map((day, index) => (
                <article
                  className="itinerary-day"
                  id={`day-${day.id}`}
                  key={day.id}
                >
                  <div className="itinerary-day-heading">
                    <span className="eyebrow">
                      DAY {index + 1} · {day.date}
                    </span>
                    {plan.quality && (
                      <p className="day-role">
                        {dayLabels[plan.quality.days[index]?.role]} ·{" "}
                        {intent.pace} pace
                      </p>
                    )}
                    <h3>{day.title}</h3>
                  </div>
                  <ol>
                    {day.activities.map((activity, activityIndex) => {
                      const expense = plan.budget?.expenses.find(
                        (item) =>
                          item.dayIndex === index &&
                          item.activityIndex === activityIndex,
                      );
                      const correction = plan.normalization?.corrections.find(
                        (item) =>
                          item.dayIndex === index &&
                          item.activityIndex === activityIndex,
                      );
                      return (
                        <li key={activity.id}>
                          <div className="activity-time">
                            {clock(activity.startMinute)}
                            <span className="activity-end">
                              to{" "}
                              {clock(
                                activity.startMinute + activity.durationMinutes,
                              )}
                            </span>
                            <span>{activity.durationMinutes} min</span>
                          </div>
                          <div>
                            <h4>{activity.title}</h4>
                            <p>{activity.description}</p>
                            <p className="activity-place">
                              {activity.location} · {activity.city}
                            </p>
                            <VenueInformation
                              reference={plan.quality?.venueChecks.find(
                                (item) =>
                                  item.dayIndex === index &&
                                  item.activityIndex === activityIndex,
                              )}
                              example={example}
                            />
                            <small>
                              {activity.bufferBeforeMinutes} min travel /
                              arrival buffer ·{" "}
                              {expense?.category === "food" &&
                              expense.estimatedMinor === 0
                                ? "Food cost unitemized within its allocation"
                                : `${money(activity.costMinor, plan.currency)} ${plan.currency} estimated for your group`}
                            </small>
                            {expense && (
                              <small className="activity-budget-note">
                                {budgetLabels[expense.category]} estimate ·
                                already included in the category allocation, not
                                an extra charge.
                                {expense.category === "food" &&
                                expense.estimatedMinor === 0
                                  ? " Meal costs are unitemized within the food allowance."
                                  : ""}
                              </small>
                            )}
                            {correction && (
                              <small className="activity-budget-note">
                                Buffer corrected from{" "}
                                {correction.originalMinutes} to{" "}
                                {correction.correctedMinutes} minutes within the{" "}
                                {correction.availableGapMinutes}-minute
                                scheduled gap; activity times unchanged.
                              </small>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </article>
              ))}
            </div>
          </>
        ))}
    </div>
  );
}

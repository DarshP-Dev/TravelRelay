import { money } from "@/lib/itinerary";
import type { BudgetCategory, PlanningBudget } from "@/lib/itinerary-budget";

export const budgetLabels: Record<BudgetCategory, string> = {
  flights: "Return travel",
  accommodation: "Accommodation",
  food: "Food",
  localTransport: "Local transport",
  activities: "Other activities",
};
export function ItineraryBudgetView({ budget }: { budget: PlanningBudget }) {
  return (
    <div className="planning-budget">
      <p>
        Allocations include the itemized estimates below. The unitemized
        allowance covers additional expected expenses; it is not added a second
        time. All amounts here are planning estimates. Confirmed spending and
        financial events have their own TripWallet ledger.
      </p>
      <dl className="budget-allocations">
        {budget.allocations.map((row) => (
          <div key={row.category}>
            <dt>
              {budgetLabels[row.category]}
              {!row.inScope && (
                <small>Excluded from this spending budget</small>
              )}
            </dt>
            <dd>
              <span>
                Allocation
                <strong>{money(row.allocatedMinor, row.currency)}</strong>
              </span>
              <span>
                Itemized estimates
                <strong>
                  {money(row.itemizedEstimateMinor, row.currency)}
                </strong>
              </span>
              <span>
                Unitemized allowance
                <strong>
                  {money(row.unitemizedAllowanceMinor, row.currency)}
                </strong>
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="inline-note">
        In-scope itemized estimates:{" "}
        {money(budget.itemizedEstimateMinor, budget.currency)}. Additional
        unitemized allowance:{" "}
        {money(budget.unitemizedAllowanceMinor, budget.currency)}. Together:{" "}
        {money(budget.allocatedMinor, budget.currency)}, before the separate{" "}
        {money(budget.reserveMinor, budget.currency)} emergency reserve.
        Unallocated budget remaining:{" "}
        {money(budget.remainingMinor, budget.currency)}.
      </p>
      <p className="inline-note">
        These are {budget.currency} group estimates, not actual expenses or
        TripWallet transactions.{" "}
        {budget.classification === "explicit-activity-categories-v1"
          ? "Food and transport allocations use your selected activity categories."
          : "Food and transport categories use the activity title/location to classify estimates; mixed or ambiguous experiences need review."}{" "}
        No exchange rate or currency conversion is implied.
      </p>
    </div>
  );
}

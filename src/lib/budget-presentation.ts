import { money } from "./itinerary";
import type { PlanningBudget } from "./itinerary-budget";

export function planningBudgetSummary(budget: PlanningBudget) {
  return `Planned allocations total ${money(budget.allocatedMinor, budget.currency)}. A separate ${money(budget.reserveMinor, budget.currency)} emergency reserve brings the total to ${money(budget.totalWithReserveMinor, budget.currency)}. Genuinely unallocated budget remaining: ${money(budget.remainingMinor, budget.currency)}. No spending has been recorded.`;
}

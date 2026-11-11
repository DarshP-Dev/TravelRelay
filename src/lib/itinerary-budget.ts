import type { ModelItinerary } from "./itinerary";
import type { TripIntent } from "./trip-intent";
import {
  expenseCategory,
  foodCue,
  activityText,
  normalized,
} from "./activity-semantics";

export type BudgetCategory =
  "flights" | "accommodation" | "food" | "localTransport" | "activities";
export type PlanningExpense = {
  dayIndex: number;
  activityIndex: number;
  activityId?: string;
  dayId?: string;
  category: BudgetCategory;
  currency: string;
  estimatedMinor: number;
  source: "ai-estimate" | "editorial-example" | "manual-estimate";
};
export type PlanningBudget = {
  version: 1;
  kind: "planning-only";
  currency: string;
  selectedBudgetMinor: number;
  scope: TripIntent["scope"];
  allocations: {
    category: BudgetCategory;
    currency: string;
    inScope: boolean;
    allocatedMinor: number;
    itemizedEstimateMinor: number;
    unitemizedAllowanceMinor: number;
  }[];
  expenses: PlanningExpense[];
  itemizedEstimateMinor: number;
  unitemizedAllowanceMinor: number;
  allocatedMinor: number;
  reserveMinor: number;
  totalWithReserveMinor: number;
  remainingMinor: number;
  classification: "title-location-rules-v1" | "explicit-activity-categories-v1";
};

export function planningReserveMinor(selectedBudgetMinor: number) {
  return Math.ceil(selectedBudgetMinor * 0.1);
}

// Category fields are inclusive allocations, never amounts added to their own
// itemized expenses. Missing itemization remains an explicit conservative allowance.
export function calculatePlanningBudget(
  plan: Pick<
    ModelItinerary,
    | "currency"
    | "flightsMinor"
    | "accommodationMinor"
    | "foodMinor"
    | "localTransportMinor"
  > & {
    days: {
      activities: Pick<
        ModelItinerary["days"][number]["activities"][number],
        "title" | "location" | "costMinor"
      >[];
    }[];
  },
  intent: TripIntent,
  selectedBudgetMinor: number,
  resolveCategory?: (
    dayIndex: number,
    activityIndex: number,
  ) => "food" | "localTransport" | "activities",
) {
  const expenses: PlanningExpense[] = plan.days.flatMap((day, dayIndex) =>
    day.activities.map((activity, activityIndex) => ({
      dayIndex,
      activityIndex,
      category:
        resolveCategory?.(dayIndex, activityIndex) ?? expenseCategory(activity),
      currency: plan.currency,
      estimatedMinor: activity.costMinor,
      source: "ai-estimate" as const,
    })),
  );
  const itemized = (category: BudgetCategory) =>
    expenses
      .filter((expense) => expense.category === category)
      .reduce((sum, expense) => sum + expense.estimatedMinor, 0);
  const amounts: Record<BudgetCategory, number> = {
    flights: plan.flightsMinor,
    accommodation: plan.accommodationMinor,
    food: plan.foodMinor,
    localTransport: plan.localTransportMinor,
    activities: itemized("activities"),
  };
  const issues: string[] = [];
  if (!resolveCategory)
    for (const day of plan.days)
      for (const activity of day.activities) {
        if (
          activity.costMinor > 0 &&
          foodCue.test(activityText(activity)) &&
          /\b(museum|musee|gallery|palace|admission|ticket|concert|theatre|theater|metro|taxi)\b/.test(
            normalized(activity.title),
          )
        )
          issues.push(
            `${activity.title} mixes food and another expense category. Separate the estimates into distinct activities; the server cannot invent a cost split.`,
          );
      }
  const allocations = (Object.keys(amounts) as BudgetCategory[]).map(
    (category) => {
      const allocatedMinor = amounts[category],
        itemizedEstimateMinor = itemized(category);
      if (itemizedEstimateMinor > allocatedMinor)
        issues.push(
          `The ${category} allocation is smaller than its itemized estimates. No expense can be discarded to fit the budget.`,
        );
      return {
        category,
        currency: plan.currency,
        inScope:
          intent.scope === "entire" ||
          !["flights", "accommodation"].includes(category),
        allocatedMinor,
        itemizedEstimateMinor,
        unitemizedAllowanceMinor: Math.max(
          0,
          allocatedMinor - itemizedEstimateMinor,
        ),
      };
    },
  );
  const included = allocations.filter((allocation) => allocation.inScope);
  const allocatedMinor = included.reduce(
      (sum, row) => sum + row.allocatedMinor,
      0,
    ),
    reserveMinor = planningReserveMinor(selectedBudgetMinor);
  const budget: PlanningBudget = {
    version: 1,
    kind: "planning-only",
    currency: plan.currency,
    scope: intent.scope,
    selectedBudgetMinor,
    allocations,
    expenses,
    allocatedMinor,
    reserveMinor,
    itemizedEstimateMinor: included.reduce(
      (sum, row) => sum + row.itemizedEstimateMinor,
      0,
    ),
    unitemizedAllowanceMinor: included.reduce(
      (sum, row) => sum + row.unitemizedAllowanceMinor,
      0,
    ),
    totalWithReserveMinor: allocatedMinor + reserveMinor,
    remainingMinor: selectedBudgetMinor - allocatedMinor - reserveMinor,
    classification: resolveCategory
      ? "explicit-activity-categories-v1"
      : "title-location-rules-v1",
  };
  return { budget, issues };
}

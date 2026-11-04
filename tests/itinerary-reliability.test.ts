import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeTravelBuffers } from "../src/lib/itinerary-normalization";
import {
  assessItineraryQuality,
  validateItineraryQuality,
} from "../src/lib/itinerary-quality";
import {
  validateItinerary,
  type CityProposal,
  type ModelItinerary,
} from "../src/lib/itinerary";
import type { TripIntent } from "../src/lib/trip-intent";
import { venueReferences } from "../src/server/venue-references";

const recorded = JSON.parse(
  readFileSync(
    new URL("./fixtures/paris-quality-recorded.json", import.meta.url),
    "utf8",
  ),
) as { intent: TripIntent; base: CityProposal; plan: ModelItinerary };
const validate = (plan: unknown, intent = recorded.intent) =>
  validateItinerary(plan, intent, recorded.base);
const assess = (plan: ModelItinerary) =>
  assessItineraryQuality(plan, recorded.intent, recorded.base, venueReferences);

test("recorded Paris buffer is normalized from 30 to 35 only inside its existing sufficient gap", () => {
  const before = structuredClone(recorded.plan);
  const result = normalizeTravelBuffers(recorded.plan, recorded.intent);
  assert.deepEqual(result.normalization.corrections, [
    {
      dayIndex: 2,
      activityIndex: 3,
      originalMinutes: 30,
      correctedMinutes: 35,
      availableGapMinutes: 60,
      basis: "distance-based-minimum",
    },
  ]);
  assert.equal(result.plan.days[2].activities[3].bufferBeforeMinutes, 35);
  assert.deepEqual(recorded.plan, before);
  assert.equal(
    validate(result.plan).plan.days[2].activities[3].startMinute,
    930,
  );
  assert.deepEqual(
    normalizeTravelBuffers(result.plan, recorded.intent).normalization
      .corrections,
    [],
  );
  assert.ok(
    !assess(result.plan).issues.some((issue) => issue.code === "travel-buffer"),
  );
  assert.throws(
    () =>
      validateItineraryQuality(
        result.plan,
        recorded.intent,
        recorded.base,
        venueReferences,
      ),
    /needs revision/,
    "Buffer correction must not hide the fixture's genuine meal/location problems.",
  );
});

test("a genuinely insufficient gap is rejected; an exact minimum gap works without moving any times", () => {
  const plan = structuredClone(recorded.plan);
  plan.days[2].activities[3].startMinute = 870 + 34;
  const before = structuredClone(plan);
  assert.throws(
    () => normalizeTravelBuffers(plan, recorded.intent),
    /only 34.*at least 35/,
  );
  assert.deepEqual(plan, before);
  plan.days[2].activities[3].startMinute = 870 + 35;
  assert.equal(
    normalizeTravelBuffers(plan, recorded.intent).plan.days[2].activities[3]
      .bufferBeforeMinutes,
    35,
  );
});

test("normalization preserves conservative declared buffers, arrival checks, schema limits and accessibility allowance", () => {
  const plan = structuredClone(recorded.plan);
  plan.days[2].activities[3].bufferBeforeMinutes = 75;
  const result = normalizeTravelBuffers(plan, recorded.intent);
  assert.equal(result.plan.days[2].activities[3].bufferBeforeMinutes, 75);
  assert.throws(() => validate(result.plan), /safer timing/);
  assert.throws(() =>
    normalizeTravelBuffers({ ...recorded.plan, budget: {} }, recorded.intent),
  );
  const malformed = structuredClone(recorded.plan);
  malformed.days[0].activities[0].costMinor = -1;
  assert.throws(() => normalizeTravelBuffers(malformed, recorded.intent));
  assert.throws(
    () =>
      normalizeTravelBuffers(recorded.plan, {
        ...recorded.intent,
        accessibility: "Step-free paths",
      }),
    /at least 31/,
  );
  const accessible = normalizeTravelBuffers(
    {
      ...recorded.plan,
      days: [
        {
          ...recorded.plan.days[2],
          activities: recorded.plan.days[2].activities.slice(2),
        },
      ],
    },
    {
      ...recorded.intent,
      accessibility: "Step-free paths",
    },
  );
  assert.equal(accessible.plan.days[0].activities[1].bufferBeforeMinutes, 45);
  const arrival = structuredClone(recorded.plan);
  arrival.days[0].activities[0].bufferBeforeMinutes = 15;
  assert.ok(
    assess(normalizeTravelBuffers(arrival, recorded.intent).plan).issues.some(
      (issue) => issue.code === "arrival-buffer",
    ),
  );
});

test("food estimates sit within their allocation exactly once, with explicit unitemized allowance and reserve", () => {
  const result = validate(
    normalizeTravelBuffers(recorded.plan, recorded.intent).plan,
  );
  const food = result.budget.allocations.find(
    (row) => row.category === "food",
  )!;
  assert.equal(food.allocatedMinor, 45000);
  assert.equal(food.itemizedEstimateMinor, 28000);
  assert.equal(food.unitemizedAllowanceMinor, 17000);
  assert.equal(result.budget.itemizedEstimateMinor, 31200);
  assert.equal(result.budget.unitemizedAllowanceMinor, 157000);
  assert.equal(result.budget.allocatedMinor, 188200);
  assert.equal(result.reserveMinor, 25000);
  assert.equal(result.totalMinor, 213200);
  assert.equal(result.budget.remainingMinor, 36800);
  assert.equal(
    result.budget.itemizedEstimateMinor +
      result.budget.unitemizedAllowanceMinor +
      result.reserveMinor,
    result.totalMinor,
  );
  assert.equal(
    result.plan.days[0].activities[1].costMinor,
    8000,
    "Never erase an estimate to force an affordable plan.",
  );
  assert.ok(
    result.budget.expenses.every(
      (expense) =>
        expense.currency === "EUR" && expense.source === "ai-estimate",
    ),
  );
});

test("underfunded food allocations and over-budget plans are rejected instead of dropping or double counting expenses", () => {
  const { plan } = normalizeTravelBuffers(recorded.plan, recorded.intent);
  assert.throws(
    () => validate({ ...plan, foodMinor: 27000 }),
    /food allocation is smaller/,
  );
  assert.throws(
    () => validate(plan, { ...recorded.intent, budget: "2000" }),
    /exceed/,
  );
  assert.throws(() => validate({ ...plan, currency: "USD" }), /currency/);
  const spending = validate(plan, { ...recorded.intent, scope: "spending" });
  assert.equal(spending.totalMinor, 83200);
  assert.equal(
    spending.budget.allocations.find((row) => row.category === "flights")
      ?.inScope,
    false,
  );
  const yen = validate(
    { ...plan, currency: "JPY" },
    { ...recorded.intent, currency: "JPY", budget: "250000" },
  );
  assert.equal(yen.totalMinor, 213200);
  assert.equal(yen.budget.currency, "JPY");
});

test("local transport estimates are included once and mixed food/admission costs cannot invent a split", () => {
  const { plan } = normalizeTravelBuffers(recorded.plan, recorded.intent);
  plan.days[0].activities[0].title = "Metro ride to the Latin Quarter";
  plan.days[0].activities[0].costMinor = 1000;
  const result = validate(plan);
  const transport = result.budget.allocations.find(
    (row) => row.category === "localTransport",
  )!;
  assert.equal(transport.itemizedEstimateMinor, 1000);
  assert.equal(transport.unitemizedAllowanceMinor, 9000);
  assert.equal(result.totalMinor, 213200);
  plan.days[1].activities[1].title = "Museum admission and bistro lunch";
  assert.throws(() => validate(plan), /mixes food.*Separate/);
});

test("lunch needs a substantial meal or an actual free hour; pastry tasting is not lunch", () => {
  const { plan } = normalizeTravelBuffers(recorded.plan, recorded.intent);
  assert.ok(
    assess(plan).issues.some(
      (issue) => issue.dayIndex === 2 && issue.code === "meal-space",
    ),
  );
  plan.days[2].activities[1].title =
    "Substantial lunch at a Rue de Bretagne bistro";
  assert.ok(
    !assess(plan).issues.some(
      (issue) => issue.dayIndex === 2 && issue.code === "meal-space",
    ),
  );
  plan.days[2].activities[1].title = "Pastry tasting";
  plan.days[2].activities[1].startMinute = 780;
  assert.ok(
    !assess(plan).issues.some(
      (issue) => issue.dayIndex === 2 && issue.code === "meal-space",
    ),
    "A genuine free lunch hour may coexist with a later snack.",
  );
});

test("unrealistic meal labels, missing dinner space and generic city locations are rejected without venue verification claims", () => {
  const { plan } = normalizeTravelBuffers(recorded.plan, recorded.intent);
  const codes = assess(plan).issues.map((issue) => issue.code);
  assert.ok(codes.includes("meal-time"));
  assert.ok(codes.includes("activity-location"));
  plan.days[2].activities[3].startMinute = 1080;
  plan.days[2].activities[3].durationMinutes = 180;
  plan.days[2].activities[3].title = "Bastille neighborhood evening walk";
  assert.ok(
    assess(plan).issues.some(
      (issue) => issue.dayIndex === 2 && issue.code === "dinner-space",
    ),
  );
  const quality = assess(plan).quality;
  assert.equal(quality.venueChecks.length, 1);
  assert.equal(quality.venueChecks[0].scope, "published-hours");
});

test("free meal opportunities never count travel buffers attached to rest placeholders", () => {
  const { plan } = normalizeTravelBuffers(recorded.plan, recorded.intent);
  const day = plan.days[2];
  day.activities[1].title = "Rest break";
  day.activities[1].startMinute = 735;
  day.activities[1].durationMinutes = 45;
  day.activities[1].bufferBeforeMinutes = 45;
  day.activities[2].startMinute = 810;
  day.activities[2].durationMinutes = 60;
  day.activities[2].bufferBeforeMinutes = 30;
  assert.ok(
    assess(plan).issues.some(
      (issue) => issue.dayIndex === 2 && issue.code === "meal-space",
    ),
    "The 11:30–12:15 transfer must not be treated as free meal time.",
  );
  day.activities[1].durationMinutes = 60;
  day.activities[2].startMinute = 825;
  assert.ok(
    !assess(plan).issues.some(
      (issue) => issue.dayIndex === 2 && issue.code === "meal-space",
    ),
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assessItineraryQuality,
  validateItineraryQuality,
  qualityPlanningBrief,
  dayPolicies,
} from "../src/lib/itinerary-quality";
import {
  validateItinerary,
  itineraryOutputSchema,
  type ModelItinerary,
  type CityProposal,
} from "../src/lib/itinerary";
import { venueReferences } from "../src/server/venue-references";
import type { TripIntent } from "../src/lib/trip-intent";
import { exampleIntent, exampleItinerary } from "../src/lib/example-trip";
const recorded = JSON.parse(
  readFileSync(
    new URL("./fixtures/paris-recorded.json", import.meta.url),
    "utf8",
  ),
) as { intent: TripIntent; base: CityProposal; plan: ModelItinerary };
// Authored offline candidate, never presented as a new live Gemini result.
function candidate() {
  const plan = structuredClone(recorded.plan);
  const activity = (
    title: string,
    location: string,
    startMinute: number,
    durationMinutes: number,
    latitude: number,
    longitude: number,
  ) => ({
    title,
    location,
    startMinute,
    durationMinutes,
    latitude,
    longitude,
    city: "Paris",
    costMinor: 0,
    bufferBeforeMinutes: 30,
    description:
      "Explore this specific neighborhood experience at a comfortable pace, with time to enjoy the setting and take a break.",
  });
  plan.days[0].activities = [
    activity("Le Marais neighborhood walk", "Le Marais", 870, 90, 48.855, 2.36),
    activity(
      "Local bistro dinner experience",
      "Le Marais bistro",
      1080,
      60,
      48.855,
      2.36,
    ),
  ];
  plan.days[1].activities = [
    {
      ...plan.days[1].activities[0],
      startMinute: 600,
      durationMinutes: 120,
      bufferBeforeMinutes: 30,
    },
    activity("Seine river promenade", "Seine River", 840, 90, 48.8584, 2.3375),
    activity(
      "Saint-Germain neighborhood walk",
      "Saint-Germain-des-Prés",
      960,
      60,
      48.8539,
      2.3338,
    ),
  ];
  plan.days[2].activities = [
    {
      ...plan.days[2].activities[0],
      startMinute: 600,
      durationMinutes: 90,
      bufferBeforeMinutes: 30,
    },
    {
      ...plan.days[2].activities[1],
      startMinute: 810,
      durationMinutes: 60,
      bufferBeforeMinutes: 30,
    },
    activity(
      "Montmartre neighborhood market",
      "Montmartre market",
      930,
      60,
      48.8867,
      2.3431,
    ),
  ];
  plan.days[3].activities = [
    {
      ...plan.days[3].activities[0],
      startMinute: 570,
      durationMinutes: 90,
      bufferBeforeMinutes: 30,
    },
  ];
  return plan;
}
const check = (
  plan: ModelItinerary,
  intent = recorded.intent,
  base = recorded.base,
) => assessItineraryQuality(plan, intent, base, venueReferences);
test("recorded Paris response still passes original arithmetic validation but fails newer quality checks", () => {
  assert.equal(
    validateItinerary(recorded.plan, recorded.intent, recorded.base).totalMinor,
    178200,
  );
  const codes = new Set(check(recorded.plan).issues.map((issue) => issue.code));
  for (const code of [
    "travel-day-window",
    "pace-detail",
    "interest-coverage",
    "published-hours",
    "travel-buffer",
    "day-load",
  ])
    assert.ok(codes.has(code), code);
  assert.throws(
    () =>
      validateItineraryQuality(
        recorded.plan,
        recorded.intent,
        recorded.base,
        venueReferences,
      ),
    /needs revision/,
  );
});
test("offline detailed candidate passes both quality and unchanged budget checks", () => {
  const plan = candidate();
  const before = structuredClone(plan);
  assert.deepEqual(check(plan).issues, []);
  const result = validateItinerary(plan, recorded.intent, recorded.base);
  assert.equal(result.totalMinor, 178200);
  assert.equal(result.reserveMinor, 25000);
  const quality = validateItineraryQuality(
    plan,
    recorded.intent,
    recorded.base,
    venueReferences,
  );
  assert.equal(quality.venueChecks.length, 1);
  assert.equal(quality.venueChecks[0].scope, "published-hours");
  assert.ok(quality.interestCoverage.every((item) => item.matches.length > 0));
  assert.deepEqual(
    plan,
    before,
    "Quality assessment must not silently rewrite activities or costs.",
  );
});
test("relaxed, balanced and packed full days accept sufficient real experiences, not padding", () => {
  for (const pace of ["relaxed", "balanced", "packed"] as const) {
    const plan = candidate();
    if (pace === "packed") {
      const extra = (
        title: string,
        location: string,
        startMinute: number,
        durationMinutes: number,
        latitude: number,
        longitude: number,
      ) => ({
        ...plan.days[0].activities[0],
        title,
        location,
        startMinute,
        durationMinutes,
        latitude,
        longitude,
        bufferBeforeMinutes: 30,
        costMinor: 0,
      });
      plan.days[1].activities.push(
        extra(
          "Left Bank riverside walk",
          "Left Bank riverside",
          1050,
          45,
          48.8519,
          2.3338,
        ),
        extra(
          "Dinner at a Saint-Germain bistro",
          "Saint-Germain bistro",
          1140,
          60,
          48.8539,
          2.3338,
        ),
      );
      plan.days[2].activities.push(
        extra(
          "Montmartre café tasting",
          "Montmartre café",
          1020,
          45,
          48.8867,
          2.3431,
        ),
        extra(
          "Montmartre evening neighborhood walk",
          "Montmartre lanes",
          1095,
          45,
          48.8867,
          2.3431,
        ),
      );
    }
    assert.deepEqual(
      check(plan, { ...recorded.intent, pace }).issues,
      [],
      pace,
    );
  }
});
test("pace targets vary by full day and stay lighter on travel days, including one/two-day trips", () => {
  for (const [pace, min, max] of [
    ["relaxed", 2, 3],
    ["balanced", 3, 5],
    ["packed", 5, 7],
  ] as const) {
    const days = dayPolicies({ ...recorded.intent, pace }, recorded.base);
    assert.equal(days[1].minActivities, min);
    assert.equal(days[1].maxActivities, max);
    assert.equal(days[0].startMinute, 840);
    assert.equal(days.at(-1)!.endMinute, 720);
    assert.ok(days[0].maxActivities <= 3);
    assert.equal(days.at(-1)!.maxActivities, 2);
  }
  const one = dayPolicies(
    { ...recorded.intent, end: recorded.intent.start },
    recorded.base,
  );
  assert.equal(one[0].role, "single-day");
  assert.ok(one[0].startMinute < one[0].endMinute);
  const two = dayPolicies(
    { ...recorded.intent, end: "2027-04-16" },
    recorded.base,
  );
  assert.deepEqual(
    two.map((day) => day.role),
    ["arrival", "departure"],
  );
});
test("expense allowances and generic rest/logistics cannot substitute for meaningful interest activities", () => {
  const plan = candidate();
  plan.days[0].activities[1].title = "Free time";
  plan.days[0].activities[1].location = "Le Marais";
  const issues = check(plan).issues;
  assert.ok(issues.some((issue) => issue.code === "interest-coverage"));
  assert.ok(issues.some((issue) => issue.code === "pace-detail"));
  assert.equal(plan.foodMinor, 40000);
});
test("opening-hour reference catches early visits, Monday, holidays, late admission and overruns", () => {
  for (const change of [
    (p: ModelItinerary) => {
      p.days[1].activities[0].startMinute = 540;
    },
    (p: ModelItinerary) => {
      p.days[1].date = "2027-04-19";
    },
    (p: ModelItinerary) => {
      p.days[1].date = "2027-05-01";
    },
    (p: ModelItinerary) => {
      p.days[1].activities[0].startMinute = 1035;
    },
    (p: ModelItinerary) => {
      p.days[1].activities[0].startMinute = 1000;
      p.days[1].activities[0].durationMinutes = 120;
    },
  ]) {
    const plan = candidate();
    change(plan);
    assert.ok(
      check(plan).issues.some((issue) => issue.code === "published-hours"),
    );
  }
});
test("unknown venues remain unverified and use conservative visitor windows", () => {
  const plan = candidate();
  plan.days[1].activities[0].title = "Another art museum";
  plan.days[1].activities[0].location = "Unverified art museum";
  assert.equal(check(plan).quality.venueChecks.length, 0);
  plan.days[1].activities[0].startMinute = 540;
  assert.ok(
    check(plan).issues.some(
      (issue) => issue.code === "unverified-venue-window",
    ),
  );
});
test("unrealistic durations, insufficient walking/access buffers, lunch crowding and duplicate visits are caught", () => {
  for (const [code, change] of [
    [
      "activity-duration",
      (p: ModelItinerary) => {
        p.days[1].activities[0].durationMinutes = 15;
      },
    ],
    [
      "travel-buffer",
      (p: ModelItinerary) => {
        p.days[1].activities[1].bufferBeforeMinutes = 15;
      },
    ],
    [
      "meal-space",
      (p: ModelItinerary) => {
        p.days[1].activities[0].startMinute = 600;
        p.days[1].activities[0].durationMinutes = 240;
        p.days[1].activities[1].startMinute = 870;
      },
    ],
    [
      "duplicate-venue",
      (p: ModelItinerary) => {
        p.days[2].activities[0] = { ...p.days[1].activities[0] };
      },
    ],
  ] as const) {
    const plan = candidate();
    change(plan);
    assert.ok(
      check(plan).issues.some((issue) => issue.code === code),
      code,
    );
  }
  const plan = candidate();
  plan.days[0].activities[1].bufferBeforeMinutes = 15;
  assert.ok(
    check(plan, {
      ...recorded.intent,
      accessibility: "Step-free paths",
    }).issues.some((issue) => issue.code === "travel-buffer"),
  );
});
test("planning brief carries every day target, interest requirement and trusted references without changing the response DTO", () => {
  const brief = qualityPlanningBrief(
    recorded.intent,
    recorded.base,
    venueReferences,
  );
  assert.equal(brief.days.length, 4);
  assert.equal(brief.interestRequirements.length, 2);
  assert.equal(brief.venueReferences.length, 1);
  assert.ok(brief.mealGuidance.includes("INCLUDED in foodMinor"));
  assert.ok(brief.honesty.includes("feasible=false"));
});
test("public editorial example also satisfies the quality policy without changing its budget", () => {
  assert.deepEqual(
    assessItineraryQuality(
      exampleItinerary,
      exampleIntent,
      exampleItinerary.base,
      venueReferences,
    ).issues,
    [],
  );
  assert.equal(exampleItinerary.totalMinor, 44000);
  assert.ok(!Object.hasOwn(exampleItinerary, "model"));
});
test("the model cannot supply verification metadata or bypass the unchanged strict response schema", () => {
  const plan = candidate();
  assert.throws(() =>
    itineraryOutputSchema.parse({
      ...plan,
      quality: { venueChecks: [{ verified: true }] },
    }),
  );
  const injected = structuredClone(plan) as unknown as {
    days: { activities: Record<string, unknown>[] }[];
  };
  injected.days[0].activities[0].verified = true;
  assert.throws(() => itineraryOutputSchema.parse(injected));
});
test("generic city placeholders and daytime pub stops do not satisfy concrete evening planning", () => {
  const plan = candidate();
  plan.days[0].activities[1].location = "Paris";
  assert.ok(
    check(plan).issues.some((issue) => issue.code === "activity-location"),
  );
  plan.days[0].activities[1].title = "Lunch at a local pub";
  plan.days[0].activities[1].location = "Le Marais pub";
  plan.days[0].activities[1].startMinute = 900;
  const result = check(plan, { ...recorded.intent, selected: ["Nightlife"] });
  assert.ok(result.issues.some((issue) => issue.code === "interest-coverage"));
});

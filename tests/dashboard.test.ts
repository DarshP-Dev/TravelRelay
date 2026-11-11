import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseDashboardTrip,
  dashboardTripHero,
  dashboardWelcomeHero,
  type DashboardTrip,
} from "../src/lib/dashboard-trips";
import { initialIntent } from "../src/lib/trip-intent";
import { solRecording } from "./helpers/sol-recording";

const paris: DashboardTrip = {
  id: "paris",
  data: solRecording.intent,
  itinerary: {
    ...solRecording.plan,
    schemaVersion: 2,
    base: solRecording.base,
    reserveMinor: 25_000,
    totalMinor: 227_400,
    generatedAt: solRecording.provenance.recordedAt,
    model: solRecording.provenance.originalAudit.model,
    priceSource: "ai-estimate",
    days: solRecording.plan.days.map((day, index) => ({
      ...day,
      id: `day-${index}`,
      activities: day.activities.map((activity, activityIndex) => ({
        ...activity,
        id: `activity-${index}-${activityIndex}`,
      })),
    })),
  },
  generationStatus: "complete",
};
const tokyo: DashboardTrip = {
  id: "tokyo",
  data: {
    ...paris.data,
    destination: "Tokyo",
    start: "2027-04-12",
    end: "2027-04-13",
    duration: 7,
  },
  itinerary: null,
  generationStatus: "failed",
};

test("dashboard prioritizes upcoming itineraries and only features trips from its owner-scoped list", () => {
  assert.equal(
    chooseDashboardTrip([tokyo, paris], "unknown-trip", "2027-04-10"),
    paris,
  );
  assert.equal(
    chooseDashboardTrip([tokyo, paris], tokyo.id, "2027-04-10"),
    tokyo,
  );
  assert.equal(chooseDashboardTrip([], paris.id, "2027-04-10"), undefined);
  assert.equal(chooseDashboardTrip([paris], undefined, "2027-05-01"), paris);
});

test("dashboard distinguishes saved plans, failed generation, and past trips using persisted dates", () => {
  const incomplete = dashboardTripHero(tokyo, "2027-04-10");
  assert.equal(incomplete.status, "Planning needs attention");
  assert.equal(incomplete.details, "2 days · 2 travelers");
  assert.equal(incomplete.action.href, "/trips/tokyo/generate");
  assert.equal(incomplete.photo.image, "/images/tokyo.jpg");
  const otherParis = dashboardTripHero(
    { ...tokyo, data: { ...tokyo.data, destination: "Paris, Texas" } },
    "2027-04-10",
  );
  assert.equal(otherParis.inspirationPhoto, true);

  const past = dashboardTripHero(paris, "2027-04-19");
  assert.equal(past.status, "Past trip");
  assert.equal(past.details, "4 days · 2 travelers");
  assert.equal(past.action.href, "/trips/paris");
});

test("new users and unfinished template drafts get distinct and restorable hero actions", () => {
  const welcome = dashboardWelcomeHero();
  assert.equal(welcome.action.href, "/trips/new");
  assert.equal(welcome.inspirationPhoto, true);
  assert.equal(welcome.details, undefined);

  const draft = dashboardWelcomeHero({
    id: "kyoto-draft",
    slot: "kyoto",
    data: { ...initialIntent("kyoto"), step: 1 },
  });
  assert.equal(draft.status, "Saved draft");
  assert.equal(draft.action.href, "/trips/new?template=kyoto");
  assert.match(draft.description ?? "", /step 2 of 4/i);
  assert.equal(draft.photo.image, "/images/kyoto.jpg");
});

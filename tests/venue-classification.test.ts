import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { classifyVenue } from "../src/lib/venue-classification";
import {
  assessItineraryQuality,
  type VenueReference,
} from "../src/lib/itinerary-quality";
import { itineraryOutputSchema } from "../src/lib/itinerary";
import { venueReferences } from "../src/server/venue-references";
import { solRecording } from "./helpers/sol-recording";

test("dining on Rue Vieille-du-Temple or Museum/Gallery addresses is not an indoor attraction", () => {
  for (const street of [
    "Rue Vieille-du-Temple",
    "12 Museum Street",
    "Gallery Road",
    "Temple Lane",
  ]) {
    const activity = {
      ...solRecording.plan.days[0].activities[1],
      title: `Bistro dinner on ${street}`,
      location: street,
    };
    const result = classifyVenue(activity, solRecording.base);
    assert.equal(result.classification.category, "dining", street);
    assert.equal(result.classification.ambiguous, false);
    assert.ok(
      !/\b(temple|museum|gallery)\b/.test(result.interestText),
      "Addresses must not manufacture Culture/Art coverage.",
    );
  }
  for (const title of [
    "Explore Museum Street",
    "Visit Gallery Road",
    "Temple Lane walking tour",
  ]) {
    const activity = {
      ...solRecording.plan.days[0].activities[1],
      title,
      location: title.replace(/^(Explore|Visit) /, ""),
    };
    assert.notEqual(
      classifyVenue(activity, solRecording.base).classification.category,
      "indoor-attraction",
      title,
    );
  }
  assert.deepEqual(
    assessItineraryQuality(
      solRecording.plan,
      solRecording.intent,
      solRecording.base,
      venueReferences,
    ).issues,
    [],
  );
});

test("actual temple visits retain conservative hours and source-backed temple hours take precedence", () => {
  const plan = structuredClone(solRecording.plan);
  const activity = plan.days[1].activities[0];
  activity.title = "Visit the Sample Temple";
  activity.location = "Sample Temple";
  activity.startMinute = 1080;
  activity.durationMinutes = 60;
  assert.equal(
    classifyVenue(activity, solRecording.base).classification.category,
    "indoor-attraction",
  );
  assert.ok(
    assessItineraryQuality(
      plan,
      solRecording.intent,
      solRecording.base,
    ).issues.some((issue) => issue.code === "unverified-venue-window"),
  );
  // Synthetic server-owned schedule, not a claim about any real temple.
  const reference: VenueReference = {
    ...venueReferences[0],
    id: "synthetic-temple",
    name: "Sample Temple",
    aliases: ["Sample Temple"],
    latitude: activity.latitude,
    longitude: activity.longitude,
    category: "indoor-attraction",
    attractionType: "temple",
    sourceUrl: "https://example.com/test-only-temple",
    weekly: { 5: { open: 600, close: 960, lastAdmission: 930 } },
  };
  const classified = classifyVenue(
    activity,
    solRecording.base,
    [reference],
    "dining",
  );
  assert.equal(classified.classification.basis, "published-venue-metadata");
  assert.equal(classified.classification.category, "indoor-attraction");
  assert.ok(
    assessItineraryQuality(plan, solRecording.intent, solRecording.base, [
      reference,
    ]).issues.some((issue) => issue.code === "published-hours"),
  );
});

test("Orsay outside source-checked hours stays rejected even if structured data incorrectly says dining", () => {
  const plan = structuredClone(solRecording.plan);
  plan.days[1].activities[0].startMinute = 1080;
  const result = assessItineraryQuality(
    plan,
    solRecording.intent,
    solRecording.base,
    venueReferences,
    [{ dayIndex: 1, activityIndex: 0, category: "dining" }],
  );
  assert.ok(result.issues.some((issue) => issue.code === "published-hours"));
  assert.equal(
    result.quality.classifications?.find(
      (c) => c.dayIndex === 1 && c.activityIndex === 0,
    )?.basis,
    "published-venue-metadata",
  );
});

test("ambiguous venue claims require clarification; unknown addresses are not awarded verification", () => {
  const plan = structuredClone(solRecording.plan);
  plan.days[0].activities[1].title = "Temple café visit";
  plan.days[0].activities[1].location = "Sample Temple café";
  assert.ok(
    assessItineraryQuality(
      plan,
      solRecording.intent,
      solRecording.base,
    ).issues.some((issue) => issue.code === "ambiguous-venue"),
  );
  const activity = {
    ...plan.days[0].activities[1],
    title: "Evening neighborhood experience",
    location: "12 Museum Street",
  };
  assert.deepEqual(classifyVenue(activity, solRecording.base).classification, {
    category: "unknown",
    basis: "unknown",
    ambiguous: false,
  });
  assert.equal(
    classifyVenue(activity, solRecording.base, [], "indoor-attraction")
      .classification.category,
    "indoor-attraction",
  );
  plan.days[0].activities[1] = activity;
  assert.ok(
    assessItineraryQuality(
      plan,
      solRecording.intent,
      solRecording.base,
      [],
      [{ dayIndex: 0, activityIndex: 1, category: "indoor-attraction" }],
    ).issues.some((issue) => issue.code === "unverified-venue-window"),
  );
  assert.throws(
    () =>
      itineraryOutputSchema.parse({
        ...solRecording.plan,
        categories: [{ category: "verified" }],
      }),
    "The provider cannot forge server-owned category metadata.",
  );
});

test("the original live failed record and its raw activity schedule are preserved", () => {
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(solRecording.plan))
      .digest("hex"),
    solRecording.provenance.rawPlanSha256,
  );
  assert.equal(
    solRecording.provenance.originalQualityIssues[0].code,
    "unverified-venue-window",
  );
});

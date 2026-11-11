import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  dateAfter,
  validateItinerary,
  type ModelItinerary,
} from "../src/lib/itinerary";
import { normalizeTravelBuffers } from "../src/lib/itinerary-normalization";
import { validateItineraryQuality } from "../src/lib/itinerary-quality";
import { initialIntent, type TripIntent } from "../src/lib/trip-intent";
import { createPlanner } from "../src/server/ai/prompts";
import { openDatabase } from "../src/server/db/connection";
import { trip, user } from "../src/server/db/schema";
import { createGenerationStore } from "../src/server/generation";
import { createTripStore } from "../src/server/trips";
import { venueReferences } from "../src/server/venue-references";
import { solRecording } from "./helpers/sol-recording";

// The production failure's planning inputs, without account or record identifiers.
const failedParis: TripIntent = {
  ...initialIntent(),
  step: 3,
  review: true,
  destination: "paris",
  departure: "Toronto",
  start: "2027-04-15",
  end: "2027-04-18",
  duration: 7,
  travelers: 1,
  budget: "2500",
  currency: "EUR",
  scope: "entire",
  selected: ["Art", "Culture"],
};
const base = solRecording.base;
const recorded = solRecording.plan.days;
const historicWalk = {
  ...recorded[0].activities[0],
  title: "Historic Le Marais district walk",
};
const artGallery = {
  ...recorded[3].activities[0],
  title: "Art gallery visit in Saint-Germain",
  location: "Rue de Seine, Paris",
  description:
    "Browse a small gallery on Rue de Seine for contemporary works and compare them with the neighborhood’s older architecture.",
  startMinute: 600,
};
const districtNames = ["Passy", "Batignolles", "Butte-aux-Cailles"];

function shortPlan(days: number): ModelItinerary {
  const day = (
    index: number,
    activities: ModelItinerary["days"][number]["activities"],
  ) => ({
    date: dateAfter(base.startDate, index),
    title: `Paris day ${index + 1}`,
    activities,
  });
  const full = (index: number) => {
    if (index <= 2) return day(index, recorded[index].activities);
    const district = districtNames[index - 3];
    return day(index, [
      {
        ...historicWalk,
        title: `Historic ${district} district walk`,
        location: `${district}, Paris`,
        startMinute: 600,
      },
      {
        ...historicWalk,
        title: `Bistro lunch in ${district}`,
        location: `${district} neighborhood bistro, Paris`,
        startMinute: 750,
        durationMinutes: 60,
        costMinor: 2400,
      },
      {
        ...historicWalk,
        title: `Architecture walk in ${district}`,
        location: `${district} side streets, Paris`,
        startMinute: 870,
        durationMinutes: 60,
      },
    ]);
  };
  const schedule =
    days === 1
      ? [day(0, recorded[1].activities.slice(0, 3))]
      : [
          day(0, [historicWalk, recorded[0].activities[1]]),
          ...Array.from({ length: days - 2 }, (_, i) => full(i + 1)),
          day(days - 1, days === 2 ? [artGallery] : recorded[3].activities),
        ];
  return {
    ...solRecording.plan,
    flightsMinor: days === 4 ? 78000 : 8000,
    accommodationMinor: (days - 1) * (days === 4 ? 17000 : 9500),
    foodMinor: days * 11000,
    localTransportMinor: days * 2500,
    days: schedule,
  };
}

test("mocked proposal and itinerary jobs complete for fixed 1, 2, 3, 4, 5 and 7 days and flexible dates", async (t) => {
  const { db, migrate, close } = await openDatabase({});
  try {
    await migrate();
    const userId = "short-trip-offline";
    await db.insert(user).values({
      id: userId,
      name: "Offline QA",
      email: "short-trip@example.com",
    });
    const trips = createTripStore(db);
    for (const [days, budget, flexible] of [
      [1, "300", false],
      [2, "550", false],
      [3, "800", false],
      [4, "2500", false],
      [5, "1400", false],
      [7, "1900", false],
      [3, "800", true],
    ] as const) {
      await t.test(
        `${flexible ? "flexible" : "fixed"} ${days} days`,
        async () => {
          const input: TripIntent =
            days === 4
              ? failedParis
              : {
                  ...failedParis,
                  departure: "Brussels",
                  end: dateAfter(base.startDate, flexible ? 6 : days - 1),
                  duration: flexible ? days : 7,
                  flexible,
                  month: flexible ? "2027-04" : "2027-05",
                  budget,
                };
          const calls: string[] = [];
          const model = createPlanner(
            "offline-short-trip",
            "openai",
            async (_schema, task, raw, full) => {
              const payload = raw as {
                intent: Partial<TripIntent>;
                groupBudgetMinor: number;
                planningLimitMinor: number;
                planningBrief?: { days: unknown[] };
              };
              calls.push(full ? "itinerary" : "proposal");
              assert.equal(payload.intent.duration, days);
              assert.equal(payload.intent.departure, input.departure);
              assert.equal(payload.groupBudgetMinor, Number(budget) * 100);
              assert.equal(payload.planningLimitMinor, Number(budget) * 90);
              assert.match(task, /Never extend or shift fixed dates/);
              if (flexible) {
                assert.equal(payload.intent.month, "2027-04");
                assert.ok(
                  !("start" in payload.intent) && !("end" in payload.intent),
                );
              } else {
                assert.equal(payload.intent.start, input.start);
                assert.equal(payload.intent.end, input.end);
                assert.ok(!("month" in payload.intent));
              }
              if (full) assert.equal(payload.planningBrief?.days.length, days);
              else assert.equal(payload.planningBrief, undefined);
              return full ? shortPlan(days) : base;
            },
          );
          const jobs = createGenerationStore(db, model, {
            perDay: 100,
            perMinute: 100,
            perUserHour: 100,
          });
          const draft = await trips.openDraft(userId, {});
          const autosaved = await trips.saveDraft(userId, draft.id, {
            version: draft.version,
            data: input,
          });
          assert.equal(autosaved.data.duration, input.duration);
          const saved = await trips.complete(userId, draft.id, {
            version: autosaved.version,
            data: input,
          });
          assert.equal(saved.data.duration, days);
          if (days === 4) {
            // Replay an existing pre-fix row as-is, without requiring a data migration.
            await db
              .update(trip)
              .set({ data: input })
              .where(eq(trip.id, saved.id));
          }
          await jobs.action(userId, saved.id, { action: "start" });
          await jobs.run(userId, saved.id);
          const proposal = await jobs.read(userId, saved.id);
          assert.equal(
            proposal?.status,
            "awaiting_confirmation",
            proposal?.error ?? "",
          );
          await jobs.action(userId, saved.id, { action: "confirm" });
          await jobs.run(userId, saved.id);
          const complete = await jobs.read(userId, saved.id);
          assert.equal(complete?.status, "complete", complete?.error ?? "");
          assert.equal(complete.audits[1].validation.quality, "passed");
          const result = await trips.read(userId, saved.id);
          assert.equal(result.itinerary?.days.length, days);
          assert.equal(
            result.itinerary?.days.at(-1)?.date,
            dateAfter(base.startDate, days - 1),
          );
          assert.equal(result.data.duration, days === 4 ? 7 : days);
          assert.deepEqual(calls, ["proposal", "itinerary"]);
        },
      );
    }

    await t.test(
      "a genuine travel feasibility refusal stops before itinerary generation",
      async () => {
        const reason =
          "The outbound and return journey cannot fit the selected same-day window.";
        const model = createPlanner(
          "offline-infeasible",
          "openai",
          async (_schema, _task, _raw, full) => {
            assert.equal(full, false);
            return { ...base, feasible: false, explanation: reason };
          },
        );
        const jobs = createGenerationStore(db, model, {
          perDay: 100,
          perMinute: 100,
          perUserHour: 100,
        });
        const draft = await trips.openDraft(userId, {});
        const saved = await trips.complete(userId, draft.id, {
          version: draft.version,
          data: { ...failedParis, end: failedParis.start },
        });
        await jobs.action(userId, saved.id, { action: "start" });
        await jobs.run(userId, saved.id);
        const failed = await jobs.read(userId, saved.id);
        assert.equal(failed?.status, "failed");
        assert.equal(failed.error, reason);
        assert.equal(failed.audits.length, 1);
        assert.equal(failed.audits[0].validation.domain, "failed");
        assert.equal((await trips.read(userId, saved.id)).itinerary, null);
      },
    );
  } finally {
    await close();
  }
});

test("short plans still reject changed dates, omitted costs, over-budget estimates, and insufficient travel time", () => {
  const plan = shortPlan(4);
  assert.throws(
    () =>
      validateItinerary(
        { ...plan, feasible: false, explanation: "Return travel cannot fit." },
        failedParis,
        base,
      ),
    /Return travel cannot fit/,
  );
  assert.throws(
    () => validateItinerary({ ...plan, flightsMinor: 0 }, failedParis, base),
    /omitted essential/,
  );
  assert.throws(
    () =>
      validateItinerary({ ...plan, accommodationMinor: 0 }, failedParis, base),
    /omitted essential/,
  );
  assert.throws(
    () =>
      validateItinerary({ ...plan, flightsMinor: 250000 }, failedParis, base),
    /exceed your budget/,
  );
  plan.days[3].date = "2027-04-19";
  assert.throws(
    () => validateItinerary(plan, failedParis, base),
    /respect your dates/,
  );
  plan.days[3].date = "2027-04-18";
  plan.days[0].activities[1] = {
    ...plan.days[0].activities[1],
    startMinute: 995,
  };
  assert.throws(
    () => normalizeTravelBuffers(plan, failedParis),
    /estimated travel minutes are required/,
  );
});

test("single-day evening interest can fit without extending dates or removing meal checks", () => {
  const intent = {
    ...failedParis,
    departure: "Lille",
    end: failedParis.start,
    selected: ["Art", "Nightlife"],
  };
  const plan = shortPlan(1);
  const evening = {
    ...historicWalk,
    title: "Live music at a Saint-Germain jazz club",
    location: "Rue des Lombards jazz club, Paris",
    description:
      "Spend an evening listening to a small jazz ensemble in the neighborhood and allow time to confirm the performance before travel.",
    startMinute: 1170,
    durationMinutes: 60,
  };
  plan.days[0].activities = [...plan.days[0].activities.slice(0, 2), evening];
  const normalized = normalizeTravelBuffers(plan, intent).plan;
  validateItinerary(normalized, intent, base);
  const quality = validateItineraryQuality(
    normalized,
    intent,
    base,
    venueReferences,
  );
  assert.match(
    quality.assumptions[0],
    /actual return is possible on the selected date/,
  );
  assert.throws(
    () =>
      validateItineraryQuality(
        normalized,
        { ...intent, selected: ["Art"] },
        base,
        venueReferences,
      ),
    /single-day planning window/,
  );
  evening.startMinute = 1110;
  evening.durationMinutes = 150;
  assert.throws(
    () => validateItineraryQuality(plan, intent, base, venueReferences),
    /substantial dinner/,
  );
});

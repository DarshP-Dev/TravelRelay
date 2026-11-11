import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  dateAfter,
  validateItinerary,
  validateProposal,
  type CityProposal,
} from "../src/lib/itinerary";
import { normalizeTravelBuffers } from "../src/lib/itinerary-normalization";
import {
  dayPolicies,
  validateItineraryQuality,
  type DayPolicy,
} from "../src/lib/itinerary-quality";
import {
  scheduleClock,
  schedulerChange,
  schedulerData,
} from "../src/lib/schedule-adapter";
import {
  sameDayTravel,
  travelWindow,
  travelWindowLabel,
} from "../src/lib/travel-days";
import { createApplication } from "../src/server/application";
import { initialValidationChecks } from "../src/server/ai/audit";
import { createPlanner } from "../src/server/ai/prompts";
import { openDatabase } from "../src/server/db/connection";
import { generation, generationAttempt } from "../src/server/db/schema";

import {
  fixturePlan,
  flightConflict,
  intent,
  oldProposal,
  tokyo,
} from "./helpers/international-travel-fixture";

test("confirmed transit days are derived for fixed and flexible travel windows, including 1–4 day edges", () => {
  assert.equal(
    travelWindowLabel(travelWindow(7, tokyo.travelTiming)),
    "7 travel-window days · 6 at the destination · 4 full sightseeing days · 5 destination nights",
  );
  for (const [totalDays, transit, roles] of [
    [1, sameDayTravel, ["single-day"]],
    [2, sameDayTravel, ["arrival", "departure"]],
    [3, tokyo.travelTiming, ["outbound-transit", "arrival", "departure"]],
    [
      4,
      { outboundTransitDays: 1, returnTransitDays: 1 },
      ["outbound-transit", "arrival", "departure", "return-transit"],
    ],
  ] as const) {
    for (const flexible of [true, false]) {
      const request = {
        ...intent,
        flexible,
        duration: flexible ? totalDays : 7,
        departure: totalDays < 3 ? "Nagoya" : "Toronto",
        start: tokyo.startDate,
        end: dateAfter(tokyo.startDate, totalDays - 1),
      };
      const proposal = validateProposal(
        { ...tokyo, travelTiming: transit },
        request,
      );
      const days = dayPolicies(request, proposal);
      assert.deepEqual(
        days.map((d) => d.role),
        roles,
      );
      assert.equal(
        days.at(-1)?.date,
        dateAfter(tokyo.startDate, totalDays - 1),
      );
    }
  }
  for (const duration of [1, 2])
    assert.throws(
      () => validateProposal(tokyo, { ...intent, duration }),
      /does not leave enough time/,
    );
  assert.throws(
    () => validateProposal({ ...tokyo, startDate: "2027-01-01" }, intent),
    /dates do not match/,
  );
});

test("only transit days may be empty and travel time, essential estimates and reserve remain enforced", () => {
  const plan = fixturePlan();
  const checked = validateItinerary(plan, intent, tokyo);
  const quality = validateItineraryQuality(checked.plan, intent, tokyo);
  assert.equal(quality.days[0].role, "outbound-transit");
  assert.equal(quality.days[0].maxActivities, 0);
  assert.equal(quality.days[1].role, "arrival");
  assert.equal(quality.days[1].minActivities, 1);
  assert.equal(quality.days[2].minActivities, 3);
  assert.equal(quality.days[6].endMinute, 720);
  assert.equal(checked.reserveMinor, 30_000);

  const missingLocal = fixturePlan();
  missingLocal.days[1].activities = [];
  assert.throws(
    () => validateItinerary(missingLocal, intent, tokyo),
    /Only transit days can be empty/,
  );
  const occupiedTransit = fixturePlan();
  occupiedTransit.days[0].activities = occupiedTransit.days[1].activities;
  assert.throws(
    () => validateItinerary(occupiedTransit, intent, tokyo),
    /reserved for transit/,
  );
  const shortBuffer = fixturePlan();
  shortBuffer.days[2].activities[1].startMinute = 695;
  assert.throws(
    () => normalizeTravelBuffers(shortBuffer, intent),
    /estimated travel minutes/,
  );
  const earlyArrival = fixturePlan();
  earlyArrival.days[1].activities[0].startMinute = 660;
  assert.throws(
    () => validateItineraryQuality(earlyArrival, intent, tokyo),
    /arrival planning window/,
  );
  const outboundAndReturn = {
    ...tokyo,
    travelTiming: { outboundTransitDays: 1, returnTransitDays: 1 },
  };
  const returnPlan = fixturePlan();
  returnPlan.days[5].activities = returnPlan.days[6].activities;
  returnPlan.days[6].activities = [];
  assert.doesNotThrow(() =>
    validateItinerary(returnPlan, intent, outboundAndReturn),
  );
  assert.equal(
    validateItineraryQuality(returnPlan, intent, outboundAndReturn).days[6]
      .role,
    "return-transit",
  );
  assert.throws(
    () =>
      validateItinerary(
        { ...plan, feasible: false, explanation: flightConflict },
        intent,
        tokyo,
      ),
    { message: flightConflict },
  );
  const entire = { ...intent, scope: "entire" as const, budget: "4000" };
  for (const cost of [
    "flightsMinor",
    "accommodationMinor",
    "foodMinor",
  ] as const)
    assert.throws(
      () => validateItinerary({ ...plan, [cost]: 0 }, entire, tokyo),
      /omitted essential|itemized/i,
    );
  assert.throws(
    () => validateItinerary(plan, { ...entire, budget: "3000" }, tokyo),
    /exceed your budget/,
  );
});

test("Tokyo template confirms typed timing and an explicitly reviewed legacy retry preserves both failed audits", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw Error("No live provider requests in the transit replay.");
  });
  const connection = await openDatabase({});
  t.after(() => connection.close());
  await connection.migrate();
  const calls: string[] = [];
  const model = createPlanner(
    "offline-tokyo",
    "openai",
    async (schema, task, payload, full) => {
      calls.push(full ? "itinerary" : "proposal");
      const input = payload as {
        intent: { duration: number };
        confirmedBase?: CityProposal;
        planningBrief?: { days: DayPolicy[] };
      };
      assert.equal(input.intent.duration, 7);
      if (!full) {
        assert.match(task, /time zones, date-line crossings/);
        assert.equal(input.planningBrief, undefined);
        assert.equal(schema.safeParse(oldProposal).success, false);
        return schema.parse(tokyo);
      }
      assert.match(task, /empty activities array/);
      assert.deepEqual(input.confirmedBase?.travelTiming, tokyo.travelTiming);
      assert.equal(input.confirmedBase?.explanation, undefined);
      assert.deepEqual(input.planningBrief?.days, dayPolicies(intent, tokyo));
      return schema.parse(fixturePlan());
    },
  );
  const origin = "http://localhost:3000";
  const app = createApplication(connection.db, {
    origin,
    secret: randomUUID() + randomUUID(),
    model,
    generationLimits: { perMinute: 10, perDay: 10, perUserHour: 10 },
  });
  const signup = await app.authHandler(
    new Request(origin + "/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "x-forwarded-for": "127.0.0.1",
      },
      body: JSON.stringify({
        name: "Transit QA",
        email: "transit-qa@example.com",
        password: randomUUID(),
      }),
    }),
  );
  assert.equal(signup.status, 200);
  const userId = (await signup.json()).user.id as string;
  async function saveTrip() {
    const draft = await app.trips.openDraft(userId, { templateId: "tokyo" });
    return app.trips.complete(userId, draft.id, {
      version: draft.version,
      data: intent,
    });
  }

  const fresh = await saveTrip();
  await app.generations.action(userId, fresh.id, { action: "start" });
  await app.generations.run(userId, fresh.id);
  const pending = await app.generations.read(userId, fresh.id);
  assert.equal(pending?.status, "awaiting_confirmation");
  assert.deepEqual(pending.proposal?.travelTiming, tokyo.travelTiming);
  await assert.rejects(
    app.generations.action(userId, fresh.id, {
      action: "confirm",
      travelTiming: sameDayTravel,
    }),
    { status: 409 },
  );
  await app.generations.action(userId, fresh.id, { action: "confirm" });
  await app.generations.run(userId, fresh.id);
  const completed = await app.generations.read(userId, fresh.id);
  assert.equal(completed?.status, "complete", completed?.error ?? undefined);
  assert.equal(completed.audits.at(-1)?.validation.quality, "passed");

  const legacy = await saveTrip();
  const [job] = await connection.db
    .insert(generation)
    .values({
      userId,
      tripId: legacy.id,
      status: "failed",
      attempts: 2,
      confirmed: true,
      proposal: oldProposal,
      error: flightConflict,
    })
    .returning();
  const historical = await connection.db
    .insert(generationAttempt)
    .values(
      [1, 2].map((attempt) => ({
        generationId: job.id,
        userId,
        tripId: legacy.id,
        attempt,
        phase: "itinerary",
        provider: "openai",
        model: "gpt-6.1-sol",
        status: "failed",
        error: flightConflict,
        createdAt: new Date(`2026-11-11T18:0${attempt}:00Z`),
        validation: {
          ...initialValidationChecks(),
          provider: "passed",
          schema: "passed",
          normalization: "passed",
          domain: "failed",
        } as const,
      })),
    )
    .returning();
  await assert.rejects(
    app.generations.action(userId, legacy.id, { action: "retry" }),
    { status: 422 },
  );
  await assert.rejects(
    app.generations.action(userId, legacy.id, {
      action: "retry",
      travelTiming: { outboundTransitDays: 6, returnTransitDays: 0 },
    }),
    { status: 422 },
  );
  assert.deepEqual(
    (await app.generations.read(userId, legacy.id))?.audits,
    historical,
  );
  assert.deepEqual(calls, ["proposal", "itinerary"]);
  await app.generations.action(userId, legacy.id, {
    action: "retry",
    travelTiming: tokyo.travelTiming,
  });
  await app.generations.run(userId, legacy.id);
  const replay = await app.generations.read(userId, legacy.id);
  assert.equal(replay?.status, "complete", replay?.error ?? undefined);
  assert.deepEqual(replay.audits.slice(0, 2), historical);
  assert.equal(replay.audits[2].attempt, 3);
  assert.deepEqual(calls, ["proposal", "itinerary", "itinerary"]);

  const plan = (await app.trips.read(userId, legacy.id)).itinerary!;
  assert.equal(plan.days.length, 7);
  assert.equal(plan.days.at(-1)?.date, "2026-12-13");
  assert.deepEqual(plan.days[0].activities, []);
  assert.equal(plan.days[0].title, "Outbound transit");
  const wallet = await app.wallet.read(userId, legacy.id);
  assert.equal(wallet.budget.reserveMinor, 30_000);
  assert.equal(wallet.summary.actualHomeMinor, 0);
  assert.ok(
    wallet.activities.every((activity) => activity.dayId !== plan.days[0].id),
  );

  const schedule = schedulerData(plan);
  assert.match(schedule.resources[0].name, /Outbound transit/);
  assert.ok(
    schedule.events.every((event) => event.resourceId !== plan.days[0].id),
  );
  assert.throws(
    () =>
      schedulerChange(
        plan,
        plan.days[1].activities[0].id,
        plan.days[0].id,
        scheduleClock(900),
        scheduleClock(960),
      ),
    /reserved for transit/,
  );
  const edit = await app.itineraryEditor.read(userId, legacy.id);
  const input = {
    version: edit.version,
    mutationId: randomUUID(),
    operation: {
      action: "add",
      activityId: randomUUID(),
      dayId: plan.days[0].id,
      data: {
        title: "Manual neighborhood walk",
        description: "A walk at the destination.",
        category: "other",
        location: "Marunouchi",
        currency: "USD",
        latitude: 35.68,
        longitude: 139.76,
        startMinute: 900,
        durationMinutes: 60,
        bufferBeforeMinutes: 30,
        costMinor: 0,
        links: [],
      },
    },
  };
  const preview = await app.itineraryEditor.preview(userId, legacy.id, input);
  assert.equal(preview.canSave, false);
  assert.ok(
    preview.assessment.errors.some(({ code }) => code === "transit-activity"),
  );
  await assert.rejects(app.itineraryEditor.commit(userId, legacy.id, input), {
    status: 422,
  });
  assert.deepEqual((await app.trips.read(userId, legacy.id)).itinerary, plan);
  const edited = await app.itineraryEditor.commit(userId, legacy.id, {
    ...input,
    mutationId: randomUUID(),
    operation: {
      ...input.operation,
      dayId: plan.days[1].id,
      data: { ...input.operation.data, startMinute: 1080 },
    },
  });
  assert.deepEqual(edited.itinerary.base.travelTiming, tokyo.travelTiming);
  assert.deepEqual(edited.itinerary.days[0].activities, []);
  assert.equal(
    (await app.wallet.read(userId, legacy.id)).budget.reserveMinor,
    30_000,
  );
});

import { before, after, test, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { prepareOfflineSolReview } from "./helpers/offline-sol-review";
import { solRecording } from "./helpers/sol-recording";
import { openDatabase } from "../src/server/db/connection";
import { createApplication } from "../src/server/application";
import { trip, itineraryEdit } from "../src/server/db/schema";
import {
  categoryFor,
  assessManualSchedule,
  materializeActivities,
  editRequestSchema,
  type EditRequest,
  type EditableActivity,
} from "../src/lib/itinerary-editing";
import {
  safeReferenceSchema,
  parseEstimatedCost,
  referenceSource,
} from "../src/lib/activity-metadata";
import {
  schedulerData,
  schedulerChange,
  scheduleClock,
  escapeScheduleText,
} from "../src/lib/schedule-adapter";
import type { SavedActivity, Itinerary } from "../src/lib/itinerary";
import { venueReferences } from "../src/server/venue-references";

const root = path.resolve(".test-data"),
  origin = "http://localhost:3000";
let directory: string,
  state: Awaited<ReturnType<typeof prepareOfflineSolReview>>,
  app: ReturnType<typeof createApplication>,
  original: Itinerary,
  bob: string;
const persisted: string[] = [];
before(async () => {
  mock.method(globalThis, "fetch", async () => {
    throw Error("All external/model traffic is forbidden in editing tests.");
  });
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(path.join(root, "manual-edits-"));
  state = await prepareOfflineSolReview(directory, origin);
  app = state.app;
  await state.worker();
  original = (await app.trips.read(state.userId, state.trip.id)).itinerary!;
  const signed = await app.authHandler(
    new Request(origin + "/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Other editor",
        email: "other-editor@example.com",
        password: state.password,
      }),
    }),
  );
  assert.equal(signed.status, 200);
  bob = signed.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join(";");
});
after(async () => {
  await state.close();
  if (path.dirname(directory) === root)
    await rm(directory, { recursive: true, force: true });
  mock.restoreAll();
});
async function fresh(currency: "EUR" | "JPY" = "EUR") {
  const draft = await app.trips.openDraft(state.userId, {});
  const saved = await app.trips.complete(state.userId, draft.id, {
    version: draft.version,
    data: {
      ...solRecording.intent,
      currency,
      budget: currency === "JPY" ? "250000" : "2500",
    },
  });
  const plan = structuredClone(original);
  plan.currency = currency;
  if (currency === "JPY") delete plan.budget;
  await state.connection.db
    .update(trip)
    .set({ itinerary: plan })
    .where(eq(trip.id, saved.id));
  return saved;
}
function data(a: SavedActivity): EditableActivity {
  return {
    title: a.title,
    description: a.description,
    category: categoryFor(a),
    location: a.location,
    latitude: a.latitude,
    longitude: a.longitude,
    startMinute: a.startMinute,
    durationMinutes: a.durationMinutes,
    bufferBeforeMinutes: a.bufferBeforeMinutes,
    costMinor: a.costMinor,
    currency: "EUR",
    links: a.links ?? [],
  };
}
const req = (operation: EditRequest["operation"], version = 0) => ({
  version,
  mutationId: randomUUID(),
  operation,
});
async function api(
  id: string,
  body?: unknown,
  preview = false,
  cookie = state.cookie,
  requestOrigin = origin,
) {
  return app.itineraryHandler(
    new Request(
      origin + `/api/trips/${id}/itinerary${preview ? "/preview" : ""}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          origin: requestOrigin,
          cookie,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    ),
    id,
    preview,
  );
}
function addition(dayId: string, changes: Partial<EditableActivity> = {}) {
  return req({
    action: "add",
    activityId: randomUUID(),
    dayId,
    data: {
      title: "A quiet neighborhood stop",
      description:
        "A custom visit planned by the traveler, with unverified details.",
      category: "other",
      location: "Rue du Bac, Paris",
      latitude: null,
      longitude: null,
      startMinute: 960,
      durationMinutes: 30,
      bufferBeforeMinutes: 30,
      costMinor: 1000,
      currency: "EUR",
      links: [],
      ...changes,
    },
  });
}

test("activity CRUD uses authenticated previews, stable IDs, audit snapshots and explicit delete/undo", async () => {
  const saved = await fresh(),
    day = original.days[1],
    command = addition(day.id);
  const preview = await api(saved.id, command, true);
  assert.equal(preview.status, 200);
  const proposal = await preview.json();
  assert.equal(proposal.canSave, true);
  assert.equal(
    (await app.trips.read(state.userId, saved.id)).itineraryVersion,
    0,
  );
  assert.equal((await api(saved.id, command)).status, 200);
  const after = await app.itineraryEditor.read(state.userId, saved.id);
  assert.equal(after.version, 1);
  const added = after.itinerary.days[1].activities.find(
    (a) => a.id === (command.operation as { activityId: string }).activityId,
  )!;
  assert.equal(added.latitude, null);
  assert.equal(added.origin, "manual");
  assert.equal(after.itinerary.budget?.remainingMinor, 21600);
  const updated = req(
    {
      action: "update",
      activityId: added.id,
      dayId: original.days[2].id,
      data: {
        ...data(added),
        title: "A personal evening pause",
        description: "Updated custom description.",
        location: "Quai de Valmy, Paris",
        startMinute: 990,
        durationMinutes: 30,
        costMinor: 2000,
        links: [
          {
            label: "Traveler inspiration",
            url: "https://www.instagram.com/p/example-reference/",
          },
        ],
      },
    },
    1,
  );
  assert.equal((await api(saved.id, updated)).status, 200);
  let current = await app.itineraryEditor.read(state.userId, saved.id);
  assert.ok(
    current.itinerary.days[2].activities.some(
      (a) => a.id === added.id && a.title === "A personal evening pause",
    ),
  );
  assert.ok(
    !current.itinerary.days[1].activities.some((a) => a.id === added.id),
  );
  assert.equal(
    (await api(saved.id, req({ action: "delete", activityId: added.id }, 2)))
      .status,
    200,
  );
  current = await app.itineraryEditor.read(state.userId, saved.id);
  assert.ok(
    !current.itinerary.days
      .flatMap((d) => d.activities)
      .some((a) => a.id === added.id),
  );
  assert.equal(
    (
      await api(
        saved.id,
        req({ action: "restore", editId: current.history[0].id }, 3),
      )
    ).status,
    200,
  );
  current = await app.itineraryEditor.read(state.userId, saved.id);
  assert.ok(
    current.itinerary.days[2].activities.some((a) => a.id === added.id),
  );
  assert.equal(current.history.length, 4);
  assert.equal(current.itinerary.manualEdit?.revision, 4);
  persisted.push(saved.id);
});

test("overlaps, actual insufficient gaps, trip boundaries and off-base coordinates block commit without moving times", async () => {
  const saved = await fresh(),
    a = original.days[1].activities[1];
  for (const changes of [
    { startMinute: 660 },
    { startMinute: 725 },
    { startMinute: 1430, durationMinutes: 60 },
    { latitude: 0, longitude: 0 },
  ]) {
    const command = req({
      action: "update",
      activityId: a.id,
      dayId: original.days[1].id,
      data: { ...data(a), ...changes },
    });
    const p = await (await api(saved.id, command, true)).json();
    assert.equal(p.canSave, false, JSON.stringify(changes));
    assert.equal((await api(saved.id, command)).status, 422);
  }
  assert.equal(
    (await app.itineraryEditor.read(state.userId, saved.id)).version,
    0,
  );
  const invalidDay = addition(randomUUID());
  assert.equal((await api(saved.id, invalidDay)).status, 422);
});

test("known venue published hours and unverified indoor windows remain safety restrictions", async () => {
  const saved = await fresh(),
    a = original.days[1].activities[0];
  const command = req({
    action: "update",
    activityId: a.id,
    dayId: original.days[1].id,
    data: { ...data(a), startMinute: 1080, durationMinutes: 90 },
  });
  const preview = await (await api(saved.id, command, true)).json();
  assert.ok(
    preview.assessment.errors.some(
      (e: { code: string }) => e.code === "published-hours",
    ),
  );
  assert.equal((await api(saved.id, command)).status, 422);
  const plan = materializeActivities(original);
  plan.days[0].activities[1].title = "Visit a local temple";
  plan.days[0].activities[1].location = "A specific temple, Paris";
  plan.days[0].activities[1].category = "culture";
  assert.ok(
    assessManualSchedule(
      plan,
      solRecording.intent,
      venueReferences,
    ).errors.some((e) => e.code === "unverified-venue-window"),
  );
  const passing = assessManualSchedule(
    materializeActivities(original),
    solRecording.intent,
    venueReferences,
  );
  assert.equal(passing.errors.length, 0);
  assert.ok(passing.references?.some((r) => r.name === "Musée d’Orsay"));
});

test("same-day reorder previews every shifted time and cross-day moves preserve chronological order", async () => {
  const saved = await fresh();
  const first = addition(original.days[3].id, {
    startMinute: 660,
    costMinor: 0,
  });
  assert.equal((await api(saved.id, first)).status, 200);
  const id = (first.operation as { activityId: string }).activityId,
    reorder = req(
      { action: "reorder", activityId: id, direction: "earlier" },
      1,
    );
  const p = await (await api(saved.id, reorder, true)).json();
  assert.equal(p.canSave, true);
  assert.equal(p.changes.length, 2);
  assert.equal((await api(saved.id, reorder)).status, 200);
  const current = await app.itineraryEditor.read(state.userId, saved.id);
  assert.equal(current.itinerary.days[3].activities[0].id, id);
  assert.equal(current.itinerary.days[3].activities[0].startMinute, 570);
});

test("food and transport changes reconcile once with preserved allowances, reserve and expense identity", async () => {
  const saved = await fresh(),
    dinner = original.days[0].activities[1];
  const change = req({
    action: "update",
    activityId: dinner.id,
    dayId: original.days[0].id,
    data: { ...data(dinner), category: "food", costMinor: 10000 },
  });
  assert.equal((await api(saved.id, change)).status, 200);
  let current = await app.itineraryEditor.read(state.userId, saved.id);
  assert.equal(current.itinerary.foodMinor, 53000);
  assert.equal(current.itinerary.reserveMinor, 25000);
  assert.equal(current.itinerary.budget?.remainingMinor, 19600);
  assert.equal(
    current.itinerary.budget?.allocations.find((a) => a.category === "food")
      ?.unitemizedAllowanceMinor,
    17500,
  );
  assert.equal(
    current.itinerary.budget?.expenses.find((e) => e.activityId === dinner.id)
      ?.estimatedMinor,
    10000,
  );
  assert.equal(
    (await api(saved.id, req({ action: "delete", activityId: dinner.id }, 1)))
      .status,
    200,
  );
  current = await app.itineraryEditor.read(state.userId, saved.id);
  assert.equal(current.itinerary.foodMinor, 43000);
  assert.equal(current.itinerary.budget?.remainingMinor, 29600);
  const transport = addition(original.days[1].id, {
    category: "transport",
    title: "Local transfer estimate",
    costMinor: 1200,
  });
  transport.version = 2;
  assert.equal((await api(saved.id, transport)).status, 200);
  current = await app.itineraryEditor.read(state.userId, saved.id);
  assert.equal(current.itinerary.localTransportMinor, 23200);
  assert.equal(
    current.itinerary.budget?.allocations.find(
      (a) => a.category === "localTransport",
    )?.unitemizedAllowanceMinor,
    22000,
  );
});

test("over-budget edits need explicit acknowledgement and currency denomination cannot be changed", async () => {
  const saved = await fresh(),
    command = addition(original.days[1].id, { costMinor: 100000 });
  const p = await (await api(saved.id, command, true)).json();
  assert.equal(p.canSave, true);
  assert.equal(p.overBudget, true);
  assert.equal((await api(saved.id, command)).status, 422);
  assert.equal(
    (await api(saved.id, { ...command, acknowledgeOverBudget: true })).status,
    200,
  );
  assert.equal(
    (await app.itineraryEditor.read(state.userId, saved.id)).itinerary
      .reserveMinor,
    25000,
  );
  const wrong = addition(original.days[2].id, { currency: "USD" });
  wrong.version = 1;
  assert.equal((await api(saved.id, wrong)).status, 422);
  const yen = await fresh("JPY"),
    jpy = addition(original.days[1].id, { currency: "JPY", costMinor: 100 });
  assert.equal((await api(yen.id, jpy)).status, 200);
  const current = await app.itineraryEditor.read(state.userId, yen.id);
  assert.equal(current.itinerary.currency, "JPY");
  assert.ok(
    current.itinerary.budget?.expenses.every((e) => e.currency === "JPY"),
  );
  assert.equal(parseEstimatedCost("100", "JPY"), 100);
  assert.throws(() => parseEstimatedCost("1.50", "JPY"));
  assert.equal(parseEstimatedCost("1.50", "EUR"), 150);
});

test("concurrent edits use compare-and-swap versions; repeated mutation IDs are idempotent", async () => {
  const saved = await fresh();
  const one = addition(original.days[1].id),
    two = addition(original.days[2].id, { startMinute: 990 });
  const results = await Promise.all([api(saved.id, one), api(saved.id, two)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const current = await app.itineraryEditor.read(state.userId, saved.id);
  assert.equal(current.version, 1);
  assert.equal(current.history.length, 1);
  const successful = results[0].status === 200 ? one : two;
  assert.equal((await api(saved.id, successful)).status, 200);
  assert.equal(
    (
      await api(saved.id, {
        ...successful,
        operation: { ...successful.operation, activityId: randomUUID() },
      })
    ).status,
    409,
  );
  assert.equal(
    (await app.itineraryEditor.read(state.userId, saved.id)).version,
    1,
  );
});

test("anonymous, cross-origin, foreign ownership and invalid edit payloads cannot mutate resources", async () => {
  const saved = await fresh(),
    command = addition(original.days[1].id);
  assert.equal((await api(saved.id, command, false, "")).status, 401);
  assert.equal((await api(saved.id, undefined, false, bob)).status, 404);
  assert.equal((await api(saved.id, command, true, bob)).status, 404);
  assert.equal((await api(saved.id, command, false, bob)).status, 404);
  assert.equal(
    (await api(saved.id, command, false, state.cookie, "https://other.invalid"))
      .status,
    403,
  );
  for (const bad of [
    { ...command, ownerId: state.userId },
    {
      ...command,
      operation: {
        ...command.operation,
        data: {
          ...(command.operation as { data: EditableActivity }).data,
          costMinor: -1,
        },
      },
    },
    {
      ...command,
      operation: {
        ...command.operation,
        data: {
          ...(command.operation as { data: EditableActivity }).data,
          latitude: 48,
          longitude: null,
        },
      },
    },
  ])
    assert.equal((await api(saved.id, bad)).status, 400);
  const large = new Request(origin + "/itinerary", {
    method: "POST",
    headers: {
      origin,
      cookie: state.cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...command, padding: "x".repeat(21000) }),
  });
  assert.equal((await app.itineraryHandler(large, saved.id)).status, 413);
});

test("social sources are safe references, never fetched or marked verified; coordinate absence remains explicit", async () => {
  for (const url of [
    "javascript:alert(1)",
    "http://instagram.com/p/x",
    "https://user:pass@instagram.com/p/x",
    "https://127.0.0.1/a",
    "https://[::1]/a",
    "https://example.local/a",
  ])
    assert.equal(
      safeReferenceSchema.safeParse({ label: "Source", url }).success,
      false,
      url,
    );
  for (const [url, label] of [
    ["https://www.instagram.com/p/source/", "Instagram"],
    ["https://www.tiktok.com/@sample/video/123", "TikTok"],
    ["https://instagram.com.evil.example/x", "instagram.com.evil.example"],
  ]) {
    assert.equal(
      safeReferenceSchema.safeParse({ label: "Unverified reference", url })
        .success,
      true,
    );
    assert.equal(referenceSource(url), label);
  }
  const saved = await fresh(),
    command = addition(original.days[1].id, {
      links: [
        {
          label: "Original post",
          url: "https://www.tiktok.com/@sample/video/123",
        },
      ],
    });
  assert.equal((await api(saved.id, command)).status, 200);
  const edited = await app.itineraryEditor.read(state.userId, saved.id);
  const item = edited.itinerary.days
    .flatMap((d) => d.activities)
    .find(
      (a) => a.id === (command.operation as { activityId: string }).activityId,
    )!;
  assert.equal(item.latitude, null);
  assert.equal(item.longitude, null);
  assert.equal(item.coordinateSource, "missing");
  assert.equal(item.links?.[0].label, "Original post");
  assert.equal(
    (
      await api(
        saved.id,
        req(
          {
            action: "update",
            activityId: item.id,
            dayId: original.days[1].id,
            data: { ...data(item), links: [] },
          },
          1,
        ),
      )
    ).status,
    200,
  );
  const withoutReference = await app.itineraryEditor.read(
    state.userId,
    saved.id,
  );
  assert.deepEqual(
    withoutReference.itinerary.days
      .flatMap((d) => d.activities)
      .find((a) => a.id === item.id)?.links,
    [],
  );
  persisted.push(saved.id);
});

test("Bryntum adapter maps real day IDs and wall-clock times; drag/resize proposals never round or change identity", async () => {
  const rows = schedulerData(original),
    a = original.days[1].activities[0];
  assert.equal(rows.resources[0].id, original.days[0].id);
  assert.equal(
    rows.events.find((e) => e.id === a.id)?.resourceId,
    original.days[1].id,
  );
  const change = schedulerChange(
    original,
    a.id,
    original.days[2].id,
    scheduleClock(600),
    scheduleClock(750),
  );
  assert.deepEqual(change, {
    activityId: a.id,
    dayId: original.days[2].id,
    startMinute: 600,
    durationMinutes: 150,
  });
  assert.throws(() =>
    schedulerChange(
      original,
      a.id,
      original.days[0].id,
      scheduleClock(1400),
      scheduleClock(1500),
    ),
  );
  assert.throws(() =>
    schedulerChange(
      original,
      a.id,
      randomUUID(),
      scheduleClock(600),
      scheduleClock(700),
    ),
  );
  assert.equal(
    escapeScheduleText('<img src=x onerror="bad()">'),
    "&lt;img src=x onerror=&quot;bad()&quot;&gt;",
  );
  const license = await readFile(
    "node_modules/@bryntum/scheduler-community/LICENSE",
    "utf8",
  );
  assert.ok(license.includes("MIT License"));
  assert.equal(
    editRequestSchema.safeParse({
      version: 0,
      mutationId: randomUUID(),
      operation: { action: "provider-call" },
    }).success,
    false,
  );
});

test("manual meal timing and repeated published venues remain explicit suggestions without relaxing generation checks", () => {
  const plan = materializeActivities(original);
  plan.days[0].activities[1].startMinute = 1020;
  const fourth = plan.days[3].activities[0];
  plan.days[3].activities[0] = {
    ...plan.days[1].activities[0],
    id: fourth.id,
    startMinute: 570,
  };
  const assessment = assessManualSchedule(
    plan,
    solRecording.intent,
    venueReferences,
  );
  assert.deepEqual(assessment.errors, []);
  assert.ok(assessment.warnings.some((w) => w.code === "meal-time"));
  assert.ok(assessment.warnings.some((w) => w.code === "duplicate-venue"));
});

test("manual edits and history survive database reopen/login and leave every original generation audit unchanged", async () => {
  const before = await app.generations.read(state.userId, state.trip.id);
  const activity = original.days[0].activities[1];
  assert.equal(
    (
      await api(
        state.trip.id,
        req({
          action: "update",
          activityId: activity.id,
          dayId: original.days[0].id,
          data: {
            ...data(activity),
            title: "A personally chosen bistro dinner",
          },
        }),
      )
    ).status,
    200,
  );
  assert.deepEqual(
    (await app.generations.read(state.userId, state.trip.id))?.audits,
    before?.audits,
  );
  assert.deepEqual(state.calls, { proposal: 0, itinerary: 1 });
  const expected = await Promise.all(
    persisted.map((id) => app.itineraryEditor.read(state.userId, id)),
  );
  const [first] = await state.connection.db
    .select()
    .from(itineraryEdit)
    .where(eq(itineraryEdit.tripId, state.trip.id));
  assert.deepEqual(
    first.before,
    original,
    "Original AI itinerary must remain in audit history.",
  );
  await state.close();
  const reopened = await openDatabase({ directory });
  try {
    const restored = createApplication(reopened.db, state.config);
    const login = await restored.authHandler(
      new Request(origin + "/api/auth/sign-in/email", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email: state.email, password: state.password }),
      }),
    );
    assert.equal(login.status, 200);
    const cookie = login.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join(";");
    for (const [i, id] of persisted.entries()) {
      const response = await restored.itineraryHandler(
        new Request(origin + `/api/trips/${id}/itinerary`, {
          headers: { cookie },
        }),
        id,
      );
      assert.equal(response.status, 200);
      const current = await response.json();
      assert.deepEqual(current.itinerary, expected[i].itinerary);
      assert.equal(current.history.length, expected[i].history.length);
    }
    assert.deepEqual(
      (await restored.generations.read(state.userId, state.trip.id))?.audits,
      before?.audits,
    );
  } finally {
    await reopened.close();
  }
});

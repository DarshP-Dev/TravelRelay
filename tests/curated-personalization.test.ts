import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { openDatabase } from "../src/server/db/connection";
import { createApplication } from "../src/server/application";
import { generation } from "../src/server/db/schema";
import { curatedTrips, curatedPlanningBrief } from "../src/lib/curated-trips";
import {
  initialIntent,
  completeIntentSchema,
  type TripIntent,
} from "../src/lib/trip-intent";
import {
  PlanningError,
  type CityProposal,
  type Itinerary,
} from "../src/lib/itinerary";
import { generationPresentation } from "../src/lib/generation-presentation";
import { createPlanner } from "../src/server/ai/prompts";
import { solRecording } from "./helpers/sol-recording";

const origin = "http://localhost:3000";
const root = path.resolve(".test-data");
const secret = randomBytes(32).toString("hex");
const password = randomBytes(20).toString("hex");
const config = {
  origin,
  secret,
  generationLimits: { perMinute: 100, perDay: 1000, perUserHour: 100 },
};
const centers: Record<string, [number, number]> = {
  tokyo: [35.6762, 139.6503],
  "cinque-terre": [44.1465, 9.654],
  kyoto: [35.0116, 135.7681],
  paris: [48.8566, 2.3522],
  santorini: [36.4167, 25.4333],
  dolomites: [46.735, 12.223],
};
let directory: string,
  db: Awaited<ReturnType<typeof openDatabase>>,
  app: ReturnType<typeof createApplication>;
let alice: string, bob: string, userId: string;
let proposals = 0,
  itineraries = 0,
  failNext = false;
const completed: {
  id: string;
  draftId: string;
  data: TripIntent;
  itinerary: Itinerary;
}[] = [];
function request(url: string, method = "GET", cookie = alice, body?: unknown) {
  return new Request(origin + url, {
    method,
    headers: {
      origin,
      cookie,
      "content-type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const model = {
  name: "offline-template-integration-only",
  async propose(intent: TripIntent) {
    proposals++;
    const template = curatedTrips.find((t) => t.id === intent.templateId)!;
    const [latitude, longitude] = centers[template.id];
    return {
      ...solRecording.base,
      city: intent.destination.split(",")[0],
      country: template.country,
      latitude,
      longitude,
      startDate: intent.start,
    };
  },
  async generate(intent: TripIntent, base: CityProposal) {
    itineraries++;
    const record = (await app.trips.list(userId)).find(
      (t) => t.data.templateId === intent.templateId && !t.itinerary,
    )!;
    assert.equal(record.generationStatus, "generating");
    assert.equal(
      record.itinerary,
      null,
      "No partial itinerary may appear in lists.",
    );
    if (failNext) {
      failNext = false;
      throw new PlanningError(
        "Offline test provider failure. Your input is safe.",
      );
    }
    // Authored test-only candidates, not real venue data or runtime fallbacks.
    const plan = structuredClone(solRecording.plan);
    plan.city = base.city;
    plan.currency = intent.currency;
    for (const [dayIndex, day] of plan.days.entries()) {
      for (const [activityIndex, activity] of day.activities.entries()) {
        activity.city = base.city;
        activity.latitude =
          base.latitude + (activity.latitude - solRecording.base.latitude);
        activity.longitude =
          base.longitude +
          ((activity.longitude - solRecording.base.longitude) *
            Math.cos((solRecording.base.latitude * Math.PI) / 180)) /
            Math.cos((base.latitude * Math.PI) / 180);
        activity.location = `Offline test neighborhood block ${dayIndex + 1}-${activityIndex + 1}`;
        activity.description =
          "An authored offline test experience at a specific neighborhood, with unverified access and service details. No real venue or availability is claimed.";
      }
    }
    plan.days[0].activities[0].title = "Heritage garden and neighborhood walk";
    plan.days[1].activities[0].title = "Local art museum visit";
    plan.days[1].activities[2].title = "Boutique shopping and culture walk";
    plan.days[2].activities[0].title = "Hiking the city garden trail";
    return plan;
  },
};
async function action(
  id: string,
  action: "start" | "confirm" | "retry",
  cookie = alice,
) {
  const tasks: (() => Promise<void>)[] = [];
  const response = await app.generationHandler(
    request(`/api/trips/${id}/generation`, "POST", cookie, { action }),
    id,
    (work) => tasks.push(work),
  );
  return { response, tasks };
}
async function createTrip(templateId: string) {
  const response = await app.handle(
    request("/api/drafts", "POST", alice, { templateId }),
    "drafts",
  );
  assert.equal(response.status, 200);
  const draft = await response.json();
  const data = {
    ...draft.data,
    departure: "London, UK",
    start: "2027-04-15",
    end: "2027-04-18",
    budget: "2500",
    currency: "EUR",
    scope: "entire",
    travelers: 2,
    travelersConfirmed: true,
    step: 3,
    review: true,
  };
  const saved = await app.handle(
    request(`/api/drafts/${draft.id}`, "PUT", alice, {
      version: draft.version,
      data,
    }),
    "drafts",
    draft.id,
  );
  assert.equal(saved.status, 200);
  const current = await saved.json();
  assert.deepEqual(
    (await app.trips.openDraft(userId, { templateId })).data,
    data,
    "Template reselect must retain user edits, not reapply defaults.",
  );
  const complete = await app.handle(
    request(`/api/drafts/${draft.id}/complete`, "POST", alice, {
      version: current.version,
      data,
    }),
    "drafts",
    draft.id,
    true,
  );
  assert.equal(complete.status, 200, await complete.clone().text());
  return complete.json();
}
before(async () => {
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(path.join(root, "curated-integration-"));
  db = await openDatabase({ directory });
  await db.migrate();
  app = createApplication(db.db, { ...config, model });
  for (const name of ["curated-alice", "curated-bob"]) {
    const response = await app.authHandler(
      request("/api/auth/sign-up/email", "POST", "", {
        name,
        email: `${name}@example.com`,
        password,
      }),
    );
    assert.equal(response.status, 200);
    const cookie = response.headers
      .getSetCookie()
      .map((s) => s.split(";")[0])
      .join(";");
    if (name.endsWith("alice")) {
      alice = cookie;
      userId = (await response.json()).user.id;
    } else bob = cookie;
  }
});
after(async () => {
  await db?.close();
  if (directory && path.dirname(directory) === root)
    await rm(directory, { recursive: true, force: true });
});

test("all six template selections prefill editable destinations/interests but require personal dates, budget and traveler confirmation", async () => {
  for (const template of curatedTrips) {
    const draft = await app.trips.openDraft(userId, {
      templateId: template.id,
    });
    assert.deepEqual(draft.data, initialIntent(template.id));
    assert.equal(
      draft.data.destination,
      `${template.city}, ${template.country}`,
    );
    assert.deepEqual(draft.data.selected, template.interests);
    assert.equal(draft.data.budget, "");
    assert.equal(draft.data.start, "");
    assert.equal(draft.data.end, "");
    const otherwiseComplete = {
      ...draft.data,
      departure: "London",
      start: "2027-04-15",
      end: "2027-04-18",
      budget: "2500",
    };
    assert.equal(
      completeIntentSchema.safeParse(otherwiseComplete).success,
      false,
    );
    assert.equal(
      completeIntentSchema.safeParse({
        ...otherwiseComplete,
        travelersConfirmed: true,
      }).success,
      true,
    );
  }
  assert.equal(
    (
      await app.handle(
        request("/api/drafts", "POST", alice, { templateId: "unknown" }),
        "drafts",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await app.handle(
        request("/api/drafts", "POST", "", { templateId: "paris" }),
        "drafts",
      )
    ).status,
    401,
  );
  assert.equal(
    completeIntentSchema.safeParse({
      ...solRecording.intent,
      templateId: "untrusted",
    }).success,
    false,
  );
});

test("each curated wizard flows through real queued/confirmation/generation states into an isolated validated persistent itinerary", async () => {
  for (const template of curatedTrips) {
    const trip = await createTrip(template.id);
    const before = proposals;
    const start = await action(trip.id, "start");
    assert.equal(start.response.status, 200);
    assert.equal((await start.response.json()).status, "queued");
    assert.equal(proposals, before);
    assert.equal((await action(trip.id, "confirm")).response.status, 409);
    await start.tasks[0]();
    const proposal = (await app.generations.read(userId, trip.id))!;
    assert.equal(proposal.status, "awaiting_confirmation");
    assert.equal(proposal.proposal?.city, template.city);
    assert.equal((await app.trips.read(userId, trip.id)).itinerary, null);
    const confirm = await action(trip.id, "confirm");
    assert.equal(confirm.response.status, 200);
    assert.equal((await confirm.response.json()).confirmed, true);
    await confirm.tasks[0]();
    const job = (await app.generations.read(userId, trip.id))!;
    assert.equal(job.status, "complete", job.error ?? undefined);
    const stored = await app.trips.read(userId, trip.id);
    assert.ok(stored.itinerary);
    assert.equal(
      stored.itinerary.days.length,
      4,
      "User length overrides the template's 5/7 days.",
    );
    assert.equal(stored.itinerary.reserveMinor, 25000);
    assert.equal(stored.itinerary.budget?.remainingMinor, 22600);
    assert.equal(stored.itinerary.currency, "EUR");
    assert.equal(stored.data.travelers, 2);
    assert.ok(
      stored.itinerary.days.every((d) =>
        d.activities.every((a) => a.city === template.city),
      ),
    );
    assert.ok(job.audits.every((a) => a.status === "accepted"));
    assert.deepEqual(
      (await app.trips.readDraft(userId, trip.draftId)).data,
      stored.data,
    );
    assert.equal(
      (await app.trips.readDraft(userId, trip.draftId)).archived,
      true,
    );
    assert.equal((await action(trip.id, "start")).response.status, 409);
    completed.push({ ...stored, itinerary: stored.itinerary });
  }
  assert.equal(proposals, 6);
  assert.equal(itineraries, 6);
});

test("template trips, audits and lists remain owner-scoped after database reopen and a fresh login", async () => {
  await db.close();
  db = await openDatabase({ directory });
  app = createApplication(db.db, { ...config, model });
  const login = await app.authHandler(
    request("/api/auth/sign-in/email", "POST", "", {
      email: "curated-alice@example.com",
      password,
    }),
  );
  assert.equal(login.status, 200);
  alice = login.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join(";");
  for (const trip of completed) {
    assert.deepEqual(
      (await app.trips.read(userId, trip.id)).itinerary,
      trip.itinerary,
    );
    assert.equal(
      (await app.generations.read(userId, trip.id))?.audits.length,
      2,
    );
    assert.equal(
      (
        await app.handle(
          request(`/api/trips/${trip.id}`, "GET", bob),
          "trips",
          trip.id,
        )
      ).status,
      404,
    );
    assert.equal((await action(trip.id, "retry", bob)).response.status, 404);
    const denied = await app.generationHandler(
      request(`/api/trips/${trip.id}/generation`, "GET", bob),
      trip.id,
      () => assert.fail("Foreign reads cannot schedule work."),
    );
    assert.equal(denied.status, 404);
  }
  assert.deepEqual(
    await (await app.handle(request("/api/trips", "GET", bob), "trips")).json(),
    [],
  );
  const listed = await app.trips.list(userId);
  assert.equal(listed.length, 6);
  assert.ok(listed.every((t) => t.generationStatus === "complete"));
});

test("failed and interrupted template jobs retain their exact source draft; only explicit retry schedules work", async () => {
  const trip = await createTrip("paris");
  await (await action(trip.id, "start")).tasks[0]();
  failNext = true;
  await (await action(trip.id, "confirm")).tasks[0]();
  assert.equal((await app.generations.read(userId, trip.id))?.status, "failed");
  assert.deepEqual(
    (await app.trips.readDraft(userId, trip.draftId)).data,
    trip.data,
  );
  const calls = itineraries;
  const retry = await action(trip.id, "retry");
  assert.equal(itineraries, calls);
  assert.equal(retry.tasks.length, 1);
  await db.db
    .update(generation)
    .set({ updatedAt: new Date(0) })
    .where(eq(generation.tripId, trip.id));
  const expired = await app.generations.read(userId, trip.id);
  assert.equal(expired?.status, "failed");
  assert.match(expired?.error ?? "", /interrupted/);
  assert.equal(itineraries, calls);
  const resumed = await action(trip.id, "retry");
  await resumed.tasks[0]();
  assert.equal(
    (await app.generations.read(userId, trip.id))?.status,
    "complete",
  );
  assert.deepEqual(
    (await app.trips.readDraft(userId, trip.draftId)).data,
    trip.data,
  );
  const revised = await app.trips.openDraft(userId, { sourceTripId: trip.id });
  assert.equal(revised.data.templateId, "paris");
  assert.equal(revised.data.budget, "2500");
});

test("both planners receive curated themes as optional context while preserving every current user choice", async () => {
  const intent = {
    ...solRecording.intent,
    templateId: "paris",
    travelersConfirmed: true,
    selected: ["Food"],
    mustSee: "No art museums; focus on markets instead.",
  };
  const inputs: unknown[] = [];
  for (const provider of ["openai", "gemini"] as const) {
    const planner = createPlanner(
      "offline-context-test",
      provider,
      async (_schema, _task, input) => {
        inputs.push(input);
        return solRecording.plan;
      },
    );
    await planner.generate(intent, solRecording.base);
  }
  assert.deepEqual(inputs[0], inputs[1]);
  const input = inputs[0] as {
    intent: TripIntent;
    curatedInspiration: ReturnType<typeof curatedPlanningBrief>;
  };
  assert.deepEqual(input.intent, intent);
  assert.equal(input.curatedInspiration?.id, "paris");
  assert.ok(input.curatedInspiration?.themes.length);
  assert.ok(!("estimate" in input.curatedInspiration!));
  assert.match(
    input.curatedInspiration!.personalizationRule,
    /take precedence/,
  );
});

test("job presentation reflects pending, failed, exhausted and complete states without manufactured progress", () => {
  for (const status of ["queued", "choosing", "generating", "validating"]) {
    const view = generationPresentation({
      status,
      confirmed: status !== "choosing",
      attempts: 1,
    });
    assert.equal(view.pending, true);
    assert.equal(view.canRetry, false);
    assert.ok(!view.message.includes("%"));
  }
  const failed = generationPresentation({
    status: "failed",
    confirmed: true,
    attempts: 2,
  });
  assert.equal(failed.pending, false);
  assert.equal(failed.canRetry, true);
  assert.equal(failed.stageIndex, 2);
  assert.equal(
    generationPresentation({ status: "failed", confirmed: true, attempts: 3 })
      .canRetry,
    false,
  );
  assert.equal(
    generationPresentation({ status: "complete", confirmed: true, attempts: 1 })
      .stageIndex,
    4,
  );
});

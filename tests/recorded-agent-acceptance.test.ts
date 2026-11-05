import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { prepareOfflineSolReview } from "./helpers/offline-sol-review";
import { createApplication } from "../src/server/application";
import { trip } from "../src/server/db/schema";
import { agentResponseSchema } from "../src/lib/agent-contracts";
import type { Itinerary } from "../src/lib/itinerary";
import type { TripModel } from "../src/server/model";

// The real response is replayed verbatim. No credentials, provider transport,
// new generation, synthetic replacement answer, or duplicate billable usage.
const recorded = JSON.parse(
  await readFile("tests/fixtures/sol-agent-paris-2026-11-05.json", "utf8"),
);
const reply = agentResponseSchema.parse(recorded.response);
const plan: Itinerary = recorded.itinerary;
let state: Awaited<ReturnType<typeof prepareOfflineSolReview>>;
let app: ReturnType<typeof createApplication>;
let replayCalls = 0;
const model: TripModel = {
  name: "offline-replay:gpt-6.1-sol",
  provider: "openai",
  propose: async () => {
    throw Error("No generation allowed");
  },
  generate: async () => {
    throw Error("No generation allowed");
  },
  respond: async () => {
    replayCalls++;
    return structuredClone(reply);
  },
};
before(async () => {
  mock.method(globalThis, "fetch", async () => {
    throw Error("Recorded agent acceptance must never access a provider.");
  });
  const root = path.resolve(".test-data");
  await mkdir(root, { recursive: true });
  state = await prepareOfflineSolReview(
    await mkdtemp(path.join(root, "recorded-agent-")),
    "http://localhost:3000",
  );
  await state.worker();
  app = createApplication(state.connection.db, {
    ...state.config,
    model,
    generationLimits: { perMinute: 1000, perDay: 10000, perUserHour: 100 },
  });
});
after(async () => {
  await state.close();
  mock.restoreAll();
});

async function fresh() {
  const draft = await app.trips.openDraft(state.userId, {});
  const saved = await app.trips.complete(state.userId, draft.id, {
    version: draft.version,
    data: recorded.intent,
  });
  await state.connection.db
    .update(trip)
    .set({ itinerary: plan })
    .where(eq(trip.id, saved.id));
  const tasks: (() => Promise<void>)[] = [];
  const queued = await app.agentHandler(
    new Request(state.origin + "/assistant", {
      method: "POST",
      headers: {
        origin: state.origin,
        cookie: state.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "send",
        mutationId: randomUUID(),
        draftVersion: 0,
        text: recorded.question,
      }),
    }),
    saved.id,
    (work) => tasks.push(work),
  );
  assert.equal(queued.status, 202);
  assert.equal(tasks.length, 1);
  await tasks[0]();
  const conversation = await app.travelAgent.read(state.userId, saved.id);
  assert.deepEqual(conversation.turns[0].response, reply);
  assert.equal(conversation.turns[0].audits[0].usage, null);
  const proposal = conversation.turns[0].proposal!;
  assert.equal(proposal.status, "pending");
  return { id: saved.id, proposal };
}
function action(id: string, body: unknown) {
  return app.agentHandler(
    new Request(state.origin + "/assistant", {
      method: "POST",
      headers: {
        origin: state.origin,
        cookie: state.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    id,
    () => {
      throw Error("Approval/rejection must never schedule a model.");
    },
  );
}
test("real Sol Day 2 response remains pending with one valid grounded resize and unchanged budget", async () => {
  const { id, proposal } = await fresh();
  assert.equal(reply.proposal!.actions.length, 1);
  assert.equal(reply.proposal!.actions[0].type, "resize_activity");
  const preview = proposal.preview;
  assert.equal(preview.canSave, true);
  assert.deepEqual(preview.assessment.errors, []);
  assert.deepEqual(
    preview.assessment.warnings,
    (await app.itineraryEditor.read(state.userId, id)).assessment.warnings,
  );
  assert.equal(preview.changes.length, 1);
  const change = preview.changes[0];
  assert.equal(
    change.before!.activity.title,
    "Saint-Germain-des-Prés culture walk",
  );
  assert.equal(change.before!.activity.durationMinutes, 90);
  assert.equal(change.after!.activity.durationMinutes, 45);
  assert.equal(change.before!.activity.startMinute, 840);
  assert.equal(change.after!.activity.startMinute, 840);
  assert.equal(change.after!.activity.bufferBeforeMinutes, 30);
  assert.equal(preview.budgetDeltaMinor, 0);
  assert.equal(preview.afterBudget.totalWithReserveMinor, 227400);
  assert.equal(preview.afterBudget.remainingMinor, 22600);
  assert.equal(preview.afterBudget.reserveMinor, 25000);
  const saved = await app.itineraryEditor.read(state.userId, id);
  assert.equal(saved.version, 0);
  assert.deepEqual(saved.itinerary, plan);
  await assert.rejects(app.travelAgent.read("foreign-user", id), /not found/);
});
test("offline recorded proposal approves only explicitly, atomically, and at most once", async () => {
  const { id, proposal: p } = await fresh();
  const body = { action: "approve", proposalId: p.id, revision: p.revision };
  const count = replayCalls;
  assert.equal((await action(id, body)).status, 200);
  assert.equal((await action(id, body)).status, 200);
  const saved = await app.itineraryEditor.read(state.userId, id);
  assert.equal(saved.version, 1);
  assert.equal(saved.history.length, 1);
  assert.equal(saved.history[0].source, "ai-proposal");
  assert.equal(saved.history[0].proposalId, p.id);
  assert.equal(saved.itinerary.days[1].activities[2].durationMinutes, 45);
  assert.equal(saved.itinerary.totalMinor, 227400);
  assert.equal(replayCalls, count);
});
test("offline recorded proposal rejection persists and blocks later approval", async () => {
  const { id, proposal: p } = await fresh();
  const identity = { proposalId: p.id, revision: p.revision };
  const count = replayCalls;
  assert.equal(
    (await action(id, { action: "reject", ...identity })).status,
    200,
  );
  assert.equal(
    (await action(id, { action: "approve", ...identity })).status,
    409,
  );
  const thread = await app.travelAgent.read(state.userId, id);
  assert.equal(thread.turns[0].proposal!.status, "rejected");
  assert.ok(
    thread.turns[0].proposal!.events.some((e) => e.event === "rejected"),
  );
  assert.deepEqual(
    (await app.itineraryEditor.read(state.userId, id)).itinerary,
    plan,
  );
  assert.equal(replayCalls, count);
});
test("offline recorded proposal rejects stale trip and preview versions without losing unrelated manual edits", async () => {
  const { id, proposal: p } = await fresh();
  const a = (await app.itineraryEditor.read(state.userId, id)).itinerary.days[0]
    .activities[0];
  await app.itineraryEditor.commit(state.userId, id, {
    version: 0,
    mutationId: randomUUID(),
    operation: {
      action: "update",
      activityId: a.id,
      dayId: plan.days[0].id,
      data: {
        title: a.title,
        description: "A manual note retained during offline acceptance.",
        category: a.category ?? "culture",
        location: a.location,
        latitude: a.latitude,
        longitude: a.longitude,
        startMinute: a.startMinute,
        durationMinutes: a.durationMinutes,
        bufferBeforeMinutes: a.bufferBeforeMinutes,
        costMinor: a.costMinor,
        currency: "EUR",
        links: a.links ?? [],
      },
    },
  });
  const count = replayCalls;
  const old = { proposalId: p.id, revision: p.revision };
  assert.equal((await action(id, { action: "approve", ...old })).status, 409);
  assert.equal(
    (await action(id, { action: "refresh_preview", ...old })).status,
    200,
  );
  const updated = (await app.travelAgent.read(state.userId, id)).turns[0]
    .proposal!;
  assert.equal(updated.revision, 2);
  assert.equal(updated.baseVersion, 1);
  assert.equal(updated.preview.canSave, true);
  assert.equal((await action(id, { action: "approve", ...old })).status, 409);
  assert.equal(
    (
      await action(id, {
        action: "approve",
        proposalId: updated.id,
        revision: updated.revision,
      })
    ).status,
    200,
  );
  const saved = await app.itineraryEditor.read(state.userId, id);
  assert.equal(saved.version, 2);
  assert.equal(
    saved.itinerary.days[0].activities[0].description,
    "A manual note retained during offline acceptance.",
  );
  assert.equal(saved.itinerary.days[1].activities[2].durationMinutes, 45);
  assert.equal(replayCalls, count);
});

import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq, and, sql } from "drizzle-orm";
import { prepareOfflineSolReview } from "./helpers/offline-sol-review";
import { solRecording } from "./helpers/sol-recording";
import {
  agentAction,
  agentReply,
  agentOpenAIWire,
} from "./helpers/agent-fixtures";
import { createApplication } from "../src/server/application";
import { createTravelAgent } from "../src/server/agent";
import { type TripModel, type ModelCallContext } from "../src/server/model";
import { ModelFailure } from "../src/server/ai/contracts";
import {
  agentResponseSchema,
  agentRequestSchema,
} from "../src/lib/agent-contracts";
import { buildAgentContext } from "../src/server/agent-context";
import { openDatabase } from "../src/server/db/connection";
import {
  trip,
  itineraryEdit,
  agentProposal,
  agentAttempt,
  agentTurn,
  agentProposalEvent,
} from "../src/server/db/schema";
import type { Itinerary } from "../src/lib/itinerary";
import { openaiUsage } from "../src/server/ai/usage";
import type { Response as OpenAIResponse } from "openai/resources/responses/responses";

const origin = "http://localhost:3000",
  root = path.resolve(".test-data");
let directory: string,
  state: Awaited<ReturnType<typeof prepareOfflineSolReview>>,
  app: ReturnType<typeof createApplication>,
  original: Itinerary,
  bob: string;
let answer: (
  input: unknown,
  context?: ModelCallContext,
) => Promise<unknown> = async () => agentReply();
let calls = 0;
const limits = { perMinute: 1000, perDay: 100000, perUserHour: 100 };
const usage = openaiUsage(
  agentOpenAIWire(agentReply()) as unknown as OpenAIResponse,
  "assistant",
  "gpt-6.1-sol",
);
const model: TripModel = {
  name: "gpt-6.1-sol",
  provider: "openai",
  propose: async () => {
    throw Error("No generation allowed");
  },
  generate: async () => {
    throw Error("No generation allowed");
  },
  respond: async (input, context) => {
    calls++;
    await context?.onUsage?.(usage);
    return answer(input, context);
  },
};
before(async () => {
  mock.method(globalThis, "fetch", async () => {
    throw Error("Live provider calls are forbidden in this test suite.");
  });
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(path.join(root, "agent-"));
  state = await prepareOfflineSolReview(directory, origin);
  await state.worker();
  original = (await state.app.trips.read(state.userId, state.trip.id))
    .itinerary!;
  app = createApplication(state.connection.db, {
    ...state.config,
    model,
    generationLimits: limits,
  });
  const signup = await app.authHandler(
    new Request(origin + "/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Other traveler",
        email: "agent-other@example.com",
        password: state.password,
      }),
    }),
  );
  assert.equal(signup.status, 200);
  bob = signup.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join(";");
});
after(async () => {
  await state.close();
  if (path.dirname(directory) === root)
    await rm(directory, { recursive: true, force: true });
  mock.restoreAll();
});
async function fresh() {
  const d = await app.trips.openDraft(state.userId, {}),
    saved = await app.trips.complete(state.userId, d.id, {
      version: d.version,
      data: solRecording.intent,
    });
  await state.connection.db
    .update(trip)
    .set({ itinerary: structuredClone(original) })
    .where(eq(trip.id, saved.id));
  return saved.id;
}
const tasks: (() => Promise<void>)[] = [];
async function api(
  id: string,
  body?: unknown,
  cookie = state.cookie,
  requestOrigin = origin,
) {
  return app.agentHandler(
    new Request(origin + `/api/trips/${id}/assistant`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin: requestOrigin,
        cookie,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    id,
    (work) => tasks.push(work),
  );
}
async function send(id: string, text = "Make day two more relaxed.") {
  const s = await app.travelAgent.read(state.userId, id);
  const response = await api(id, {
    action: "send",
    mutationId: randomUUID(),
    text,
    draftVersion: s.draftVersion,
  });
  assert.equal(response.status, 202);
  await tasks.shift()!();
  return app.travelAgent.read(state.userId, id);
}
const addition = (changes: Parameters<typeof agentAction>[1] = {}) =>
  agentAction("add_activity", {
    dayId: original.days[1].id,
    title: "A quiet Paris café stop",
    description:
      "A suggested neighborhood café break; service and pricing remain unverified.",
    category: "food",
    location: "Rue du Bac, Paris",
    city: "Paris",
    startMinute: 960,
    durationMinutes: 30,
    bufferBeforeMinutes: 30,
    costMinor: 1500,
    currency: "EUR",
    ...changes,
  });
const identity = (p: { id: string; revision: number }) => ({
  proposalId: p.id,
  revision: p.revision,
});
const editData = (a: Itinerary["days"][number]["activities"][number]) => ({
  title: a.title,
  description: a.description,
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
});

test("assistant context is owner-derived, budget-aware, bounded and excludes privileged records", async () => {
  const id = await fresh(),
    saved = await app.itineraryEditor.read(state.userId, id);
  const c = buildAgentContext(
    saved,
    "What should I do on day two?",
    Array.from({ length: 20 }, () => ({
      text: "Earlier request",
      response: agentReply(),
      status: "ready",
      contextVersion: 0,
    })),
  );
  assert.equal(c.input.trip.version, 0);
  assert.equal(c.input.trip.budget.reserveMinor, 25000);
  assert.equal(c.input.trip.budget.remainingMinor, 22600);
  assert.equal(
    c.input.trip.days[1].activities[0].id,
    original.days[1].activities[0].id,
  );
  assert.equal(c.input.trip.venueReferences[0].name, "Musée d’Orsay");
  assert.equal(c.historyTurns, 8);
  assert.ok(c.bytes <= 96000);
  const serialized = JSON.stringify(c.input);
  for (const secret of [
    state.password,
    state.secret,
    state.cookie,
    state.email,
  ])
    assert.ok(!serialized.includes(secret));
  assert.ok(!serialized.includes("originalAudit"));
  const partial = agentReply();
  partial.activityIds = [randomUUID()];
  answer = async () => partial;
  const failed = await send(id);
  assert.equal(failed.turns[0].status, "failed");
  assert.equal(failed.turns[0].audits[0].validation.stage, "grounding");
});
test("questions use real persisted job states, do not edit trips and retain usage/cost/latency audits", async () => {
  const id = await fresh();
  let resolve: ((x: unknown) => void) | undefined;
  answer = async () =>
    new Promise((r) => {
      resolve = r;
    });
  const command = {
    action: "send",
    mutationId: randomUUID(),
    text: "How much budget remains?",
    draftVersion: 0,
  };
  const response = await api(id, command);
  assert.equal(response.status, 202);
  assert.equal((await response.json()).turns[0].status, "queued");
  const worker = tasks.shift()!();
  while (!resolve) await new Promise((r) => setTimeout(r, 1));
  const pending = await app.travelAgent.read(state.userId, id);
  assert.equal(pending.turns[0].status, "generating");
  assert.equal(pending.turns[0].response, null);
  resolve(
    agentReply(
      null,
      "Your saved Paris plan has €226 unallocated and a separate €250 emergency reserve. These are estimates, with no payments recorded.",
    ),
  );
  await worker;
  const done = await app.travelAgent.read(state.userId, id);
  assert.equal(done.turns[0].status, "ready");
  assert.equal(done.turns[0].proposal, null);
  assert.equal((await app.trips.read(state.userId, id)).itineraryVersion, 0);
  const audit = done.turns[0].audits[0];
  assert.equal(audit.usage?.inputTokens, 1200);
  assert.equal(audit.usage?.outputTokens, 800);
  assert.equal(audit.usage?.reasoningTokens, 300);
  assert.equal(audit.usage?.estimatedCostUsd, 0.0104);
  assert.ok(audit.latencyMs !== null);
  assert.equal(audit.validation.stage, "passed");
  const count = calls;
  assert.equal((await api(id, command)).status, 200);
  assert.equal(calls, count);
  assert.equal(
    (await api(id, { ...command, text: "Different replay" })).status,
    409,
  );
});
test("typed additions produce before/after financial previews, commit only on approval and record AI provenance", async () => {
  const id = await fresh();
  answer = async () => agentReply([addition()]);
  const beforeCalls = calls;
  const result = await send(id),
    p = result.turns[0].proposal!;
  assert.equal(p.status, "pending");
  assert.equal(p.preview.beforeBudget.remainingMinor, 22600);
  assert.equal(p.preview.afterBudget.remainingMinor, 21100);
  assert.equal(p.preview.afterBudget.reserveMinor, 25000);
  assert.equal(p.preview.budgetDeltaMinor, 1500);
  assert.equal((await app.trips.read(state.userId, id)).itineraryVersion, 0);
  assert.equal(
    (await api(id, { action: "approve", ...identity(p) })).status,
    200,
  );
  const changed = await app.itineraryEditor.read(state.userId, id);
  assert.equal(changed.version, 1);
  assert.equal(changed.itinerary.foodMinor, 51500);
  const a = changed.itinerary.days[1].activities.find(
    (a) => a.title === "A quiet Paris café stop",
  )!;
  assert.ok(a);
  assert.equal(a.estimateSource, "ai-estimate");
  assert.equal(a.lastEditSource, "ai-proposal");
  assert.equal(a.latitude, null);
  assert.equal(changed.history[0].source, "ai-proposal");
  assert.equal(changed.history[0].proposalId, p.id);
  assert.equal(
    (await api(id, { action: "approve", ...identity(p) })).status,
    200,
  );
  assert.equal((await app.itineraryEditor.read(state.userId, id)).version, 1);
  assert.equal(calls, beforeCalls + 1);
});
test("coordinated remove, move, resize, replacement and detail/cost proposals share the atomic editor", async () => {
  const id = await fresh(),
    removed = original.days[1].activities[2],
    moved = original.days[3].activities[0],
    dinner = original.days[0].activities[1];
  answer = async () =>
    agentReply([
      agentAction("remove_activity", { activityId: removed.id }),
      agentAction("move_activity", { activityId: moved.id, startMinute: 600 }),
      agentAction("replace_activity", {
        activityId: dinner.id,
        dayId: original.days[0].id,
        title: "Budget-friendly bistro dinner",
        description:
          "A proposed cheaper neighborhood dinner, with unverified service and prices.",
        category: "food",
        location: dinner.location,
        city: "Paris",
        startMinute: dinner.startMinute,
        durationMinutes: 60,
        bufferBeforeMinutes: 30,
        costMinor: 4000,
        currency: "EUR",
      }),
    ]);
  const s = await send(id),
    p = s.turns[0].proposal!;
  assert.equal(p.preview.canSave, true);
  assert.equal(p.preview.changes.length, 3);
  assert.equal(
    (await api(id, { action: "approve", ...identity(p) })).status,
    200,
  );
  const saved = await app.itineraryEditor.read(state.userId, id);
  assert.equal(saved.history.length, 1);
  assert.equal(saved.history[0].operation.action, "batch");
  assert.ok(
    !saved.itinerary.days
      .flatMap((d) => d.activities)
      .some((a) => a.id === removed.id),
  );
  assert.equal(saved.itinerary.days[0].activities[1].id, dinner.id);
  assert.equal(saved.itinerary.days[3].activities[0].startMinute, 600);
  assert.equal(saved.itinerary.budget?.remainingMinor, 25600);
  answer = async () =>
    agentReply([
      agentAction("resize_activity", {
        activityId: moved.id,
        durationMinutes: 75,
      }),
    ]);
  const resized = (await send(id)).turns.at(-1)!.proposal!;
  assert.equal(
    (await api(id, { action: "approve", ...identity(resized) })).status,
    200,
  );
  assert.equal(
    (await app.itineraryEditor.read(state.userId, id)).itinerary.days[3]
      .activities[0].durationMinutes,
    75,
  );
});
test("rejection and request-changes are durable and never mutate a trip or execute another AI call", async () => {
  const id = await fresh();
  answer = async () => agentReply([addition()]);
  const s = await send(id),
    p = s.turns[0].proposal!,
    count = calls;
  assert.equal(
    (await api(id, { action: "reject", ...identity(p) })).status,
    200,
  );
  assert.equal(
    (await api(id, { action: "approve", ...identity(p) })).status,
    409,
  );
  const next = (await send(id)).turns.at(-1)!.proposal!;
  assert.equal(
    (await api(id, { action: "request_changes", ...identity(next) })).status,
    200,
  );
  assert.equal(
    (await api(id, { action: "approve", ...identity(next) })).status,
    409,
  );
  assert.equal(calls, count + 1);
  assert.equal((await app.itineraryEditor.read(state.userId, id)).version, 0);
  let received: ReturnType<typeof buildAgentContext>["input"] | undefined;
  answer = async (input) => {
    received = input as ReturnType<typeof buildAgentContext>["input"];
    return agentReply(
      null,
      "Which part of that proposed café stop would you like adjusted?",
    );
  };
  await send(id, "Please revise the previous proposal.");
  assert.equal(received!.history.at(-1)!.proposalStatus, "changes-requested");
  assert.equal(
    received!.history.at(-1)!.previousProposal!.actions[0].type,
    "add_activity",
  );
  assert.equal(calls, count + 2);
});
test("overlap, buffers, venue hours, city and currency constraints block unsafe or fabricated proposals", async () => {
  const id = await fresh();
  for (const changes of [
    { startMinute: 870 },
    { startMinute: 935 },
    {
      title: "Musée d’Orsay indoor visit",
      location: "Musée d’Orsay",
      startMinute: 1080,
      durationMinutes: 120,
    },
  ]) {
    answer = async () => agentReply([addition(changes)]);
    const s = await send(id),
      p = s.turns.at(-1)!.proposal!;
    assert.equal(p.preview.canSave, false);
    assert.equal(
      (await api(id, { action: "approve", ...identity(p) })).status,
      422,
    );
  }
  for (const actions of [
    [addition({ city: "Tokyo" })],
    [addition({ currency: "USD" })],
    [agentAction("remove_activity", { activityId: randomUUID() })],
  ]) {
    answer = async () => agentReply(actions);
    const s = await send(id);
    assert.equal(s.turns.at(-1)!.status, "failed");
    assert.equal(s.turns.at(-1)!.proposal, null);
  }
  assert.equal((await app.itineraryEditor.read(state.userId, id)).version, 0);
  assert.equal(
    agentResponseSchema.safeParse({
      ...agentReply(),
      proposal: {
        summary: "Bad",
        actions: [{ type: "checkout", paypalAmount: 100 }],
      },
    }).success,
    false,
  );
  assert.equal(
    agentRequestSchema.safeParse({
      action: "approve",
      proposalId: randomUUID(),
      revision: 1,
      operations: [],
    }).success,
    false,
  );
});
test("over-budget proposals require explicit acknowledgement and preserve reserve/allowances", async () => {
  const id = await fresh();
  answer = async () => agentReply([addition({ costMinor: 100000 })]);
  const p = (await send(id)).turns[0].proposal!;
  assert.equal(p.preview.overBudget, true);
  assert.equal(
    (await api(id, { action: "approve", ...identity(p) })).status,
    422,
  );
  assert.equal(
    (
      await api(id, {
        action: "approve",
        ...identity(p),
        acknowledgeOverBudget: true,
      })
    ).status,
    200,
  );
  const s = await app.itineraryEditor.read(state.userId, id);
  assert.equal(s.itinerary.reserveMinor, 25000);
  assert.equal(
    s.itinerary.budget?.allocations.find((a) => a.category === "food")
      ?.unitemizedAllowanceMinor,
    17500,
  );
});
test("stale approval requires a new preview revision; refresh preserves unrelated manual details", async () => {
  const id = await fresh(),
    a = original.days[3].activities[0];
  answer = async () =>
    agentReply([
      agentAction("move_activity", { activityId: a.id, startMinute: 600 }),
    ]);
  let p = (await send(id)).turns[0].proposal!;
  const saved = await app.itineraryEditor.read(state.userId, id),
    item = saved.itinerary.days[3].activities[0];
  await app.itineraryEditor.commit(state.userId, id, {
    version: 0,
    mutationId: randomUUID(),
    operation: {
      action: "update",
      activityId: item.id,
      dayId: original.days[3].id,
      data: {
        ...editData(item),
        title: "A manual title to preserve",
        description: "A manually refined description",
      },
    },
  });
  assert.equal(
    (await api(id, { action: "approve", ...identity(p) })).status,
    409,
  );
  const count = calls;
  assert.equal(
    (await api(id, { action: "refresh_preview", ...identity(p) })).status,
    200,
  );
  const latest = (await app.travelAgent.read(state.userId, id)).turns[0]
    .proposal!;
  assert.equal(latest.revision, 2);
  assert.equal(
    latest.preview.changes[0].after?.activity.title,
    "A manual title to preserve",
  );
  assert.equal(
    (await api(id, { action: "approve", ...identity(p) })).status,
    409,
  );
  p = latest;
  assert.equal(
    (await api(id, { action: "approve", ...identity(p) })).status,
    200,
  );
  assert.equal(calls, count);
});
test("concurrent approvals apply at most one revision and rejected/deleted references cannot be revived silently", async () => {
  const id = await fresh();
  answer = async () => agentReply([addition()]);
  const p = (await send(id)).turns[0].proposal!;
  const responses = await Promise.all([
    api(id, { action: "approve", ...identity(p) }),
    api(id, { action: "approve", ...identity(p) }),
  ]);
  assert.ok(responses.every((r) => [200, 409].includes(r.status)));
  assert.ok(responses.some((r) => r.status === 200));
  assert.equal((await app.itineraryEditor.read(state.userId, id)).version, 1);
  const target = original.days[1].activities[2];
  answer = async () =>
    agentReply([
      agentAction("move_activity", { activityId: target.id, startMinute: 960 }),
    ]);
  const pending = (await send(id)).turns.at(-1)!.proposal!;
  await app.itineraryEditor.commit(state.userId, id, {
    version: 1,
    mutationId: randomUUID(),
    operation: { action: "delete", activityId: target.id },
  });
  assert.equal(
    (await api(id, { action: "approve", ...identity(pending) })).status,
    409,
  );
  assert.equal(
    (await api(id, { action: "refresh_preview", ...identity(pending) })).status,
    422,
  );
  assert.equal((await app.itineraryEditor.read(state.userId, id)).version, 2);
});
test("provider failures retain messages and audit all explicit attempts without automatic retries", async () => {
  const id = await fresh();
  answer = async () => {
    throw new ModelFailure(
      "The AI service could not be reached or timed out. Your message is saved.",
    );
  };
  const count = calls;
  let s = await send(id, "Suggest a rain alternative.");
  assert.equal(s.turns[0].status, "failed");
  assert.equal(s.turns[0].text, "Suggest a rain alternative.");
  assert.equal(calls, count + 1);
  await api(id);
  assert.equal(calls, count + 1);
  for (let i = 0; i < 2; i++) {
    assert.equal(
      (await api(id, { action: "retry", turnId: s.turns[0].id })).status,
      202,
    );
    await tasks.shift()!();
    s = await app.travelAgent.read(state.userId, id);
  }
  assert.equal(s.turns[0].audits.length, 3);
  assert.equal(s.turns[0].attempts, 3);
  assert.equal(
    (await api(id, { action: "retry", turnId: s.turns[0].id })).status,
    409,
  );
  assert.equal(calls, count + 3);
  assert.equal((await app.itineraryEditor.read(state.userId, id)).version, 0);
  answer = async () => ({ ...agentReply(), unapprovedTool: "charge" });
  const invalid = await send(await fresh());
  assert.equal(invalid.turns[0].status, "failed");
  assert.equal(invalid.turns[0].audits[0].validation.stage, "schema");
  answer = async () => agentReply(null, "I have booked the museum tickets.");
  const claim = await send(await fresh());
  assert.equal(claim.turns[0].status, "failed");
  assert.equal(claim.turns[0].audits[0].validation.stage, "grounding");
});

test("assistant admission shares generation quota; a denied request consumes no provider call or admitted retry", async () => {
  const id = await fresh(),
    limited = createTravelAgent(state.connection.db, model, {
      ...limits,
      perUserHour: 1,
    });
  const queued = await limited.action(state.userId, id, {
    action: "send",
    mutationId: randomUUID(),
    text: "How much remains?",
    draftVersion: 0,
  });
  const count = calls;
  await limited.run(state.userId, id, queued.queuedTurnId!);
  const s = await limited.read(state.userId, id);
  assert.equal(calls, count);
  assert.equal(s.turns[0].status, "failed");
  assert.equal(s.turns[0].errorStage, "quota");
  assert.equal(s.turns[0].attempts, 0);
  assert.equal(s.turns[0].audits.length, 0);
  assert.equal(s.draftVersion, 1);
});

test("interrupted/expired jobs recover explicitly and a late worker cannot overwrite its replacement", async () => {
  const id = await fresh();
  let clock = Date.now(),
    first: ((value: unknown) => void) | undefined,
    second: ((value: unknown) => void) | undefined,
    n = 0;
  const delayed: TripModel = {
    ...model,
    respond: async () =>
      new Promise((resolve) => {
        n++;
        if (n === 1) first = resolve;
        else second = resolve;
      }),
  };
  const agent = createTravelAgent(
    state.connection.db,
    delayed,
    limits,
    () => clock,
  );
  const q = await agent.action(state.userId, id, {
    action: "send",
    mutationId: randomUUID(),
    text: "Explain the second day.",
    draftVersion: 0,
  });
  const old = agent.run(state.userId, id, q.queuedTurnId!);
  while (!first) await new Promise((r) => setTimeout(r, 1));
  clock += 300001;
  const interrupted = await agent.read(state.userId, id);
  assert.equal(interrupted.turns[0].status, "interrupted");
  assert.equal(interrupted.activeTurnId, null);
  const retry = await agent.action(state.userId, id, {
    action: "retry",
    turnId: q.queuedTurnId!,
  });
  const replacement = agent.run(state.userId, id, retry.queuedTurnId!);
  while (!second) await new Promise((r) => setTimeout(r, 1));
  first(agentReply(null, "A late response that must not appear."));
  await old;
  assert.equal(
    (await agent.read(state.userId, id)).turns[0].status,
    "generating",
  );
  second(agentReply(null, "A fresh response grounded in the saved day."));
  await replacement;
  const done = await agent.read(state.userId, id);
  assert.equal(done.turns[0].status, "ready");
  assert.equal(
    done.turns[0].response?.answer,
    "A fresh response grounded in the saved day.",
  );
  assert.deepEqual(
    done.turns[0].audits.map((a) => a.status),
    ["superseded", "completed"],
  );
  assert.equal(n, 2);
});

test("an approval audit/storage failure rolls back the itinerary, edit and proposal together", async () => {
  const id = await fresh();
  answer = async () => agentReply([addition()]);
  const p = (await send(id)).turns[0].proposal!;
  await state.connection.db.execute(
    sql`CREATE FUNCTION reject_agent_approval_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'approved' THEN RAISE EXCEPTION 'offline injected storage failure'; END IF; RETURN NEW; END $$`,
  );
  await state.connection.db.execute(
    sql`CREATE TRIGGER reject_agent_approval_test BEFORE UPDATE ON agent_proposal FOR EACH ROW EXECUTE FUNCTION reject_agent_approval_test()`,
  );
  try {
    assert.equal(
      (await api(id, { action: "approve", ...identity(p) })).status,
      503,
    );
    assert.equal((await app.itineraryEditor.read(state.userId, id)).version, 0);
    const edits = await state.connection.db
      .select()
      .from(itineraryEdit)
      .where(eq(itineraryEdit.tripId, id));
    assert.equal(edits.length, 0);
    const [pending] = await state.connection.db
      .select()
      .from(agentProposal)
      .where(eq(agentProposal.id, p.id));
    assert.equal(pending.status, "pending");
    const events = await state.connection.db
      .select()
      .from(agentProposalEvent)
      .where(
        and(
          eq(agentProposalEvent.proposalId, p.id),
          eq(agentProposalEvent.event, "approved"),
        ),
      );
    assert.equal(events.length, 0);
    const attempts = await state.connection.db
      .select()
      .from(agentAttempt)
      .where(eq(agentAttempt.tripId, id));
    assert.equal(attempts.length, 1);
    const messages = await state.connection.db
      .select()
      .from(agentTurn)
      .where(eq(agentTurn.tripId, id));
    assert.equal(messages[0].status, "ready");
  } finally {
    await state.connection.db.execute(
      sql`DROP TRIGGER reject_agent_approval_test ON agent_proposal`,
    );
    await state.connection.db.execute(
      sql`DROP FUNCTION reject_agent_approval_test()`,
    );
  }
  assert.equal(
    (await api(id, { action: "approve", ...identity(p) })).status,
    200,
  );
});

test("conversation drafts, messages, proposals and audits are private and survive reopen with a fresh login", async () => {
  const id = await fresh();
  answer = async () => agentReply([addition()]);
  const p = (await send(id)).turns[0].proposal!;
  assert.equal((await api(id, undefined, "")).status, 401);
  assert.equal((await api(id, undefined, bob)).status, 404);
  for (const action of ["approve", "reject", "refresh_preview"]) {
    assert.equal((await api(id, { action, ...identity(p) }, bob)).status, 404);
  }
  assert.equal(
    (
      await api(id, {
        action: "draft",
        text: "A message to finish later",
        version: 1,
      })
    ).status,
    200,
  );
  assert.equal(
    (await api(id, { action: "draft", text: "Stale", version: 1 })).status,
    409,
  );
  assert.equal(
    (
      await api(
        id,
        { action: "draft", text: "Cross origin", version: 2 },
        state.cookie,
        "https://evil.example",
      )
    ).status,
    403,
  );
  const expected = await app.travelAgent.read(state.userId, id);
  const generationBefore = (await state.app.generations.read(
    state.userId,
    state.trip.id,
  ))!.audits;
  await state.close();
  const connection = await openDatabase({ directory });
  try {
    const reopened = createApplication(connection.db, {
      ...state.config,
      model,
      generationLimits: limits,
    });
    const login = await reopened.authHandler(
      new Request(origin + "/api/auth/sign-in/email", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email: state.email, password: state.password }),
      }),
    );
    assert.equal(login.status, 200);
    const cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join(";");
    const restored = await reopened.agentHandler(
      new Request(origin + `/api/trips/${id}/assistant`, {
        headers: { cookie },
      }),
      id,
      () => {
        throw Error("GET must not schedule AI");
      },
    );
    assert.equal(restored.status, 200);
    assert.deepEqual(await restored.json(), expected);
    assert.deepEqual(
      (await reopened.generations.read(state.userId, state.trip.id))!.audits,
      generationBefore,
    );
  } finally {
    await connection.close();
  }
});

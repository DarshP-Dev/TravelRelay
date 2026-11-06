import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { after, before, mock, test } from "node:test";
import { eq } from "drizzle-orm";
import { createApplication } from "../src/server/application";
import { openDatabase } from "../src/server/db/connection";
import {
  paypalBooking,
  recoveryAttempt,
  recoveryCase,
  trip,
} from "../src/server/db/schema";
import { createTripModel } from "../src/server/model";
import { createPayPalClient } from "../src/server/paypal-client";
import type { RecoveryState } from "../src/server/recovery";
import { agentAction, agentOpenAIWire } from "./helpers/agent-fixtures";
import { prepareOfflineSolReview } from "./helpers/offline-sol-review";
import {
  fakeSandbox,
  sandboxFixtureConfig,
} from "./helpers/paypal-sandbox.mjs";
import { recoveryFixture } from "./helpers/recovery-fixture.mjs";
import { solRecording } from "./helpers/sol-recording";

const fake = fakeSandbox();
const works: (() => Promise<void>)[] = [];
type Context = Parameters<typeof recoveryFixture>[0];
let seed: Awaited<ReturnType<typeof prepareOfflineSolReview>>;
let app: ReturnType<typeof createApplication>;
let otherCookie: string;
let directory: string;
let providerCalls = 0;
let customize: ((context: Context) => unknown) | undefined;
const model = createTripModel({
  key: "offline-recovery-fixture",
  fetch: async (input, init) => {
    providerCalls++;
    const request = new Request(input, init);
    assert.equal(request.url, "https://api.openai.com/v1/responses");
    const body = await request.json();
    assert.equal(body.model, "gpt-6.1-sol");
    assert.equal(body.reasoning.effort, "medium");
    assert.equal(body.store, false);
    assert.deepEqual(body.text.format.schema.required, ["alternatives"]);
    const context = JSON.parse(body.input);
    assert.equal(context.trip.travelers, 2);
    assert.equal(context.trip.preferences.pace, "balanced");
    assert.ok(context.trip.preferences.interests.includes("Culture"));
    assert.equal(context.recovery.provenance, "sandbox-simulation");
    assert.equal(context.recovery.payment.capturedMinor, 500);
    assert.equal(context.recovery.protectedReserveMinor, 25000);
    assert.equal(context.recovery.currency, "USD");
    assert.equal(context.trip.days.length, 4);
    assert.ok(
      context.trip.days[1].activities.some(
        (a: { id: string }) => a.id === context.recovery.affected.activity.id,
      ),
    );
    assert.ok(!body.input.includes("OFFLINEMERCHANT"));
    return Response.json(
      agentOpenAIWire(
        customize ? customize(context) : recoveryFixture(context),
      ),
    );
  },
});
const fxFetch = async () =>
  Response.json({
    base: "USD",
    quote: "EUR",
    rate: 0.8,
    date: new Date().toISOString().slice(0, 10),
  });
const payPal = createPayPalClient(sandboxFixtureConfig, fake.transport);
const cookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((part) => part.split(";")[0])
    .join(";");

before(async () => {
  mock.method(globalThis, "fetch", async () => {
    throw Error("Live calls forbidden in Recovery tests");
  });
  await mkdir(".test-data", { recursive: true });
  directory = await mkdtemp(path.resolve(".test-data/recovery-test-"));
  seed = await prepareOfflineSolReview(directory, "http://localhost:3000");
  await seed.worker();
  app = createApplication(seed.connection.db, {
    ...seed.config,
    model,
    fxFetch,
    paypal: payPal,
    recoverySimulation: true,
    generationLimits: { perMinute: 100, perDay: 100, perUserHour: 100 },
  });
  const signup = await app.authHandler(
    request("/api/auth/sign-up/email", {
      name: "Another offline owner",
      email: "other-recovery@example.invalid",
      password: seed.password,
    }),
  );
  assert.equal(signup.status, 200);
  otherCookie = cookieOf(signup);
});
after(async () => {
  await seed.close();
  mock.restoreAll();
});

function request(
  url: string,
  body?: unknown,
  cookie = "",
  origin = seed.origin,
) {
  return new Request(seed.origin + url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie,
      origin,
      "Content-Type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function recovery(
  tripId: string,
  body?: unknown,
  cookie = seed.cookie,
  origin = seed.origin,
) {
  return app.recoveryHandler(
    request(`/api/trips/${tripId}/recovery`, body, cookie, origin),
    tripId,
    (work) => works.push(work),
  );
}
async function result(
  response: Response,
  status = 200,
): Promise<RecoveryState> {
  assert.equal(response.status, status, await response.clone().text());
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  return response.json();
}
async function quote(tripId: string, activityId: string) {
  const wallet = await app.wallet.read(seed.userId, tripId);
  const data = {
    activityId,
    currency: "USD",
    amount: "5.00",
    supplier: "Offline recovery fixture",
    walletVersion: wallet.version,
    itineraryVersion: wallet.itineraryVersion,
  };
  const response = await app.wallet.action(seed.userId, tripId, {
    ...data,
    action: "preview_quote",
  });
  assert.ok(response.preview);
  const saved = await app.wallet.action(seed.userId, tripId, {
    ...data,
    action: "save_quote",
    fxSnapshotId: response.preview.fx.snapshot.id,
    mutationId: randomUUID(),
  });
  return saved.state!.intents.find(
    (intent) => intent.activityId === activityId,
  )!;
}
async function buy(tripId: string, intentId: string, capture = true) {
  const read = await app.commerce.read(seed.userId, tripId);
  const checkout = {
    action: "checkout",
    intentId,
    walletVersion: read.walletVersion,
    itineraryVersion: read.itineraryVersion,
  };
  const writes = fake.writes.length;
  const first = await app.commerce.action(seed.userId, tripId, checkout);
  const duplicate = await app.commerce.action(seed.userId, tripId, checkout);
  assert.equal(first.bookingId, duplicate.bookingId);
  assert.ok(first.orderId);
  assert.equal(fake.writes.length, writes + 1);
  if (capture) {
    const body = {
      action: "capture",
      bookingId: first.bookingId,
      orderId: first.orderId,
    };
    fake.orders.get(first.orderId).status = "APPROVED";
    await app.commerce.action(seed.userId, tripId, body);
    await app.commerce.action(seed.userId, tripId, body);
    assert.equal(fake.writes.length, writes + 2);
  }
  return first;
}
async function bookedTrip(capture = true) {
  const draft = await app.trips.openDraft(seed.userId, {});
  const { id } = await app.trips.complete(seed.userId, draft.id, {
    version: draft.version,
    data: solRecording.intent,
  });
  const itinerary = (await app.trips.read(seed.userId, seed.trip.id))
    .itinerary!;
  await seed.connection.db
    .update(trip)
    .set({ itinerary })
    .where(eq(trip.id, id));
  const activity = itinerary.days[1].activities[2];
  const intent = await quote(id, activity.id);
  const booking = await buy(id, intent.id, capture);
  return { id, activityId: activity.id, bookingId: booking.bookingId };
}
const reason = "Offline test: the demo session was canceled.";
async function simulate(id: string, bookingId: string) {
  return (
    await result(await recovery(id, { action: "simulate", bookingId, reason }))
  ).cases[0];
}
async function suggest(id: string, caseId: string) {
  const request = {
    action: "suggest",
    caseId,
    mutationId: randomUUID(),
    preferences: "Keep the Culture and Food interests.",
  };
  const queued = await result(await recovery(id, request), 202);
  assert.equal(queued.cases[0].attempts[0].status, "queued");
  const scheduled = works.shift()!;
  const before = providerCalls;
  await scheduled();
  await scheduled();
  assert.equal(providerCalls, before + 1);
  const state = await result(await recovery(id));
  return state.cases[0].attempts.find((run) => run.id === request.mutationId)!;
}
const apply = (caseId: string, attemptId: string, optionId: string) => ({
  action: "apply",
  caseId,
  attemptId,
  optionId,
  acknowledgeUnverified: true,
});
const refund = (
  bookingId: string,
  amount: string,
  mode: "full" | "partial",
) => ({
  action: "refund",
  bookingId,
  amount,
  mode,
  mutationId: randomUUID(),
});

test("verified Sandbox cancellation is persistent, owner-scoped, idempotent and separate from finances", async () => {
  const unpaid = await bookedTrip(false);
  assert.equal(
    (
      await recovery(unpaid.id, {
        action: "simulate",
        bookingId: unpaid.bookingId,
        reason,
      })
    ).status,
    409,
  );
  const paid = await bookedTrip();
  // This isolated unpaid booking is historical for the checkout-rate fixture.
  await seed.connection.db
    .update(paypalBooking)
    .set({ createdAt: new Date(0) })
    .where(eq(paypalBooking.id, unpaid.bookingId));
  const command = { action: "simulate", bookingId: paid.bookingId, reason };
  const writes = fake.writes.length;
  const before = await app.wallet.read(seed.userId, paid.id);
  assert.equal((await recovery(paid.id, undefined, "")).status, 401);
  assert.equal((await recovery(paid.id, undefined, otherCookie)).status, 404);
  assert.equal((await recovery(paid.id, command, otherCookie)).status, 404);
  assert.equal(
    (await recovery(paid.id, command, seed.cookie, "https://outside.example"))
      .status,
    403,
  );
  assert.equal(
    (await recovery(paid.id, { ...command, provenance: "verified-supplier" }))
      .status,
    400,
  );
  const disabled = createApplication(seed.connection.db, {
    ...seed.config,
    fxFetch,
    paypal: payPal,
  });
  await assert.rejects(
    disabled.recovery.action(seed.userId, paid.id, command),
    { status: 403 },
  );
  const [a, b] = await Promise.all([
    simulate(paid.id, paid.bookingId),
    simulate(paid.id, paid.bookingId),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(a.provenance, "sandbox-simulation");
  assert.equal(a.original.activity.id, paid.activityId);
  assert.equal(a.original.capturedMinor, 500);
  assert.equal(a.original.currency, "USD");
  assert.equal(a.phase, "canceled");
  assert.equal(
    (await recovery(paid.id, { ...command, reason: "Overwrite evidence" }))
      .status,
    409,
  );
  const saved = await app.wallet.read(seed.userId, paid.id);
  assert.deepEqual(saved.events, before.events);
  assert.equal(saved.itineraryVersion, before.itineraryVersion);
  assert.equal(fake.writes.length, writes);
});

test("Sol suggestions use saved context and budget; review, rejection and stale-wallet guards preserve the plan", async () => {
  const { id, bookingId, activityId } = await bookedTrip();
  const canceled = await simulate(id, bookingId);
  const writes = fake.writes.length;
  const review = await suggest(id, canceled.id);
  assert.equal(
    review.status,
    "ready",
    review.error ?? JSON.stringify(review.findings),
  );
  assert.deepEqual(
    review.options.map((o) => o.kind),
    ["similar", "free"],
  );
  const free = review.options[1];
  assert.ok(
    free.preview.canSave,
    JSON.stringify(free.preview.assessment.errors),
  );
  assert.equal(free.preview.beforeBudget.reserveMinor, 25000);
  assert.equal(free.preview.afterBudget.reserveMinor, 25000);
  assert.equal(free.replacementEstimateMinor, 0);
  assert.ok(
    free.preview.changes.some(
      (change) => change.before?.activity.id === activityId && !change.after,
    ),
  );
  assert.equal(
    free.projectionAfterMinor,
    free.projectionBeforeMinor,
    "Unrefunded capture still counts after removing the estimate",
  );
  assert.equal(
    (
      await recovery(id, {
        ...apply(canceled.id, review.id, free.id),
        acknowledgeUnverified: false,
      })
    ).status,
    400,
  );
  const [audit] = await seed.connection.db
    .select()
    .from(recoveryAttempt)
    .where(eq(recoveryAttempt.id, review.id));
  assert.equal(audit.model, "gpt-6.1-sol");
  assert.equal(audit.usage?.reasoningTokens, 300);
  assert.equal(
    (
      await recovery(id, {
        action: "reject",
        caseId: canceled.id,
        attemptId: review.id,
      })
    ).status,
    200,
  );
  assert.equal(
    (await recovery(id, apply(canceled.id, review.id, free.id))).status,
    409,
  );
  const second = await suggest(id, canceled.id);
  const originalWallet = await app.wallet.read(seed.userId, id);
  await app.wallet.action(seed.userId, id, {
    action: "settings",
    localCurrency: "GBP",
    walletVersion: originalWallet.version,
    mutationId: randomUUID(),
  });
  assert.equal(
    (await recovery(id, apply(canceled.id, second.id, second.options[1].id)))
      .status,
    409,
  );
  assert.equal(
    (await app.itineraryEditor.read(seed.userId, id)).version,
    originalWallet.itineraryVersion,
  );
  assert.equal(fake.writes.length, writes);
});

test("invalid schemas, hidden verification claims, conflicts and out-of-slot suggestions cannot apply", async () => {
  const { id, bookingId } = await bookedTrip();
  const canceled = await simulate(id, bookingId);
  customize = () => ({ alternatives: [], refund: "execute" });
  try {
    assert.equal((await suggest(id, canceled.id)).status, "failed");
    customize = (context) => {
      const output = recoveryFixture(context);
      const previous = context.trip.days[1].activities[1];
      output.alternatives[0].rationale = "Confirmed availability.";
      output.alternatives[1].action.startMinute = 10;
      return {
        alternatives: [
          ...output.alternatives,
          {
            kind: "reschedule",
            rationale: "Check a different time.",
            action: agentAction("move_activity", {
              activityId: canceled.activityId,
              startMinute: previous.startMinute,
            }),
          },
        ],
      };
    };
    const review = await suggest(id, canceled.id);
    assert.equal(review.findings.length, 2);
    assert.equal(review.options.length, 1);
    assert.equal(review.options[0].kind, "reschedule");
    assert.equal(review.options[0].preview.canSave, false);
    assert.equal(
      (await recovery(id, apply(canceled.id, review.id, review.options[0].id)))
        .status,
      409,
    );
  } finally {
    customize = undefined;
  }
});

test("interrupted jobs are recoverable and an approved planning reschedule preserves the original activity ID", async () => {
  const { id, bookingId, activityId } = await bookedTrip();
  const canceled = await simulate(id, bookingId);
  const abandoned = randomUUID();
  await result(
    await recovery(id, {
      action: "suggest",
      caseId: canceled.id,
      mutationId: abandoned,
      preferences: "",
    }),
    202,
  );
  const delayed = works.shift()!;
  await seed.connection.db
    .update(recoveryAttempt)
    .set({ updatedAt: new Date(0) })
    .where(eq(recoveryAttempt.id, abandoned));
  const interrupted = await result(await recovery(id));
  assert.equal(interrupted.cases[0].attempts[0].status, "interrupted");
  customize = (context) => ({
    alternatives: [
      {
        kind: "reschedule",
        rationale:
          "The later slot may allow more time after lunch. Ask the supplier before relying on this change.",
        action: agentAction("move_activity", {
          activityId,
          startMinute: context.recovery.affected.activity.startMinute + 15,
        }),
      },
    ],
  });
  try {
    const review = await suggest(id, canceled.id);
    const [option] = review.options;
    assert.ok(
      option.preview.canSave,
      JSON.stringify(option.preview.assessment.errors),
    );
    const calls = providerCalls;
    await delayed();
    assert.equal(
      providerCalls,
      calls,
      "An abandoned queued worker cannot send another model request",
    );
    const saved = await result(
      await recovery(id, apply(canceled.id, review.id, option.id)),
    );
    assert.equal(saved.cases[0].replacementActivityId, null);
    assert.equal(saved.cases[0].payment.payment.netMinor, 500);
    const itinerary = await app.itineraryEditor.read(seed.userId, id);
    assert.equal(
      itinerary.itinerary.days[1].activities.find(
        (item) => item.id === activityId,
      )?.startMinute,
      canceled.original.activity.startMinute + 15,
    );
  } finally {
    customize = undefined;
  }
});

test("refund and replacement reconcile independently after partial failure; persisted history is owner-bound", async () => {
  const { id, bookingId, activityId } = await bookedTrip();
  const canceled = await simulate(id, bookingId);
  const review = await suggest(id, canceled.id);
  const option = review.options.find((item) => item.kind === "free")!;
  const writes = fake.writes.length;
  const applied = await result(
    await recovery(id, apply(canceled.id, review.id, option.id)),
  );
  assert.equal(applied.cases[0].phase, "itinerary_updated");
  const replacement = applied.cases[0].replacementActivityId!;
  assert.notEqual(replacement, activityId);
  assert.equal(
    (await recovery(id, apply(canceled.id, review.id, option.id))).status,
    200,
  );
  assert.equal(fake.writes.length, writes);
  assert.ok(
    (await app.itineraryEditor.read(seed.userId, id)).itinerary.days.some(
      (day) =>
        day.activities.some((a) => a.id === replacement && a.latitude === null),
    ),
  );
  const partial = refund(bookingId, "2.00", "partial");
  fake.switches.nextRefundStatus = "PENDING";
  try {
    await app.commerce.action(seed.userId, id, partial);
  } finally {
    fake.switches.nextRefundStatus = "COMPLETED";
  }
  await app.commerce.action(seed.userId, id, partial);
  const pending = (await result(await recovery(id))).cases[0];
  assert.equal(pending.phase, "refund_pending");
  assert.equal(pending.payment.payment.pendingRefundMinor, 200);
  assert.equal(pending.payment.payment.netMinor, 500);
  assert.equal(
    (await recovery(id, { action: "finish", caseId: canceled.id })).status,
    409,
  );
  const pendingProvider = Array.from(fake.refunds.values()).at(-1);
  pendingProvider.status = "FAILED";
  // Move only the fixture's read-throttle timestamp back. The provider record
  // still has to pass the normal refund verification and append path.
  await seed.connection.db
    .update(paypalBooking)
    .set({ lastReconciledAt: null })
    .where(eq(paypalBooking.id, bookingId));
  await app.commerce.action(seed.userId, id, {
    action: "reconcile",
    bookingId,
  });
  const failed = (await result(await recovery(id))).cases[0];
  assert.equal(failed.phase, "refund_failed");
  assert.equal(failed.payment.payment.netMinor, 500);
  const completedPartial = refund(bookingId, "2.00", "partial");
  await app.commerce.action(seed.userId, id, completedPartial);
  assert.equal(
    (await result(await recovery(id))).cases[0].payment.payment.netMinor,
    300,
  );
  const final = refund(bookingId, "3.00", "full");
  await app.commerce.action(seed.userId, id, final);
  await app.commerce.action(seed.userId, id, final);
  await assert.rejects(
    app.commerce.action(seed.userId, id, refund(bookingId, "1.00", "full")),
    { status: 409 },
  );
  const newQuote = await quote(id, replacement);
  assert.equal(newQuote.originalCurrency, "USD");
  assert.equal(
    (await result(await recovery(id))).financial.capturedNetEstimateMinor,
    0,
  );
  const replacementOrder = await buy(id, newQuote.id, false);
  assert.equal(
    (await result(await recovery(id))).cases[0].phase,
    "replacement_pending",
  );
  fake.switches.declineCapture = true;
  fake.orders.get(replacementOrder.orderId).status = "APPROVED";
  try {
    await app.commerce.action(seed.userId, id, {
      action: "capture",
      bookingId: replacementOrder.bookingId,
      orderId: replacementOrder.orderId,
    });
  } finally {
    fake.switches.declineCapture = false;
  }
  const state = await result(await recovery(id));
  assert.equal(state.cases[0].phase, "replacement_failed");
  assert.equal(state.cases[0].payment.payment.refundedMinor, 500);
  assert.equal(state.cases[0].replacement?.id, replacementOrder.bookingId);
  assert.equal(state.financial.capturedNetEstimateMinor, 0);
  assert.equal(state.financial.reserveMinor, 25000);
  const finished = await result(
    await recovery(id, { action: "finish", caseId: canceled.id }),
  );
  assert.ok(finished.cases[0].resolvedAt);
  assert.equal(finished.cases[0].phase, "replacement_failed");
  await seed.close();
  const reopened = await openDatabase({ directory });
  try {
    const restarted = createApplication(reopened.db, {
      ...seed.config,
      paypal: payPal,
      recoverySimulation: true,
    });
    const login = await restarted.authHandler(
      request("/api/auth/sign-in/email", {
        email: seed.email,
        password: seed.password,
      }),
    );
    assert.equal(login.status, 200);
    const fresh = await restarted.recoveryHandler(
      request(`/api/trips/${id}/recovery`, undefined, cookieOf(login)),
      id,
      () => assert.fail("Read must not schedule work"),
    );
    const recovered = await result(fresh);
    assert.ok(recovered.cases[0].resolvedAt);
    assert.equal(recovered.cases[0].phase, "replacement_failed");
    assert.equal(recovered.cases[0].payment.payment.refundedMinor, 500);
    assert.equal(
      recovered.cases[0].replacement?.id,
      replacementOrder.bookingId,
    );
    const [record] = await reopened.db
      .select()
      .from(recoveryCase)
      .where(eq(recoveryCase.id, canceled.id));
    assert.equal(record.bookingId, bookingId);
    assert.equal(record.userId, seed.userId);
    assert.equal(record.original.activity.id, activityId);
    assert.ok(record.editId);
  } finally {
    await reopened.close();
  }
});

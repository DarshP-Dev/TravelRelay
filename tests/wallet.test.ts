import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { prepareOfflineSolReview } from "./helpers/offline-sol-review";
import { createApplication } from "../src/server/application";
import { createWallet, type FinancialVerifier } from "../src/server/wallet";
import { openDatabase } from "../src/server/db/connection";
import {
  trip,
  financialEvent,
  walletIntent,
  tripWallet,
} from "../src/server/db/schema";
import {
  providerOutcomeSchema,
  type ProviderOutcome,
} from "../src/lib/finance-contracts";
import { agentAction, agentReply } from "./helpers/agent-fixtures";
import { solRecording } from "./helpers/sol-recording";
let state: Awaited<ReturnType<typeof prepareOfflineSolReview>>,
  app: ReturnType<typeof createApplication>;
let otherCookie: string;
let fxCalls = 0;
const fxFetch: typeof fetch = async (input) => {
  fxCalls++;
  const url = new URL(String(input)),
    [base, quote] = url.pathname.split("/").slice(-2);
  assert.equal(url.hostname, "api.frankfurter.dev");
  return Response.json({
    base,
    quote,
    date: new Date().toISOString().slice(0, 10),
    rate: base === quote ? 1 : 0.8,
  });
};
before(async () => {
  mock.method(globalThis, "fetch", async () => {
    throw Error("No live provider traffic in wallet tests");
  });
  await mkdir(".test-data", { recursive: true });
  state = await prepareOfflineSolReview(
    await mkdtemp(path.resolve(".test-data/wallet-")),
    "http://localhost:3000",
  );
  await state.worker();
  app = createApplication(state.connection.db, { ...state.config, fxFetch });
  const r = await app.authHandler(
    new Request(state.origin + "/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin: state.origin, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Other wallet user",
        email: "wallet-other@example.com",
        password: state.password,
      }),
    }),
  );
  assert.equal(r.status, 200);
  otherCookie = r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join(";");
});
after(async () => {
  await state.close();
  mock.restoreAll();
});
async function fresh() {
  const d = await app.trips.openDraft(state.userId, {});
  const saved = await app.trips.complete(state.userId, d.id, {
    version: d.version,
    data: solRecording.intent,
  });
  const original = (await state.app.trips.read(state.userId, state.trip.id))
    .itinerary!;
  await state.connection.db
    .update(trip)
    .set({ itinerary: original })
    .where(eq(trip.id, saved.id));
  return saved.id;
}
function api(
  id: string,
  body?: unknown,
  cookie = state.cookie,
  origin = state.origin,
) {
  return app.walletHandler(
    new Request(state.origin + `/api/trips/${id}/wallet`, {
      method: body === undefined ? "GET" : "POST",
      headers: { origin, cookie, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    id,
  );
}
async function quote(
  id: string,
  amount = "70.00",
  currency = "EUR",
  index = 1,
) {
  const current = await app.wallet.read(state.userId, id);
  const activity = current.activities[index];
  const data = {
    activityId: activity.id,
    amount,
    currency,
    supplier: "Offline unverified supplier note",
    itineraryVersion: current.itineraryVersion,
    walletVersion: current.version,
  };
  const previewResponse = await api(id, { action: "preview_quote", ...data });
  assert.equal(previewResponse.status, 200);
  const p = (await previewResponse.json()).preview;
  const save = {
    action: "save_quote",
    ...data,
    mutationId: randomUUID(),
    fxSnapshotId: p.fx.snapshot.id,
  };
  return { save, preview: p, activity };
}
async function savedIntent(id: string, amount = "70.00", currency = "EUR") {
  const q = await quote(id, amount, currency);
  assert.equal((await api(id, q.save)).status, 200);
  const intent = (await app.wallet.read(state.userId, id)).intents[0];
  fixtureOrder = `OFFLINE-ORDER-${intent.id}`;
  fixtureCapture = `OFFLINE-CAPTURE-${intent.id}`;
  return intent;
}
test("Paris wallet preserves exact planning totals, zero actuals, scope, source IDs and no fake bookings", async () => {
  const id = await fresh(),
    s = await app.wallet.read(state.userId, id),
    b = s.budget;
  assert.deepEqual(
    [
      b.selectedBudgetMinor,
      b.itemizedEstimateMinor,
      b.unitemizedAllowanceMinor,
      b.allocatedMinor,
      b.reserveMinor,
      b.totalWithReserveMinor,
      b.remainingMinor,
    ],
    [250000, 36900, 165500, 202400, 25000, 227400, 22600],
  );
  assert.equal(s.summary.actualHomeMinor, 0);
  assert.equal(s.summary.projectedMinor, 202400);
  assert.equal(s.summary.projectedRemainingMinor, 22600);
  assert.deepEqual(s.events, []);
  assert.deepEqual(s.intents, []);
  assert.equal(s.providerEnabled, false);
  assert.ok(s.activities.every((a) => a.id && a.dayId));
  const count = fxCalls;
  await api(id);
  assert.equal(fxCalls, count, "ordinary reads never fetch FX");
});
test("foreign planning quote previews then atomically updates the shared estimate once, preserving original currency", async () => {
  const id = await fresh(),
    q = await quote(id, "100.00", "USD");
  assert.equal(q.preview.convertedMinor, 8000);
  assert.equal((await app.itineraryEditor.read(state.userId, id)).version, 0);
  assert.equal(q.preview.afterBudget.remainingMinor, 21600);
  const r = await api(id, q.save);
  assert.equal(r.status, 200);
  assert.equal((await api(id, q.save)).status, 200);
  const s = await app.wallet.read(state.userId, id),
    i = s.intents[0];
  assert.equal(i.originalMinor, 10000);
  assert.equal(i.originalCurrency, "USD");
  assert.equal(i.estimatedDisplayMinor, 8000);
  assert.equal(i.displayCurrency, "EUR");
  assert.equal(s.version, 1);
  assert.equal(s.itineraryVersion, 1);
  assert.equal(s.intents.length, 1);
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].kind, "intent_created");
  assert.equal(s.summary.actualHomeMinor, 0);
  assert.equal(i.state.status, "unpaid");
  assert.equal(
    s.budget.allocations.find((a) => a.category === "food")!.allocatedMinor,
    51000,
  );
  assert.equal(
    s.budget.allocations.find((a) => a.category === "food")!
      .unitemizedAllowanceMinor,
    17500,
  );
  assert.equal(s.budget.reserveMinor, 25000);
  assert.equal(
    (await app.itineraryEditor.read(state.userId, id)).itinerary.totalMinor,
    228400,
  );
  assert.equal((await api(id, { ...q.save, amount: "101.00" })).status, 409);
});
test("user, origin, strict schema and ownership gates cannot forge actual spending or provider outcomes", async () => {
  const id = await fresh();
  assert.equal((await api(id, undefined, "")).status, 401);
  assert.equal((await api(id, undefined, otherCookie)).status, 404);
  assert.equal(
    (await api(id, { action: "captured", amountMinor: 100, currency: "EUR" }))
      .status,
    400,
  );
  assert.equal(
    (
      await api(
        id,
        {
          action: "settings",
          localCurrency: "USD",
          walletVersion: 0,
          mutationId: randomUUID(),
        },
        state.cookie,
        "https://evil.example",
      )
    ).status,
    403,
  );
  const q = await quote(id);
  assert.equal((await api(id, { ...q.save, status: "captured" })).status, 400);
  assert.equal((await api(id, q.save, otherCookie)).status, 404);
  await assert.rejects(
    app.wallet.reconcile(state.userId, id, randomUUID(), "no-provider"),
    /not enabled/,
  );
  await assert.rejects(app.wallet.read("other", id), /not found/);
  for (const changes of [
    { activityId: randomUUID() },
    { currency: "XXX" },
    { amount: "1.2", currency: "JPY" },
    { amount: "-1" },
  ]) {
    const r = await api(id, {
      ...q.save,
      action: "preview_quote",
      ...changes,
      mutationId: undefined,
      fxSnapshotId: undefined,
    });
    assert.ok(
      [400, 422].includes(r.status),
      `invalid input returned ${r.status}`,
    );
  }
});
test("concurrent wallet updates and itinerary edits invalidate stale previews and preserve audit atomicity", async () => {
  const id = await fresh(),
    q = await quote(id);
  const results = await Promise.all([api(id, q.save), api(id, q.save)]);
  assert.ok(results.some((r) => r.status === 200));
  assert.ok(results.every((r) => [200, 409].includes(r.status)));
  const s = await app.wallet.read(state.userId, id);
  assert.equal(s.events.length, 1);
  assert.equal(s.intents.length, 1);
  assert.equal(
    (await app.itineraryEditor.read(state.userId, id)).history.length,
    1,
  );
  const other = await fresh(),
    pending = await quote(other);
  await api(other, {
    action: "settings",
    localCurrency: "JPY",
    walletVersion: 0,
    mutationId: randomUUID(),
  });
  assert.equal((await api(other, pending.save)).status, 409);
  assert.equal(
    (await app.itineraryEditor.read(state.userId, other)).version,
    0,
  );
  const fail = await fresh(),
    before = await quote(fail);
  await state.connection.db.execute(
    sql.raw(
      `CREATE FUNCTION fail_wallet_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'offline injected event storage failure'; END; $$;`,
    ),
  );
  await state.connection.db.execute(
    sql.raw(
      "CREATE TRIGGER fail_wallet_test BEFORE INSERT ON financial_event FOR EACH ROW EXECUTE FUNCTION fail_wallet_test();",
    ),
  );
  try {
    assert.equal((await api(fail, before.save)).status, 503);
  } finally {
    await state.connection.db.execute(
      sql.raw("DROP TRIGGER fail_wallet_test ON financial_event;"),
    );
    await state.connection.db.execute(
      sql.raw("DROP FUNCTION fail_wallet_test();"),
    );
  }
  const after = await app.wallet.read(state.userId, fail);
  assert.equal(after.version, 0);
  assert.equal(after.itineraryVersion, 0);
  assert.equal(after.intents.length, 0);
  assert.equal(
    (await app.itineraryEditor.read(state.userId, fail)).history.length,
    0,
  );
});
test("closing a planning intent is explicit, idempotent, retains original evidence and does not undo estimates", async () => {
  const id = await fresh(),
    i = await savedIntent(id, "100.00", "USD"),
    body = {
      action: "cancel_intent",
      intentId: i.id,
      walletVersion: 1,
      mutationId: randomUUID(),
    };
  assert.equal((await api(id, body)).status, 200);
  assert.equal((await api(id, body)).status, 200);
  const s = await app.wallet.read(state.userId, id);
  assert.equal(s.intents[0].status, "canceled");
  assert.equal(s.intents[0].originalMinor, 10000);
  assert.equal(s.budget.remainingMinor, 21600);
  assert.equal(s.summary.actualHomeMinor, 0);
  assert.deepEqual(
    s.events.map((e) => e.kind),
    ["intent_created", "intent_canceled"],
  );
  await assert.rejects(
    state.connection.db
      .update(walletIntent)
      .set({ originalMinor: 1 })
      .where(eq(walletIntent.id, i.id)),
    /immutable|Failed query/,
  );
  await assert.rejects(
    state.connection.db
      .update(financialEvent)
      .set({ amountMinor: 10 })
      .where(eq(financialEvent.intentId, i.id)),
    /append-only|Failed query/,
  );
  await assert.rejects(
    state.connection.db
      .delete(financialEvent)
      .where(eq(financialEvent.intentId, i.id)),
    /append-only|Failed query/,
  );
});

let outcome: ProviderOutcome;
let fixtureOrder: string, fixtureCapture: string;
const verifier: FinancialVerifier = async () => structuredClone(outcome);
function next(
  kind: ProviderOutcome["kind"],
  values: Partial<ProviderOutcome> = {},
) {
  outcome = providerOutcomeSchema.parse({
    provider: "paypal-sandbox",
    verification: "provider-api",
    kind,
    eventId: randomUUID(),
    reconciliationRef: randomUUID(),
    currency: "EUR",
    amountMinor: [
      "captured",
      "refund_pending",
      "refund_completed",
      "refund_failed",
      "reversal_completed",
    ].includes(kind)
      ? 7000
      : 0,
    feeMinor: 0,
    feeCurrency: "EUR",
    feeTreatment: "additional-traveler-cost",
    orderId: fixtureOrder,
    captureId: [
      "captured",
      "refund_pending",
      "refund_completed",
      "refund_failed",
      "reversal_completed",
    ].includes(kind)
      ? fixtureCapture
      : null,
    refundId: kind.startsWith("refund_") ? randomUUID() : null,
    occurredAt: new Date().toISOString(),
    ...values,
  });
  return outcome;
}
test("OFFLINE verifier fixture captures are distinct from estimates; refund pending never releases money", async () => {
  const id = await fresh(),
    i = await savedIntent(id),
    wallet = createWallet(state.connection.db, { verifier });
  next("captured", { feeMinor: 200 });
  await wallet.reconcile(state.userId, id, i.id, outcome.reconciliationRef);
  let s = await wallet.read(state.userId, id);
  assert.equal(s.summary.actualHomeMinor, 7000);
  assert.equal(s.summary.feesHomeMinor, 200);
  assert.equal(s.budget.allocatedMinor, 202400);
  assert.equal(s.summary.projectedMinor, 202600);
  assert.equal(s.summary.unpaidItemizedMinor, 29900);
  const capture = outcome;
  await wallet.reconcile(state.userId, id, i.id, outcome.reconciliationRef);
  assert.equal((await wallet.read(state.userId, id)).events.length, 2);
  next("captured", { eventId: randomUUID(), feeMinor: 200 });
  await wallet.reconcile(state.userId, id, i.id, outcome.reconciliationRef);
  assert.equal(
    (await wallet.read(state.userId, id)).events.length,
    2,
    "different webhook ID for same capture is deduplicated",
  );
  const refundId = randomUUID();
  next("refund_pending", { refundId, amountMinor: 3000 });
  await wallet.reconcile(state.userId, id, i.id, outcome.reconciliationRef);
  s = await wallet.read(state.userId, id);
  assert.equal(s.summary.actualHomeMinor, 7000);
  assert.equal(s.summary.native[0].pendingRefundMinor, 3000);
  assert.equal(s.summary.projectedRemainingMinor, 22400);
  next("refund_completed", { refundId, amountMinor: 3000 });
  await wallet.reconcile(state.userId, id, i.id, outcome.reconciliationRef);
  s = await wallet.read(state.userId, id);
  assert.equal(s.summary.actualHomeMinor, 4000);
  assert.equal(s.summary.native[0].pendingRefundMinor, 0);
  assert.equal(s.intents[0].state.status, "partially_refunded");
  assert.equal(
    s.summary.projectedRemainingMinor,
    22400,
    "still-planned activity retains unpaid estimate after refund",
  );
  next("refund_completed", { amountMinor: 5000 });
  await assert.rejects(
    wallet.reconcile(state.userId, id, i.id, outcome.reconciliationRef),
    /exceed/,
  );
  next("captured", { eventId: capture.eventId, amountMinor: 6000 });
  await assert.rejects(
    wallet.reconcile(state.userId, id, i.id, outcome.reconciliationRef),
    /Conflicting duplicate/,
  );
});
test("OFFLINE financial serialization prevents concurrent over-refunds and invalid state/currency transitions", async () => {
  const id = await fresh(),
    i = await savedIntent(id),
    wallet = createWallet(state.connection.db, { verifier });
  next("refund_completed");
  await assert.rejects(
    wallet.reconcile(state.userId, id, i.id, outcome.reconciliationRef),
    /confirmed capture/,
  );
  next("authorized");
  await assert.rejects(
    wallet.reconcile(state.userId, id, i.id, outcome.reconciliationRef),
    /active verified order/,
  );
  next("captured", { currency: "USD" });
  await assert.rejects(
    wallet.reconcile(state.userId, id, i.id, outcome.reconciliationRef),
    /currency/,
  );
  next("captured");
  await wallet.reconcile(state.userId, id, i.id, outcome.reconciliationRef);
  const outcomes = [
    next("refund_completed", { amountMinor: 4000 }),
    next("refund_completed", { amountMinor: 4000 }),
  ];
  let index = 0;
  const concurrent = createWallet(state.connection.db, {
    verifier: async () => outcomes[index++],
  });
  const results = await Promise.allSettled(
    outcomes.map((o) =>
      concurrent.reconcile(state.userId, id, i.id, o.reconciliationRef),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await wallet.read(state.userId, id)).summary.native[0].refundedMinor,
    4000,
  );
  next("payment_failed");
  await assert.rejects(
    wallet.reconcile(state.userId, id, i.id, outcome.reconciliationRef),
    /settled/,
  );
  assert.equal(
    (
      await api(id, {
        action: "cancel_intent",
        intentId: i.id,
        walletVersion: (await wallet.read(state.userId, id)).version,
        mutationId: randomUUID(),
      })
    ).status,
    409,
  );
});
test("manual and approved AI edits refresh projections without mutating financial evidence or original quotes", async () => {
  const id = await fresh(),
    i = await savedIntent(id);
  const saved = await app.itineraryEditor.read(state.userId, id),
    target = saved.itinerary.days[0].activities[1];
  const agent = createApplication(state.connection.db, {
    ...state.config,
    fxFetch,
    model: {
      name: "offline-wallet-agent",
      propose: async () => {
        throw Error("forbidden");
      },
      generate: async () => {
        throw Error("forbidden");
      },
      respond: async () =>
        agentReply([
          agentAction("update_activity", {
            activityId: target.id,
            costMinor: 5000,
          }),
        ]),
    },
  });
  const sent = await agent.travelAgent.action(state.userId, id, {
    action: "send",
    mutationId: randomUUID(),
    text: "Make dinner cheaper",
    draftVersion: 0,
  });
  await agent.travelAgent.run(state.userId, id, sent.queuedTurnId!);
  const p = (await agent.travelAgent.read(state.userId, id)).turns[0].proposal!;
  assert.equal(p.preview.canSave, true);
  await agent.travelAgent.action(state.userId, id, {
    action: "approve",
    proposalId: p.id,
    revision: p.revision,
  });
  let s = await app.wallet.read(state.userId, id);
  assert.equal(s.budget.remainingMinor, 24600);
  assert.equal(s.intents[0].staleActivity, true);
  assert.equal(s.intents[0].originalMinor, i.originalMinor);
  assert.equal(s.events.length, 1);
  await app.itineraryEditor.commit(state.userId, id, {
    version: 2,
    mutationId: randomUUID(),
    operation: { action: "delete", activityId: target.id },
  });
  s = await app.wallet.read(state.userId, id);
  assert.equal(s.intents[0].activityExists, false);
  assert.equal(s.events.length, 1);
  assert.equal(s.summary.actualHomeMinor, 0);
});
test("foreign actual amounts retain original/charged currencies and are explicitly indicative in home projection", async () => {
  const id = await fresh(),
    i = await savedIntent(id, "100.00", "USD"),
    wallet = createWallet(state.connection.db, { verifier });
  next("captured", {
    currency: "USD",
    amountMinor: 10000,
    chargedCurrency: "CAD",
    chargedMinor: 13700,
  });
  await wallet.reconcile(state.userId, id, i.id, outcome.reconciliationRef);
  const s = await wallet.read(state.userId, id);
  assert.equal(s.summary.native[0].netMinor, 10000);
  assert.equal(s.summary.actualHomeMinor, 8000);
  assert.equal(s.summary.indicativeActual, true);
  assert.equal(s.events[1].outcome!.chargedCurrency, "CAD");
  assert.equal(s.events[1].outcome!.chargedMinor, 13700);
  assert.equal(s.events[1].displayCurrency, "EUR");
  assert.equal(s.events[1].estimatedDisplayMinor, 8000);
  assert.equal(s.events[1].estimatedFeeMinor, 0);
  assert.match(s.summary.warnings.join(" "), /indicative/);
});
test("overruns need explicit acknowledgement; stale FX needs separate dated-rate approval", async () => {
  const id = await fresh(),
    q = await quote(id, "10000.00");
  assert.equal(q.preview.overBudget, true);
  assert.equal((await api(id, q.save)).status, 422);
  assert.equal((await app.wallet.read(state.userId, id)).intents.length, 0);
  assert.equal(
    (await api(id, { ...q.save, acknowledgeOverBudget: true })).status,
    200,
  );
  assert.equal(
    (await app.wallet.read(state.userId, id)).budget.reserveMinor,
    25000,
  );
  let time = Date.now() + 2 * 3_600_000;
  const other = await fresh(),
    wallet = createWallet(state.connection.db, { clock: () => time, fxFetch });
  const s = await wallet.read(state.userId, other);
  const data = {
    activityId: s.activities[1].id,
    amount: "100.00",
    currency: "USD",
    supplier: "Offline stale FX fixture",
    itineraryVersion: 0,
    walletVersion: 0,
  };
  const result = await wallet.action(state.userId, other, {
    action: "preview_quote",
    ...data,
  });
  assert.ok(result.preview);
  time += 3_600_001;
  const save = {
    action: "save_quote",
    ...data,
    mutationId: randomUUID(),
    fxSnapshotId: result.preview!.fx.snapshot.id,
  };
  await assert.rejects(wallet.action(state.userId, other, save), /stale/);
  await wallet.action(state.userId, other, {
    ...save,
    acknowledgeStaleRate: true,
  });
  assert.equal(
    (await wallet.read(state.userId, other)).intents[0].acceptedStaleRate,
    true,
  );
});
test("JPY quotes preserve whole-yen original amounts and never assume two decimals", async () => {
  const id = await fresh(),
    q = await quote(id, "10", "JPY");
  assert.equal(q.preview.originalMinor, 10);
  assert.equal(q.preview.convertedMinor, 800);
  assert.equal((await api(id, q.save)).status, 200);
  const s = await app.wallet.read(state.userId, id);
  assert.equal(s.intents[0].originalMinor, 10);
  assert.equal(s.intents[0].originalCurrency, "JPY");
  assert.equal(
    s.budget.allocations.find((a) => a.category === "food")!
      .unitemizedAllowanceMinor,
    17500,
  );
});
test("spending-only scope never silently includes return travel or accommodation", async () => {
  const id = await fresh(),
    saved = await app.trips.read(state.userId, id),
    plan = structuredClone(saved.itinerary!);
  delete plan.budget;
  await state.connection.db
    .update(trip)
    .set({ data: { ...saved.data, scope: "spending" }, itinerary: plan })
    .where(eq(trip.id, id));
  const s = await app.wallet.read(state.userId, id);
  assert.equal(s.scope, "spending");
  assert.equal(s.budget.allocatedMinor, 76400);
  assert.equal(s.budget.reserveMinor, 25000);
  assert.equal(s.budget.remainingMinor, 148600);
  assert.equal(s.summary.projectedMinor, 76400);
  assert.equal(
    s.budget.allocations.find((a) => a.category === "flights")!.inScope,
    false,
  );
});
test("removing a paid activity retains its confirmed spending and never generates a refund", async () => {
  const id = await fresh(),
    i = await savedIntent(id),
    wallet = createWallet(state.connection.db, { verifier });
  next("captured");
  await wallet.reconcile(state.userId, id, i.id, outcome.reconciliationRef);
  await app.itineraryEditor.commit(state.userId, id, {
    version: 1,
    mutationId: randomUUID(),
    operation: { action: "delete", activityId: i.activityId },
  });
  const s = await wallet.read(state.userId, id);
  assert.equal(s.summary.actualHomeMinor, 7000);
  assert.equal(s.budget.allocatedMinor, 195400);
  assert.equal(s.summary.projectedMinor, 202400);
  assert.equal(s.summary.projectedRemainingMinor, 22600);
  assert.equal(s.intents[0].activityExists, false);
  assert.deepEqual(
    s.events.map((e) => e.kind),
    ["intent_created", "captured"],
  );
});
test("OFFLINE merchant and included fees never double-count the captured principal in wallet projections", async () => {
  for (const feeTreatment of [
    "merchant-fee",
    "included-in-capture",
    "unknown",
  ] as const) {
    const id = await fresh(),
      i = await savedIntent(id),
      wallet = createWallet(state.connection.db, { verifier });
    next("captured", { feeMinor: 200, feeTreatment });
    await wallet.reconcile(state.userId, id, i.id, outcome.reconciliationRef);
    const s = await wallet.read(state.userId, id);
    assert.equal(s.summary.actualHomeMinor, 7000);
    assert.equal(s.summary.projectedMinor, 202400);
    assert.equal(s.summary.native[0].feeMinor, 200);
    assert.equal(s.summary.feesHomeMinor, 0);
    if (feeTreatment === "unknown")
      assert.match(s.summary.warnings.join(" "), /fee payer/);
  }
});
test("wallet, immutable ledger, original currencies and settings persist after database reopen and fresh login", async () => {
  const id = await fresh();
  await savedIntent(id, "100.00", "USD");
  await api(id, {
    action: "settings",
    localCurrency: "JPY",
    walletVersion: 1,
    mutationId: randomUUID(),
  });
  const expected = await app.wallet.read(state.userId, id);
  await state.close();
  const connection = await openDatabase({ directory: state.directory });
  try {
    const reopened = createApplication(connection.db, {
      ...state.config,
      fxFetch,
    });
    const login = await reopened.authHandler(
      new Request(state.origin + "/api/auth/sign-in/email", {
        method: "POST",
        headers: { origin: state.origin, "content-type": "application/json" },
        body: JSON.stringify({ email: state.email, password: state.password }),
      }),
    );
    assert.equal(login.status, 200);
    const cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join(";");
    const r = await reopened.walletHandler(
      new Request(state.origin + "/wallet", { headers: { cookie } }),
      id,
    );
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), expected);
    await assert.rejects(
      connection.db
        .update(tripWallet)
        .set({ userId: "other-user" })
        .where(eq(tripWallet.tripId, id)),
      /foreign key|Failed query/,
    );
  } finally {
    await connection.close();
  }
});

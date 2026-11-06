import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { prepareOfflineSolReview } from "./helpers/offline-sol-review";
import {
  fakeSandbox,
  sandboxFixtureConfig,
} from "./helpers/paypal-sandbox.mjs";
import { createApplication } from "../src/server/application";
import { createPayPalClient, sandboxConfig } from "../src/server/paypal-client";
import { openDatabase } from "../src/server/db/connection";
import {
  paypalBooking,
  paypalWebhookReceipt,
  trip,
} from "../src/server/db/schema";
import { solRecording } from "./helpers/sol-recording";
import type { CommerceState } from "../src/server/paypal-commerce";

let seed: Awaited<ReturnType<typeof prepareOfflineSolReview>>;
let app: ReturnType<typeof createApplication>;
let other: string;
const fake = fakeSandbox();
const client = createPayPalClient(sandboxFixtureConfig, fake.transport);
const fxFetch: typeof fetch = async () =>
  Response.json({
    base: "USD",
    quote: "EUR",
    rate: 0.8,
    date: new Date().toISOString().slice(0, 10),
  });
const cookie = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join(";");
before(async () => {
  mock.method(globalThis, "fetch", async () => {
    throw Error("No live transport in PayPal tests");
  });
  await mkdir(".test-data", { recursive: true });
  seed = await prepareOfflineSolReview(
    await mkdtemp(path.resolve(".test-data/paypal-tests-")),
    "http://localhost:3000",
  );
  await seed.worker();
  app = createApplication(seed.connection.db, {
    ...seed.config,
    paypal: client,
    fxFetch,
  });
  const r = await app.authHandler(
    new Request(seed.origin + "/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin: seed.origin, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Other Sandbox user",
        email: "other-sandbox@example.com",
        password: seed.password,
      }),
    }),
  );
  assert.equal(r.status, 200);
  other = cookie(r);
});
after(async () => {
  await seed.close();
  mock.restoreAll();
});
function api(
  id: string,
  body?: unknown,
  auth = seed.cookie,
  origin = seed.origin,
) {
  return app.commerceHandler(
    new Request(seed.origin + `/api/trips/${id}/commerce`, {
      method: body === undefined ? "GET" : "POST",
      headers: { cookie: auth, origin, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    id,
  );
}
async function newQuote(amount = "5.00") {
  const d = await app.trips.openDraft(seed.userId, {});
  const saved = await app.trips.complete(seed.userId, d.id, {
    version: d.version,
    data: solRecording.intent,
  });
  const original = (await app.trips.read(seed.userId, seed.trip.id)).itinerary!;
  await seed.connection.db
    .update(trip)
    .set({ itinerary: original })
    .where(eq(trip.id, saved.id));
  const w = await app.wallet.read(seed.userId, saved.id);
  const data = {
    activityId: w.activities[1].id,
    amount,
    currency: "USD",
    supplier: "Offline Sandbox fixture",
    itineraryVersion: w.itineraryVersion,
    walletVersion: w.version,
  };
  const quote = await app.wallet.action(seed.userId, saved.id, {
    action: "preview_quote",
    ...data,
  });
  assert.ok(quote.preview);
  await app.wallet.action(seed.userId, saved.id, {
    action: "save_quote",
    ...data,
    mutationId: randomUUID(),
    fxSnapshotId: quote.preview.fx.snapshot.id,
  });
  const current = await app.wallet.read(seed.userId, saved.id);
  return {
    tripId: saved.id,
    input: {
      action: "checkout",
      intentId: current.intents[0].id,
      walletVersion: current.version,
      itineraryVersion: current.itineraryVersion,
    },
    activityId: w.activities[1].id,
  };
}
async function json(r: Response) {
  assert.equal(r.status, 200, await r.clone().text());
  return (await r.json()) as {
    state: CommerceState;
    orderId: string | null;
    bookingId: string;
  };
}
async function ordered(q: Awaited<ReturnType<typeof newQuote>>) {
  const result = await json(await api(q.tripId, q.input));
  assert.ok(result.orderId);
  return {
    bookingId: result.bookingId,
    orderId: result.orderId,
    captureInput: {
      action: "capture",
      bookingId: result.bookingId,
      orderId: result.orderId,
    },
  };
}
async function signed(
  event_type: string,
  resource: object,
  id = "EVENT-" + randomUUID(),
  signature = "signed-offline-fixture",
) {
  return app.commerce.webhook(
    new Request(seed.origin + "/api/paypal/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url":
          "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-OFFLINE",
        "paypal-transmission-id": "OFFLINE-TRANSMISSION",
        "paypal-transmission-sig": signature,
        "paypal-transmission-time": "2026-10-01T12:00:00Z",
      },
      body: JSON.stringify({ id, event_type, resource }),
    }),
  );
}
async function status(tripId: string) {
  return app.commerce.read(seed.userId, tripId);
}
function approve(orderId: string) {
  fake.orders.get(orderId).status = "APPROVED";
}
const refund = (
  bookingId: string,
  amount: string,
  mode: "full" | "partial" = "partial",
) => ({ action: "refund", bookingId, mode, amount, mutationId: randomUUID() });
let paidTrip: string, paidBooking: string;
let guarded: { tripId: string; bookingId: string; orderId: string };

test("configuration requires explicit Sandbox and does not accept production mode", () => {
  const e = {
    PAYPAL_CLIENT_ID: sandboxFixtureConfig.clientId,
    PAYPAL_CLIENT_SECRET: sandboxFixtureConfig.secret,
    PAYPAL_MERCHANT_ID: sandboxFixtureConfig.merchantId,
    ENABLE_DEMO_MERCHANT: "true",
  };
  assert.equal(sandboxConfig({ ...e, PAYPAL_ENVIRONMENT: "live" }), undefined);
  assert.equal(
    sandboxConfig({
      ...e,
      PAYPAL_ENVIRONMENT: "sandbox",
      ENABLE_DEMO_MERCHANT: "false",
    }),
    undefined,
  );
  assert.equal(
    sandboxConfig({ ...e, PAYPAL_ENVIRONMENT: "sandbox" })?.merchantId,
    sandboxFixtureConfig.merchantId,
  );
});
test("checkout guards versions, ownership, altered amounts and fake success; concurrent creates send one order", async () => {
  const q = await newQuote(),
    start = fake.writes.length;
  assert.equal((await api(q.tripId, undefined, "")).status, 401);
  assert.equal((await api(q.tripId, q.input, other)).status, 404);
  assert.equal(
    (await api(q.tripId, q.input, seed.cookie, "https://outside.example"))
      .status,
    403,
  );
  assert.equal(
    (await api(q.tripId, { ...q.input, amount: "1.00" })).status,
    400,
  );
  assert.equal(
    (await api(q.tripId, { action: "captured", success: true })).status,
    400,
  );
  assert.equal(
    (await api(q.tripId, { ...q.input, walletVersion: 0 })).status,
    409,
  );
  const bad = await newQuote("6.00");
  assert.equal((await api(bad.tripId, bad.input)).status, 422);
  assert.equal(fake.writes.length, start);
  const [a, b] = await Promise.all([
    api(q.tripId, q.input),
    api(q.tripId, q.input),
  ]).then((r) => Promise.all(r.map(json)));
  assert.equal(a.bookingId, b.bookingId);
  assert.equal(fake.writes.length, start + 1);
  const c = await status(q.tripId);
  assert.equal(c.bookings[0].activityId, q.activityId);
  assert.ok(c.bookings[0].orderId);
  guarded = {
    tripId: q.tripId,
    bookingId: a.bookingId,
    orderId: c.bookings[0].orderId,
  };
  assert.equal(c.bookings[0].payment.capturedMinor, 0);
  assert.ok(!JSON.stringify(c).includes(sandboxFixtureConfig.secret));
  const w = await app.wallet.read(seed.userId, q.tripId);
  await assert.rejects(
    app.wallet.action(seed.userId, q.tripId, {
      action: "cancel_intent",
      walletVersion: w.version,
      mutationId: randomUUID(),
      intentId: q.input.intentId,
    }),
    { status: 409 },
  );
});

test("only verified associated amount, currency, merchant and local reference can be captured", async () => {
  const { tripId, bookingId, orderId } = guarded;
  const q = { tripId },
    o = {
      orderId,
      bookingId,
      captureInput: { action: "capture", bookingId, orderId },
    };
  const before = fake.writes.length;
  assert.equal(
    (await api(q.tripId, { ...o.captureInput, orderId: "FOREIGN-ORDER" }))
      .status,
    422,
  );
  assert.equal((await api(q.tripId, o.captureInput, other)).status, 404);
  assert.equal((await api(q.tripId, o.captureInput)).status, 409);
  approve(o.orderId);
  const unit = fake.orders.get(o.orderId).purchase_units[0];
  const wrong = [
    { amount: { currency_code: "USD", value: "0.01" } },
    { amount: { currency_code: "EUR", value: "5.00" } },
    { payee: { merchant_id: "OTHER-MERCHANT" } },
    { custom_id: randomUUID() },
  ];
  for (const override of wrong) {
    const original = { ...unit };
    Object.assign(unit, override);
    await seed.connection.db
      .update(paypalBooking)
      .set({ lastReconciledAt: null })
      .where(eq(paypalBooking.id, o.bookingId));
    assert.equal((await api(q.tripId, o.captureInput)).status, 503);
    Object.assign(unit, original);
  }
  assert.equal(fake.writes.length, before);
});

test("verified capture appends once, retains the original USD charge and estimated EUR without rewriting the itinerary", async () => {
  const q = await newQuote(),
    o = await ordered(q);
  approve(o.orderId);
  const before = fake.writes.length;
  const itinerary = (await app.trips.read(seed.userId, q.tripId)).itinerary;
  const w = await app.wallet.read(seed.userId, q.tripId);
  const results = await Promise.all([
    api(q.tripId, o.captureInput),
    api(q.tripId, o.captureInput),
  ]);
  await Promise.all(results.map(json));
  assert.equal(fake.writes.length, before + 1);
  const b = (await status(q.tripId)).bookings[0];
  assert.equal(b.payment.capturedMinor, 500);
  assert.equal(b.payment.feeMinor, 30);
  assert.equal(b.estimatedMinor, 400);
  assert.equal(
    b.operations.find((op) => op.kind === "capture")?.settlement?.net_amount,
    "4.70 USD",
  );
  const updated = await app.wallet.read(seed.userId, q.tripId);
  assert.equal(updated.summary.actualHomeMinor, 400);
  assert.equal(updated.summary.projectedMinor, w.summary.projectedMinor);
  assert.equal(updated.events.filter((e) => e.kind === "captured").length, 1);
  assert.deepEqual(
    (await app.trips.read(seed.userId, q.tripId)).itinerary,
    itinerary,
  );
  const event = updated.events.find((e) => e.kind === "captured")!;
  assert.equal(event.originalCurrency, "USD");
  assert.equal(event.outcome?.verification, "provider-api");
  assert.equal(event.outcome?.chargedMinor, 500);
  assert.equal(
    (await api(q.tripId, refund(o.bookingId, "1.00"), other)).status,
    404,
  );
  paidTrip = q.tripId;
  paidBooking = o.bookingId;
});

test("partial and full refund reviews use exact USD balances and are idempotent across concurrent requests", async () => {
  const before = fake.writes.length;
  assert.equal((await api(paidTrip, refund(paidBooking, "5.01"))).status, 422);
  assert.equal((await api(paidTrip, refund(paidBooking, "5.00"))).status, 409);
  assert.equal((await api(paidTrip, refund(paidBooking, "2.001"))).status, 422);
  const partial = refund(paidBooking, "2.00");
  await Promise.all(
    [api(paidTrip, partial), api(paidTrip, partial)].map(async (p) =>
      json(await p),
    ),
  );
  assert.equal(fake.writes.length, before + 1);
  assert.equal(
    (await api(paidTrip, { ...partial, amount: "1.00" })).status,
    409,
  );
  const w = await app.wallet.read(seed.userId, paidTrip);
  assert.equal(w.summary.actualHomeMinor, 240);
  assert.equal((await api(paidTrip, refund(paidBooking, "4.00"))).status, 409);
  assert.equal(
    (await api(paidTrip, refund(paidBooking, "2.00", "full"))).status,
    409,
  );
  await json(await api(paidTrip, refund(paidBooking, "3.00", "full")));
  assert.equal(fake.writes.length, before + 2);
  assert.equal((await status(paidTrip)).bookings[0].payment.status, "refunded");
  assert.equal(
    (await app.wallet.read(seed.userId, paidTrip)).summary.actualHomeMinor,
    0,
  );
});

test("declined capture remains failed; lost create can be verified by a signed order notification", async () => {
  const q = await newQuote(),
    o = await ordered(q);
  approve(o.orderId);
  fake.switches.declineCapture = true;
  try {
    await json(await api(q.tripId, o.captureInput));
  } finally {
    fake.switches.declineCapture = false;
  }
  assert.equal(
    (await status(q.tripId)).bookings[0].operations.find(
      (op) => op.kind === "capture",
    )?.status,
    "failed",
  );
  assert.equal(
    (await app.wallet.read(seed.userId, q.tripId)).summary.actualHomeMinor,
    0,
  );
  const lost = await newQuote();
  fake.switches.loseOrder = true;
  let result;
  try {
    result = await json(await api(lost.tripId, lost.input));
  } finally {
    fake.switches.loseOrder = false;
  }
  assert.equal(result.orderId, null);
  const order = Array.from(fake.orders.values()).at(-1);
  const before = fake.writes.length;
  const replay = await json(await api(lost.tripId, lost.input));
  assert.equal(replay.orderId, null);
  const notification = "EVENT-" + randomUUID();
  await assert.rejects(
    signed(
      "CHECKOUT.ORDER.APPROVED",
      { id: order.id },
      notification,
      "invalid",
    ),
    { status: 401 },
  );
  assert.equal((await status(lost.tripId)).bookings[0].orderId, null);
  approve(order.id);
  await signed("CHECKOUT.ORDER.APPROVED", { id: order.id }, notification);
  await signed("CHECKOUT.ORDER.APPROVED", { id: order.id }, notification);
  assert.equal((await status(lost.tripId)).bookings[0].orderId, order.id);
  assert.equal(fake.writes.length, before);
  assert.equal(
    (
      await seed.connection.db
        .select()
        .from(paypalWebhookReceipt)
        .where(eq(paypalWebhookReceipt.id, notification))
    ).length,
    1,
  );
});

test("ambiguous capture and refund recover from verified reads, with no additional POST or duplicate ledger entry", async () => {
  const q = await newQuote(),
    o = await ordered(q);
  approve(o.orderId);
  fake.switches.loseCapture = true;
  try {
    await json(await api(q.tripId, o.captureInput));
  } finally {
    fake.switches.loseCapture = false;
  }
  assert.equal(
    (await status(q.tripId)).bookings[0].operations.find(
      (op) => op.kind === "capture",
    )?.status,
    "uncertain",
  );
  const before = fake.writes.length;
  await json(await api(q.tripId, o.captureInput));
  await seed.connection.db
    .update(paypalBooking)
    .set({ lastReconciledAt: null })
    .where(eq(paypalBooking.id, o.bookingId));
  await json(
    await api(q.tripId, { action: "reconcile", bookingId: o.bookingId }),
  );
  assert.equal(fake.writes.length, before);
  fake.switches.loseRefund = true;
  fake.switches.nextRefundStatus = "PENDING";
  const r = refund(o.bookingId, "2.00");
  try {
    await json(await api(q.tripId, r));
  } finally {
    fake.switches.loseRefund = false;
    fake.switches.nextRefundStatus = "COMPLETED";
  }
  const ref = Array.from(fake.refunds.values()).at(-1);
  assert.equal(
    (await status(q.tripId)).bookings[0].operations.find(
      (op) => op.id === r.mutationId,
    )?.status,
    "uncertain",
  );
  await json(await api(q.tripId, r));
  assert.equal((await api(q.tripId, refund(o.bookingId, "4.00"))).status, 409);
  const terminalEvent = "EVENT-" + randomUUID();
  await assert.rejects(
    signed("PAYMENT.CAPTURE.REFUNDED", { id: ref.id }, terminalEvent),
    { status: 503 },
  );
  assert.equal(
    (
      await seed.connection.db
        .select()
        .from(paypalWebhookReceipt)
        .where(eq(paypalWebhookReceipt.id, terminalEvent))
    ).length,
    0,
  );
  // A completed lookup may arrive first. A delayed pending notification
  // still retrieves the current resource, rather than reversing history.
  ref.status = "COMPLETED";
  await signed(
    "PAYMENT.CAPTURE.REFUNDED",
    {
      id: ref.id,
      amount: { value: "500.00", currency_code: "EUR" },
    },
    terminalEvent,
  );
  await signed("PAYMENT.REFUND.PENDING", { id: ref.id, status: "PENDING" });
  const w = await app.wallet.read(seed.userId, q.tripId);
  assert.equal(w.summary.actualHomeMinor, 240);
  assert.equal(w.events.filter((e) => e.kind === "refund_completed").length, 1);
  assert.equal(
    w.events.find((e) => e.kind === "refund_completed")?.verification,
    "verified-webhook",
  );
  assert.equal(fake.writes.length, before + 1);
});

test("pending refund failure releases the reservation; an unrelated refund resource cannot alter totals", async () => {
  // The established capture is fully refunded, so use a distinct booking.
  const q = await newQuote(),
    o = await ordered(q);
  approve(o.orderId);
  await json(await api(q.tripId, o.captureInput));
  fake.switches.nextRefundStatus = "PENDING";
  try {
    await json(await api(q.tripId, refund(o.bookingId, "1.00")));
  } finally {
    fake.switches.nextRefundStatus = "COMPLETED";
  }
  const ref = Array.from(fake.refunds.values()).at(-1);
  const b = (await status(q.tripId)).bookings[0];
  assert.equal(b.payment.pendingRefundMinor, 100);
  assert.equal(b.payment.netMinor, 500);
  const original = ref.links;
  ref.links = [
    {
      rel: "up",
      href: "https://api-m.sandbox.paypal.com/v2/payments/captures/FOREIGN",
    },
  ];
  await assert.rejects(signed("PAYMENT.REFUND.FAILED", { id: ref.id }), {
    status: 503,
  });
  ref.links = original;
  ref.status = "FAILED";
  await signed("PAYMENT.REFUND.FAILED", { id: ref.id });
  const restored = (await status(q.tripId)).bookings[0];
  assert.equal(restored.payment.pendingRefundMinor, 0);
  assert.equal(restored.refundableMinor, 500);
  assert.equal(
    restored.operations.find((o) => o.providerId === ref.id)?.status,
    "failed",
  );
  assert.equal(
    (await app.wallet.read(seed.userId, q.tripId)).summary.actualHomeMinor,
    400,
  );
});

test("payment audit, refund history and ownership survive database reopening without provider credentials", async () => {
  const before = fake.writes.length;
  await seed.close();
  const db = await openDatabase({ directory: seed.directory });
  try {
    app = createApplication(db.db, seed.config);
    const saved = await status(paidTrip);
    assert.equal(saved.clientId, null);
    assert.equal(saved.bookings[0].payment.status, "refunded");
    assert.equal(
      saved.bookings[0].operations.filter((o) => o.kind === "refund").length,
      2,
    );
    assert.equal((await api(paidTrip, undefined, other)).status, 404);
    assert.equal(
      (await api(paidTrip, { action: "reconcile", bookingId: paidBooking }))
        .status,
      503,
    );
    assert.equal(fake.writes.length, before);
  } finally {
    await db.close();
  }
});

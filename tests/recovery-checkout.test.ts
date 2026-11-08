import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import { before, after, mock, test } from "node:test";
import { eq } from "drizzle-orm";
import { createApplication } from "../src/server/application";
import { createWallet } from "../src/server/wallet";
import { createCommerce } from "../src/server/paypal-commerce";
import { createPayPalClient } from "../src/server/paypal-client";
import { openDatabase } from "../src/server/db/connection";
import {
  trip,
  walletIntent,
  recoveryCase,
  recoveryAttempt,
  financialEvent,
} from "../src/server/db/schema";
import { prepareOfflineSolReview } from "./helpers/offline-sol-review";
import { recoveryFixture } from "./helpers/recovery-fixture.mjs";
import {
  fakeSandbox,
  sandboxFixtureConfig,
} from "./helpers/paypal-sandbox.mjs";
import { solRecording } from "./helpers/sol-recording";

let seed: Awaited<ReturnType<typeof prepareOfflineSolReview>>;
let app: ReturnType<typeof createApplication>;
let directory: string;
const fake = fakeSandbox();
const paypal = createPayPalClient(sandboxFixtureConfig, fake.transport);
const fxFetch = async () =>
  Response.json({
    base: "USD",
    quote: "EUR",
    date: new Date().toISOString().slice(0, 10),
    rate: 0.89566,
  });
const model = {
  name: "offline-recovery-checkout",
  propose: async () => {
    throw Error("No generation");
  },
  generate: async () => {
    throw Error("No generation");
  },
  recover: async (input: unknown) => {
    const raw = recoveryFixture(input);
    return {
      alternatives: [
        {
          ...raw.alternatives[0],
          action: {
            ...raw.alternatives[0].action,
            title: "Self-guided literary and architecture stroll",
            costMinor: 400,
          },
        },
      ],
    };
  },
};
before(async () => {
  mock.method(globalThis, "fetch", async () => {
    throw Error("Live requests prohibited");
  });
  directory = await mkdtemp(path.resolve(".test-data/recovery-checkout-"));
  seed = await prepareOfflineSolReview(directory, "http://localhost:3000");
  await seed.worker();
  app = createApplication(seed.connection.db, {
    ...seed.config,
    model,
    fxFetch,
    paypal,
    recoverySimulation: true,
    generationLimits: { perMinute: 100, perDay: 100, perUserHour: 100 },
  });
});
after(async () => {
  await seed.close();
  mock.restoreAll();
});
async function quote(
  id: string,
  activityId: string,
  caseId?: string,
  wallet = app.wallet,
  reference?: Awaited<ReturnType<typeof app.wallet.read>>["intents"][number],
) {
  const current = await wallet.read(seed.userId, id);
  const input = {
    activityId,
    ...(caseId ? { recoveryCaseId: caseId } : {}),
    ...(reference ? { refreshIntentId: reference.id } : {}),
    amount: "5.00",
    currency: "USD",
    supplier: "Offline Sandbox demo — no supplier reservation",
    itineraryVersion: current.itineraryVersion,
    walletVersion: current.version,
  };
  const result = await wallet.action(seed.userId, id, {
    ...input,
    action: "preview_quote",
  });
  assert.ok(result.preview);
  return {
    input,
    preview: result.preview,
    request: {
      ...input,
      action: "save_quote",
      mutationId: randomUUID(),
      fxSnapshotId: result.preview.fx.snapshot.id,
    },
  };
}
async function checkout(id: string, intentId: string, capture = true) {
  const state = await app.commerce.read(seed.userId, id);
  const request = {
    action: "checkout",
    intentId,
    walletVersion: state.walletVersion,
    itineraryVersion: state.itineraryVersion,
  };
  const result = await app.commerce.action(seed.userId, id, request);
  assert.ok(result.orderId);
  if (capture) {
    fake.orders.get(result.orderId).status = "APPROVED";
    await app.commerce.action(seed.userId, id, {
      action: "capture",
      bookingId: result.bookingId,
      orderId: result.orderId,
    });
  }
  return { ...result, request };
}
async function ready(refunded = true) {
  const draft = await app.trips.openDraft(seed.userId, {});
  const { id } = await app.trips.complete(seed.userId, draft.id, {
    version: draft.version,
    data: solRecording.intent,
  });
  // Use the validated, normalized fixture, never a new live model call.
  const original = (await app.trips.read(seed.userId, seed.trip.id)).itinerary!;
  await seed.connection.db
    .update(trip)
    .set({ itinerary: original })
    .where(eq(trip.id, id));
  const activity = original.days[1].activities[2];
  await app.itineraryEditor.commit(seed.userId, id, {
    version: 0,
    mutationId: randomUUID(),
    operation: {
      action: "update",
      activityId: activity.id,
      dayId: original.days[1].id,
      data: {
        title: activity.title,
        description: activity.description + " Offline QA review.",
        category: "culture",
        currency: "EUR",
        links: activity.links ?? [],
        location: activity.location,
        latitude: activity.latitude,
        longitude: activity.longitude,
        startMinute: activity.startMinute,
        durationMinutes: activity.durationMinutes,
        bufferBeforeMinutes: activity.bufferBeforeMinutes,
        costMinor: activity.costMinor,
      },
    },
  });
  const initial = await quote(id, activity.id);
  const saved = await app.wallet.action(seed.userId, id, initial.request);
  const booking = await checkout(id, saved.state!.intents[0].id);
  const canceled = await app.recovery.action(seed.userId, id, {
    action: "simulate",
    bookingId: booking.bookingId,
    reason: "Offline simulated supplier cancellation",
  });
  const entry = canceled.state.cases[0];
  const queued = await app.recovery.action(seed.userId, id, {
    action: "suggest",
    caseId: entry.id,
    mutationId: randomUUID(),
    preferences: "Culture",
  });
  await app.recovery.run(seed.userId, id, entry.id, queued.queued!.attemptId);
  const review = (await app.recovery.read(seed.userId, id)).cases[0]
    .attempts[0];
  assert.equal(
    review.options.length,
    1,
    JSON.stringify({ error: review.error, findings: review.findings }),
  );
  await app.recovery.action(seed.userId, id, {
    action: "apply",
    caseId: entry.id,
    attemptId: review.id,
    optionId: review.options[0].id,
    acknowledgeUnverified: true,
  });
  const refund = {
    action: "refund",
    bookingId: booking.bookingId,
    mutationId: randomUUID(),
    amount: "5.00",
    mode: "full",
  };
  if (refunded) await app.commerce.action(seed.userId, id, refund);
  return {
    id,
    caseId: entry.id,
    replacement: review.options[0].replacementActivityId!,
    originalBookingId: booking.bookingId,
    refund,
  };
}
let main: Awaited<ReturnType<typeof ready>>;
let savedQuote: Awaited<ReturnType<typeof app.wallet.read>>["intents"][number];

test("recovery checkout preserves EUR 4, revision 3, EUR 222 and reserve; native USD 5 converts to EUR 4.48 independently", async () => {
  main = await ready();
  const before = await app.itineraryEditor.read(seed.userId, main.id);
  const events = (await app.wallet.read(seed.userId, main.id)).events;
  assert.equal(before.version, 3);
  const preview = await quote(main.id, main.replacement, main.caseId);
  assert.equal(preview.preview.convertedMinor, 448);
  assert.equal(preview.preview.beforeBudget.remainingMinor, 22200);
  assert.deepEqual(preview.preview.afterBudget, preview.preview.beforeBudget);
  const saved = await app.wallet.action(seed.userId, main.id, preview.request);
  assert.equal(saved.itineraryChanged, false);
  assert.deepEqual(
    await app.itineraryEditor.read(seed.userId, main.id),
    before,
  );
  savedQuote = saved.state!.intents.find(
    (i) => i.activityId === main.replacement,
  )!;
  assert.equal(savedQuote.purpose, "recovery-checkout");
  assert.equal(savedQuote.planningEstimateMinor, 400);
  assert.equal(savedQuote.estimatedDisplayMinor, 448);
  assert.equal(savedQuote.staleActivity, false);
  assert.equal(saved.state!.summary.actualHomeMinor, 0);
  assert.equal(saved.state!.budget.reserveMinor, 25000);
  assert.equal(saved.state!.budget.remainingMinor, 22200);
  assert.deepEqual(saved.state!.events.slice(0, events.length), events);
  assert.equal(saved.state!.events.at(-1)!.amountMinor, 0);
  assert.equal(
    (await app.commerce.read(seed.userId, main.id)).quotes[0].id,
    savedQuote.id,
  );
  const duplicate = await app.wallet.action(
    seed.userId,
    main.id,
    preview.request,
  );
  assert.equal(duplicate.itineraryChanged, false);
  assert.equal(duplicate.state!.intents.length, 2);
  await assert.rejects(quote(main.id, main.replacement, main.caseId), {
    status: 409,
  });
});

test("authenticated HTTP quote requests reject foreign owners, origins, manipulated currency/price and unrelated cases", async () => {
  const data = {
    action: "preview_quote",
    recoveryCaseId: main.caseId,
    activityId: main.replacement,
    amount: "6.00",
    currency: "USD",
    supplier: "demo",
    itineraryVersion: 3,
    walletVersion: (await app.wallet.read(seed.userId, main.id)).version,
  };
  const request = (body: unknown, cookie = seed.cookie, origin = seed.origin) =>
    new Request(seed.origin + "/api/trips/" + main.id + "/wallet", {
      method: "POST",
      headers: { origin, cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await app.walletHandler(request(data, ""), main.id)).status,
    401,
  );
  assert.equal(
    (
      await app.walletHandler(
        request(data, seed.cookie, "https://evil.invalid"),
        main.id,
      )
    ).status,
    403,
  );
  assert.equal((await app.walletHandler(request(data), main.id)).status, 422);
  assert.equal(
    (
      await app.walletHandler(
        request({ ...data, amount: "5.00", currency: "EUR" }),
        main.id,
      )
    ).status,
    422,
  );
  await assert.rejects(app.wallet.action("foreign-owner", main.id, data), {
    status: 404,
  });
  await assert.rejects(
    app.wallet.action(seed.userId, main.id, {
      ...data,
      amount: "5.00",
      recoveryCaseId: randomUUID(),
    }),
    { status: 404 },
  );
  const commerceRequest = {
    action: "checkout",
    intentId: savedQuote.id,
    amount: "0.01",
    walletVersion: data.walletVersion,
    itineraryVersion: 3,
  };
  const response = await app.commerceHandler(request(commerceRequest), main.id);
  assert.equal(response.status, 400);
});

test("expired recovery FX blocks checkout; refresh appends on the same quote without itinerary edits", async () => {
  const future = Date.now() + 3_700_000;
  const wallet = createWallet(seed.connection.db, {
    fxFetch,
    clock: () => future,
    recoveryMerchantId: sandboxFixtureConfig.merchantId,
  });
  const commerce = createCommerce(seed.connection.db, wallet, paypal);
  const stale = await wallet.read(seed.userId, main.id);
  assert.equal(
    stale.intents.find((i) => i.id === savedQuote.id)!.fxStale,
    true,
  );
  const writes = fake.writes.length;
  await assert.rejects(
    commerce.action(seed.userId, main.id, {
      action: "checkout",
      intentId: savedQuote.id,
      itineraryVersion: 3,
      walletVersion: stale.version,
    }),
    { status: 422 },
  );
  assert.equal(fake.writes.length, writes);
  const before = await app.itineraryEditor.read(seed.userId, main.id);
  const preview = await quote(
    main.id,
    main.replacement,
    main.caseId,
    wallet,
    savedQuote,
  );
  const updated = await wallet.action(seed.userId, main.id, preview.request);
  assert.equal(updated.itineraryChanged, false);
  savedQuote = updated.state!.intents.find((i) => i.id === savedQuote.id)!;
  assert.equal(savedQuote.fxStale, false);
  assert.equal(updated.state!.events.at(-1)!.kind, "intent_fx_refreshed");
  assert.equal(updated.state!.events.at(-1)!.amountMinor, 0);
  assert.deepEqual(
    await app.itineraryEditor.read(seed.userId, main.id),
    before,
  );
});

test("mocked capture uses one order/capture; actual EUR 4.48 covers EUR 4 once without rewriting planned EUR 222", async () => {
  const before = await app.itineraryEditor.read(seed.userId, main.id);
  const writes = fake.writes.length;
  const created = await checkout(main.id, savedQuote.id);
  await app.commerce.action(seed.userId, main.id, created.request);
  await app.commerce.action(seed.userId, main.id, {
    action: "capture",
    bookingId: created.bookingId,
    orderId: created.orderId,
  });
  assert.equal(fake.writes.length, writes + 2);
  const wallet = await app.wallet.read(seed.userId, main.id);
  assert.equal(wallet.summary.actualHomeMinor, 448);
  assert.equal(wallet.budget.remainingMinor, 22200);
  assert.equal(wallet.budget.reserveMinor, 25000);
  assert.equal(wallet.summary.projectedMinor, 202848);
  assert.equal(wallet.summary.projectedRemainingMinor, 22152);
  assert.equal(wallet.events.filter((e) => e.kind === "captured").length, 2);
  assert.equal(
    wallet.events.filter((e) => e.kind === "refund_completed").length,
    1,
  );
  assert.deepEqual(
    await app.itineraryEditor.read(seed.userId, main.id),
    before,
  );
  const recovery = await app.recovery.read(seed.userId, main.id);
  assert.equal(recovery.cases[0].replacement!.id, created.bookingId);
  assert.notEqual(created.bookingId, main.originalBookingId);
});

test("unrefunded originals, stale concurrent revisions and finished cases cannot create replacement quotes", async () => {
  const item = await ready(false);
  await assert.rejects(quote(item.id, item.replacement, item.caseId), {
    status: 409,
  });
  await app.commerce.action(seed.userId, item.id, item.refund);
  const preview = await quote(item.id, item.replacement, item.caseId);
  const saved = await app.itineraryEditor.read(seed.userId, item.id);
  await app.itineraryEditor.commit(seed.userId, item.id, {
    version: 3,
    mutationId: randomUUID(),
    operation: { action: "restore", editId: saved.history[0].id },
  });
  await assert.rejects(
    app.wallet.action(seed.userId, item.id, preview.request),
    { status: 409 },
  );
  await assert.rejects(quote(item.id, item.replacement, item.caseId), {
    status: 422,
  });
  const finished = await ready();
  const pending = await quote(
    finished.id,
    finished.replacement,
    finished.caseId,
  );
  const prepared = await app.wallet.action(
    seed.userId,
    finished.id,
    pending.request,
  );
  await app.recovery.action(seed.userId, finished.id, {
    action: "finish",
    caseId: finished.caseId,
  });
  await assert.rejects(
    quote(finished.id, finished.replacement, finished.caseId),
    { status: 409 },
  );
  const freshState = await app.itineraryEditor.read(seed.userId, finished.id);
  await app.itineraryEditor.commit(seed.userId, finished.id, {
    version: 3,
    mutationId: randomUUID(),
    operation: { action: "restore", editId: freshState.history[0].id },
  });
  const noLongerEligible = await app.commerce.read(seed.userId, finished.id);
  assert.equal(noLongerEligible.quotes.length, 0);
  const writes = fake.writes.length;
  await assert.rejects(
    app.commerce.action(seed.userId, finished.id, {
      action: "checkout",
      intentId: prepared.state!.intents.find(
        (i) => i.recoveryCaseId === finished.caseId,
      )!.id,
      itineraryVersion: noLongerEligible.itineraryVersion,
      walletVersion: noLongerEligible.walletVersion,
    }),
    { status: 422 },
  );
  assert.equal(fake.writes.length, writes);
});

test("checkout quote, original refund, approval audits and estimates survive reopening with immutable association", async () => {
  const wallet = await app.wallet.read(seed.userId, main.id);
  const editor = await app.itineraryEditor.read(seed.userId, main.id);
  const recovery = await app.recovery.read(seed.userId, main.id);
  await assert.rejects(
    seed.connection.db
      .update(walletIntent)
      .set({ planningEstimateMinor: 448 })
      .where(eq(walletIntent.id, savedQuote.id)),
  );
  await seed.close();
  const reopened = await openDatabase({ directory });
  try {
    await reopened.migrate();
    const restored = createApplication(reopened.db, {
      ...seed.config,
      paypal,
      model,
      fxFetch,
      recoverySimulation: true,
    });
    assert.deepEqual(await restored.wallet.read(seed.userId, main.id), wallet);
    assert.deepEqual(
      await restored.itineraryEditor.read(seed.userId, main.id),
      editor,
    );
    assert.deepEqual(
      await restored.recovery.read(seed.userId, main.id),
      recovery,
    );
    assert.equal((await reopened.db.select().from(recoveryCase)).length, 3);
    assert.equal(
      (await reopened.db.select().from(recoveryAttempt)).filter(
        (r) => r.status === "applied",
      ).length,
      3,
    );
    assert.ok(
      (await reopened.db.select().from(financialEvent)).some(
        (e) => e.kind === "refund_completed",
      ),
    );
  } finally {
    await reopened.close();
  }
});

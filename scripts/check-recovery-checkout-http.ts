// Production HTTP integration; every model/payment/FX response is intercepted
// by the explicit isolated QA preloader. No browser or live provider is used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sandboxFixtureConfig } from "../tests/helpers/paypal-sandbox.mjs";

const qa = JSON.parse(
  await readFile(".test-data/recovery-qa-server.json", "utf8"),
);
assert.equal(qa.origin, "http://127.0.0.1:3003");
assert.match(qa.directory, /paypal-ui-review-recovery-/);
await assert.rejects(fetch(qa.origin, { signal: AbortSignal.timeout(2000) }));
const server = spawn(
  process.execPath,
  [
    "--import",
    "tsx",
    "--import",
    "./scripts/recovery-qa-transport.mjs",
    "node_modules/next/dist/bin/next",
    "start",
    "-H",
    "127.0.0.1",
    "-p",
    "3003",
  ],
  {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      APP_URL: qa.origin,
      AUTH_SECRET: qa.secret,
      DATABASE_URL: "",
      DIRECT_URL: "",
      DATABASE_DRIVER: "pglite",
      LOCAL_DATABASE_PATH: qa.directory,
      ALLOW_LOCAL_DATABASE: "true",
      OPENAI_API_KEY: "blocked-paypal-qa-only",
      GEMINI_API_KEY: "blocked-paypal-qa-only",
      AUTH_GOOGLE_ID: "",
      AUTH_GOOGLE_SECRET: "",
      AI_PROVIDER: "openai",
      OPENAI_MODEL: "gpt-6.1-sol",
      PAYPAL_ENVIRONMENT: "sandbox",
      ENABLE_DEMO_MERCHANT: "true",
      PAYPAL_CLIENT_ID: sandboxFixtureConfig.clientId,
      PAYPAL_CLIENT_SECRET: sandboxFixtureConfig.secret,
      PAYPAL_MERCHANT_ID: sandboxFixtureConfig.merchantId,
      PAYPAL_WEBHOOK_ID: sandboxFixtureConfig.webhookId,
      TRAVELRELAY_PAYPAL_QA: "true",
      TRAVELRELAY_RECOVERY_QA: "true",
      ENABLE_RECOVERY_SIMULATION: "true",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
);
let logs = "",
  checks = 0;
server.stdout.on("data", (c) => {
  logs = (logs + c).slice(-4000);
});
server.stderr.on("data", (c) => {
  logs = (logs + c).slice(-4000);
});
const equal = (a: unknown, b: unknown) => {
  assert.deepEqual(a, b);
  checks++;
};
const ok = (v: unknown) => {
  assert.ok(v);
  checks++;
};
try {
  for (let i = 0; i < 150 && !logs.includes("Ready"); i++) {
    if (server.exitCode !== null) throw Error("Isolated QA server exited");
    await delay(200);
  }
  ok(logs.includes("Ready"));
  const login = await fetch(qa.origin + "/api/auth/sign-in/email", {
    method: "POST",
    headers: { origin: qa.origin, "content-type": "application/json" },
    body: JSON.stringify({ email: qa.email, password: qa.password }),
  });
  equal(login.status, 200);
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join(";");
  const base = `/api/trips/${qa.tripId}`;
  const req = (
    kind: string,
    data?: object,
    auth = cookie,
    origin = qa.origin,
  ) =>
    fetch(qa.origin + base + "/" + kind, {
      method: data ? "POST" : "GET",
      headers: { cookie: auth, origin, "content-type": "application/json" },
      body: data ? JSON.stringify(data) : undefined,
    });
  const json = async (kind: string, data?: object) => {
    const response = await req(kind, data);
    equal(response.status, 200);
    equal(response.headers.get("cache-control"), "no-store");
    return response.json();
  };
  const unpaid = await json("wallet");
  const buy = async (intentId: string) => {
    const state = await json("commerce");
    const create = {
      action: "checkout",
      intentId,
      walletVersion: state.walletVersion,
      itineraryVersion: state.itineraryVersion,
    };
    const order = await json("commerce", create);
    ok(order.orderId);
    const again = await json("commerce", create);
    equal(again.bookingId, order.bookingId);
    await json("commerce", {
      action: "capture",
      bookingId: order.bookingId,
      orderId: order.orderId,
    });
    return order.bookingId;
  };
  const bookingId = await buy(unpaid.intents[0].id);
  const canceled = await json("recovery", {
    action: "simulate",
    bookingId,
    reason: "Offline HTTP QA simulated cancellation",
  });
  const caseId = canceled.cases[0].id;
  const queued = await req("recovery", {
    action: "suggest",
    caseId,
    mutationId: randomUUID(),
    preferences: "Culture and Food",
  });
  equal(queued.status, 202);
  let review;
  for (let i = 0; i < 100; i++) {
    const s = await json("recovery");
    review = s.cases[0].attempts[0];
    if (review.status === "ready" || review.status === "failed") break;
    await delay(200);
  }
  equal(review.status, "ready");
  const selected = review.options.find(
    (o: { kind: string }) => o.kind === "similar",
  );
  const applied = await json("recovery", {
    action: "apply",
    caseId,
    attemptId: review.id,
    optionId: selected.id,
    acknowledgeUnverified: true,
  });
  equal(applied.cases[0].phase, "itinerary_updated");
  await json("commerce", {
    action: "refund",
    bookingId,
    mutationId: randomUUID(),
    amount: "5.00",
    mode: "full",
  });
  const before = await json("wallet");
  const input = {
    recoveryCaseId: caseId,
    activityId: applied.cases[0].replacementActivityId,
    amount: "5.00",
    currency: "USD",
    supplier: "Offline Sandbox replacement only",
    itineraryVersion: before.itineraryVersion,
    walletVersion: before.version,
  };
  equal(
    (await req("wallet", { action: "preview_quote", ...input }, "")).status,
    401,
  );
  equal(
    (
      await req(
        "wallet",
        { action: "preview_quote", ...input },
        cookie,
        "https://outside.invalid",
      )
    ).status,
    403,
  );
  equal(
    (await req("wallet", { action: "preview_quote", ...input, amount: "0.01" }))
      .status,
    422,
  );
  const preview = await json("wallet", { action: "preview_quote", ...input });
  equal(preview.preview.afterBudget, before.budget);
  const save = {
    action: "save_quote",
    ...input,
    mutationId: randomUUID(),
    fxSnapshotId: preview.preview.fx.snapshot.id,
  };
  const saved = await json("wallet", save);
  equal(saved.itineraryChanged, false);
  equal(saved.state.itineraryVersion, before.itineraryVersion);
  equal(saved.state.budget, before.budget);
  const repeated = await json("wallet", save);
  equal(repeated.state.intents.length, 2);
  const quote = saved.state.intents.find(
    (i: { recoveryCaseId: string }) => i.recoveryCaseId === caseId,
  );
  equal(quote.purpose, "recovery-checkout");
  equal((await json("commerce")).quotes[0].id, quote.id);
  const newBooking = await buy(quote.id);
  ok(newBooking !== bookingId);
  const after = await json("wallet");
  equal(after.budget, before.budget);
  equal(after.itineraryVersion, before.itineraryVersion);
  equal(after.summary.native[0].netMinor, 500);
  equal(
    after.events.filter((e: { kind: string }) => e.kind === "captured").length,
    2,
  );
  equal(
    after.events.filter((e: { kind: string }) => e.kind === "refund_completed")
      .length,
    1,
  );
  const recovery = await json("recovery");
  equal(recovery.cases[0].replacement.id, newBooking);
  equal(recovery.cases[0].payment.payment.refundedMinor, 500);
  await writeFile(
    ".test-data/recovery-checkout-http-result.json",
    JSON.stringify({
      status: "PASS",
      checks,
      mode: "isolated production HTTP with mocked model/PayPal/FX only",
      liveProviderCalls: 0,
      noOriginalDatabaseAccess: true,
    }),
  );
  console.log(
    `PASS: ${checks} isolated production HTTP assertions; no live model, PayPal or FX requests.`,
  );
} finally {
  server.kill();
}

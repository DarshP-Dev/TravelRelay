import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const qa = JSON.parse(
  await readFile(".test-data/paypal-qa-server.json", "utf8"),
);
assert.equal(new URL(qa.origin).hostname, "127.0.0.1");
assert.match(qa.directory, /paypal-ui-review-/);
let assertions = 0;
const equal = (a: unknown, b: unknown) => {
  assert.deepEqual(a, b);
  assertions++;
};
const ok = (value: unknown) => {
  assert.ok(value);
  assertions++;
};
const body = (data: object) => JSON.stringify(data);
const cookies = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join(";");
const headers = { origin: qa.origin, "content-type": "application/json" };
const login = await fetch(qa.origin + "/api/auth/sign-in/email", {
  method: "POST",
  headers,
  body: body({ email: qa.email, password: qa.password }),
});
equal(login.status, 200);
const cookie = cookies(login);
const base = qa.origin + "/api/trips/" + qa.tripId;
const req = (input?: object, auth = cookie, origin = qa.origin) =>
  fetch(base + "/commerce", {
    method: input ? "POST" : "GET",
    headers: { ...headers, cookie: auth, origin },
    body: input ? body(input) : undefined,
  });
const wallet = () =>
  fetch(base + "/wallet", { headers: { cookie } }).then((r) => r.json());
async function json(r: Response) {
  equal(r.status, 200);
  equal(r.headers.get("cache-control"), "no-store");
  return r.json();
}
const original = await wallet();
equal((await req(undefined, "")).status, 401);
equal(
  (
    await req(
      { action: "reconcile", bookingId: randomUUID() },
      cookie,
      "https://outside.example",
    )
  ).status,
  403,
);
equal(
  (
    await req({
      action: "capture",
      bookingId: randomUUID(),
      orderId: "SYNTHETIC",
      amount: 1,
    })
  ).status,
  400,
);
const initial = await json(await req());
equal(initial.quotes.length, 1);
equal(initial.bookings.length, 0);
ok(initial.clientId);
ok(!JSON.stringify(initial).includes("offline-sandbox-secret"));
const signup = await fetch(qa.origin + "/api/auth/sign-up/email", {
  method: "POST",
  headers,
  body: body({
    name: "Sandbox isolation",
    email: `isolation-${randomUUID()}@example.com`,
    password: qa.password,
  }),
});
equal(signup.status, 200);
const other = cookies(signup);
equal((await req(undefined, other)).status, 404);
const order = await json(
  await req({
    action: "checkout",
    intentId: initial.quotes[0].id,
    walletVersion: initial.walletVersion,
    itineraryVersion: initial.itineraryVersion,
  }),
);
ok(order.orderId);
equal(order.state.bookings[0].payment.capturedMinor, 0);
equal(
  (
    await req({
      action: "capture",
      bookingId: order.bookingId,
      orderId: "FOREIGN",
    })
  ).status,
  422,
);
const capture = {
  action: "capture",
  bookingId: order.bookingId,
  orderId: order.orderId,
};
equal((await req(capture, other)).status, 404);
const paid = await json(await req(capture));
equal(paid.state.bookings[0].payment.capturedMinor, 500);
await json(await req(capture));
const updated = await wallet();
equal(
  updated.events.filter((e: { kind: string }) => e.kind === "captured").length,
  1,
);
equal(updated.summary.actualHomeMinor, 400);
equal(updated.summary.projectedMinor, original.summary.projectedMinor);
equal(updated.itineraryVersion, original.itineraryVersion);
const partial = {
  action: "refund",
  bookingId: order.bookingId,
  mutationId: randomUUID(),
  mode: "partial",
  amount: "2.00",
};
equal((await req(partial, other)).status, 404);
const part = await json(await req(partial));
equal(part.state.bookings[0].payment.netMinor, 300);
await json(await req(partial));
equal(
  (await req({ ...partial, mutationId: randomUUID(), amount: "4.00" })).status,
  409,
);
const full = await json(
  await req({
    ...partial,
    mode: "full",
    mutationId: randomUUID(),
    amount: "3.00",
  }),
);
equal(full.state.bookings[0].payment.status, "refunded");
equal((await wallet()).summary.actualHomeMinor, 0);
const webhook = await fetch(qa.origin + "/api/paypal/webhook", {
  method: "POST",
  headers,
  body: body({
    id: "EVENT-OFFLINE",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: { id: "CAPTURE-OFFLINE" },
  }),
});
equal(webhook.status, 401);
const refundId = full.state.bookings[0].operations.find(
  (o: { kind: string; requestedMinor: number }) =>
    o.kind === "refund" && o.requestedMinor === 300,
)?.providerId;
ok(refundId);
const notification = {
  id: "EVENT-" + randomUUID(),
  event_type: "PAYMENT.CAPTURE.REFUNDED",
  resource: { id: refundId },
};
for (let i = 0; i < 2; i++) {
  const verified = await fetch(qa.origin + "/api/paypal/webhook", {
    method: "POST",
    headers: {
      ...headers,
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-cert-url":
        "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-OFFLINE",
      "paypal-transmission-id": "OFFLINE-TRANSMISSION",
      "paypal-transmission-sig": "signed-offline-fixture",
      "paypal-transmission-time": "2026-10-01T12:00:00Z",
    },
    body: body(notification),
  });
  equal(verified.status, 200);
  equal(await verified.json(), { received: true });
}
equal(
  (await wallet()).events.filter(
    (e: { kind: string }) => e.kind === "refund_completed",
  ).length,
  2,
);
for (const view of ["", "/bookings", "/wallet", "/itinerary"]) {
  const r = await fetch(qa.origin + "/trips/" + qa.tripId + view, {
    headers: { cookie },
  });
  equal(r.status, 200);
  const html = await r.text();
  ok(!html.includes("offline-sandbox-secret"));
  if (view) ok(html.includes("Fully refunded"));
}
console.log(
  JSON.stringify({
    assertions,
    provider: "offline PayPal Sandbox wire fixture",
    liveRequests: 0,
  }),
);

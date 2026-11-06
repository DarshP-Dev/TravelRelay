import assert from "node:assert/strict";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
// Real local HTTP, auth and storage; only a free public ECB FX lookup is allowed.
const qa = JSON.parse(
  await readFile(".test-data/wallet-qa-server.json", "utf8"),
);
assert.ok(["127.0.0.1", "localhost"].includes(new URL(qa.origin).hostname));
assert.ok(qa.directory.includes("wallet-ui-review-"));
let assertions = 0;
const equal = (a: unknown, b: unknown) => {
  assert.deepEqual(a, b);
  assertions++;
};
const ok = (v: unknown) => {
  assert.ok(v);
  assertions++;
};
const cookies = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join(";");
const login = await fetch(qa.origin + "/api/auth/sign-in/email", {
  method: "POST",
  headers: { origin: qa.origin, "content-type": "application/json" },
  body: JSON.stringify({ email: qa.email, password: qa.password }),
});
equal(login.status, 200);
const cookie = cookies(login);
const endpoint = qa.origin + `/api/trips/${qa.tripId}/wallet`;
const request = (
  body?: unknown,
  auth = cookie,
  origin = qa.origin,
  url = endpoint,
) =>
  fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: auth, origin, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function current() {
  const r = await request();
  equal(r.status, 200);
  return r.json();
}
const initial = await current();
equal(
  [
    initial.budget.selectedBudgetMinor,
    initial.budget.itemizedEstimateMinor,
    initial.budget.unitemizedAllowanceMinor,
    initial.budget.allocatedMinor,
    initial.budget.reserveMinor,
    initial.budget.totalWithReserveMinor,
    initial.budget.remainingMinor,
  ],
  [250000, 36900, 165500, 202400, 25000, 227400, 22600],
);
equal(initial.summary.actualHomeMinor, 0);
equal(initial.events, []);
equal(initial.providerEnabled, false);
equal((await request(undefined, "")).status, 401);
equal(
  (
    await request({
      action: "captured",
      amountMinor: 1,
      provider: "paypal-sandbox",
    })
  ).status,
  400,
);
equal(
  (
    await request(
      {
        action: "settings",
        localCurrency: "JPY",
        walletVersion: 0,
        mutationId: randomUUID(),
      },
      cookie,
      "https://evil.example",
    )
  ).status,
  403,
);
const other = await fetch(qa.origin + "/api/auth/sign-up/email", {
  method: "POST",
  headers: { origin: qa.origin, "content-type": "application/json" },
  body: JSON.stringify({
    name: "Other QA traveler",
    email: `wallet-http-${randomUUID()}@example.com`,
    password: qa.password,
  }),
});
equal(other.status, 200);
const otherCookie = cookies(other);
equal((await request(undefined, otherCookie)).status, 404);
const target = initial.activities[1];
const data = {
  activityId: target.id,
  amount: "100.00",
  currency: "USD",
  supplier: "QA planning reference · no supplier reservation",
  itineraryVersion: initial.itineraryVersion,
  walletVersion: initial.version,
};
const p = await request({ action: "preview_quote", ...data });
equal(p.status, 200);
const preview = (await p.json()).preview;
equal(preview.fx.snapshot.provider, "frankfurter-ecb");
equal(preview.fx.snapshot.base, "USD");
equal(preview.fx.snapshot.quote, "EUR");
equal(preview.canSave, true);
equal((await current()).intents.length, 0);
const save = {
  action: "save_quote",
  ...data,
  mutationId: randomUUID(),
  fxSnapshotId: preview.fx.snapshot.id,
};
equal((await request({ ...save, status: "captured" })).status, 400);
equal((await request(save, otherCookie)).status, 404);
equal((await request(save)).status, 200);
equal((await request(save)).status, 200);
let s = await current();
equal(s.intents.length, 1);
equal(s.events.length, 1);
equal(s.events[0].kind, "intent_created");
equal(s.intents[0].originalCurrency, "USD");
equal(s.intents[0].originalMinor, 10000);
equal(s.intents[0].estimatedDisplayMinor, preview.convertedMinor);
equal(s.summary.actualHomeMinor, 0);
equal(s.intents[0].state.status, "unpaid");
equal(s.budget.reserveMinor, 25000);
equal(s.budget.remainingMinor, preview.afterBudget.remainingMinor);
equal(
  s.budget.allocations.find((a: { category: string }) => a.category === "food")
    .unitemizedAllowanceMinor,
  17500,
);
equal((await request({ ...save, amount: "101.00" })).status, 409);
const editorUrl = qa.origin + `/api/trips/${qa.tripId}/itinerary`;
const er = await request(undefined, cookie, qa.origin, editorUrl);
equal(er.status, 200);
let edited = await er.json();
const a = edited.itinerary.days[0].activities[1];
const update = {
  version: edited.version,
  mutationId: randomUUID(),
  operation: {
    action: "update",
    activityId: a.id,
    dayId: edited.itinerary.days[0].id,
    data: {
      title: a.title,
      description: a.description,
      category: a.category,
      location: a.location,
      latitude: a.latitude,
      longitude: a.longitude,
      startMinute: a.startMinute,
      durationMinutes: a.durationMinutes,
      bufferBeforeMinutes: a.bufferBeforeMinutes,
      costMinor: 5000,
      currency: "EUR",
      links: a.links,
    },
  },
};
const changed = await request(update, cookie, qa.origin, editorUrl);
equal(changed.status, 200);
edited = await changed.json();
s = await current();
equal(s.intents[0].staleActivity, true);
equal(s.intents[0].originalMinor, 10000);
equal(s.events.length, 1);
equal(s.summary.actualHomeMinor, 0);
equal(
  (
    await request(
      {
        version: edited.version,
        mutationId: randomUUID(),
        operation: { action: "restore", editId: edited.history[0].id },
      },
      cookie,
      qa.origin,
      editorUrl,
    )
  ).status,
  200,
);
s = await current();
equal(s.intents[0].staleActivity, false);
const identityData = {
  activityId: s.activities[0].id,
  amount: "0",
  currency: "EUR",
  supplier: "QA free planning reference",
  itineraryVersion: s.itineraryVersion,
  walletVersion: s.version,
};
const identity = await request({ action: "preview_quote", ...identityData });
equal(identity.status, 200);
const identityPreview = (await identity.json()).preview;
equal(identityPreview.fx.snapshot.provider, "identity");
equal(
  (
    await request({
      action: "settings",
      localCurrency: "JPY",
      walletVersion: s.version,
      mutationId: randomUUID(),
    })
  ).status,
  200,
);
equal(
  (
    await request({
      action: "save_quote",
      ...identityData,
      mutationId: randomUUID(),
      fxSnapshotId: identityPreview.fx.snapshot.id,
    })
  ).status,
  409,
);
s = await current();
equal(s.localCurrency, "JPY");
equal(s.currency, "EUR");
equal(s.budget.scope, "entire");
// A second same-currency reference exercises closure without closing the live
// FX reference retained for the responsive review. It changes no money.
const freeData = { ...identityData, walletVersion: s.version };
const fp = await request({ action: "preview_quote", ...freeData });
equal(fp.status, 200);
const freePreview = (await fp.json()).preview;
equal(
  (
    await request({
      action: "save_quote",
      ...freeData,
      mutationId: randomUUID(),
      fxSnapshotId: freePreview.fx.snapshot.id,
    })
  ).status,
  200,
);
s = await current();
const free = s.intents.find(
  (i: { activityId: string }) => i.activityId === freeData.activityId,
);
const cancel = {
  action: "cancel_intent",
  intentId: free.id,
  walletVersion: s.version,
  mutationId: randomUUID(),
};
equal((await request(cancel)).status, 200);
equal((await request(cancel)).status, 200);
s = await current();
equal(
  s.intents.find((i: { id: string }) => i.id === free.id).status,
  "canceled",
);
equal(s.summary.actualHomeMinor, 0);
ok(s.events.every((e: { provider: string }) => e.provider === "planning"));
for (const route of [
  "/dashboard",
  "/trips",
  `/trips/${qa.tripId}`,
  `/trips/${qa.tripId}/itinerary`,
  `/trips/${qa.tripId}/wallet`,
  `/trips/${qa.tripId}/bookings`,
]) {
  const r = await request(undefined, cookie, qa.origin, qa.origin + route);
  equal(r.status, 200);
  ok((await r.text()).includes("TravelRelay"));
}
const values = [
  ...(await readFile(".env.local", "utf8")).matchAll(
    /^\s*([A-Z0-9_]*(?:KEY|SECRET|PASSWORD|DATABASE_URL)[A-Z0-9_]*)\s*=\s*(.*?)\s*$/gm,
  ),
]
  .map((m) => m[2].replace(/^['"]|['"]$/g, ""))
  .filter((v) => v.length >= 16);
values.push(qa.secret, qa.password);
const assets: string[] = [];
async function walk(directory: string) {
  for (const e of await readdir(directory, { withFileTypes: true })) {
    const p = directory + "/" + e.name;
    if (e.isDirectory()) await walk(p);
    else assets.push(p);
  }
}
await walk(".next/static");
for (const p of assets) {
  const bytes = await readFile(p);
  for (const v of values)
    assert.ok(!bytes.includes(Buffer.from(v)), `Credential leak in ${p}`);
  if (/\.(js|css)$/.test(p))
    assert.ok(
      !/api\.openai\.com|generativelanguage\.googleapis\.com|api-m\.(sandbox\.)?paypal\.com|api\.frankfurter\.dev/.test(
        bytes.toString(),
      ),
      "Provider transport exposed to frontend",
    );
}
const result = {
  passed: true,
  assertions,
  publicAssetsChecked: assets.length,
  privateValuesChecked: values.length,
  paidRequests: 0,
  realFxSnapshot: preview.fx.snapshot,
  confirmedSpending: s.summary.actualHomeMinor,
};
await writeFile(
  ".test-data/milestone-4a-http-result.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));

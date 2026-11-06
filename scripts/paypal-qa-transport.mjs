// Explicit offline production QA preloader. Never import in application code.
import assert from "node:assert/strict";
import {
  fakeSandbox,
  sandboxFixtureConfig,
} from "../tests/helpers/paypal-sandbox.mjs";

assert.equal(process.env.TRAVELRELAY_PAYPAL_QA, "true");
assert.match(process.env.LOCAL_DATABASE_PATH ?? "", /paypal-ui-review-/);
assert.equal(new URL(process.env.APP_URL).hostname, "127.0.0.1");
assert.equal(process.env.PAYPAL_CLIENT_ID, sandboxFixtureConfig.clientId);
assert.equal(process.env.PAYPAL_CLIENT_SECRET, sandboxFixtureConfig.secret);
assert.equal(process.env.OPENAI_API_KEY, "blocked-paypal-qa-only");
assert.equal(process.env.GEMINI_API_KEY, "blocked-paypal-qa-only");
assert.ok(!process.env.DATABASE_URL);
process.env.DATABASE_URL = "";
process.env.DIRECT_URL = "";
const real = globalThis.fetch;
const fake = fakeSandbox();
const readOrders = new Set();
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (["127.0.0.1", "localhost"].includes(url.hostname))
    return real(input, init);
  if (url.origin === "https://api-m.sandbox.paypal.com") {
    const orderId = /^\/v2\/checkout\/orders\/([A-Z0-9-]+)$/.exec(
      url.pathname,
    )?.[1];
    if (init?.method === "GET" && orderId) {
      const order = fake.orders.get(orderId);
      // First GET verifies creation. The QA client simulates buyer approval
      // before requesting capture, so the following GET observes approval.
      if (order?.status === "CREATED" && readOrders.has(orderId))
        order.status = "APPROVED";
      readOrders.add(orderId);
    }
    return fake.transport(input, init);
  }
  if (url.href === "https://api.frankfurter.dev/v2/rate/USD/EUR?providers=ecb")
    return Promise.resolve(
      Response.json({
        base: "USD",
        quote: "EUR",
        rate: 0.8,
        date: new Date().toISOString().slice(0, 10),
      }),
    );
  throw Error("External network forbidden in PayPal QA.");
};

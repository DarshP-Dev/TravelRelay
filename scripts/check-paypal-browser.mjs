import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const qa = JSON.parse(
  await readFile(".test-data/paypal-qa-server.json", "utf8"),
);
assert.equal(new URL(qa.origin).hostname, "127.0.0.1");
assert.match(qa.directory, /paypal-ui-review-/);
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_CORE_PATH || "playwright-core",
);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
});
const page = await context.newPage();
let sdkLoads = 0;
let cancelFirst = true;
await context.route("**/*", async (route) => {
  const url = route.request().url();
  if (url.startsWith(qa.origin + "/")) return route.continue();
  if (url === "https://www.sandbox.paypal.com/web-sdk/v6/core") {
    sdkLoads++;
    const cancel = cancelFirst;
    cancelFirst = false;
    return route.fulfill({
      contentType: "application/javascript",
      body: `window.paypal = { createInstance: async () => ({
        findEligibleMethods: async () => ({isEligible: (method) => method === "paypal"}),
        createPayPalOneTimePaymentSession: (options) => ({ start: async (configuration, order) => {
          const result = await order;
          if (${cancel} && !window.__qaCancelledOnce) { window.__qaCancelledOnce = true; options.onCancel(); }
          else await options.onApprove({orderId: result.orderId});
        }})
      }) };`,
    });
  }
  return route.abort();
});
try {
  const login = await context.request.post(
    qa.origin + "/api/auth/sign-in/email",
    {
      headers: { origin: qa.origin },
      data: { email: qa.email, password: qa.password },
    },
  );
  assert.equal(login.status(), 200);
  const base = qa.origin + "/trips/" + qa.browserTripId;
  const get = (label) => page.getByRole("button", { name: label, exact: true });
  const see = async (value) => {
    await page.getByText(value, { exact: true }).first().waitFor();
  };
  const screenshot = async (name) => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: ".test-data/" + name + ".png",
      fullPage: true,
    });
  };
  const noOverflow = async (widths) => {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
        `overflow at ${width}px`,
      );
    }
  };
  await page.goto(base + "/bookings");
  await get("Review Sandbox checkout").click();
  await get("Continue to PayPal Sandbox").waitFor();
  await noOverflow([360, 390, 768, 1440]);
  await screenshot("paypal-desktop-checkout");
  await get("Continue to PayPal Sandbox").click();
  await see(
    "Checkout was closed. No payment is confirmed. You can return to the saved order below.",
  );
  await get("Return to PayPal Sandbox").click();
  await see("Payment verified");
  await noOverflow([360, 390, 768, 1440]);
  await screenshot("paypal-desktop-confirmation");
  await page.reload();
  await see("Payment verified");
  await page.setViewportSize({ width: 390, height: 860 });
  await page.getByLabel("Partial refund (USD)").fill("2.00");
  await get("Review partial refund").click();
  await get("Confirm Sandbox refund").waitFor();
  await noOverflow([360, 390, 768]);
  await page.setViewportSize({ width: 390, height: 860 });
  await screenshot("paypal-mobile-refund-review");
  await get("Confirm Sandbox refund").click();
  await see("Partially refunded");
  await get("Review full refund").click();
  await get("Confirm Sandbox refund").click();
  await see("Fully refunded");
  await page
    .getByText("PayPal references and history", { exact: true })
    .click();
  await noOverflow([360, 390, 768, 1440]);
  await page.setViewportSize({ width: 390, height: 860 });
  await screenshot("paypal-mobile-refund-history");
  await page.goto(base + "/wallet");
  await see("Fully refunded");
  await page.goto(base + "/itinerary");
  await see("Sandbox demo · Fully refunded");
  assert.ok(sdkLoads);
  console.log(
    "Passed Chromium production QA at 360, 390, 768 and 1440px: checkout review, cancel/resume, capture, refresh, partial/full refunds, and synchronized workspace views. All external routes intercepted.",
  );
} finally {
  await browser.close();
}

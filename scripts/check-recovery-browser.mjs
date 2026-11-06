import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { sandboxFixtureConfig } from "../tests/helpers/paypal-sandbox.mjs";

const qa = JSON.parse(
  await readFile(".test-data/recovery-qa-server.json", "utf8"),
);
assert.equal(qa.origin, "http://127.0.0.1:3003");
assert.match(qa.directory, /paypal-ui-review-recovery-/);
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_CORE_PATH || "playwright-core",
);
await assert.rejects(
  fetch(qa.origin, { signal: AbortSignal.timeout(2000) }),
  "Use a free QA port before running the harness",
);
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
let output = "";
server.stdout.on("data", (chunk) => {
  output = (output + chunk).slice(-4000);
});
server.stderr.on("data", (chunk) => {
  output = (output + chunk).slice(-4000);
});
let browser;
let checks = 0;
function equal(actual, expected) {
  assert.equal(actual, expected);
  checks++;
}
async function screen(page, name) {
  await mkdir(".test-data/recovery-screenshots", { recursive: true });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: `.test-data/recovery-screenshots/${name}.png`,
    fullPage: true,
  });
}
try {
  for (let i = 0; i < 100 && !output.includes("Ready"); i++) {
    if (server.exitCode !== null)
      throw Error("Offline QA server exited before startup");
    await delay(200);
  }
  assert.match(output, /Ready/);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(qa.origin + "/")) return route.continue();
    if (url === "https://www.sandbox.paypal.com/web-sdk/v6/core")
      return route.fulfill({
        contentType: "application/javascript",
        body: `window.paypal = {createInstance: async () => ({
        findEligibleMethods: async () => ({isEligible: () => true}),
        createPayPalOneTimePaymentSession: (options) => ({start: async (_, order) => options.onApprove(await order)})
      })};`,
      });
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const base = qa.origin + "/trips/" + qa.tripId;
  const endpoint = qa.origin + "/api/trips/" + qa.tripId + "/recovery";
  const walletEndpoint = qa.origin + "/api/trips/" + qa.tripId + "/wallet";
  const headers = { origin: qa.origin };
  const get = (label) => page.getByRole("button", { name: label, exact: true });
  const see = (text) => page.getByText(text, { exact: true }).first().waitFor();
  const read = async (url = endpoint) => {
    const response = await context.request.get(url);
    equal(response.status(), 200);
    equal(response.headers()["cache-control"], "no-store");
    return response.json();
  };
  equal((await context.request.get(endpoint)).status(), 401);
  const login = await context.request.post(
    qa.origin + "/api/auth/sign-in/email",
    {
      headers,
      data: { email: qa.email, password: qa.password },
    },
  );
  equal(login.status(), 200);
  const other = await browser.newContext();
  const signup = await other.request.post(
    qa.origin + "/api/auth/sign-up/email",
    {
      headers,
      data: {
        name: "Offline QA isolation",
        email: `qa-${randomUUID()}@example.invalid`,
        password: qa.password,
      },
    },
  );
  equal(signup.status(), 200);
  equal((await other.request.get(endpoint)).status(), 404);
  const protectedPage = await other.request.get(base + "/recovery");
  // A streamed App Router not-found page can retain its 200 transport status.
  equal([200, 404].includes(protectedPage.status()), true);
  const protectedHtml = await protectedPage.text();
  equal(protectedHtml.includes("A little off the beaten path."), true);
  equal(protectedHtml.includes("Simulate a supplier cancellation"), false);
  await other.close();
  equal(
    (
      await context.request.post(endpoint, {
        headers: { origin: "https://outside.example" },
        data: {},
      })
    ).status(),
    403,
  );
  equal(
    (
      await context.request.post(endpoint, {
        headers,
        data: { action: "refund", bookingId: randomUUID() },
      })
    ).status(),
    400,
  );
  equal((await read()).cases.length, 0);
  await page.goto(base + "/bookings");
  await get("Review Sandbox checkout").click();
  await get("Continue to PayPal Sandbox").click();
  await see("Payment verified");
  const initial = await read();
  equal(initial.eligibleBookings.length, 1);
  equal(initial.financial.capturedNetEstimateMinor, 400);
  await page
    .getByRole("link", { name: "Open Trip Recovery", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Verified Sandbox booking")
    .selectOption(initial.eligibleBookings[0].id);
  await page
    .getByLabel("Simulated cancellation reason")
    .fill("Offline QA: the demo activity was canceled.");
  await get("Record simulated cancellation").click();
  await see("Cancellation recorded");
  const recorded = await read();
  const caseId = recorded.cases[0].id;
  equal(recorded.cases[0].provenance, "sandbox-simulation");
  equal(recorded.cases[0].activityId, qa.activityId);
  equal(recorded.financial.capturedNetEstimateMinor, 400);
  await page.goto(base + "/itinerary#activity-" + qa.activityId);
  await see("Simulated cancellation · resolve with TravelRelay");
  await page
    .getByRole("link", {
      name: "Simulated cancellation · resolve with TravelRelay",
    })
    .click();
  await get("Find AI alternatives").click();
  const option = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Choose a free alternative" }),
  });
  await option.waitFor();
  equal(
    await option
      .getByRole("button", { name: "Approve itinerary change" })
      .isEnabled(),
    false,
  );
  const reviewed = await read();
  equal(reviewed.cases[0].attempts[0].options.length, 2);
  equal(reviewed.cases[0].editId, null);
  equal(reviewed.cases[0].payment.payment.netMinor, 500);
  for (const width of [1440, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 960 });
    equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    if (width === 1440 || width === 390)
      await screen(
        page,
        `recovery-${width === 1440 ? "desktop" : "mobile"}-review`,
      );
    if (width === 390)
      await option.screenshot({
        path: ".test-data/recovery-screenshots/recovery-mobile-alternative.png",
      });
  }
  await page.reload();
  await option.getByRole("checkbox").check();
  await option
    .getByRole("button", { name: "Approve itinerary change" })
    .click();
  await see("Itinerary choice saved");
  const applied = await read();
  equal(applied.cases[0].payment.payment.netMinor, 500);
  assert.ok(applied.cases[0].replacementActivityId);
  await page
    .getByRole("link", { name: "Review original refund in Bookings" })
    .click();
  await get("Review full refund").click();
  equal((await read()).cases[0].payment.payment.refundedMinor, 0);
  await screen(page, "recovery-mobile-refund-approval");
  await get("Confirm Sandbox refund").click();
  await see("Fully refunded");
  const refunded = await read();
  equal(refunded.cases[0].payment.payment.refundedMinor, 500);
  equal(refunded.financial.capturedNetEstimateMinor, 0);
  await page.goto(base + "/recovery#case-" + caseId);
  await page
    .getByRole("link", { name: /Review optional .* Sandbox replacement/ })
    .click();
  equal(await page.getByLabel("Original group amount").inputValue(), "5.00");
  equal(await page.getByLabel("Original currency").inputValue(), "USD");
  await get("Preview rate & budget consequences").click();
  await get("Save reference & activity estimate").click();
  await get("Review Sandbox checkout").click();
  await get("Continue to PayPal Sandbox").click();
  await see("Payment verified");
  const end = await read();
  equal(end.cases[0].replacement.payment.capturedMinor, 500);
  equal(end.cases[0].payment.payment.refundedMinor, 500);
  equal(end.financial.capturedNetEstimateMinor, 400);
  equal(end.financial.reserveMinor, 25000);
  const wallet = await read(walletEndpoint);
  equal(wallet.events.filter((event) => event.kind === "captured").length, 2);
  equal(
    wallet.events.filter((event) => event.kind === "refund_completed").length,
    1,
  );
  equal(
    wallet.activities.some((item) => item.id === qa.activityId),
    false,
  );
  equal(
    wallet.activities.some(
      (item) => item.id === end.cases[0].replacementActivityId,
    ),
    true,
  );
  await page.goto(base + "/recovery#case-" + caseId);
  await get("Finish recovery plan").click();
  await see("Recovery plan complete");
  await page.reload();
  await see("Recovery plan complete");
  await page.setViewportSize({ width: 1440, height: 960 });
  await screen(page, "recovery-desktop-reconciled");
  for (const tab of ["", "/itinerary", "/wallet", "/bookings"]) {
    equal((await context.request.get(base + tab)).status(), 200);
  }
  console.log(
    `PASS: ${checks} production HTTP and browser assertions; desktop/mobile screenshots saved.`,
  );
} catch (error) {
  console.error(output);
  throw error;
} finally {
  await browser?.close();
  server.kill();
}

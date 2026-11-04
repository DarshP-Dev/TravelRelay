import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { ItineraryBudgetView } from "../src/components/itinerary-budget-view";
import { planningBudgetSummary } from "../src/lib/budget-presentation";
import {
  MODEL_TIMEOUT_MS,
  WORKER_LEASE_MS,
  STALE_JOB_MS,
  HOST_DURATION_SECONDS,
} from "../src/lib/generation-timing";
import { readFileSync } from "node:fs";
import {
  prepareOfflineSolReview,
  verifyOfflineSolReview,
} from "./helpers/offline-sol-review";

test("the exact real Sol recording passes offline acceptance, retains failed audit history and renders correct reserve-separated budgets", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw Error("Network forbidden in offline acceptance.");
  });
  const root = path.resolve(".test-data");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, "sol-acceptance-"));
  const state = await prepareOfflineSolReview(
    directory,
    "http://localhost:3000",
  );
  try {
    await state.worker();
    const result = await verifyOfflineSolReview(state);
    const html = renderToStaticMarkup(
      <>
        <ItineraryBudgetView budget={result.itinerary.budget!} />
        <p>{planningBudgetSummary(result.itinerary.budget!)}</p>
      </>,
    );
    for (const text of [
      "€250.00",
      "€226.00",
      "€2,274.00",
      "Unallocated budget remaining",
    ])
      assert.ok(html.includes(text), text);
    assert.ok(
      !html.includes("€476"),
      "Model prose must not override the server's reserve-separated summary.",
    );
    assert.ok(
      result.itinerary.explanation.includes("€476"),
      "Original response text must remain unchanged for provenance.",
    );
    const summary = planningBudgetSummary(result.itinerary.budget!);
    assert.ok(summary.includes("€250.00"));
    assert.ok(summary.includes("€226.00"));
    assert.ok(!summary.includes("€476"));
  } finally {
    await state.close();
    if (path.dirname(directory) === root)
      await rm(directory, { recursive: true, force: true });
  }
});

test("provider timeout, lease, stale recovery and host duration safely cover the recorded latency without changing thresholds", () => {
  assert.ok(63727 < MODEL_TIMEOUT_MS);
  assert.ok(MODEL_TIMEOUT_MS < WORKER_LEASE_MS);
  assert.ok(WORKER_LEASE_MS < STALE_JOB_MS);
  assert.ok(HOST_DURATION_SECONDS * 1000 >= MODEL_TIMEOUT_MS + 30000);
  const route = readFileSync(
    new URL("../src/app/api/trips/[id]/generation/route.ts", import.meta.url),
    "utf8",
  );
  assert.equal(
    Number(route.match(/maxDuration\s*=\s*(\d+)/)?.[1]),
    HOST_DURATION_SECONDS,
  );
  assert.ok(route.includes('runtime = "nodejs"'));
});

test("a 64-second background wait does not hold POST open, expire the job, publish partial days or depend on the initiating browser", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw Error("Network forbidden in offline wait test.");
  });
  const root = path.resolve(".test-data");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, "sol-wait-"));
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = await prepareOfflineSolReview(
    directory,
    "http://localhost:3000",
    async () => {
      enter();
      await barrier;
    },
  );
  let running: Promise<void> | undefined;
  try {
    running = state.worker();
    await entered;
    state.controller.abort();
    t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
    t.mock.timers.tick(64000);
    const pending = await state.app.generations.read(
      state.userId,
      state.trip.id,
    );
    assert.equal(pending?.status, "generating");
    assert.equal(
      (await state.app.trips.read(state.userId, state.trip.id)).itinerary,
      null,
    );
    assert.equal(
      pending?.audits.find((audit) => audit.attempt === 2)?.status,
      "started",
    );
    t.mock.timers.reset();
    release();
    await running;
    const result = await verifyOfflineSolReview(state);
    assert.equal(result.checks.persistedAfterReopen, true);
  } finally {
    release();
    if (running) await running;
    await state.close();
    if (path.dirname(directory) === root)
      await rm(directory, { recursive: true, force: true });
  }
});

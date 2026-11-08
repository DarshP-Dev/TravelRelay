import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prepareOfflineSolReview } from "../tests/helpers/offline-sol-review";
import { openDatabase } from "../src/server/db/connection";
import { createApplication } from "../src/server/application";

const origin = "http://127.0.0.1:3004";
await assert.rejects(fetch(origin, { signal: AbortSignal.timeout(1500) }));
await mkdir(".test-data", { recursive: true });
const directory = await mkdtemp(
  path.resolve(".test-data/infrastructure-http-"),
);
const seed = await prepareOfflineSolReview(directory, origin);
await seed.worker();
await seed.close();
const server = spawn(
  process.execPath,
  [
    "--import",
    "./scripts/infrastructure-qa-transport.mjs",
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3004",
  ],
  {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      APP_URL: origin,
      AUTH_SECRET: seed.secret,
      DATABASE_URL: "",
      DIRECT_URL: "",
      DATABASE_DRIVER: "pglite",
      LOCAL_DATABASE_PATH: directory,
      ALLOW_LOCAL_DATABASE: "true",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "offline-infrastructure-key",
      GEMINI_API_KEY: "",
      OPENAI_MODEL: "gpt-6.1-sol",
      OPENAI_REASONING_EFFORT: "medium",
      PAYPAL_ENVIRONMENT: "sandbox",
      ENABLE_DEMO_MERCHANT: "false",
      ENABLE_RECOVERY_SIMULATION: "false",
      PAYPAL_CLIENT_ID: "",
      PAYPAL_CLIENT_SECRET: "",
      PAYPAL_MERCHANT_ID: "",
      PAYPAL_WEBHOOK_ID: "",
      TRAVELRELAY_INFRASTRUCTURE_QA: "true",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
);
let ready = false,
  checks = 0;
server.stdout!.on("data", (chunk) => {
  if (String(chunk).includes("Ready")) ready = true;
});
// Do not forward server diagnostics, prompts or configuration to public output.
server.stderr!.on("data", () => {});
function equal(actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected);
  checks++;
}
const exited = once(server, "exit");
try {
  for (let i = 0; i < 100 && !ready; i++) {
    if (server.exitCode !== null) throw Error("QA server failed to start.");
    await delay(200);
  }
  equal(ready, true);
  const health = await fetch(origin + "/api/health");
  equal(health.status, 200);
  equal(await health.json(), { status: "ready" });
  equal(health.headers.get("cache-control"), "no-store");
  equal(health.headers.get("x-content-type-options"), "nosniff");
  equal(health.headers.get("x-frame-options"), "SAMEORIGIN");
  equal(health.headers.get("access-control-allow-origin"), null);
  for (const pathname of [
    "/.env.local",
    "/.test-data/recovery-qa-server.json",
    "/tests/fixtures/paris-sol-recorded.json",
  ])
    equal((await fetch(origin + pathname)).status, 404);
  const login = await fetch(origin + "/api/auth/sign-in/email", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email: seed.email, password: seed.password }),
  });
  equal(login.status, 200);
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join(";");
  const base = origin + `/api/trips/${seed.trip.id}/assistant`;
  equal((await fetch(base)).status, 401);
  equal(
    (
      await fetch(base, {
        method: "POST",
        headers: {
          cookie,
          origin: "https://foreign.example.invalid",
          "content-type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  let providerCalls = 0;
  const initial = await (await fetch(base, { headers: { cookie } })).json();
  const providerStarted = new Promise<void>((resolve) =>
    server.on("message", (message) => {
      if (message === "qa-provider-started") {
        providerCalls++;
        resolve();
      }
    }),
  );
  const response = await fetch(base, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json" },
    body: JSON.stringify({
      action: "send",
      mutationId: randomUUID(),
      text: "Explain the saved plan without changing anything.",
      draftVersion: initial.draftVersion,
    }),
  });
  equal(response.status, 202);
  await Promise.race([
    providerStarted,
    delay(10_000).then(() => {
      throw Error("Offline worker did not start.");
    }),
  ]);
  equal(providerCalls, 1);
  server.send("qa-graceful-stop");
  await Promise.race([
    exited,
    delay(20_000).then(() => {
      throw Error("Next did not drain its after callback.");
    }),
  ]);
  const connection = await openDatabase({ directory });
  try {
    const app = createApplication(connection.db, seed.config);
    const state = await app.travelAgent.read(seed.userId, seed.trip.id);
    equal(state.turns.at(-1)?.status, "ready");
    equal(
      state.turns
        .at(-1)
        ?.response?.answer.startsWith("Offline infrastructure fixture."),
      true,
    );
    equal(
      (await app.trips.read(seed.userId, seed.trip.id)).itineraryVersion,
      0,
    );
    equal(providerCalls, 1);
  } finally {
    await connection.close();
  }
  const report = {
    status: "PASS",
    assertions: checks,
    liveRequests: 0,
    workerDrainedAfterResponse: true,
    signalDelivery: "test-only IPC bridge to installed Next SIGTERM handler",
    hostedVerified: false,
  };
  await writeFile(
    ".test-data/milestone-6a-http-result.json",
    JSON.stringify(report),
  );
  console.log(JSON.stringify(report));
} finally {
  if (server.exitCode === null) {
    server.kill("SIGKILL");
    await exited;
  }
}

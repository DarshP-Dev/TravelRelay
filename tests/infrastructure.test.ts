import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, cp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createApplication } from "../src/server/application";
import path from "node:path";
import { sql } from "drizzle-orm";
import { runtimeConfiguration } from "../src/server/deployment-config";
import {
  assertDatabaseReady,
  migrationManifest,
  readinessResponse,
} from "../src/server/db/readiness";
import { openDatabase } from "../src/server/db/connection";
import { webhookAdmission } from "../src/server/webhook-admission";
import { databaseContract } from "./helpers/database-contract";

const env = {
  NODE_ENV: "production" as const,
  APP_URL: "https://travelrelay.example.invalid",
  AUTH_SECRET: "a".repeat(40),
  DATABASE_URL:
    "postgresql://fixture:fixture@db.example.invalid/qa?sslmode=verify-full",
  DIRECT_URL:
    "postgresql://fixture:fixture@db.example.invalid/qa?sslmode=verify-full",
};
test("hosted runtime fails closed on ephemeral storage, unsafe origins, TLS bypasses and live PayPal", () => {
  assert.equal(runtimeConfiguration(env).origin, env.APP_URL);
  for (const override of [
    { DATABASE_URL: "", DATABASE_DRIVER: "pglite" },
    { ALLOW_LOCAL_DATABASE: "true" },
    { DATABASE_DRIVER: "pglite" },
    { APP_URL: "http://public.example.invalid" },
    { APP_URL: env.APP_URL + "/path" },
    { APP_URL: "https://secret:password@public.example.invalid" },
    {
      DATABASE_URL:
        "postgresql://fixture:fixture@db.example.invalid/qa?sslmode=no-verify",
    },
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    { TRAVELRELAY_RECOVERY_QA: "true" },
    { PAYPAL_ENVIRONMENT: "live" },
    { NEXT_PUBLIC_OPENAI_API_KEY: "fixture-only" },
    { NODE_OPTIONS: "--import ./scripts/recovery-qa-transport.mjs" },
    { ENABLE_RECOVERY_SIMULATION: "true" },
    { AUTH_SECRET: "short" },
    { DATABASE_URL: env.DATABASE_URL + "&sslmode=disable" },
  ])
    assert.throws(() => runtimeConfiguration({ ...env, ...override }));
  assert.equal(
    runtimeConfiguration({
      ...env,
      APP_URL: "http://127.0.0.1:3003",
      DATABASE_URL: "",
      DATABASE_DRIVER: "pglite",
      ALLOW_LOCAL_DATABASE: "true",
    }).localPreview,
    true,
  );
});

test("health responses are uncached and never disclose a database error or secret", async () => {
  const ready = await readinessResponse(async () => {});
  assert.equal(ready.status, 200);
  assert.match(ready.headers.get("cache-control")!, /no-store/);
  const failed = await readinessResponse(async () => {
    throw Error(env.DATABASE_URL);
  });
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { status: "unavailable" });
});

test("clean release preflight checks configuration without opening a database or provider", async () => {
  await mkdir(".test-data", { recursive: true });
  const cwd = await mkdtemp(path.resolve(".test-data/deployment-preflight-"));
  await cp("drizzle", path.join(cwd, "drizzle"), { recursive: true });
  const command = [
    "--import",
    "tsx",
    path.resolve("scripts/check-deployment.ts"),
  ];
  const childEnv = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    ...env,
    OPENAI_API_KEY: "offline-preflight-only",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const passed = spawnSync(process.execPath, command, {
    cwd,
    env: childEnv,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /12 migrations/);
  const refused = spawnSync(process.execPath, command, {
    cwd,
    env: { ...childEnv, DATABASE_DRIVER: "pglite" },
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(refused.status, 1);
  assert.ok(!refused.stderr.includes(env.DATABASE_URL));
});

test("HTTPS authentication issues Secure HttpOnly SameSite cookies without permissive CORS", async () => {
  const connection = await openDatabase({});
  try {
    await connection.migrate();
    const app = createApplication(connection.db, {
      origin: env.APP_URL,
      secret: env.AUTH_SECRET,
    });
    const response = await app.authHandler(
      new Request(env.APP_URL + "/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          origin: env.APP_URL,
          "content-type": "application/json",
          "x-forwarded-for": "192.0.2.1",
        },
        body: JSON.stringify({
          name: "Offline secure cookie QA",
          email: "secure-cookie@example.invalid",
          password: "offline-only-random-long-password",
        }),
      }),
    );
    assert.equal(response.status, 200);
    const cookie = response.headers
      .getSetCookie()
      .find((value) => /session_token/.test(value));
    assert.match(cookie!, /; Secure/i);
    assert.match(cookie!, /HttpOnly/i);
    assert.match(cookie!, /SameSite=Lax/i);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  } finally {
    await connection.close();
  }
});

test("all 12 migrations replay, preserve records, and enforce database contracts", async () => {
  await mkdir(".test-data", { recursive: true });
  const directory = await mkdtemp(
    path.resolve(".test-data/infrastructure-contract-"),
  );
  const report = await databaseContract(directory);
  assert.equal(report.migrations, 12);
  const connection = await openDatabase({ directory });
  try {
    await assertDatabaseReady(connection.db);
  } finally {
    await connection.close();
  }
});

test("readiness rejects an unmigrated or changed migration checkpoint", async () => {
  const connection = await openDatabase({});
  try {
    await assert.rejects(assertDatabaseReady(connection.db));
    await connection.migrate();
    assert.equal(
      migrationManifest().at(-1)?.tag,
      "0011_recovery_checkout_quotes",
    );
    await assertDatabaseReady(connection.db);
    await connection.db.execute(
      sql`update drizzle.__drizzle_migrations set hash = 'changed' where id = (select max(id) from drizzle.__drizzle_migrations)`,
    );
    await assert.rejects(assertDatabaseReady(connection.db), /checkpoint/);
  } finally {
    await connection.close();
  }
});

test("webhook admission is shared, atomic, bounded and recovers after its window", async () => {
  const connection = await openDatabase({});
  try {
    await connection.migrate();
    let time = 100_000;
    const first = webhookAdmission(connection.db, 3, () => time);
    const replica = webhookAdmission(connection.db, 3, () => time);
    const calls = await Promise.allSettled([
      first(),
      replica(),
      first(),
      replica(),
      first(),
    ]);
    assert.equal(calls.filter((r) => r.status === "fulfilled").length, 3);
    assert.equal(calls.filter((r) => r.status === "rejected").length, 2);
    time += 60_001;
    await replica();
  } finally {
    await connection.close();
  }
});

import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { openDatabase } from "../src/server/db/connection";
import {
  generationQuota as rateLimit,
  rateLimit as authRateLimit,
} from "../src/server/db/schema";
import {
  createGenerationQuota,
  generationLimitsFromEnv,
  pacificQuotaDay,
} from "../src/server/generation-quota";
import { exampleIntent, exampleItinerary } from "../src/lib/example-trip";
import { validateItinerary } from "../src/lib/itinerary";
let connection: Awaited<ReturnType<typeof openDatabase>>, directory: string;
const root = path.resolve(".test-data");
before(async () => {
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(path.join(root, "quota-"));
  connection = await openDatabase({ directory });
  await connection.migrate();
});
beforeEach(async () => {
  await connection.db.delete(rateLimit);
});
after(async () => {
  if (connection) await connection.close();
  if (directory && path.dirname(directory) === root)
    await rm(directory, { recursive: true, force: true });
});
test("shared admission is atomic across users, limits minute calls and rolls back denials", async () => {
  const quota = createGenerationQuota(connection.db, {
    perMinute: 2,
    perDay: 20,
    perUserHour: 6,
  });
  const claims = await Promise.allSettled([
    quota.acquire("alice"),
    quota.acquire("bob"),
  ]);
  assert.equal(
    claims.filter((result) => result.status === "fulfilled").length,
    1,
  );
  for (const claim of claims)
    if (claim.status === "fulfilled") await claim.value();
  const release = await quota.acquire("carol");
  await release();
  await assert.rejects(quota.acquire("dan"), /minute limit/);
  const rows = await connection.db.select().from(rateLimit);
  assert.equal(rows.find((row) => row.key.includes("project:day:"))!.count, 2);
  assert.ok(!rows.some((row) => row.key === "trip-generation:dan"));
});
test("Pacific-day allowance is shared and resets at Pacific midnight", async () => {
  let now = Date.parse("2026-11-04T07:59:59Z");
  const quota = createGenerationQuota(
    connection.db,
    { perMinute: 100, perDay: 1, perUserHour: 6 },
    () => now,
  );
  assert.equal(pacificQuotaDay(now), "2026-11-03");
  await (
    await quota.acquire("alice")
  )();
  await assert.rejects(quota.acquire("bob"), /Today/);
  now += 2000;
  assert.equal(pacificQuotaDay(now), "2026-11-04");
  await (
    await quota.acquire("bob")
  )();
});
test("user allowance resets after an hour without bypassing shared limits", async () => {
  let now = Date.now();
  const quota = createGenerationQuota(
    connection.db,
    { perMinute: 100, perDay: 20, perUserHour: 1 },
    () => now,
  );
  await (
    await quota.acquire("alice")
  )();
  await assert.rejects(quota.acquire("alice"), /hourly/);
  await (
    await quota.acquire("bob")
  )();
  now += 3600_001;
  await (
    await quota.acquire("alice")
  )();
});
test("an expired worker cannot release another worker's active lease", async () => {
  let now = Date.now();
  const quota = createGenerationQuota(
    connection.db,
    { perMinute: 100, perDay: 20, perUserHour: 6 },
    () => now,
  );
  const old = await quota.acquire("alice");
  now += 180_001;
  const current = await quota.acquire("bob");
  await old();
  await assert.rejects(quota.acquire("carol"), /Another trip/);
  await current();
  await (
    await quota.acquire("carol")
  )();
});
test("invalid resource-limit configuration fails closed", () => {
  assert.deepEqual(generationLimitsFromEnv({}), {
    perMinute: 2,
    perDay: 20,
    perUserHour: 6,
  });
  for (const value of ["0", "-1", "Infinity", "abc", "1.5", "100001"])
    assert.throws(() =>
      generationLimitsFromEnv({ GENERATION_GLOBAL_RPM: value }),
    );
});
test("auth rate-limit cleanup cannot erase generation quota", async () => {
  const quota = createGenerationQuota(connection.db, {
    perMinute: 100,
    perDay: 1,
    perUserHour: 6,
  });
  await (
    await quota.acquire("alice")
  )();
  await connection.db.delete(authRateLimit);
  await assert.rejects(quota.acquire("bob"), /Today/);
});
test("editorial example uses the real schedule/budget validation without fabricated AI provenance", () => {
  const { schemaVersion, base, reserveMinor, totalMinor, budget, ...plan } =
    exampleItinerary;
  assert.equal(schemaVersion, 2);
  assert.equal(budget?.kind, "planning-only");
  assert.equal(base.city, "Paris");
  const input = {
    ...plan,
    days: plan.days.map((day) => ({
      date: day.date,
      title: day.title,
      activities: day.activities.map(({ id, ...activity }) => {
        assert.ok(id.startsWith("example-"));
        return activity;
      }),
    })),
  };
  const checked = validateItinerary(input, exampleIntent, base);
  assert.equal(checked.totalMinor, totalMinor);
  assert.equal(checked.reserveMinor, reserveMinor);
  assert.equal(totalMinor, 44000);
  assert.ok(!Object.hasOwn(exampleItinerary, "model"));
  assert.ok(!Object.hasOwn(exampleItinerary, "generatedAt"));
});

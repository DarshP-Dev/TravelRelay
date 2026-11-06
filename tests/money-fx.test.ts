import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  parseMoney,
  convertMinor,
  amountText,
  decimalRatio,
  exactSum,
} from "../src/lib/money";
import { openDatabase } from "../src/server/db/connection";
import { createFxService } from "../src/server/fx";
import { fxSnapshot } from "../src/server/db/schema";
let connection: Awaited<ReturnType<typeof openDatabase>>;
before(async () => {
  mock.method(globalThis, "fetch", async () => {
    throw Error("No live requests in money/FX tests");
  });
  await mkdir(".test-data", { recursive: true });
  connection = await openDatabase({
    directory: await mkdtemp(path.resolve(".test-data/fx-")),
  });
  await connection.migrate();
});
after(async () => {
  await connection.close();
  mock.restoreAll();
});
test("money parsing and formatting respect zero/2 decimals without floating point", () => {
  assert.equal(parseMoney("0.29", "EUR"), 29);
  assert.equal(parseMoney("12.5", "USD"), 1250);
  assert.equal(parseMoney("1500", "JPY"), 1500);
  assert.equal(amountText(1, "USD"), "0.01");
  assert.equal(amountText(1, "JPY"), "1");
  for (const [a, c] of [
    ["1.2", "JPY"],
    ["1.001", "EUR"],
    ["1e5", "USD"],
    ["-1", "EUR"],
    ["NaN", "EUR"],
    [" 1", "EUR"],
  ] as const)
    assert.throws(() => parseMoney(a, c));
});
test("FX uses exact decimal ratios and deterministic half-up rounding across currency precisions", () => {
  assert.equal(convertMinor(100, "EUR", "JPY", "162.5"), 163);
  assert.equal(convertMinor(100, "JPY", "EUR", "0.00615"), 62);
  assert.equal(convertMinor(1, "USD", "EUR", "0.5"), 1);
  assert.equal(convertMinor(10000, "USD", "EUR", "0.923456789012345678"), 9235);
  assert.equal(convertMinor(100, "EUR", "USD", "1e-2"), 1);
  assert.throws(() => decimalRatio("0"));
  assert.throws(() => decimalRatio("Infinity"));
  assert.throws(() => convertMinor(Number.MAX_SAFE_INTEGER, "USD", "EUR", "2"));
  assert.throws(() => exactSum([Number.MAX_SAFE_INTEGER, 1]));
});
test("Frankfurter ECB response is validated, cached persistently and retains the raw rate decimal", async () => {
  let calls = 0;
  const clock = () => Date.now();
  const fx = createFxService(connection.db, {
    clock,
    fetch: async (input) => {
      calls++;
      assert.equal(
        String(input),
        "https://api.frankfurter.dev/v2/rate/USD/EUR?providers=ecb",
      );
      return new Response(
        `{"base":"USD","quote":"EUR","date":"${new Date().toISOString().slice(0, 10)}","rate":0.923456789012345678}`,
      );
    },
  });
  const a = await fx.quote("USD", "EUR"),
    b = await fx.quote("USD", "EUR");
  assert.equal(calls, 1);
  assert.equal(a.snapshot.id, b.snapshot.id);
  assert.equal(a.snapshot.rate, "0.923456789012345678");
  assert.equal(a.stale, false);
  assert.equal((await fx.stored(a.snapshot.id)).rate, a.snapshot.rate);
  await assert.rejects(
    connection.db
      .update(fxSnapshot)
      .set({ rate: "2" })
      .where(eq(fxSnapshot.id, a.snapshot.id)),
    /append-only|Failed query/,
  );
  await assert.rejects(
    connection.db.delete(fxSnapshot).where(eq(fxSnapshot.id, a.snapshot.id)),
    /append-only|Failed query/,
  );
});
test("same currency conversion is an explicit identity snapshot with no provider request", async () => {
  const fx = createFxService(connection.db, {
    fetch: async () => {
      throw Error("identity must not fetch");
    },
  });
  const q = await fx.quote("EUR", "EUR");
  assert.equal(q.snapshot.provider, "identity");
  assert.equal(q.snapshot.rate, "1");
  assert.equal(q.stale, false);
});
test("outages preserve labeled stale cached rates but fail safely with no usable rate", async () => {
  let time = Date.now(),
    calls = 0,
    down = false;
  const fx = createFxService(connection.db, {
    clock: () => time,
    fetch: async () => {
      calls++;
      if (down) throw Error("offline");
      return Response.json({
        base: "GBP",
        quote: "EUR",
        date: new Date(time).toISOString().slice(0, 10),
        rate: 1.17,
      });
    },
  });
  const first = await fx.quote("GBP", "EUR");
  time += 3_600_001;
  down = true;
  const stale = await fx.quote("GBP", "EUR");
  assert.equal(stale.snapshot.id, first.snapshot.id);
  assert.equal(stale.stale, true);
  assert.match(stale.warning!, /stale/);
  await fx.quote("GBP", "EUR");
  assert.equal(calls, 2, "failure cooldown avoids provider hammering");
  time += 8 * 86_400_000;
  await assert.rejects(fx.quote("GBP", "EUR"), /unavailable/);
  const missing = createFxService(connection.db, {
    fetch: async () => Response.json({ error: "no rate" }, { status: 422 }),
  });
  await assert.rejects(missing.quote("AUD", "JPY"), /unavailable/);
});
test("concurrent FX lookups share the SQL lease and malformed/oversized replies never create invented rates", async () => {
  let calls = 0,
    release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const fx = createFxService(connection.db, {
    fetch: async () => {
      calls++;
      await gate;
      return Response.json({
        base: "CAD",
        quote: "JPY",
        date: new Date().toISOString().slice(0, 10),
        rate: 110,
      });
    },
  });
  const one = fx.quote("CAD", "JPY");
  await new Promise((r) => setTimeout(r, 50));
  await assert.rejects(fx.quote("CAD", "JPY"), /running|cooling/);
  release();
  await one;
  assert.equal(calls, 1);
  const bad = createFxService(connection.db, {
    fetch: async () => new Response("x".repeat(17_000)),
  });
  await assert.rejects(bad.quote("JPY", "CAD"), /unavailable/);
});

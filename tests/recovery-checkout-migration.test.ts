import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import { openDatabase } from "../src/server/db/connection";
import { createApplication } from "../src/server/application";
import {
  financialEvent,
  fxSnapshot,
  paypalBooking,
  paypalOperation,
  tripWallet,
  walletIntent,
} from "../src/server/db/schema";
import { solRecording } from "./helpers/sol-recording";

test("0010 to 0011 upgrade preserves original quotes, capture/refund ledger and booking rows; reapplying is safe", async () => {
  const root = await mkdtemp(path.resolve(".test-data/recovery-migration-"));
  const old = path.join(root, "old-migrations");
  await mkdir(path.join(old, "meta"), { recursive: true });
  const journal = JSON.parse(
    await readFile("drizzle/meta/_journal.json", "utf8"),
  );
  journal.entries = journal.entries.filter((e: { idx: number }) => e.idx <= 10);
  await writeFile(
    path.join(old, "meta/_journal.json"),
    JSON.stringify(journal),
  );
  for (const entry of journal.entries)
    await cp(
      "drizzle/" + entry.tag + ".sql",
      path.join(old, entry.tag + ".sql"),
    );
  const connection = await openDatabase({ directory: path.join(root, "db") });
  try {
    await migrate(connection.db as Parameters<typeof migrate>[0], {
      migrationsFolder: old,
    });
    const db = connection.db;
    const app = createApplication(db, {
      origin: "http://localhost:3000",
      secret: "offline-migration-secret-with-sufficient-length",
    });
    const signup = await app.auth.api.signUpEmail({
      body: {
        name: "Offline migration",
        email: "migration@example.invalid",
        password: "offline-only-migration-password",
      },
    });
    const owner = signup.user.id;
    const draft = await app.trips.openDraft(owner, {});
    const trip = await app.trips.complete(owner, draft.id, {
      version: draft.version,
      data: solRecording.intent,
    });
    const id = randomUUID(),
      activity = randomUUID(),
      fxId = randomUUID(),
      bookingId = randomUUID();
    const fx = {
      id: fxId,
      base: "USD" as const,
      quote: "EUR" as const,
      rate: "0.89566",
      provider: "frankfurter-ecb" as const,
      sourceDate: "2026-11-06",
      retrievedAt: "2026-11-08T06:00:00Z",
      expiresAt: "2026-11-08T07:00:00Z",
      sourceUrl: "https://api.frankfurter.dev/v2/rate/USD/EUR?providers=ecb",
      rounding: "half-up-per-line" as const,
    };
    await db
      .insert(tripWallet)
      .values({ tripId: trip.id, userId: owner, localCurrency: "EUR" });
    await db.insert(fxSnapshot).values({
      id: fxId,
      base: "USD",
      quote: "EUR",
      rate: fx.rate,
      provider: fx.provider,
      data: fx,
      retrievedAt: new Date(fx.retrievedAt),
      expiresAt: new Date(fx.expiresAt),
    });
    await db.execute(
      sql`INSERT INTO wallet_intent (id, trip_id, user_id, activity_id, category, title, supplier, original_currency, original_minor, display_currency, estimated_display_minor, fx_snapshot_id, fx, itinerary_version, activity_snapshot) VALUES (${id}, ${trip.id}, ${owner}, ${activity}, 'activities', 'Offline original', 'Offline demo', 'USD', 500, 'EUR', 448, ${fxId}, ${JSON.stringify(fx)}::jsonb, 3, '{}'::jsonb)`,
    );
    await db.insert(paypalBooking).values({
      id: bookingId,
      intentId: id,
      tripId: trip.id,
      userId: owner,
      activityId: activity,
      merchantId: "OFFLINE-MERCHANT",
      orderId: "OFFLINE-ORDER",
      captureId: "OFFLINE-CAPTURE",
    });
    for (const kind of ["order", "capture", "refund"] as const)
      await db.insert(paypalOperation).values({
        id: randomUUID(),
        bookingId,
        kind,
        requestedMinor: 500,
        status: "verified",
        providerStatus: kind === "capture" ? "REFUNDED" : "COMPLETED",
      });
    for (const [index, kind] of (
      ["captured", "refund_completed"] as const
    ).entries())
      await db.insert(financialEvent).values({
        tripId: trip.id,
        userId: owner,
        intentId: id,
        sequence: index + 1,
        kind,
        provider: "paypal-sandbox",
        verification: "provider-api",
        providerEventId: kind,
        operationKey: kind,
        reconciliationRef: kind,
        originalCurrency: "USD",
        amountMinor: 500,
        displayCurrency: "EUR",
        estimatedDisplayMinor: 448,
        estimatedFeeMinor: 0,
        orderId: "OFFLINE-ORDER",
        captureId: "OFFLINE-CAPTURE",
        refundId: index ? "OFFLINE-REFUND" : null,
        fx,
        occurredAt: new Date(),
      });
    const before = {
      intents: (
        await db.execute(sql`select to_jsonb(i) as data from wallet_intent i`)
      ).rows,
      events: await db.select().from(financialEvent),
      bookings: await db.select().from(paypalBooking),
      operations: await db.select().from(paypalOperation),
    };
    await connection.migrate();
    await connection.migrate();
    const after = await db.select().from(walletIntent);
    const original = before.intents[0].data as Record<string, unknown>;
    const restored = (
      await db.execute(
        sql`select to_jsonb(i) - 'purpose' - 'recovery_case_id' - 'planning_estimate_minor' as data from wallet_intent i`,
      )
    ).rows[0].data;
    assert.deepEqual(restored, original);
    assert.equal(after[0].purpose, "planning");
    assert.equal(after[0].recoveryCaseId, null);
    assert.equal(after[0].planningEstimateMinor, null);
    assert.deepEqual(await db.select().from(financialEvent), before.events);
    assert.deepEqual(await db.select().from(paypalBooking), before.bookings);
    assert.deepEqual(
      await db.select().from(paypalOperation),
      before.operations,
    );
    await assert.rejects(
      db.update(walletIntent).set({ planningEstimateMinor: 448 }),
    );
  } finally {
    await connection.close();
  }
});

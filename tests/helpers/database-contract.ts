import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { prepareOfflineSolReview } from "./offline-sol-review";
import { assertDatabaseReady } from "../../src/server/db/readiness";
import { financialEvent, generationQuota } from "../../src/server/db/schema";

// Reused unchanged by local PostgreSQL-compatible tests and the separately
// approved disposable hosted PostgreSQL check. All model data is recorded.
export async function databaseContract(directory: string, url?: string) {
  const seed = await prepareOfflineSolReview(
    directory,
    "https://qa.example.invalid",
    undefined,
    url,
  );
  try {
    const { db } = seed.connection;
    await seed.worker();
    await assertDatabaseReady(db);
    const draft = await seed.app.trips.openDraft(seed.userId, {});
    const saves = await Promise.allSettled(
      [1, 2].map((step) =>
        seed.app.trips.saveDraft(seed.userId, draft.id, {
          version: draft.version,
          data: { ...draft.data, departure: "Toronto", step },
        }),
      ),
    );
    assert.equal(saves.filter((s) => s.status === "fulfilled").length, 1);
    assert.equal(saves.filter((s) => s.status === "rejected").length, 1);
    await assert.rejects(seed.app.trips.read("foreign-owner", seed.trip.id), {
      status: 404,
    });
    const rollbackKey = "rollback:" + randomUUID();
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.insert(generationQuota).values({
          id: randomUUID(),
          key: rollbackKey,
          count: 1,
          lastRequest: 1,
        });
        throw Error("deliberate rollback");
      }),
      /deliberate rollback/,
    );
    assert.equal(
      (
        await db
          .select()
          .from(generationQuota)
          .where(eq(generationQuota.key, rollbackKey))
      ).length,
      0,
    );
    const wallet = await seed.app.wallet.read(seed.userId, seed.trip.id);
    const activity = wallet.activities.find(
      (a) => a.dayIndex === 1 && a.activityIndex === 2,
    )!;
    const data = {
      activityId: activity.id,
      amount: "4.00",
      currency: "EUR",
      supplier: "Offline database contract, no reservation",
      itineraryVersion: wallet.itineraryVersion,
      walletVersion: wallet.version,
    };
    const preview = (
      await seed.app.wallet.action(seed.userId, seed.trip.id, {
        action: "preview_quote",
        ...data,
      })
    ).preview!;
    await seed.app.wallet.action(seed.userId, seed.trip.id, {
      action: "save_quote",
      ...data,
      mutationId: randomUUID(),
      fxSnapshotId: preview.fx.snapshot.id,
    });
    const events = await db.select().from(financialEvent);
    assert.equal(events.length, 1);
    assert.equal(events[0].provider, "planning");
    await assert.rejects(db.update(financialEvent).set({ amountMinor: 1 }));
    await assert.rejects(db.delete(financialEvent));
    const copy = { ...events[0], id: randomUUID() };
    await assert.rejects(db.insert(financialEvent).values(copy));
    await assert.rejects(
      db.insert(financialEvent).values({
        ...copy,
        userId: "foreign-owner",
        sequence: 2,
        operationKey: randomUUID(),
        providerEventId: randomUUID(),
      }),
    );
    await seed.connection.migrate();
    await seed.connection.migrate();
    await assertDatabaseReady(db);
    assert.deepEqual(await db.select().from(financialEvent), events);
    assert.equal(
      (await seed.app.wallet.read(seed.userId, seed.trip.id)).summary
        .actualHomeMinor,
      0,
    );
    assert.equal(
      Number(
        (
          await db.execute(
            sql`select count(*) as count from drizzle.__drizzle_migrations`,
          )
        ).rows[0].count,
      ),
      12,
    );
    return {
      migrations: 12,
      atomicDraftWrites: true,
      rollback: true,
      ownership: true,
      immutableLedger: true,
      uniqueEvents: true,
      replayPreservesRecords: true,
      liveRequests: 0,
    };
  } finally {
    await seed.close();
  }
}

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { trip } from "../src/server/db/schema";
import { createApplication } from "../src/server/application";
import { prepareOfflineSolReview } from "../tests/helpers/offline-sol-review";
import { solRecording } from "../tests/helpers/sol-recording";

globalThis.fetch = async () => {
  throw Error("No external network during Sandbox QA seeding.");
};
await mkdir(".test-data", { recursive: true });
const directory = await mkdtemp(path.resolve(".test-data/paypal-ui-review-"));
const seed = await prepareOfflineSolReview(directory, "http://127.0.0.1:3002");
try {
  await seed.worker();
  const app = createApplication(seed.connection.db, {
    ...seed.config,
    fxFetch: async () =>
      Response.json({
        base: "USD",
        quote: "EUR",
        rate: 0.8,
        date: new Date().toISOString().slice(0, 10),
      }),
  });
  const d = await app.trips.openDraft(seed.userId, {});
  const browserTrip = await app.trips.complete(seed.userId, d.id, {
    version: d.version,
    data: solRecording.intent,
  });
  const original = (await app.trips.read(seed.userId, seed.trip.id)).itinerary!;
  await seed.connection.db
    .update(trip)
    .set({ itinerary: original })
    .where(eq(trip.id, browserTrip.id));
  for (const id of [seed.trip.id, browserTrip.id]) {
    const wallet = await app.wallet.read(seed.userId, id);
    const quote = {
      activityId: wallet.activities[1].id,
      currency: "USD",
      amount: "5.00",
      supplier: "Sandbox demonstration (offline test fixture)",
      walletVersion: wallet.version,
      itineraryVersion: wallet.itineraryVersion,
    };
    const result = await app.wallet.action(seed.userId, id, {
      action: "preview_quote",
      ...quote,
    });
    assert.ok(result.preview);
    await app.wallet.action(seed.userId, id, {
      action: "save_quote",
      ...quote,
      fxSnapshotId: result.preview.fx.snapshot.id,
      mutationId: randomUUID(),
    });
  }
  await writeFile(
    ".test-data/paypal-qa-server.json",
    JSON.stringify({
      origin: seed.origin,
      directory,
      secret: seed.secret,
      email: seed.email,
      password: seed.password,
      tripId: seed.trip.id,
      browserTripId: browserTrip.id,
    }),
    { mode: 0o600 },
  );
  console.log(
    "Prepared two isolated Paris fixture trips. No provider traffic.",
  );
} finally {
  await seed.close();
}

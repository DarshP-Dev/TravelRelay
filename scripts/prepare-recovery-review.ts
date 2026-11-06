import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { createApplication } from "../src/server/application";
import { prepareOfflineSolReview } from "../tests/helpers/offline-sol-review";

globalThis.fetch = async () => {
  throw Error("External network is blocked during recovery QA seeding.");
};
await mkdir(".test-data", { recursive: true });
const directory = await mkdtemp(
  path.resolve(".test-data/paypal-ui-review-recovery-"),
);
const seed = await prepareOfflineSolReview(directory, "http://127.0.0.1:3003");
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
  const tripId = seed.trip.id;
  const wallet = await app.wallet.read(seed.userId, tripId);
  const activity = wallet.activities.find(
    (item) => item.dayIndex === 1 && item.activityIndex === 2,
  )!;
  const data = {
    activityId: activity.id,
    currency: "USD",
    amount: "5.00",
    supplier: "Offline recovery QA demonstration",
    walletVersion: wallet.version,
    itineraryVersion: wallet.itineraryVersion,
  };
  const { preview } = await app.wallet.action(seed.userId, tripId, {
    ...data,
    action: "preview_quote",
  });
  assert.ok(preview);
  await app.wallet.action(seed.userId, tripId, {
    ...data,
    action: "save_quote",
    fxSnapshotId: preview.fx.snapshot.id,
    mutationId: randomUUID(),
  });
  await writeFile(
    ".test-data/recovery-qa-server.json",
    JSON.stringify({
      origin: seed.origin,
      directory,
      secret: seed.secret,
      email: seed.email,
      password: seed.password,
      tripId,
      activityId: activity.id,
    }),
    { mode: 0o600 },
  );
  console.log(
    "Prepared an isolated, unpaid recovery QA trip using the recorded itinerary.",
  );
} finally {
  await seed.close();
}

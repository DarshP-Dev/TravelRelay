import { prepareOfflineSolReview } from "./offline-sol-review";

globalThis.fetch = async () => {
  throw Error("External APIs are blocked in worker termination tests.");
};
const directory = process.argv[2];
if (!directory?.includes("infrastructure-kill-"))
  throw Error("An isolated test directory is required.");
// Keep the mock transport in flight until the parent hard-terminates this process.
setInterval(() => {}, 1000);
const seed = await prepareOfflineSolReview(
  directory,
  "https://qa.example.invalid",
  () => {
    process.send?.({
      userId: seed.userId,
      tripId: seed.trip.id,
      secret: seed.secret,
    });
    return new Promise(() => {});
  },
);
await seed.worker();

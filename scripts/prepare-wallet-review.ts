import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { prepareOfflineSolReview } from "../tests/helpers/offline-sol-review";
// Reuse the accepted Paris recording; never contact a generation provider.
globalThis.fetch = async () => {
  throw Error("No external transport during wallet QA seeding.");
};
await mkdir(".test-data", { recursive: true });
const directory = await mkdtemp(path.resolve(".test-data/wallet-ui-review-"));
const state = await prepareOfflineSolReview(directory, "http://127.0.0.1:3001");
await state.worker();
const wallet = await state.app.wallet.read(state.userId, state.trip.id);
await writeFile(
  ".test-data/wallet-qa-server.json",
  JSON.stringify({
    origin: state.origin,
    directory,
    secret: state.secret,
    email: state.email,
    password: state.password,
    tripId: state.trip.id,
  }),
  { mode: 0o600 },
);
await state.close();
console.log(
  JSON.stringify({
    seeded: true,
    tripId: state.trip.id,
    paidModelRequests: 0,
    financialEvents: wallet.events.length,
    budget: wallet.budget.selectedBudgetMinor,
    reserve: wallet.budget.reserveMinor,
    unallocated: wallet.budget.remainingMinor,
  }),
);

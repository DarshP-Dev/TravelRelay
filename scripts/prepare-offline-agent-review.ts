import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  prepareOfflineSolReview,
  verifyOfflineSolReview,
} from "../tests/helpers/offline-sol-review";
// QA-only seed. The real Sol recording is replayed locally; no external calls.
globalThis.fetch = async () => {
  throw Error(
    "No external transport is permitted while preparing offline agent QA.",
  );
};
const root = path.resolve(".test-data");
await mkdir(root, { recursive: true });
const directory = await mkdtemp(path.join(root, "agent-ui-review-"));
const state = await prepareOfflineSolReview(directory, "http://127.0.0.1:3001");
await state.worker();
const verified = await verifyOfflineSolReview(state);
await state.close();
await writeFile(
  path.join(root, "agent-qa-server.json"),
  JSON.stringify({
    origin: state.origin,
    databaseDirectory: directory,
    secret: state.secret,
    email: state.email,
    password: state.password,
    tripId: state.trip.id,
  }),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    passed: true,
    liveRequests: 0,
    kind: "isolated offline agent QA",
    tripId: state.trip.id,
    checks: verified.checks,
  }),
);

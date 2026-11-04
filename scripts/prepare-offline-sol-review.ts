import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {
  prepareOfflineSolReview,
  verifyOfflineSolReview,
} from "../tests/helpers/offline-sol-review";
import { solRecording } from "../tests/helpers/sol-recording";

// Manual local UI QA only. No runtime fallback or network/model transport exists.
globalThis.fetch = async () => {
  throw Error("Network/model requests are forbidden in offline replay.");
};
const root = path.resolve(".test-data");
await mkdir(root, { recursive: true });
const directory = await mkdtemp(path.join(root, "sol-ui-review-"));
const historicalPath = path.join(
  root,
  "live-openai-paris-quality-result-2026-11-04.json",
);
const historicalBytes = await readFile(historicalPath);
const historicalSha256 = createHash("sha256")
  .update(historicalBytes)
  .digest("hex");
assert.deepEqual(
  JSON.parse(historicalBytes.toString()).providerOutputs[1],
  solRecording.plan,
);
const state = await prepareOfflineSolReview(directory, "http://127.0.0.1:3001");
await state.worker();
const verified = await verifyOfflineSolReview(state);
assert.equal(
  createHash("sha256")
    .update(await readFile(historicalPath))
    .digest("hex"),
  historicalSha256,
);
const report = {
  testedAt: new Date().toISOString(),
  kind: "offline-reprocessing-of-real-recording",
  sourceModel: "gpt-6.1-sol",
  liveRequests: 0,
  originalFailedReportSha256: historicalSha256,
  rawPlanSha256: solRecording.provenance.rawPlanSha256,
  tripId: state.trip.id,
  databaseDirectory: directory,
  ...verified,
};
await writeFile(
  path.join(root, "sol-offline-acceptance-latest.json"),
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
await writeFile(
  path.join(root, "sol-review-server.json"),
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
    historicalFailurePreserved: true,
    exactRecordedPlan: true,
    tripId: state.trip.id,
    checks: verified.checks,
    reportPath: path.join(root, "sol-offline-acceptance-latest.json"),
  }),
);

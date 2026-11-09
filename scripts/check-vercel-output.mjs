// Inspect Next's actual production manifests. This does not call Vercel or
// claim to run the final hosted packaging adapter.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const config = json("vercel.json");
assert.equal(config.framework, "nextjs");
assert.equal(config.fluid, true);
assert.equal(config.git.deploymentEnabled, false);
assert.equal(json("package.json").engines.node, "24.x");
assert.equal(
  config.functions,
  undefined,
  "Use the App Router's duration exports.",
);
const { functions } = json(".next/server/functions-config-manifest.json");
const durations = {
  "/api/trips/[id]/generation": 240,
  "/api/trips/[id]/assistant": 240,
  "/api/trips/[id]/recovery": 240,
  "/api/trips/[id]/commerce": 60,
  "/api/paypal/webhook": 60,
  "/api/health": 30,
  "/api/trips/[id]/wallet": 30,
};
for (const [route, seconds] of Object.entries(durations))
  assert.equal(functions[route]?.maxDuration, seconds, route);
assert.ok(
  Object.values(functions).every((entry) => (entry.maxDuration ?? 300) <= 300),
);

const root = path.resolve(".next/server");
const entries = json(path.join(root, "app-paths-manifest.json"));
const sizes = new Map();
const privatePath =
  /(^|\/)(?:\.env(?:\..*)?|\.data|\.test-data|\.vercel)(?:\/|$)/;
const migrations = json("drizzle/meta/_journal.json").entries;
let biggest = 0;
let traces = 0;
let healthTraced = false;
for (const [route, entry] of Object.entries(entries)) {
  const trace = path.join(root, entry + ".nft.json");
  const files = new Set(
    json(trace).files.map((file) => path.resolve(path.dirname(trace), file)),
  );
  files.add(path.join(root, entry));
  let total = 0;
  for (const file of files) {
    const relative = path
      .relative(process.cwd(), file)
      .split(path.sep)
      .join("/");
    assert.ok(!privatePath.test(relative), `Private input in ${route} trace`);
    if (!sizes.has(file)) sizes.set(file, statSync(file).size);
    total += sizes.get(file);
  }
  if (route === "/api/health/route") {
    healthTraced = true;
    for (const file of [
      "meta/_journal.json",
      ...migrations.map((row) => row.tag + ".sql"),
    ])
      assert.ok(
        files.has(path.resolve("drizzle", file)),
        `Missing traced migration ${file}`,
      );
  }
  biggest = Math.max(biggest, total);
  traces++;
}
assert.ok(
  biggest < 250_000_000,
  "A single uncompressed Next trace exceeds the 250 MB packaging budget.",
);
assert.equal(migrations.length, 12);
assert.ok(healthTraced, "Missing the Node health route trace.");
console.log(
  JSON.stringify({
    durations,
    traces,
    migrations: migrations.length,
    largestTraceBytes: biggest,
    privateFilesTraced: 0,
  }),
);

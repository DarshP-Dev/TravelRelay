import assert from "node:assert/strict";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
// Use only with prepare-offline-agent-review + the guarded offline preloader.
const qa = JSON.parse(
  await readFile(".test-data/agent-qa-server.json", "utf8"),
);
assert.ok(["127.0.0.1", "localhost"].includes(new URL(qa.origin).hostname));
assert.ok(String(qa.databaseDirectory).includes("agent-ui-review-"));
const endpoint = qa.origin + `/api/trips/${qa.tripId}/assistant`;
let assertions = 0;
const equal = (actual: unknown, expected: unknown) => {
  assert.deepEqual(actual, expected);
  assertions++;
};
const ok = (value: unknown) => {
  assert.ok(value);
  assertions++;
};
const cookies = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join(";");
const login = await fetch(qa.origin + "/api/auth/sign-in/email", {
  method: "POST",
  headers: { origin: qa.origin, "content-type": "application/json" },
  body: JSON.stringify({ email: qa.email, password: qa.password }),
});
equal(login.status, 200);
const cookie = cookies(login);
const request = (
  body?: unknown,
  auth = cookie,
  origin = qa.origin,
  url = endpoint,
) =>
  fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin, cookie: auth, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function current() {
  const r = await request();
  equal(r.status, 200);
  return r.json();
}
async function settled() {
  for (let i = 0; i < 100; i++) {
    const s = await current();
    if (!s.activeTurnId) return s;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Offline response failed to settle within 10 seconds.");
}
equal((await request(undefined, "")).status, 401);
equal((await request({ action: "send" }, "")).status, 401);
const original = await current();
equal(
  (
    await request(
      { action: "draft", version: original.draftVersion, text: "Wrong origin" },
      cookie,
      "https://untrusted.example",
    )
  ).status,
  403,
);
equal(
  (await request({ action: "arbitrary_tool", owner: "other" })).status,
  400,
);
equal(
  (
    await request({
      action: "draft",
      version: original.draftVersion,
      text: "x".repeat(21000),
    })
  ).status,
  413,
);
const draft = await request({
  action: "draft",
  version: original.draftVersion,
  text: "[OFFLINE QA] API draft",
});
equal(draft.status, 200);
const draftState = await draft.json();
equal(
  (
    await request({
      action: "draft",
      version: original.draftVersion,
      text: "stale",
    })
  ).status,
  409,
);
const command = {
  action: "send",
  mutationId: randomUUID(),
  draftVersion: draftState.draftVersion,
  text: "[OFFLINE QA] Suggest a cheaper dinner.",
};
const queued = await request(command);
equal(queued.status, 202);
equal(queued.headers.get("cache-control"), "no-store");
let state = await settled();
const last = state.turns.at(-1);
equal(last.status, "ready");
ok(last.response.answer.startsWith("OFFLINE QA FIXTURE"));
ok(last.proposal);
equal(last.proposal.status, "pending");
equal(state.currentVersion, original.currentVersion);
equal(last.audits[0].usage.inputTokens, 1200);
equal(last.audits[0].usage.outputTokens, 800);
equal(last.audits[0].usage.reasoningTokens, 300);
equal(last.audits[0].usage.estimatedCostUsd, 0.0104);
const p = last.proposal,
  identity = { proposalId: p.id, revision: p.revision };
equal((await request(command)).status, 200);
equal((await current()).totalTurns, state.totalTurns);
const signup = await fetch(qa.origin + "/api/auth/sign-up/email", {
  method: "POST",
  headers: { origin: qa.origin, "content-type": "application/json" },
  body: JSON.stringify({
    name: "Offline agent isolation QA",
    email: `agent-http-${randomUUID()}@example.com`,
    password: qa.password,
  }),
});
equal(signup.status, 200);
const foreign = cookies(signup);
equal((await request(undefined, foreign)).status, 404);
equal((await request({ action: "approve", ...identity }, foreign)).status, 404);
equal(
  (await request({ action: "refresh_preview", ...identity }, foreign)).status,
  404,
);
equal((await request({ action: "reject", ...identity }, foreign)).status, 404);
equal((await request({ action: "approve", ...identity })).status, 200);
state = await current();
equal(state.currentVersion, original.currentVersion + 1);
equal(state.turns.at(-1).proposal.status, "approved");
equal(state.budget.reserveMinor, original.budget.reserveMinor);
equal(state.budget.remainingMinor, p.preview.afterBudget.remainingMinor);
equal((await request({ action: "approve", ...identity })).status, 200);
equal((await current()).currentVersion, state.currentVersion);
const editorUrl = qa.origin + `/api/trips/${qa.tripId}/itinerary`;
const editor = await (
  await request(undefined, cookie, qa.origin, editorUrl)
).json();
equal(editor.history[0].source, "ai-proposal");
equal(editor.history[0].proposalId, p.id);
const undo = await request(
  {
    version: editor.version,
    mutationId: randomUUID(),
    operation: { action: "restore", editId: editor.history[0].id },
  },
  cookie,
  qa.origin,
  editorUrl,
);
equal(undo.status, 200);
equal(
  (await undo.json()).itinerary.budget.remainingMinor,
  original.budget.remainingMinor,
);
const s = await current();
const quota = await request({
  action: "send",
  mutationId: randomUUID(),
  draftVersion: s.draftVersion,
  text: "[OFFLINE QA] offline quota",
});
equal(quota.status, 202);
const failed = await settled();
equal(failed.turns.at(-1).status, "failed");
equal(failed.turns.at(-1).audits[0].usage, null);
equal(failed.currentVersion, original.currentVersion + 2);
const savedDraft = await request({
  action: "draft",
  version: failed.draftVersion,
  text: "[OFFLINE QA] Restored after sign-in",
});
equal(savedDraft.status, 200);
equal((await current()).draft, "[OFFLINE QA] Restored after sign-in");
for (const route of [
  "/",
  "/explore",
  "/dashboard",
  "/trips",
  `/trips/${qa.tripId}`,
  `/trips/${qa.tripId}/itinerary`,
]) {
  const r = await request(undefined, cookie, qa.origin, qa.origin + route);
  equal(r.status, 200);
  ok((await r.text()).includes("TravelRelay"));
}
const values = [
  ...(await readFile(".env.local", "utf8")).matchAll(
    /^\s*([A-Z0-9_]*(?:KEY|SECRET|PASSWORD|DATABASE_URL)[A-Z0-9_]*)\s*=\s*(.*?)\s*$/gm,
  ),
]
  .map((m) => m[2].replace(/^['"]|['"]$/g, ""))
  .filter((s) => s.length >= 16);
values.push(qa.secret, qa.password);
const assets: string[] = [];
async function walk(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const p = directory + "/" + entry.name;
    if (entry.isDirectory()) await walk(p);
    else assets.push(p);
  }
}
await walk(".next/static");
for (const file of assets) {
  const bytes = await readFile(file);
  for (const value of values)
    assert.ok(
      !bytes.includes(Buffer.from(value)),
      `Credential boundary failure: ${file}`,
    );
  if (/\.(js|css)$/.test(file))
    assert.ok(
      !/api\.openai\.com|generativelanguage\.googleapis\.com/.test(
        bytes.toString(),
      ),
      "Frontend provider transport found",
    );
}
const report = {
  passed: true,
  assertions,
  publicAssetsChecked: assets.length,
  privateValuesChecked: values.length,
  liveModelRequests: 0,
  provider: "explicitly mocked official SDK transport",
};
await writeFile(
  ".test-data/milestone-3b-http-result.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));

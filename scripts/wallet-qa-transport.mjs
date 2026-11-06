// Explicit local QA guard. This is not imported by normal app runtime.
import { appendFile } from "node:fs/promises";
import assert from "node:assert/strict";
assert.equal(process.env.TRAVELRELAY_WALLET_QA, "true");
assert.ok(
  String(process.env.LOCAL_DATABASE_PATH).includes("wallet-ui-review-"),
);
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(process.env.APP_URL).hostname),
);
assert.equal(process.env.OPENAI_API_KEY, "blocked-wallet-qa-only");
const transport = globalThis.fetch;
let publicFxRequests = 0;
globalThis.fetch = async (request, init) => {
  const url = new URL(
    request instanceof Request ? request.url : String(request),
  );
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    return transport(request, init);
  assert.equal(
    url.origin,
    "https://api.frankfurter.dev",
    "AI/PayPal/other external traffic forbidden in 4A QA",
  );
  assert.match(
    url.pathname,
    /^\/v2\/rate\/(CAD|USD|EUR|GBP|JPY|AUD)\/(CAD|USD|EUR|GBP|JPY|AUD)$/,
  );
  assert.equal(url.search, "?providers=ecb");
  assert.equal(
    new Headers(
      init?.headers ?? (request instanceof Request ? request.headers : {}),
    ).has("authorization"),
    false,
  );
  assert.equal(
    publicFxRequests,
    0,
    "At most one free public FX request in this QA process",
  );
  publicFxRequests++;
  const started = performance.now(),
    response = await transport(request, init);
  const body = await response.clone().text();
  await appendFile(
    ".test-data/wallet-fx-network.jsonl",
    JSON.stringify({
      provider: "Frankfurter / ECB",
      url: url.href,
      status: response.status,
      latencyMs: Math.round(performance.now() - started),
      retrievedAt: new Date().toISOString(),
      body,
    }) + "\n",
  );
  return response;
};

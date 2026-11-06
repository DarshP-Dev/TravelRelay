// Isolated production QA. Import the fixture-only PayPal/FX network guard
// first, then add exactly one mocked Responses API route.
import assert from "node:assert/strict";
import "./paypal-qa-transport.mjs";
import { agentOpenAIWire } from "../tests/helpers/agent-fixtures.ts";
import { recoveryFixture } from "../tests/helpers/recovery-fixture.mjs";

assert.equal(process.env.TRAVELRELAY_RECOVERY_QA, "true");
assert.match(
  process.env.LOCAL_DATABASE_PATH ?? "",
  /paypal-ui-review-recovery-/,
);
const allowed = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.href !== "https://api.openai.com/v1/responses")
    return allowed(input, init);
  const request = new Request(input, init);
  assert.equal(request.method, "POST");
  const body = await request.json();
  assert.equal(body.model, "gpt-6.1-sol");
  assert.equal(body.reasoning.effort, "medium");
  assert.equal(body.store, false);
  assert.deepEqual(body.text.format.schema.required, ["alternatives"]);
  const context = JSON.parse(body.input);
  assert.equal(context.recovery.provenance, "sandbox-simulation");
  assert.equal(context.recovery.payment.capturedMinor, 500);
  return Response.json(agentOpenAIWire(recoveryFixture(context)));
};

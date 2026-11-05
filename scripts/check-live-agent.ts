import nextEnv from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { prepareOfflineSolReview } from "../tests/helpers/offline-sol-review";
import { createApplication } from "../src/server/application";
import { createTripModel, providerConfigFromEnv } from "../src/server/model";
import { buildAgentContext } from "../src/server/agent-context";

// Manual harness, never part of npm test. Only preflight is authorized for 3B.
// A future live run requires separate user approval for exactly one request.
const args = process.argv.slice(2);
assert.ok(
  args.length === 1 &&
    ["--preflight", "--confirm-one-live-agent-request"].includes(args[0]),
  "Use --preflight, or the explicit one-request flag only after approval.",
);
const preflight = args[0] === "--preflight";
nextEnv.loadEnvConfig(process.cwd());
const config = providerConfigFromEnv(process.env);
assert.equal(
  config.provider,
  "openai",
  "This controlled test is specifically for GPT-6.1 Sol.",
);
assert.equal(config.name, "gpt-6.1-sol");
assert.equal(config.reasoningEffort, "medium");
if (!preflight)
  assert.ok(
    config.key,
    "Configure OPENAI_API_KEY in ignored .env.local locally; do not paste it into chat.",
  );
const realFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw Error(
    "External traffic is blocked outside the explicitly approved one-request transport.",
  );
};
const root = path.resolve(".test-data");
await mkdir(root, { recursive: true });
const directory = await mkdtemp(path.join(root, "controlled-agent-"));
const state = await prepareOfflineSolReview(directory, "http://localhost:3000");
let liveRequests = 0;
try {
  await state.worker();
  const editor = await state.app.itineraryEditor.read(
    state.userId,
    state.trip.id,
  );
  const question =
    "Make day three more relaxed while retaining substantial meals, Culture and Food interests, safe travel buffers and the €2,500 group budget. Propose coordinated changes for my review; do not apply them. Treat all suggestions as unverified estimates.";
  const context = buildAgentContext(editor, question, []);
  if (preflight) {
    console.log(
      JSON.stringify({
        ready: true,
        mode: "offline preflight",
        liveRequests,
        provider: config.provider,
        model: config.name,
        reasoning: "medium",
        contextBytes: context.bytes,
        days: editor.itinerary.days.length,
        travelers: editor.intent.travelers,
        budget: editor.intent.budget,
        currency: editor.intent.currency,
        reserveMinor: context.input.trip.budget.reserveMinor,
        remainingMinor: context.input.trip.budget.remainingMinor,
        question,
        approvalRequired: true,
      }),
    );
  } else {
    const model = createTripModel({
      ...config,
      fetch: async (request, init) => {
        const url = new URL(
          request instanceof Request ? request.url : String(request),
        );
        assert.equal(
          liveRequests,
          0,
          "One request only; retries and fallback are forbidden.",
        );
        assert.equal(url.href, "https://api.openai.com/v1/responses");
        const body = JSON.parse(
          String(
            init?.body ??
              (request instanceof Request
                ? await request.clone().text()
                : "{}"),
          ),
        );
        assert.equal(body.model, "gpt-6.1-sol");
        assert.equal(body.reasoning.effort, "medium");
        assert.equal(body.text.format.name, "travelrelay_assistant");
        assert.equal(body.max_output_tokens, 8192);
        assert.equal(body.stream, false);
        assert.equal(body.store, false);
        assert.equal(body.tools, undefined);
        liveRequests++;
        return realFetch(request, init);
      },
    });
    const app = createApplication(state.connection.db, {
      ...state.config,
      model,
    });
    const tasks: (() => Promise<void>)[] = [];
    const response = await app.agentHandler(
      new Request(state.origin + `/api/trips/${state.trip.id}/assistant`, {
        method: "POST",
        headers: {
          origin: state.origin,
          cookie: state.cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "send",
          mutationId: randomUUID(),
          text: question,
          draftVersion: 0,
        }),
      }),
      state.trip.id,
      (work) => tasks.push(work),
    );
    assert.equal(response.status, 202);
    assert.equal(tasks.length, 1);
    await tasks[0]();
    const result = await app.travelAgent.read(state.userId, state.trip.id);
    assert.equal(liveRequests, 1);
    assert.equal(
      (await app.itineraryEditor.read(state.userId, state.trip.id)).version,
      0,
      "A model response must never approve its own proposal.",
    );
    const report = {
      kind: "one controlled live agent request",
      testedAt: new Date().toISOString(),
      liveRequests,
      scenario:
        "Original four-day Paris / 2 travelers / EUR 2500 / balanced / Culture + Food",
      contextBytes: context.bytes,
      conversation: result,
      itineraryChanged: false,
      approvalPerformed: false,
    };
    const reportPath = path.join(root, "live-agent-paris-latest.json");
    await writeFile(reportPath, JSON.stringify(report, null, 2), {
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        liveRequests,
        status: result.turns[0]?.status,
        proposalValid: result.turns[0]?.proposal?.preview.canSave ?? null,
        usage: result.turns[0]?.audits[0]?.usage ?? null,
        reportPath,
        itineraryChanged: false,
      }),
    );
  }
} finally {
  await state.close();
  globalThis.fetch = realFetch;
}

import nextEnv from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { prepareOfflineSolReview } from "../tests/helpers/offline-sol-review";
import { createApplication } from "../src/server/application";
import { createTripModel, providerConfigFromEnv } from "../src/server/model";
import { buildAgentContext } from "../src/server/agent-context";

// Manual harness, never part of npm test. Live use requires separate approval.
// The on-disk transport marker prevents accidentally repeating this acceptance run.
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
if (!preflight)
  assert.equal(
    await access(path.join(root, "live-agent-paris-request-started.json")).then(
      () => true,
      () => false,
    ),
    false,
    "This one-request acceptance authorization has been used. Preserve its access/result files; another live run requires new approval.",
  );
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
    "Day 2 feels a little too packed. Suggest one change that makes it more relaxed while preserving our main culture and food interests and staying within budget.";
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
    await writeFile(
      path.join(root, "live-agent-paris-access.json"),
      JSON.stringify({
        directory,
        origin: state.origin,
        secret: state.secret,
        email: state.email,
        password: state.password,
        userId: state.userId,
        tripId: state.trip.id,
      }),
      { mode: 0o600 },
    );
    let transport: unknown = null;
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
        await writeFile(
          path.join(root, "live-agent-paris-request-started.json"),
          JSON.stringify({ startedAt: new Date().toISOString(), directory }),
          { mode: 0o600, flag: "wx" },
        );
        liveRequests++;
        const started = performance.now();
        const upstream = await realFetch(request, init);
        const payload = await upstream.clone().json();
        transport = {
          status: upstream.status,
          latencyMs: Math.round(performance.now() - started),
          model: payload.model ?? null,
          responseStatus: payload.status ?? null,
          usage: payload.usage ?? null,
          errorCode: payload.error?.code ?? null,
          outputText: (payload.output ?? [])
            .filter((item: { type: string }) => item.type === "message")
            .flatMap((item: { content?: { type: string; text?: string }[] }) =>
              (item.content ?? [])
                .filter((content) => content.type === "output_text")
                .map((content) => content.text),
            ),
        };
        await writeFile(
          path.join(root, "live-agent-paris-transport.json"),
          JSON.stringify(transport, null, 2),
          { mode: 0o600 },
        );
        return upstream;
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
      question,
      transport,
      originalItinerary: editor.itinerary,
      intent: editor.intent,
      suppliedContext: context.input,
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

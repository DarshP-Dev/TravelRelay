import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import {
  createTripModel,
  providerConfigFromEnv,
  type ModelUsage,
} from "../src/server/model";
import type { AIProvider } from "../src/server/ai/contracts";
import { openDatabase } from "../src/server/db/connection";
import { createApplication } from "../src/server/application";
import type { TripIntent } from "../src/lib/trip-intent";
import type { ModelItinerary, CityProposal } from "../src/lib/itinerary";
const recording = JSON.parse(
  readFileSync(
    new URL("./fixtures/paris-quality-recorded.json", import.meta.url),
    "utf8",
  ),
) as { intent: TripIntent; base: CityProposal; plan: ModelItinerary };
const { intent, base } = recording;
function authoredCandidate() {
  const plan = structuredClone(recording.plan);
  plan.days[0].activities[1].startMinute = 1080;
  plan.days[2].activities[1].title =
    "Substantial bistro lunch on Rue de Bretagne";
  plan.days[2].activities[3].title = "French culinary tasting in Bastille";
  plan.days[3].activities[0].location = "Rue de Rivoli, Paris";
  return plan;
}
function openaiWire(output: unknown, extra: Record<string, unknown> = {}) {
  return {
    id: "resp_offline",
    object: "response",
    created_at: 1793820000,
    status: "completed",
    model: "gpt-6.1-sol",
    service_tier: "default",
    error: null,
    output: [
      {
        type: "message",
        id: "msg_offline",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(output),
            annotations: [],
          },
        ],
      },
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 800,
      total_tokens: 900,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 300 },
    },
    ...extra,
  };
}
function geminiWire(output: unknown) {
  return {
    candidates: [
      {
        finishReason: "STOP",
        content: { role: "model", parts: [{ text: JSON.stringify(output) }] },
      },
    ],
    usageMetadata: {
      promptTokenCount: 100,
      candidatesTokenCount: 500,
      thoughtsTokenCount: 300,
      totalTokenCount: 900,
    },
  };
}

test("provider defaults are OpenAI Sol/medium, backup is manual, and no key/model substitution is possible", async () => {
  assert.equal(createTripModel({}).provider, "openai");
  assert.equal(createTripModel({}).name, "gpt-6.1-sol");
  const selected = providerConfigFromEnv({
    OPENAI_API_KEY: "openai-test",
    GEMINI_API_KEY: "gemini-test",
    MODEL_NAME: "gemini-3.5-flash-lite",
  });
  assert.equal(selected.provider, "openai");
  assert.equal(selected.key, "openai-test");
  assert.equal(selected.reasoningEffort, "medium");
  assert.equal(
    providerConfigFromEnv({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "backup-test",
    }).name,
    "gemini-3.5-flash-lite",
  );
  assert.equal(
    providerConfigFromEnv({
      AI_PROVIDER: "gemini",
      OPENAI_API_KEY: "primary-only",
    }).key,
    undefined,
  );
  for (const env of [
    { AI_PROVIDER: "automatic" },
    { OPENAI_MODEL: "gpt-6-astra" },
    { OPENAI_REASONING_EFFORT: "high" },
    { AI_PROVIDER: "gemini", GEMINI_MODEL: "gemini-3.8-flash" },
  ])
    assert.throws(() => providerConfigFromEnv(env));
  assert.throws(() => createTripModel({ name: "gpt-6-astra" }));
  let calls = 0;
  await assert.rejects(
    createTripModel({
      ...providerConfigFromEnv({ GEMINI_API_KEY: "backup-only" }),
      fetch: async () => {
        calls++;
        throw Error("Must not call backup");
      },
    }).propose(intent),
    /not configured/,
  );
  assert.equal(calls, 0);
});

test("Responses API sends strict structured outputs, fixed Sol/medium, server-only credentials and bounded non-retrying requests", async () => {
  let calls = 0;
  const usage: ModelUsage[] = [];
  const model = createTripModel({
    key: "openai-test-key",
    onUsage: (u) => {
      usage.push(u);
    },
    fetch: async (url, options) => {
      calls++;
      assert.equal(String(url), "https://api.openai.com/v1/responses");
      assert.equal(options?.method, "POST");
      assert.equal(
        new Headers(options?.headers).get("authorization"),
        "Bearer openai-test-key",
      );
      const body = JSON.parse(options!.body as string);
      assert.equal(body.model, "gpt-6.1-sol");
      assert.deepEqual(body.reasoning, { effort: "medium" });
      assert.equal(body.store, false);
      assert.equal(body.stream, false);
      assert.equal(body.background, false);
      assert.equal(body.service_tier, "default");
      assert.equal(body.tools, undefined);
      assert.equal(body.previous_response_id, undefined);
      assert.ok(!JSON.stringify(body).includes("openai-test-key"));
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.schema.additionalProperties, false);
      const input = JSON.parse(body.input);
      assert.equal(body.max_output_tokens, input.confirmedBase ? 32768 : 8192);
      if (input.confirmedBase) {
        assert.deepEqual(input.intent, {
          ...Object.fromEntries(
            Object.entries(intent).filter(([key]) => key !== "month"),
          ),
          duration: 4,
        });
        assert.deepEqual(input.confirmedBase, base);
        assert.equal(input.groupBudgetMinor, 250000);
        assert.equal(input.planningBrief.days.length, 4);
        assert.equal(input.planningBrief.days[1].minActivities, 3);
        const activity =
          body.text.format.schema.properties.days.items.properties.activities
            .items;
        assert.equal(activity.additionalProperties, false);
        for (const field of [
          "startMinute",
          "durationMinutes",
          "bufferBeforeMinutes",
          "latitude",
          "longitude",
          "location",
          "costMinor",
        ])
          assert.ok(activity.required.includes(field));
        assert.ok(body.instructions.includes("inclusive whole-trip"));
      }
      return Response.json(
        openaiWire(input.confirmedBase ? authoredCandidate() : base),
      );
    },
  });
  assert.deepEqual(await model.propose(intent), base);
  assert.deepEqual(await model.generate(intent, base), authoredCandidate());
  assert.equal(calls, 2);
  assert.equal(usage[1].inputTokens, 100);
  assert.equal(usage[1].outputTokens, 800);
  assert.equal(usage[1].reasoningTokens, 300);
  assert.equal(usage[1].visibleOutputTokens, 500);
  assert.equal(usage[1].estimatedCostUsd, 0.0082);
  assert.equal(usage[1].model, "gpt-6.1-sol");
});

test("providers receive identical planning instructions and inputs; Gemini accounting includes thinking once", async () => {
  let openaiBody: Record<string, unknown> = {},
    geminiBody: Record<string, unknown> = {};
  const usage: ModelUsage[] = [];
  const a = createTripModel({
    key: "test-key",
    fetch: async (_, o) => {
      openaiBody = JSON.parse(o!.body as string);
      return Response.json(openaiWire(authoredCandidate()));
    },
  });
  const b = createTripModel({
    provider: "gemini",
    key: "test-key",
    onUsage: (u) => {
      usage.push(u);
    },
    fetch: async (_, o) => {
      geminiBody = JSON.parse(o!.body as string);
      return Response.json(geminiWire(authoredCandidate()));
    },
  });
  await a.generate(intent, base);
  await b.generate(intent, base);
  const g = geminiBody as {
    systemInstruction: { parts: { text: string }[] };
    contents: { parts: { text: string }[] }[];
  };
  assert.equal(
    openaiBody.instructions,
    g.systemInstruction.parts.map((part) => part.text).join(""),
  );
  assert.deepEqual(
    JSON.parse(openaiBody.input as string),
    JSON.parse(g.contents[0].parts[0].text),
  );
  assert.equal(usage[0].outputTokens, 800);
  assert.equal(usage[0].visibleOutputTokens, 500);
  assert.equal(usage[0].reasoningTokens, 300);
  assert.equal(usage[0].estimatedCostUsd, 0.00203);
});

test("OpenAI quota/auth/server errors, refusal, incomplete and invalid JSON fail with one request, sanitized messages and no fallback", async () => {
  const cases = [
    ...[400, 401, 429, 500, 503].map((status) => ({
      status,
      body: {
        error: {
          message: "private provider error openai-test-key",
          type: "invalid_request_error",
        },
      },
    })),
    {
      status: 200,
      body: openaiWire(base, {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      }),
    },
    {
      status: 200,
      body: openaiWire(base, {
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "refusal", refusal: "private provider details" }],
          },
        ],
      }),
    },
    { status: 200, body: openaiWire({ ...base, forgedVerification: true }) },
    {
      status: 200,
      body: openaiWire(base, {
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "{invalid JSON" }],
          },
        ],
      }),
    },
  ];
  for (const c of cases) {
    let calls = 0;
    const model = createTripModel({
      key: "openai-test-key",
      fetch: async (url) => {
        calls++;
        assert.equal(new URL(String(url)).host, "api.openai.com");
        return Response.json(c.body, { status: c.status });
      },
    });
    await assert.rejects(model.propose(intent), (e: unknown) => {
      assert.ok(e instanceof Error);
      assert.ok(!e.message.includes("private provider"));
      assert.ok(!e.message.includes("openai-test-key"));
      if (c.status === 429) assert.match(e.message, /rate limit or quota/);
      return true;
    });
    assert.equal(calls, 1);
  }
  await assert.rejects(
    createTripModel({
      key: "test-key",
      fetch: async () => {
        throw Error("private network");
      },
    }).propose(intent),
    /could not be reached/,
  );
});

test("cost estimates preserve cache accounting and unknown usage without double billing reasoning", async () => {
  const usages: ModelUsage[] = [];
  for (const extra of [
    { usage: undefined },
    {
      usage: {
        input_tokens: 100,
        output_tokens: 800,
        input_tokens_details: {
          cached_tokens: 20,
          cache_write_tokens: 10,
          cache_write_tokens_details: { ttl_12h_tokens: 5, ttl_30m_tokens: 5 },
        },
        output_tokens_details: { reasoning_tokens: 300 },
        total_tokens: 900,
      },
    },
    { service_tier: "priority" },
  ])
    await createTripModel({
      key: "test-key",
      onUsage: (u) => {
        usages.push(u);
      },
      fetch: async () => Response.json(openaiWire(base, extra)),
    }).propose(intent);
  assert.equal(usages[0].estimatedCostUsd, null);
  assert.equal(usages[1].estimatedCostUsd, 0.0081795);
  assert.equal(usages[2].estimatedCostUsd, null);
});

test("both SDK providers share acceptance/rejection, ownership and durable usage/validation/correction audit records", async () => {
  const root = path.resolve(".test-data");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, "providers-"));
  let connection = await openDatabase({ directory });
  const secret = randomBytes(32).toString("hex"),
    origin = "http://localhost:3000";
  const snapshots: { userId: string; tripId: string; audits: unknown[] }[] = [];
  try {
    await connection.migrate();
    for (const provider of ["openai", "gemini"] as AIProvider[]) {
      let calls = 0,
        providerUnavailable = false,
        output: unknown = authoredCandidate();
      const model = createTripModel({
        provider,
        key: "test-key-only",
        fetch: async (_, options) => {
          calls++;
          const body = JSON.parse(options!.body as string);
          const input = JSON.parse(
            provider === "openai" ? body.input : body.contents[0].parts[0].text,
          );
          const data = input.confirmedBase ? output : base;
          if (input.confirmedBase && providerUnavailable)
            return Response.json(
              {
                error: {
                  code: 503,
                  message: "private upstream failure",
                  status: "UNAVAILABLE",
                },
              },
              { status: 503 },
            );
          return Response.json(
            provider === "openai" ? openaiWire(data) : geminiWire(data),
          );
        },
      });
      const app = createApplication(connection.db, {
        origin,
        secret,
        model,
        generationLimits: { perMinute: 100, perDay: 100, perUserHour: 100 },
      });
      const signup = await app.authHandler(
        new Request(origin + "/api/auth/sign-up/email", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({
            name: "Offline provider QA",
            email: `${provider}@example.com`,
            password: randomBytes(24).toString("hex"),
          }),
        }),
      );
      assert.equal(signup.status, 200);
      const userId: string = (await signup.json()).user.id;
      const cookie = signup.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join(";");
      async function run() {
        const draft = await app.trips.openDraft(userId, {});
        const saved = await app.trips.complete(userId, draft.id, {
          version: draft.version,
          data: intent,
        });
        for (const action of ["start", "confirm"] as const) {
          await app.generations.action(userId, saved.id, { action });
          await app.generations.run(userId, saved.id);
        }
        return saved;
      }
      const accepted = await run();
      const job = (await app.generations.read(userId, accepted.id))!;
      assert.equal(job.status, "complete");
      assert.equal(job.audits.length, 2);
      for (const audit of job.audits) {
        assert.equal(audit.provider, provider);
        assert.equal(audit.status, "accepted");
        assert.equal(audit.validation.schema, "passed");
        assert.equal(audit.usage?.outputTokens, 800);
        assert.equal(audit.usage?.reasoningTokens, 300);
        assert.ok((audit.usage?.estimatedCostUsd ?? 0) > 0);
      }
      const itinerary = (await app.trips.read(userId, accepted.id)).itinerary!;
      assert.equal(itinerary.totalMinor, 213200);
      assert.equal(
        itinerary.normalization?.corrections[0].correctedMinutes,
        35,
      );
      assert.equal(
        job.audits.find((a) => a.phase === "itinerary")?.validation.quality,
        "passed",
      );
      snapshots.push({ userId, tripId: accepted.id, audits: job.audits });
      output = recording.plan;
      const rejected = await run(),
        failed = (await app.generations.read(userId, rejected.id))!;
      assert.equal(failed.status, "failed");
      assert.equal((await app.trips.read(userId, rejected.id)).itinerary, null);
      const audit = failed.audits.find((a) => a.phase === "itinerary")!;
      assert.equal(audit.validation.domain, "passed");
      assert.equal(audit.validation.quality, "failed");
      assert.equal(audit.validation.persistence, "not-run");
      assert.equal(audit.normalization?.corrections[0].correctedMinutes, 35);
      assert.equal(audit.usage?.inputTokens, 100);
      output = { ...authoredCandidate(), forgedVerification: true };
      const malformed = await run(),
        invalid = (await app.generations.read(userId, malformed.id))!;
      const invalidAudit = invalid.audits.find((a) => a.phase === "itinerary")!;
      assert.equal(invalidAudit.validation.provider, "passed");
      assert.equal(invalidAudit.validation.schema, "failed");
      assert.equal(invalidAudit.usage?.outputTokens, 800);
      providerUnavailable = true;
      const unavailable = await run(),
        unavailableJob = (await app.generations.read(userId, unavailable.id))!;
      const unavailableAudit = unavailableJob.audits.find(
        (a) => a.phase === "itinerary",
      )!;
      assert.equal(unavailableAudit.validation.provider, "failed");
      assert.equal(
        unavailableAudit.usage,
        null,
        "Unknown provider usage is not recorded as zero cost.",
      );
      assert.ok(!unavailableAudit.error?.includes("private upstream"));
      assert.equal(
        calls,
        8,
        "Four explicit local runs each have one proposal and itinerary, never retries or fallback.",
      );
      assert.equal(
        (
          await app.generationHandler(
            new Request(origin + "/generation"),
            accepted.id,
            () => {},
          )
        ).status,
        401,
      );
      await assert.rejects(
        app.generations.read("foreign-user", accepted.id),
        /not found/,
      );
      assert.equal(
        (
          await app.generationHandler(
            new Request(origin + "/generation", { headers: { cookie } }),
            accepted.id,
            () => {},
          )
        ).status,
        200,
      );
    }
    await connection.close();
    connection = await openDatabase({ directory });
    const app = createApplication(connection.db, { origin, secret });
    for (const snapshot of snapshots)
      assert.deepEqual(
        (await app.generations.read(snapshot.userId, snapshot.tripId))?.audits,
        snapshot.audits,
      );
    assert.equal(
      (await app.trips.read(snapshots[0].userId, snapshots[0].tripId)).itinerary
        ?.totalMinor,
      213200,
    );
  } finally {
    await connection.close();
    if (path.dirname(directory) === root)
      await rm(directory, { recursive: true, force: true });
  }
});

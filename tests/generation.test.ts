import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import {
  generation,
  generationQuota as rateLimit,
} from "../src/server/db/schema";
import { openDatabase } from "../src/server/db/connection";
import { createApplication } from "../src/server/application";
import { createTripModel, type TripModel } from "../src/server/model";
import { initialIntent } from "../src/lib/trip-intent";
import {
  validateItinerary,
  validateProposal,
  validateGenerationIntent,
  type ModelItinerary,
  type CityProposal,
} from "../src/lib/itinerary";

// Deliberate provider-boundary fixtures. Never used by the application runtime.
const intent = {
  ...initialIntent(),
  destination: "Kyoto",
  departure: "Toronto",
  start: "2027-04-01",
  end: "2027-04-02",
  budget: "5000",
  currency: "CAD" as const,
  travelers: 2,
};
const base: CityProposal = {
  feasible: true,
  explanation: "One base for a relaxed cultural escape; prices are estimates.",
  city: "Kyoto",
  country: "Japan",
  latitude: 35.01,
  longitude: 135.76,
  timeZone: "Asia/Tokyo",
  startDate: intent.start,
};
function fixture(): ModelItinerary {
  return {
    feasible: true,
    explanation: "Rough estimates, subject to verification.",
    city: "Kyoto",
    currency: "CAD",
    introduction: "Gardens and quiet neighborhoods.",
    flightsMinor: 200000,
    accommodationMinor: 30000,
    foodMinor: 15000,
    localTransportMinor: 5000,
    days: ["2027-04-01", "2027-04-02"].map((date, index) => ({
      date,
      title: "An unhurried day",
      activities: [
        {
          title: "Garden visit",
          description:
            "Spend an unhurried visit exploring the garden paths, seasonal planting and quiet places to pause.",
          city: "Kyoto",
          location: "Central Kyoto garden",
          latitude: 35.01,
          longitude: 135.76,
          startMinute: index === 0 ? 900 : 600,
          durationMinutes: 90,
          bufferBeforeMinutes: 30,
          costMinor: 2000,
        },
        ...(index === 0
          ? [
              {
                title: "Café and local tea tasting",
                description:
                  "Take time to sample local tea and enjoy a calm café experience before leaving the evening free.",
                city: "Kyoto",
                location: "Kyoto tea café",
                latitude: 35.01,
                longitude: 135.76,
                startMinute: 1020,
                durationMinutes: 60,
                bufferBeforeMinutes: 30,
                costMinor: 0,
              },
            ]
          : []),
      ],
    })),
  };
}
test("schema and budget validation enforce group costs, scope, reserve and currency", () => {
  const result = validateItinerary(fixture(), intent, base);
  assert.equal(result.reserveMinor, 50000);
  assert.equal(result.totalMinor, 304000);
  assert.equal(
    validateItinerary(fixture(), { ...intent, scope: "spending" }, base)
      .totalMinor,
    74000,
  );
  assert.throws(
    () => validateItinerary(fixture(), { ...intent, budget: "10" }, base),
    /exceed/,
  );
  assert.throws(
    () => validateItinerary({ ...fixture(), currency: "USD" }, intent, base),
    /currency/,
  );
  assert.throws(
    () => validateItinerary({ ...fixture(), foodMinor: 0 }, intent, base),
    /omitted/,
  );
  assert.throws(
    () =>
      validateItinerary(
        {
          ...fixture(),
          feasible: false,
          explanation: "Budget cannot cover accessible transport.",
        },
        intent,
        base,
      ),
    /accessible transport/,
  );
  const jpy = { ...intent, currency: "JPY" as const, budget: "500000" };
  assert.equal(
    validateItinerary({ ...fixture(), currency: "JPY" }, jpy, base)
      .reserveMinor,
    50000,
  );
});
test("single-city, dates, pace, coordinates and travel buffers are validated", () => {
  for (const change of [
    (p: ModelItinerary) => {
      p.days[0].activities[0].city = "Tokyo";
    },
    (p: ModelItinerary) => {
      p.days[0].date = "2027-05-01";
    },
    (p: ModelItinerary) => {
      p.days[0].activities[0].latitude = 50;
    },
    (p: ModelItinerary) => {
      p.days[0].activities.push({
        ...p.days[0].activities[0],
        startMinute: 650,
      });
    },
    (p: ModelItinerary) => {
      p.days[0].activities.push({
        ...p.days[0].activities[0],
        startMinute: 800,
        longitude: 135.99,
        bufferBeforeMinutes: 15,
      });
    },
    (p: ModelItinerary) => {
      p.days[0].activities = Array(6).fill(p.days[0].activities[0]);
    },
  ]) {
    const plan = fixture();
    change(plan);
    assert.throws(() => validateItinerary(plan, intent, base));
  }
  assert.throws(() => validateGenerationIntent({ ...intent, destination: "" }));
  assert.equal(
    validateGenerationIntent({
      ...intent,
      mode: "discover",
      destination: "",
      vibe: "Quiet gardens and culture",
    }).mode,
    "discover",
  );
  assert.throws(
    () => validateGenerationIntent({ ...intent, end: "2027-04-20" }),
    /1–14/,
  );
  assert.throws(
    () => validateProposal({ ...base, startDate: "2027-05-01" }, intent),
    /dates/,
  );
  assert.throws(() =>
    validateProposal({ ...base, timeZone: "invented/zone" }, intent),
  );
  assert.equal(
    validateProposal(
      { ...base, startDate: "2027-06-15" },
      { ...intent, flexible: true, month: "2027-06", duration: 2 },
    ).startDate,
    "2027-06-15",
  );
});
test("Gemini SDK sends structured JSON and credentials only through the server transport", async () => {
  let calls = 0;
  const model = createTripModel({
    provider: "gemini",
    key: "test-key-only",
    fetch: async (url, options) => {
      calls++;
      const target = new URL(String(url));
      assert.equal(target.origin, "https://generativelanguage.googleapis.com");
      assert.equal(
        target.pathname,
        "/v1beta/models/gemini-3.5-flash-lite:generateContent",
      );
      assert.ok(!target.search.includes("test-key-only"));
      assert.equal(
        new Headers(options?.headers).get("x-goog-api-key"),
        "test-key-only",
      );
      const body = JSON.parse(options!.body as string);
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.equal(
        body.generationConfig.responseJsonSchema.additionalProperties,
        false,
      );
      assert.ok(
        !JSON.stringify(body.generationConfig.responseJsonSchema).includes(
          "minLength",
        ),
      );
      const grammar = JSON.stringify(body.generationConfig.responseJsonSchema);
      for (const bound of ["minimum", "maximum", "minItems", "maxItems"])
        assert.ok(!grammar.includes(`"${bound}":`));
      assert.ok(!JSON.stringify(body).includes("test-key-only"));
      assert.equal(body.store, false);
      const input = JSON.parse(body.contents[0].parts[0].text);
      assert.equal(
        body.generationConfig.maxOutputTokens,
        input.confirmedBase ? 32768 : 2048,
      );
      assert.equal(
        body.generationConfig.thinkingConfig.thinkingLevel,
        input.confirmedBase ? "MEDIUM" : "LOW",
      );
      if (input.confirmedBase) {
        assert.deepEqual(input.intent, intent);
        assert.deepEqual(input.confirmedBase, base);
        assert.equal(input.groupBudgetMinor, 500000);
        assert.equal(input.planningBrief.days.length, 2);
        assert.equal(input.planningBrief.days[0].startMinute, 840);
        assert.equal(input.planningBrief.days[1].endMinute, 720);
        assert.ok(input.planningBrief.travelGuidance.includes("4.5"));
      }
      return Response.json({
        usageMetadata: {
          promptTokenCount: 123,
          candidatesTokenCount: 300,
          thoughtsTokenCount: 25,
          totalTokenCount: 448,
        },
        candidates: [
          {
            finishReason: "STOP",
            content: {
              role: "model",
              parts: [
                {
                  text: JSON.stringify(input.confirmedBase ? fixture() : base),
                },
              ],
            },
          },
        ],
      });
    },
  });
  assert.equal(model.name, "gemini-3.5-flash-lite");
  assert.deepEqual(await model.propose(intent), base);
  assert.equal(calls, 1);
  assert.deepEqual(await model.generate(intent, base), fixture());
  assert.equal(calls, 2);
  const discovery = {
    ...intent,
    mode: "discover" as const,
    destination: "",
    vibe: "Walkable gardens and culture",
  };
  assert.deepEqual(await model.propose(discovery), base);
});

test("Gemini SDK failures, truncation, safety blocks and malformed output fail without implicit retries", async () => {
  await assert.rejects(
    createTripModel({ provider: "gemini" }).propose(intent),
    /not configured/,
  );
  for (const [body, status] of [
    [
      {
        error: {
          message: "private provider diagnostics",
          status: "RESOURCE_EXHAUSTED",
        },
      },
      429,
    ],
    [
      {
        error: {
          message: "private provider diagnostics",
          status: "PERMISSION_DENIED",
        },
      },
      403,
    ],
    [
      {
        error: {
          message: "private provider diagnostics",
          status: "UNAVAILABLE",
        },
      },
      503,
    ],
    [{ candidates: [{ finishReason: "MAX_TOKENS" }] }, 200],
    [
      {
        candidates: [{ finishReason: "CONTINUATION" }],
        continuationToken: "test-continuation",
      },
      200,
    ],
    [{ promptFeedback: { blockReason: "SAFETY" } }, 200],
    [{ candidates: [{ finishReason: "SAFETY" }] }, 200],
    [
      {
        candidates: [
          { finishReason: "STOP", content: { parts: [{ text: "bad json" }] } },
        ],
      },
      200,
    ],
    [
      {
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [{ text: JSON.stringify({ ...base, city: "" }) }],
            },
          },
        ],
      },
      200,
    ],
  ] as const) {
    let calls = 0;
    await assert.rejects(
      createTripModel({
        provider: "gemini",
        key: "test-key-only",
        fetch: async () => {
          calls++;
          return Response.json(body, { status });
        },
      }).propose(intent),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(!error.message.includes("private provider"));
        assert.ok(!error.message.includes("test-key-only"));
        return true;
      },
    );
    assert.equal(
      calls,
      1,
      "One explicit attempt must never make implicit paid retries or continuations.",
    );
  }
  await assert.rejects(
    createTripModel({
      provider: "gemini",
      key: "test-key-only",
      fetch: async () => {
        throw new Error("private transport details");
      },
    }).propose(intent),
    /could not be reached/,
  );
});

const testLimits = { perMinute: 1000, perDay: 1000, perUserHour: 12 };
const origin = "http://localhost:3000",
  secret = randomBytes(32).toString("base64url");
let connection: Awaited<ReturnType<typeof openDatabase>>,
  app: ReturnType<typeof createApplication>,
  directory: string;
let alice: string, bob: string, aliceId: string, tripId: string;
let providerFails = false,
  generateCalls = 0;
const model: TripModel = {
  name: "test-provider-boundary",
  propose: async () => base,
  generate: async () => {
    generateCalls++;
    if (providerFails) throw new Error("AI service temporarily unavailable.");
    return fixture();
  },
};
function request(
  cookie: string,
  method = "GET",
  body?: unknown,
  source = origin,
) {
  return new Request(origin + "/api/trips/test/generation", {
    method,
    headers: { cookie, origin: source, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function signup(name: string) {
  const result = await app.authHandler(
    new Request(origin + "/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        name,
        email: `${name}@example.com`,
        password: randomBytes(20).toString("hex"),
      }),
    }),
  );
  assert.equal(result.status, 200);
  return {
    cookie: result.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join(";"),
    user: (await result.json()).user,
  };
}
before(async () => {
  const root = path.resolve(".test-data");
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(path.join(root, "generation-"));
  connection = await openDatabase({ directory });
  await connection.migrate();
  app = createApplication(connection.db, {
    generationLimits: testLimits,
    secret,
    origin,
    model,
  });
  const a = await signup("GenerationAlice");
  alice = a.cookie;
  aliceId = a.user.id;
  bob = (await signup("GenerationBob")).cookie;
  const draft = await app.trips.openDraft(aliceId, {});
  tripId = (
    await app.trips.complete(aliceId, draft.id, {
      version: draft.version,
      data: intent,
    })
  ).id;
});
after(async () => {
  if (connection) await connection.close();
  if (directory && path.dirname(directory) === path.resolve(".test-data"))
    await rm(directory, { recursive: true, force: true });
});
test("generation authenticates, checks origin and isolates all job reads and writes", async () => {
  const never = () => {
    throw new Error("Unauthorized work must not schedule.");
  };
  for (const method of ["GET", "POST"]) {
    assert.equal(
      (
        await app.generationHandler(
          request(
            "",
            method,
            method === "POST" ? { action: "start" } : undefined,
          ),
          tripId,
          never,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await app.generationHandler(
          request(
            bob,
            method,
            method === "POST" ? { action: "start" } : undefined,
          ),
          tripId,
          never,
        )
      ).status,
      404,
    );
  }
  assert.equal(
    (
      await app.generationHandler(
        request(alice, "POST", { action: "start" }, "https://evil.example"),
        tripId,
        never,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await app.generationHandler(
        request(alice, "POST", { action: "unknown" }),
        tripId,
        never,
      )
    ).status,
    400,
  );
});
test("destination confirmation, recoverable failure, atomic generation and disk persistence", async () => {
  const scheduled: (() => Promise<void>)[] = [];
  const call = (action: string) =>
    app.generationHandler(
      request(alice, "POST", { action }),
      tripId,
      (work) => {
        scheduled.push(work);
      },
    );
  assert.equal((await call("confirm")).status, 409);
  await call("start");
  assert.equal((await app.generations.read(aliceId, tripId))?.status, "queued");
  await scheduled.shift()!();
  assert.equal(
    (await app.generations.read(aliceId, tripId))?.status,
    "awaiting_confirmation",
  );
  assert.equal(generateCalls, 0);
  assert.equal((await app.trips.read(aliceId, tripId)).itinerary, null);
  await call("start");
  assert.equal(scheduled.length, 0);
  providerFails = true;
  await call("confirm");
  await scheduled.shift()!();
  assert.equal((await app.generations.read(aliceId, tripId))?.status, "failed");
  assert.equal((await app.trips.read(aliceId, tripId)).itinerary, null);
  providerFails = false;
  await call("retry");
  await Promise.all([
    scheduled.shift()!(),
    app.generations.run(aliceId, tripId),
  ]);
  assert.equal(generateCalls, 2);
  assert.equal(
    (await app.generations.read(aliceId, tripId))?.status,
    "complete",
  );
  const saved = await app.trips.read(aliceId, tripId);
  assert.equal(saved.itinerary?.quality?.version, 3);
  assert.equal(saved.itinerary?.schemaVersion, 2);
  assert.equal(saved.itinerary?.budget?.kind, "planning-only");
  assert.equal(
    saved.itinerary?.budget?.expenses[0].activityId,
    saved.itinerary?.days[0].activities[0].id,
  );
  assert.deepEqual(
    saved.itinerary?.quality?.days.map((day) => day.role),
    ["arrival", "departure"],
  );
  assert.ok(saved.itinerary?.days[0].id);
  assert.ok(saved.itinerary?.days[0].activities[0].id);
  assert.deepEqual(saved.data, intent);
  assert.deepEqual(
    (await app.trips.readDraft(aliceId, saved.draftId)).data,
    intent,
  );
  assert.equal((await call("retry")).status, 409);
  await connection.close();
  connection = await openDatabase({ directory });
  app = createApplication(connection.db, {
    generationLimits: testLimits,
    secret,
    origin,
    model,
  });
  assert.deepEqual(
    (await app.trips.read(aliceId, tripId)).itinerary,
    saved.itinerary,
  );
  assert.equal(
    (await app.generationHandler(request(alice), tripId, () => {})).status,
    200,
  );
  assert.equal(
    (await app.generationHandler(request(bob), tripId, () => {})).status,
    404,
  );
});
test("revising preferences copies an owned intent without replacing the original", async () => {
  const revision = await app.trips.openDraft(aliceId, { sourceTripId: tripId });
  assert.equal(revision.data.budget, intent.budget);
  assert.equal(revision.data.review, false);
  assert.equal(
    (await app.trips.openDraft(aliceId, { sourceTripId: tripId })).id,
    revision.id,
  );
  const bobSession = await app.auth.api.getSession({
    headers: new Headers({ cookie: bob }),
  });
  await assert.rejects(
    app.trips.openDraft(bobSession!.user.id, { sourceTripId: tripId }),
    /not found/,
  );
  await app.trips.saveDraft(aliceId, revision.id, {
    version: revision.version,
    data: { ...revision.data, budget: "6000" },
  });
  assert.equal(
    (await app.trips.read(aliceId, tripId)).data.budget,
    intent.budget,
  );
});
test("over-budget AI output is rejected before persistence and interrupted jobs recover", async () => {
  const draft = await app.trips.openDraft(aliceId, {});
  const saved = await app.trips.complete(aliceId, draft.id, {
    version: draft.version,
    data: { ...intent, budget: "10" },
  });
  await app.generations.action(aliceId, saved.id, { action: "start" });
  await app.generations.run(aliceId, saved.id);
  await app.generations.action(aliceId, saved.id, { action: "confirm" });
  await app.generations.run(aliceId, saved.id);
  assert.match(
    (await app.generations.read(aliceId, saved.id))!.error!,
    /exceed/,
  );
  assert.equal((await app.trips.read(aliceId, saved.id)).itinerary, null);
  await app.generations.action(aliceId, saved.id, { action: "retry" });
  const job = (await app.generations.read(aliceId, saved.id))!;
  await connection.db
    .update(generation)
    .set({ updatedAt: new Date(0) })
    .where(eq(generation.id, job.id));
  assert.equal(
    (await app.generations.read(aliceId, saved.id))!.status,
    "failed",
  );
  assert.match(
    (await app.generations.read(aliceId, saved.id))!.error!,
    /interrupted/,
  );
});
test("cross-trip model usage is rate-limited without leaking internal failures", async () => {
  await connection.db
    .update(rateLimit)
    .set({ count: 12, lastRequest: Date.now() })
    .where(eq(rateLimit.key, `trip-generation:${aliceId}`));
  const draft = await app.trips.openDraft(aliceId, {});
  const saved = await app.trips.complete(aliceId, draft.id, {
    version: draft.version,
    data: intent,
  });
  const before = generateCalls;
  await app.generations.action(aliceId, saved.id, { action: "start" });
  await app.generations.run(aliceId, saved.id);
  assert.match(
    (await app.generations.read(aliceId, saved.id))!.error!,
    /hourly/,
  );
  assert.equal(generateCalls, before);
  await connection.db
    .update(rateLimit)
    .set({ lastRequest: 0 })
    .where(eq(rateLimit.key, `trip-generation:${aliceId}`));
  const broken = createApplication(connection.db, {
    generationLimits: testLimits,
    secret,
    origin,
    model: {
      ...model,
      propose: async () => {
        throw new Error("private connection diagnostics");
      },
    },
  });
  await broken.generations.action(aliceId, saved.id, { action: "retry" });
  await broken.generations.run(aliceId, saved.id);
  const job = await broken.generations.read(aliceId, saved.id);
  assert.ok(!job!.error!.includes("private connection"));
  assert.equal(job!.status, "failed");
});
test("a late expired worker cannot publish output over a newer generation lease", async () => {
  let release!: (value: ModelItinerary) => void, started!: () => void;
  const output = new Promise<ModelItinerary>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const delayed = createApplication(connection.db, {
    generationLimits: testLimits,
    secret,
    origin,
    model: {
      ...model,
      generate: async () => {
        started();
        return output;
      },
    },
  });
  const draft = await app.trips.openDraft(aliceId, {});
  const saved = await app.trips.complete(aliceId, draft.id, {
    version: draft.version,
    data: intent,
  });
  await delayed.generations.action(aliceId, saved.id, { action: "start" });
  await delayed.generations.run(aliceId, saved.id);
  await delayed.generations.action(aliceId, saved.id, { action: "confirm" });
  const running = delayed.generations.run(aliceId, saved.id);
  await entered;
  const job = (await app.generations.read(aliceId, saved.id))!;
  await connection.db
    .update(generation)
    .set({ updatedAt: new Date(0) })
    .where(eq(generation.id, job.id));
  assert.equal(
    (await app.generations.read(aliceId, saved.id))!.status,
    "failed",
  );
  await app.generations.action(aliceId, saved.id, { action: "retry" });
  release(fixture());
  await running;
  assert.equal((await app.trips.read(aliceId, saved.id)).itinerary, null);
  assert.equal(
    (await app.generations.read(aliceId, saved.id))!.status,
    "queued",
  );
  await app.generations.run(aliceId, saved.id);
  assert.equal(
    (await app.generations.read(aliceId, saved.id))!.status,
    "complete",
  );
});
test("a schema-valid but low-quality plan fails before save without losing input or retrying the provider", async () => {
  let calls = 0;
  const plan = fixture();
  plan.days[0].activities[0].startMinute = 600;
  const strict = createApplication(connection.db, {
    generationLimits: testLimits,
    secret,
    origin,
    model: {
      ...model,
      generate: async () => {
        calls++;
        return plan;
      },
    },
  });
  const draft = await strict.trips.openDraft(aliceId, {});
  const saved = await strict.trips.complete(aliceId, draft.id, {
    version: draft.version,
    data: intent,
  });
  await strict.generations.action(aliceId, saved.id, { action: "start" });
  await strict.generations.run(aliceId, saved.id);
  await strict.generations.action(aliceId, saved.id, { action: "confirm" });
  await strict.generations.run(aliceId, saved.id);
  const job = (await strict.generations.read(aliceId, saved.id))!;
  assert.equal(job.status, "failed");
  assert.match(job.error!, /needs revision/);
  assert.equal(calls, 1);
  assert.equal((await strict.trips.read(aliceId, saved.id)).itinerary, null);
  assert.deepEqual(
    (await strict.trips.readDraft(aliceId, draft.id)).data,
    intent,
  );
});

test("normalization audit and reconciled expenses persist with activity IDs; raw Paris meal failures still block saving", async () => {
  const recorded = JSON.parse(
    readFileSync(
      new URL("./fixtures/paris-quality-recorded.json", import.meta.url),
      "utf8",
    ),
  );
  let output: ModelItinerary = structuredClone(recorded.plan);
  let calls = 0;
  const replay = createApplication(connection.db, {
    secret,
    origin,
    generationLimits: { ...testLimits, perUserHour: 100 },
    model: {
      name: "offline-recording",
      propose: async () => recorded.base,
      generate: async () => {
        calls++;
        return output;
      },
    },
  });
  async function run() {
    const draft = await replay.trips.openDraft(aliceId, {});
    const saved = await replay.trips.complete(aliceId, draft.id, {
      version: draft.version,
      data: recorded.intent,
    });
    await replay.generations.action(aliceId, saved.id, { action: "start" });
    await replay.generations.run(aliceId, saved.id);
    await replay.generations.action(aliceId, saved.id, { action: "confirm" });
    await replay.generations.run(aliceId, saved.id);
    return saved;
  }
  const rejected = await run();
  assert.equal(
    (await replay.generations.read(aliceId, rejected.id))?.status,
    "failed",
  );
  assert.equal((await replay.trips.read(aliceId, rejected.id)).itinerary, null);
  assert.deepEqual(
    (await replay.trips.readDraft(aliceId, rejected.draftId)).data,
    recorded.intent,
  );

  // Explicitly authored test candidate, not a repair the application performs.
  output = structuredClone(recorded.plan);
  output.days[0].activities[1].startMinute = 1080;
  output.days[2].activities[1].title =
    "Substantial bistro lunch on Rue de Bretagne";
  output.days[2].activities[3].title = "French culinary tasting in Bastille";
  output.days[3].activities[0].location = "Rue de Rivoli, Paris";
  const accepted = await run();
  assert.equal(
    (await replay.generations.read(aliceId, accepted.id))?.status,
    "complete",
  );
  const saved = (await replay.trips.read(aliceId, accepted.id)).itinerary!;
  assert.equal(saved.normalization?.corrections[0].originalMinutes, 30);
  assert.equal(saved.normalization?.corrections[0].correctedMinutes, 35);
  assert.equal(saved.normalization?.corrections[0].availableGapMinutes, 60);
  assert.equal(saved.budget?.totalWithReserveMinor, 213200);
  assert.equal(
    saved.budget?.expenses[0].activityId,
    saved.days[0].activities[0].id,
  );
  assert.equal(
    calls,
    2,
    "One local replay per explicit test run, with no real SDK or retries.",
  );
  await connection.close();
  connection = await openDatabase({ directory });
  app = createApplication(connection.db, {
    secret,
    origin,
    generationLimits: testLimits,
    model,
  });
  assert.deepEqual(
    (await app.trips.read(aliceId, accepted.id)).itinerary,
    saved,
  );
  assert.equal(
    (await app.generations.read(aliceId, rejected.id))?.status,
    "failed",
  );
  await assert.rejects(
    app.trips.read("different-user", accepted.id),
    /not found/,
  );
  assert.equal(
    (await app.generationHandler(request(bob), accepted.id, () => {})).status,
    404,
  );
});

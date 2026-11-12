import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { insightTarget } from "../src/lib/activity-insights";
import type { SavedActivity } from "../src/lib/itinerary";
import { activityInsightsFromEnv } from "../src/server/activity-insights";
import { createApplication } from "../src/server/application";
import { generationQuota, trip } from "../src/server/db/schema";
import { createGooglePlaces } from "../src/server/google-places";
import {
  parisPlace,
  parisPlaceDetails,
} from "./fixtures/activity-insights-google";
import { prepareOfflineSolReview } from "./helpers/offline-sol-review";
import { solRecording } from "./helpers/sol-recording";

const base = solRecording.base;
const museum: SavedActivity = {
  ...solRecording.plan.days[1].activities[0],
  id: randomUUID(),
  category: "culture",
};
const target = insightTarget(museum, base)!;

function fixtureFetch(
  search: unknown = { places: [parisPlace] },
  details: unknown = parisPlaceDetails,
) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    assert.ok(url.startsWith("https://places.googleapis.com/v1/places"));
    const result = url.endsWith(":searchText") ? search : details;
    return result instanceof Response ? result : Response.json(result);
  };
  return { fetch, requests };
}

test("insights is off by default and activation needs both a key and an allowed cap", () => {
  const key = { GOOGLE_PLACES_API_KEY: "local-fixture-only" };
  assert.equal(activityInsightsFromEnv(key), undefined);
  assert.equal(
    activityInsightsFromEnv({ ACTIVITY_INSIGHTS_ENABLED: "true" }),
    undefined,
  );
  assert.equal(
    activityInsightsFromEnv({
      ...key,
      ACTIVITY_INSIGHTS_ENABLED: "true",
      ACTIVITY_INSIGHTS_DAILY_LIMIT: "21",
    }),
    undefined,
  );
  assert.equal(
    activityInsightsFromEnv({
      ...key,
      ACTIVITY_INSIGHTS_ENABLED: "true",
      ACTIVITY_INSIGHTS_DAILY_LIMIT: "1",
    })?.dailyLimit,
    1,
  );
});

test("generic walks and unnamed venues are ineligible, while named places work without coordinates", async () => {
  const walk = { ...museum, ...solRecording.plan.days[0].activities[0] };
  const bistro = {
    ...museum,
    ...solRecording.plan.days[0].activities[1],
    category: "food" as const,
  };
  assert.equal(insightTarget(walk, base), null);
  assert.equal(insightTarget(bistro, base), null);
  assert.equal(
    insightTarget({ ...museum, location: "Temple Street, Paris" }, base),
    null,
  );
  const missing = insightTarget(
    { ...museum, latitude: null, longitude: null },
    base,
  )!;
  assert.equal(missing.coordinates, null);
  const stub = fixtureFetch();
  assert.equal(
    (
      await createGooglePlaces({ key: "fixture", fetch: stub.fetch })(
        missing,
        base,
      )
    ).status,
    "matched",
  );
  const payload = JSON.parse(String(stub.requests[0].init?.body));
  assert.deepEqual(payload.locationBias.circle.center, {
    latitude: base.latitude,
    longitude: base.longitude,
  });
});

test("Paris Places lookup uses small explicit masks, same-place details and attributed original review text", async () => {
  const stub = fixtureFetch();
  const result = await createGooglePlaces({
    key: "fixture-server-value",
    fetch: stub.fetch,
  })(target, base);
  assert.equal(result.status, "matched");
  if (result.status !== "matched") return;
  assert.equal(stub.requests.length, 2);
  const [search, details] = stub.requests;
  const body = JSON.parse(String(search.init?.body));
  assert.match(body.textQuery, /Musée d’Orsay.*Paris.*France/);
  assert.equal(body.pageSize, 5);
  assert.equal(body.locationBias.circle.radius, 1500);
  assert.doesNotMatch(
    JSON.stringify(body),
    /Offline Sol review|description|activityId|tripId/,
  );
  assert.equal(search.init?.method, "POST");
  assert.doesNotMatch(
    new Headers(search.init?.headers).get("X-Goog-FieldMask")!,
    /reviews|rating|\*/i,
  );
  assert.equal(
    new Headers(details.init?.headers).get("X-Goog-Api-Key"),
    "fixture-server-value",
  );
  assert.match(
    new Headers(details.init?.headers).get("X-Goog-FieldMask")!,
    /reviews\.authorAttribution/,
  );
  assert.match(details.url, /\/offline-paris-museum\?languageCode=en$/);
  for (const { url, init } of stub.requests) {
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.redirect, "error");
    assert.doesNotMatch(url, /fixture-server-value/);
  }
  assert.equal(result.rating, 4.6);
  assert.equal(result.ratingCount, 1240);
  assert.equal(result.reviews.length, 5);
  assert.equal(
    result.reviews[0].text,
    parisPlaceDetails.reviews[0].originalText.text,
  );
  assert.equal(
    result.reviews[0].author.avatar,
    "https://lh3.googleusercontent.com/offline-fixture-avatar",
  );
  assert.match(result.reviews[0].author.url!, /\/contrib\//);
  assert.match(result.reviews[0].url, /\/reviews\//);
  assert.equal(result.reviews[0].date, "2025-09-07T12:34:56Z");
  assert.equal(result.attributions[0].name, "Offline fixture data");
  assert.doesNotMatch(JSON.stringify(result), /fixture-server-value/);
});

test("a wrong city, country, address, distant coordinate or unrelated venue type never reaches reviews", async () => {
  const wrongCandidates = [
    {
      ...parisPlace,
      addressComponents: [
        { longText: "Lyon", types: ["locality"] },
        parisPlace.addressComponents[1],
      ],
    },
    {
      ...parisPlace,
      addressComponents: [
        parisPlace.addressComponents[0],
        { longText: "United States", shortText: "US", types: ["country"] },
      ],
    },
    { ...parisPlace, formattedAddress: "91 rue du Bac, Paris, France" },
    { ...parisPlace, location: { latitude: 48.898, longitude: 2.325 } },
    {
      ...parisPlace,
      primaryType: "hotel",
      types: ["lodging", "tourist_attraction"],
    },
    { ...parisPlace, primaryType: "restaurant" },
    { ...parisPlace, displayName: { text: "Musée d'Orsay Boutique" } },
    { ...parisPlace, id: "../../invalid" },
  ];
  for (const place of wrongCandidates) {
    const stub = fixtureFetch({ places: [place] });
    assert.deepEqual(
      await createGooglePlaces({ key: "fixture", fetch: stub.fetch })(
        target,
        base,
      ),
      { status: "unmatched" },
    );
    assert.equal(stub.requests.length, 1);
  }
  const ambiguous = fixtureFetch({
    places: [parisPlace, { ...parisPlace, id: "another-museum" }],
  });
  assert.deepEqual(
    await createGooglePlaces({ key: "fixture", fetch: ambiguous.fetch })(
      target,
      base,
    ),
    { status: "ambiguous" },
  );
  assert.equal(ambiguous.requests.length, 1);
});

test("Tokyo locality evidence allows an exact venue with a Tokyo Metropolis address", async () => {
  const tokyo = {
    city: "Tokyo",
    country: "Japan",
    latitude: 35.6762,
    longitude: 139.6503,
  };
  const activity = {
    ...museum,
    title: "Visit Sensō-ji",
    location: "Sensō-ji",
    latitude: null,
    longitude: null,
  };
  const candidate = {
    ...parisPlace,
    id: "tokyo-fixture",
    displayName: { text: "Sensō-ji" },
    primaryType: "tourist_attraction",
    formattedAddress: "Asakusa, Taito City, Tokyo, Japan",
    addressComponents: [
      { longText: "Taito City", types: ["locality"] },
      { longText: "Tokyo Metropolis", types: ["administrative_area_level_1"] },
      { longText: "Japan", shortText: "JP", types: ["country"] },
    ],
    location: { latitude: 35.7147, longitude: 139.7967 },
  };
  const stub = fixtureFetch(
    { places: [candidate] },
    {
      id: candidate.id,
      displayName: candidate.displayName,
      googleMapsUri: "https://www.google.com/maps/place/Offline+Tokyo+Fixture",
    },
  );
  const result = await createGooglePlaces({
    key: "fixture",
    fetch: stub.fetch,
  })(insightTarget(activity, tokyo)!, tokyo);
  assert.equal(result.status, "matched");
  if (result.status !== "matched") return;
  assert.equal(result.rating, undefined);
  assert.equal(result.ratingCount, undefined);
  assert.deepEqual(result.reviews, []);
});

test("provider quota, malformed content, unsafe review URLs and timeout fail safely without retry", async () => {
  for (const [search, expected] of [
    [new Response(null, { status: 429 }), "quota"],
    [{ surprise: true }, "unavailable"],
  ] as const) {
    const stub = fixtureFetch(search);
    assert.equal(
      (
        await createGooglePlaces({ key: "fixture", fetch: stub.fetch })(
          target,
          base,
        )
      ).status,
      expected,
    );
    assert.equal(stub.requests.length, 1);
  }
  const malformed = fixtureFetch(
    { places: [parisPlace] },
    { ...parisPlaceDetails, rating: 7 },
  );
  assert.equal(
    (
      await createGooglePlaces({ key: "fixture", fetch: malformed.fetch })(
        target,
        base,
      )
    ).status,
    "unavailable",
  );
  assert.equal(malformed.requests.length, 2);
  const unsafe = fixtureFetch(
    { places: [parisPlace] },
    {
      ...parisPlaceDetails,
      reviews: [
        {
          ...parisPlaceDetails.reviews[0],
          googleMapsUri: "https://www.google.com.evil.test/maps/review",
        },
        {
          ...parisPlaceDetails.reviews[1],
          authorAttribution: {
            displayName: "Offline QA",
            uri: "javascript:alert(1)",
            photoUri: "https://untrusted.test/avatar",
          },
        },
      ],
    },
  );
  const safe = await createGooglePlaces({
    key: "fixture",
    fetch: unsafe.fetch,
  })(target, base);
  assert.equal(safe.status, "matched");
  if (safe.status === "matched") {
    assert.equal(safe.reviews.length, 1);
    assert.equal(safe.reviews[0].author.url, undefined);
    assert.equal(safe.reviews[0].author.avatar, undefined);
  }
  let calls = 0;
  const fetch: typeof globalThis.fetch = async (_input, init) => {
    calls++;
    return new Promise((_resolve, reject) => {
      // The timer keeps Node alive while AbortSignal.timeout's timer is unref'd.
      const keepAlive = setTimeout(
        () => reject(new Error("Timeout was not enforced")),
        100,
      );
      init?.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(keepAlive);
          reject(init.signal?.reason);
        },
        { once: true },
      );
    });
  };
  assert.deepEqual(
    await createGooglePlaces({ key: "fixture", fetch, timeoutMs: 5 })(
      target,
      base,
    ),
    { status: "unavailable" },
  );
  assert.equal(calls, 1);
});

test("saved itinerary lookup enforces ownership, revision, origin and durable duplicate/global quotas", async () => {
  const origin = "http://localhost:3000";
  await mkdir(resolve(".test-data"), { recursive: true });
  const directory = await mkdtemp(resolve(".test-data/activity-insights-"));
  const state = await prepareOfflineSolReview(directory, origin);
  try {
    await state.worker();
    const stub = fixtureFetch();
    const app = createApplication(state.connection.db, {
      ...state.config,
      places: { key: "fixture", fetch: stub.fetch, dailyLimit: 1 },
    });
    const other = await app.authHandler(
      new Request(origin + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({
          name: "Other insights tester",
          email: "insights-other@example.com",
          password: state.password,
        }),
      }),
    );
    assert.equal(other.status, 200);
    const otherCookie = other.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join(";");
    const otherUser = (await other.json()).user.id;
    const saved = await app.trips.read(state.userId, state.trip.id);
    assert.ok(saved.itinerary);
    const activityId = saved.itinerary.days[1].activities[0].id;
    const version = saved.itineraryVersion;
    const api = (
      options: {
        cookie?: string;
        tripId?: string;
        activityId?: string;
        version?: number;
        body?: string;
        requestOrigin?: string;
        method?: string;
      } = {},
      instance = app,
    ) => {
      const id = options.tripId ?? state.trip.id;
      const activity = options.activityId ?? activityId;
      return instance.activityInsightsHandler(
        new Request(
          `${origin}/api/trips/${id}/activities/${activity}/insights?version=${options.version ?? version}`,
          {
            method: options.method ?? "POST",
            body: options.body,
            headers: {
              cookie: options.cookie ?? state.cookie,
              origin: options.requestOrigin ?? origin,
            },
          },
        ),
        id,
        activity,
      );
    };
    assert.equal((await api({ cookie: "" })).status, 401);
    assert.equal((await api({ cookie: otherCookie })).status, 404);
    assert.equal((await api({ activityId: randomUUID() })).status, 404);
    assert.equal((await api({ method: "GET" })).status, 405);
    assert.equal((await api({ version: version + 1 })).status, 409);
    assert.equal(
      (await api({ requestOrigin: "https://outside.example" })).status,
      403,
    );
    assert.equal(
      (await api({ body: '{"url":"https://outside.example"}' })).status,
      400,
    );
    const generic = await api({
      activityId: saved.itinerary.days[0].activities[0].id,
    });
    assert.deepEqual(await generic.json(), { status: "generic" });
    const off = await api({}, state.app);
    assert.deepEqual(await off.json(), { status: "disabled" });
    const streamedEmptyBody = {
      method: "POST",
      duplex: "half",
      body: new ReadableStream({ start: (controller) => controller.close() }),
      headers: { cookie: state.cookie, origin },
    };
    const empty = await state.app.activityInsightsHandler(
      new Request(
        `${origin}/api/insights?version=${version}`,
        streamedEmptyBody,
      ),
      state.trip.id,
      activityId,
    );
    assert.deepEqual(await empty.json(), { status: "disabled" });
    assert.equal(stub.requests.length, 0);
    assert.equal(
      (await state.connection.db.select().from(generationQuota)).filter((row) =>
        row.key.startsWith("activity-insights:"),
      ).length,
      0,
    );

    // Use two independent application instances with a larger cap to verify
    // that concurrent requests for the same saved activity are deduplicated.
    const config = {
      ...state.config,
      places: { key: "fixture", fetch: stub.fetch, dailyLimit: 2 },
    };
    const instances = [
      createApplication(state.connection.db, config),
      createApplication(state.connection.db, config),
    ];
    const responses = await Promise.all(
      instances.map((instance) => api({}, instance)),
    );
    assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 429]);
    const success = responses.find(({ ok }) => ok)!;
    assert.equal(success.headers.get("cache-control"), "no-store");
    assert.equal((await success.json()).status, "matched");
    assert.equal(stub.requests.length, 2);

    const draft = await app.trips.openDraft(otherUser, {});
    const anotherTrip = await app.trips.complete(otherUser, draft.id, {
      version: draft.version,
      data: solRecording.intent,
    });
    await state.connection.db
      .update(trip)
      .set({ itinerary: saved.itinerary, itineraryVersion: version })
      .where(eq(trip.id, anotherTrip.id));
    assert.equal(
      (await api({ cookie: otherCookie, tripId: anotherTrip.id })).status,
      429,
    );
    assert.equal(stub.requests.length, 2);
    assert.deepEqual(
      (await app.trips.read(state.userId, state.trip.id)).itinerary,
      saved.itinerary,
    );
    const rows = (
      await state.connection.db.select().from(generationQuota)
    ).filter((row) => row.key.startsWith("activity-insights:"));
    assert.equal(rows.length, 4);
    assert.ok(rows.every((row) => row.count === 1));
    const largerCap = createApplication(state.connection.db, {
      ...state.config,
      places: { key: "fixture", fetch: stub.fetch, dailyLimit: 20 },
    });
    await state.connection.db
      .update(generationQuota)
      .set({ count: 3 })
      .where(eq(generationQuota.key, "activity-insights:project:minute"));
    assert.equal(
      (await api({ cookie: otherCookie, tripId: anotherTrip.id }, largerCap))
        .status,
      429,
    );
    await state.connection.db
      .update(generationQuota)
      .set({ count: 1 })
      .where(eq(generationQuota.key, "activity-insights:project:minute"));
    await state.connection.db
      .update(generationQuota)
      .set({ count: 5 })
      .where(eq(generationQuota.key, `activity-insights:user:${state.userId}`));
    await state.connection.db
      .update(generationQuota)
      .set({ lastRequest: Date.now() - 60_000 })
      .where(
        eq(
          generationQuota.key,
          `activity-insights:activity:${state.userId}:${state.trip.id}:${activityId}`,
        ),
      );
    assert.equal((await api({}, largerCap)).status, 429);
    assert.equal(stub.requests.length, 2);
    assert.deepEqual(state.calls, { proposal: 0, itinerary: 1 });
  } finally {
    await state.close();
    await rm(directory, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../../src/server/db/connection";
import { createApplication } from "../../src/server/application";
import { generation, generationAttempt } from "../../src/server/db/schema";
import { solRecording } from "./sol-recording";
import type { TripModel } from "../../src/server/model";

export async function prepareOfflineSolReview(
  directory: string,
  origin: string,
  waitForRelease?: () => Promise<void>,
  databaseUrl?: string,
) {
  const connection = await openDatabase({ directory, url: databaseUrl });
  let closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      await connection.close();
    }
  };
  await connection.migrate();
  const secret = randomBytes(32).toString("hex"),
    password = randomBytes(24).toString("hex"),
    email = `offline-${randomBytes(6).toString("hex")}@example.com`;
  const calls = { proposal: 0, itinerary: 0 };
  const model: TripModel = {
    name: "offline-replay:gpt-6.1-sol",
    propose: async () => {
      calls.proposal++;
      throw Error("Recorded base must not be regenerated.");
    },
    generate: async () => {
      calls.itinerary++;
      if (waitForRelease) await waitForRelease();
      return structuredClone(solRecording.plan);
    },
  };
  const config = { origin, secret, model };
  const app = createApplication(connection.db, config);
  const signup = await app.authHandler(
    new Request(origin + "/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "x-forwarded-for": "127.0.0.1",
      },
      body: JSON.stringify({ name: "Offline Sol review", email, password }),
    }),
  );
  assert.equal(signup.status, 200);
  const userId: string = (await signup.json()).user.id;
  const cookie = signup.headers
    .getSetCookie()
    .map((part) => part.split(";")[0])
    .join(";");
  const draft = await app.trips.openDraft(userId, {});
  const trip = await app.trips.complete(userId, draft.id, {
    version: draft.version,
    data: solRecording.intent,
  });
  // Import a clearly historical failure into this isolated replay database only.
  // No old user IDs/session tokens are copied; ownership maps to this QA account.
  const [job] = await connection.db
    .insert(generation)
    .values({
      userId,
      tripId: trip.id,
      status: "failed",
      confirmed: true,
      attempts: 1,
      proposal: solRecording.base,
      error: solRecording.provenance.originalQualityIssues[0].message,
    })
    .returning();
  const [historicalAudit] = await connection.db
    .insert(generationAttempt)
    .values({
      generationId: job.id,
      userId,
      tripId: trip.id,
      ...solRecording.provenance.originalAudit,
      createdAt: new Date(solRecording.provenance.originalAudit.createdAt),
      updatedAt: new Date(solRecording.provenance.originalAudit.updatedAt),
    })
    .returning();
  const tasks: (() => Promise<void>)[] = [];
  const controller = new AbortController();
  const response = await app.generationHandler(
    new Request(origin + `/api/trips/${trip.id}/generation`, {
      method: "POST",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({ action: "retry" }),
      signal: controller.signal,
    }),
    trip.id,
    (task) => {
      tasks.push(task);
    },
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "queued");
  assert.equal(
    calls.itinerary,
    0,
    "POST returns before its background task starts.",
  );
  assert.equal(tasks.length, 1);
  return {
    close,
    connection,
    app,
    config,
    userId,
    cookie,
    trip,
    historicalAudit,
    worker: tasks[0],
    controller,
    calls,
    email,
    password,
    secret,
    origin,
    directory,
  };
}

export async function verifyOfflineSolReview(
  state: Awaited<ReturnType<typeof prepareOfflineSolReview>>,
) {
  const saved = await state.app.trips.read(state.userId, state.trip.id),
    job = (await state.app.generations.read(state.userId, state.trip.id))!;
  assert.equal(job.status, "complete");
  assert.ok(saved.itinerary);
  const itinerary = saved.itinerary;
  for (const field of Object.keys(
    solRecording.plan,
  ) as (keyof typeof solRecording.plan)[]) {
    if (field !== "days")
      assert.deepEqual(itinerary[field], solRecording.plan[field], field);
  }
  const withoutId = <T extends { id: string }>({ id, ...data }: T) => {
    assert.ok(id);
    return data;
  };
  assert.deepEqual(
    itinerary.days.map((day) => ({
      ...withoutId(day),
      activities: day.activities.map(withoutId),
    })),
    solRecording.plan.days,
    "Every recorded activity, time and cost must persist unchanged.",
  );

  assert.equal(itinerary.totalMinor, 227400);
  assert.equal(itinerary.reserveMinor, 25000);
  assert.equal(itinerary.budget?.remainingMinor, 22600);
  assert.deepEqual(itinerary.normalization?.corrections, []);
  assert.equal(itinerary.quality?.version, 3);
  assert.deepEqual(
    job.audits.find((audit) => audit.attempt === 1),
    state.historicalAudit,
  );
  const accepted = job.audits.find((audit) => audit.attempt === 2)!;
  assert.equal(accepted.status, "accepted");
  assert.ok(
    Object.values(accepted.validation).every((value) => value === "passed"),
  );
  assert.equal(
    accepted.usage,
    null,
    "Offline replay must not duplicate the historical API charge.",
  );
  assert.deepEqual(state.calls, { proposal: 0, itinerary: 1 });
  assert.deepEqual(
    (await state.app.trips.readDraft(state.userId, state.trip.draftId)).data,
    solRecording.intent,
  );
  await state.close();
  const reopened = await openDatabase({ directory: state.directory });
  try {
    const app = createApplication(reopened.db, state.config);
    assert.deepEqual(
      (await app.trips.read(state.userId, state.trip.id)).itinerary,
      itinerary,
    );
    assert.deepEqual(
      (await app.generations.read(state.userId, state.trip.id))?.audits,
      job.audits,
    );
    await assert.rejects(
      app.generations.read("foreign-user", state.trip.id),
      /not found/,
    );
    await assert.rejects(
      app.trips.read("foreign-user", state.trip.id),
      /not found/,
    );
    assert.equal(
      (
        await app.generationHandler(
          new Request(state.origin + "/generation"),
          state.trip.id,
          () => {},
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await app.generationHandler(
          new Request(state.origin + "/generation", {
            headers: { cookie: state.cookie },
          }),
          state.trip.id,
          () => {},
        )
      ).status,
      200,
    );
  } finally {
    await reopened.close();
  }
  return {
    itinerary,
    audits: job.audits,
    checks: {
      exactRecordedPlan: true,
      allValidationStagesPassed: true,
      historicalFailedAttemptPreserved: true,
      persistedAfterReopen: true,
      auditHistoryAfterReopen: true,
      sourceDraftRetained: true,
      ownerIsolation: true,
      sessionRestored: true,
      liveRequests: 0,
    },
  };
}

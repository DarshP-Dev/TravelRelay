import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { openDatabase } from "../src/server/db/connection";
import { createApplication } from "../src/server/application";
import { generation } from "../src/server/db/schema";
import { STALE_JOB_MS } from "../src/lib/generation-timing";
import { solRecording } from "./helpers/sol-recording";

test(
  "hard worker termination restores interrupted state and never retries on polling or restart",
  { timeout: 60_000 },
  async () => {
    await mkdir(".test-data", { recursive: true });
    const directory = await mkdtemp(
      path.resolve(".test-data/infrastructure-kill-"),
    );
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "tests/helpers/interrupted-worker.ts", directory],
      {
        windowsHide: true,
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      },
    );
    let seed: { userId: string; tripId: string; secret: string };
    try {
      seed = await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("Offline worker did not start.")),
          30_000,
        );
        child.once("message", (message) => {
          clearTimeout(timer);
          resolve(message as typeof seed);
        });
        child.once("exit", () => {
          clearTimeout(timer);
          reject(Error("Offline worker exited before its claim."));
        });
        child.once("error", reject);
      });
    } finally {
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
    }
    let connection = await openDatabase({ directory });
    let calls = 0;
    const config = {
      origin: "https://qa.example.invalid",
      secret: seed.secret,
      model: {
        name: "offline-worker-restart",
        propose: async () => {
          throw Error("No new proposal authorized.");
        },
        generate: async () => {
          calls++;
          return structuredClone(solRecording.plan);
        },
      },
    };
    try {
      let app = createApplication(connection.db, config);
      assert.equal(
        (await app.generations.read(seed.userId, seed.tripId))?.status,
        "generating",
      );
      assert.equal(
        (await app.trips.read(seed.userId, seed.tripId)).itinerary,
        null,
      );
      // Advance only the isolated job/lease clock evidence, without waiting 5 min.
      await connection.db
        .update(generation)
        .set({ updatedAt: new Date(Date.now() - STALE_JOB_MS - 1000) })
        .where(eq(generation.tripId, seed.tripId));
      await connection.db.execute(
        sql`update generation_quota set last_request = 0 where key = 'trip-generation:project:lease'`,
      );
      const recovered = await app.generations.read(seed.userId, seed.tripId);
      assert.equal(recovered?.status, "failed");
      assert.ok(recovered?.audits.some((a) => a.status === "interrupted"));
      for (let i = 0; i < 3; i++)
        await app.generations.read(seed.userId, seed.tripId);
      assert.equal(calls, 0);
      await connection.close();
      connection = await openDatabase({ directory });
      app = createApplication(connection.db, config);
      assert.equal(
        (await app.generations.read(seed.userId, seed.tripId))?.status,
        "failed",
      );
      assert.equal(calls, 0);
      await assert.rejects(
        app.generations.action("foreign-owner", seed.tripId, {
          action: "retry",
        }),
        { status: 404 },
      );
      await app.generations.action(seed.userId, seed.tripId, {
        action: "retry",
      });
      await Promise.all([
        app.generations.run(seed.userId, seed.tripId),
        app.generations.run(seed.userId, seed.tripId),
      ]);
      assert.equal(calls, 1);
      assert.equal(
        (await app.generations.read(seed.userId, seed.tripId))?.status,
        "complete",
      );
      assert.deepEqual(
        (await app.trips.read(seed.userId, seed.tripId)).data,
        solRecording.intent,
      );
    } finally {
      await connection.close();
    }
  },
);

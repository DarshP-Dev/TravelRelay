import { randomUUID } from "node:crypto";
import { and, eq, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./db/connection";
import { generationQuota as rateLimit } from "./db/schema";
import { PlanningError } from "../lib/itinerary";
import { WORKER_LEASE_MS } from "../lib/generation-timing";

export class GenerationQuotaError extends PlanningError {}
export const defaultGenerationLimits = {
  perMinute: 2,
  perDay: 20,
  perUserHour: 6,
};
export type GenerationLimits = typeof defaultGenerationLimits;
export function generationLimitsFromEnv(
  env: Record<string, string | undefined>,
): GenerationLimits {
  function limit(name: string, fallback: number, max: number) {
    return z.coerce
      .number()
      .int()
      .min(1)
      .max(max)
      .parse(env[name]?.trim() || fallback);
  }
  return {
    perMinute: limit("GENERATION_GLOBAL_RPM", 2, 1000),
    perDay: limit("GENERATION_GLOBAL_RPD", 20, 100000),
    perUserHour: limit("GENERATION_USER_HOURLY_LIMIT", 6, 100),
  };
}
export function pacificQuotaDay(now: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((key) => parts.find((part) => part.type === key)!.value)
    .join("-");
}
// All replicas sharing the application database share these counters and lease.
// The database cannot account for other apps using the same provider account.
export function createGenerationQuota(
  db: Database,
  limits: GenerationLimits = defaultGenerationLimits,
  clock: () => number = Date.now,
) {
  return {
    async acquire(userId: string) {
      const now = clock(),
        token = randomUUID(),
        key = "trip-generation:project:lease";
      await db.transaction(async (tx) => {
        const [lease] = await tx
          .insert(rateLimit)
          .values({ id: token, key, count: 1, lastRequest: now })
          .onConflictDoUpdate({
            target: rateLimit.key,
            set: { id: token, count: 1, lastRequest: now },
            setWhere: lt(rateLimit.lastRequest, now - WORKER_LEASE_MS),
          })
          .returning();
        if (!lease)
          throw new GenerationQuotaError(
            "Another trip is being planned. Please wait and retry, or view the example trip. Your input is saved.",
          );
        const buckets = [
          {
            key: `trip-generation:${userId}`,
            limit: limits.perUserHour,
            window: 3600_000,
            message:
              "You have reached your hourly generation limit. Retry later or view the example trip. Your input is saved.",
          },
          {
            key: "trip-generation:project:minute",
            limit: limits.perMinute,
            window: 60_000,
            message:
              "TravelRelay’s shared minute limit has been reached. Wait a minute before retrying, or view the example trip.",
          },
          {
            key: `trip-generation:project:day:${pacificQuotaDay(now)}`,
            limit: limits.perDay,
            window: 0,
            message:
              "Today’s shared generation allowance is used. It resets at midnight Pacific time. Your input is saved; the example trip is still available.",
          },
        ];
        for (const bucket of buckets) {
          const cutoff = now - bucket.window;
          const reset = bucket.window
            ? sql`${rateLimit.lastRequest} < ${cutoff}`
            : sql`false`;
          const [reserved] = await tx
            .insert(rateLimit)
            .values({
              id: randomUUID(),
              key: bucket.key,
              count: 1,
              lastRequest: now,
            })
            .onConflictDoUpdate({
              target: rateLimit.key,
              set: {
                count: sql`case when ${reset} then 1 else ${rateLimit.count}+1 end`,
                lastRequest: sql`case when ${reset} then ${now} else ${rateLimit.lastRequest} end`,
              },
              setWhere: or(
                bucket.window ? lt(rateLimit.lastRequest, cutoff) : undefined,
                lte(rateLimit.count, bucket.limit - 1),
              ),
            })
            .returning();
          if (!reserved) throw new GenerationQuotaError(bucket.message);
        }
      });
      return async () => {
        await db
          .delete(rateLimit)
          .where(and(eq(rateLimit.key, key), eq(rateLimit.id, token)));
      };
    },
  };
}

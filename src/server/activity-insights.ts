import { randomUUID } from "node:crypto";
import { and, like, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  insightTarget,
  type ActivityInsightsResult,
} from "../lib/activity-insights";
import { categoryFor } from "../lib/itinerary-editing";
import type { Database } from "./db/connection";
import { generationQuota } from "./db/schema";
import { createGooglePlaces } from "./google-places";
import { createTripStore, RequestError } from "./trips";

const DAY_MS = 86_400_000;
const prefix = "activity-insights:";
type PlacesConfig = Parameters<typeof createGooglePlaces>[0] & {
  dailyLimit: number;
};

export function activityInsightsFromEnv(
  env: Record<string, string | undefined>,
): PlacesConfig | undefined {
  const key = env.GOOGLE_PLACES_API_KEY?.trim();
  if (env.ACTIVITY_INSIGHTS_ENABLED !== "true" || !key) return;
  const dailyLimit = z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .safeParse(env.ACTIVITY_INSIGHTS_DAILY_LIMIT?.trim() || 20);
  return dailyLimit.success ? { key, dailyLimit: dailyLimit.data } : undefined;
}

class InsightLimit extends Error {}
function admitLookup(
  db: Database,
  dailyLimit: number,
  userId: string,
  tripId: string,
  activityId: string,
  now: number,
) {
  const buckets = [
    {
      key: "project:day",
      limit: dailyLimit,
      cutoff: Math.floor(now / DAY_MS) * DAY_MS,
    },
    { key: "project:minute", limit: 3, cutoff: now - 60_000 },
    { key: `user:${userId}`, limit: 5, cutoff: now - 3600_000 },
    {
      key: `activity:${userId}:${tripId}:${activityId}`,
      limit: 1,
      cutoff: now - 45_000,
    },
  ];
  // Reserve the whole lookup before either provider call. Ordering all requests
  // on the shared day row keeps these limits atomic across server instances.
  return db.transaction(async (tx) => {
    for (const { key, limit, cutoff } of buckets) {
      const expired = lt(generationQuota.lastRequest, cutoff);
      const [row] = await tx
        .insert(generationQuota)
        .values({
          id: randomUUID(),
          key: prefix + key,
          count: 1,
          lastRequest: now,
        })
        .onConflictDoUpdate({
          target: generationQuota.key,
          set: {
            count: sql`case when ${expired} then 1 else ${generationQuota.count} + 1 end`,
            lastRequest: sql`case when ${expired} then ${now} else ${generationQuota.lastRequest} end`,
          },
          setWhere: or(expired, lt(generationQuota.count, limit)),
        })
        .returning();
      if (!row) throw new InsightLimit();
    }
    await tx
      .delete(generationQuota)
      .where(
        and(
          like(generationQuota.key, `${prefix}%`),
          lt(generationQuota.lastRequest, now - 2 * DAY_MS),
        ),
      );
  });
}

export function createActivityInsights(
  db: Database,
  trips: ReturnType<typeof createTripStore>,
  config?: PlacesConfig,
) {
  const lookup = config && createGooglePlaces(config);
  return async (
    userId: string,
    tripId: string,
    activityId: string,
    version: number,
  ): Promise<ActivityInsightsResult> => {
    const { itinerary, itineraryVersion } = await trips.read(userId, tripId);
    if (!itinerary || !z.uuid().safeParse(activityId).success)
      throw new RequestError(404, "Activity not found.");
    if (version !== itineraryVersion)
      throw new RequestError(
        409,
        "The itinerary has changed. Reload the saved itinerary before looking up reviews.",
      );
    for (const [dayIndex, day] of itinerary.days.entries()) {
      const index = day.activities.findIndex(
        (activity) => activity.id === activityId,
      );
      if (index < 0) continue;
      const activity = day.activities[index];
      const target = insightTarget(
        activity,
        itinerary.base,
        categoryFor(activity, itinerary, dayIndex, index),
      );
      if (!target) return { status: "generic" };
      if (!config || !lookup) return { status: "disabled" };
      try {
        await admitLookup(
          db,
          config.dailyLimit,
          userId,
          tripId,
          activityId,
          Date.now(),
        );
      } catch (error) {
        if (error instanceof InsightLimit) return { status: "quota" };
        throw error;
      }
      return lookup(target, itinerary.base);
    }
    throw new RequestError(404, "Activity not found.");
  };
}

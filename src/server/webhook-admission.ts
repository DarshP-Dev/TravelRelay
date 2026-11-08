import { randomUUID } from "node:crypto";
import { lt, or, sql } from "drizzle-orm";
import type { Database } from "./db/connection";
import { generationQuota } from "./db/schema";
import { RequestError } from "./trips";

// One fixed shared bucket avoids untrusted forwarded-IP headers and unbounded
// per-attacker rows. This bounds provider verification calls, not edge bandwidth.
export function webhookAdmission(
  db: Database,
  maximum = 120,
  clock = Date.now,
) {
  return async () => {
    const now = clock(),
      cutoff = now - 60_000;
    const expired = sql`${generationQuota.lastRequest} < ${cutoff}`;
    const [allowed] = await db
      .insert(generationQuota)
      .values({
        id: randomUUID(),
        key: "paypal:webhook:minute",
        count: 1,
        lastRequest: now,
      })
      .onConflictDoUpdate({
        target: generationQuota.key,
        set: {
          count: sql`case when ${expired} then 1 else ${generationQuota.count}+1 end`,
          lastRequest: sql`case when ${expired} then ${now} else ${generationQuota.lastRequest} end`,
        },
        setWhere: or(
          lt(generationQuota.lastRequest, cutoff),
          lt(generationQuota.count, maximum),
        ),
      })
      .returning();
    if (!allowed)
      throw new RequestError(
        429,
        "Webhook capacity reached; retry delivery later.",
      );
  };
}

import { randomUUID } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./db/connection";
import { fxCache, fxSnapshot } from "./db/schema";
import { decimalRatio, type Currency } from "../lib/money";
import { fxSnapshotSchema, type FxQuote } from "../lib/finance-contracts";
import { RequestError } from "./trips";

const HOUR = 3_600_000,
  DAY = 86_400_000;
export function isStaleRate(snapshot: FxQuote["snapshot"], now = Date.now()) {
  return (
    snapshot.provider !== "identity" &&
    (Date.parse(snapshot.expiresAt) <= now ||
      now - Date.parse(snapshot.sourceDate) > 4 * DAY)
  );
}
// One immutable reference-rate snapshot per retrieval. No API key, browser
// provider calls, configurable endpoint, automatic retry or paid rate service.
export function createFxService(
  db: Database,
  options: { fetch?: typeof fetch; clock?: () => number } = {},
) {
  const transport = options.fetch ?? globalThis.fetch,
    clock = options.clock ?? Date.now;
  async function stored(id: string) {
    const [row] = await db
      .select()
      .from(fxSnapshot)
      .where(eq(fxSnapshot.id, id));
    if (!row)
      throw new RequestError(
        422,
        "This saved exchange-rate reference is unavailable. Get another estimate.",
      );
    return fxSnapshotSchema.parse(row.data);
  }
  async function quote(base: Currency, quote: Currency): Promise<FxQuote> {
    const now = clock(),
      key = `ecb:${base}:${quote}`;
    await db
      .insert(fxCache)
      .values({ key, retryAfter: new Date(0), leaseUntil: new Date(0) })
      .onConflictDoNothing();
    const [cache] = await db.select().from(fxCache).where(eq(fxCache.key, key));
    const saved = cache.snapshotId ? await stored(cache.snapshotId) : null;
    const usable =
      saved &&
      (saved.provider === "identity" ||
        now - Date.parse(saved.sourceDate) <= 7 * DAY);
    const result = (
      snapshot: FxQuote["snapshot"],
      warning: string | null = null,
    ): FxQuote => ({
      snapshot,
      stale: isStaleRate(snapshot, clock()),
      warning,
    });
    if (usable && !isStaleRate(saved, now)) return result(saved);
    const [lease] = await db
      .update(fxCache)
      .set({
        leaseUntil: new Date(now + 15_000),
        retryAfter: new Date(now + 60_000),
      })
      .where(
        and(
          eq(fxCache.key, key),
          lte(fxCache.leaseUntil, new Date(now)),
          lte(fxCache.retryAfter, new Date(now)),
        ),
      )
      .returning();
    if (!lease) {
      if (usable)
        return result(
          saved,
          "Showing the dated cached reference while refresh is unavailable. It is not a current quote.",
        );
      throw new RequestError(
        429,
        "An exchange-rate lookup is already running or cooling down. Wait a minute and try again; your input is safe.",
      );
    }
    try {
      const url = `https://api.frankfurter.dev/v2/rate/${base}/${quote}?providers=ecb`;
      let rate = "1",
        sourceDate = new Date(now).toISOString().slice(0, 10);
      if (base !== quote) {
        const response = await transport(url, {
          signal: AbortSignal.timeout(8_000),
          cache: "no-store",
          redirect: "error",
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw Error("Rate source unavailable");
        const reader = response.body?.getReader();
        if (!reader) throw Error("Empty rate response");
        let size = 0;
        const chunks: Uint8Array[] = [];
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 16_384) throw Error("Oversized rate response");
            chunks.push(chunk.value);
          }
        } finally {
          await reader.cancel();
        }
        const text = Buffer.concat(chunks).toString("utf8");
        const wire = z
          .object({
            base: z.literal(base),
            quote: z.literal(quote),
            date: z.iso.date(),
            rate: z.number().positive(),
          })
          .strict()
          .parse(JSON.parse(text));
        const matches = [...text.matchAll(/"rate"\s*:\s*([\d.eE+-]+)/g)];
        if (matches.length !== 1) throw Error("Ambiguous rate response");
        rate = matches[0][1];
        decimalRatio(rate);
        sourceDate = wire.date;
        if (
          Date.parse(sourceDate) > now + DAY ||
          now - Date.parse(sourceDate) > 7 * DAY
        )
          throw Error("Unavailable recent rate");
      }
      const snapshot = fxSnapshotSchema.parse({
        id: randomUUID(),
        base,
        quote,
        rate,
        provider: base === quote ? "identity" : "frankfurter-ecb",
        sourceDate,
        retrievedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + HOUR).toISOString(),
        sourceUrl: base === quote ? "https://frankfurter.dev/" : url,
        rounding: "half-up-per-line",
      });
      await db.transaction(async (tx) => {
        await tx.insert(fxSnapshot).values({
          id: snapshot.id,
          base,
          quote,
          rate,
          provider: snapshot.provider,
          data: snapshot,
          retrievedAt: new Date(now),
          expiresAt: new Date(now + HOUR),
        });
        await tx
          .update(fxCache)
          .set({ snapshotId: snapshot.id, leaseUntil: new Date(0) })
          .where(eq(fxCache.key, key));
      });
      return result(snapshot);
    } catch {
      await db
        .update(fxCache)
        .set({ leaseUntil: new Date(0) })
        .where(eq(fxCache.key, key));
      if (usable)
        return result(
          saved,
          "Exchange-rate source unavailable. This is an explicitly stale cached estimate, not a PayPal rate.",
        );
      throw new RequestError(
        503,
        "Exchange rates are unavailable. No conversion or payment was made. Keep the original amount and retry later.",
      );
    }
  }
  return { quote, stored };
}

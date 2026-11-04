import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  completeIntentSchema,
  initialIntent,
  intentSchema,
} from "../lib/trip-intent";
import { getTemplate } from "../lib/curated-trips";
import type { Database } from "./db/connection";
import { draft, trip } from "./db/schema";

export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const writeSchema = z
  .object({ version: z.number().int().positive(), data: intentSchema })
  .strict();
const idSchema = z.uuid();
export function createTripStore(db: Database) {
  return {
    async list(userId: string) {
      return db
        .select()
        .from(trip)
        .where(eq(trip.userId, userId))
        .orderBy(desc(trip.createdAt));
    },
    async listDrafts(userId: string) {
      return db
        .select()
        .from(draft)
        .where(and(eq(draft.userId, userId), eq(draft.archived, false)))
        .orderBy(desc(draft.updatedAt));
    },
    async read(userId: string, id: string) {
      if (!idSchema.safeParse(id).success)
        throw new RequestError(404, "Trip not found.");
      const [record] = await db
        .select()
        .from(trip)
        .where(and(eq(trip.userId, userId), eq(trip.id, id)));
      if (!record) throw new RequestError(404, "Trip not found.");
      return record;
    },
    async openDraft(userId: string, input: unknown) {
      const { templateId } = z
        .object({ templateId: z.string().max(40).optional() })
        .strict()
        .parse(input);
      if (templateId && !getTemplate(templateId))
        throw new RequestError(
          400,
          "Choose a supported inspiration or start a new trip.",
        );
      const slot = templateId ?? "blank";
      await db
        .insert(draft)
        .values({ userId, slot, data: initialIntent(templateId) })
        .onConflictDoNothing();
      const [record] = await db
        .select()
        .from(draft)
        .where(
          and(
            eq(draft.userId, userId),
            eq(draft.slot, slot),
            eq(draft.archived, false),
          ),
        );
      if (!record) throw new RequestError(409, "Draft changed. Please reload.");
      return record;
    },
    async readDraft(userId: string, id: string) {
      if (!idSchema.safeParse(id).success)
        throw new RequestError(404, "Draft not found.");
      const [record] = await db
        .select()
        .from(draft)
        .where(and(eq(draft.userId, userId), eq(draft.id, id)));
      if (!record) throw new RequestError(404, "Draft not found.");
      return record;
    },
    async saveDraft(userId: string, id: string, input: unknown) {
      if (!idSchema.safeParse(id).success)
        throw new RequestError(404, "Draft not found.");
      const parsed = writeSchema.parse(input);
      const [record] = await db
        .update(draft)
        .set({
          data: parsed.data,
          version: sql`${draft.version}+1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(draft.id, id),
            eq(draft.userId, userId),
            eq(draft.version, parsed.version),
            eq(draft.archived, false),
          ),
        )
        .returning();
      if (record) return record;
      await this.readDraft(userId, id);
      throw new RequestError(
        409,
        "This draft changed in another tab or was saved as a trip. Reload the saved version before continuing.",
      );
    },
    async complete(userId: string, id: string, input: unknown) {
      if (!idSchema.safeParse(id).success)
        throw new RequestError(404, "Draft not found.");
      const parsed = writeSchema.parse(input);
      const data = completeIntentSchema.parse(parsed.data);
      return db.transaction(async (tx) => {
        const [owned] = await tx
          .select()
          .from(draft)
          .where(and(eq(draft.id, id), eq(draft.userId, userId)));
        if (!owned) throw new RequestError(404, "Draft not found.");
        const existing = async () =>
          (
            await tx
              .select()
              .from(trip)
              .where(and(eq(trip.draftId, id), eq(trip.userId, userId)))
          )[0];
        const previous = await existing();
        if (previous) return previous;
        const [claimed] = await tx
          .update(draft)
          .set({
            archived: true,
            data,
            version: sql`${draft.version}+1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(draft.id, id),
              eq(draft.userId, userId),
              eq(draft.version, parsed.version),
              eq(draft.archived, false),
            ),
          )
          .returning();
        if (!claimed) {
          const winner = await existing();
          if (winner) return winner;
          throw new RequestError(
            409,
            "Your draft changed. Reload it before saving your trip.",
          );
        }
        const [saved] = await tx
          .insert(trip)
          .values({ userId, draftId: id, data })
          .returning();
        return saved;
      });
    },
  };
}

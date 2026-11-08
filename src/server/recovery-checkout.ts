import { and, eq } from "drizzle-orm";
import type { Database } from "./db/connection";
import {
  financialEvent,
  itineraryEdit,
  paypalBooking,
  paypalOperation,
  recoveryAttempt,
  recoveryCase,
  trip,
} from "./db/schema";
import { RequestError } from "./trips";

// Reused inside quote-save and checkout transactions; ordinary planning quote
// validation remains separate. The shared case lock fences concurrent finish.
export async function assertRecoveryCheckout(
  db: Pick<Database, "select">,
  userId: string,
  tripId: string,
  activityId: string,
  caseId: string,
  version: number,
  merchantId?: string,
) {
  const [entry] = await db
    .select()
    .from(recoveryCase)
    .where(
      and(
        eq(recoveryCase.id, caseId),
        eq(recoveryCase.tripId, tripId),
        eq(recoveryCase.userId, userId),
      ),
    )
    .for("share");
  if (!entry) throw new RequestError(404, "Recovery case not found.");
  if (
    !merchantId ||
    !entry.editId ||
    entry.resolvedAt ||
    entry.replacementActivityId !== activityId
  )
    throw new RequestError(
      409,
      "An active approved Sandbox replacement is required.",
    );
  const [saved] = await db
    .select()
    .from(trip)
    .where(and(eq(trip.id, tripId), eq(trip.userId, userId)));
  const [edit] = await db
    .select()
    .from(itineraryEdit)
    .where(eq(itineraryEdit.id, entry.editId));
  const reviews = await db
    .select()
    .from(recoveryAttempt)
    .where(eq(recoveryAttempt.caseId, caseId));
  const option = reviews
    .filter((r) => r.status === "applied")
    .flatMap((r) => r.options.filter((o) => o.id === r.appliedOptionId))
    .find((o) => o.replacementActivityId === activityId);
  const activity = saved?.itinerary?.days
    .flatMap((d) => d.activities)
    .find((a) => a.id === activityId);
  if (
    !activity ||
    saved?.itineraryVersion !== version ||
    edit?.version !== version ||
    !option ||
    edit.proposalId !== option.id
  )
    throw new RequestError(
      409,
      "The approved recovery itinerary changed. Review the recovery before checkout.",
    );
  const [original] = await db
    .select()
    .from(paypalBooking)
    .where(eq(paypalBooking.id, entry.bookingId));
  const operations = await db
    .select()
    .from(paypalOperation)
    .where(eq(paypalOperation.bookingId, entry.bookingId));
  const events = await db
    .select()
    .from(financialEvent)
    .where(eq(financialEvent.intentId, original.intentId));
  const capture = events.find(
    (e) => e.kind === "captured" && e.captureId === original.captureId,
  );
  const returned = events
    .filter(
      (e) =>
        e.kind === "refund_completed" && e.captureId === original.captureId,
    )
    .reduce((sum, e) => sum + e.amountMinor, 0);
  if (
    original.merchantId !== merchantId ||
    !capture ||
    capture.amountMinor !== 500 ||
    capture.originalCurrency !== "USD" ||
    returned !== 500 ||
    operations.some(
      (o) => ["sending", "uncertain", "pending"].includes(o.status) || o.issue,
    ) ||
    !operations.some(
      (o) =>
        o.kind === "refund" &&
        o.status === "verified" &&
        o.providerStatus === "COMPLETED",
    )
  )
    throw new RequestError(
      409,
      "The original Sandbox payment must have a verified completed full refund before replacement checkout.",
    );
  return { entry, activity };
}

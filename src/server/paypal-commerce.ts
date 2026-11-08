import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { commerceRequest, demoPriceMinor } from "@/lib/paypal-contracts";
import { parseMoney } from "@/lib/money";
import type { ProviderOutcome } from "@/lib/finance-contracts";
import type { Database } from "./db/connection";
import {
  financialEvent,
  paypalBooking,
  paypalOperation,
  paypalWebhookReceipt,
  trip,
  tripWallet,
  user,
  recoveryCase,
} from "./db/schema";
import { assertRecoveryCheckout } from "./recovery-checkout";
import { RequestError } from "./trips";
import type { createWallet } from "./wallet";
import {
  boundedJson,
  PayPalFailure,
  paypalId,
  sandboxHost,
  webhookEvent,
  type PayPalClient,
} from "./paypal-client";

type Booking = typeof paypalBooking.$inferSelect;
type Operation = typeof paypalOperation.$inferSelect;
type Order = Awaited<ReturnType<PayPalClient["order"]>>;
type Capture = Awaited<ReturnType<PayPalClient["capture"]>>;
type Refund = Awaited<ReturnType<PayPalClient["refund"]>>;
const fail = () => new PayPalFailure("invalid");
const isUuid = (value: unknown): value is string =>
  z.uuid().safeParse(value).success;
const exactUsd = (
  amount: { currency_code: string; value: string },
  minor: number,
) => {
  if (
    amount.currency_code !== "USD" ||
    parseMoney(amount.value, "USD") !== minor
  )
    throw fail();
};
const isFinal = (operation: Operation) =>
  ["verified", "failed"].includes(operation.status);
const actionable = (operation: Operation) =>
  ["sending", "uncertain", "pending"].includes(operation.status);
const freshQuote = (createdAt: string) =>
  Date.now() - Date.parse(createdAt) < 86_400_000;

export function createCommerce(
  db: Database,
  wallet: ReturnType<typeof createWallet>,
  client?: PayPalClient,
) {
  function provider() {
    if (!client)
      throw new RequestError(503, "PayPal Sandbox checkout is not configured.");
    return client;
  }
  async function owned(userId: string, tripId: string, bookingId: string) {
    const [booking] = await db
      .select()
      .from(paypalBooking)
      .where(
        and(
          eq(paypalBooking.userId, userId),
          eq(paypalBooking.tripId, tripId),
          eq(paypalBooking.id, bookingId),
        ),
      );
    if (!booking) throw new RequestError(404, "Sandbox booking not found.");
    return booking;
  }
  function checkMerchant(booking: Booking) {
    if (booking.merchantId !== provider().merchantId)
      throw new RequestError(
        503,
        "This booking needs its original Sandbox merchant configuration.",
      );
  }
  const operations = (bookingId: string) =>
    db
      .select()
      .from(paypalOperation)
      .where(eq(paypalOperation.bookingId, bookingId))
      .orderBy(asc(paypalOperation.createdAt));
  async function recoveryEligibility(
    store: Pick<Database, "select">,
    userId: string,
    tripId: string,
    quote: Awaited<ReturnType<typeof wallet.read>>["intents"][number],
    version: number,
  ) {
    const [linked] = await store
      .select()
      .from(recoveryCase)
      .where(
        and(
          eq(recoveryCase.tripId, tripId),
          eq(recoveryCase.userId, userId),
          eq(recoveryCase.replacementActivityId, quote.activityId),
        ),
      );
    if (!linked && quote.purpose === "planning") return;
    if (
      !linked ||
      quote.purpose !== "recovery-checkout" ||
      quote.recoveryCaseId !== linked.id
    )
      throw new RequestError(
        409,
        "Use the separate approved recovery checkout quote for this replacement.",
      );
    await assertRecoveryCheckout(
      store,
      userId,
      tripId,
      quote.activityId,
      linked.id,
      version,
      client?.merchantId,
    );
  }
  async function read(userId: string, tripId: string) {
    const state = await wallet.read(userId, tripId);
    const eligible = new Set<string>();
    for (const quote of state.intents) {
      try {
        await recoveryEligibility(
          db,
          userId,
          tripId,
          quote,
          state.itineraryVersion,
        );
        eligible.add(quote.id);
      } catch (error) {
        if (!(error instanceof RequestError)) throw error;
      }
    }
    const bookings = await db
      .select()
      .from(paypalBooking)
      .where(
        and(eq(paypalBooking.userId, userId), eq(paypalBooking.tripId, tripId)),
      )
      .orderBy(asc(paypalBooking.createdAt));
    const all = bookings.length
      ? await db
          .select()
          .from(paypalOperation)
          .where(
            inArray(
              paypalOperation.bookingId,
              bookings.map((b) => b.id),
            ),
          )
          .orderBy(asc(paypalOperation.createdAt))
      : [];
    return {
      clientId: client?.clientId ?? null,
      walletVersion: state.version,
      itineraryVersion: state.itineraryVersion,
      currency: state.currency,
      quotes: state.intents
        .filter(
          (i) =>
            i.status === "planned" &&
            i.originalCurrency === "USD" &&
            i.originalMinor === demoPriceMinor &&
            eligible.has(i.id) &&
            !i.fxStale &&
            !i.staleActivity &&
            freshQuote(i.fxRefreshedAt ?? i.createdAt) &&
            !bookings.some((b) => b.intentId === i.id),
        )
        .map((i) => ({
          id: i.id,
          title: i.title,
          estimatedMinor: i.estimatedDisplayMinor,
          planningEstimateMinor: i.planningEstimateMinor,
          purpose: i.purpose,
          fxExpiresAt: i.fx.expiresAt,
        })),
      bookings: bookings
        .filter((b) => state.intents.some((i) => i.id === b.intentId))
        .map((b) => {
          const intent = state.intents.find((i) => i.id === b.intentId)!;
          const related = all.filter((op) => op.bookingId === b.id);
          return {
            id: b.id,
            intentId: b.intentId,
            activityId: b.activityId,
            title: intent.title,
            orderId: b.orderId,
            captureId: b.captureId,
            canOperate: b.merchantId === client?.merchantId,
            payment: intent.state,
            estimatedMinor: intent.estimatedDisplayMinor,
            paidAt:
              state.events.find(
                (e) => e.intentId === b.intentId && e.kind === "captured",
              )?.occurredAt ?? null,
            needsReview: related.some(
              (o) => o.kind === "capture" && o.issue === "operator-review",
            ),
            refundableMinor: Math.max(
              0,
              intent.state.netMinor -
                related
                  .filter((o) => o.kind === "refund" && actionable(o))
                  .reduce((sum, o) => {
                    const settled = state.events.some(
                      (e) =>
                        e.intentId === b.intentId &&
                        !!o.providerId &&
                        e.refundId === o.providerId &&
                        ["refund_completed", "refund_failed"].includes(e.kind),
                    );
                    return sum + (settled ? 0 : o.requestedMinor);
                  }, 0),
            ),
            operations: related.map(
              ({
                id,
                kind,
                status,
                requestedMinor,
                providerId,
                providerStatus,
                issue,
                settlement,
                createdAt,
                updatedAt,
              }) => ({
                id,
                kind,
                status,
                requestedMinor,
                providerId,
                providerStatus,
                issue,
                settlement,
                createdAt: createdAt.toISOString(),
                updatedAt: updatedAt.toISOString(),
              }),
            ),
          };
        }),
    };
  }

  async function update(
    op: Operation,
    patch: Partial<
      Pick<Operation, "status" | "providerStatus" | "issue" | "settlement">
    >,
  ) {
    // Late messages cannot downgrade a settled operation.
    await db
      .update(paypalOperation)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(paypalOperation.id, op.id),
          inArray(paypalOperation.status, ["sending", "pending", "uncertain"]),
        ),
      );
  }
  async function uncertain(op: Operation, error: unknown) {
    const reason =
      error instanceof PayPalFailure ? error.reason : "unavailable";
    if (op.status === "pending") return;
    await update(op, {
      status: reason === "declined" && !op.providerId ? "failed" : "uncertain",
      issue: reason,
    });
  }
  async function operatorReview(b: Booking) {
    await db
      .update(paypalOperation)
      .set({ issue: "operator-review", updatedAt: new Date() })
      .where(
        and(
          eq(paypalOperation.bookingId, b.id),
          eq(paypalOperation.kind, "capture"),
        ),
      );
  }
  async function attach(op: Operation, id: string) {
    const [saved] = await db
      .update(paypalOperation)
      .set({ providerId: id, updatedAt: new Date() })
      .where(
        and(
          eq(paypalOperation.id, op.id),
          or(
            eq(paypalOperation.providerId, id),
            isNull(paypalOperation.providerId),
          ),
        ),
      )
      .returning();
    if (!saved) throw fail();
    return saved;
  }

  async function record(
    b: Booking,
    orderId: string,
    fields: Pick<
      ProviderOutcome,
      "kind" | "amountMinor" | "captureId" | "refundId"
    > &
      Partial<ProviderOutcome>,
    event?: string,
  ) {
    const key =
      fields.kind + ":" + (fields.refundId ?? fields.captureId ?? orderId);
    await wallet.recordVerified(b.userId, b.tripId, b.intentId, {
      provider: "paypal-sandbox",
      verification: event ? "verified-webhook" : "provider-api",
      eventId: key,
      reconciliationRef: event ?? key,
      orderId,
      currency: "USD",
      feeMinor: 0,
      feeCurrency: null,
      feeTreatment: "unknown",
      reversalId: null,
      chargedCurrency: null,
      chargedMinor: null,
      occurredAt: new Date().toISOString(),
      ...fields,
    });
  }

  function verifyOrder(b: Booking, order: Order, id: string) {
    const [unit] = order.purchase_units;
    if (
      order.id !== id ||
      (b.orderId && b.orderId !== id) ||
      unit.custom_id !== b.id ||
      unit.reference_id !== b.id ||
      unit.payee.merchant_id !== b.merchantId
    )
      throw fail();
    exactUsd(unit.amount, demoPriceMinor);
    return unit.payments?.captures?.[0]?.id;
  }
  function verifyCapture(order: Order, capture: Capture, expected: string) {
    if (
      capture.id !== expected ||
      (capture.supplementary_data?.related_ids?.order_id &&
        capture.supplementary_data.related_ids.order_id !== order.id)
    )
      throw fail();
    exactUsd(capture.amount, demoPriceMinor);
  }
  async function syncOrder(
    b: Booking,
    order: Order,
    expected: string,
    event?: string,
  ) {
    checkMerchant(b);
    const captureId = verifyOrder(b, order, expected);
    const orderOp = (await operations(b.id)).find((o) => o.kind === "order");
    if (!orderOp) throw fail();
    await attach(orderOp, order.id);
    const [linked] = await db
      .update(paypalBooking)
      .set({ orderId: order.id, updatedAt: new Date() })
      .where(
        and(
          eq(paypalBooking.id, b.id),
          or(
            eq(paypalBooking.orderId, order.id),
            isNull(paypalBooking.orderId),
          ),
        ),
      )
      .returning();
    if (!linked) throw fail();
    // Order creation and payment are independent. A verified create operation
    // stays verified even after the order is approved or subsequently voided.
    await db
      .update(paypalOperation)
      .set({
        status: "verified",
        providerStatus: order.status,
        issue: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paypalOperation.id, orderOp.id),
          or(
            isNull(paypalOperation.providerStatus),
            inArray(paypalOperation.providerStatus, [
              "CREATED",
              "SAVED",
              "PAYER_ACTION_REQUIRED",
            ]),
            ...(order.status === "CREATED" ||
            order.status === "SAVED" ||
            order.status === "PAYER_ACTION_REQUIRED"
              ? []
              : [eq(paypalOperation.providerStatus, "APPROVED")]),
          ),
        ),
      );
    if (!captureId) {
      const captureOp = (await operations(b.id)).find(
        (o) => o.kind === "capture",
      );
      if (captureOp && order.status === "VOIDED")
        await update(captureOp, {
          status: "failed",
          providerStatus: order.status,
        });
      if (order.status === "COMPLETED") throw fail();
      return linked;
    }
    const cap = await provider().capture(captureId);
    verifyCapture(order, cap, captureId);
    if (linked.captureId && linked.captureId !== cap.id) throw fail();
    await db
      .insert(paypalOperation)
      .values({
        id: randomUUID(),
        bookingId: b.id,
        kind: "capture",
        status: "pending",
        requestedMinor: demoPriceMinor,
      })
      .onConflictDoNothing();
    const captureOp = (await operations(b.id)).find(
      (o) => o.kind === "capture",
    );
    if (!captureOp) throw fail();
    await attach(captureOp, cap.id);
    const completed = ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(
      cap.status,
    );
    const pending = cap.status === "PENDING";
    if (completed) {
      if (order.status !== "COMPLETED") throw fail();
      const breakdown = cap.seller_receivable_breakdown;
      const fee =
        breakdown?.paypal_fee?.currency_code === "USD"
          ? parseMoney(breakdown.paypal_fee.value, "USD")
          : 0;
      if (breakdown?.gross_amount)
        exactUsd(breakdown.gross_amount, demoPriceMinor);
      if (fee > demoPriceMinor) throw fail();
      const [existingCapture] = await db
        .select()
        .from(financialEvent)
        .where(
          and(
            eq(financialEvent.intentId, b.intentId),
            eq(financialEvent.kind, "captured"),
            eq(financialEvent.captureId, cap.id),
          ),
        );
      if (!existingCapture)
        await record(
          b,
          order.id,
          {
            kind: "captured",
            amountMinor: demoPriceMinor,
            captureId: cap.id,
            refundId: null,
            occurredAt: new Date(cap.create_time).toISOString(),
            chargedMinor: demoPriceMinor,
            chargedCurrency: "USD",
            feeMinor: fee,
            feeCurrency: fee ? "USD" : null,
            feeTreatment: fee ? "merchant-fee" : "unknown",
          },
          event,
        );
      const settlement: Record<string, string> = {};
      for (const [key, value] of Object.entries(breakdown ?? {})) {
        if (key === "exchange_rate" && breakdown?.exchange_rate) {
          const fx = breakdown.exchange_rate;
          settlement.exchange_rate =
            fx.value + " " + fx.target_currency + " per " + fx.source_currency;
        } else if ("currency_code" in value)
          settlement[key] = value.value + " " + value.currency_code;
      }
      const [saved] = await db
        .update(paypalBooking)
        .set({ captureId: cap.id, updatedAt: new Date() })
        .where(
          and(
            eq(paypalBooking.id, b.id),
            or(
              eq(paypalBooking.captureId, cap.id),
              isNull(paypalBooking.captureId),
            ),
          ),
        )
        .returning();
      if (!saved) throw fail();
      await update(captureOp, {
        status: "verified",
        providerStatus: cap.status,
        issue: null,
        settlement,
      });
      return saved;
    }
    await update(captureOp, {
      status: pending ? "pending" : "failed",
      providerStatus: cap.status,
      issue: null,
    });
    return linked;
  }

  async function checkout(
    userId: string,
    tripId: string,
    input: Extract<z.infer<typeof commerceRequest>, { action: "checkout" }>,
  ) {
    const api = provider();
    const state = await wallet.read(userId, tripId);
    const claim = await db.transaction(async (tx) => {
      // Serialize order limits across this account, and follow the itinerary
      // editor's trip -> wallet lock order.
      await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, userId))
        .for("update");
      const [saved] = await tx
        .select({ version: trip.itineraryVersion })
        .from(trip)
        .where(and(eq(trip.id, tripId), eq(trip.userId, userId)))
        .for("update");
      const [walletRow] = await tx
        .select({ version: tripWallet.version })
        .from(tripWallet)
        .where(
          and(eq(tripWallet.tripId, tripId), eq(tripWallet.userId, userId)),
        )
        .for("update");
      const [existing] = await tx
        .select()
        .from(paypalBooking)
        .where(
          and(
            eq(paypalBooking.tripId, tripId),
            eq(paypalBooking.userId, userId),
            eq(paypalBooking.intentId, input.intentId),
          ),
        );
      if (existing) return { booking: existing };
      if (
        state.version !== input.walletVersion ||
        state.itineraryVersion !== input.itineraryVersion ||
        walletRow?.version !== state.version ||
        saved?.version !== state.itineraryVersion
      )
        throw new RequestError(
          409,
          "The trip or planning quote changed. Review the current price before continuing.",
        );
      const quote = state.intents.find((i) => i.id === input.intentId);
      if (
        !quote ||
        quote.originalCurrency !== "USD" ||
        quote.originalMinor !== demoPriceMinor ||
        quote.status !== "planned" ||
        quote.staleActivity ||
        quote.fxStale ||
        !freshQuote(quote.fxRefreshedAt ?? quote.createdAt) ||
        state.events.some(
          (e) => e.intentId === quote.id && !e.kind.startsWith("intent_"),
        )
      )
        throw new RequestError(
          422,
          "Save a fresh USD 5.00 planning quote for an existing activity before checkout.",
        );
      await recoveryEligibility(
        tx,
        userId,
        tripId,
        quote,
        state.itineraryVersion,
      );
      const recent = await tx
        .select({ id: paypalBooking.id })
        .from(paypalBooking)
        .where(
          and(
            eq(paypalBooking.userId, userId),
            gte(paypalBooking.createdAt, new Date(Date.now() - 3600000)),
          ),
        )
        .limit(6);
      if (recent.length >= 6)
        throw new RequestError(
          429,
          "Too many Sandbox checkouts. Try again later.",
        );
      const [booking] = await tx
        .insert(paypalBooking)
        .values({
          intentId: quote.id,
          tripId,
          userId,
          activityId: quote.activityId,
          merchantId: api.merchantId,
        })
        .returning();
      const [operation] = await tx
        .insert(paypalOperation)
        .values({
          id: randomUUID(),
          bookingId: booking.id,
          kind: "order",
          status: "sending",
          requestedMinor: demoPriceMinor,
        })
        .returning();
      return { booking, operation };
    });
    const { booking, operation } = claim;
    checkMerchant(booking);
    if (!operation) return booking;
    let op = operation;
    try {
      const created = await api.create(booking.id, op.id, op.requestedMinor);
      op = await attach(op, created.id);
      return await syncOrder(booking, await api.order(created.id), created.id);
    } catch (error) {
      await uncertain(op, error);
      return booking;
    }
  }

  async function capture(
    userId: string,
    tripId: string,
    bookingId: string,
    orderId: string,
  ) {
    const b = await owned(userId, tripId, bookingId);
    checkMerchant(b);
    if (b.orderId !== orderId)
      throw new RequestError(
        422,
        "The approved order does not match this booking.",
      );
    if ((await operations(b.id)).some((o) => o.kind === "capture")) return;
    if (!(await claimLookup(b.id))) return;
    // Only a provider-confirmed APPROVED order can lead to the capture write.
    const order = await provider().order(orderId);
    const knownCapture = verifyOrder(b, order, orderId);
    if (knownCapture) {
      await syncOrder(b, order, orderId);
      return;
    }
    if (order.status !== "APPROVED")
      throw new RequestError(
        409,
        "PayPal has not confirmed approval for this order.",
      );
    const state = await wallet.read(userId, tripId);
    const [op] = await db.transaction(async (tx) => {
      const [saved] = await tx
        .select()
        .from(trip)
        .where(and(eq(trip.id, tripId), eq(trip.userId, userId)))
        .for("update");
      const [financial] = await tx
        .select()
        .from(tripWallet)
        .where(eq(tripWallet.tripId, tripId))
        .for("update");
      if (
        saved.itineraryVersion !== state.itineraryVersion ||
        financial.version !== state.version
      )
        throw new RequestError(
          409,
          "The trip changed before capture. Review the saved payment status.",
        );
      const quote = state.intents.find((i) => i.id === b.intentId)!;
      if (quote.purpose === "recovery-checkout" && quote.staleActivity)
        throw new RequestError(
          409,
          "The recovery itinerary changed before capture. Reconcile the approved order without another payment request.",
        );
      await recoveryEligibility(
        tx,
        userId,
        tripId,
        quote,
        state.itineraryVersion,
      );
      return tx
        .insert(paypalOperation)
        .values({
          id: randomUUID(),
          bookingId: b.id,
          kind: "capture",
          status: "sending",
          requestedMinor: demoPriceMinor,
        })
        .onConflictDoNothing()
        .returning();
    });
    if (!op) return;
    try {
      const result = await provider().captureOrder(orderId, op.id);
      if (result.id !== orderId) throw fail();
      await syncOrder(b, await provider().order(orderId), orderId);
      if (!(await operations(b.id)).find((o) => o.id === op.id)?.providerId)
        throw fail();
    } catch (error) {
      await uncertain(op, error);
    }
  }

  async function claimLookup(bookingId: string) {
    const [row] = await db
      .update(paypalBooking)
      .set({ lastReconciledAt: new Date() })
      .where(
        and(
          eq(paypalBooking.id, bookingId),
          or(
            isNull(paypalBooking.lastReconciledAt),
            lte(paypalBooking.lastReconciledAt, new Date(Date.now() - 5000)),
          ),
        ),
      )
      .returning();
    return row;
  }

  function parentCapture(refund: Refund) {
    const candidates = refund.links.filter((l) => l.rel === "up");
    const link = candidates.length === 1 ? URL.parse(candidates[0].href) : null;
    const match =
      link &&
      [sandboxHost, "https://api.sandbox.paypal.com"].includes(link.origin) &&
      !link.username &&
      !link.password &&
      !link.search &&
      !link.hash &&
      /^\/v2\/payments\/captures\/([A-Z0-9-]{1,64})$/i.exec(link.pathname);
    if (!match) throw fail();
    return match[1];
  }
  async function syncRefund(
    b: Booking,
    op: Operation,
    refund: Refund,
    expected: string,
    event?: string,
  ) {
    if (
      !b.orderId ||
      !b.captureId ||
      refund.id !== expected ||
      parentCapture(refund) !== b.captureId ||
      (op.providerId && op.providerId !== refund.id) ||
      (refund.invoice_id && refund.invoice_id !== op.id)
    )
      throw fail();
    exactUsd(refund.amount, op.requestedMinor);
    await attach(op, refund.id);
    const completed = refund.status === "COMPLETED";
    const pending = refund.status === "PENDING";
    const prior = await db
      .select()
      .from(financialEvent)
      .where(
        and(
          eq(financialEvent.intentId, b.intentId),
          eq(financialEvent.refundId, refund.id),
        ),
      );
    if (
      (prior.some((e) => e.kind === "refund_completed") && !completed) ||
      (prior.some((e) => e.kind === "refund_failed") && (pending || completed))
    )
      return;
    if (
      pending ||
      completed ||
      prior.some((e) => e.kind === "refund_pending")
    ) {
      await record(
        b,
        b.orderId,
        {
          kind: completed
            ? "refund_completed"
            : pending
              ? "refund_pending"
              : "refund_failed",
          amountMinor: op.requestedMinor,
          captureId: b.captureId,
          refundId: refund.id,
          occurredAt: new Date(
            refund.update_time ?? refund.create_time,
          ).toISOString(),
        },
        event,
      );
    }
    const settlement = Object.fromEntries(
      Object.entries(refund.seller_payable_breakdown ?? {}).map(
        ([key, value]) => [key, value.value + " " + value.currency_code],
      ),
    );
    await update(op, {
      status: completed ? "verified" : pending ? "pending" : "failed",
      providerStatus: refund.status,
      issue: null,
      settlement,
    });
  }

  async function refund(
    userId: string,
    tripId: string,
    input: Extract<z.infer<typeof commerceRequest>, { action: "refund" }>,
  ) {
    const b = await owned(userId, tripId, input.bookingId);
    checkMerchant(b);
    if (!b.captureId || !b.orderId)
      throw new RequestError(
        409,
        "A verified capture is required before a refund.",
      );
    let amount: number;
    try {
      amount = parseMoney(input.amount, "USD");
    } catch {
      throw new RequestError(422, "Enter a valid USD refund amount.");
    }
    if (!amount || amount > demoPriceMinor)
      throw new RequestError(422, "Enter a positive refund up to USD 5.00.");
    const claim = await db.transaction(async (tx) => {
      await tx
        .select({ id: paypalBooking.id })
        .from(paypalBooking)
        .where(eq(paypalBooking.id, b.id))
        .for("update");
      const [duplicate] = await tx
        .select()
        .from(paypalOperation)
        .where(eq(paypalOperation.id, input.mutationId));
      if (duplicate) {
        if (
          duplicate.bookingId !== b.id ||
          duplicate.kind !== "refund" ||
          duplicate.requestedMinor !== amount
        )
          throw new RequestError(
            409,
            "This refund reference cannot be reused.",
          );
        return;
      }
      const related = await tx
        .select()
        .from(paypalOperation)
        .where(
          and(
            eq(paypalOperation.bookingId, b.id),
            eq(paypalOperation.kind, "refund"),
          ),
        );
      const [review] = await tx
        .select({ id: paypalOperation.id })
        .from(paypalOperation)
        .where(
          and(
            eq(paypalOperation.bookingId, b.id),
            eq(paypalOperation.kind, "capture"),
            eq(paypalOperation.issue, "operator-review"),
          ),
        );
      if (review)
        throw new RequestError(
          409,
          "A payment change needs review by the Sandbox operator before another refund.",
        );
      if (related.length >= 20)
        throw new RequestError(
          429,
          "This booking reached its Sandbox refund request limit.",
        );
      // Only one unresolved refund per booking. This reserves the amount
      // even before the provider gives us a refund ID.
      if (related.some(actionable))
        throw new RequestError(
          409,
          "Reconcile the existing refund before requesting another.",
        );
      const ledger = await tx
        .select()
        .from(financialEvent)
        .where(eq(financialEvent.intentId, b.intentId));
      const paid =
        ledger.find((e) => e.kind === "captured" && e.captureId === b.captureId)
          ?.amountMinor ?? 0;
      const pending = ledger.filter(
        (e) =>
          e.kind === "refund_pending" &&
          !ledger.some(
            (o) =>
              o.refundId === e.refundId &&
              (o.kind === "refund_completed" || o.kind === "refund_failed"),
          ),
      );
      if (pending.length)
        throw new RequestError(
          409,
          "Wait for the pending refund to settle before requesting another.",
        );
      const returned = ledger
        .filter(
          (e) =>
            e.kind === "refund_completed" || e.kind === "reversal_completed",
        )
        .reduce((s, e) => s + e.amountMinor, 0);
      const remaining = paid - returned;
      if (
        amount > remaining ||
        (input.mode === "full" && amount !== remaining) ||
        (input.mode === "partial" && amount >= remaining)
      )
        throw new RequestError(
          409,
          "The refundable balance changed or does not match the selected refund type. Review it before continuing.",
        );
      const [op] = await tx
        .insert(paypalOperation)
        .values({
          id: input.mutationId,
          bookingId: b.id,
          kind: "refund",
          status: "sending",
          requestedMinor: amount,
        })
        .returning();
      return op;
    });
    if (!claim) return;
    let op = claim;
    try {
      const result = await provider().refundCapture(b.captureId, op.id, amount);
      op = await attach(op, result.id);
      await syncRefund(b, op, await provider().refund(result.id), result.id);
    } catch (error) {
      await uncertain(op, error);
    }
  }

  async function reconcile(b: Booking) {
    checkMerchant(b);
    const claimed = await claimLookup(b.id);
    if (!claimed)
      throw new RequestError(
        429,
        "Wait a few seconds before checking PayPal again.",
      );
    const api = provider();
    const list = await operations(claimed.id);
    const orderId =
      claimed.orderId ?? list.find((o) => o.kind === "order")?.providerId;
    if (!orderId)
      throw new RequestError(
        409,
        "PayPal has not supplied an order ID. Wait for a verified notification or contact the Sandbox operator. No new order was sent.",
      );
    const linked = await syncOrder(claimed, await api.order(orderId), orderId);
    for (const op of list) {
      if (op.kind === "refund" && op.providerId && !isFinal(op))
        await syncRefund(
          linked,
          op,
          await api.refund(op.providerId),
          op.providerId,
        );
    }
  }

  async function action(userId: string, tripId: string, data: unknown) {
    const input = commerceRequest.parse(data);
    try {
      if (input.action === "checkout") {
        const b = await checkout(userId, tripId, input);
        return {
          state: await read(userId, tripId),
          bookingId: b.id,
          orderId: b.orderId,
        };
      }
      if (input.action === "capture")
        await capture(userId, tripId, input.bookingId, input.orderId);
      if (input.action === "refund") await refund(userId, tripId, input);
      if (input.action === "reconcile")
        await reconcile(await owned(userId, tripId, input.bookingId));
      return {
        state: await read(userId, tripId),
        bookingId: input.bookingId,
        orderId: null,
      };
    } catch (error) {
      if (error instanceof PayPalFailure)
        throw new RequestError(
          error.reason === "throttled" ? 429 : 503,
          "PayPal Sandbox could not verify this status. No additional payment request was sent.",
        );
      throw error;
    }
  }

  async function webhook(request: Request) {
    const api = provider();
    if (!api.webhookEnabled)
      throw new RequestError(
        503,
        "PayPal Sandbox webhooks are not configured.",
      );
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new RequestError(415, "Expected a PayPal JSON event.");
    let raw: unknown;
    try {
      raw = await boundedJson(request, 64 * 1024);
    } catch {
      throw new RequestError(400, "Invalid or oversized webhook.");
    }
    const parsed = webhookEvent.parse(raw);
    if (!(await api.verify(request.headers, raw)))
      throw new RequestError(401, "Webhook verification failed.");
    const [receipt] = await db
      .select()
      .from(paypalWebhookReceipt)
      .where(eq(paypalWebhookReceipt.id, parsed.id));
    if (receipt) return { received: true };
    const { event_type: type, resource: r, id: event } = parsed;
    const resourceId = paypalId.safeParse(r.id).data;
    if (
      resourceId &&
      (type === "PAYMENT.REFUND.PENDING" ||
        type === "PAYMENT.REFUND.FAILED" ||
        type === "PAYMENT.CAPTURE.REFUNDED")
    ) {
      const result = await api.refund(resourceId);
      if (result.id !== resourceId) throw fail();
      const captureId = parentCapture(result);
      const [b] = await db
        .select()
        .from(paypalBooking)
        .where(eq(paypalBooking.captureId, captureId));
      const [op] = await db
        .select()
        .from(paypalOperation)
        .where(
          and(
            eq(paypalOperation.kind, "refund"),
            or(
              eq(paypalOperation.providerId, resourceId),
              isUuid(result.invoice_id)
                ? eq(paypalOperation.id, result.invoice_id)
                : undefined,
            ),
          ),
        );
      if (op && !b)
        throw new RequestError(
          503,
          "The matching capture is not yet reconciled.",
        );
      if (b && op?.bookingId === b.id) {
        checkMerchant(b);
        await syncRefund(b, op, result, resourceId, event);
        // Delivery may race the provider read model. Keep the terminal
        // notification retryable while lookup still reports an older state.
        if (
          (type === "PAYMENT.CAPTURE.REFUNDED" &&
            result.status !== "COMPLETED") ||
          (type === "PAYMENT.REFUND.FAILED" && result.status === "PENDING")
        )
          throw new RequestError(
            503,
            "PayPal has not yet published the final refund status.",
          );
      } else if (b) {
        // Do not invent an app authorization or silently acknowledge a refund
        // for this booking that was issued outside TravelRelay.
        checkMerchant(b);
        await operatorReview(b);
        throw new RequestError(
          503,
          "An external Sandbox refund needs operator reconciliation.",
        );
      }
    } else if (
      resourceId &&
      [
        "CHECKOUT.ORDER.APPROVED",
        "CHECKOUT.ORDER.COMPLETED",
        "PAYMENT.CAPTURE.PENDING",
        "PAYMENT.CAPTURE.COMPLETED",
        "PAYMENT.CAPTURE.DECLINED",
        "PAYMENT.CAPTURE.REVERSED",
      ].includes(type)
    ) {
      const fromCapture = type.startsWith("PAYMENT.CAPTURE.");
      const [linked] = fromCapture
        ? await db
            .select()
            .from(paypalBooking)
            .where(eq(paypalBooking.captureId, resourceId))
        : [];
      const related = z
        .object({
          supplementary_data: z.object({
            related_ids: z.object({ order_id: paypalId }),
          }),
        })
        .safeParse(r).data;
      let orderId = fromCapture
        ? (linked?.orderId ?? related?.supplementary_data.related_ids.order_id)
        : resourceId;
      if (fromCapture && !orderId) {
        const [match] = await db
          .select({ orderId: paypalBooking.orderId })
          .from(paypalOperation)
          .innerJoin(
            paypalBooking,
            eq(paypalBooking.id, paypalOperation.bookingId),
          )
          .where(
            and(
              eq(paypalOperation.kind, "capture"),
              eq(paypalOperation.providerId, resourceId),
            ),
          );
        orderId =
          match?.orderId ??
          (await api.capture(resourceId)).supplementary_data?.related_ids
            ?.order_id;
      }
      if (orderId) {
        const result = await api.order(orderId);
        const id = result.purchase_units[0].custom_id;
        if (isUuid(id)) {
          const [b] = await db
            .select()
            .from(paypalBooking)
            .where(eq(paypalBooking.id, id));
          if (b) {
            if (fromCapture && verifyOrder(b, result, orderId) !== resourceId)
              throw new RequestError(
                503,
                "PayPal has not yet linked the capture to its order.",
              );
            if (type === "PAYMENT.CAPTURE.REVERSED") {
              checkMerchant(b);
              await operatorReview(b);
              throw new RequestError(
                503,
                "A Sandbox reversal needs operator reconciliation.",
              );
            }
            const saved = await syncOrder(b, result, orderId, event);
            if (
              type === "PAYMENT.CAPTURE.COMPLETED" &&
              saved.captureId !== resourceId
            )
              throw new RequestError(
                503,
                "PayPal has not yet published the final capture status.",
              );
          }
        }
      }
    }
    await db
      .insert(paypalWebhookReceipt)
      .values({ id: event })
      .onConflictDoNothing();
    return { received: true };
  }
  return { read, action, webhook };
}
export type CommerceState = Awaited<
  ReturnType<ReturnType<typeof createCommerce>["read"]>
>;

import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, asc, eq, or } from "drizzle-orm";
import type { Database } from "./db/connection";
import {
  trip,
  tripWallet,
  walletIntent,
  paypalBooking,
  walletMutation,
  financialEvent,
} from "./db/schema";
import { createTripStore, RequestError } from "./trips";
import { createItineraryEditor } from "./itinerary-edits";
import { createFxService, isStaleRate } from "./fx";
import { budgetMinor, type Itinerary } from "../lib/itinerary";
import {
  calculatePlanningBudget,
  type BudgetCategory,
} from "../lib/itinerary-budget";
import { categoryFor } from "../lib/itinerary-editing";
import {
  walletRequestSchema,
  providerOutcomeSchema,
  type ProviderOutcome,
  type LedgerEvent,
} from "../lib/finance-contracts";
import {
  currencySchema,
  parseMoney,
  convertMinor,
  exactSum,
  type Currency,
} from "../lib/money";
import {
  financialOperationKey,
  ledgerState,
  validateFinancialTransition,
} from "../lib/financial-ledger";

type StoredIntent = typeof walletIntent.$inferSelect;
type StoredEvent = typeof financialEvent.$inferSelect;
function resolveIntentFx(intent: StoredIntent, events: StoredEvent[]) {
  const refresh = events.findLast(
    (event) =>
      event.intentId === intent.id && event.kind === "intent_fx_refreshed",
  );
  return refresh
    ? {
        ...intent,
        fx: refresh.fx,
        fxSnapshotId: refresh.fx.id,
        estimatedDisplayMinor: refresh.estimatedDisplayMinor,
        acceptedStaleRate: false,
        fxRefreshedAt: refresh.recordedAt.toISOString(),
      }
    : { ...intent, fxRefreshedAt: null };
}
// This port must be implemented from verified API/webhook evidence in 4B.
// Runtime never supplies it in 4A; no HTTP route can supply outcomes or statuses.
export type FinancialVerifier = (
  intent: Readonly<StoredIntent>,
  reference: string,
) => Promise<ProviderOutcome>;
const asLedger = (e: StoredEvent): LedgerEvent => ({
  ...e,
  currency: e.originalCurrency,
  occurredAt: e.occurredAt.toISOString(),
  feeTreatment: e.outcome?.feeTreatment ?? "unknown",
});
const inferredCurrency = (country: string, fallback: Currency): Currency => {
  const c = country.toLowerCase();
  if (
    [
      "france",
      "italy",
      "greece",
      "portugal",
      "spain",
      "germany",
      "ireland",
      "netherlands",
    ].includes(c)
  )
    return "EUR";
  return (
    (
      {
        japan: "JPY",
        canada: "CAD",
        australia: "AUD",
        "united states": "USD",
        "united kingdom": "GBP",
      } as Record<string, Currency>
    )[c] ?? fallback
  );
};
function category(
  a: Parameters<typeof categoryFor>[0],
  plan?: Itinerary,
  di = 0,
  ai = 0,
): BudgetCategory {
  const c = categoryFor(a, plan, di, ai);
  return c === "food"
    ? "food"
    : c === "transport"
      ? "localTransport"
      : "activities";
}
function inputMoney(amount: string, currency: Currency) {
  try {
    return parseMoney(amount, currency);
  } catch (error) {
    throw new RequestError(
      400,
      error instanceof Error ? error.message : "Enter a valid amount.",
    );
  }
}
export function createWallet(
  db: Database,
  options: {
    fxFetch?: typeof fetch;
    clock?: () => number;
    verifier?: FinancialVerifier;
  } = {},
) {
  const trips = createTripStore(db),
    editor = createItineraryEditor(db),
    clock = options.clock ?? Date.now;
  const fx = createFxService(db, { fetch: options.fxFetch, clock });
  async function ensure(userId: string, tripId: string) {
    const saved = await trips.read(userId, tripId);
    await db
      .insert(tripWallet)
      .values({
        tripId,
        userId,
        localCurrency: inferredCurrency(
          saved.itinerary?.base.country ?? "",
          saved.data.currency,
        ),
      })
      .onConflictDoNothing();
    return saved;
  }
  async function rows(userId: string, tripId: string) {
    await ensure(userId, tripId);
    return db.transaction(async (tx) => {
      const [saved] = await tx
        .select()
        .from(trip)
        .where(and(eq(trip.id, tripId), eq(trip.userId, userId)))
        .for("share");
      const [wallet] = await tx
        .select()
        .from(tripWallet)
        .where(
          and(eq(tripWallet.tripId, tripId), eq(tripWallet.userId, userId)),
        )
        .for("share");
      if (!saved || !wallet)
        throw new RequestError(404, "TripWallet not found.");
      const intents = await tx
        .select()
        .from(walletIntent)
        .where(
          and(eq(walletIntent.tripId, tripId), eq(walletIntent.userId, userId)),
        )
        .orderBy(asc(walletIntent.createdAt));
      const events = await tx
        .select()
        .from(financialEvent)
        .where(
          and(
            eq(financialEvent.tripId, tripId),
            eq(financialEvent.userId, userId),
          ),
        )
        .orderBy(asc(financialEvent.sequence));
      return { saved, wallet, intents, events };
    });
  }
  async function read(userId: string, tripId: string, candidate?: Itinerary) {
    const { saved, wallet, intents, events } = await rows(userId, tripId),
      plan = candidate ?? saved.itinerary;
    const currency = currencySchema.parse(saved.data.currency);
    const budget =
      plan?.budget ??
      calculatePlanningBudget(
        plan ?? {
          currency,
          flightsMinor: 0,
          accommodationMinor: 0,
          foodMinor: 0,
          localTransportMinor: 0,
          days: [],
        },
        saved.data,
        budgetMinor(saved.data),
      ).budget;
    const activities =
      plan?.days.flatMap((d, di) =>
        d.activities.map((a, ai) => ({
          ...a,
          dayId: d.id,
          date: d.date,
          dayNumber: di + 1,
          category: category(a, plan, di, ai),
          currency,
          dayIndex: di,
          activityIndex: ai,
        })),
      ) ?? [];
    const warnings: string[] = [];
    const native: Record<
      string,
      {
        currency: Currency;
        capturedMinor: number;
        refundedMinor: number;
        netMinor: number;
        feeMinor: number;
        pendingMinor: number;
        pendingRefundMinor: number;
      }
    > = {};
    const coverage = new Map<string, number>(),
      pendingCoverage = new Map<string, number>();
    let actualHomeMinor = 0,
      feesHomeMinor = 0,
      indicativeActual = false;
    const withState = intents.map((stored) => {
      const owned = events.filter((e) => e.intentId === stored.id),
        i = resolveIntentFx(stored, owned),
        state = ledgerState(owned.map(asLedger));
      const pending = [
        "checkout_pending",
        "authorized",
        "payment_pending",
      ].includes(state.status)
        ? Math.max(0, i.originalMinor - state.capturedMinor)
        : 0;
      if (
        state.feeMinor &&
        owned.some((e) => e.feeMinor && e.outcome?.feeTreatment === "unknown")
      )
        warnings.push(
          `${i.title}: the fee payer/treatment is unverified. Reported fees are retained separately, not silently added to traveler spending.`,
        );
      const totals = (native[i.originalCurrency] ??= {
        currency: i.originalCurrency,
        capturedMinor: 0,
        refundedMinor: 0,
        netMinor: 0,
        feeMinor: 0,
        pendingMinor: 0,
        pendingRefundMinor: 0,
      });
      totals.capturedMinor = exactSum([
        totals.capturedMinor,
        state.capturedMinor,
      ]);
      totals.refundedMinor = exactSum([
        totals.refundedMinor,
        state.refundedMinor,
      ]);
      totals.netMinor = exactSum([totals.netMinor, state.netMinor]);
      totals.feeMinor = exactSum([totals.feeMinor, state.feeMinor]);
      totals.pendingMinor = exactSum([totals.pendingMinor, pending]);
      totals.pendingRefundMinor = exactSum([
        totals.pendingRefundMinor,
        state.pendingRefundMinor,
      ]);
      // Exact original-currency amounts are the financial authority. Cross-
      // currency home equivalents remain indicative, never PayPal charged FX.
      const net = convertMinor(
          state.netMinor,
          i.originalCurrency,
          currency,
          i.fx.rate,
        ),
        fees = convertMinor(
          state.additionalFeeMinor,
          i.originalCurrency,
          currency,
          i.fx.rate,
        );
      actualHomeMinor = exactSum([actualHomeMinor, net]);
      feesHomeMinor = exactSum([feesHomeMinor, fees]);
      if (i.originalCurrency !== currency && (state.netMinor || state.feeMinor))
        indicativeActual = true;
      coverage.set(
        i.activityId,
        exactSum([coverage.get(i.activityId) ?? 0, net]),
      );
      pendingCoverage.set(
        i.activityId,
        exactSum([
          pendingCoverage.get(i.activityId) ?? 0,
          convertMinor(pending, i.originalCurrency, currency, i.fx.rate),
        ]),
      );
      const current = activities.find((a) => a.id === i.activityId);
      const staleActivity =
        !current ||
        current.costMinor !== i.estimatedDisplayMinor ||
        current.title !== i.activitySnapshot.title ||
        current.location !== i.activitySnapshot.location ||
        current.date !== i.activitySnapshot.date ||
        current.startMinute !== i.activitySnapshot.startMinute ||
        current.durationMinutes !== i.activitySnapshot.durationMinutes ||
        current.category !== i.category;
      if (staleActivity && i.status === "planned")
        warnings.push(
          `${i.title}: the activity was edited or removed. Its original financial reference is retained; no payment or refund was changed.`,
        );
      return {
        ...i,
        state,
        pendingMinor: pending,
        staleActivity,
        activityExists: !!current,
        fxStale: isStaleRate(i.fx, clock()),
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      };
    });
    const expenses = budget.expenses.map((e) => ({
      ...e,
      activityId:
        e.activityId ??
        activities.find(
          (a) =>
            a.dayIndex === e.dayIndex && a.activityIndex === e.activityIndex,
        )?.id,
    }));
    const categoryRows = budget.allocations.map((row) => {
      const actual = exactSum(
        withState
          .filter((i) => i.category === row.category)
          .map((i) =>
            convertMinor(
              i.state.netMinor,
              i.originalCurrency,
              currency,
              i.fx.rate,
            ),
          ),
      );
      const reportedFees = exactSum(
        withState
          .filter((i) => i.category === row.category)
          .map((i) =>
            convertMinor(
              i.state.feeMinor,
              i.originalCurrency,
              currency,
              i.fx.rate,
            ),
          ),
      );
      const fees = exactSum(
        withState
          .filter((i) => i.category === row.category)
          .map((i) =>
            convertMinor(
              i.state.additionalFeeMinor,
              i.originalCurrency,
              currency,
              i.fx.rate,
            ),
          ),
      );
      const unpaid = exactSum(
        expenses
          .filter((e) => e.category === row.category)
          .map((e) =>
            Math.max(
              0,
              e.estimatedMinor - (coverage.get(e.activityId ?? "") ?? 0),
            ),
          ),
      );
      const pending = exactSum(
        withState
          .filter((i) => i.category === row.category)
          .map((i) =>
            convertMinor(
              i.pendingMinor,
              i.originalCurrency,
              currency,
              i.fx.rate,
            ),
          ),
      );
      // Replace covered estimates rather than adding captures to the same item.
      const adjusted = exactSum(
        expenses
          .filter((e) => e.category === row.category)
          .map((e) =>
            Math.max(
              e.estimatedMinor,
              (coverage.get(e.activityId ?? "") ?? 0) +
                (pendingCoverage.get(e.activityId ?? "") ?? 0),
            ),
          ),
      );
      const orphan = exactSum(
        withState
          .filter(
            (i) =>
              i.category === row.category &&
              !expenses.some((e) => e.activityId === i.activityId),
          )
          .map((i) =>
            convertMinor(
              i.state.netMinor + i.pendingMinor,
              i.originalCurrency,
              currency,
              i.fx.rate,
            ),
          ),
      );
      return {
        ...row,
        actualMinor: actual,
        feeMinor: reportedFees,
        additionalFeeMinor: fees,
        unpaidItemizedMinor: unpaid,
        pendingMinor: pending,
        projectedMinor: exactSum([
          adjusted,
          row.unitemizedAllowanceMinor,
          orphan,
          fees,
        ]),
      };
    });
    const projectedMinor = exactSum(
      categoryRows.filter((r) => r.inScope).map((r) => r.projectedMinor),
    );
    const projectedRemainingMinor =
      budget.selectedBudgetMinor - projectedMinor - budget.reserveMinor;
    if (projectedRemainingMinor < 0)
      warnings.push(
        "Current projections exceed the chosen budget after protecting the emergency reserve.",
      );
    if (indicativeActual)
      warnings.push(
        "Original foreign-currency financial amounts are confirmed; their home-currency equivalents use saved indicative reference rates, not actual PayPal FX or fees.",
      );
    return {
      tripId,
      version: wallet.version,
      itineraryVersion: saved.itineraryVersion,
      currency,
      localCurrency: wallet.localCurrency,
      scope: saved.data.scope,
      hasItinerary: !!plan,
      budget,
      activities,
      intents: withState,
      events: events.map((e) => ({
        ...e,
        occurredAt: e.occurredAt.toISOString(),
        recordedAt: e.recordedAt.toISOString(),
      })),
      summary: {
        actualHomeMinor,
        feesHomeMinor,
        indicativeActual,
        projectedMinor,
        projectedRemainingMinor,
        unpaidItemizedMinor: exactSum(
          categoryRows
            .filter((r) => r.inScope)
            .map((r) => r.unpaidItemizedMinor),
        ),
        native: Object.values(native),
        categoryRows,
        warnings,
      },
      providerEnabled: !!options.verifier,
    };
  }
  async function versions(
    userId: string,
    tripId: string,
    itineraryVersion: number,
    walletVersion: number,
  ) {
    const current = await read(userId, tripId);
    if (
      current.version !== walletVersion ||
      current.itineraryVersion !== itineraryVersion
    )
      throw new RequestError(
        409,
        "Your trip or TripWallet changed. Reload and review the current estimate before saving.",
      );
    return current;
  }
  async function estimate(
    userId: string,
    tripId: string,
    data: Extract<
      import("../lib/finance-contracts").WalletRequest,
      { action: "preview_quote" | "save_quote" }
    >,
  ) {
    const current = await versions(
      userId,
      tripId,
      data.itineraryVersion,
      data.walletVersion,
    );
    const target = current.activities.find((a) => a.id === data.activityId);
    if (!target)
      throw new RequestError(
        422,
        "Choose an existing activity in this saved itinerary.",
      );
    const active = current.intents.find(
      (i) => i.activityId === target.id && i.status === "planned",
    );
    const originalMinor = inputMoney(data.amount, data.currency);
    const refresh = data.refreshIntentId ? active : undefined;
    if (data.refreshIntentId) {
      if (
        !refresh ||
        refresh.id !== data.refreshIntentId ||
        refresh.staleActivity ||
        refresh.originalMinor !== originalMinor ||
        refresh.originalCurrency !== data.currency ||
        refresh.supplier !== data.supplier
      )
        throw new RequestError(
          422,
          "Only the exchange rate of the original, unchanged planning reference can be refreshed.",
        );
      const [booking] = await db
        .select({ id: paypalBooking.id })
        .from(paypalBooking)
        .where(eq(paypalBooking.intentId, refresh.id));
      if (
        booking ||
        current.events.some(
          (e) => e.intentId === refresh.id && e.provider !== "planning",
        )
      )
        throw new RequestError(
          409,
          "A planning reference with checkout history keeps its recorded exchange rate.",
        );
    } else if (active) {
      throw new RequestError(
        409,
        "This activity already has an active planning reference. Close it explicitly before recording another quote.",
      );
    }
    if (!refresh && current.intents.length >= 500)
      throw new RequestError(
        422,
        "This trip has reached its 500-reference limit.",
      );
    const reference =
      data.action === "save_quote"
        ? {
            snapshot: await fx.stored(data.fxSnapshotId),
            stale: false,
            warning: null,
          }
        : await fx.quote(data.currency, current.currency);
    if (
      reference.snapshot.base !== data.currency ||
      reference.snapshot.quote !== current.currency
    )
      throw new RequestError(
        422,
        "This rate belongs to different currencies. Get a new estimate.",
      );
    reference.stale = isStaleRate(reference.snapshot, clock());
    if (
      refresh &&
      (reference.stale ||
        reference.snapshot.id === refresh.fx.id ||
        Date.parse(reference.snapshot.retrievedAt) <=
          Date.parse(refresh.fx.retrievedAt))
    )
      throw new RequestError(
        422,
        "A newer, current reference rate is required to refresh this quote.",
      );
    if (
      reference.stale &&
      data.action === "save_quote" &&
      !data.acknowledgeStaleRate
    )
      throw new RequestError(
        422,
        "This is a stale reference rate. Explicitly acknowledge its date or get a new estimate.",
      );
    if (
      reference.snapshot.provider !== "identity" &&
      clock() - Date.parse(reference.snapshot.sourceDate) > 7 * 86_400_000
    )
      throw new RequestError(
        422,
        "This reference is too old to apply. Get a new exchange-rate estimate.",
      );
    const convertedMinor = convertMinor(
      originalMinor,
      data.currency,
      current.currency,
      reference.snapshot.rate,
    );
    const saved = await editor.read(userId, tripId),
      activity = saved.itinerary.days
        .flatMap((d) => d.activities)
        .find((a) => a.id === target.id)!;
    const mutationId =
      data.action === "save_quote" ? data.mutationId : randomUUID();
    const request = {
      version: data.itineraryVersion,
      mutationId,
      acknowledgeOverBudget:
        data.action === "save_quote" ? data.acknowledgeOverBudget : undefined,
      operation: {
        action: "update" as const,
        activityId: target.id,
        dayId: target.dayId,
        data: {
          title: activity.title,
          description: activity.description,
          category: categoryFor(
            activity,
            saved.itinerary,
            target.dayIndex,
            target.activityIndex,
          ),
          location: activity.location,
          latitude: activity.latitude,
          longitude: activity.longitude,
          startMinute: activity.startMinute,
          durationMinutes: activity.durationMinutes,
          bufferBeforeMinutes: activity.bufferBeforeMinutes,
          costMinor: convertedMinor,
          currency: current.currency,
          links: activity.links ?? [],
        },
      },
    };
    const preview = await editor.preview(userId, tripId, request);
    return {
      current,
      target,
      originalMinor,
      convertedMinor,
      reference,
      refresh,
      request,
      preview,
    };
  }
  async function duplicate(
    userId: string,
    tripId: string,
    data: Record<string, unknown>,
  ) {
    const [previous] = await db
      .select()
      .from(walletMutation)
      .where(
        and(
          eq(walletMutation.id, data.mutationId as string),
          eq(walletMutation.tripId, tripId),
          eq(walletMutation.userId, userId),
        ),
      );
    if (!previous) return false;
    if (!isDeepStrictEqual(previous.request, data))
      throw new RequestError(
        409,
        "This financial save identifier was already used for a different request.",
      );
    return true;
  }
  async function action(userId: string, tripId: string, input: unknown) {
    await ensure(userId, tripId);
    const data = walletRequestSchema.parse(input);
    if ("mutationId" in data && (await duplicate(userId, tripId, data)))
      return { state: await read(userId, tripId), itineraryChanged: false };
    if (data.action === "convert") {
      const originalMinor = inputMoney(data.amount, data.base),
        reference = await fx.quote(data.base, data.quote);
      return {
        conversion: {
          originalMinor,
          convertedMinor: convertMinor(
            originalMinor,
            data.base,
            data.quote,
            reference.snapshot.rate,
          ),
          ...reference,
        },
      };
    }
    if (data.action === "preview_quote" || data.action === "save_quote") {
      const result = await estimate(userId, tripId, data),
        {
          current,
          target,
          reference,
          refresh,
          originalMinor,
          convertedMinor,
          preview,
          request,
        } = result;
      if (data.action === "preview_quote")
        return {
          preview: {
            fx: reference,
            originalMinor,
            convertedMinor,
            beforeBudget: current.budget,
            afterBudget: preview.candidate.budget!,
            canSave: preview.canSave,
            overBudget: preview.overBudget,
            assessment: preview.assessment,
            changes: preview.changes,
          },
        };
      const intentId = refresh?.id ?? randomUUID();
      await editor.commit(userId, tripId, request, {
        onRecorded: async (tx) => {
          const [updated] = await tx
            .update(tripWallet)
            .set({
              version: data.walletVersion + 1,
              updatedAt: new Date(clock()),
            })
            .where(
              and(
                eq(tripWallet.tripId, tripId),
                eq(tripWallet.userId, userId),
                eq(tripWallet.version, data.walletVersion),
              ),
            )
            .returning();
          if (!updated)
            throw new RequestError(
              409,
              "TripWallet changed before saving. Nothing was committed; reload the current version.",
            );
          if (refresh) {
            // The wallet row serializes this refresh with checkout claims.
            const [booking] = await tx
              .select({ id: paypalBooking.id })
              .from(paypalBooking)
              .where(eq(paypalBooking.intentId, intentId));
            if (booking)
              throw new RequestError(
                409,
                "Checkout started before the refresh was saved. The recorded quote was retained.",
              );
          } else
            await tx.insert(walletIntent).values({
              id: intentId,
              tripId,
              userId,
              activityId: target.id,
              category: target.category,
              title: target.title,
              supplier: data.supplier,
              originalCurrency: data.currency,
              originalMinor,
              displayCurrency: current.currency,
              estimatedDisplayMinor: convertedMinor,
              fxSnapshotId: reference.snapshot.id,
              fx: reference.snapshot,
              acceptedStaleRate: reference.stale,
              itineraryVersion: data.itineraryVersion + 1,
              activitySnapshot: {
                title: target.title,
                location: target.location,
                date: target.date,
                startMinute: target.startMinute,
                durationMinutes: target.durationMinutes,
              },
            });
          await tx.insert(walletMutation).values({
            id: data.mutationId,
            tripId,
            userId,
            request: data,
            version: data.walletVersion + 1,
          });
          await tx.insert(financialEvent).values({
            tripId,
            userId,
            intentId,
            sequence: data.walletVersion + 1,
            kind: refresh ? "intent_fx_refreshed" : "intent_created",
            provider: "planning",
            verification: "user-planning",
            providerEventId: data.mutationId,
            operationKey: refresh
              ? `intent_fx_refreshed:${data.mutationId}`
              : `intent_created:${intentId}`,
            reconciliationRef: data.mutationId,
            originalCurrency: data.currency,
            amountMinor: 0,
            feeMinor: 0,
            displayCurrency: current.currency,
            estimatedDisplayMinor: refresh ? convertedMinor : 0,
            estimatedFeeMinor: 0,
            fx: reference.snapshot,
            occurredAt: new Date(clock()),
          });
        },
      });
      return { state: await read(userId, tripId), itineraryChanged: true };
    }
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(tripWallet)
        .set({
          version: data.walletVersion + 1,
          ...(data.action === "settings"
            ? { localCurrency: data.localCurrency }
            : {}),
          updatedAt: new Date(clock()),
        })
        .where(
          and(
            eq(tripWallet.tripId, tripId),
            eq(tripWallet.userId, userId),
            eq(tripWallet.version, data.walletVersion),
          ),
        )
        .returning();
      if (!updated)
        throw new RequestError(
          409,
          "TripWallet changed. Reload before saving.",
        );
      if (data.action === "cancel_intent") {
        const [intent] = await tx
          .select()
          .from(walletIntent)
          .where(
            and(
              eq(walletIntent.id, data.intentId),
              eq(walletIntent.tripId, tripId),
              eq(walletIntent.userId, userId),
            ),
          );
        if (!intent)
          throw new RequestError(404, "Planning reference not found.");
        const events = await tx
          .select()
          .from(financialEvent)
          .where(eq(financialEvent.intentId, intent.id));
        const [booking] = await tx
          .select({ id: paypalBooking.id })
          .from(paypalBooking)
          .where(eq(paypalBooking.intentId, intent.id));
        if (
          booking ||
          intent.status !== "planned" ||
          events.some((e) => !e.kind.startsWith("intent_"))
        )
          throw new RequestError(
            409,
            "This reference is closed or has provider history. Financial cancellation/refund needs a separate verified workflow.",
          );
        await tx
          .update(walletIntent)
          .set({ status: "canceled", updatedAt: new Date(clock()) })
          .where(eq(walletIntent.id, intent.id));
        await tx.insert(financialEvent).values({
          tripId,
          userId,
          intentId: intent.id,
          sequence: data.walletVersion + 1,
          kind: "intent_canceled",
          provider: "planning",
          verification: "user-planning",
          providerEventId: data.mutationId,
          operationKey: `intent_canceled:${intent.id}`,
          reconciliationRef: data.mutationId,
          originalCurrency: intent.originalCurrency,
          amountMinor: 0,
          feeMinor: 0,
          displayCurrency: intent.displayCurrency,
          estimatedDisplayMinor: 0,
          estimatedFeeMinor: 0,
          fx: intent.fx,
          occurredAt: new Date(clock()),
        });
      }
      await tx.insert(walletMutation).values({
        id: data.mutationId,
        tripId,
        userId,
        request: data,
        version: data.walletVersion + 1,
      });
    });
    return { state: await read(userId, tripId), itineraryChanged: false };
  }
  async function reconcile(
    userId: string,
    tripId: string,
    intentId: string,
    reference: string,
  ) {
    await ensure(userId, tripId);
    if (!options.verifier)
      throw new RequestError(
        503,
        "Verified payment reconciliation is not enabled in Milestone 4A. No provider request was made.",
      );
    if (!reference || reference.length > 160)
      throw new RequestError(400, "Invalid reconciliation reference.");
    const intent = await ownedIntent(userId, tripId, intentId);
    const outcome = await options.verifier(
      Object.freeze({ ...intent }),
      reference,
    );
    if (outcome.reconciliationRef !== reference)
      throw new RequestError(
        422,
        "Provider reconciliation reference does not match the verified request.",
      );
    await recordVerified(userId, tripId, intentId, outcome);
    return read(userId, tripId);
  }
  async function ownedIntent(userId: string, tripId: string, intentId: string) {
    const [intent] = await db
      .select()
      .from(walletIntent)
      .where(
        and(
          eq(walletIntent.id, intentId),
          eq(walletIntent.userId, userId),
          eq(walletIntent.tripId, tripId),
        ),
      );
    if (!intent) throw new RequestError(404, "Financial reference not found.");
    return intent;
  }
  // Server-only seam for a verified provider outcome. No HTTP handler accepts it.
  async function recordVerified(
    userId: string,
    tripId: string,
    intentId: string,
    verified: ProviderOutcome,
  ) {
    await ownedIntent(userId, tripId, intentId);
    const outcome = providerOutcomeSchema.parse(verified);
    await db.transaction(async (tx) => {
      // All writers lock the wallet row before reading ledger history. Database
      // serialization, not a process-local mutex, protects cumulative refunds.
      const [wallet] = await tx
        .select()
        .from(tripWallet)
        .where(
          and(eq(tripWallet.tripId, tripId), eq(tripWallet.userId, userId)),
        )
        .for("update");
      const prior = await tx
        .select()
        .from(financialEvent)
        .where(
          and(
            eq(financialEvent.provider, outcome.provider),
            or(
              eq(financialEvent.providerEventId, outcome.eventId),
              eq(financialEvent.operationKey, financialOperationKey(outcome)),
            ),
          ),
        );
      if (prior.length) {
        const p = prior[0];
        if (
          p.intentId !== intentId ||
          p.tripId !== tripId ||
          p.userId !== userId ||
          p.kind !== outcome.kind ||
          p.amountMinor !== outcome.amountMinor ||
          p.feeMinor !== outcome.feeMinor ||
          p.originalCurrency !== outcome.currency ||
          p.orderId !== outcome.orderId ||
          p.captureId !== outcome.captureId ||
          p.refundId !== outcome.refundId ||
          (p.outcome?.chargedCurrency ?? null) !== outcome.chargedCurrency ||
          (p.outcome?.chargedMinor ?? null) !== outcome.chargedMinor ||
          (p.outcome?.feeTreatment ?? "unknown") !== outcome.feeTreatment ||
          (p.outcome?.feeCurrency ?? null) !== outcome.feeCurrency
        )
          throw new RequestError(
            409,
            "Conflicting duplicate provider event; reconciliation is required.",
          );
        return;
      }
      const events = await tx
        .select()
        .from(financialEvent)
        .where(
          and(
            eq(financialEvent.intentId, intentId),
            eq(financialEvent.userId, userId),
          ),
        )
        .orderBy(asc(financialEvent.sequence));
      const [latest] = await tx
        .select()
        .from(walletIntent)
        .where(eq(walletIntent.id, intentId));
      const intent = resolveIntentFx(latest, events);
      try {
        validateFinancialTransition(
          events.map(asLedger),
          outcome,
          intent.originalMinor,
          intent.originalCurrency,
          latest.status,
        );
      } catch (error) {
        throw new RequestError(
          422,
          error instanceof Error
            ? error.message
            : "Invalid financial transition.",
        );
      }
      await tx.insert(financialEvent).values({
        tripId,
        userId,
        intentId,
        sequence: wallet.version + 1,
        kind: outcome.kind,
        provider: outcome.provider,
        verification: outcome.verification,
        providerEventId: outcome.eventId,
        operationKey: financialOperationKey(outcome),
        reconciliationRef: outcome.reconciliationRef,
        originalCurrency: outcome.currency,
        amountMinor: outcome.amountMinor,
        feeMinor: outcome.feeMinor,
        displayCurrency: intent.displayCurrency,
        estimatedDisplayMinor: convertMinor(
          outcome.amountMinor,
          intent.originalCurrency,
          intent.displayCurrency,
          intent.fx.rate,
        ),
        estimatedFeeMinor: convertMinor(
          outcome.feeMinor,
          intent.originalCurrency,
          intent.displayCurrency,
          intent.fx.rate,
        ),
        orderId: outcome.orderId,
        captureId: outcome.captureId,
        refundId: outcome.refundId,
        outcome,
        fx: intent.fx,
        occurredAt: new Date(outcome.occurredAt),
      });
      await tx
        .update(tripWallet)
        .set({ version: wallet.version + 1, updatedAt: new Date(clock()) })
        .where(eq(tripWallet.tripId, tripId));
    });
  }
  return { read, action, reconcile, recordVerified };
}
export type WalletState = Awaited<
  ReturnType<ReturnType<typeof createWallet>["read"]>
>;
export type WalletActionResult = Awaited<
  ReturnType<ReturnType<typeof createWallet>["action"]>
>;

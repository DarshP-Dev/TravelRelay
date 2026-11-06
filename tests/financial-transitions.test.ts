import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ledgerState,
  validateFinancialTransition,
} from "../src/lib/financial-ledger";
import {
  providerOutcomeSchema,
  type ProviderOutcome,
  type LedgerEvent,
} from "../src/lib/finance-contracts";
function outcome(
  kind: ProviderOutcome["kind"],
  extra: Partial<ProviderOutcome> = {},
) {
  return providerOutcomeSchema.parse({
    provider: "paypal-sandbox",
    verification: "provider-api",
    kind,
    eventId: randomUUID(),
    reconciliationRef: "offline-ref",
    currency: "EUR",
    amountMinor: 0,
    feeMinor: 0,
    feeCurrency: "EUR",
    feeTreatment: "additional-traveler-cost",
    orderId: "offline-order",
    captureId: null,
    refundId: null,
    occurredAt: new Date().toISOString(),
    ...extra,
  });
}
const event = (data: ProviderOutcome): LedgerEvent => ({
  ...data,
  id: randomUUID(),
});
const capture = () =>
  outcome("captured", {
    amountMinor: 10000,
    feeMinor: 200,
    captureId: "offline-capture",
  });
test("ledger separates pending orders, authorization and actual captured spending", () => {
  const events: LedgerEvent[] = [];
  for (const kind of [
    "checkout_pending",
    "authorized",
    "payment_pending",
  ] as const) {
    const n = outcome(kind);
    validateFinancialTransition(events, n, 10000, "EUR", "planned");
    events.push(event(n));
    assert.equal(ledgerState(events).netMinor, 0);
  }
  const paid = capture();
  validateFinancialTransition(events, paid, 10000, "EUR", "planned");
  events.push(event(paid));
  assert.equal(ledgerState(events).netMinor, 10000);
  assert.equal(ledgerState(events).feeMinor, 200);
  assert.equal(ledgerState(events).status, "captured");
  assert.throws(
    () =>
      validateFinancialTransition(
        events,
        outcome("payment_failed"),
        10000,
        "EUR",
        "planned",
      ),
    /settled/,
  );
});
test("pending orders reject a different order/currency and never establish charged amounts", () => {
  const events = [event(outcome("checkout_pending"))];
  assert.throws(
    () =>
      validateFinancialTransition(
        events,
        outcome("authorized", { orderId: "foreign-order" }),
        10000,
        "EUR",
        "planned",
      ),
    /different order/,
  );
  assert.throws(
    () =>
      validateFinancialTransition(
        events,
        outcome("authorized", { currency: "USD" }),
        10000,
        "EUR",
        "planned",
      ),
    /currency/,
  );
  assert.throws(
    () =>
      validateFinancialTransition(
        events,
        outcome("payment_pending", {
          chargedCurrency: "EUR",
          chargedMinor: 10000,
        }),
        10000,
        "EUR",
        "planned",
      ),
    /charged amount/,
  );
  assert.throws(
    () =>
      validateFinancialTransition(
        events,
        outcome("payment_pending", { feeMinor: 100 }),
        10000,
        "EUR",
        "planned",
      ),
    /fees/,
  );
  assert.throws(
    () =>
      validateFinancialTransition(events, capture(), 10000, "EUR", "canceled"),
    /canceled/,
  );
});
test("partial refunds, refund failure and exact full refunds retain principal/fee limits", () => {
  const events = [event(capture())];
  const pending = outcome("refund_pending", {
    amountMinor: 4000,
    captureId: "offline-capture",
    refundId: "offline-refund",
  });
  validateFinancialTransition(events, pending, 10000, "EUR", "planned");
  events.push(event(pending));
  assert.equal(ledgerState(events).netMinor, 10000);
  assert.equal(ledgerState(events).pendingRefundMinor, 4000);
  const failed = outcome("refund_failed", {
    amountMinor: 4000,
    captureId: "offline-capture",
    refundId: "offline-refund",
  });
  validateFinancialTransition(events, failed, 10000, "EUR", "planned");
  events.push(event(failed));
  assert.equal(ledgerState(events).pendingRefundMinor, 0);
  assert.equal(ledgerState(events).netMinor, 10000);
  const partial = outcome("refund_completed", {
    amountMinor: 4000,
    captureId: "offline-capture",
    refundId: "second-refund",
    feeMinor: 100,
  });
  validateFinancialTransition(events, partial, 10000, "EUR", "planned");
  events.push(event(partial));
  assert.equal(ledgerState(events).status, "partially_refunded");
  assert.equal(ledgerState(events).netMinor, 6000);
  assert.equal(ledgerState(events).feeMinor, 100);
  assert.throws(
    () =>
      validateFinancialTransition(
        events,
        outcome("refund_completed", {
          amountMinor: 6001,
          captureId: "offline-capture",
          refundId: "too-big",
        }),
        10000,
        "EUR",
        "planned",
      ),
    /exceed/,
  );
  const full = outcome("refund_completed", {
    amountMinor: 6000,
    captureId: "offline-capture",
    refundId: "third-refund",
    feeMinor: 100,
  });
  validateFinancialTransition(events, full, 10000, "EUR", "planned");
  events.push(event(full));
  assert.equal(ledgerState(events).netMinor, 0);
  assert.equal(ledgerState(events).feeMinor, 0);
  assert.equal(ledgerState(events).status, "refunded");
});
test("reversals share refund limits and cannot over-release pending refund reservations", () => {
  const events = [
    event(capture()),
    event(
      outcome("refund_pending", {
        amountMinor: 8000,
        captureId: "offline-capture",
        refundId: "reserved",
      }),
    ),
  ];
  assert.throws(
    () =>
      validateFinancialTransition(
        events,
        outcome("reversal_completed", {
          amountMinor: 3000,
          captureId: "offline-capture",
          reversalId: "offline-reversal",
        }),
        10000,
        "EUR",
        "planned",
      ),
    /exceed/,
  );
  const n = outcome("reversal_completed", {
    amountMinor: 2000,
    captureId: "offline-capture",
    reversalId: "offline-reversal",
  });
  validateFinancialTransition(events, n, 10000, "EUR", "planned");
  events.push(event(n));
  assert.equal(ledgerState(events).netMinor, 8000);
  assert.equal(ledgerState(events).pendingRefundMinor, 8000);
});
test("merchant, included and unknown fees remain reported separately and do not become additional traveler spending", () => {
  for (const feeTreatment of [
    "merchant-fee",
    "included-in-capture",
    "unknown",
  ] as const) {
    const paid = { ...capture(), feeTreatment };
    validateFinancialTransition([], paid, 10000, "EUR", "planned");
    const s = ledgerState([event(paid)]);
    assert.equal(s.netMinor, 10000);
    assert.equal(s.feeMinor, 200);
    assert.equal(s.additionalFeeMinor, 0);
  }
  const paid = capture();
  assert.equal(ledgerState([event(paid)]).additionalFeeMinor, 200);
});
test("fee credits preserve the original treatment and cannot invent currency conversions or excess reversals", () => {
  const paid = { ...capture(), feeTreatment: "merchant-fee" as const };
  const refund = outcome("refund_completed", {
    amountMinor: 1000,
    captureId: "offline-capture",
    refundId: "offline-fee-credit",
    feeMinor: 100,
  });
  assert.throws(
    () =>
      validateFinancialTransition(
        [event(paid)],
        refund,
        10000,
        "EUR",
        "planned",
      ),
    /fee treatment/,
  );
  assert.throws(
    () =>
      validateFinancialTransition(
        [],
        { ...paid, feeCurrency: "USD" },
        10000,
        "EUR",
        "planned",
      ),
    /explicit original-currency/,
  );
  assert.throws(
    () =>
      validateFinancialTransition(
        [event(paid)],
        { ...refund, feeTreatment: "merchant-fee", feeMinor: 201 },
        10000,
        "EUR",
        "planned",
      ),
    /Fee reversals exceed/,
  );
});
test("unsettled stages and captures reject invented or misapplied settlement references", () => {
  const pending = outcome("checkout_pending", {
    captureId: "invented-capture",
  });
  assert.throws(
    () => validateFinancialTransition([], pending, 10000, "EUR", "planned"),
    /invent.*capture/,
  );
  assert.throws(
    () =>
      validateFinancialTransition(
        [],
        { ...capture(), reversalId: "unrelated-reversal" },
        10000,
        "EUR",
        "planned",
      ),
    /Unexpected reversal/,
  );
});

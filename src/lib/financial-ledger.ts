import type { LedgerEvent, ProviderOutcome } from "./finance-contracts";
import { exactSum } from "./money";

export function ledgerState(events: LedgerEvent[]) {
  const captured = exactSum(
    events.filter((e) => e.kind === "captured").map((e) => e.amountMinor),
  );
  const returned = exactSum(
    events
      .filter((e) =>
        ["refund_completed", "reversal_completed"].includes(e.kind),
      )
      .map((e) => e.amountMinor),
  );
  const pending = events.filter(
    (e) =>
      e.kind === "refund_pending" &&
      !events.some(
        (other) =>
          other.refundId === e.refundId &&
          ["refund_completed", "refund_failed"].includes(other.kind),
      ),
  );
  const chargedFees = exactSum(
    events.filter((e) => e.kind === "captured").map((e) => e.feeMinor),
  );
  const returnedFees = exactSum(
    events
      .filter((e) =>
        ["refund_completed", "reversal_completed"].includes(e.kind),
      )
      .map((e) => e.feeMinor),
  );
  const additionalFees = exactSum(
    events
      .filter(
        (e) =>
          e.kind === "captured" &&
          e.feeTreatment === "additional-traveler-cost",
      )
      .map((e) => e.feeMinor),
  );
  const returnedAdditionalFees = exactSum(
    events
      .filter(
        (e) =>
          ["refund_completed", "reversal_completed"].includes(e.kind) &&
          e.feeTreatment === "additional-traveler-cost",
      )
      .map((e) => e.feeMinor),
  );
  if (returned > captured || returnedFees > chargedFees)
    throw Error(
      "Financial history is inconsistent; reconciliation is required.",
    );
  const last = events.filter((e) => !e.kind.startsWith("intent_")).at(-1)?.kind;
  return {
    capturedMinor: captured,
    refundedMinor: returned,
    pendingRefundMinor: exactSum(pending.map((e) => e.amountMinor)),
    feeMinor: chargedFees - returnedFees,
    additionalFeeMinor: additionalFees - returnedAdditionalFees,
    netMinor: captured - returned,
    status: pending.length
      ? "refund_pending"
      : captured
        ? returned === captured
          ? "refunded"
          : returned
            ? "partially_refunded"
            : "captured"
        : (last ?? "unpaid"),
  };
}
export function validateFinancialTransition(
  events: LedgerEvent[],
  next: ProviderOutcome,
  originalMinor: number,
  currency: string,
  intentStatus: string,
) {
  const invalid = (message: string): never => {
    throw Error(message);
  };
  if (next.currency !== currency)
    invalid("Provider currency does not match the immutable intent currency.");
  if (next.feeMinor && next.feeCurrency !== next.currency)
    invalid(
      "Fees require an explicit original-currency amount. Different-currency fees need a separate verified accounting entry.",
    );
  if ((next.chargedCurrency === null) !== (next.chargedMinor === null))
    invalid("Charged currency and amount must be supplied together.");
  if (
    next.chargedCurrency &&
    !["captured", "refund_completed", "reversal_completed"].includes(next.kind)
  )
    invalid("Pending or failed events cannot establish a charged amount.");
  if (next.kind === "reversal_completed" && !next.reversalId)
    invalid("A unique verified reversal reference is required.");
  const s = ledgerState(events),
    money = [
      "captured",
      "refund_pending",
      "refund_completed",
      "refund_failed",
      "reversal_completed",
    ].includes(next.kind);
  if (money && !next.captureId)
    invalid("A verified capture reference is required.");
  if (!money && next.captureId)
    invalid("An unsettled order cannot invent a capture reference.");
  if (next.kind !== "reversal_completed" && next.reversalId)
    invalid("Unexpected reversal reference.");
  if (next.kind.startsWith("refund_") && !next.refundId)
    invalid("A refund reference is required.");
  if (!next.kind.startsWith("refund_") && next.refundId)
    invalid("Unexpected refund reference.");
  if (money ? next.amountMinor <= 0 : next.amountMinor !== 0)
    invalid("Unexpected amount for this financial event.");
  if (
    !["captured", "refund_completed", "reversal_completed"].includes(
      next.kind,
    ) &&
    next.feeMinor
  )
    invalid("Pending events cannot establish fees.");
  const orderIds = events
    .filter(
      (e) =>
        !e.kind.startsWith("intent_") &&
        !["payment_failed", "payment_canceled"].includes(e.kind),
    )
    .map((e) => e.orderId);
  const lastProvider = events
    .filter((e) => !e.kind.startsWith("intent_"))
    .at(-1);
  if (
    (s.capturedMinor ||
      ["checkout_pending", "authorized", "payment_pending"].includes(
        lastProvider?.kind ?? "",
      )) &&
    orderIds.some((id) => id !== next.orderId)
  )
    invalid("Financial event belongs to a different order.");
  if (next.kind === "captured") {
    if (intentStatus !== "planned")
      invalid("A canceled planning intent cannot be captured.");
    if (
      events.some(
        (e) => e.kind === "captured" && e.captureId === next.captureId,
      )
    )
      invalid("This capture is already recorded.");
    if (s.capturedMinor + next.amountMinor > originalMinor)
      invalid("Captures exceed the immutable intended amount.");
  } else if (
    next.kind.startsWith("refund_") ||
    next.kind === "reversal_completed"
  ) {
    const capture = events.find(
      (e) =>
        e.kind === "captured" &&
        e.captureId === next.captureId &&
        e.orderId === next.orderId,
    );
    if (!capture) invalid("Refund/reversal needs an owned confirmed capture.");
    if (
      next.feeMinor &&
      next.feeTreatment !== (capture!.feeTreatment ?? "unknown")
    )
      invalid("A fee reversal must preserve the original fee treatment.");
    const completed = events.filter(
      (e) =>
        e.captureId === next.captureId &&
        ["refund_completed", "reversal_completed"].includes(e.kind),
    );
    const pending = events.filter(
      (e) =>
        e.kind === "refund_pending" &&
        e.captureId === next.captureId &&
        !events.some(
          (o) =>
            o.refundId === e.refundId &&
            ["refund_completed", "refund_failed"].includes(o.kind),
        ),
    );
    const existing = pending.find((e) => e.refundId === next.refundId);
    if (existing && existing.amountMinor !== next.amountMinor)
      invalid("Refund amount differs from the recorded pending request.");
    if (
      events.some(
        (e) =>
          e.refundId &&
          e.refundId === next.refundId &&
          ["refund_completed", "refund_failed"].includes(e.kind),
      )
    )
      invalid("This refund is already settled.");
    if (next.kind === "refund_failed") {
      if (!existing) invalid("Only a pending refund can fail.");
    } else if (
      exactSum(completed.map((e) => e.amountMinor)) +
        exactSum(
          pending.filter((e) => e !== existing).map((e) => e.amountMinor),
        ) +
        next.amountMinor >
      capture!.amountMinor
    )
      invalid(
        "Refunds, reversals and pending reservations exceed this capture.",
      );
    if (
      exactSum(completed.map((e) => e.feeMinor)) + next.feeMinor >
      capture!.feeMinor
    )
      invalid("Fee reversals exceed the verified charged fees.");
  } else {
    if (intentStatus !== "planned" || s.capturedMinor)
      invalid(
        "This payment stage cannot replace a settled or canceled intent.",
      );
    const last = events
      .filter((e) => !e.kind.startsWith("intent_"))
      .at(-1)?.kind;
    if (
      next.kind !== "checkout_pending" &&
      !["checkout_pending", "authorized", "payment_pending"].includes(
        last ?? "",
      )
    )
      invalid("Payment stage requires an active verified order.");
    if (
      next.kind === "checkout_pending" &&
      ["checkout_pending", "authorized", "payment_pending"].includes(last ?? "")
    )
      invalid("An order is already pending.");
  }
}
export function financialOperationKey(outcome: ProviderOutcome) {
  return `${outcome.kind}:${outcome.reversalId ?? outcome.refundId ?? outcome.captureId ?? outcome.orderId}`;
}

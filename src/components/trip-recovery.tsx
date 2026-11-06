"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { clock } from "@/lib/activity-metadata";
import { money } from "@/lib/itinerary";
import { demoPriceMinor } from "@/lib/paypal-contracts";
import { operationStage } from "@/lib/paypal-status";
import type { RecoveryKind, RecoveryOption } from "@/lib/recovery-contracts";
import {
  itineraryUpdatedEvent,
  notifyItineraryChanged,
  type ItineraryUpdate,
} from "@/lib/workspace-events";
import type { RecoveryState } from "@/server/recovery";

const labels: Record<RecoveryKind, string> = {
  reschedule: "Move the itinerary slot",
  similar: "Try a similar experience",
  different: "Try something different",
  free: "Choose a free alternative",
  rest: "Keep time for rest",
  refund_only: "Leave the slot open and review a refund",
};
const phaseLabels: Record<RecoveryState["cases"][number]["phase"], string> = {
  canceled: "Cancellation recorded",
  finding_options: "Checking alternatives",
  review: "Ready for review",
  itinerary_updated: "Itinerary updated",
  refund_pending: "Refund awaiting verification",
  refund_failed: "Refund failed · review Bookings",
  replacement_pending: "Replacement checkout awaiting completion",
  replacement_failed: "Replacement checkout failed · review Bookings",
  attention: "Payment status needs attention",
  complete: "Recovery plan complete",
};
const dollars = (minor: number) => `${money(minor, "USD")} USD`;
const jobActive = (status: string) => ["queued", "generating"].includes(status);
const referenceDate = (stamp: string) =>
  new Date(stamp).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });

type Review = RecoveryState["cases"][number]["attempts"][number];
type Submit = (body: Record<string, unknown>) => Promise<void>;
function OptionCard({
  option,
  review,
  state,
  caseId,
  busy,
  submit,
}: {
  option: RecoveryOption;
  review: Review;
  state: RecoveryState;
  caseId: string;
  busy: boolean;
  submit: Submit;
}) {
  const [unverified, setUnverified] = useState(false);
  const [overBudget, setOverBudget] = useState(false);
  const { preview } = option;
  const stale =
    state.itineraryVersion !== review.itineraryVersion ||
    state.walletVersion !== review.walletVersion;
  const tripMoney = (minor: number) =>
    `${money(minor, state.currency)} ${state.currency}`;
  return (
    <article className="sandbox-record recovery-option">
      <div>
        <p className="eyebrow">
          {review.mode === "ai"
            ? "AI SUGGESTION · UNVERIFIED"
            : "PLANNING CHOICE"}
        </p>
        <h4>{labels[option.kind]}</h4>
        <p>{option.rationale}</p>
      </div>
      <div className="recovery-comparison">
        {(["before", "after"] as const).map((side) => (
          <div key={side}>
            <strong>{side === "before" ? "Before" : "After"}</strong>
            {preview.changes.some((change) => change[side]) ? (
              preview.changes.flatMap((change) => {
                const row = change[side];
                if (!row) return [];
                const a = row.activity;
                return [
                  <div key={change.activityId}>
                    <p>
                      <strong>{a.title}</strong>
                    </p>
                    <p>
                      {row.date} · {clock(a.startMinute)}–
                      {clock(a.startMinute + a.durationMinutes)}
                    </p>
                    <p>
                      {a.location} · {a.bufferBeforeMinutes} min planned buffer
                    </p>
                    <p>{tripMoney(a.costMinor)} group estimate</p>
                  </div>,
                ];
              })
            ) : (
              <p>Time left open</p>
            )}
          </div>
        ))}
      </div>
      <dl className="review-list">
        <div>
          <dt>Replacement estimate</dt>
          <dd>
            {option.replacementEstimateMinor === null
              ? "No new activity"
              : tripMoney(option.replacementEstimateMinor)}
          </dd>
        </div>
        <div>
          <dt>Change in planning estimates</dt>
          <dd>{tripMoney(preview.budgetDeltaMinor)}</dd>
        </div>
        <div>
          <dt>Projected trip cost before → after</dt>
          <dd>
            {tripMoney(option.projectionBeforeMinor)} →{" "}
            {tripMoney(option.projectionAfterMinor)}
          </dd>
        </div>
        <div>
          <dt>Unallocated plan budget before → after</dt>
          <dd>
            {tripMoney(preview.beforeBudget.remainingMinor)} →{" "}
            {tripMoney(preview.afterBudget.remainingMinor)}
          </dd>
        </div>
        <div>
          <dt>Projected funds after reserve</dt>
          <dd>{tripMoney(option.projectionHeadroomMinor)}</dd>
        </div>
        <div>
          <dt>Protected reserve</dt>
          <dd>{tripMoney(preview.afterBudget.reserveMinor)}</dd>
        </div>
        <div>
          <dt>Payment to apply this itinerary change</dt>
          <dd>{dollars(0)}</dd>
        </div>
      </dl>
      <p className="inline-note">
        The projection includes existing verified spending and excludes any
        refund that PayPal has not completed. Opening hours, access, travel
        times, and supplier prices require confirmation.
      </p>
      {option.kind === "reschedule" && (
        <p className="notice">
          This moves the slot in your itinerary only. Confirm the new time with
          the supplier independently. The cancellation and payment history stay
          visible.
        </p>
      )}
      {!!preview.assessment.errors.length && (
        <ul
          className="recovery-findings"
          aria-label="Blocking schedule conflicts"
        >
          {preview.assessment.errors.map((item, i) => (
            <li className="form-error" key={i}>
              {item.message}
            </li>
          ))}
        </ul>
      )}
      {!!preview.assessment.warnings.length && (
        <details>
          <summary>
            Schedule notes ({preview.assessment.warnings.length})
          </summary>
          <ul className="recovery-findings">
            {preview.assessment.warnings.map((item, i) => (
              <li key={i}>{item.message}</li>
            ))}
          </ul>
        </details>
      )}
      {stale ? (
        <p className="notice">
          Your itinerary or wallet changed. Request a fresh review before
          applying this option.
        </p>
      ) : (
        preview.canSave && (
          <div className="recovery-approval">
            <label>
              <input
                type="checkbox"
                checked={unverified}
                onChange={(e) => setUnverified(e.target.checked)}
              />{" "}
              {option.kind === "reschedule"
                ? "I’ve checked the new time independently. This updates my plan only."
                : "I reviewed this itinerary change and its unverified assumptions."}
            </label>
            {preview.overBudget && (
              <label>
                <input
                  type="checkbox"
                  checked={overBudget}
                  onChange={(e) => setOverBudget(e.target.checked)}
                />{" "}
                I accept the projected overrun. Keep the reserve protected.
              </label>
            )}
            <button
              type="button"
              className="button button-primary"
              disabled={
                busy || !unverified || (preview.overBudget && !overBudget)
              }
              onClick={() =>
                void submit({
                  action: "apply",
                  caseId,
                  attemptId: review.id,
                  optionId: option.id,
                  acknowledgeUnverified: unverified,
                  acknowledgeOverBudget: overBudget,
                })
              }
            >
              Approve itinerary change
            </button>
          </div>
        )
      )}
    </article>
  );
}

function RecoveryCaseCard({
  item,
  state,
  tripId,
  busy,
  submit,
}: {
  item: RecoveryState["cases"][number];
  state: RecoveryState;
  tripId: string;
  busy: boolean;
  submit: Submit;
}) {
  const [preferences, setPreferences] = useState("");
  const bookings = `/trips/${tripId}/bookings`;
  const finding = item.attempts.some((run) => jobActive(run.status));
  const original = item.original.activity;
  const refundPending = item.payment.operations.findLast(
    (op) =>
      op.kind === "refund" &&
      ["sending", "pending", "uncertain"].includes(op.status),
  );
  const activeReview = item.attempts.find((run) => run.status === "ready");
  const selected = item.attempts.find((run) => run.status === "applied");
  const applied = selected?.options.find(
    (option) => option.id === selected.appliedOptionId,
  );
  const replacementLink = item.replacement
    ? `${bookings}#booking-${item.replacement.id}`
    : item.replacementQuote
      ? `${bookings}#quote-${item.replacementQuote.id}`
      : `${bookings}?recovery=${item.id}#wallet-quote`;
  const format = (minor: number) =>
    `${money(minor, state.currency)} ${state.currency}`;
  return (
    <section
      className="wallet-section recovery-case"
      id={`case-${item.id}`}
      aria-label={`Recovery for ${original.title}`}
    >
      <div className="recovery-case-heading">
        <div>
          <p className="eyebrow">SANDBOX SUPPLIER CANCELLATION SIMULATION</p>
          <h3>{original.title}</h3>
          <p>
            {item.original.date} · {clock(original.startMinute)}–
            {clock(original.startMinute + original.durationMinutes)} local time
            · {original.location}
          </p>
        </div>
        <span className="recovery-phase">{phaseLabels[item.phase]}</span>
      </div>
      <p>{item.reason}</p>
      <p className="inline-note">
        Recorded {referenceDate(item.createdAt)} by a traveler as a demo.
        Payment information below comes from the separate verified PayPal
        history.
      </p>
      <dl className="review-list">
        <div>
          <dt>Original group estimate</dt>
          <dd>{format(original.costMinor)}</dd>
        </div>
        <div>
          <dt>Original verified capture</dt>
          <dd>{dollars(item.payment.payment.capturedMinor)}</dd>
        </div>
        <div>
          <dt>Pending refund</dt>
          <dd>
            {dollars(item.payment.payment.pendingRefundMinor)}
            {refundPending && ` · ${operationStage[refundPending.status]}`}
          </dd>
        </div>
        <div>
          <dt>Verified returned principal</dt>
          <dd>{dollars(item.payment.payment.refundedMinor)}</dd>
        </div>
        <div>
          <dt>Potential refund remaining</dt>
          <dd>
            {item.payment.canOperate
              ? dollars(item.payment.refundableMinor)
              : "Original Sandbox merchant required"}
          </dd>
        </div>
        <div>
          <dt>Original net actual spending</dt>
          <dd>{dollars(item.payment.payment.netMinor)}</dd>
        </div>
        <div>
          <dt>Trip net actual spending</dt>
          <dd>{format(state.financial.capturedNetEstimateMinor)} indicative</dd>
        </div>
        <div>
          <dt>Protected reserve / unallocated plan</dt>
          <dd>
            {format(state.financial.reserveMinor)} /{" "}
            {format(state.financial.unallocatedMinor)}
          </dd>
        </div>
      </dl>
      <p className="inline-note">
        {item.fx.provider === "identity"
          ? "The capture and trip use the same currency."
          : `Indicative rate: ${item.fx.rate} ${item.fx.quote} per ${item.fx.base}, reference date ${item.fx.sourceDate}, retrieved ${referenceDate(item.fx.retrievedAt)}. PayPal confirms native amounts.`}
      </p>
      <Link
        className="button button-secondary"
        href={`${bookings}#booking-${item.payment.id}`}
      >
        {item.payment.refundableMinor && item.payment.canOperate
          ? "Review original refund in Bookings"
          : "Open original payment in Bookings"}
      </Link>
      {!item.editId && (
        <div className="recovery-options">
          <h4>Decide what fits the rest of your day</h4>
          <label className="field">
            <span>Preferences for this change (optional)</span>
            <textarea
              value={preferences}
              maxLength={600}
              rows={2}
              onChange={(e) => setPreferences(e.target.value)}
              placeholder="A quieter stop, something outdoors, or a lower budget…"
            />
          </label>
          <div className="sandbox-actions">
            <button
              type="button"
              className="button button-primary"
              disabled={busy || finding || !state.aiAvailable}
              onClick={() =>
                void submit({
                  action: "suggest",
                  caseId: item.id,
                  preferences,
                  mutationId: crypto.randomUUID(),
                })
              }
            >
              {item.attempts.some((run) => run.mode === "ai")
                ? "Request new AI alternatives"
                : "Find AI alternatives"}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={busy || finding}
              onClick={() =>
                void submit({
                  action: "baseline",
                  kind: "rest",
                  caseId: item.id,
                  mutationId: crypto.randomUUID(),
                })
              }
            >
              Review leaving time free
            </button>
            {!!item.payment.refundableMinor && item.payment.canOperate && (
              <button
                type="button"
                className="button button-secondary"
                disabled={busy || finding}
                onClick={() =>
                  void submit({
                    action: "baseline",
                    kind: "refund_only",
                    caseId: item.id,
                    mutationId: crypto.randomUUID(),
                  })
                }
              >
                Review refund-only plan
              </button>
            )}
          </div>
          {finding && (
            <p role="status">
              Suggestion request saved. Checking the trip context and validating
              options…
            </p>
          )}
          {item.attempts[0]?.error && (
            <p className="notice" role="status">
              {item.attempts[0].error}
            </p>
          )}
          {activeReview && (
            <div
              className="recovery-options"
              aria-label="Alternatives to review"
            >
              {activeReview.findings.map((message, i) => (
                <p className="inline-note" key={i}>
                  {message}
                </p>
              ))}
              {activeReview.options.map((option) => (
                <OptionCard
                  key={option.id}
                  option={option}
                  review={activeReview}
                  state={state}
                  caseId={item.id}
                  busy={busy}
                  submit={submit}
                />
              ))}
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() =>
                  void submit({
                    action: "reject",
                    caseId: item.id,
                    attemptId: activeReview.id,
                  })
                }
              >
                Reject this review
              </button>
            </div>
          )}
        </div>
      )}
      {item.editId && (
        <div className="recovery-options">
          <h4>Itinerary choice saved</h4>
          {applied && (
            <p>
              {labels[applied.kind]} · {applied.rationale}
            </p>
          )}
          {item.replacementActivityId && (
            <>
              <p>
                Replacement estimate at approval:{" "}
                {applied?.replacementEstimateMinor == null
                  ? "—"
                  : format(applied.replacementEstimateMinor)}
                . Verified replacement capture:{" "}
                {dollars(item.replacement?.payment.capturedMinor ?? 0)}.
              </p>
              {item.replacementQuote && (
                <p>
                  Sandbox quote:{" "}
                  {money(
                    item.replacementQuote.originalMinor,
                    item.replacementQuote.originalCurrency,
                  )}{" "}
                  {item.replacementQuote.originalCurrency} · estimated{" "}
                  {format(item.replacementQuote.estimatedDisplayMinor)} (
                  {item.replacementQuote.fx.sourceDate}).
                </p>
              )}
              {item.replacement || item.replacementExists ? (
                <Link
                  className="button button-secondary"
                  href={replacementLink}
                >
                  {item.replacement
                    ? "Open replacement payment in Bookings"
                    : item.replacementQuote
                      ? "Open replacement quote in Bookings"
                      : `Review optional ${dollars(demoPriceMinor)} Sandbox replacement`}
                </Link>
              ) : (
                <p className="notice">
                  The replacement activity was removed from the current
                  itinerary. Its saved recovery history remains here.
                </p>
              )}
              {!item.replacement && (
                <p className="inline-note">
                  The suggestion stays unbooked. The optional Sandbox
                  demonstration is a separate purchase and does not buy
                  admission to the suggested venue.
                </p>
              )}
            </>
          )}
          {!item.resolvedAt &&
            !["attention", "refund_pending", "replacement_pending"].includes(
              item.phase,
            ) && (
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() =>
                  void submit({ action: "finish", caseId: item.id })
                }
              >
                Finish recovery plan
              </button>
            )}
        </div>
      )}
      <details>
        <summary>Recovery and payment history</summary>
        <ul className="sandbox-history">
          <li>Simulated cancellation · {referenceDate(item.createdAt)}</li>
          {[...item.attempts].reverse().map((run) => (
            <li key={run.id}>
              {run.mode === "ai" ? "AI review" : labels[run.mode]} ·{" "}
              {run.status} · {referenceDate(run.createdAt)}
            </li>
          ))}
          {item.payment.operations.map((op) => (
            <li key={op.id}>
              Original {op.kind} · {dollars(op.requestedMinor)} ·{" "}
              {operationStage[op.status]} · {referenceDate(op.createdAt)}
            </li>
          ))}
          {item.replacement?.operations.map((op) => (
            <li key={op.id}>
              Replacement {op.kind} · {dollars(op.requestedMinor)} ·{" "}
              {operationStage[op.status]} · {referenceDate(op.createdAt)}
            </li>
          ))}
          {item.resolvedAt && (
            <li>Plan marked complete · {referenceDate(item.resolvedAt)}</li>
          )}
        </ul>
      </details>
    </section>
  );
}

export function TripRecovery({
  tripId,
  initial,
}: {
  tripId: string;
  initial: RecoveryState;
}) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [reason, setReason] = useState("");
  const inFlight = useRef(false);
  const router = useRouter();
  const endpoint = `/api/trips/${tripId}/recovery`;
  const pending = state.cases.some((entry) =>
    entry.attempts.some((run) => jobActive(run.status)),
  );
  const restore = useCallback(async () => {
    if (inFlight.current) return;
    try {
      const response = await fetch(endpoint, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error();
      const next = await response.json();
      if (!inFlight.current) setState(next);
    } catch {
      if (!inFlight.current)
        setError(
          "Could not refresh recovery status. Check again when connected.",
        );
    }
  }, [endpoint]);
  useEffect(() => {
    const focus = () => void restore();
    const sync = (event: Event) => {
      if ((event as CustomEvent<ItineraryUpdate>).detail.tripId === tripId)
        void restore();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    window.addEventListener(itineraryUpdatedEvent, sync);
    const timer = pending ? setInterval(focus, 2500) : undefined;
    return () => {
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      window.removeEventListener(itineraryUpdatedEvent, sync);
      clearInterval(timer);
    };
  }, [pending, restore, tripId]);
  async function submit(body: Record<string, unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error ?? "Could not save this recovery step.");
      setState(result);
      if (body.action === "simulate") {
        setBookingId("");
        setReason("");
      }
      if (result.itineraryChanged) notifyItineraryChanged(tripId, "recovery");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name !== "TimeoutError"
          ? cause.message
          : "The request was interrupted. Check saved status before trying again.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
      void restore();
    }
  }
  return (
    <div className="recovery-workspace">
      <header className="recovery-intro">
        <p className="eyebrow">WHEN PLANS CHANGE</p>
        <h2>Trip Recovery</h2>
        <p>
          Compare alternatives against your saved itinerary and budget. Review
          schedule changes, refunds, and new payments as separate decisions.
        </p>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setError("");
            void restore();
          }}
          disabled={busy}
        >
          Refresh saved status
        </button>
      </header>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!state.cases.length && (
        <p className="notice">
          No recovery cases yet. A simulated cancellation starts with a verified
          Sandbox demo booking in this itinerary.
        </p>
      )}
      {state.cases.map((item) => (
        <RecoveryCaseCard
          key={item.id}
          item={item}
          state={state}
          tripId={tripId}
          busy={busy}
          submit={submit}
        />
      ))}
      {state.enabled && !!state.eligibleBookings.length && (
        <form
          className="wallet-section recovery-simulation"
          onSubmit={(e) => {
            e.preventDefault();
            void submit({ action: "simulate", bookingId, reason });
          }}
        >
          <h3>Simulate a supplier cancellation</h3>
          <p>
            Demo only. This records a simulated cancellation. Payments, refunds,
            and itinerary times stay as they are until you review each next
            step.
          </p>
          <label className="field">
            <span>Verified Sandbox booking</span>
            <select
              required
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
            >
              <option value="">Choose a booking</option>
              {state.eligibleBookings.map((booking) => (
                <option key={booking.id} value={booking.id}>
                  {booking.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Simulated cancellation reason</span>
            <input
              required
              minLength={3}
              maxLength={240}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Example: Demo session was canceled by the host"
            />
          </label>
          <button
            type="submit"
            className="button button-secondary"
            disabled={busy || !bookingId || reason.trim().length < 3}
          >
            Record simulated cancellation
          </button>
        </form>
      )}
      {!state.enabled && (
        <p className="inline-note">
          Cancellation simulation is disabled on this server.
        </p>
      )}
      <Link className="text-link" href={`/trips/${tripId}/bookings`}>
        Return to Bookings
      </Link>
    </div>
  );
}

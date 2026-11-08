"use client";

import Script from "next/script";
import { bookingPaymentLabel, operationStage } from "@/lib/paypal-status";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { demoName, demoPriceMinor } from "@/lib/paypal-contracts";
import { money } from "@/lib/itinerary";
import { amountText, parseMoney } from "@/lib/money";
import {
  itineraryUpdatedEvent,
  notifyItineraryChanged,
  type ItineraryUpdate,
} from "@/lib/workspace-events";
import type { CommerceState } from "@/server/paypal-commerce";

type PayPalInstance = {
  findEligibleMethods(input: {
    currencyCode: string;
  }): Promise<{ isEligible(method: string): boolean }>;
  createPayPalOneTimePaymentSession(options: {
    onApprove(data: { orderId: string }): Promise<void>;
    onCancel(): void;
    onError(): void;
  }): {
    start(
      options: { presentationMode: "auto" },
      order: Promise<{ orderId: string }>,
    ): Promise<void>;
  };
};
type PayPalWindow = Window & {
  paypal?: {
    createInstance(options: {
      clientId: string;
      components: string[];
    }): Promise<PayPalInstance>;
  };
};
type Booking = CommerceState["bookings"][number];
type Result = {
  state: CommerceState;
  bookingId: string;
  orderId: string | null;
};
type RefundReview = {
  bookingId: string;
  mode: "full" | "partial";
  amount: string;
  mutationId: string;
};

const dollars = (minor: number) => money(minor, "USD") + " USD";
const time = (value: string) =>
  new Date(value).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
export function PayPalBookings({
  tripId,
  initial,
  recoveryLinks,
}: {
  tripId: string;
  initial: CommerceState;
  recoveryLinks?: Record<
    string,
    { id: string; role: "original" | "replacement" }
  >;
}) {
  const [state, setState] = useState(initial);
  const [ready, setReady] = useState(false),
    [sdkNotice, setSdkNotice] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [quoteReview, setQuoteReview] = useState("");
  const [refundReview, setRefundReview] = useState<RefundReview>();
  const instance = useRef<PayPalInstance>(null),
    inFlight = useRef(false);
  const router = useRouter();
  const endpoint = "/api/trips/" + tripId + "/commerce";
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(endpoint, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) setState(await response.json());
    } catch {
      /* An explicit status check also restores the saved state. */
    }
  }, [endpoint]);
  useEffect(() => {
    const sync = (event: Event) => {
      if (
        (event as CustomEvent<ItineraryUpdate>).detail.tripId === tripId &&
        !inFlight.current
      )
        void refresh();
    };
    const focus = () => {
      if (!inFlight.current) void refresh();
    };
    window.addEventListener(itineraryUpdatedEvent, sync);
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => {
      window.removeEventListener(itineraryUpdatedEvent, sync);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
    };
  }, [refresh, tripId]);
  async function loadSdk() {
    if (!state.clientId) return;
    try {
      const sdk = (window as PayPalWindow).paypal;
      if (!sdk) throw Error();
      const next = await sdk.createInstance({
        clientId: state.clientId,
        components: ["paypal-payments"],
      });
      if (
        !(await next.findEligibleMethods({ currencyCode: "USD" })).isEligible(
          "paypal",
        )
      ) {
        setSdkNotice("PayPal Sandbox checkout is unavailable in this browser.");
        return;
      }
      instance.current = next;
      setReady(true);
    } catch {
      setSdkNotice("The PayPal Sandbox checkout interface could not load.");
    }
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(65000),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(result.error ?? "The request could not be verified.");
    const typed = result as Result;
    setState(typed.state);
    notifyItineraryChanged(tripId, "wallet");
    router.refresh();
    return typed;
  }
  function startBusy() {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    setError("");
    return true;
  }
  function finish() {
    inFlight.current = false;
    setBusy(false);
  }
  function showError(cause: unknown) {
    setError(
      cause instanceof Error && cause.name !== "TimeoutError"
        ? cause.message
        : "The request was interrupted. Check the saved payment status before doing anything else.",
    );
    void refresh();
  }
  async function change(body: Record<string, unknown>, complete: string) {
    if (!startBusy()) return;
    try {
      await post(body);
      setNotice(complete);
    } catch (cause) {
      showError(cause);
    } finally {
      finish();
    }
  }
  async function approve(orderId: string, bookingId: string) {
    const result = await post({ action: "capture", orderId, bookingId });
    const b = result.state.bookings.find((b) => b.id === bookingId);
    setNotice(
      b?.payment.capturedMinor
        ? "PayPal Sandbox payment verified. The itinerary estimate has not changed."
        : "Payment is not yet confirmed. Check the saved status below.",
    );
  }
  async function begin(quoteId?: string, existing?: Booking) {
    const sdk = instance.current;
    if (!sdk || !startBusy()) return;
    let bookingId = existing?.id;
    let expectedId = existing?.orderId;
    try {
      const session = sdk.createPayPalOneTimePaymentSession({
        async onApprove({ orderId }) {
          if (!bookingId || orderId !== expectedId) {
            setError(
              "The PayPal order did not match this booking. No capture was requested.",
            );
            return;
          }
          try {
            await approve(orderId, bookingId);
          } catch (cause) {
            showError(cause);
          }
        },
        onCancel() {
          setNotice(
            "Checkout was closed. No payment is confirmed. You can return to the saved order below.",
          );
        },
        onError() {
          setError(
            "PayPal checkout was interrupted. Check the saved status before continuing.",
          );
          void refresh();
        },
      });
      // Pass the promise directly while still in the click gesture.
      const order = existing?.orderId
        ? Promise.resolve({ orderId: existing.orderId })
        : post({
            action: "checkout",
            intentId: quoteId,
            walletVersion: state.walletVersion,
            itineraryVersion: state.itineraryVersion,
          }).then((result) => {
            bookingId = result.bookingId;
            expectedId = result.orderId;
            if (!expectedId)
              throw Error(
                "PayPal has not verified an order yet. Check the saved booking before continuing.",
              );
            setQuoteReview("");
            return { orderId: expectedId };
          });
      await session.start({ presentationMode: "auto" }, order);
    } catch (cause) {
      showError(cause);
    } finally {
      finish();
    }
  }
  function reviewRefund(
    booking: Booking,
    mode: "full" | "partial",
    value: string,
  ) {
    try {
      const amount = parseMoney(value, "USD");
      if (
        amount <= 0 ||
        (mode === "partial" && amount >= booking.refundableMinor)
      )
        throw Error(
          "Enter a positive partial amount below the refundable balance.",
        );
      setError("");
      setRefundReview({
        bookingId: booking.id,
        mode,
        amount: amountText(amount, "USD"),
        mutationId: crypto.randomUUID(),
      });
    } catch (cause) {
      showError(cause);
    }
  }

  return (
    <section
      className="wallet-section sandbox-commerce"
      aria-label="PayPal Sandbox bookings"
    >
      {state.clientId && (
        <Script
          src="https://www.sandbox.paypal.com/web-sdk/v6/core"
          strategy="afterInteractive"
          onReady={() => void loadSdk()}
          onError={() =>
            setSdkNotice("The PayPal Sandbox checkout script could not load.")
          }
        />
      )}
      <div>
        <p className="eyebrow">PAYPAL SANDBOX · DEMO ONLY</p>
        <h3>Try a Sandbox checkout</h3>
        <p>
          Use a PayPal Sandbox buyer account. This demonstration does not
          reserve travel inventory, confirm supplier availability, or charge
          real money.
        </p>
        {recoveryLinks && (
          <Link className="text-link" href={`/trips/${tripId}/recovery`}>
            Open Trip Recovery
          </Link>
        )}
      </div>
      {!state.clientId && (
        <p className="notice">
          Sandbox checkout is not configured. Saved financial records are still
          visible.
        </p>
      )}
      {state.clientId && !ready && (
        <p className="inline-note" role="status">
          {sdkNotice || "Preparing the Sandbox checkout interface…"}
        </p>
      )}
      {error && (
        <p className="notice wallet-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {busy && (
        <p className="inline-note" role="status">
          Waiting for PayPal or verifying the result…
        </p>
      )}
      {state.clientId && !state.quotes.length && (
        <p className="inline-note">
          To make an activity eligible,{" "}
          <a href="#wallet-quote">save a fresh USD 5.00 planning quote</a>.
          Review the itinerary estimate before saving.
        </p>
      )}
      {state.clientId &&
        state.quotes.map((quote) => (
          <article
            className="sandbox-record"
            key={quote.id}
            id={`quote-${quote.id}`}
          >
            <h4>{quote.title}</h4>
            <p>
              {demoName} · {dollars(demoPriceMinor)}
            </p>
            {quote.purpose === "recovery-checkout" && (
              <p className="inline-note">
                Approved planning estimate{" "}
                {money(quote.planningEstimateMinor ?? 0, state.currency)}{" "}
                {state.currency}, unchanged. Separate Sandbox purchase:{" "}
                {dollars(demoPriceMinor)}; indicative equivalent{" "}
                {money(quote.estimatedMinor, state.currency)} {state.currency}.
                No supplier reservation.
              </p>
            )}
            {quoteReview === quote.id ? (
              <div className="sandbox-review">
                <p>
                  PayPal will ask you to approve {dollars(demoPriceMinor)} for
                  this demo. The trip equivalent is an estimate of{" "}
                  {money(quote.estimatedMinor, state.currency)} {state.currency}
                  . Payment does not change your itinerary estimate.
                  {quote.purpose === "recovery-checkout" &&
                    ` Quote reference expires ${time(quote.fxExpiresAt)}. The approved planning estimate stays ${money(quote.planningEstimateMinor ?? 0, state.currency)} ${state.currency}.`}
                </p>
                <div className="sandbox-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={!ready || busy}
                    onClick={() => void begin(quote.id)}
                  >
                    Continue to PayPal Sandbox
                  </button>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => setQuoteReview("")}
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="button button-secondary"
                disabled={busy}
                onClick={() => setQuoteReview(quote.id)}
              >
                Review Sandbox checkout
              </button>
            )}
          </article>
        ))}
      {!state.bookings.length && (
        <p className="inline-note">No Sandbox bookings yet.</p>
      )}
      {state.bookings.map((b) => {
        const order = b.operations.find((o) => o.kind === "order");
        const capture = b.operations.find((o) => o.kind === "capture");
        const open =
          b.canOperate &&
          b.orderId &&
          !capture &&
          !b.payment.capturedMinor &&
          order?.providerStatus !== "VOIDED";
        return (
          <article className="sandbox-record" key={b.id} id={`booking-${b.id}`}>
            <div>
              <p className="eyebrow">DEMO BOOKING · NO SUPPLIER RESERVATION</p>
              <h4>{b.title}</h4>
              <p>
                <strong>{bookingPaymentLabel(b)}</strong> ·{" "}
                {dollars(demoPriceMinor)}
              </p>
            </div>
            {recoveryLinks?.[b.id] && (
              <p>
                <Link
                  className="text-link"
                  href={`/trips/${tripId}/recovery#case-${recoveryLinks[b.id].id}`}
                >
                  {recoveryLinks[b.id].role === "original"
                    ? "Simulated cancellation · open recovery"
                    : "Replacement payment · open recovery"}
                </Link>
              </p>
            )}
            {b.paidAt && (
              <p className="inline-note">
                Verified {time(b.paidAt)} · Original charge{" "}
                {dollars(b.payment.capturedMinor)} · Estimated trip equivalent{" "}
                {money(b.estimatedMinor, state.currency)} {state.currency}.
              </p>
            )}
            {!!b.payment.refundedMinor && (
              <p className="inline-note">
                Verified refunds: {dollars(b.payment.refundedMinor)} · Net:{" "}
                {dollars(b.payment.netMinor)}.
              </p>
            )}
            {b.needsReview && (
              <p className="notice" role="status">
                PayPal reported a change outside this checkout. The Sandbox
                operator must reconcile it before another refund can be
                requested.
              </p>
            )}
            {!!b.operations.length && (
              <details>
                <summary>PayPal references and history</summary>
                {b.orderId && (
                  <p className="inline-note">
                    Order: {b.orderId}
                    {b.captureId && " · Capture: " + b.captureId}
                  </p>
                )}
                <ul className="sandbox-history">
                  {b.operations.map((o) => (
                    <li key={o.id}>
                      {o.kind === "order"
                        ? "Checkout"
                        : o.kind === "capture"
                          ? "Capture"
                          : "Refund"}{" "}
                      · {dollars(o.requestedMinor)} · {operationStage[o.status]}
                      {o.providerStatus && " (" + o.providerStatus + ")"} ·{" "}
                      {time(o.updatedAt)}
                      {o.kind === "refund" &&
                        o.providerId &&
                        " · Refund ID: " + o.providerId}
                      {o.issue === "throttled" && " · PayPal rate limit"}
                      {o.settlement &&
                        Object.entries(o.settlement).map(([key, value]) => (
                          <span key={key} className="inline-note">
                            {" "}
                            · {key.replaceAll("_", " ")}: {value}
                          </span>
                        ))}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {!b.orderId && order?.status !== "failed" && (
              <p className="inline-note">
                No order ID is confirmed yet. Check again after a verified
                notification or ask the Sandbox operator to review.
              </p>
            )}
            {!b.canOperate && (
              <p className="inline-note">
                The original Sandbox merchant configuration is required for
                provider actions.
              </p>
            )}
            <div className="sandbox-actions">
              {open && order?.providerStatus === "APPROVED" && (
                <button
                  className="button button-primary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void change(
                      {
                        action: "capture",
                        bookingId: b.id,
                        orderId: b.orderId,
                      },
                      "Reviewed the saved approval. See the verified payment status below.",
                    )
                  }
                >
                  Capture approved {dollars(demoPriceMinor)}
                </button>
              )}
              {open && order?.providerStatus !== "APPROVED" && (
                <button
                  className="button button-primary"
                  type="button"
                  disabled={!ready || busy}
                  onClick={() => void begin(undefined, b)}
                >
                  Return to PayPal Sandbox
                </button>
              )}
              {b.canOperate && (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void change(
                      { action: "reconcile", bookingId: b.id },
                      "Checked PayPal. The saved status is shown below.",
                    )
                  }
                >
                  Check PayPal status
                </button>
              )}
              <Link
                className="text-link"
                href={`/trips/${tripId}/itinerary#activity-${b.activityId}`}
              >
                Linked activity
              </Link>
            </div>
            {b.canOperate &&
              b.captureId &&
              b.refundableMinor > 0 &&
              !b.needsReview &&
              !b.operations.some(
                (o) =>
                  o.kind === "refund" &&
                  !["verified", "failed"].includes(o.status),
              ) && (
                <div className="sandbox-review">
                  <p>
                    Available to refund:{" "}
                    <strong>{dollars(b.refundableMinor)}</strong> to the
                    original Sandbox payment.
                  </p>
                  {refundReview?.bookingId === b.id ? (
                    <>
                      <p>
                        Confirm{" "}
                        {refundReview.mode === "full"
                          ? "returning the remaining balance"
                          : "a partial refund"}{" "}
                        of{" "}
                        <strong>
                          {dollars(parseMoney(refundReview.amount, "USD"))}
                        </strong>
                        . A request is not a completed refund until PayPal
                        verifies it.
                      </p>
                      <div className="sandbox-actions">
                        <button
                          type="button"
                          className="button button-primary"
                          disabled={busy}
                          onClick={() => {
                            void change(
                              { action: "refund", ...refundReview },
                              "Refund request checked. See its verified status in the payment history.",
                            );
                            setRefundReview(undefined);
                          }}
                        >
                          Confirm Sandbox refund
                        </button>
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={busy}
                          onClick={() => setRefundReview(undefined)}
                        >
                          Back
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="sandbox-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={busy}
                        onClick={() =>
                          reviewRefund(
                            b,
                            "full",
                            amountText(b.refundableMinor, "USD"),
                          )
                        }
                      >
                        Review full refund
                      </button>
                      {b.refundableMinor > 1 && (
                        <form
                          className="sandbox-actions"
                          onSubmit={(e) => {
                            e.preventDefault();
                            reviewRefund(
                              b,
                              "partial",
                              String(
                                new FormData(e.currentTarget).get("amount"),
                              ),
                            );
                          }}
                        >
                          <label className="field">
                            <span>Partial refund (USD)</span>
                            <input
                              name="amount"
                              required
                              inputMode="decimal"
                              placeholder="0.00"
                              maxLength={16}
                              disabled={busy}
                            />
                          </label>
                          <button
                            type="submit"
                            className="button button-secondary"
                            disabled={busy}
                          >
                            Review partial refund
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              )}
          </article>
        );
      })}
    </section>
  );
}

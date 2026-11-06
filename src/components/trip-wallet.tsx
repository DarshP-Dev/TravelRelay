"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownUp, ReceiptText, Wallet } from "lucide-react";
import { money } from "@/lib/itinerary";
import { amountText, currencies, type Currency } from "@/lib/money";
import { WalletFinancialSummary } from "./wallet-summary";
export { WalletPreview } from "./wallet-summary";
import {
  itineraryUpdatedEvent,
  notifyItineraryChanged,
  type ItineraryUpdate,
} from "@/lib/workspace-events";
import type { WalletActionResult, WalletState } from "@/server/wallet";
import type { CommerceState } from "@/server/paypal-commerce";
import { PayPalBookings } from "./paypal-bookings";
type QuotePreview = Extract<
  WalletActionResult,
  { preview: unknown }
>["preview"];
const dateTime = (value: string) =>
  new Date(value).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
function CurrencySelect({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: Currency;
  onChange: (value: Currency) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value as Currency)}
      >
        {currencies.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </label>
  );
}
export function TripWallet({
  initial,
  bookings = false,
  commerce,
}: {
  initial: WalletState;
  bookings?: boolean;
  commerce: CommerceState;
}) {
  const [state, setState] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false);
  const router = useRouter(),
    url = `/api/trips/${initial.tripId}/wallet`;
  const [activityId, setActivityId] = useState(""),
    [amount, setAmount] = useState(""),
    [currency, setCurrency] = useState<Currency>(initial.localCurrency),
    [supplier, setSupplier] = useState("");
  const [preview, setPreview] = useState<QuotePreview | null>(null),
    [ackStale, setAckStale] = useState(false),
    [ackOver, setAckOver] = useState(false),
    [closing, setClosing] = useState<string | null>(null);
  const [localCurrency, setLocalCurrency] = useState(initial.localCurrency),
    [convertAmount, setConvertAmount] = useState(""),
    [convertCurrency, setConvertCurrency] = useState<Currency>(
      initial.localCurrency,
    ),
    [conversion, setConversion] = useState<
      Extract<WalletActionResult, { conversion: unknown }>["conversion"] | null
    >(null);
  const [request, setRequest] = useState<Record<string, unknown> | null>(null);
  const mounted = useRef(true),
    formRevision = useRef(0);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error ?? "TripWallet is unavailable.");
      if (mounted.current) {
        setState(data);
        setError("");
      }
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not restore TripWallet. Your input is retained.",
        );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    mounted.current = true;
    const sync = (e: Event) => {
      if ((e as CustomEvent<ItineraryUpdate>).detail.tripId === initial.tripId)
        void refresh();
    };
    const restore = () => void refresh();
    window.addEventListener(itineraryUpdatedEvent, sync);
    window.addEventListener("focus", restore);
    window.addEventListener("online", restore);
    return () => {
      mounted.current = false;
      window.removeEventListener(itineraryUpdatedEvent, sync);
      window.removeEventListener("focus", restore);
      window.removeEventListener("online", restore);
    };
  }, [refresh, initial.tripId]);
  async function post(body: Record<string, unknown>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await r.json();
      if (!r.ok)
        throw Error(data.error ?? "This financial request could not be saved.");
      const result = data as WalletActionResult;
      if ("state" in result && result.state) {
        setState(result.state);
        router.refresh();
        if (result.itineraryChanged)
          notifyItineraryChanged(initial.tripId, "wallet");
      }
      return result;
    } catch (cause) {
      setError(
        (cause instanceof Error ? cause.message : "Storage is unavailable.") +
          " Your input is retained. Check saved status before retrying an uncertain save.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  function change() {
    formRevision.current++;
    setPreview(null);
    setRequest(null);
    setNotice("");
    setAckOver(false);
    setAckStale(false);
  }
  async function getPreview(reference?: WalletState["intents"][number]) {
    const revision = formRevision.current;
    const data = {
      activityId: reference?.activityId ?? activityId,
      amount: reference
        ? amountText(reference.originalMinor, reference.originalCurrency)
        : amount,
      currency: reference?.originalCurrency ?? currency,
      supplier: reference?.supplier ?? supplier,
      ...(reference && { refreshIntentId: reference.id }),
      itineraryVersion: state.itineraryVersion,
      walletVersion: state.version,
    };
    const result = await post({ action: "preview_quote", ...data });
    if (
      result &&
      "preview" in result &&
      result.preview &&
      revision === formRevision.current
    ) {
      setPreview(result.preview);
      setRequest({
        action: "save_quote",
        ...data,
        mutationId: crypto.randomUUID(),
        fxSnapshotId: result.preview.fx.snapshot.id,
      });
      setAckStale(false);
      setAckOver(false);
      if (reference) document.getElementById("wallet-quote")?.scrollIntoView();
    }
  }
  async function save() {
    if (!request) return;
    const result = await post({
      ...request,
      acknowledgeStaleRate: ackStale,
      acknowledgeOverBudget: ackOver,
    });
    if (result && "state" in result) {
      change();
      setAmount("");
      setActivityId("");
      setSupplier("");
      setNotice(
        request.refreshIntentId
          ? "Reference rate refreshed on the same quote. The activity estimate and planning history are saved."
          : "Planning reference saved and activity estimate updated. No checkout, booking or payment occurred.",
      );
    }
  }
  const stale =
    preview &&
    request &&
    (request.walletVersion !== state.version ||
      request.itineraryVersion !== state.itineraryVersion);
  const s = state.summary;
  return (
    <div className="trip-wallet" aria-busy={busy || loading}>
      <header className="wallet-heading">
        <div className="wallet-heading-icon">
          {bookings ? (
            <ReceiptText aria-hidden="true" />
          ) : (
            <Wallet aria-hidden="true" />
          )}
        </div>
        <div>
          <span className="eyebrow">
            {bookings
              ? "BOOKINGS · SANDBOX PAYMENTS & PLANNING"
              : "TRIPWALLET · YOUR FINANCIAL PICTURE"}
          </span>
          <h2>
            {bookings
              ? "Plans, with their true status."
              : "A little clarity for every day."}
          </h2>
          <p>
            A planning ledger, not a stored-value wallet or PayPal balance.
            Estimates, actual provider events and refunds stay separate.
          </p>
        </div>
      </header>
      <div className="wallet-status-row">
        <p className="inline-note">
          Trip {state.currency} ·{" "}
          {state.scope === "entire"
            ? "Entire vacation"
            : "Spending only · return travel and accommodation excluded"}{" "}
          · itinerary revision {state.itineraryVersion} / wallet revision{" "}
          {state.version}
        </p>
        <button
          type="button"
          className="button button-secondary"
          disabled={busy || loading}
          onClick={() => void refresh()}
        >
          {loading ? "Restoring saved data…" : "Check saved status"}
        </button>
      </div>
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
      {s.warnings.map((w) => (
        <p className="notice" role="status" key={w}>
          {w}
        </p>
      ))}
      {!bookings && <WalletFinancialSummary state={state} />}
      <PayPalBookings tripId={state.tripId} initial={commerce} />
      <section className="wallet-section">
        <h3>
          {bookings
            ? "Your planning references"
            : "Booking & payment intent references"}
        </h3>
        <p>
          These are saved estimates for existing activities. Supplier notes are
          unverified. Saving a quote updates its activity estimate; it does not
          place an order or confirm any reservation. The separate Sandbox
          checkout above is for demonstration only.
        </p>
        {!state.intents.length ? (
          <div className="wallet-empty">
            <ReceiptText aria-hidden="true" />
            <strong>No booking or payment references yet.</strong>
            <p>
              Record a native-currency planning quote below. There is no
              fabricated payment or reservation history.
            </p>
          </div>
        ) : (
          <div className="wallet-intents">
            {state.intents.map((i) => (
              <article key={i.id} className="wallet-intent">
                <div className="wallet-intent-title">
                  <h4>{i.title}</h4>
                  <span className="wallet-badge">
                    {i.status === "canceled"
                      ? "Planning reference closed"
                      : i.state.status === "unpaid"
                        ? "Planned · not booked"
                        : i.state.status.replaceAll("_", " ")}
                  </span>
                </div>
                <p>
                  <strong>
                    {money(i.originalMinor, i.originalCurrency)}{" "}
                    {i.originalCurrency}
                  </strong>{" "}
                  original quote ·{" "}
                  {i.originalCurrency === state.currency
                    ? "stored estimate"
                    : "approximately"}{" "}
                  {money(i.estimatedDisplayMinor, state.currency)}{" "}
                  {state.currency}
                </p>
                <p>
                  {i.supplier
                    ? `${i.supplier} · user-provided, unverified supplier note`
                    : "No verified merchant or supplier reservation"}
                </p>
                <p className="inline-note">
                  {i.fx.provider === "identity"
                    ? "Same currency · no exchange rate needed"
                    : `Frankfurter / ECB rate ${i.fx.rate} ${i.fx.quote} per ${i.fx.base}; rate date ${i.fx.sourceDate}; retrieved ${dateTime(i.fx.retrievedAt)}. ${i.fxStale ? "Dated/stale saved estimate; not current." : `Reference expires ${dateTime(i.fx.expiresAt)}. Cached daily estimate.`}`}{" "}
                  Original currency and amount are retained. No PayPal FX or
                  fees are implied.
                </p>
                {i.fxStale &&
                  i.status === "planned" &&
                  !i.staleActivity &&
                  i.state.status === "unpaid" &&
                  !commerce.bookings.some((b) => b.intentId === i.id) && (
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={busy}
                      onClick={() => {
                        change();
                        void getPreview(i);
                      }}
                    >
                      Review fresh reference rate
                    </button>
                  )}
                {i.staleActivity && (
                  <p className="notice">
                    Activity edited or removed since this quote. Its historical
                    amount is unchanged; review it separately. No automatic
                    payment cancellation/refund.
                  </p>
                )}
                {i.activityExists && (
                  <Link
                    href={`/trips/${state.tripId}/itinerary#day-${state.activities.find((a) => a.id === i.activityId)?.dayId}`}
                  >
                    View linked activity
                  </Link>
                )}
                <details>
                  <summary>Reference and financial details</summary>
                  <p className="wallet-reference">
                    Intent {i.id} · recorded at itinerary revision{" "}
                    {i.itineraryVersion} · {dateTime(i.createdAt)}
                  </p>
                  <p>
                    No supplier reservation has been verified.{" "}
                    {i.state.status === "unpaid"
                      ? "No payment is recorded."
                      : "Provider payment evidence is separate from a travel reservation."}
                  </p>
                  {state.events
                    .filter(
                      (e) => e.intentId === i.id && e.provider !== "planning",
                    )
                    .map((e) => (
                      <div key={e.id} className="wallet-provider-detail">
                        <strong>{e.kind.replaceAll("_", " ")}</strong>
                        <p>
                          {money(e.amountMinor, e.originalCurrency)}{" "}
                          {e.originalCurrency} · separate fee{" "}
                          {money(e.feeMinor, e.originalCurrency)}
                          {e.feeMinor
                            ? ` · ${e.outcome?.feeTreatment ?? "unknown payer"}`
                            : ""}
                        </p>
                        <p>
                          Stored home estimate:{" "}
                          {money(e.estimatedDisplayMinor, e.displayCurrency)}{" "}
                          {e.displayCurrency}; separate estimated fee{" "}
                          {money(e.estimatedFeeMinor, e.displayCurrency)}.{" "}
                          {e.originalCurrency !== e.displayCurrency
                            ? "Indicative saved reference FX, not a charged conversion."
                            : "Same currency."}
                        </p>
                        <p>
                          Order {e.orderId ?? "—"}; capture {e.captureId ?? "—"}
                          ; refund {e.refundId ?? "—"}
                        </p>
                        {e.outcome?.chargedCurrency &&
                          e.outcome.chargedMinor !== null && (
                            <p>
                              Provider-reported charged amount:{" "}
                              {money(
                                e.outcome.chargedMinor!,
                                e.outcome.chargedCurrency,
                              )}{" "}
                              {e.outcome.chargedCurrency}. Preserved separately
                              from reference FX.
                            </p>
                          )}
                      </div>
                    ))}
                </details>
                {i.status === "planned" &&
                  i.state.status === "unpaid" &&
                  (closing === i.id ? (
                    <div className="notice">
                      <p>
                        Close this planning reference? The activity estimate
                        stays saved. This cancels no reservation, order or
                        payment.
                      </p>
                      <button
                        className="button button-secondary"
                        disabled={busy}
                        onClick={async () => {
                          const r = await post({
                            action: "cancel_intent",
                            intentId: i.id,
                            walletVersion: state.version,
                            mutationId: crypto.randomUUID(),
                          });
                          if (r) {
                            setClosing(null);
                            setNotice(
                              "Planning reference closed. Itinerary estimates and financial history are retained.",
                            );
                          }
                        }}
                      >
                        Confirm close reference
                      </button>
                      <button
                        className="button button-text"
                        onClick={() => setClosing(null)}
                      >
                        Keep reference
                      </button>
                    </div>
                  ) : (
                    <button
                      className="button button-text"
                      disabled={busy}
                      onClick={() => setClosing(i.id)}
                    >
                      Close planning reference
                    </button>
                  ))}
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="wallet-section" id="wallet-quote">
        <h3>Record a native-currency planning quote</h3>
        <p>
          Choose an existing activity. Review the conversion and whole-trip
          budget before saving its new group estimate. Any real payment would
          need a separate approved checkout.
        </p>
        {!state.hasItinerary ? (
          <Link
            className="button button-secondary"
            href={`/trips/${state.tripId}/generate`}
          >
            Complete your itinerary first
          </Link>
        ) : (
          <>
            <form
              className="wallet-quote-form"
              onSubmit={(e) => {
                e.preventDefault();
                void getPreview();
              }}
            >
              <label className="field">
                <span>Activity</span>
                <select
                  value={activityId}
                  required
                  disabled={busy}
                  onChange={(e) => {
                    setActivityId(e.target.value);
                    change();
                  }}
                >
                  <option value="">Select an activity</option>
                  {state.activities
                    .filter(
                      (a) =>
                        !state.intents.some(
                          (i) =>
                            i.activityId === a.id && i.status === "planned",
                        ),
                    )
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        Day {a.dayNumber} · {a.title}
                      </option>
                    ))}
                </select>
              </label>
              <div className="field-grid">
                <label className="field">
                  <span>Original group amount</span>
                  <input
                    required
                    inputMode="decimal"
                    value={amount}
                    maxLength={30}
                    placeholder={currency === "JPY" ? "Whole yen" : "0.00"}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      change();
                    }}
                    disabled={busy}
                  />
                </label>
                <CurrencySelect
                  disabled={busy}
                  label="Original currency"
                  value={currency}
                  onChange={(c) => {
                    setCurrency(c);
                    change();
                  }}
                />
              </div>
              <label className="field">
                <span>Supplier note · optional, unverified</span>
                <input
                  value={supplier}
                  maxLength={160}
                  onChange={(e) => {
                    setSupplier(e.target.value);
                    change();
                  }}
                  disabled={busy}
                />
              </label>
              <button
                className="button button-secondary"
                disabled={busy || !activityId}
              >
                {busy
                  ? "Checking saved estimate…"
                  : "Preview rate & budget consequences"}
              </button>
            </form>
            {preview && (
              <div
                className="wallet-quote-preview"
                aria-label="Planning quote preview"
              >
                <h4>
                  {request?.refreshIntentId
                    ? "Review refreshed reference rate"
                    : "Review before saving"}
                </h4>
                <p>
                  {money(preview.originalMinor, preview.fx.snapshot.base)}{" "}
                  {preview.fx.snapshot.base} → approximately{" "}
                  <strong>
                    {money(preview.convertedMinor, state.currency)}{" "}
                    {state.currency}
                  </strong>
                </p>
                <p>
                  {preview.fx.snapshot.provider === "identity"
                    ? "Same currency; no external conversion."
                    : `Frankfurter / ECB · ${preview.fx.snapshot.rate} ${state.currency} per ${preview.fx.snapshot.base} · reference date ${preview.fx.snapshot.sourceDate} · retrieved ${dateTime(preview.fx.snapshot.retrievedAt)}`}
                </p>
                <p>
                  Planned allocations{" "}
                  {money(preview.beforeBudget.allocatedMinor, state.currency)} →{" "}
                  {money(preview.afterBudget.allocatedMinor, state.currency)}.
                  Reserve{" "}
                  {money(preview.afterBudget.reserveMinor, state.currency)}.
                  Unallocated{" "}
                  {money(preview.beforeBudget.remainingMinor, state.currency)} →{" "}
                  {money(preview.afterBudget.remainingMinor, state.currency)}.
                </p>
                <p className="inline-note">
                  Indicative daily reference; half-up rounding per line to{" "}
                  {state.currency} minor units. Not a PayPal conversion, charged
                  amount, fee or verified supplier price.
                </p>
                {preview.fx.warning && (
                  <p className="notice">{preview.fx.warning}</p>
                )}
                {stale && (
                  <p className="notice" role="alert">
                    The itinerary or wallet changed. Get a new preview before
                    saving. Your input is retained.
                  </p>
                )}
                {preview.assessment.errors.map((e) => (
                  <p className="notice" role="alert" key={e.message}>
                    {e.message}
                  </p>
                ))}
                {preview.fx.stale && (
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={ackStale}
                      onChange={(e) => setAckStale(e.target.checked)}
                    />
                    I understand this rate is stale and accept it only as a
                    dated planning estimate.
                  </label>
                )}
                {preview.overBudget && (
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={ackOver}
                      onChange={(e) => setAckOver(e.target.checked)}
                    />
                    I acknowledge this estimate exceeds the selected budget
                    while preserving the reserve.
                  </label>
                )}
                <div className="wallet-actions">
                  <button
                    className="button button-primary"
                    disabled={
                      busy ||
                      !!stale ||
                      !preview.canSave ||
                      (preview.fx.stale && !ackStale) ||
                      (preview.overBudget && !ackOver)
                    }
                    onClick={() => void save()}
                  >
                    {request?.refreshIntentId
                      ? "Save refreshed reference rate"
                      : "Save reference & activity estimate"}
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={change}
                  >
                    Discard preview
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
      {!bookings && (
        <section className="wallet-section">
          <div className="wallet-heading">
            <ArrowDownUp aria-hidden="true" />
            <div>
              <h3>Currency context</h3>
              <p>
                Your trip currency stays {state.currency}. Local currency is a
                supported-currency suggestion you can override. No historical
                amount changes.
              </p>
            </div>
          </div>
          <div className="wallet-detail-grid">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await post({
                  action: "settings",
                  localCurrency,
                  walletVersion: state.version,
                  mutationId: crypto.randomUUID(),
                });
                if (r)
                  setNotice(
                    "Local currency preference saved. Original quotes and trip currency are unchanged.",
                  );
              }}
            >
              <CurrencySelect
                disabled={busy}
                label="Local destination currency"
                value={localCurrency}
                onChange={setLocalCurrency}
              />
              <button
                className="button button-secondary"
                disabled={busy || localCurrency === state.localCurrency}
              >
                Save currency preference
              </button>
            </form>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await post({
                  action: "convert",
                  amount: convertAmount,
                  base: convertCurrency,
                  quote: state.currency,
                });
                if (r && "conversion" in r && r.conversion)
                  setConversion(r.conversion);
              }}
            >
              <div className="field-grid">
                <label className="field">
                  <span>Indicative conversion amount</span>
                  <input
                    required
                    value={convertAmount}
                    maxLength={30}
                    inputMode="decimal"
                    onChange={(e) => {
                      setConvertAmount(e.target.value);
                      setConversion(null);
                    }}
                  />
                </label>
                <CurrencySelect
                  disabled={busy}
                  label="From currency"
                  value={convertCurrency}
                  onChange={(c) => {
                    setConvertCurrency(c);
                    setConversion(null);
                  }}
                />
              </div>
              <button className="button button-secondary" disabled={busy}>
                Get indicative {state.currency} equivalent
              </button>
              {conversion && (
                <p role="status">
                  {money(conversion.originalMinor, conversion.snapshot.base)}{" "}
                  {conversion.snapshot.base} ≈{" "}
                  {money(conversion.convertedMinor, conversion.snapshot.quote)}{" "}
                  {conversion.snapshot.quote}.{" "}
                  {conversion.snapshot.provider === "identity"
                    ? "Same currency."
                    : `Frankfurter / ECB · rate ${conversion.snapshot.rate} · rate date ${conversion.snapshot.sourceDate} · retrieved ${dateTime(conversion.snapshot.retrievedAt)}. ${conversion.stale ? "Stale cached estimate." : "Daily reference, not live PayPal FX."}`}{" "}
                  {conversion.warning}
                </p>
              )}
            </form>
          </div>
        </section>
      )}
      <section className="wallet-section">
        <h3>Financial & planning history</h3>
        <p>
          Append-only event records. Planning actions are not payments. Verified
          PayPal Sandbox events appear here after confirmation by PayPal.
        </p>
        {!state.events.length ? (
          <p className="wallet-empty">
            No financial events or saved planning references yet.
          </p>
        ) : (
          <div
            className="wallet-table-scroll"
            role="region"
            aria-label="Financial and planning event history"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Amount</th>
                  <th>Source / verification</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {state.events
                  .slice(-100)
                  .reverse()
                  .map((e) => (
                    <tr key={e.id}>
                      <th>
                        {e.kind.replaceAll("_", " ")}
                        <small>
                          {
                            state.intents.find((i) => i.id === e.intentId)
                              ?.title
                          }
                        </small>
                      </th>
                      <td>
                        {e.provider === "planning"
                          ? "No money movement"
                          : `${money(e.amountMinor, e.originalCurrency)} ${e.originalCurrency}`}
                        <small>
                          {e.feeMinor
                            ? `Separate fee ${money(e.feeMinor, e.originalCurrency)}`
                            : ""}
                        </small>
                      </td>
                      <td>
                        {e.provider === "planning"
                          ? "User planning action"
                          : `${e.provider} · ${e.verification}`}
                      </td>
                      <td>
                        {dateTime(e.occurredAt)}
                        <small>Recorded {dateTime(e.recordedAt)}</small>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {state.events.length > 100 && (
              <p>
                Showing the latest 100 events. All earlier evidence remains in
                the persistent ledger.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

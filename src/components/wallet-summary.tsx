import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { money } from "@/lib/itinerary";
import { budgetLabels } from "./itinerary-budget-view";
import type { WalletState } from "@/server/wallet";
const clock = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
export function WalletPreview({ state }: { state: WalletState }) {
  return (
    <section className="wallet-overview-preview">
      <div>
        <span className="eyebrow">
          TRIPWALLET · PLANNING & FINANCIAL HISTORY
        </span>
        <h3>One clear view of your trip money.</h3>
        <p>
          {money(state.budget.allocatedMinor, state.currency)} planned before
          your separate {money(state.budget.reserveMinor, state.currency)}{" "}
          reserve. {money(state.budget.remainingMinor, state.currency)}{" "}
          genuinely unallocated.
        </p>
        <p className="inline-note">
          Confirmed net spending:{" "}
          {money(state.summary.actualHomeMinor, state.currency)}
          {state.summary.indicativeActual
            ? " · indicative home equivalent"
            : ""}
          . This is a planning ledger, not a PayPal balance.
        </p>
      </div>
      <Link
        className="button button-secondary"
        href={`/trips/${state.tripId}/wallet`}
      >
        Open TripWallet
      </Link>
    </section>
  );
}
export function WalletFinancialSummary({ state }: { state: WalletState }) {
  const b = state.budget,
    s = state.summary;
  return (
    <>
      <div className="wallet-metrics">
        <Metric
          label="Selected trip budget"
          value={money(b.selectedBudgetMinor, state.currency)}
          detail={`${state.currency} · ${state.scope === "entire" ? "entire vacation" : "spending only"}`}
        />
        <Metric
          label="Planned allocations"
          value={money(b.allocatedMinor, state.currency)}
          detail="Itemized + additional allowances; before reserve"
        />
        <Metric
          label="Protected reserve"
          value={money(b.reserveMinor, state.currency)}
          detail="Separate from genuinely unallocated funds"
        />
        <Metric
          label="Genuinely unallocated"
          value={money(b.remainingMinor, state.currency)}
          detail="Selected budget − planned allocations − reserve"
        />
        <Metric
          label="Confirmed net spending"
          value={money(s.actualHomeMinor, state.currency)}
          detail={
            s.indicativeActual
              ? "Indicative home equivalent · see original currencies below"
              : "Verified captures less completed refunds/reversals; fees separate"
          }
        />
        <Metric
          label="Projection including financial history"
          value={money(s.projectedMinor, state.currency)}
          detail={`Before reserve · remaining ${money(s.projectedRemainingMinor, state.currency)}`}
        />
      </div>
      <div className="wallet-detail-grid">
        <section className="wallet-section">
          <div className="section-title">
            <h3>Where the plan goes</h3>
            <span>{state.currency} · group estimates</span>
          </div>
          {s.categoryRows.map((row) => (
            <div key={row.category} className="wallet-category">
              <div>
                <strong>{budgetLabels[row.category]}</strong>
                <span>
                  {money(row.allocatedMinor, state.currency)}
                  {!row.inScope && " · out of scope"}
                </span>
              </div>
              <meter
                min={0}
                max={Math.max(1, b.selectedBudgetMinor)}
                value={Math.min(row.allocatedMinor, b.selectedBudgetMinor)}
                aria-label={`${budgetLabels[row.category]} planned allocation`}
              />
              <p>
                Itemized {money(row.itemizedEstimateMinor, state.currency)} +
                additional allowance{" "}
                {money(row.unitemizedAllowanceMinor, state.currency)}. Confirmed
                net {money(row.actualMinor, state.currency)}; reported fees{" "}
                {money(row.feeMinor, state.currency)}; additional traveler fees{" "}
                {money(row.additionalFeeMinor, state.currency)}.
              </p>
            </div>
          ))}
          <p className="inline-note">
            Itemized {money(b.itemizedEstimateMinor, state.currency)} +
            unitemized {money(b.unitemizedAllowanceMinor, state.currency)} ={" "}
            {money(b.allocatedMinor, state.currency)}. Including the separate
            reserve: {money(b.totalWithReserveMinor, state.currency)}. Food and
            transport are counted once.
          </p>
        </section>
        <section className="wallet-section">
          <ShieldCheck size={22} aria-hidden="true" />
          <h3>Confirmed, pending & returned</h3>
          {s.native.length ? (
            s.native.map((row) => (
              <dl className="review-list" key={row.currency}>
                {Object.entries({
                  "Original currency": row.currency,
                  "Confirmed captures": money(row.capturedMinor, row.currency),
                  "Completed refunds / reversals": money(
                    row.refundedMinor,
                    row.currency,
                  ),
                  "Net confirmed spending": money(row.netMinor, row.currency),
                  "Net reported fees · treatment recorded separately": money(
                    row.feeMinor,
                    row.currency,
                  ),
                  "Pending payments": money(row.pendingMinor, row.currency),
                  "Refund pending · still committed": money(
                    row.pendingRefundMinor,
                    row.currency,
                  ),
                }).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ))
          ) : (
            <p>
              No payments or refunds have been verified. Confirmed spending,
              pending payments and refunds are all {money(0, state.currency)}.
            </p>
          )}
          <p>
            Unpaid itemized planning estimate:{" "}
            <strong>{money(s.unpaidItemizedMinor, state.currency)}</strong>.
            Additional category allowances are shown separately.
          </p>
          <p className="inline-note">
            A pending refund does not release funds. Confirmed spending replaces
            covered estimates rather than adding a second copy. Removing an
            activity never refunds a payment. Only fees verified as additional
            traveler costs enter the projection. Included, merchant-paid or
            unknown fees are never silently added again.
          </p>
        </section>
      </div>
      <section className="wallet-section">
        <h3>Itemized activity estimates</h3>
        {state.activities.length ? (
          <div
            className="wallet-table-scroll"
            role="region"
            aria-label="Itemized planning estimates"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Activity / local date</th>
                  <th>Category</th>
                  <th>Group estimate</th>
                  <th>Information</th>
                </tr>
              </thead>
              <tbody>
                {state.activities.map((a) => (
                  <tr key={a.id}>
                    <th>
                      <Link
                        href={`/trips/${state.tripId}/itinerary#day-${a.dayId}`}
                      >
                        {a.title}
                      </Link>
                      <small>
                        Day {a.dayNumber} · {a.date} · {clock(a.startMinute)}
                      </small>
                    </th>
                    <td>{budgetLabels[a.category]}</td>
                    <td>
                      {money(a.costMinor, state.currency)} {state.currency}
                    </td>
                    <td>
                      {a.estimateSource === "manual-estimate"
                        ? "Manually entered estimate"
                        : "AI estimate"}{" "}
                      · unverified
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>
            Your chosen budget is saved. Itemized estimates will appear after a
            validated itinerary is saved.
          </p>
        )}
      </section>
    </>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="wallet-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

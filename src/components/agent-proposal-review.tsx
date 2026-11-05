"use client";
import { useState } from "react";
import { clock } from "@/lib/activity-metadata";
import { money } from "@/lib/itinerary";
import { budgetLabels } from "./itinerary-budget-view";
import type { AssistantState } from "@/server/agent";
type Proposal = NonNullable<AssistantState["turns"][number]["proposal"]>;
export function AgentProposalReview({
  proposal: p,
  currentVersion,
  busy,
  onAction,
  onClose,
}: {
  proposal: Proposal;
  currentVersion: number;
  busy: boolean;
  onAction: (body: unknown) => Promise<boolean>;
  onClose: () => void;
}) {
  const [ack, setAck] = useState(false);
  const preview = p.preview,
    currency = preview.afterBudget.currency,
    closed = ["approved", "rejected", "changes-requested"].includes(p.status),
    stale = p.baseVersion !== currentVersion;
  return (
    <section className="panel agent-review" aria-label="AI proposal review">
      <div className="editor-heading">
        <div>
          <span className="eyebrow">REVIEW BEFORE APPLYING</span>
          <h2>Your proposed itinerary changes</h2>
          <p>{p.summary}</p>
        </div>
        <button
          type="button"
          className="button button-secondary"
          onClick={onClose}
        >
          Back to itinerary
        </button>
      </div>
      <p className="notice" role="status">
        {p.status === "approved"
          ? `Applied and saved as itinerary revision ${p.appliedVersion}. This is a recorded database outcome, not a booking or payment.`
          : p.status === "rejected"
            ? "You rejected this proposal. It changed nothing."
            : p.status === "changes-requested"
              ? "Proposal closed for revision. Tell TravelRelay what you want changed, then send a new message."
              : `Unsaved AI suggestion · proposal revision ${p.revision}, checked against itinerary revision ${p.baseVersion}. Nothing changes until you approve a valid preview.`}
      </p>
      {!closed && stale && (
        <p className="notice" role="alert">
          Your itinerary is now revision {currentVersion}. Refresh this preview
          and review its new differences before approving. This revalidation
          does not call AI.
        </p>
      )}
      {!preview.canSave && !closed && (
        <div className="notice" role="alert">
          <strong>Resolve these conflicts before approval.</strong>
          <ul>
            {preview.assessment.errors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="agent-budget-comparison">
        <h3>Financial consequences · {currency} group estimates</h3>
        <p>
          Protected reserve:{" "}
          {money(preview.beforeBudget.reserveMinor, currency)} →{" "}
          {money(preview.afterBudget.reserveMinor, currency)}. Genuinely
          unallocated: {money(preview.beforeBudget.remainingMinor, currency)} →{" "}
          {money(preview.afterBudget.remainingMinor, currency)}.
        </p>
        <p className="agent-table-hint inline-note">
          Scroll the comparison horizontally to see every amount.
        </p>
        <div
          className="agent-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Before and after budget comparison"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Planning amount</th>
                <th scope="col">Before</th>
                <th scope="col">Proposed</th>
              </tr>
            </thead>
            <tbody>
              {preview.afterBudget.allocations.map((row) => {
                const old = preview.beforeBudget.allocations.find(
                  (a) => a.category === row.category,
                )!;
                return (
                  <tr key={row.category}>
                    <th scope="row">
                      {budgetLabels[row.category]}
                      {!row.inScope && " (out of scope)"}
                      <small>
                        Inclusive allocation / itemized / additional allowance
                      </small>
                    </th>
                    <td>
                      {money(old.allocatedMinor, currency)}
                      <small>
                        {money(old.itemizedEstimateMinor, currency)} /{" "}
                        {money(old.unitemizedAllowanceMinor, currency)}
                      </small>
                    </td>
                    <td>
                      {money(row.allocatedMinor, currency)}
                      <small>
                        {money(row.itemizedEstimateMinor, currency)} /{" "}
                        {money(row.unitemizedAllowanceMinor, currency)}
                      </small>
                    </td>
                  </tr>
                );
              })}
              {(
                [
                  ["Total including reserve", "totalWithReserveMinor"],
                  ["Protected emergency reserve", "reserveMinor"],
                  ["Genuinely unallocated", "remainingMinor"],
                ] as const
              ).map(([name, key]) => (
                <tr key={key}>
                  <th scope="row">{name}</th>
                  <td>{money(preview.beforeBudget[key], currency)}</td>
                  <td>{money(preview.afterBudget[key], currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Projection change:{" "}
          <strong>
            {money(preview.budgetDeltaMinor, currency)} {currency}
          </strong>
          . Food and transport are counted once within their inclusive
          allocations. No spending or payment is recorded.
        </p>
      </div>
      <ol className="agent-change-list">
        {preview.changes.map((change) => (
          <li key={change.activityId}>
            <h3>
              {change.after?.activity.title ?? change.before?.activity.title}
            </h3>
            <div className="agent-change-columns">
              {(
                [
                  ["Before", change.before],
                  ["Proposed", change.after],
                ] as const
              ).map(([label, row]) => (
                <div key={label}>
                  <strong>{label}</strong>
                  {row ? (
                    <>
                      <h4>{row.activity.title}</h4>
                      <p>
                        {row.date} · {clock(row.activity.startMinute)}–
                        {clock(
                          row.activity.startMinute +
                            row.activity.durationMinutes,
                        )}
                      </p>
                      <p>
                        {row.activity.durationMinutes} min ·{" "}
                        {row.activity.bufferBeforeMinutes} min buffer ·{" "}
                        {row.activity.category}
                      </p>
                      <p>{row.activity.location}</p>
                      <p>{row.activity.description}</p>
                      <p>
                        {money(row.activity.costMinor, currency)} {currency} ·
                        group estimate
                      </p>
                      <small>
                        {row.activity.links?.length ?? 0} saved source
                        references ·{" "}
                        {row.activity.latitude === null
                          ? "Coordinates unknown"
                          : "Stored unverified coordinates"}
                      </small>
                    </>
                  ) : (
                    <p>
                      {label === "Before"
                        ? "New activity"
                        : "Remove from itinerary"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {!!preview.assessment.warnings.length && (
        <details open className="notice">
          <summary>Planning suggestions and uncertainties</summary>
          <ul>
            {preview.assessment.warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </details>
      )}
      {!closed && (
        <>
          <p className="inline-note">
            New suggestions, prices and unsourced venue hours/locations are
            unverified. Server validation is not a guarantee of availability or
            accessibility.
          </p>
          {preview.overBudget && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              I understand this proposal exceeds my budget; the emergency
              reserve remains separate.
            </label>
          )}
          <div className="editor-actions">
            <button
              type="button"
              className="button button-primary"
              disabled={
                busy ||
                stale ||
                p.status !== "pending" ||
                !preview.canSave ||
                (preview.overBudget && !ack)
              }
              onClick={() =>
                void onAction({
                  action: "approve",
                  proposalId: p.id,
                  revision: p.revision,
                  acknowledgeOverBudget: ack,
                })
              }
            >
              {busy ? "Checking saved outcome…" : "Approve & save proposal"}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() =>
                void onAction({
                  action: "reject",
                  proposalId: p.id,
                  revision: p.revision,
                })
              }
            >
              Reject proposal
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() =>
                void onAction({
                  action: "request_changes",
                  proposalId: p.id,
                  revision: p.revision,
                })
              }
            >
              Request changes
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={() =>
                void onAction({
                  action: "refresh_preview",
                  proposalId: p.id,
                  revision: p.revision,
                })
              }
            >
              Refresh validated preview
            </button>
          </div>
        </>
      )}
      <details className="agent-proposal-history">
        <summary>Proposal review history</summary>
        <ul>
          {p.events.map((e) => (
            <li key={e.id}>
              Revision {e.revision} · {e.event} · {e.createdAt}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

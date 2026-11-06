"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { Sparkles, Send, LoaderCircle, ArrowLeft } from "lucide-react";
import { agentIsActive, agentStageLabel } from "@/lib/agent-contracts";
import { money } from "@/lib/itinerary";
import type { TravelAgentController } from "./use-travel-agent";
export function TripAssistant({
  agent,
  tripId,
  onClose,
  onReview,
}: {
  agent: TravelAgentController;
  tripId: string;
  onClose: () => void;
  onReview: (id: string) => void;
}) {
  const feed = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null);
  const state = agent.state;
  const last = state?.turns.at(-1);
  useEffect(() => {
    const el = feed.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 350)
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [last?.id, last?.status]);
  const prompts = state
    ? [
        `What should we do on ${state.days.length > 1 ? "day two" : "our first day"}?`,
        `How much budget do we have left?`,
        `Make ${state.days.length > 2 ? "day three" : "our first day"} more relaxed.`,
      ]
    : [];
  return (
    <>
      <header className="agent-header">
        <div>
          <Sparkles aria-hidden="true" size={20} />
          <h2>Ask TravelRelay</h2>
        </div>
        <button
          type="button"
          className="button button-secondary"
          onClick={onClose}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span className="agent-back-label">Back to itinerary</span>
          <span className="agent-collapse-label">Collapse</span>
        </button>
      </header>
      {!state ? (
        <div className="agent-empty">
          <h3>A little help, alongside your plans.</h3>
          <p>
            Generate and save a complete itinerary to start a trip-aware
            conversation.
          </p>
        </div>
      ) : (
        <>
          <div className="agent-context-summary">
            <p>
              Saved itinerary revision {state.currentVersion} ·{" "}
              {state.days.length} days
            </p>
            <div>
              <span>
                Unallocated{" "}
                <strong>
                  {money(state.budget.remainingMinor, state.currency)}{" "}
                  {state.currency}
                </strong>
              </span>
              <span>
                Separate reserve{" "}
                <strong>
                  {money(state.budget.reserveMinor, state.currency)}
                </strong>
              </span>
            </div>
            <small>Planning estimates · payment history is in TripWallet</small>
            <Link className="text-link" href={`/trips/${tripId}/recovery`}>
              Open Trip Recovery
            </Link>
          </div>
          <div
            ref={feed}
            className="agent-messages"
            tabIndex={0}
            aria-label="Conversation history"
          >
            {state.hasOlder && (
              <button
                type="button"
                className="button button-secondary"
                disabled={agent.busy}
                onClick={() => void agent.refresh(state.turns[0]?.ordinal)}
              >
                Load earlier messages
              </button>
            )}
            {!state.turns.length && (
              <div className="agent-empty">
                <h3>What would make this trip more you?</h3>
                <p>
                  Ask about a day, explore an alternative, or review a calmer
                  schedule. Changes always need your approval.
                </p>
                <div className="agent-suggested-prompts">
                  {prompts.map((p) => (
                    <button
                      type="button"
                      key={p}
                      disabled={!agent.ready || agent.busy}
                      onClick={() => {
                        agent.changeText(p);
                        composer.current?.focus();
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <ol>
              {state.turns.map((t) => (
                <li key={t.id} className="agent-turn">
                  <div className="agent-user-message">
                    <span>You</span>
                    <p>{t.text}</p>
                  </div>
                  <div className="agent-response">
                    <span className="agent-speaker">
                      <Sparkles size={15} aria-hidden="true" />
                      TravelRelay
                    </span>
                    {agentIsActive(t.status) ? (
                      <p role="status" className="agent-job-status">
                        <LoaderCircle
                          size={17}
                          className="spinner"
                          aria-hidden="true"
                        />
                        {agentStageLabel(t.status)}
                      </p>
                    ) : t.status === "ready" && t.response ? (
                      <>
                        <p className="agent-answer">{t.response.answer}</p>
                        <small>
                          AI response based on saved revision {t.contextVersion}
                          {t.contextVersion !== state.currentVersion
                            ? " · itinerary has changed since this answer"
                            : ""}
                          . Suggestions and unsourced details are unverified.
                        </small>
                        {!!t.response.uncertainties.length && (
                          <ul className="agent-uncertainties">
                            {t.response.uncertainties.map((u, i) => (
                              <li key={i}>{u}</li>
                            ))}
                          </ul>
                        )}
                        {!!t.response.activityIds.length && (
                          <div className="agent-activity-links">
                            {t.response.activityIds.map((id) => {
                              const a = state.activities.find(
                                (a) => a.id === id,
                              );
                              return a ? (
                                <Link
                                  key={id}
                                  href={`/trips/${tripId}/itinerary#day-${a.dayId}`}
                                >
                                  {a.title}
                                </Link>
                              ) : (
                                <small key={id}>
                                  Referenced activity was subsequently removed.
                                </small>
                              );
                            })}
                          </div>
                        )}
                        {t.proposal && (
                          <div className="agent-proposal-card">
                            <strong>{t.proposal.summary}</strong>
                            <span>
                              {t.proposal.status === "approved"
                                ? `Saved · itinerary revision ${t.proposal.appliedVersion}`
                                : t.proposal.stale
                                  ? "Stale · refresh preview required"
                                  : t.proposal.status === "invalid"
                                    ? "Conflicts · approval blocked"
                                    : t.proposal.status === "pending"
                                      ? "Unsaved · approval required"
                                      : t.proposal.status}
                            </span>
                            <p>
                              {t.proposal.preview.changes.length} affected
                              activities ·{" "}
                              {money(
                                t.proposal.preview.budgetDeltaMinor,
                                state.currency,
                              )}{" "}
                              {state.currency} projected change
                            </p>
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => onReview(t.proposal!.id)}
                            >
                              Review itinerary proposal
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="agent-failure" role="status">
                        <strong>{agentStageLabel(t.status)}</strong>
                        <p>
                          {t.error ??
                            "Check the saved conversation before retrying."}
                        </p>
                        {t.attempts < 3 && (
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={agent.busy || !!state.activeTurnId}
                            onClick={() =>
                              void agent.act({ action: "retry", turnId: t.id })
                            }
                          >
                            Retry response · uses AI
                          </button>
                        )}
                      </div>
                    )}
                    {!!t.audits.length && (
                      <details className="agent-usage">
                        <summary>Usage and validation</summary>
                        {t.audits.map((a) => (
                          <div key={a.id}>
                            <strong>
                              {a.provider} · {a.model} · attempt {a.attempt}
                            </strong>
                            <p>
                              Input {a.usage?.inputTokens ?? "unknown"} · output{" "}
                              {a.usage?.outputTokens ?? "unknown"} (reasoning{" "}
                              {a.usage?.reasoningTokens ?? "unknown"}, already
                              included).
                            </p>
                            <p>
                              {a.latencyMs === null
                                ? "Latency unknown"
                                : `${(a.latencyMs / 1000).toFixed(2)}s response time`}{" "}
                              ·{" "}
                              {a.usage?.estimatedCostUsd == null
                                ? "USD cost unknown"
                                : `Estimated USD $${a.usage.estimatedCostUsd.toFixed(5)}`}
                              . Reference estimate, not a billing receipt.
                            </p>
                            <p>Validation: {a.validation.stage}</p>
                            {a.validation.errors.map((e, i) => (
                              <p key={i}>{e}</p>
                            ))}
                          </div>
                        ))}
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <form
            className="agent-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void agent.send();
            }}
          >
            {agent.error && (
              <p className="form-error" role="alert">
                {agent.error}
              </p>
            )}
            {agent.expired && (
              <p className="notice">
                Your message is kept in this tab.{" "}
                <Link
                  href={`/login?next=${encodeURIComponent(`/trips/${tripId}/itinerary`)}`}
                >
                  Sign in again
                </Link>{" "}
                to continue.
              </p>
            )}
            {agent.draftConflict && (
              <div className="notice">
                <p>
                  Review the saved message draft or explicitly keep your current
                  text.
                </p>
                <button
                  type="button"
                  onClick={() => void agent.resolveDraft(false)}
                >
                  Use saved draft
                </button>
                <button
                  type="button"
                  onClick={() => void agent.resolveDraft(true)}
                >
                  Keep my draft
                </button>
              </div>
            )}
            <label className="field">
              Message TravelRelay
              <textarea
                ref={composer}
                rows={3}
                maxLength={2000}
                value={agent.text}
                disabled={!agent.ready || agent.busy || agent.unknownSend}
                onChange={(e) => agent.changeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void agent.send();
                  }
                }}
                placeholder="Ask about your trip or propose a change…"
                aria-describedby="agent-message-help"
              />
            </label>
            <p id="agent-message-help" className="inline-note">
              Ctrl/⌘ + Enter to send. No itinerary change happens without a
              separate approval. No live venue, booking or payment tools.
            </p>
            <div className="agent-compose-actions">
              <small role="status">{agent.draftStatus}</small>
              <button
                type="submit"
                className="button button-primary"
                disabled={
                  !agent.ready ||
                  agent.busy ||
                  !agent.text.trim() ||
                  !!state.activeTurnId ||
                  agent.draftConflict ||
                  agent.expired
                }
              >
                <Send size={16} aria-hidden="true" />
                {agent.unknownSend
                  ? "Retry same message"
                  : agent.busy
                    ? "Saving request…"
                    : "Send"}
              </button>
            </div>
            <div className="agent-status-actions">
              <button
                type="button"
                disabled={agent.busy}
                onClick={() => void agent.refresh()}
              >
                Check saved status
              </button>
              {agent.draftStatus.includes("failed") && (
                <button
                  type="button"
                  disabled={agent.busy}
                  onClick={() => void agent.flush()}
                >
                  Retry draft save
                </button>
              )}
            </div>
          </form>
        </>
      )}
    </>
  );
}

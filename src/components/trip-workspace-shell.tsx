"use client";
import { useRef, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import type { AssistantState } from "@/server/agent";
import { useTravelAgent } from "./use-travel-agent";
import { TripAssistant } from "./trip-assistant";
import { AgentProposalReview } from "./agent-proposal-review";
export function TripWorkspaceShell({
  tripId,
  userId,
  initial,
  children,
}: {
  tripId: string;
  userId: string;
  initial: AssistantState | null;
  children: ReactNode;
}) {
  const agent = useTravelAgent(initial, userId, tripId),
    [open, setOpen] = useState(true),
    [mobile, setMobile] = useState("itinerary"),
    [reviewId, setReviewId] = useState<string | null>(null);
  const assistant = useRef<HTMLElement>(null),
    review = useRef<HTMLDivElement>(null);
  const proposal =
    agent.state?.turns.map((t) => t.proposal).find((p) => p?.id === reviewId) ??
    null;
  function reviewProposal(id: string) {
    setReviewId(id);
    setMobile("itinerary");
    requestAnimationFrame(() =>
      review.current?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  }
  async function action(body: unknown) {
    const ok = await agent.act(body);
    if (ok && (body as { action: string }).action === "request_changes") {
      if (!agent.text.trim()) agent.changeText("Please revise that proposal: ");
      setOpen(true);
      setMobile("assistant");
      requestAnimationFrame(() =>
        assistant.current?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        }),
      );
    }
    return ok;
  }
  return (
    <>
      <div className="workspace-agent-controls">
        <button
          className="button button-secondary agent-desktop-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="trip-assistant"
          onClick={() => setOpen(!open)}
        >
          <Sparkles size={18} aria-hidden="true" />
          {open ? "Collapse assistant" : "Ask TravelRelay"}
        </button>
        <button
          type="button"
          className="button button-secondary agent-mobile-toggle"
          aria-controls="trip-assistant"
          onClick={() => {
            setMobile(mobile === "assistant" ? "itinerary" : "assistant");
            requestAnimationFrame(() =>
              assistant.current?.scrollIntoView({
                block: "start",
                behavior: "smooth",
              }),
            );
          }}
        >
          {mobile === "assistant" ? "Back to itinerary" : "Ask TravelRelay"}
        </button>
      </div>
      <div
        className="workspace-layout trip-agent-layout"
        data-open={open}
        data-mobile-view={mobile}
      >
        <div className="trip-workspace-content">
          <div ref={review} className="agent-review-anchor">
            {proposal && (
              <AgentProposalReview
                key={`${proposal.id}:${proposal.revision}`}
                proposal={proposal}
                currentVersion={agent.state!.currentVersion}
                busy={agent.busy}
                onAction={action}
                onClose={() => setReviewId(null)}
              />
            )}
          </div>
          {children}
        </div>
        <aside
          id="trip-assistant"
          ref={assistant}
          className="trip-agent-panel"
          aria-label="Trip travel assistant"
        >
          <TripAssistant
            agent={agent}
            tripId={tripId}
            onReview={reviewProposal}
            onClose={() => {
              setOpen(false);
              setMobile("itinerary");
            }}
          />
        </aside>
      </div>
    </>
  );
}

import type { AgentAction, AgentResponse } from "../../src/lib/agent-contracts";
// Explicitly authored OFFLINE provider-boundary fixtures, never an app fallback.
export const blankAgentAction: Omit<AgentAction, "type"> = {
  activityId: null,
  dayId: null,
  title: null,
  description: null,
  category: null,
  location: null,
  city: null,
  startMinute: null,
  durationMinutes: null,
  bufferBeforeMinutes: null,
  costMinor: null,
  currency: null,
};
export const agentAction = (
  type: AgentAction["type"],
  fields: Partial<Omit<AgentAction, "type">>,
): AgentAction => ({ ...blankAgentAction, type, ...fields });
export const agentReply = (
  actions: AgentAction[] | null = null,
  answer = "Here is a planning suggestion based on your saved Paris itinerary. Venue details and prices remain unverified estimates.",
): AgentResponse => ({
  answer,
  activityIds: [],
  uncertainties: ["Future venue hours and availability need confirmation."],
  proposal: actions
    ? {
        summary: "Review this suggested adjustment to your Paris plan.",
        actions,
      }
    : null,
});
export function agentOpenAIWire(output: unknown) {
  return {
    id: "resp_offline_agent",
    object: "response",
    created_at: 1793820000,
    status: "completed",
    model: "gpt-6.1-sol",
    service_tier: "default",
    error: null,
    output: [
      {
        type: "message",
        id: "msg_offline_agent",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(output),
            annotations: [],
          },
        ],
      },
    ],
    usage: {
      input_tokens: 1200,
      output_tokens: 800,
      total_tokens: 2000,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 300 },
    },
  };
}

import type { z } from "zod";
import { PlanningError, type CityProposal } from "../../lib/itinerary";
import type { TripIntent } from "../../lib/trip-intent";
export type AIProvider = "openai" | "gemini";
export type ModelUsage = {
  provider: AIProvider;
  phase: "proposal" | "itinerary" | "assistant";
  model: string;
  inputTokens?: number;
  /** Total generated tokens, INCLUDING reasoning, for both providers. */
  outputTokens?: number;
  reasoningTokens?: number;
  visibleOutputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
  /** Backward-compatible aliases for existing local reports. */
  promptTokens?: number;
  thinkingTokens?: number;
  estimatedCostUsd: number | null;
  pricing: {
    checkedOn: string;
    sourceUrl: string;
    basis: "standard-paid-reference";
    note: string;
  };
};
export type ModelCallContext = {
  purpose?: "assistant";
  onUsage?: (usage: ModelUsage) => void | Promise<void>;
};
export type ProviderOptions = {
  key?: string;
  name?: string;
  reasoningEffort?: "medium";
  fetch?: typeof fetch;
  onUsage?: (usage: ModelUsage) => void | Promise<void>;
};
export interface TripModel {
  name: string;
  provider?: AIProvider;
  respond?(input: unknown, context?: ModelCallContext): Promise<unknown>;
  propose(intent: TripIntent, context?: ModelCallContext): Promise<unknown>;
  generate(
    intent: TripIntent,
    base: CityProposal,
    context?: ModelCallContext,
  ): Promise<unknown>;
}
export type StructuredCall = (
  schema: z.ZodType,
  task: string,
  input: unknown,
  full?: boolean,
  context?: ModelCallContext,
) => Promise<unknown>;
export class ModelFailure extends PlanningError {
  constructor(
    message: string,
    public readonly stage: "provider" | "schema" = "provider",
  ) {
    super(message);
  }
}

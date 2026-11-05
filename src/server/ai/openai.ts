import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { Response } from "openai/resources/responses/responses";
import type { z } from "zod";
import {
  ModelFailure,
  type ModelCallContext,
  type ProviderOptions,
} from "./contracts";
import { createPlanner, planningSystemInstruction } from "./prompts";
import { openaiUsage } from "./usage";
import { MODEL_TIMEOUT_MS } from "../../lib/generation-timing";
import { assistantSystemInstruction } from "./agent-prompts";
export function createOpenAITripModel(config: ProviderOptions) {
  const name = config.name ?? "gpt-6.1-sol";
  const client = config.key
    ? new OpenAI({
        apiKey: config.key,
        baseURL: "https://api.openai.com/v1",
        organization: null,
        project: null,
        maxRetries: 0,
        timeout: MODEL_TIMEOUT_MS,
        fetch: config.fetch,
        logLevel: "off",
      })
    : null;
  async function structured(
    schema: z.ZodType,
    task: string,
    input: unknown,
    full = false,
    context?: ModelCallContext,
  ) {
    if (!client)
      throw new ModelFailure(
        "AI generation is not configured. Your trip is saved; configure the server OpenAI API key before retrying.",
      );
    const contents = JSON.stringify(input);
    const assistant = context?.purpose === "assistant";
    if (Buffer.byteLength(contents, "utf8") > (assistant ? 96_000 : 24_000))
      throw new ModelFailure(
        "These preferences are too long for generation. Shorten the free-text fields and retry; your input is saved.",
      );
    let response: Response;
    try {
      response = await client.responses.create(
        {
          model: name,
          instructions: `${assistant ? assistantSystemInstruction : planningSystemInstruction}${task}`,
          input: contents,
          reasoning: { effort: config.reasoningEffort ?? "medium" },
          text: {
            format: zodTextFormat(
              schema,
              assistant
                ? "travelrelay_assistant"
                : full
                  ? "travelrelay_itinerary"
                  : "travelrelay_base",
            ),
          },
          max_output_tokens: full ? 32768 : 8192,
          store: false,
          background: false,
          stream: false,
          service_tier: "default",
        },
        { signal: AbortSignal.timeout(MODEL_TIMEOUT_MS), maxRetries: 0 },
      );
    } catch (error) {
      if (error instanceof OpenAI.APIConnectionError)
        throw new ModelFailure(
          "The AI service could not be reached or timed out. Your input is safe; please retry.",
        );
      if (error instanceof OpenAI.APIError)
        throw new ModelFailure(
          error.status === 429
            ? "OpenAI’s rate limit or quota has been reached. Your input is saved; retry later or view the example trip."
            : (error.status ?? 0) >= 500
              ? "The AI service is temporarily unavailable. Your input is safe; retry later."
              : "The AI service rejected this request. Check the server OpenAI configuration and model access before retrying.",
        );
      throw new ModelFailure(
        "The AI service could not be reached or timed out. Your input is safe; please retry.",
      );
    }
    const usage = openaiUsage(
      response,
      assistant ? "assistant" : full ? "itinerary" : "proposal",
      name,
    );
    await config.onUsage?.(usage);
    await context?.onUsage?.(usage);
    if (response.status !== "completed" || response.error)
      throw new ModelFailure(
        "The AI response was incomplete or failed. Your input is safe; please retry.",
      );
    if (
      response.output.some(
        (item) =>
          item.type === "message" &&
          item.content.some((part) => part.type === "refusal"),
      )
    )
      throw new ModelFailure(
        "The AI service could not fulfill these preferences. Review your saved trip and try again.",
      );
    try {
      return schema.parse(JSON.parse(response.output_text));
    } catch {
      throw new ModelFailure(
        "The AI response did not match the required itinerary structure. Please retry.",
        "schema",
      );
    }
  }
  return createPlanner(name, "openai", structured);
}

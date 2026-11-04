import type { Response } from "openai/resources/responses/responses";
import type { GenerateContentResponse } from "@google/genai";
import type { AIProvider, ModelUsage } from "./contracts";
const count = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
const checkedOn = "2026-11-04";
function cost(
  provider: AIProvider,
  input?: number,
  output?: number,
  cached = 0,
  writes = 0,
  writes12h = 0,
) {
  if (
    input === undefined ||
    output === undefined ||
    cached + writes > input ||
    writes12h > writes
  )
    return null;
  const usd =
    provider === "openai"
      ? ((input - cached - writes) * 2 +
          cached * 0.1 +
          (writes - writes12h) * 2.5 +
          writes12h * 5 +
          output * 10) /
        1_000_000
      : ((input - cached) * 0.3 + cached * 0.03 + output * 2.5) / 1_000_000;
  return Math.round(usd * 1e8) / 1e8;
}
export function openaiUsage(
  response: Response,
  phase: ModelUsage["phase"],
  model: string,
): ModelUsage {
  const u = response.usage,
    input = count(u?.input_tokens),
    output = count(u?.output_tokens),
    reasoning = count(u?.output_tokens_details?.reasoning_tokens);
  const cached = count(u?.input_tokens_details?.cached_tokens),
    writes = count(u?.input_tokens_details?.cache_write_tokens),
    writes12h = count(
      u?.input_tokens_details?.cache_write_tokens_details?.ttl_12h_tokens,
    );
  return {
    provider: "openai",
    phase,
    model,
    inputTokens: input,
    promptTokens: input,
    outputTokens: output,
    reasoningTokens: reasoning,
    thinkingTokens: reasoning,
    visibleOutputTokens:
      output !== undefined && reasoning !== undefined && reasoning <= output
        ? output - reasoning
        : undefined,
    cachedInputTokens: cached,
    cacheWriteTokens: writes,
    totalTokens: count(u?.total_tokens),
    estimatedCostUsd:
      !response.service_tier || response.service_tier === "default"
        ? cost("openai", input, output, cached, writes, writes12h)
        : null,
    pricing: {
      checkedOn,
      sourceUrl: "https://developers.openai.com/api/docs/pricing",
      basis: "standard-paid-reference",
      note: "USD estimate, not an invoice. Standard short-context text rates; reasoning is already included in output. Cached reads/writes use reported counts (missing cache counts assume none). Taxes, regional surcharges and account discounts excluded; nonstandard returned tiers have unknown cost.",
    },
  };
}
export function geminiUsage(
  u: GenerateContentResponse["usageMetadata"],
  phase: ModelUsage["phase"],
  model: string,
): ModelUsage {
  const input = count(u?.promptTokenCount),
    visible = count(u?.candidatesTokenCount),
    reasoning = count(u?.thoughtsTokenCount),
    total = count(u?.totalTokenCount);
  const output =
    visible !== undefined && reasoning !== undefined
      ? visible + reasoning
      : input !== undefined && total !== undefined && total >= input
        ? total - input
        : undefined;
  const cached = count(u?.cachedContentTokenCount);
  return {
    provider: "gemini",
    phase,
    model,
    inputTokens: input,
    promptTokens: input,
    outputTokens: output,
    visibleOutputTokens: visible,
    reasoningTokens: reasoning,
    thinkingTokens: reasoning,
    totalTokens: total,
    cachedInputTokens: cached,
    estimatedCostUsd: cost("gemini", input, output, cached),
    pricing: {
      checkedOn,
      sourceUrl:
        "https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite",
      basis: "standard-paid-reference",
      note: "Paid-standard text reference estimate, not an invoice or free-tier charge. Output includes thinking once; explicit cache storage, tools, taxes and account discounts excluded.",
    },
  };
}

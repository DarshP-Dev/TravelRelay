import { z } from "zod";
import {
  ApiError,
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentResponse,
} from "@google/genai";
import {
  ModelFailure,
  type ModelCallContext,
  type ProviderOptions,
  type TripModel,
} from "./contracts";
import { createPlanner, planningSystemInstruction } from "./prompts";
import { geminiUsage } from "./usage";
import { MODEL_TIMEOUT_MS } from "../../lib/generation-timing";
import { assistantSystemInstruction } from "./agent-prompts";

// Gemini's grammar can reject bounded nested arrays with 400 INVALID_ARGUMENT.
// Keep structural types/required fields here; describe bounds as guidance and
// enforce every original constraint with Zod/domain validation on the server.
export function geminiJsonSchema(schema: z.ZodType): unknown {
  const supported = new Set([
    "$id",
    "$defs",
    "$ref",
    "$anchor",
    "type",
    "format",
    "title",
    "description",
    "enum",
    "items",
    "prefixItems",
    "anyOf",
    "oneOf",
    "properties",
    "additionalProperties",
    "required",
  ]);
  function project(value: unknown): unknown {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return value;
    const projected = Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => supported.has(key))
        .map(([key, item]) => [
          key,
          key === "properties" || key === "$defs"
            ? Object.fromEntries(
                Object.entries(item as Record<string, unknown>).map(
                  ([name, child]) => [name, project(child)],
                ),
              )
            : ["anyOf", "oneOf", "prefixItems"].includes(key)
              ? (item as unknown[]).map(project)
              : ["items", "additionalProperties"].includes(key)
                ? project(item)
                : item,
        ]),
    );
    const source = value as Record<string, unknown>;
    const guidance = [
      source.minimum !== undefined ? `Minimum value: ${source.minimum}.` : "",
      source.maximum !== undefined ? `Maximum value: ${source.maximum}.` : "",
      source.minItems !== undefined ? `At least ${source.minItems} items.` : "",
      source.maxItems !== undefined ? `At most ${source.maxItems} items.` : "",
      source.minLength !== undefined
        ? `Text must have at least ${source.minLength} characters.`
        : "",
      source.maxLength !== undefined
        ? `Text must have at most ${source.maxLength} characters.`
        : "",
      source.pattern !== undefined
        ? `Required text format: ${source.pattern}.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (guidance)
      projected.description = [projected.description, guidance]
        .filter(Boolean)
        .join(" ");
    return projected;
  }
  return project(z.toJSONSchema(schema, { target: "draft-7" }));
}
// This adapter is imported only by server runtime. The key never enters a DTO.
export function createGeminiTripModel(config: ProviderOptions): TripModel {
  const name = config.name || "gemini-3.5-flash-lite";
  // Explicit endpoint/credentials prevent environment-based Vertex/host switching.
  const client = config.key
    ? new GoogleGenAI({
        apiKey: config.key,
        vertexai: false,
        httpOptions: {
          baseUrl: "https://generativelanguage.googleapis.com",
          apiVersion: "v1beta",
          timeout: MODEL_TIMEOUT_MS,
          retryOptions: { attempts: 1 },
          fetch: config.fetch,
        },
      })
    : null;
  async function structured(
    schema: z.ZodType,
    task: string,
    input: unknown,
    fullItinerary = false,
    context?: ModelCallContext,
  ) {
    if (!client)
      throw new ModelFailure(
        "AI generation is not configured. Your trip is saved; please try again after the server API key is configured.",
      );
    let response: GenerateContentResponse;
    const contents = JSON.stringify(input);
    const assistant = context?.purpose === "assistant";
    if (Buffer.byteLength(contents, "utf8") > (assistant ? 96_000 : 24_000))
      throw new ModelFailure(
        "These preferences are too long for generation. Shorten the free-text fields and retry; your input is saved.",
      );
    try {
      response = await client.models.generateContent({
        model: name,
        contents,
        config: {
          systemInstruction: `${assistant ? assistantSystemInstruction : planningSystemInstruction}${task}`,
          responseMimeType: "application/json",
          responseJsonSchema: geminiJsonSchema(schema),
          maxOutputTokens: assistant ? 8192 : fullItinerary ? 32768 : 2048,
          thinkingConfig: {
            thinkingLevel:
              fullItinerary || assistant
                ? ThinkingLevel.MEDIUM
                : ThinkingLevel.LOW,
            includeThoughts: false,
          },
          automaticContinuation: false,
          store: false,
          abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
        },
      });
    } catch (error) {
      if (error instanceof ApiError)
        throw new ModelFailure(
          error.status === 429
            ? "Gemini’s rate limit or quota has been reached. Your trip is saved. Retry later or view the example trip."
            : error.status >= 500
              ? "The AI service is temporarily unavailable. Your input is safe; please retry later."
              : "The AI service rejected this request. Check the server Gemini configuration, then retry.",
        );
      throw new ModelFailure(
        "The AI service could not be reached or timed out. Your input is safe; please retry.",
      );
    }
    const usage = geminiUsage(
      response.usageMetadata,
      assistant ? "assistant" : fullItinerary ? "itinerary" : "proposal",
      name,
    );
    await config.onUsage?.(usage);
    await context?.onUsage?.(usage);
    const finishReason = response.candidates?.[0]?.finishReason;
    if (
      finishReason === "MAX_TOKENS" ||
      finishReason === "CONTINUATION" ||
      !finishReason
    )
      throw new ModelFailure(
        "The AI response was incomplete. Your input is safe; please retry.",
      );
    if (finishReason !== "STOP" || response.promptFeedback?.blockReason)
      throw new ModelFailure(
        "The AI service could not fulfill these preferences. Review your saved trip and try again.",
      );
    try {
      return schema.parse(JSON.parse(response.text ?? ""));
    } catch {
      throw new ModelFailure(
        "The AI response did not match the required itinerary structure. Please retry.",
        "schema",
      );
    }
  }
  return createPlanner(name, "gemini", structured);
}

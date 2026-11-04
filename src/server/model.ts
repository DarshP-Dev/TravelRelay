import { createOpenAITripModel } from "./ai/openai";
import { createGeminiTripModel } from "./ai/gemini";
import type { AIProvider, ProviderOptions, TripModel } from "./ai/contracts";
export type { TripModel, ModelUsage, ModelCallContext } from "./ai/contracts";
export { providerConfigFromEnv } from "./ai/config";
export { geminiJsonSchema } from "./ai/gemini";
// Server runtime supplies credentials. Failures never invoke another provider.
export function createTripModel(
  config: ProviderOptions & { provider?: AIProvider },
): TripModel {
  const provider = config.provider ?? "openai";
  if (provider !== "openai" && provider !== "gemini")
    throw new Error("Unsupported AI provider.");
  const approved =
    provider === "openai" ? "gpt-6.1-sol" : "gemini-3.5-flash-lite";
  if (config.name && config.name !== approved)
    throw new Error(
      "Unapproved AI model; no automatic substitution is permitted.",
    );
  return provider === "openai"
    ? createOpenAITripModel(config)
    : createGeminiTripModel(config);
}

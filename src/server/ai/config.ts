import type { AIProvider, ProviderOptions } from "./contracts";
export function providerConfigFromEnv(
  env: Record<string, string | undefined>,
): ProviderOptions & { provider: AIProvider } {
  const provider = env.AI_PROVIDER || "openai";
  if (provider !== "openai" && provider !== "gemini")
    throw new Error(
      "AI_PROVIDER must be openai or gemini; no automatic provider fallback is available.",
    );
  const name =
    provider === "openai"
      ? env.OPENAI_MODEL || "gpt-6.1-sol"
      : env.GEMINI_MODEL || env.MODEL_NAME || "gemini-3.5-flash-lite";
  if (
    name !== (provider === "openai" ? "gpt-6.1-sol" : "gemini-3.5-flash-lite")
  )
    throw new Error(
      "The selected provider model is not approved for TravelRelay Milestone 2A.",
    );
  if (
    provider === "openai" &&
    env.OPENAI_REASONING_EFFORT &&
    env.OPENAI_REASONING_EFFORT !== "medium"
  )
    throw new Error(
      "OPENAI_REASONING_EFFORT must be medium for this milestone.",
    );
  return {
    provider,
    name,
    reasoningEffort: "medium",
    key: provider === "openai" ? env.OPENAI_API_KEY : env.GEMINI_API_KEY,
  };
}

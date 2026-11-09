import nextEnv from "@next/env";
import { existsSync, readdirSync } from "node:fs";
import {
  runtimeConfiguration,
  validateHostedDatabaseUrl,
} from "../src/server/deployment-config";
import { migrationManifest } from "../src/server/db/readiness";
import { sandboxConfig } from "../src/server/paypal-client";
import { providerConfigFromEnv } from "../src/server/model";
import { generationLimitsFromEnv } from "../src/server/generation-quota";

const vercel = process.argv.includes("--vercel") || process.env.VERCEL === "1";
try {
  if (!vercel) nextEnv.loadEnvConfig(process.cwd());
  if (vercel && process.versions.node.split(".")[0] !== "24")
    throw new Error("Vercel builds require Node.js 24.x.");
  const config = runtimeConfiguration({
    ...process.env,
    NODE_ENV: "production",
    VERCEL: vercel ? "1" : undefined,
  });
  if (!config.vercel) {
    validateHostedDatabaseUrl(process.env.DIRECT_URL, "DIRECT_URL");
    if (new URL(process.env.DIRECT_URL!).hostname.includes("-pooler"))
      throw new Error("Migration DIRECT_URL must use the unpooled endpoint.");
  }
  if (config.localPreview)
    throw new Error("Deployment checks require a hosted origin, not local QA.");
  if (
    readdirSync(process.cwd()).some(
      (file) => file.startsWith(".env") && file !== ".env.example",
    ) ||
    [".data", ".test-data"].some((file) => existsSync(file))
  )
    throw new Error(
      "Deployment checkout contains private local configuration or QA data. Use a clean Git checkout.",
    );
  const model = providerConfigFromEnv(process.env);
  if (
    !(model.provider === "gemini"
      ? process.env.GEMINI_API_KEY
      : process.env.OPENAI_API_KEY)
  )
    throw new Error("Configure the selected provider's server API key.");
  generationLimitsFromEnv(process.env);
  if (
    process.env.ENABLE_DEMO_MERCHANT === "true" &&
    !sandboxConfig(process.env)
  )
    throw new Error(
      "Configure all Sandbox merchant settings before enabling checkout.",
    );
  const migrations = migrationManifest();
  console.log(
    `Deployment configuration passed; ${migrations.length} migrations. No external API or database was contacted.`,
  );
  if (!process.env.PAYPAL_WEBHOOK_ID)
    console.log("Signed webhook delivery remains disabled/unverified.");
} catch (error) {
  // All expected configuration messages above contain names only. Schema/driver
  // errors are deliberately not echoed because they can include input values.
  const safe =
    error instanceof Error && !("issues" in error)
      ? error.message
      : "Invalid deployment configuration.";
  console.error(safe);
  process.exitCode = 1;
}

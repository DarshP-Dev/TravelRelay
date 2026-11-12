import "server-only";
import { openDatabase } from "./db/connection";
import { createApplication } from "./application";
import { createTripModel, providerConfigFromEnv } from "./model";
import { generationLimitsFromEnv } from "./generation-quota";
import { createPayPalClient, sandboxConfig } from "./paypal-client";
import { runtimeConfiguration } from "./deployment-config";
import { activityInsightsFromEnv } from "./activity-insights";

// Reuse the connection across dev reloads, while rebuilding application code
// with each module revision. PGlite must never open the same directory twice.
const globalDatabase = globalThis as typeof globalThis & {
  travelRelayConnection?: ReturnType<typeof openDatabase>;
};
let application: Promise<ReturnType<typeof createApplication>> | undefined;
async function connect() {
  const { secret, origin, vercel } = runtimeConfiguration(process.env);
  const connection = await (globalDatabase.travelRelayConnection ??=
    openDatabase({
      url: process.env.DATABASE_URL,
      directory: process.env.LOCAL_DATABASE_PATH ?? ".data/travelrelay",
      fluidCompute: vercel,
    }).catch((error) => {
      globalDatabase.travelRelayConnection = undefined;
      throw error;
    }));
  const paypal = sandboxConfig(process.env);
  return createApplication(connection.db, {
    secret,
    origin,
    vercel,
    generationLimits: generationLimitsFromEnv(process.env),
    model: createTripModel(providerConfigFromEnv(process.env)),
    paypal: paypal ? createPayPalClient(paypal) : undefined,
    places: activityInsightsFromEnv(process.env),
    recoverySimulation:
      !!paypal && process.env.ENABLE_RECOVERY_SIMULATION === "true",
  });
}
export function getApp() {
  return (application ??= connect().catch((error) => {
    application = undefined;
    throw error;
  }));
}

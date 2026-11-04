import "server-only";
import { openDatabase } from "./db/connection";
import { createApplication } from "./application";
import { createTripModel, providerConfigFromEnv } from "./model";
import { generationLimitsFromEnv } from "./generation-quota";

// Reuse the connection across dev reloads, while rebuilding application code
// with each module revision. PGlite must never open the same directory twice.
const globalDatabase = globalThis as typeof globalThis & {
  travelRelayConnection?: ReturnType<typeof openDatabase>;
};
let application: Promise<ReturnType<typeof createApplication>> | undefined;
async function connect() {
  const secret = process.env.AUTH_SECRET;
  const origin = process.env.APP_URL;
  if (!secret || secret.length < 32 || !origin)
    throw new Error(
      "Configure a strong AUTH_SECRET and APP_URL with npm run setup:local or deployment secrets.",
    );
  const parsedOrigin = new URL(origin);
  if (!["https:", "http:"].includes(parsedOrigin.protocol))
    throw new Error("Configure an HTTP(S) application origin.");
  if (!process.env.DATABASE_URL && process.env.DATABASE_DRIVER !== "pglite")
    throw new Error(
      "Configure PostgreSQL DATABASE_URL or explicitly select local PGlite.",
    );
  if (
    !process.env.DATABASE_URL &&
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_LOCAL_DATABASE !== "true"
  )
    throw new Error(
      "Production requires hosted PostgreSQL. PGlite is single-process local development storage.",
    );
  const connection = await (globalDatabase.travelRelayConnection ??=
    openDatabase({
      url: process.env.DATABASE_URL,
      directory: process.env.LOCAL_DATABASE_PATH ?? ".data/travelrelay",
    }).catch((error) => {
      globalDatabase.travelRelayConnection = undefined;
      throw error;
    }));
  return createApplication(connection.db, {
    secret,
    origin,
    generationLimits: generationLimitsFromEnv(process.env),
    model: createTripModel(providerConfigFromEnv(process.env)),
  });
}
export function getApp() {
  return (application ??= connect().catch((error) => {
    application = undefined;
    throw error;
  }));
}

import nextEnv from "@next/env";
import { openDatabase } from "../src/server/db/connection";
import { runtimeConfiguration } from "../src/server/deployment-config";
import {
  migrationManifest,
  assertDatabaseReady,
} from "../src/server/db/readiness";
nextEnv.loadEnvConfig(process.cwd());
let connection: Awaited<ReturnType<typeof openDatabase>> | undefined;
try {
  if (process.env.NODE_ENV === "production") runtimeConfiguration(process.env);
  if (
    !process.env.DATABASE_URL &&
    !process.env.DIRECT_URL &&
    process.env.DATABASE_DRIVER !== "pglite"
  )
    throw new Error("Configure a database before migration.");
  migrationManifest();
  connection = await openDatabase({
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    directory: process.env.LOCAL_DATABASE_PATH ?? ".data/travelrelay",
  });
  await connection.migrate();
  await assertDatabaseReady(connection.db);
  console.log("Database migrations applied.");
} catch {
  console.error(
    "Database migration failed. Check configuration, migration checkpoint and private database diagnostics. No credentials were logged.",
  );
  process.exitCode = 1;
} finally {
  await connection?.close();
}

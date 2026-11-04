import nextEnv from "@next/env";
import { openDatabase } from "../src/server/db/connection";
nextEnv.loadEnvConfig(process.cwd());
if (
  !process.env.DATABASE_URL &&
  !process.env.DIRECT_URL &&
  process.env.DATABASE_DRIVER !== "pglite"
)
  throw new Error("Configure DATABASE_URL or select DATABASE_DRIVER=pglite.");
const connection = await openDatabase({
  url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  directory: process.env.LOCAL_DATABASE_PATH ?? ".data/travelrelay",
});
try {
  await connection.migrate();
  console.log("Database migrations applied.");
} finally {
  await connection.close();
}

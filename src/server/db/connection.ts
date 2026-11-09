import { PGlite } from "@electric-sql/pglite";
import { drizzle as embeddedDrizzle } from "drizzle-orm/pglite";
import { drizzle as postgresDrizzle } from "drizzle-orm/node-postgres";
import { migrate as embeddedMigrate } from "drizzle-orm/pglite/migrator";
import { migrate as postgresMigrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions/db-connections";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import * as schema from "./schema";

export async function openDatabase(config: {
  url?: string;
  directory?: string;
  fluidCompute?: boolean;
}) {
  if (config.url) {
    const pool = new Pool({
      connectionString: config.url,
      max: 5,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: config.fluidCompute ? 1_000 : 30_000,
      query_timeout: 20_000,
    });
    if (config.fluidCompute) attachDatabasePool(pool);
    // Idle server disconnects must not crash the process or leak connection data.
    pool.on("error", () =>
      console.error("An idle database connection was closed."),
    );
    const db = postgresDrizzle(pool, { schema });
    return {
      db,
      migrate: async () => {
        const client = await pool.connect();
        try {
          await client.query("select pg_advisory_lock(721468604)");
          await postgresMigrate(postgresDrizzle(client, { schema }), {
            migrationsFolder: path.resolve("drizzle"),
          });
        } finally {
          try {
            await client.query("select pg_advisory_unlock(721468604)");
          } finally {
            client.release();
          }
        }
      },
      close: () => pool.end(),
    };
  }
  if (config.directory)
    await mkdir(path.resolve(config.directory), { recursive: true });
  const client = new PGlite(config.directory);
  await client.waitReady;
  const db = embeddedDrizzle(client, { schema });
  return {
    db,
    migrate: () =>
      embeddedMigrate(db, { migrationsFolder: path.resolve("drizzle") }),
    close: () => client.close(),
  };
}
export type Database = Awaited<ReturnType<typeof openDatabase>>["db"];

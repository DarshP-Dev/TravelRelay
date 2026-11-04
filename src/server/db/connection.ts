import { PGlite } from "@electric-sql/pglite";
import { drizzle as embeddedDrizzle } from "drizzle-orm/pglite";
import { drizzle as postgresDrizzle } from "drizzle-orm/node-postgres";
import { migrate as embeddedMigrate } from "drizzle-orm/pglite/migrator";
import { migrate as postgresMigrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import * as schema from "./schema";

export async function openDatabase(config: {
  url?: string;
  directory?: string;
}) {
  if (config.url) {
    const pool = new Pool({ connectionString: config.url, max: 5 });
    const db = postgresDrizzle(pool, { schema });
    return {
      db,
      migrate: () =>
        postgresMigrate(db, { migrationsFolder: path.resolve("drizzle") }),
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

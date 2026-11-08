import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { sql } from "drizzle-orm";
import type { Database } from "./connection";

export function migrationManifest(folder = path.resolve("drizzle")) {
  const journal = JSON.parse(
    readFileSync(path.join(folder, "meta/_journal.json"), "utf8"),
  ) as {
    entries: { idx: number; when: number; tag: string }[];
  };
  if (
    !journal.entries.length ||
    journal.entries.some(
      (entry, index) =>
        entry.idx !== index ||
        !entry.tag.startsWith(String(index).padStart(4, "0") + "_") ||
        (index > 0 && entry.when <= journal.entries[index - 1].when),
    )
  )
    throw new Error("Migration journal ordering is invalid.");
  const files = readdirSync(folder)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (
    JSON.stringify(files) !==
    JSON.stringify(journal.entries.map((e) => e.tag + ".sql"))
  )
    throw new Error("Migration SQL files and journal do not match.");
  const migrations = readMigrationFiles({ migrationsFolder: folder });
  return migrations.map((migration, index) => ({
    tag: journal.entries[index].tag,
    hash: migration.hash,
    timestamp: migration.folderMillis,
  }));
}

export async function assertDatabaseReady(db: Database) {
  const expected = migrationManifest();
  const result = await db.execute(
    sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at`,
  );
  const rows = result.rows as { hash: string; created_at: string | number }[];
  if (
    rows.length !== expected.length ||
    expected.some(
      (entry, i) =>
        rows[i].hash !== entry.hash ||
        Number(rows[i].created_at) !== entry.timestamp,
    )
  )
    throw new Error(
      "Database migration checkpoint does not match this release.",
    );
}

export async function readinessResponse(check: () => Promise<void>) {
  try {
    await check();
    return Response.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

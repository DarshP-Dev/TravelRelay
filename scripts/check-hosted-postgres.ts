import { sql } from "drizzle-orm";
import { openDatabase } from "../src/server/db/connection";
import { validateHostedDatabaseUrl } from "../src/server/deployment-config";
import { databaseContract } from "../tests/helpers/database-contract";

// Deliberately do not load .env.local or use DATABASE_URL/DIRECT_URL. This
// destructive fixture check is ONLY for an explicitly approved disposable DB.
if (!process.argv.includes("--approved-disposable-target")) {
  console.error(
    "Approval required: provide an isolated disposable PostgreSQL target and --approved-disposable-target.",
  );
  process.exitCode = 1;
} else {
  try {
    const url = process.env.POSTGRES_TEST_DIRECT_URL;
    validateHostedDatabaseUrl(url, "POSTGRES_TEST_DIRECT_URL");
    // Block all outbound model/PayPal/FX transports, including fixture mistakes.
    globalThis.fetch = async () => {
      throw Error("External API requests are disabled in database validation.");
    };
    const probe = await openDatabase({ url });
    try {
      const exists = (
        await probe.db.execute(sql`select to_regclass('public.user') as name`)
      ).rows[0].name;
      if (
        exists &&
        Number(
          (await probe.db.execute(sql`select count(*) as count from "user"`))
            .rows[0].count,
        )
      )
        throw Error(
          "The target already contains accounts; use an empty disposable database.",
        );
    } finally {
      await probe.close();
    }
    console.log(JSON.stringify(await databaseContract("", url)));
  } catch {
    console.error(
      "Disposable PostgreSQL validation failed. Connection details were withheld; inspect privately. Do not retry against another target without approval.",
    );
    process.exitCode = 1;
  }
}

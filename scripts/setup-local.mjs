import { randomBytes } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
try {
  await access(".env.local");
  console.log(
    "Existing .env.local preserved. Check the configuration names in .env.example.",
  );
} catch {
  await writeFile(
    ".env.local",
    `APP_URL=http://localhost:3000\nAUTH_SECRET=${randomBytes(32).toString("base64url")}\nDATABASE_DRIVER=pglite\nLOCAL_DATABASE_PATH=.data/travelrelay\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Created ignored local configuration with a generated secret. No values printed.",
  );
}

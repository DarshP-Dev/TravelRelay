// Local/CI credential boundary check. Values are read in memory, never printed.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8" }).split("\0").filter(Boolean);
const tracked = git("ls-files", "-z");
const files = new Set(
  [
    ...tracked,
    ...git("ls-files", "--others", "--exclude-standard", "-z"),
  ].filter(
    (file) =>
      /\.(?:[cm]?[jt]sx?|md|sql|json|css|ya?ml)$/.test(file) ||
      file === ".env.example",
  ),
);
const privatePath =
  /(^|\/)(?:\.env(?:\..*)?|\.data|\.test-data|credentials[^/]*\.json|service-account[^/]*\.json)(?:\/|$)|\.(?:pem|p12|pfx|key|dump|sqlite3?)$/;
let violations = tracked.filter(
  (file) => file !== ".env.example" && privatePath.test(file),
).length;
const values = [];
for (const file of [".env.local", ".env.production.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match =
      /^([A-Z0-9_]*(?:SECRET|API_KEY|DATABASE_URL|DIRECT_URL|WEBHOOK_ID))\s*=\s*(.*)$/.exec(
        line,
      );
    const value = match?.[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value && value.length >= 8) values.push(value);
  }
}
const assets = existsSync(".next/static")
  ? readdirSync(".next/static", { recursive: true })
      .map((name) => path.join(".next/static", String(name)))
      .filter((file) => /\.(?:js|css|map)$/.test(file))
  : [];
for (const file of assets) files.add(file);
const signature =
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk-(?:proj-)?[A-Za-z0-9_-]{30,}|AIza[0-9A-Za-z_-]{35}/;
for (const file of files) {
  if (!existsSync(file) || !statSync(file).isFile()) continue;
  const content = readFileSync(file, "utf8");
  if (
    values.some((value) => content.includes(value)) ||
    signature.test(content)
  )
    violations++;
  if (
    assets.includes(file) &&
    /PAYPAL_CLIENT_SECRET|PAYPAL_WEBHOOK_ID|GOOGLE_PLACES_API_KEY|offline-bearer-fixture/.test(
      content,
    )
  )
    violations++;
}
console.log(
  JSON.stringify({
    checkedFiles: files.size,
    productionClientAssets: assets.length,
    violations,
  }),
);
if (violations) process.exitCode = 1;

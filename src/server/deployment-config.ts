// Shared by runtime and the non-networked deployment preflight. Never include
// environment values in errors: hosts can expose startup logs to operators.
type Environment = Record<string, string | undefined>;
export function runtimeConfiguration(env: Environment) {
  const secret = env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error(
      "Configure AUTH_SECRET with at least 32 random characters.",
    );
  let origin: URL;
  try {
    origin = new URL(env.APP_URL ?? "");
  } catch {
    throw new Error("Configure APP_URL as an exact HTTP(S) origin.");
  }
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  )
    throw new Error("Configure APP_URL as an exact HTTP(S) origin.");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    origin.hostname,
  );
  const production = env.NODE_ENV === "production";
  const localPreview =
    production && loopback && env.ALLOW_LOCAL_DATABASE === "true";
  if (production && !localPreview) {
    if (
      /(?:^|\s)(?:--import|--require|-r)(?:=|\s)/.test(env.NODE_OPTIONS ?? "")
    )
      throw new Error("Custom preloaders are forbidden in the hosted runtime.");
    if (
      Object.keys(env).some(
        (key) =>
          /^NEXT_PUBLIC_.*(SECRET|API_KEY|DATABASE|DIRECT_URL|WEBHOOK_ID)/.test(
            key,
          ) && env[key],
      )
    )
      throw new Error(
        "Private credentials cannot use NEXT_PUBLIC_ environment variables.",
      );
    if (origin.protocol !== "https:")
      throw new Error("Hosted production requires HTTPS.");
    if (env.ALLOW_LOCAL_DATABASE === "true" || env.DATABASE_DRIVER === "pglite")
      throw new Error(
        "Local database overrides are forbidden on a public production origin.",
      );
    if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0")
      throw new Error("TLS certificate verification must remain enabled.");
    if (
      Object.keys(env).some(
        (key) => /^TRAVELRELAY_.*_QA$/.test(key) && env[key] === "true",
      )
    )
      throw new Error("QA transports are forbidden in hosted production.");
    validateHostedDatabaseUrl(env.DATABASE_URL, "DATABASE_URL");
    if (env.DIRECT_URL) validateHostedDatabaseUrl(env.DIRECT_URL, "DIRECT_URL");
    if (env.PAYPAL_ENVIRONMENT && env.PAYPAL_ENVIRONMENT !== "sandbox")
      throw new Error("TravelRelay permits PayPal Sandbox only.");
    if (
      (env.ENABLE_DEMO_MERCHANT === "true" ||
        env.ENABLE_RECOVERY_SIMULATION === "true") &&
      env.PAYPAL_ENVIRONMENT !== "sandbox"
    )
      throw new Error(
        "Demo checkout and recovery simulation require explicit Sandbox configuration.",
      );
  }
  if (!env.DATABASE_URL && env.DATABASE_DRIVER !== "pglite")
    throw new Error(
      "Configure DATABASE_URL or explicitly select local PGlite.",
    );
  if (production && !env.DATABASE_URL && !localPreview)
    throw new Error("Hosted production requires PostgreSQL.");
  return { secret, origin: origin.origin, localPreview };
}

export function validateHostedDatabaseUrl(
  value: string | undefined,
  name: string,
) {
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error(`Configure ${name} as a TLS PostgreSQL connection.`);
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.password ||
    url.pathname.length < 2 ||
    url.searchParams.getAll("sslmode").length !== 1 ||
    url.searchParams.get("sslmode") !== "verify-full" ||
    url.searchParams.get("ssl") === "false"
  )
    throw new Error(
      `Configure ${name} with PostgreSQL credentials and sslmode=verify-full.`,
    );
}

# Milestone 6B — Vercel Hobby deployment preparation

**Target: Vercel Hobby + Fluid Compute + Node.js 24 + Neon Free.** This replaces
the proposed paid Render setup. The native Next.js build is prepared locally.
Hobby eligibility and the first hosted build remain approval gates. Nothing has
been deployed, provisioned, pushed, or migrated on a hosted database.

## Eligibility and free resource limits

Provider documentation checked November 9, 2026.

Vercel [Hobby](https://vercel.com/docs/plans/hobby) restricts use to personal,
non-commercial projects. The [Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines)
describe financial gain and requesting or processing visitor payments as commercial
examples. TravelRelay's merchant accepts only Sandbox test funds, never real money,
and the proposed demo has no monetization. Those facts support the non-commercial
interpretation; the published policy does not explicitly clear this prize-bearing
hackathon or its Sandbox checkout. Obtain a Vercel eligibility answer describing
the competition, possible prize, team arrangement and exact Sandbox flow before
publishing. No support request was sent and no exception is assumed. See also
[Vercel's terms](https://vercel.com/legal/terms).

Hobby cannot import a repository owned by a Git organization. The GitHub API
returned a personal user owner for `DarshP-Dev/TravelRelay`. This satisfies that
particular constraint; use the matching personal Vercel account and ensure commit
author identity is linked. It does not establish eligibility for this use case.
[Vercel account and build limits](https://vercel.com/docs/limits).

| Resource                   | Free allowance / relevant limit                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Vercel Fluid Compute       | 4 active CPU hours, 360 GB-hours memory and 1 million invocations included                                              |
| Vercel Node function       | 2 GB RAM; 300-second Hobby ceiling with Fluid; 4.5 MB request/non-streamed response; 250 MB gzip package ceiling        |
| Vercel transfer and images | 100 GB fast data transfer, 10 GB origin transfer, 5,000 image transformations included                                  |
| Vercel build and grouping  | 45 minutes per build, one concurrent build; native Next.js bundles routes, with a Hobby limit of 12 resulting functions |
| Neon Free                  | 100 CU-hours, 1 GB storage and 5 GB public transfer per project, per-month compute/transfer allowances                  |
| Neon Free idle/restore     | Suspends after five idle minutes; six-hour restore history within its change limit; one manual snapshot                 |

Sources: [Hobby allowances](https://vercel.com/docs/plans/hobby),
[function limits](https://vercel.com/docs/functions/limitations),
[native function grouping](https://vercel.com/docs/functions/runtimes),
[Neon plan limits](https://neon.com/docs/introduction/plans). Check actual remaining
allowances in both accounts before judging. Next routes are not one-to-one with
Vercel Functions. The local trace check is evidence about input packages and
duration classes; verify the final native bundle count and sizes on Vercel.

Target hosting cost is **USD 0** while eligible and within included limits. Do not
enable a trial, paid upgrade, automatic overages, extra managed service or paid
Neon integration to keep the demo running. Free limits can pause the site/database.
Keep polling to the existing active-job behavior. Avoid synthetic warmers or
frequent `/api/health` monitoring: they can keep Neon active and spend free compute.
The first request after idle can be slower. Existing model API accounts have separate
quotas, credits and possible charges; free hosting does not make GPT-6.1 Sol free.
Keep shared generation caps small for the judging window and monitor usage. The
labeled `/example-trip` remains available independently of model generation.

## Native build and background execution

`vercel.json` selects native Next.js, enables Fluid, installs with
`npm ci --include=dev`, and disables automatic Git deployments. No Render start
command, persistent disk, migration hook, static export or separate worker is
needed. `package.json` pins `24.x`. Use the dashboard's Next.js preset and leave
the output directory at the framework default. Do not override the checked-in
build command or disable Fluid in the project settings.

The build runs the **configuration-only** `npm run deploy:check -- --vercel`,
`npm run build -- --webpack`, and `npm run deploy:verify`. It does not connect to
PostgreSQL, apply migrations, contact AI, or make PayPal calls. The last step checks
Next's generated route durations, traced files, health migration assets and a
conservative raw trace-size budget. `vercel.json` does not override `functions`
durations: native App Router `maxDuration` exports are authoritative.

| Route                                                                      | Duration  |
| -------------------------------------------------------------------------- | --------- |
| `/api/trips/[id]/generation`, `/assistant`, `/recovery` (same trip prefix) | 240s each |
| `/api/trips/[id]/commerce`, `/api/paypal/webhook`                          | 60s each  |
| `/api/health`, `/api/trips/[id]/wallet`                                    | 30s each  |

Next `after()` registers work with Vercel's request lifetime support. The 240s
budget covers the entire invocation including post-response work; it is not an
extra 240s after sending the response. Keep the existing 150s provider deadline,
180s shared SQL lease, five-minute stale recovery, explicit retries, owner checks,
and no automatic fallback. A suspended or killed invocation can lose a provider
result. The saved job is recoverable; this is not a durable queue or a shutdown
grace-period guarantee. Polling never contacts a model.
[Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration),
[Next `after()` on Vercel](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package),
[worker runbook](generation-hosting.md).

## Database and migrations

Production requires the Neon **pooled** `DATABASE_URL` (`-pooler` host in
`.neon.tech`) with `sslmode=verify-full`. Match Vercel's function region to Neon;
for example, Vercel `iad1` with Neon AWS US East (N. Virginia) if both are available
to the chosen accounts. Use a restricted runtime role and a separate migration
role. Pool sizing is five connections **per warm instance**, not per project;
connection and query deadlines remain 10s and 20s. Fluid uses Vercel's pool lifecycle
hook and a 1s idle timeout so idle client sockets can close before suspension.
Neon's pooler limits backend connections; verify actual scaling/idle behavior
on the host. [Vercel pooling guidance](https://vercel.com/kb/guide/connection-pooling-with-functions),
[Neon connection pooling](https://neon.com/docs/connect/connection-pooling).

All twelve migrations `0000`–`0011` are unchanged. Run migrations **manually**
after separate target approval, from the same release SHA with identical SQL
bytes. Use a Linux checkout or otherwise preserve Git's LF SQL bytes so readiness
checks agree across environments. The existing migrator uses an unpooled
`DIRECT_URL` with TLS verification and a session advisory lock. Never upload
`DIRECT_URL`, `POSTGRES_TEST_DIRECT_URL` or migration/admin credentials to Vercel.
Do not add a migration command to a build or route.

Before migrating the demo database, approve an empty disposable Neon target and
provide `POSTGRES_TEST_DIRECT_URL` privately to a local process. Then run
`npm run test:postgres -- --approved-disposable-target`. This existing harness
blocks provider fetches, refuses populated account tables and validates migrations,
transactions, concurrent writes, owner checks and immutable history. It was not
run against Neon during 6B. Repeat migration, restore and pooler checks on an
approved target. Preserve the actual local `.data`/QA database and all evidence.

The runtime role needs connection, schema usage, public table DML, sequences and
read access to `drizzle.__drizzle_migrations`. Do not grant schema ownership,
superuser or DDL. Preserve immutable-ledger triggers. Free uses public TLS;
do not assume private networking, IP allowlists or a fixed Vercel egress IP.

## Protected environment checklist

Set these in **Project Settings → Environment Variables** for the approved target.
Use Sensitive values for secrets. Set Production independently; an approved Preview
needs its own database, credentials and exact origin. Do not pull production secrets
into the existing development `.env.local`, and do not use `NEXT_PUBLIC_` for any
secret. Enable automatic Vercel system environment variables so runtime can recognize
`VERCEL=1` and use the Fluid pool lifecycle and trusted forwarded IP.

| Variable(s)                                                                            | Value or purpose                                                                                            |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `APP_URL`                                                                              | Exact assigned canonical HTTPS origin, e.g. `https://<project>.vercel.app`; no path/query                   |
| `AUTH_SECRET`                                                                          | Stable random server secret, at least 32 characters; do not regenerate on deploy                            |
| `DATABASE_URL`                                                                         | Restricted Neon pooled PostgreSQL TLS URL                                                                   |
| `AI_PROVIDER`, `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`, `OPENAI_API_KEY`             | `openai`, `gpt-6.1-sol`, `medium`, existing server key                                                      |
| `GEMINI_MODEL`, `GEMINI_API_KEY`                                                       | `gemini-3.5-flash-lite`, optional server backup; switch explicitly to `AI_PROVIDER=gemini` only by decision |
| `GENERATION_GLOBAL_RPM`, `GENERATION_GLOBAL_RPD`, `GENERATION_USER_HOURLY_LIMIT`       | Optional existing limits (defaults 2/minute, 20/Pacific day, 6/user/hour); choose a smaller cap if needed   |
| `PAYPAL_ENVIRONMENT`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_ID` | `sandbox` and matching verified Business Sandbox application credentials                                    |
| `ENABLE_DEMO_MERCHANT`, `ENABLE_RECOVERY_SIMULATION`                                   | Enable explicitly after approval for the Sandbox demo; default off                                          |
| `PAYPAL_WEBHOOK_ID`                                                                    | Same REST app's Webhook ID after separately authorized registration                                         |
| `NEXT_TELEMETRY_DISABLED`                                                              | `1` recommended                                                                                             |

Leave `DIRECT_URL`, `POSTGRES_TEST_DIRECT_URL`, `DATABASE_DRIVER`,
`LOCAL_DATABASE_PATH`, `ALLOW_LOCAL_DATABASE`, custom preloaders and QA flags
unset on Vercel. Do not attach an integration that imports a broader admin role.
`.env.example` has no secrets. `.vercelignore`, Git ignore and Next trace rules
exclude local environments, databases and private test evidence. Builds must
come from a clean release checkout without user evidence or `.env.local`.

## Authentication and PayPal on the canonical origin

Use one canonical host for users, callbacks and webhooks; configure `APP_URL`
before the first build and sign-in. No broad preview-origin allowlist is used.
Better Auth uses HTTPS Secure/HttpOnly/SameSite cookies and on Vercel reads its
platform-forwarded client IP header. Verify header spoofing, cookie handling and
owner-scoped reads on the actual URL. Keep previews protected or uncreated; do
not point PayPal to a deployment that requires Vercel login. Existing email
verification and account-recovery limitations remain.
[Vercel request headers](https://vercel.com/docs/headers/request-headers).

PayPal JS SDK v6 uses its Sandbox script and public client ID in the browser.
The same-origin Node commerce route holds credentials and handles capture/refund.
The public signed POST remains `https://<approved-host>/api/paypal/webhook`.
Keep the transmission headers/body intact; do not put the route behind auth,
redirects, a CAPTCHA or a generic HTML challenge. A 64 KiB body and shared SQL
admission limit remain in force. Do not rely on in-process state for idempotency.
Register the subscriptions in [paypal-sandbox.md](paypal-sandbox.md) only after
approval. Postback verification needs app-owned signed events; PayPal's mock
simulator is not proof of this method. Hosted SDK approval, capture/refunds and
signed delivery remain unverified. No PayPal request was made for 6B.
[PayPal SDK v6](https://developer.paypal.com/sdk/js/set-up/),
[PayPal webhook signing](https://developer.paypal.com/api/rest/webhooks/rest/).

## Manual launch sequence — approval required before each external step

1. Confirm Vercel Hobby eligibility for the actual entry. Agree to stay on Hobby
   and Neon Free; if eligibility or quotas fail, stop. Approve the branch push
   separately if GitHub will be used for the release. Do not import a repo in a
   flow that automatically deploys while still preparing credentials.
2. After approval, create/select an empty Neon Free demo target and an isolated
   disposable test target. Run the approved test migration/contract and restore
   drill. Back up the intended demo target and apply `npm run db:migrate` manually
   in a clean migration checkout that preserves release SQL bytes (a `git archive`
   export works). Supply the approved `DIRECT_URL` and matching `DATABASE_URL`
   in the local process environment, never in arguments or committed files.
   Grant the separate runtime role's permissions and verify all 12 hashes and
   timestamps before release.
3. After project-setup approval, link a clean checkout of the reviewed commit to
   a personal Hobby project. If using the CLI, `npx vercel login` and `npx vercel
link` are explicit setup steps; linking can create a project, so do not run it
   before approval. This avoids the one-click import-and-deploy flow. Check the
   assigned `.vercel.app` production domain in project settings before setting
   `APP_URL`. Set Next.js, Node 24.x, Fluid, nearby function region and the
   protected Production variables above. Keep automatic Git deploys off.
4. After explicit deployment approval, run `npx vercel deploy --prod` from that
   clean checkout (or manually deploy the exact SHA through the approved project).
   Do not send local QA evidence; the command uploads source and creates a public
   deployment. Validate logs for Node 24, successful preflight, 240s route limits,
   final function count/package size and absence of private files. Verify
   `/api/health`, public example, HTTPS login, ownership, cookies, pool cold start,
   and non-transactional application smoke. Use an isolated hosted test with mock
   provider transports to validate `after()` through the function window; never
   enable QA preloaders in the public project. No live request is authorized here.
5. Separately approve any signed Sandbox webhook registration, SDK/browser
   network acceptance and one-use model/payment tests. Publish the canonical
   judge URL only after required acceptance. Judges use normal TravelRelay login
   and a Sandbox buyer login for checkout, without needing any API credentials.

## Backup and rollback

Keep an encrypted managed snapshot and independent logical backup where appropriate
within the free plan. Use `pg_dump`/`pg_restore` with a private service/password
file; do not include connection strings in command history. Restore only into an
approved separate target and check ownership and ledger counts before switching.
Record the release SHA, schema checkpoint and recovery time. Vercel Hobby permits
rollback to the previous production deployment; use a schema-compatible release
without undoing financial history. If restoring database state, stop writes,
preserve the original database and reconcile provider events since backup before
switching. Never resend uncertain writes or interrupted model requests blindly.

See [Milestone 6B validation](milestone-6b-validation.md) for what was verified
locally and what remains host-dependent.

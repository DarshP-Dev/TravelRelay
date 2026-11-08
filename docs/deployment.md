# Milestone 6A — deployment preparation

Prepared on November 8, 2026. No resources have been purchased, provisioned,
migrated remotely or deployed. No live AI or PayPal request is part of this work.
See [validation and approval gates](milestone-6a-validation.md).

## Recommended architecture and cost envelope

Use one always-on **Render Node web service**, initially **1 CPU / 2 GB RAM**
(`1c-2g`), and **Neon PostgreSQL** in a nearby approved region. Keep the existing
single Next.js application: no Redis, separate worker, local persistent disk or
new service is necessary for this hackathon's recoverable execution contract.
`render.yaml` prepares this topology, disables automatic deploys, and defaults
merchant/simulation features to off until their Sandbox configuration is approved.
Importing a Blueprint creates resources: do not do it before approval.

The selected [Render compute plan](https://render.com/docs/compute-plans) provides
more memory headroom than the 512 MB option for Next.js, authentication, scheduling
and validation. Budget approximately **USD 25/month for the web service** as a
planning allowance; confirm the actual account/region quote on
[Render pricing](https://render.com/pricing) before purchase. It is not a verified
checkout price. Neon Free currently advertises 100 CU-hours/project/month and
1 GB storage; Launch is usage-priced, with a displayed typical USD 15/month,
not a fixed bill. See [Neon pricing](https://neon.com/pricing).
Plan a USD 25–40/month infrastructure envelope before tax, usage overages,
backup storage and separately metered AI. No free-tier guarantee is made.

Render Free sleeps after 15 minutes of inactivity and can take about a minute
to wake; it is unsuitable for dependable judging or background execution.
See [free-service limitations](https://render.com/docs/free). Health checks that
query Neon keep its compute active: continuous 0.25-CU operation can consume
about 180 CU-hours in a 30-day month, exceeding its 100-CU-hour free allowance.
Choose the judging window and database budget explicitly; do not evade sleeping
policies with synthetic traffic. Set provider billing alerts separately.

Vercel Node Fluid Compute is a viable alternative: current documented default
duration is 300 seconds, so it should not be dismissed as categorically too short.
Its actual project settings, `after()` lifetime, shared PostgreSQL connections,
usage billing and termination behavior still need acceptance. A static export or
Edge-only deployment cannot run this application. Render is the simpler initial
choice for the existing `next start` execution model.
[Vercel limits](https://vercel.com/docs/functions/limitations).

## Build, readiness and shutdown

The proposed service runs Node 24 and:

```text
Build:      npm ci --include=dev && npm run build -- --webpack
Pre-deploy: npm run deploy:check && npm run db:migrate
Start:      exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port $PORT
Health:     GET /api/health
```

The `exec` start form gives Next the platform signal directly. No QA preloader
or live acceptance harness belongs in these commands. No migration occurs during
the build. Render paid services support a separate pre-deploy command; migrations
must be compatible with the old instance while it drains. The readiness endpoint
returns only `ready` or a sanitized `503 unavailable`, is uncached, and checks
the exact twelve migration hashes/timestamps through `0011`. It exposes no account,
provider or database details. It never invokes a model or PayPal.

`maxShutdownDelaySeconds: 300` exceeds the 240-second route contract. Render
normally sends SIGTERM and later SIGKILL; its default 30-second delay is too short.
The [official deploy guide](https://render.com/docs/deploys) permits up to 300
seconds without a persistent disk. The installed Next 16.4.5 self-hosting guide
documents waiting for `after()` work on SIGTERM/SIGINT. The actual Render signal,
network routing, memory consumption and full-duration drain remain host gates.
Local Windows verification uses an explicitly labeled IPC bridge into Next's
installed SIGTERM handler; it is not evidence of Linux signal delivery.

See [generation-hosting.md](generation-hosting.md) for provider deadlines,
shared leases, termination tests and explicit recovery. Crash recovery is durable
application state, **not guaranteed completion of the provider request**.

## PostgreSQL, migration and disposable validation

Application `DATABASE_URL` uses Neon's pooled endpoint; migration `DIRECT_URL`
uses its direct/unpooled endpoint. Both use `sslmode=verify-full` and trusted
certificate roots; never disable certificate verification. Keep transaction
pooling restrictions in mind: the migration advisory lock deliberately uses one
dedicated direct client, not the runtime pooled endpoint.
[Neon pooling](https://neon.com/docs/connect/connection-pooling).

The application pool is bounded to five connections per process, a 10-second
connection deadline, 30-second idle expiry and 20-second query deadline. Idle
disconnect diagnostics are sanitized. Account for both old/new instances during
deploys and other database clients. The shared quota remains in PostgreSQL.

All twelve committed migrations `0000`–`0011` are present in order. Their SQL and
journal are checked before applying; the PostgreSQL migrator holds a session
advisory lock to serialize deploy migrations. A successful migration is followed
by exact checkpoint verification. No existing migrations were edited, and no
`0012` schema migration is required. Apply migrations from the same Linux Git
checkout used for the release so recorded hashes use identical file bytes.

Hosted testing is intentionally not automatic:

1. Approve a specifically identified **empty disposable Neon branch/database**,
   account, region and cost limit. Never use the historical local QA database,
   a production branch or a database containing real accounts/payments.
2. Configure its direct TLS URL in the private process environment variable
   `POSTGRES_TEST_DIRECT_URL`. Do not paste it into chat or a command transcript.
3. After target approval, run:

   ```text
   npm run test:postgres -- --approved-disposable-target
   ```

4. The harness never loads `.env.local` or uses `DATABASE_URL`/`DIRECT_URL` as
   fallbacks. It refuses an existing populated account table, applies migrations,
   imports the recorded offline Paris fixture with fresh ownership, checks
   transactions, optimistic concurrency, owner denial, immutable/unique financial
   events and repeat migration preservation. All API fetches are blocked. It leaves
   explicitly test-only records in the disposable target; retire the target only
   after review. No target was connected or migrated in Milestone 6A.
5. Verify a fresh database connection/login and restore drill on that target
   before approving the production database migration. PGlite contract tests are
   useful compatibility evidence, not a substitute for real node-postgres/TLS,
   role permissions, pooling or managed-service acceptance.

Use distinct migration/admin and runtime roles. The runtime role needs table
DML, schema usage, relevant sequences and SELECT on the migration checkpoint,
not schema ownership or DDL. Preserve all immutable-history triggers and composite
owner constraints. Restrict network access using the chosen service's available
controls; confirm any plan-dependent IP allowlist rather than assuming one exists.

## Backups and rollback

Before schema changes, take an encrypted managed backup/branch and an independent
logical backup. Record the release SHA, migration checkpoint, backup time and
restore target privately. Confirm the account's actual point-in-time retention;
free plans have limited restore windows and are not a backup policy.

Use PostgreSQL tools with a privately configured service/password file, for example
`pg_dump --format=custom --file=<private-backup-file> --dbname=service=travelrelay-admin`.
Keep the service credentials, dump and evidence out of Git and public logs. Restore
only into an approved isolated target using `pg_restore --exit-on-error`, validate
constraints/audit counts and fresh authentication, and document measured recovery
time. Schedule backups outside the app; none were provisioned here.

Disable automatic deploys. Prefer rolling back application code to the last
schema-compatible SHA without rolling back financial data. Never drop migrations
or rewrite ledger history to undo a release. If database restore is necessary,
stop writes, preserve the failing database, restore to a new target, and reconcile
all provider events since the backup before switching traffic. A backup predating
a capture/refund cannot safely become authoritative without that reconciliation.
Do not blindly resend unresolved financial writes or interrupted model requests.

## Environment checklist

Store real values only in Render's protected server environment. The checked-in
example has placeholders and non-secret defaults. Build artifacts must come from
a clean Git checkout: no `.env.local`, `.env.production.local`, `.data`, `.test-data`,
private dumps, screenshots/evidence, `NODE_OPTIONS` QA imports or test flags.
`deploy:check` rejects these local data/configuration directories and public QA
configuration. Private credentials using `NEXT_PUBLIC_` are forbidden.

| Variables                                                                        | Requirement                                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `NODE_ENV`, `NODE_VERSION`                                                       | `production`, Node 24                                                                      |
| `APP_URL`                                                                        | Exact approved HTTPS origin; no path, query or embedded credentials                        |
| `AUTH_SECRET`                                                                    | Stable random server secret, at least 32 characters; back up securely                      |
| `DATABASE_URL`, `DIRECT_URL`                                                     | Pooled runtime / direct migration URLs, PostgreSQL + `sslmode=verify-full`                 |
| `DATABASE_DRIVER`, `LOCAL_DATABASE_PATH`, `ALLOW_LOCAL_DATABASE`                 | Unset in hosted production; PGlite overrides only work for explicit loopback QA            |
| `AI_PROVIDER`, `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`                         | `openai`, `gpt-6.1-sol`, `medium`                                                          |
| `OPENAI_API_KEY`                                                                 | Server-only primary key; no model call in build or health                                  |
| `GEMINI_API_KEY`, `GEMINI_MODEL`                                                 | Optional manual backup, `gemini-3.5-flash-lite`; no automatic fallback                     |
| `GENERATION_GLOBAL_RPM`, `GENERATION_GLOBAL_RPD`, `GENERATION_USER_HOURLY_LIMIT` | Shared defaults 2/minute, 20/Pacific day, 6/user/hour; set appropriate approved limits     |
| `PAYPAL_ENVIRONMENT`                                                             | `sandbox`; Live is rejected                                                                |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_ID`                 | Matching verified Business Sandbox REST app/account; only public client ID reaches browser |
| `ENABLE_DEMO_MERCHANT`                                                           | Explicit `true` only after Sandbox setup approval                                          |
| `ENABLE_RECOVERY_SIMULATION`                                                     | Explicit `true` only for the approved Sandbox demo; remains labeled simulated              |
| `PAYPAL_WEBHOOK_ID`                                                              | Same app's registered webhook ID, after separate registration approval                     |
| `NEXT_TELEMETRY_DISABLED`                                                        | `1` recommended                                                                            |

`AUTH_GOOGLE_*` are not connected. `MODEL_NAME` is a legacy Gemini alias; prefer
the explicit current model variables. Sandbox buyer passwords never belong in
the app environment. Judges use the deployed site's configured APIs and normal
TravelRelay login, with separate Sandbox buyer login inside PayPal for purchases.

## Public endpoint and security acceptance

Set the exact public origin before authentication. Better Auth uses its existing
HttpOnly/SameSite=Lax sessions with Secure cookies for HTTPS. Mutations require
that origin; no permissive CORS allowlist is introduced. Verify redirects,
cross-origin rejection, cookie flags and authenticated owner isolation on the
real HTTPS hostname before sharing it. A stale session must not expose private data.

The application adds nosniff, same-origin framing, restricted device permissions
and strict-origin referrer headers. Keep Render TLS termination/HSTS and edge
protection enabled. No restrictive CSP that could silently break PayPal SDK v6
is invented here; a CSP rollout needs testing against the actual SDK resources.
The auth library's database rate limits and user/project model/payment quotas
remain enabled. Render documents `x-forwarded-for` for client addresses; confirm
that spoofed forwarding headers cannot bypass auth throttles on the actual host.
Do not rely on local proxy tests as proof of the host's header sanitization.

The public webhook has a shared SQL bucket of at most 120 verification admissions
per minute, independent of caller-supplied IPs. Existing bounded 64 KiB body,
signature checks, provider resource reads and unique event references remain.
429 responses leave delivery retryable. Apply edge/body/slow-client rate limits
as well: an application bucket cannot prevent bandwidth exhaustion or deliberate
starvation. Health is uncached and provider-free; protect it at the edge too.
Errors do not return raw driver or provider bodies. Never log full prompts,
session cookies, authorization headers, connection strings or private evidence.

Email verification, password reset, OAuth and MFA are still absent; public
production security is not claimed as complete just because local checks pass.
Agree judge access, account recovery/support and abuse limits before launch.

## Webhook readiness and separate live acceptance

Endpoint: `POST https://<approved-origin>/api/paypal/webhook`, HTTPS port 443.
The exact subscriptions are in [paypal-sandbox.md](paypal-sandbox.md).
The existing adapter uses PayPal's **postback verification API**, supplying the
unchanged parsed event, configured Webhook ID and five transmission headers to
the fixed Sandbox verification endpoint. It does not implement local CRC32/RSA
verification. Raw bytes would be mandatory for that alternative; no claim is
made that parsing then reserializing reproduces a CRC32 signature.

Preserve original body semantics and all `paypal-transmission-*`, `paypal-cert-url`
and `paypal-auth-algo` headers at the proxy. The adapter validates header shapes,
algorithm and a fixed Sandbox certificate URL before contacting PayPal. Only a
`SUCCESS` verification proceeds. Reconciliation fetches authoritative order,
capture and refund data; payload amounts/statuses cannot establish payments.
Repeated events deduplicate and out-of-order events cannot downgrade completed
financial history. Unresolved/external financial changes remain operator-review
states, not invented traveler approvals.

After separately approving one registration, subscribe the same merchant's
Sandbox REST app, copy its returned Webhook ID into protected settings and test
real signed delivery. PayPal's mock webhook simulator does **not** support this
postback method; simulator success cannot substitute for an app-owned signed
event. Live transactions and registration each need their own authorization.
[PayPal webhook verification](https://developer.paypal.com/api/rest/webhooks/rest/).

## Approval sequence to reach public deployment

1. Review this local commit; approve pushing this feature branch.
2. Approve the Render account, region, paid plan/cost cap, Neon account and an
   isolated disposable test target; configure its credentials privately.
3. Approve running the disposable hosted migration/contract/restore checks.
4. Approve the intended production database/roles, HTTPS hostname, secure
   environment and demo flags; approve migration and first deployment explicitly.
5. On the host, use only simulated transports in an isolated acceptance environment
   to verify >response background work, full-duration drain/restart, stale recovery,
   quotas, HTTPS/auth, health, SDK/browser behavior and database restoration.
6. Separately approve webhook registration and any limited signed-Sandbox or model
   acceptance requests. Reconcile actual results before opening judge access.

No approval for these future actions is inferred from preparation of this file.

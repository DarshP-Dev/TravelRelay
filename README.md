# TravelRelay

An editorial travel planning workspace for the PayPal AI Hackathon.

**Milestone 6B — free-tier deployment preparation.** The preferred setup is
Vercel Hobby with Fluid Compute, Node.js 24 and Neon PostgreSQL Free, subject to
Hobby eligibility and hosted acceptance. The native build checks traced migration
assets and the unchanged 240-second AI routes. No host/database was provisioned
and nothing was deployed. See [deployment, free limits and approval gates](docs/deployment.md)
and [the Vercel validation report](docs/milestone-6b-validation.md).
Judges will use the approved HTTPS demo URL after deployment; no public URL or
shared credentials are available yet. The existing `/example-trip` remains the
clearly labeled provider-free public example.

**Current scope: Milestone 5 — Trip Recovery.** Open **Recovery** from a saved
trip, Bookings, or Ask TravelRelay. With the Sandbox simulation flag enabled,
record a clearly labeled cancellation on a demo booking with a verified
capture. Compare AI alternatives and their schedule and budget impact, then
approve an itinerary edit. Refunds and optional replacement demo checkout
each have their own review in Bookings. See the
[recovery architecture and acceptance plan](docs/trip-recovery.md).

**Retained Milestone 4B: PayPal Sandbox checkout, verified payments, and refunds.**
Open a saved trip's **TripWallet** tab for reconciled planning allocations,
itemized estimates, additional allowances, separate reserve/unallocated funds,
category visuals and distinct confirmed/pending/refund history. **Bookings** shows
persisted planning references with honest unbooked status, source dates and native
amounts, plus verified Sandbox checkout and refund history. A Sandbox payment
never represents a real supplier reservation.

Choose an activity and enter its original group amount/currency to **Preview rate
& budget consequences**. The server uses Frankfurter v2/ECB daily references,
exact minor-unit rounding and the existing editor. **Save reference & activity
estimate** atomically updates the shared plan and retains its original FX snapshot.
Overruns and stale rates need separate acknowledgement. Closing a never-paid
planning reference requires confirmation and does not refund or undo anything.
Local-currency preference overrides do not change the trip currency or history.

To try the Sandbox flow after configuration, save a fresh **USD 5.00** planning
quote on an itinerary activity. Open **Bookings** or **TripWallet**, review the
Sandbox demonstration price, and explicitly continue to PayPal. Use a Sandbox
buyer account. Back in TravelRelay, check the verified status and original
charge. From that record, review and confirm a full or partial Sandbox refund.
If checkout is interrupted, use **Check PayPal status** to reconcile without
sending another financial write. Saving a quote affects the planning estimate;
capturing or refunding a payment does not.

Approved recovery replacements use **Save recovery checkout quote** instead:
the fixed USD 5.00 Sandbox price and dated FX conversion stay separate from the
approved itinerary estimate. Quote preparation and safe FX refresh do not change
the itinerary revision, planning allocations or reserve. The original full refund
must be verified first. See [quote separation and validation](docs/recovery-checkout-validation.md).

Set `PAYPAL_ENVIRONMENT=sandbox`, `ENABLE_DEMO_MERCHANT=true`, and the Sandbox
app's `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_MERCHANT_ID` in
ignored `.env.local` or hosted server-side settings. `PAYPAL_WEBHOOK_ID` enables
signed notifications for the configured Sandbox app. Only the public client ID
is passed to the browser. Deployed judges use the site's configured app; they
need a Sandbox **buyer login** to approve a demo, never API keys.
See the [Sandbox setup and controlled acceptance plan](docs/paypal-sandbox.md),
[financial architecture](docs/financial-architecture.md), and
[Milestone 4B validation](docs/milestone-4b-validation.md).

**Retained Milestone 3B: context-aware AI assistant with reviewed changes.**
Open **Ask TravelRelay** inside a saved generated trip. The docked desktop
assistant answers questions using the saved plan and budget, and proposes typed
activity changes. **Review itinerary proposal** opens a full before/after schedule
and budget comparison; Approve saves atomically, Reject changes nothing, and
Request changes prepares a follow-up message without sending it automatically.
Stale proposals require a refreshed preview. Chat history, message drafts and
pending proposals restore after refresh/sign-in. Mobile switches between the
assistant and itinerary without an overlay or lost conversation state.

The existing GPT-6.1 Sol/medium primary and manually configured Gemini backup
share the same server schemas, editor and project quota. No assistant call happens
on a page read, approval, rejection, preview refresh or undo. Send/explicit retry
may consume provider quota when configured. One separately authorized live Sol
agent request passed: a single Day 2 Paris adjustment stayed pending for approval,
with unchanged budget and safe scheduling. Its exact result passes offline
approval/rejection/stale-version regression tests; **101 tests pass**.
See the [live acceptance report](docs/milestone-3b-live-agent-paris-result.md) and
[original offline validation, costs and limitations](docs/milestone-3b-validation.md).
Apply committed migrations through **`0011`** using `npm run db:migrate` before
starting this version; stop any process using the same PGlite directory first.

**Retained Milestone 3A capabilities:**
Open a saved generated trip's **Itinerary** tab to add/edit/delete activities,
move them between trip dates, reorder, or preview an undo. Every edit uses a
server-checked proposal and explicit save. Chronological cards remain the default;
**Visual schedule** adds real Bryntum drag/resize, and **Location map** shows
stored, explicitly unverified coordinates. Mobile has the same complete form
controls, without requiring a drag gesture. Refresh/sign-in restores saved edits.

Bryntum Scheduler **Community 8.0.0 (MIT)** is integrated, without commercial
trial packages or license keys. Leaflet 1.9.4/optional OpenStreetMap tiles require
no map API key. Local scheduler assets and license notices ship with the app.
See [Milestone 3A implementation, validation and limitations](docs/milestone-3a-validation.md).
Real supplier reservations and supplier cancellation notifications require a
future verified integration.

All six inspirations have public previews at `/explore/{templateId}`. Customize
opens the persistent four-step wizard with a destination and interests, leaving
dates and budget for you to choose and requiring traveler confirmation. Your
current choices override optional editorial themes supplied to the AI. Template
estimates remain unverified, per-person USD illustrations, not group budgets.
Existing saved drafts are resumed without replacing your edits.

Generated Overview day cards open stable days in the detailed Itinerary tab.
Dashboard/My Trips show saved job status, dates, travelers and reserve-separated
cost estimates. The generation page restores real backend progress and supports
explicit recovery; it never reveals partial days or retries the model on refresh.
See [Milestone 2B validation](docs/milestone-2b-validation.md) and the
[hosting/recovery runbook](docs/generation-hosting.md). No new live model call was
made for Milestone 2B.

**Milestone 2A passes final offline acceptance and is ready for sign-off.** The
exact recorded Sol Paris response passes the complete pipeline with unchanged
activity times, persists with its historical failed audit, and renders €250
reserve separately from €226 unallocated. No further live requests were made.
See the [final acceptance report](docs/milestone-2a-offline-acceptance.md) for
regressions, UI evidence, hosting requirements and remaining limitations.

## Local setup

Use Node.js 24 (the validated version) and npm. From this repository:

```powershell
npm ci
npm run setup:local
npm run dev
```

Open [localhost:3000](http://localhost:3000). `setup:local` generates a random
server-only signing secret in ignored `.env.local` without printing it, explicitly
selects local PGlite, and applies the committed database migrations. It preserves
an existing `.env.local`; if one exists, configure the current names from
`.env.example` before running `npm run db:migrate`. Do not paste secrets into chat.

Create your own account at `/signup`. No shared/demo credentials are shipped.
Email/password signup signs you in; `/login` and Profile → Sign out work with
server-backed sessions. Public landing, Explore and credits remain accessible.
Dashboard, My Trips, Profile, the wizard and trip workspaces require sign-in.

PGlite is a real PostgreSQL-compatible database persisted under ignored
`.data/travelrelay`. It is intended for **one local application process**. Stop
the dev server before migrations or opening that same data directory from another
process. Tests use separate isolated directories and do not touch development data.
Never commit `.data`, `.env.local`, database dumps, or session records.

## Validation and database commands

```powershell
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
npm run db:generate
npm run db:migrate
npm run security:check
```

`npm run deploy:check -- --vercel` is a provider-free configuration/migration-manifest check
for a **clean hosted release checkout**, not the local workspace containing
`.env.local`/QA databases. The hosted app uses a pooled Neon URL with
`sslmode=verify-full`; direct migration credentials stay outside Vercel.
Run `npm run deploy:verify` after a local Webpack production build. The explicit
`npm run test:postgres -- --approved-disposable-target` harness uses only an
independently approved `POSTGRES_TEST_DIRECT_URL`; do not run it against real
accounts/payments. Neither command makes live AI/PayPal requests. See the
deployment guide before using either command.

Tests exercise Better Auth and real disk-backed PGlite, including revocation,
unauthorized access, user isolation, validation, stale draft conflicts, idempotent
trip creation, generation failures, budget/timing validation, duplicate job claims,
activity CRUD, concurrent edits, schedule safety, budget reconciliation,
source-link validation and closing/reopening the database. Model tests use explicitly labeled provider-boundary
fixtures; the application has no simulated AI fallback. No auth or database mocks are
used. `db:generate` is for schema changes only; review and commit generated SQL.
`db:migrate` applies committed migrations, preferring `DIRECT_URL` when supplied.
Do not point tests at a production database.

`npm start` serves the production build. Hosted production requires PostgreSQL
and HTTPS. For **local QA only**, `ALLOW_LOCAL_DATABASE=true` allows a single
production-preview process to use PGlite. The dev and production preview must
not concurrently open the same directory. See `docs/validation.md` for results.

## What works

- The existing warm palette, typography, photography and editorial structure,
  with wider desktop containers, more readable small text and selective spacing
  refinements. Navigation reflects pending, signed-out and signed-in states.
- Signup/login/logout through Better Auth, scrypt password hashing, database
  sessions, HttpOnly/SameSite cookies and HTTPS Secure cookies, auth rate limiting,
  same-origin mutation checks, safe return paths and protected page/data access.
- A four-step wizard that autosaves incomplete inputs and step/review state after
  a short debounce, restores them after refresh or sign-in, and shows actual
  saving/error/session-expired/conflict states. Editing waits for draft restoration.
- One active general draft and one per curated inspiration, per user. Existing
  template drafts are resumed; template defaults never silently overwrite them.
- A 1220px split-screen desktop wizard with live destination photography and
  trip summary. Six supported destination matches; an explicitly labeled default
  for other input. Mobile stacks the form and compact, collapsible photo summary.
- Review → Save & continue to AI planning atomically stores the user's dates, budget denomination
  and scope, preferences and departure/destination intent. Retrying this action
  cannot create duplicate trips for the same draft. The immutable original draft remains available throughout generation.
- Saved trip overview, private trip cards and resumable drafts on the dashboard.
  The existing dashboard empty composition is retained until actual trips exist.
- User IDs always come from verified sessions. Reads/writes constrain both owner
  and resource ID. API responses are not cached. Cross-user IDs return 404.
- Optimistic draft versions prevent stale tabs overwriting newer edits. A
  user-specific tab buffer protects unsent edits across refresh/reauthentication;
  conflicts require an explicit reload, not a silent overwrite. Explicit logout
  clears that user's local buffers. The database remains authoritative.

## Configuration

Use Node.js **24.x** (pinned for local builds and Vercel Functions).
The default server configuration is the official `openai` TypeScript SDK,
**Responses API**, `gpt-6.1-sol`, **medium reasoning**, and standard service tier.
Configure the key in ignored `.env.local`, then restart the server:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=gpt-6.1-sol
OPENAI_REASONING_EFFORT=medium
```

Supply the key locally; never paste it into chat, commit it, or use `NEXT_PUBLIC_`.
Gemini remains an explicit server-controlled backup:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
```

`MODEL_NAME` remains a legacy Gemini-only alias when `GEMINI_MODEL` is unset.
It cannot override the OpenAI default. Only the two approved model IDs are allowed;
GPT-6 Astra is rejected. No missing key, error, quota denial or invalid response
switches providers/models. There is no frontend credential/provider control.

Both providers share the same prompts, internal response schemas, normalization,
strict validation, inclusive budget reconciliation, meal/location checks and
persistent jobs. OpenAI uses strict Responses `text.format` with the SDK Zod
helper; Gemini retains its compact grammar and full server validation. All SDK
HTTP retries and continuation/fallback paths are disabled. Requests have a
150-second deadline and 24KB planning-input bound. OpenAI proposal/itinerary caps
are 8192/32768 tokens including reasoning; Gemini retains 2048/32768 with low/medium
thinking. Retry remains explicit and governed by the existing shared SQL quotas.

Per-attempt provider/model, input/output/reasoning usage, estimated USD cost,
normalization corrections and validation outcomes persist privately, including
failed attempts. Output token totals include reasoning **once** for both providers;
visible output is separate. Unknown usage/cost is null, not a fabricated zero.
Costs use dated standard-paid reference rates, not invoices or free-tier charges.
See [provider architecture, accounting and controlled-test readiness](docs/ai-providers.md).

Model/account access, credits/billing, provider retention and network availability
are external requirements. Trip preferences, including free-text dietary/accessibility
fields, go only to the selected provider; omit unnecessary personal information.
`store:false` is set and SDK logging is disabled where supported; this does not
replace provider retention/data-use policies. No tools, grounding or live venue API
is enabled. All itinerary costs and unsourced details remain unverified estimates.
After an initial authentication failure, one newly approved Sol request returned
a complete itinerary (HTTP 200, 63.727 seconds, estimated USD 0.036331). The unchanged
quality gate rejected a classifier false positive on “Temple” in a street name;
no completed trip was saved by that original attempt. The exact recorded response
subsequently passed the corrected pipeline in [full offline acceptance](docs/milestone-2a-offline-acceptance.md), approved for Milestone 2A.
See [the historical live report](docs/milestone-2a-sol-paris-result.md). The historical Gemini report remains in
[the prior live report](docs/milestone-2a-live-quality.md), not evidence of Sol quality.

Secret assignments in `.env.example` are blank placeholders. Non-secret model and
provider defaults are included. Use secure server environment variables in production.

| Names                                    | Use                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `APP_URL`                                | Exact trusted origin, e.g. the local URL above or the deployed HTTPS origin |
| `AUTH_SECRET`                            | At least 32 random characters; `setup:local` generates it locally           |
| `DATABASE_URL`                           | Hosted PostgreSQL runtime connection; Neon pooled URL is suitable           |
| `DIRECT_URL`                             | Unpooled migration connection; keep it outside Vercel                       |
| `DATABASE_DRIVER`, `LOCAL_DATABASE_PATH` | Explicit local PGlite selection and persistent directory                    |
| `ALLOW_LOCAL_DATABASE`                   | Local production-preview override only, not a serverless deployment option  |

Social OAuth remains reserved. FX and PayPal Sandbox configuration are explained
above. No PayPal credential uses a `NEXT_PUBLIC_` variable; the server passes
the intended public client ID to the checkout SDK when Sandbox is enabled.

## Architecture

Next.js App Router + React + strict TypeScript + Tailwind/CSS tokens. Better Auth
handles authentication; Drizzle owns PostgreSQL tables and committed migrations.
PGlite supplies local PostgreSQL storage; `pg` supplies the hosted PostgreSQL path.
Zod validates incomplete drafts, complete trip intents, city proposals and complete
itineraries separately. See `src/server/model.ts`, `generation.ts` and
`src/lib/itinerary.ts` for the provider boundary, job lifecycle and domain checks.

```text
src/app/                 Public/protected pages and thin route handlers
src/components/          Shared UI, auth forms, persistent wizard and preview
src/lib/                 Shared intent validation/types, static inspirations, auth client
src/server/              Server-only runtime/session entry points, auth, resource services
src/server/db/           PostgreSQL schema and connection factory
drizzle/                 Committed SQL migrations and metadata
scripts/                 Local setup, migrations, optional asset download helper
public/                  Local photos and open-licensed fonts
tests/                   Auth/storage integration tests with isolated databases
docs/                    Architecture, validation, attribution and screenshots
```

See `docs/architecture.md` for boundaries and security decisions. The approved
specification is provided as `TRAVELRELAY_DESIGN_FIXED.md`; the source documents
and APIMatic skills supplied before development remain untouched.

## Limits and next milestone

- Email verification, password reset, OAuth and MFA are not connected. Email
  ownership is not verified; Profile says so. Configure delivery and recovery
  before a public launch that depends on verified identity/account recovery.
- Hosted PostgreSQL support exists but was not tested against a provisioned Neon
  account in this run. Deployment, backups and provider configuration remain setup
  work. The local database is not a serverless/shared production database.
- Draft conflicts preserve the current tab's data and block writes until the user
  explicitly reloads the saved version. There is no automatic merge or history UI.
- Generation supports 1–14 days, fixed or flexible dates, known destinations or
  discovery, and one explicitly confirmed base city. Longer intents remain saved;
  adjust a copy of preferences to request a supported length.
- Generation has durable database stages and runs through Next.js `after()` on
  a Node host. Configure a route duration of at least 240 seconds. This is not
  an independent durable worker queue: host interruption requires an explicit
  retry after the five-minute stale-job timeout. Calls have a 150-second timeout,
  three attempts per phase, and shared database admission limits described below.
- AI estimates cannot establish actual affordability, opening hours, accessibility,
  availability or geographic accuracy. Server checks enforce structured output,
  confirmed city, dates, pace, distances, buffers and arithmetic budget including
  a 10% reserve. Users must verify real-world details before making arrangements.
- Monetary values are integer minor units with group-wide costs, separate category
  totals and explicit currency. Spending-only budgets exclude travel/accommodation.
  No FX conversion or verified spending is implied. There are no bookings or payments.
- Trip deletion, FX, ledger transactions, live availability, checkout,
  refunds and recovery remain future work.
- Curated content is hand-authored editorial seed data. Its non-live per-person
  USD estimates exclude flights/accommodation and are not bookable offers.

## Quota protection

The assistant uses the same SQL quota counters and single active-provider lease
as generation. It has a 96KB context bound (saved IDs/times/costs retained, optional
prose/history trimmed), eight preceding turns, 2,000-character user messages,
6,000-character answers, 8,192 output tokens **including reasoning**, up to 12
planning actions per proposal and three explicitly admitted attempts per response.
Conversations retain at most 200 turns per trip; the UI loads history 20 at a time.
Proposal revalidation is local and bounded to 50 revisions. These limits do not
guarantee a free provider bill. Full accounting and estimates are in the 3B report.

The primary is GPT-6.1 Sol/medium; Gemini 3.5 Flash-Lite is a manually configured
backup. The application never switches models,
adds tools, retries a failed request, or continues truncated output automatically.
A failed attempt preserves input and offers an explicit retry or a labeled example.
Neither provider selection nor app quotas guarantees free billing. OpenAI requires
available API credits/billing; Gemini backup free-tier eligibility must be verified
in Google AI Studio. This application does
not enable billing or upgrade your project.

Server-side defaults protect the shared project allowance across accounts:

| Setting                        | Default | Meaning                                                    |
| ------------------------------ | ------- | ---------------------------------------------------------- |
| `GENERATION_GLOBAL_RPM`        | 2       | Model attempts per shared rolling minute                   |
| `GENERATION_GLOBAL_RPD`        | 20      | Model attempts per Pacific calendar day                    |
| `GENERATION_USER_HOURLY_LIMIT` | 6       | Model attempts per user/hour                               |
| Concurrency                    | 1       | One active model operation across the application database |

A complete trip normally requires two model calls: city proposal and itinerary.
Three explicit attempts per phase remain the ceiling; local admission denials do
not consume those retries. Failed provider calls still consume app allowance.
Counters and expiring leases live in a dedicated SQL table, isolated from auth
cleanup, so shared limits cannot be bypassed by signing up a second account. Invalid limit
configuration fails closed. No raw prompts, cookies or keys are used as quota keys.

Match these settings to your project's actual free quota. Other applications,
separate dev/production databases and other keys on the same provider account also
use its provider quota; the app cannot observe that usage. Defaults are conservative
application limits, not a guarantee of provider capacity. Requests are additionally
bounded by 24KB of serialized preferences, 1–14 days, token caps and 150s timeout.

## Judge demonstration and production configuration

**Deployment status: not deployed by this milestone.** The organizer will publish
the final HTTPS demonstration URL after deployment approval. There is no claimed
live judge URL yet.

Judges will only need that website URL. They can open `/example-trip` without an
account or provider key, or create a normal TravelRelay account to save preferences
and request a personal itinerary while quota is available. They must never be asked
for OpenAI, Gemini or PayPal API credentials. If AI is unavailable, the footer and generation
page link to the clearly labeled, hand-authored, read-only example. That example
is never substituted into a failed generation or inserted into their saved trips.

Before an approved deployment, the maintainer must configure `OPENAI_API_KEY`,
`AI_PROVIDER=openai`, `OPENAI_MODEL=gpt-6.1-sol`, `OPENAI_REASONING_EFFORT=medium`, `AUTH_SECRET`, `APP_URL` (the exact HTTPS demo
origin), `DATABASE_URL` and quota limits in the hosting provider's secure server-side
runtime environment. Apply migrations using `DIRECT_URL` if needed, then restart
or redeploy to load changed secrets. Use hosted PostgreSQL; local PGlite is not a
shared/serverless production database. No credentials belong in Git, frontend
forms, public build variables, screenshots or the browser bundle.

Milestone 2A makes OpenAI/Gemini calls exclusively on the server. PayPal merchant
requests also stay server-side. With Milestone 4B, the organizer's Sandbox
credentials must remain in server-side secrets and judges will not supply their
own API credentials. This documentation does not enable payments or deploy anything.

## Manual live check

The controlled AI-agent request has been used. The following remains offline:

```powershell
npx tsx scripts/check-live-agent.ts --preflight
```

It uses the original four-day Paris recording, two travelers, EUR 2,500, balanced,
Culture/Food, and the approved Day 2 relaxation message. The one-request live mode
was run once, with no retry/fallback or automatic proposal approval/itinerary edit.
An exclusive ignored request marker now prevents accidental repetition of that
acceptance run. **Do not remove it or run live mode again without new approval.**
The private transport/access/result evidence is under ignored `.test-data/`;
the sanitized recording is replayed by `tests/recorded-agent-acceptance.test.ts`.

Offline browser/HTTP QA uses an isolated seeded database and the guarded
`scripts/offline-agent-transport.mjs` Node preloader, not application fallback code.
Run `npx tsx scripts/prepare-offline-agent-review.ts` to prepare its ignored config.
The guard requires a loopback origin, local PGlite directory prefixed
`agent-ui-review-`, `TRAVELRELAY_OFFLINE_QA=true` and the literal fake key
`offline-agent-qa-key`. Use it only in a separate QA server process through
`NODE_OPTIONS=--import=./scripts/offline-agent-transport.mjs`, with the config's
origin/signing secret/database path, blank hosted DB URLs and Gemini key. Fixture
responses are labeled **OFFLINE QA FIXTURE**, and all other external requests
are blocked. With that QA server running on port 3001,
`npx tsx scripts/check-offline-agent-http.ts` exercises the real HTTP boundaries.
Never set this preloader or QA flag in a deployed application. Real judges use
the normal website with the maintainer's server-side credentials.

Historical itinerary-generation harness:

For the next controlled **one-request** Paris test, first configure `OPENAI_API_KEY`
in ignored `.env.local`. The following preflight is offline and needs no API approval:

```powershell
npx tsx scripts/check-live-generation.ts --preflight --reuse-proposal --quality-check --provider=openai
```

Only after separate approval for exactly one request:

```powershell
npx tsx scripts/check-live-generation.ts --confirm-live --reuse-proposal --quality-check --provider=openai
```

It reuses/revalidates the original recorded Paris base without a proposal request,
uses the same four-day EUR 2500/two-traveler balanced Culture/Food scenario, enforces
one transport call to the fixed OpenAI endpoint, and records raw output, token/cost
usage, stage audits, normalization, budget and SQL reopen checks in ignored
`.test-data/live-openai-paris-latest.json`. Existing Gemini reports are preserved.
The first Sol call returned 401; the next newly approved call returned a real
itinerary but failed the current quality gate. Both authorizations are consumed.
No additional live request or retry is currently authorized.

The historical Gemini check remains available only after explicit approval:

```powershell
npx tsx scripts/check-live-generation.ts --confirm-live --provider=gemini
```

This opt-in check is excluded from `npm test`. It uses actual authentication and
resource handlers, an isolated persistent SQL database and at most two real Gemini
calls (proposal plus itinerary), without retry or fallback. It verifies saved draft,
full schema/domain validation, budget/reserve, ownership and database reopening.
Token usage and sanitized provider errors are written to ignored
`.test-data/live-gemini-latest.json`; credentials are never printed or stored there.
It does not deploy, mutate development trip data or claim production-host verification.

When approval is for exactly one itinerary request using the original saved Paris
proposal, the restricted mode is:

```powershell
npx tsx scripts/check-live-generation.ts --confirm-live --reuse-proposal --quality-check --provider=gemini
```

This mode requires the earlier ignored report, makes no new proposal request,
hard-limits the transport to one exact-model request, and records full findings in
`.test-data/live-gemini-quality-latest.json` without replacing earlier reports.
The latest one-request approval has been consumed; do not run either live command
again without new approval.

## Itinerary quality

The [targeted reliability pass](docs/itinerary-reliability.md) now records safe
server-derived buffer corrections without moving activities. It reconciles inclusive
food/transport allocations with itemized estimates and additional unitemized
allowances, keeping emergency reserve and unallocated remaining budget separate.
New versioned plans retain stable expense/activity references and explicit currency;
older saved totals are not silently recalculated. These are planning estimates,
not TripWallet spending or verified supplier prices. Substantial lunch/dinner
opportunities, realistic meal-start windows and vague city locations receive stronger
checks. No new live model request was made for this follow-up.

Generation now applies pace-aware detail and scheduling checks before saving:
full days target 2–3 relaxed, 3–5 balanced or 5–7 packed experiences, with lighter
arrival/departure plans. Selected interests must appear in concrete activities;
food expenses alone do not satisfy Food. Durations, meal space, travel buffers
and supported published venue hours receive additional checks.

Exact travel times are not collected, so arrival-after-14:00 and departure-before-
12:00 activity windows are disclosed planning assumptions. Published hours are
source-checked references with dates/links, not confirmed future availability.
Other venue hours and all prices remain unverified estimates. Older saved plans
are labeled as predating the new checks and are not silently modified.

The historical Gemini Paris response is an offline regression fixture; it fails the
stronger quality gate. Authored offline candidates pass without changing budget
calculations. The subsequent single approved live test improved activity detail,
Food coverage and Orsay timing but failed one declared travel buffer. Manual review
also found meal-category and meal-timing concerns; live quality sign-off is not
passed for that historical attempt. The later Sol recording now passes the
[final offline acceptance](docs/milestone-2a-offline-acceptance.md), including
address-aware venue classification and reserve-separated financial summaries.
See [the Gemini live report](docs/milestone-2a-live-quality.md) and
[quality policies and remaining limitations](docs/itinerary-quality.md).

## Generation flow

Complete and review the wizard, then save. The generation screen first requests
one city and dates; review and confirm before generating. Real backend stages
replace synthetic percentages. No individual days appear until the entire plan
is validated and atomically saved. Return from My Trips after leaving the page.
Failures retain the original input and offer safe retries or a new draft copied
from those preferences. Completed plans appear on Dashboard/My Trips and the
Overview/Itinerary tabs. Ask TravelRelay is visible with editing clearly disabled.

## Sponsors and licenses

Nine APIMatic PayPal TypeScript skills are available under `.agents/skills`.
Installation is not an integration or sponsor-award claim. Before PayPal work,
load `typescript-integrate-paypal`, follow its SDK map/contract-sheet gates and
companion skills. 4B uses PayPal's REST APIs and browser JavaScript SDK v6 instead
of the generated server SDK. The model APIs use the official server-side OpenAI
and Google GenAI SDKs.

Existing project MIT license preserved. Unsplash photography sources are in
`docs/image-credits.md` and `/credits`; fonts include SIL Open Font License texts;
Lucide icons use the ISC License. Builds serve images/fonts locally.

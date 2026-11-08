# Architecture — Milestone 6A

## Deployment boundary

The current deployable shape remains one Next.js Node 24 process plus shared
PostgreSQL. `render.yaml` prepares one always-on Render service, disables automatic
deploys and permits 300 seconds to drain `after()` callbacks. It does not provision
resources until explicitly imported/approved. No independent durable queue is
claimed: saved jobs recover from interruptions and require explicit paid retries.

`server/deployment-config.ts` shares exact-origin, HTTPS, database/TLS, local-QA,
secret-prefix and Sandbox-only guards between runtime and provider-free preflight.
Public production rejects PGlite even when the local override is set. Explicit
loopback production QA is preserved. The database pool has bounded connections,
connect/query deadlines and sanitized idle-disconnect diagnostics. Hosted
migrations use one direct client and an advisory lock; existing SQL is unchanged.

`GET /api/health` is uncached, exposes only readiness, and verifies all twelve
migration hashes/timestamps against the release. It does not call providers or
inspect private trip contents. The public webhook retains signature and current
provider-resource verification, with an additional shared SQL admission bucket
(120/minute), independent of forwarded-IP claims. Security response headers
preserve PayPal SDK compatibility without adding a speculative CSP.

Offline tests cover real worker process loss, restored interruption, explicit
retry, duplicate claims, exact migration checkpoints, secure cookies, transaction
rollback and immutable/owner-scoped records. A production HTTP test bridges into
the installed Next SIGTERM handler on Windows and proves post-response work drains;
actual Linux/Render signal delivery and 240-second host lifetime remain unverified.

See [deployment and backup/rollback procedures](deployment.md),
[the generation runbook](generation-hosting.md) and
[Milestone 6A validation](milestone-6a-validation.md). Hosted PostgreSQL, public
HTTPS, signed webhook delivery and host/browser acceptance require approval and
target configuration; local success is not deployment acceptance.

## Retained Milestone 4B architecture

## Recovery checkout quote separation

Migration `0011_recovery_checkout_quotes` adds a purpose, optional recovery case
and immutable planning-estimate snapshot to existing wallet intents. Existing
rows default to `planning`; the original quote/editor behavior is unchanged.
The composite FK binds a recovery checkout quote to the exact owner, trip and
approved replacement activity. A unique case key permits one quote identity;
expired references refresh that same identity using the existing append-only
`intent_fx_refreshed` event. No payment or itinerary record is rewritten.

`server/recovery-checkout.ts` verifies the approved option and edit, unchanged
itinerary revision, active case, original merchant and completed full refund.
Wallet save and checkout repeat these checks under the trip/wallet/case locks.
Checkout and capture retain durable single-operation claims and stable provider
keys. A designated recovery quote must be exactly USD 5.00; currency/amount
supplied by the browser cannot change the server price. Ordinary planning quotes
cannot bypass these checks when attached to a recovery replacement.

Recovery quote creation/refresh increments only the wallet version and appends a
zero-money planning event. It never invokes the itinerary editor. Staleness uses
the saved planning estimate and approved revision, rather than equating the FX
conversion with the estimate. The approved EUR 4.00 activity can therefore have
a distinct USD 5.00 quote (EUR 4.48 indicative) while retaining revision 3,
EUR 222 unallocated and EUR 250 reserve. A quote alone contributes no spending
or additional planning expense. A future verified capture covers the estimate
once: projected spending uses the larger estimate/verified indicative payment,
while original-currency actuals, planned unallocated funds and reserve remain
separate. UI review displays both amounts and quote expiry explicitly.

An itinerary edit after approval or a finished case invalidates checkout; no
automatic re-approval, new case, replacement quote or provider retry occurs.
Checkout freezes its FX reference. This correction does not add supplier
inventory, live FX guarantees or an operator reset/re-approval workflow.

## PayPal Sandbox commerce

`server/paypal-client.ts` wraps the official Sandbox Orders v2, Payments v2,
OAuth and webhook verification APIs on one fixed host. PayPal JavaScript SDK v6
opens buyer approval with the public client ID. `GET/POST /api/trips/{id}/commerce`
uses the same authenticated ownership and mutation-origin checks as TripWallet.
`POST /api/paypal/webhook` instead authenticates provider signatures and
retrieves provider resources before accepting financial changes.

Migration `0008` adds owner-bound booking references, durable outbound operation
claims and webhook receipts. The booking locks a single USD 5.00 demo quote
and has no supplier fulfillment. An order, capture or refund claim is committed
before the external write, with a stable PayPal idempotency key. No ambiguous
operation is automatically submitted again. Captures and refunds reuse the
existing append-only TripWallet ledger, with provider data and separate
reference FX estimates. UI and assistant edits cannot submit financial outcomes.

See [Sandbox configuration, limits and acceptance plan](paypal-sandbox.md).

## Retained TripWallet and financial foundation

The existing itinerary budget remains the planning source of truth. New
`server/wallet.ts`, `server/fx.ts`, `lib/money.ts`, `lib/financial-ledger.ts` and
`lib/finance-contracts.ts` add authenticated native-currency planning quotes,
exact decimal conversion, saved FX evidence and an append-only financial ledger.
`GET/POST /api/trips/{id}/wallet` has strict owner/origin/input checks. Browser
actions cannot establish a capture, refund or other successful payment status.

Migrations `0006`/`0007` add six wallet/FX/intent/mutation/event tables, composite
owner FKs, immutable-evidence guards and per-event converted/fee estimate metadata.
Saving a reviewed quote reuses the editor's
preview/commit and transaction hook to update one activity estimate, insert the
original native-currency intent and append its planning audit atomically. Existing
assistant/manual edits and undo never alter payment history; linked quote changes
are flagged. Overview/Itinerary/Bookings/Dashboard all use the same saved plan.

Frankfurter v2 pinned to ECB uses a one-hour persistent cache, pair SQL lease,
eight-second bounded fixed-endpoint fetch and labeled stale fallback. No FX secret
or browser provider request is needed. Home/local display preferences never
rewrite original amounts or rates. Budget scope/reserve and inclusive food/
transport allowances are preserved. Foreign payment equivalents are indicative;
original/provider-reported charged amounts and fees stay separate.

Provider-confirmed events can only enter through the server's verified path.
The domain reducer enforces original amount/currency,
order/capture/refund references, pending/refund limits, fee payer semantics and
idempotency. SQL wallet-row locks serialize financial events; unique provider/
operation references prevent duplicate money counting.

See [financial architecture, exact arithmetic, event policy and 4B requirements](financial-architecture.md)
and [Milestone 4A validation](milestone-4a-validation.md). Retained architecture follows.

## Retained Milestone 3B

## Context-aware assistant and approval boundary

`src/server/agent.ts` owns the authenticated conversation/job/proposal lifecycle.
`GET/POST /api/trips/{id}/assistant` uses the same Better Auth session, exact-origin
checks, 20KB bounded strict JSON and no-store responses as other resources. GET
restores state or pages older turns; POST accepts only draft/send/retry/approve/
reject/request-changes/refresh-preview actions. Effective owner IDs come only from
verified sessions. Every read/write, including proposal history and audits, is
trip/owner-scoped; anonymous access is 401 and foreign IDs are 404.

Migration `0005_dark_black_widow.sql` adds `agent_conversation`, `agent_turn`,
`agent_attempt`, `agent_proposal` and `agent_proposal_event`. It also adds server-
assigned `source`/`proposal_id` to existing itinerary edits. Conversation draft
versions protect concurrent typing. Unique message-mutation/ordinal indexes plus
a conversation active-turn reservation prevent duplicate sends/concurrent jobs.
Up to 200 turns are retained per trip, read in pages of 20; proposal/event history
and original generation records remain separate. SQL rows use existing owner/trip
foreign keys and migrations, without new database/provider dependencies.

Send persists and queues a turn before returning HTTP 202. Next.js `after()` claims
one worker with a unique token, then records actual generating/validating/ready or
failed/interrupted states. GET/focus/online/poll reads never start a model request.
The original generation quota module supplies the SAME project minute/Pacific-day,
user hourly counters and single 180-second lease across both features/providers.
Only admitted attempts consume the three-attempt ceiling. Missing/incomplete
results, schema failures, 429s, timeouts and interruptions never retry or switch
provider automatically. Five-minute stale recovery fences late workers; explicit
retry uses current saved context. A host crash can still lose an in-flight result:
this reuses the existing recoverable `after()` contract, not a durable queue.

`agent-context.ts` builds a server-owned snapshot of destination/dates/travelers,
preferences, every stable day/activity ID, times/durations/buffers, stored location
uncertainty, costs/categories and reconciled budget/reserve/remaining amounts.
Only the latest eight prior turns and typed proposals with actual approval status
are included. Optional descriptions/history may be trimmed to 96KB; IDs, times,
costs and locations are not silently omitted. Oversized essential context fails
before contacting a provider. Sessions, credentials, email/account tables,
generation internals and hidden reasoning are never included. Free-text preferences
and chat go to the selected provider; they are untrusted data, not tool authority.

The existing `TripModel` adapter gains `respond`, using the same official SDKs,
fixed endpoints and accounting. OpenAI Responses uses strict `zodTextFormat`,
GPT-6.1 Sol, medium reasoning, standard tier, `store:false`, no SDK retries and
8,192 total output tokens including reasoning. Gemini retains the existing compact
schema projection, explicit manual selection and no continuation/fallback; its
assistant request uses the same DTO/cap and medium thinking. Provider settings,
generation schemas, normalization and acceptance remain unchanged.

`agent-contracts.ts` is a closed structured answer/proposal envelope. Planning
tools are add/remove/update/move/resize/replace, with at most 12 actions. Unknown
tools/fields, foreign/fabricated IDs, wrong currency/city, hidden move/resize fields
and duplicate targets fail. The model cannot supply coordinates, URLs, verified
metadata, user IDs, totals or executable code. Add IDs are assigned once server-
side. Replacements preserve the targeted stable ID; changed locations have unknown
coordinates. No model text is parsed into execution instructions. Grounded activity
references are checked and clear first-person false execution claims rejected;
other factual prose remains an AI estimate, with explicit uncertainty labels.

Translation produces a bounded `batch` of EXISTING 3A editor operations. The editor
applies them in memory, runs the same schedule/geography/venue checks and budget
reconciliation once over the final candidate, then creates one before/after preview.
No action is committed while answering. A valid pending proposal stores its base
version, immutable typed intentions, assigned IDs, preview and proposal revision.
Refresh re-translates only explicit patches against current saved activities so
unrelated manual fields survive; it never calls AI or moves unsupplied times.
Invalid/deleted references require a revised suggestion. Each refresh is audited
and invalidates old approval revisions, with a 50-revision resource bound.

Approval calls the SAME `itineraryEditor.commit` with server-only AI provenance.
Its transaction inserts the itinerary audit and invokes an `onRecorded` hook which
conditionally approves the exact pending proposal/revision/base version and writes
its approval event. Any failure rolls back the plan, edit and approval together.
Concurrent manual edits, rejected proposals and stale previews fail closed. A
repeated approved request returns its recorded outcome without another edit/call.
Over-budget edits retain the 10% reserve and require the traveler's explicit
acknowledgement. Cost-source and edit-source metadata distinguish approved AI
suggestions from manual actions; neither is an actual payment. Undo remains the
existing latest-edit, newly audited non-financial restoration path.

`use-travel-agent.ts`, `trip-assistant.tsx` and `trip-workspace-shell.tsx` implement
the optional 400px desktop dock and mobile view switching without overlays.
Server drafts plus owner/trip-scoped tab buffers preserve unsent messages, including
ambiguous send outcomes with stable mutation IDs. Lost HTTP replies offer status
checks and explicit retry; no automatic paid resend occurs. Full-size proposal
review shares the workspace with chat and shows every activity field, budget
categories, itemized/unitemized estimates, reserve, remaining money and conflicts.
The editor and assistant exchange a trip-scoped refresh event after confirmed
commits. Cards, Bryntum, map data and server-rendered Overview all read the same
saved plan; unsaved manual forms are retained and blocked if an AI commit changes
their version. Original generated introductions/day themes are labeled as such,
while counts, highlights, schedules and financial projections use current data.

Each admitted attempt privately records provider/model, response elapsed time,
input/output/reasoning usage, reference USD cost, context size/version, typed
proposals and validation results. Usage is persisted before response validation;
unknown usage/cost is null. No keys, raw provider errors, complete internal prompts
or hidden reasoning are audited/exposed. Proposal events preserve preview revisions
and approval/rejection decisions. This is an application audit, not a payment ledger.

Future booking/recovery tools must use separate schemas, permissions, verified
provider records and execution/financial approval paths. They cannot be added as
arbitrary names or mapped onto planning estimates. None is registered in 3B.
See [3B validation, sample conversations and limits](milestone-3b-validation.md).

## Retained Milestone 3A foundation

## Interactive itinerary boundary

The existing authenticated Next.js/Drizzle/PostgreSQL architecture is retained.
The generated plan remains in `trip.itinerary` JSONB, with stable UUID day/activity
identifiers. `trip.itinerary_version` provides optimistic concurrency. Migration
`0004_overjoyed_infant_terrible.sql` also adds `itinerary_edit`, with owner/trip
foreign keys, unique `(trip_id, version)` / `(trip_id, mutation_id)` indexes and
before/after snapshots, operation, assessment and timestamps. Existing trips start
at revision zero; their JSON and original generation-attempt audits are untouched.
History is append-only through this service, not a database tamper-proof ledger.

- `activity-metadata.ts`: explicit planning categories, safe public HTTPS source
  links, monetary input parsing and estimate/coordinate provenance.
- `itinerary-editing.ts`: strict bounded mutation DTOs, stable-ID activity
  transformations, schedule assessment, transparent reorder changes and shared
  budget reconciliation. Generated response schemas and generation validators are
  unchanged. Nullable coordinates apply only to stored/manually edited activities;
  model output still requires its original location fields and strict checks.
- `itinerary-edits.ts`: owner-scoped read/preview/commit/undo service. Every
  commit repeats validation, atomically compares owner+trip+version and writes the
  updated plan and audit in one transaction. Lost races return 409; repeated
  identical mutation IDs are idempotent, reused IDs with different edits fail.
  All reads, previews and history use the verified session's owner ID. No client
  supplied owner, version override, expense total, source-checked metadata or
  itinerary replacement is accepted. Auth/origin/body-size/no-store conventions
  are shared with existing APIs.
- `GET /api/trips/{id}/itinerary` returns the plan, revision, intent, latest 20
  history metadata rows and current assessment. `POST .../preview` accepts
  `{version, mutationId, operation}` without persistence. `POST .../itinerary`
  rechecks and commits. Operations are add/update/delete/reorder/restore-latest;
  updates can change a date only by selecting an existing server-owned trip day.
  Overruns require `acknowledgeOverBudget`; reserve is not converted to spending.
- `itinerary-workspace.tsx`: server-supplied initial snapshot, chronological
  cards, inline full activity form, proposals, save/discard, conflict reload,
  audit/undo, day deep links and lazy schedule/map. No model request is made.
  Dashboard, My Trips and Overview read the same updated stored plan. The existing
  workspace tabs/assistant dock are retained; AI editing stays explicitly unavailable.
- `schedule-adapter.ts` / `visual-schedule.tsx`: actual Bryntum Scheduler
  Community 8.0.0, MIT, managed through a client-only create/destroy lifecycle.
  Resource rows use stable trip day IDs/dates; a shared display-only clock axis
  avoids browser-timezone conversions. Drag/resize is rolled back inside Bryntum
  and translated into the same server preview/commit path as the accessible form.
  Zoom changes scale only, never saved dates/times. Local Font Awesome assets and
  license notices avoid the package's automatic external CDN fallback.
- `itinerary-map.tsx`: client-only Leaflet 1.9.4 map of the selected day's stored
  coordinates. Click markers or accessible location buttons to highlight a card.
  Missing coordinates remain null and listed; no geocoding/routing is requested.
  OSM raster tiles load only in map view with visible attribution and normal browser
  caching/referrers. No API credentials, tracking embeds or backend proxy are added.

Hard edit checks reject overlaps, insufficient actual or declared travel buffers,
calendar-day/trip bounds, invalid amounts/currency/coordinates, duplicate IDs,
off-base known coordinates and conflicts with dated published venue references.
The existing geographic transfer estimator and accessibility increment are reused.
Missing coordinates produce an uncertainty warning and retain the minimum buffer;
the app cannot verify their transfer geography. Unknown indoor venues/shopping
retain conservative visiting windows. Reordering explicitly proposes all affected
times and buffers before saving; ordinary edits never move other activities.
Arrival/departure windows remain unverified travel assumptions, so edits outside
them show warnings rather than claiming knowledge of actual flights. Pace, short
duration and missing food stops are suggestions for traveler-authored plans.
This manual-edit policy does not relax any AI-generation acceptance threshold.

Budget reconciliation calls the existing `calculatePlanningBudget`, with explicit
manual activity categories. Existing additional unitemized allowances are retained;
food/transport itemized estimates plus allowance form each inclusive allocation
exactly once. Group costs remain integer minor units in the original trip currency;
expense references retain stable day/activity UUIDs and per-estimate provenance.
Reserve stays at 10% of selected budget and is separate from remaining funds.
No FX, payment, actual-spending ledger or TripWallet transaction is introduced.

Undo restores the latest edit's before snapshot through a newly validated/audited
revision, including its prior allowances. Full audit snapshots remain in SQL while
the UI lists the latest 20 revisions. The current edited plan is labeled as mixed
manual/AI estimates; its old index-based generation-quality metadata is removed
from the current presentation, with the exact original retained in audit snapshots
and unchanged generation records. This boundary is reusable by a future 3B proposal
agent; it grants that agent no direct write/payment authority.

See [3A acceptance and operating limits](milestone-3a-validation.md). Hosted
PostgreSQL migration verification and the existing
[240-second generation hosting contract](generation-hosting.md) remain deployment
requirements. The original architecture below describes the retained foundation.

## Milestone 2B foundation

Milestone 2B connects the existing generation engine to public curated previews,
personalized wizard drafts and navigable generated-trip overviews. It adds no
provider, database driver, dependency, payment integration or external worker.
The approved Milestone 2A validators, budget reconciliation, provider settings,
quota and atomic persistence remain unchanged.

## Curated personalization and workspace connections

- `src/app/explore/[templateId]/page.tsx` statically builds the six known public
  previews; unknown IDs return 404. Explore/landing/dashboard cards link to preview
  and customize URLs. Protected wizard return paths preserve the selected template.
- `initialIntent` adds an optional validated `templateId` and traveler-confirmation
  flag to new template drafts. Destination includes city/country; interests are
  copied rather than sharing a mutable template array. Dates/departure/budget are
  blank. Choosing travel dates/count, a group budget, pace and preferences remains
  the user's responsibility. Complete-intent validation requires confirmation for
  new template drafts. Older saved JSON remains valid; saved values are not reset.
  These optional JSONB fields require no SQL migration.
- `curatedPlanningBrief` resolves only known server-shipped editorial themes.
  Both providers receive identical optional inspiration context. User intent and
  confirmed base take precedence; template cost/length never replace user values.
  There is still exactly one confirmed base; multi-city generation is unsupported.
- `createTripStore.list` joins owner-scoped job status for Dashboard/My Trips;
  authenticated generated cards show dates/travelers and saved budget metadata.
  `ItineraryDayOverview` shows three photo cards, remaining-day disclosure and
  stable links to `/trips/{id}/itinerary#day-{uuid}`. Detailed timelines keep every
  time, duration, location, buffer, currency, cost and source label unchanged.
  Mobile uses a swipeable card row; tabs and day selectors remain horizontal.
- `generation-presentation.ts` maps real persisted states to UI copy, current
  stage and explicit retry availability. Fetches are bounded; focus/online checks
  perform reads only. Failed/exhausted states preserve the original source draft
  and provide a separate revision-copy path. No timed synthetic progress exists.

See [Milestone 2B validation](milestone-2b-validation.md) and the
[hosting/recovery contract](generation-hosting.md) for tests and deployment blockers.
The following engine architecture remains in force from Milestone 2A.

OpenAI is now primary (`AI_PROVIDER=openai`, `OPENAI_MODEL=gpt-6.1-sol`, medium
reasoning), with Gemini 3.5 Flash-Lite retained as a manual server-configuration
backup. See [ai-providers.md](ai-providers.md) for SDK contracts, persisted usage/
validation audit and cost semantics. The original real Paris response has now
passed [final offline acceptance](milestone-2a-offline-acceptance.md), with no
additional live requests for this targeted pass.

## Reused foundation

The Next.js App Router, React/TypeScript, existing CSS tokens and local photography,
Better Auth sessions, Drizzle/PostgreSQL schema and versioned wizard autosaves remain
in place. Landing composition and global responsive navigation are preserved.
The historical 1B decisions below describe the starting point, not current exclusions.

## Generation boundaries

- `src/lib/itinerary.ts`: shared structured schemas, currency minor-unit helpers,
  generation-input and semantic itinerary validation, versioned persisted types.
- `src/server/model.ts`: existing `TripModel` factory selecting one approved provider.
  `src/server/ai/openai.ts` uses the official `openai` SDK/Responses strict structured
  output; `ai/gemini.ts` retains official `@google/genai` and its compact grammar.
  Shared `ai/prompts.ts` supplies identical instructions, schemas and planning brief.
  Runtime passes only the selected server key. Fixed official endpoints, bounded
  requests and sanitized failures; no automatic fallback or success substitute.
- `src/server/generation.ts`: owner-scoped job state machine, atomic claims,
  explicit city/date confirmation, retry limits, stale-job recovery, per-user
  database-backed usage limits, atomic completed itinerary/job persistence.
- `src/server/application.ts`: verified session, exact origin and bounded JSON
  checks before resource operations. Thin `/api/trips/[id]/generation` handlers
  schedule work through Next.js `after()`; GET only retrieves/expires stale state.
- `trip.itinerary` is nullable versioned JSONB. Existing trips retain their saved
  intent and remain usable. Day/activity UUIDs, local dates/minutes, timezone,
  locations/coordinates, group cost minor units, currency, estimate provenance
  and model metadata prepare for future editing without implying booking records.
  `trip_generation` holds the separate owner, trip, phase, proposal/confirmation,
  attempts, safe error and timestamps. No partial itinerary is stored or exposed.
- `trip_generation_attempt` (migration 0003) stores each admitted phase/attempt's
  provider/model, nullable usage and dated USD cost estimate, validation stages,
  normalization audit and safe status/error. Reads are owner-scoped. SDK usage is
  saved before schema/quality checks, including rejected responses. Interrupted or
  unknown usage is not fabricated as zero; audit rows contain no raw prompts,
  generated response text, hidden reasoning or credentials.

## Lifecycle and concurrency

The wizard validates and archives its original draft into one idempotent trip
intent, then opens the cinematic generation page. Start queues a city proposal
for either known destination or discovery. The user must explicitly confirm the
proposed base city and exact dates before full itinerary generation.

Database stages are queued → choosing → awaiting_confirmation → queued →
generating → validating → complete (or failed). A conditional update claims one
queued job. Attempts and the claim timestamp form a lease: an expired/retried
worker cannot publish late output. Final validation and itinerary storage precede
one transaction committing the trip and complete stage. Polling never reveals
individual days. Repeated POSTs cannot generate a second completed itinerary.

Retries preserve input and confirmed city, allow three attempts per phase and
charge against project/user admission limits in a dedicated SQL table. Defaults
are 2 requests/minute across users, 20 per Pacific calendar day, 6 per user/hour,
and one active model operation per application database. The dedicated
`generation_quota` table is isolated from Better Auth's cleanup. Atomic admission
rolls back all counters on denial; token-owned leases expire after 180 seconds and
an old worker cannot release a newer lease. Local denials retain model retries.
Configuration is strictly parsed and fails closed if invalid.
Interrupted work becomes recoverably failed after five minutes. Node hosting must
support `after()` and the configured 240-second maxDuration (model timeout 150s).
This is persistent job state, not an independently durable distributed queue;
server crashes require explicit user retry. No automatic paid retry is performed.

`src/lib/generation-timing.ts` centralizes the unchanged provider timeout, worker
lease, stale recovery and host-duration contract. The Next route keeps its literal
240-second export for static analysis. Generation POST returns before `after()`
work; short polling requests retrieve database state. A clock-controlled 64-second
wait regression covers an aborted initiating request, hidden partial output and
completion/reopen. The real 63.727-second response fits this execution window;
deployment still requires a host that honors background work and route duration.

An owned saved intent can seed a distinct revision draft slot. Its autosaves use
existing version checks and do not mutate the original trip or archived source.
Dashboard draft links resume that source slot; foreign source IDs return 404.

## Validation and honest estimates

The Gemini adapter projects Zod schemas onto a compact structural JSON Schema. Numeric
bounds, array counts and text rules move into descriptions to avoid Gemini's
nested grammar state limits; every original constraint remains enforced by the
original server Zod schema and semantic validator. `responseMimeType: application/json` and `responseJsonSchema`
constrain Gemini output. OpenAI uses the SDK `zodTextFormat` strict Responses
`text.format` from the same Zod schemas. Every response from either provider is
parsed and validated again server-side.
Additional checks enforce
1–14 days; consecutive fixed/confirmed flexible dates; selected currency; one
confirmed city for every activity; IANA timezone; local schedule bounds; activity
caps per pace; 50km geographic bounds; nonoverlap and travel buffers of at least
15min plus conservative coordinate-distance transit allowance. Budget arithmetic
uses integer group minor units (JPY 0 decimals, other supported currencies 2),
essential category presence, inclusive category allocations and itemized/unitemized
expense reconciliation, plus a server-computed 10% reserve.
Spending-only budgets exclude flights/stay. Infeasible outputs explain the problem
and are not persisted as successful plans. These checks cannot verify real-world
prices, routing, hours, dietary/accessibility suitability or availability.

`src/lib/venue-classification.ts` prioritizes directly matched server-owned venue
metadata, then reconciled structured expense-category hints, then address-aware
activity context. Street/address keywords do not manufacture attraction types or
interest coverage. Contradictory indoor categories fail as ambiguous; actual
indoor visits and trusted published schedules retain all existing restrictions.
Quality v3 persists category and classification basis, never provider-authored
verification claims. Provider response schemas and numeric thresholds are unchanged.

Finished-trip financial summaries use `planningBudgetSummary` and the stored
reconciled budget. The emergency reserve and genuinely unallocated remainder are
separate; raw model explanation is retained for provenance but cannot override
these displayed financial figures. No legacy saved amounts are recalculated.

All costs, schedules and locations remain AI estimates with an explicit warning.
The API never manufactures bookings, transactions, verified prices or payments.
The provider receives user planning fields, including free-form preferences; keys
and auth/database state never enter model prompts or client DTOs. The SDK uses `store:false` to disable optional request logging; no claim is made
that this overrides either provider's retention or data-use terms.
No SDK automatic retries or continuation, provider fallback, grounding or tools
are enabled. Explicit job retries remain the only additional-request path. The default
GPT-6.1 Sol uses medium reasoning, standard service tier, 8192 proposal / 32768
itinerary token caps and SDK `maxRetries:0`. Manually selected Gemini retains low
thinking/2048 proposal and medium thinking/32768 itinerary caps. Both use a
150-second abort/HTTP timeout. Token output totals include reasoning once and
estimated API USD costs are separate from trip planning currency/budget.
Unknown internal errors are sanitized. Keys remain in ignored environment files.

## Itinerary quality gate

The unchanged compact model DTO is strictly parsed, then `normalizeTravelBuffers`
raises understated interactivity buffers only within sufficient existing gaps.
It changes no activity times or costs and never reduces conservative buffers.
The normalized plan is followed by `validateItinerary` and then
`validateItineraryQuality` before the existing atomic commit. The latter enforces
pace/day-role detail, conservative travel-day windows, realistic activity durations,
meal space, stronger transfer allowances and concrete interest activity coverage.
The model receives the same structured planning brief through its existing prompt;
there is no automatic repair call or provider fallback. Existing reserve, currency,
ownership and retry semantics are unchanged. Food/transport fields are inclusive
allocations; itemized costs count once, with additional unitemized allowance shown
separately. Underfunded allocations fail rather than dropping estimates. Version-2
plans store stable expense/activity references, budget metadata and correction
history in JSONB. Version-1 plans retain their original amounts and are labeled.
Substantial lunch/dinner opportunities, explicit meal times and city placeholders
receive stronger checks. See [itinerary-reliability.md](itinerary-reliability.md).

Server-owned published-hours references are supplied only for supported venues.
Model response properties cannot mark themselves verified. Accepted JSONB plans
receive optional `quality` metadata; legacy plans remain unchanged and are labeled
as predating these checks. Published source information is dated and scoped to
hours, with future availability and all costs still unverified. Only Orsay currently
has such a reference. Unknown venues use conservative, unverified assumptions.

See [itinerary-quality.md](itinerary-quality.md) for policy details, offline Paris
regression results and heuristic limitations. The subsequent
[single approved live check](milestone-2a-live-quality.md) failed on one declared
buffer; no validator was changed and the rejected plan was not saved. Further live
testing requires new approval.

## Example and judge access

`/example-trip` is a public, hand-authored, read-only demonstration using the same
itinerary display and schedule/budget validation. It is explicitly labeled as
editorial, with no model/generation provenance. It calls no provider, writes no
user trip, and is linked from the footer and generation page. It is an alternative
view during outages, never an automatic replacement for failed AI output.

All provider credentials are loaded at the existing server-only runtime boundary.
Judges use the website and normal account authentication, never provider keys.
No deployment is performed here. Hosting must supply protected server environment
variables, exact HTTPS APP_URL, hosted PostgreSQL and the route-duration support.
Provider account tier/billing and usage by other applications are outside the app's
control; model choice and app quotas alone cannot guarantee zero provider charges.

## Deferred

AI editing (a later scope), live supplier data, independent worker infrastructure, hosted
PostgreSQL verification/deployment, FX, ledger transactions, PayPal checkout,
refunds, Trip Recovery, Bryntum and AG Grid remain outside this milestone.
Existing auth limits (email verification/reset/OAuth/MFA) remain unchanged.

References: [Google GenAI TypeScript SDK](https://googleapis.github.io/js-genai/release_docs/),
[SDK structured JSON configuration](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html),
[Gemini 3.5 Flash-Lite](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite),
[pricing](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite), and the installed
Next.js `after` documentation in `node_modules/next/dist/docs`.

---

## Historical Milestone 1B architecture

# Architecture — Milestone 1B

## Existing foundation and approved extension

The starting point was a single Next.js 16 App Router/React/TypeScript app,
Tailwind and CSS theme tokens, local Inter/Plus Jakarta Sans fonts, local licensed
photography and native accessible primitives. The landing page, navigation,
editorial inspirations and wizard/workspace shells were implemented; auth,
storage and tests were absent. The approved product source is
`TRAVELRELAY_DESIGN_FIXED.md`, read completely with the prior handoff notes.

Milestone 1B extends that stack, preserving its identity and page structure.
No AI, PayPal, Trip Recovery, itinerary scheduler or Bryntum is implemented.

## Decisions recorded before implementation

- Better Auth for email/password and database sessions instead of hand-written
  credential/session cryptography. The spec allowed an established auth library;
  Better Auth supplies signup as well as login/logout and endpoint protections.
- Drizzle and committed PostgreSQL SQL migrations rather than Prisma. Both follow
  the specification's ORM choice. PostgreSQL on Neon remains the hosted path.
- PGlite for persistent local development and isolated integration tests, using
  the same PostgreSQL schema and queries without an external account or secrets.
  It is a single-process local choice, not a substitute for hosted PostgreSQL in
  serverless production. Production requires DATABASE_URL unless explicitly
  overridden for local single-process QA.
- Zod for strict request validation. Incomplete drafts allow blanks; trip-save
  validation requires destination/vibe, departure, valid dates/length and budget.
- Node's test runner plus tsx for integration tests against the actual auth
  library, handlers, SQL migrations and disk-backed database. No service mocks.

## Boundaries

`src/lib/trip-intent.ts` contains shared input types/validation and destination
photo matching. `src/server/db` owns user, session, account, verification,
rate-limit, trip-draft and trip tables. `src/server/auth.ts` configures Better Auth.
`src/server/trips.ts` owns authorization-constrained queries and transactions.
`src/server/application.ts` composes the tested auth/resource handler layer.
`runtime.ts` and `session.ts` use `server-only` guards and keep database/secret
configuration out of client bundles. Database/auth connections are reused across
requests and dev reloads. SQL driver packages are externalized; Better Auth's
React client stays bundled with Next's React runtime.

Thin App Router handlers delegate to the application layer. Protected pages use
`requireUser`, then pass the verified user ID to scoped queries. Root navigation
uses Better Auth's client session state, with a distinct pending state. Hiding
navigation is never the authorization boundary.

## Auth and resource security

- Scrypt password hashing through Better Auth; 12–128 character passwords.
- Database sessions, seven-day expiration with renewal, HttpOnly/SameSite=Lax
  cookies, Secure cookies for HTTPS origins. Cookie session caching is disabled
  so revocation/expiry is checked against the database.
- Exact configured origin checks for mutations; auth library CSRF protections
  remain enabled. Auth and resource request bodies are bounded and JSON validated.
- Auth rate limits use database storage. The trusted deployment proxy must
  sanitize client-IP forwarding headers; no arbitrary origin/CORS allowlist.
- Every resource query includes verified owner ID; callers cannot supply an
  effective owner. IDs belonging to another user have the same 404 result as
  absent IDs. Auth/user credential tables are never exposed as resource endpoints.
- Resource responses use Cache-Control: no-store; personalized server pages use
  request session data and are dynamic. Client-side session state is not trusted
  by the backend. Return paths are restricted to same-site application paths.
- Local setup generates an ignored secret without printing it. Builds need no
  database connection or credential. Runtime fails closed if config is missing.
- Email verification/reset/OAuth/MFA are deferred and explicitly unavailable.
  No email verification flag is fabricated.

## Draft lifecycle and concurrency

One active draft exists per `(user, slot)`; slot is general or a curated template.
A partial unique index enforces this under concurrent initialization. Template
links resume their saved slot instead of replacing it with defaults.

The wizard waits for restoration, keeps the four steps and review state, and
serializes debounced autosaves. Each write carries its expected version; the
update matches owner, ID, active state and version, then increments it. Stale tabs
receive 409. Errors, session expiry, retry and explicit discard/reload are visible.

A per-user, per-slot sessionStorage buffer retains unsent edits on that browser
until a successful save or explicit logout. It is not a shared offline store or
a replacement for the database. A mismatched server version pauses writes and
requires an explicit reload; it never silently overwrites newer saved data.

Saving a complete intent validates again and transactionally archives its draft
and creates one trip with a unique source-draft ID. Concurrent/repeated save
requests return the same saved trip. A delayed draft autosave cannot modify an
archived draft. After completion, the next planner visit opens a fresh active
draft. Saved records are read-only in this scope.

## Visual refinements

Main sections retain a 1280px cap with narrower desktop gutters. Small text and
secondary contrast were increased, and selected landing section gaps tightened.
The wizard caps at 1220px, with form left and large destination photography/live
summary right. Six explicit destination matches update the photo; all other
input uses labeled default inspiration, with no location inference or generation.
Mobile uses a single-column form and a compact photo/collapsible summary.

## Deferred boundaries

AI generation must later use durable real job stages and validated structured
results, with explicit base-city confirmation. PayPal, FX, ledger, bookings and
recovery remain server modules introduced with their own vertical slices. AI may
propose changes but cannot directly mutate financial state. TripWallet remains
a planning ledger, not a stored-value wallet. No Milestone 2 work is authorized.

All nine APIMatic TypeScript skills were verified during the foundation preflight.
At Milestone 3 load integrate-paypal first and follow its installed SDK map and
contract gates. No integration or sponsor-award claim is made by installation.

## Primary references

- [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next)
- [Better Auth security](https://better-auth.com/docs/reference/security)
- [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)
- [Drizzle/PGlite](https://orm.drizzle.team/docs/connect-pglite)
- Version-matched Next.js docs under `node_modules/next/dist/docs/`.

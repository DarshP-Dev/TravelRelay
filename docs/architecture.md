# Architecture — Milestone 2B

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

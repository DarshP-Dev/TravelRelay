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

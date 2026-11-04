# TravelRelay

An editorial travel planning workspace for the PayPal AI Hackathon.

**Current scope: Milestone 1B — authentication, private persistent trip intents,
and four-step wizard drafts.** AI generation, PayPal, bookings and Trip Recovery
are not implemented. No Milestone 2 work or deployment is included.

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
```

Tests exercise Better Auth and real disk-backed PGlite, including revocation,
unauthorized access, user isolation, validation, stale draft conflicts, idempotent
trip creation, and closing/reopening the database. No auth or database mocks are
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
- Review → Save trip intent atomically stores the user's dates, budget denomination
  and scope, preferences and departure/destination intent. Retrying this action
  cannot create duplicate trips for the same draft. No generation is simulated.
- Saved trip overview, private trip cards and resumable drafts on the dashboard.
  The existing dashboard empty composition is retained until actual trips exist.
- User IDs always come from verified sessions. Reads/writes constrain both owner
  and resource ID. API responses are not cached. Cross-user IDs return 404.
- Optimistic draft versions prevent stale tabs overwriting newer edits. A
  user-specific tab buffer protects unsent edits across refresh/reauthentication;
  conflicts require an explicit reload, not a silent overwrite. Explicit logout
  clears that user's local buffers. The database remains authoritative.

## Configuration

All assignments in `.env.example` are blank. Set values locally or through your
hosting provider's secret configuration. No auth/database value uses `NEXT_PUBLIC_`.

| Names                                    | Use                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `APP_URL`                                | Exact trusted origin, e.g. the local URL above or the deployed HTTPS origin |
| `AUTH_SECRET`                            | At least 32 random characters; `setup:local` generates it locally           |
| `DATABASE_URL`                           | Hosted PostgreSQL runtime connection; Neon pooled URL is suitable           |
| `DIRECT_URL`                             | Optional direct PostgreSQL connection for migrations                        |
| `DATABASE_DRIVER`, `LOCAL_DATABASE_PATH` | Explicit local PGlite selection and persistent directory                    |
| `ALLOW_LOCAL_DATABASE`                   | Local production-preview override only, not a serverless deployment option  |

OAuth, PayPal Sandbox, FX, model-provider and demo merchant names remain reserved
for future milestones. They are not working integrations. Only the future PayPal
public client identifier may use `NEXT_PUBLIC_`; secrets must remain server-only.

## Architecture

Next.js App Router + React + strict TypeScript + Tailwind/CSS tokens. Better Auth
handles authentication; Drizzle owns PostgreSQL tables and committed migrations.
PGlite supplies local PostgreSQL storage; `pg` supplies the hosted PostgreSQL path.
Zod validates incomplete drafts and complete trip intents separately.

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
- Saved trips are planning intents, not itineraries, reservations or supplier
  confirmations. Trip editing/deletion, generation, FX, ledger calculations,
  availability, checkout, refunds and recovery are future work.
- Curated content is hand-authored editorial seed data. Its non-live per-person
  USD estimates exclude flights/accommodation and are not bookable offers.

**Milestone 2 requires approval.** Its next task is validated AI itinerary
creation with durable job states and a confirmed base city; it has not started.

## Sponsors and licenses

Nine APIMatic PayPal TypeScript skills are available under `.agents/skills`.
Installation is not an integration or sponsor-award claim. Before PayPal work,
load `typescript-integrate-paypal`, follow its SDK map/contract-sheet gates and
companion skills. No PayPal/model SDK, Bryntum, or AG Grid is installed.

Existing project MIT license preserved. Unsplash photography sources are in
`docs/image-credits.md` and `/credits`; fonts include SIL Open Font License texts;
Lucide icons use the ISC License. Builds serve images/fonts locally.

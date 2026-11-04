# TravelRelay

A considered home for your next adventure, built for the PayPal AI Hackathon.

**Current delivery: Milestone 0 + the foundation portion of Milestone 1 only**,
as scoped by `TRAVELRELAY_CODEX_KICKOFF.md`. The approved product design is
provided in `TRAVELRELAY_DESIGN_FIXED.md` (the requested name
`TRAVELRELAY_DESIGN.md` does not exist in this checkout).

## Local development

Use Node.js 20.9+ (validated with Node 24) and npm.

```powershell
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). No credentials, database, or
environment file are required for this foundation preview. Destination images
and fonts are bundled locally; production builds do not fetch Google Fonts.

```powershell
npm run lint
npm run typecheck
npm run build
npm start
```

Lint uses ESLint directly; typecheck generates Next route types and runs strict
TypeScript. There is no automated unit-test suite in this UI foundation. Manual
route, browser interaction, keyboard and responsive checks are recorded in
`docs/validation.md`. `npm run build` produces the deployable Next.js app;
`npm start` serves that build. No deployment is included in this milestone.

## What works now

- Permanent editorial landing page with local destination photography, process,
  product workspace preview, inspirations, and future AI/PayPal explanation.
- Reusable tokens, components, accessible native controls, skip link, focus
  styles, reduced-motion support, desktop top navigation and mobile menu.
- Dashboard, My Trips and Profile honest empty shells.
- Explore with six hand-authored seed inspirations, clearly non-live per-person
  USD spending estimates, day-theme previews, and customization links.
- Four-step wizard form: destination/vibe choice, details and flexible dates,
  traveler count/pace, budget/currency/scope/style, optional preferences, review,
  and back navigation. Template links prefill editable single-base-city intent.
- Empty `/trips/preview` workspace and deep-linked Itinerary, TripWallet,
  Bookings, Explore tabs. Optional assistant panel communicates its unavailable
  state. Unknown trip IDs return 404 rather than invented trip records.
- Error/not-found/loading states, photo failure fallback, and public credits.

## Limitations — intentionally not connected

This is a public development preview, **not a complete Milestone 1 release**.
There is no authentication, database, draft persistence, trip saving, itinerary
generation, job system, live availability, booking, checkout, refund, FX feed,
or AI response. Wizard state lasts only while the form stays mounted; refresh
or navigating away clears it. It never claims a save or generation succeeded.
Use sample details, not sensitive traveler data.

Curated content is editorial seed data, not AI output. Costs exclude flights and
accommodation, are illustrative spending budgets for one person, and are not
live quotes. Workspace screenshots/layouts are clearly labeled previews.

## Configuration for later milestones

Copy `.env.example` to `.env.local` only when implementing the relevant service.
Every assignment in the example is blank. Configure values locally or in the
deployment provider's secrets dashboard; never paste credentials into chat.

| Variables                                                                             | Planned purpose                                                                                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `APP_URL`, `AUTH_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`          | App origin and proposed Auth.js Google OAuth setup; no provider is connected yet                                   |
| `DATABASE_URL`, `DIRECT_URL`                                                          | Pooled runtime and direct migration PostgreSQL/Neon connections                                                    |
| `PAYPAL_ENVIRONMENT`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` | Server-only Sandbox configuration and webhook verification; implementation must reject mismatched host/credentials |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID`                                                        | Only the public Sandbox client ID, if needed by future checkout; never a client secret                             |
| `FX_API_BASE_URL`, `FX_CACHE_TTL_SECONDS`                                             | Future FX adapter source/cache; expected Frankfurter estimates, source and date required                           |
| `MODEL_PROVIDER`, `MODEL_NAME`, `MODEL_API_KEY`                                       | Future server-only model adapter; provider choice deferred                                                         |
| `ENABLE_DEMO_MERCHANT`                                                                | Future server-only explicit demo control flag                                                                      |

All variables are reserved configuration names, not working integrations.
Keep `.env.local` untracked. `.gitignore` excludes `.env*` except `.env.example`,
private key files, dependencies and build artifacts. Only explicitly public
identifiers may ever use the `NEXT_PUBLIC_` prefix.

## Structure and implementation notes

```text
src/app/                  App Router pages, root layout, theme and error states
src/components/           Shared UI, navigation, cards, image fallback, wizard
src/lib/curated-trips.ts   Explicitly editorial inspiration data
public/images/            Licensed destination photos, served locally
public/fonts/             Locally served open-licensed fonts and license texts
docs/                     Architecture, attribution and validation notes
scripts/                  Optional asset download helper, not used by builds
```

See `docs/architecture.md` for the scope interpretation and decisions. Semantic
HTML plus small reusable components avoid a large UI kit. PostgreSQL/ORM and
auth dependencies will be selected with the real persistence slice.

## Roadmap and next task

1. **Milestone 0 / Milestone 1 foundation:** this delivery.
2. **Remaining Milestone 1:** secure sign-in, ownership-scoped PostgreSQL trip
   schema, durable wizard drafts, save/reopen trip intent, and real dashboard
   records. This is the exact next development task; AI generation stays off.
3. **Milestone 2 (requires approval):** validated AI itinerary generation, durable
   real job states and explicit proposed itinerary edits.
4. **Milestone 3:** FX-aware planning ledger and verified PayPal Sandbox checkout
   for controlled demo merchant experiences.
5. **Milestone 4:** cancellation recovery, verified refunds and separately
   approved replacement purchases.
6. **Milestone 5:** cross-device polish, integration tests, deployment and demo.

### Sponsor setup

All nine APIMatic PayPal TypeScript skills were verified present/readable under
`.agents/skills`: integrate-paypal, getting-started, authentication,
calling-endpoints, client-initialization, configuration-resilience,
error-handling, models, testing (all names prefixed `typescript-`).

Setup alone is not a functional integration or sponsor-award claim. At the
PayPal milestone use `typescript-integrate-paypal` first, complete its installed
SDK map and `paypal-plan.md` contract gate, then apply its companion skills to
orders, server-side capture verification, refunds, error handling and tests.
No PayPal SDK calls exist yet. Bryntum and AG Grid are not installed.

## Asset credits and license

Photography from [Unsplash](https://unsplash.com/license); photographer-specific
credits and source URLs are in `docs/image-credits.md` and `/credits`. Fonts use
the SIL Open Font License; license texts are bundled in `public/fonts`. Lucide
icons use the ISC License. The existing project MIT license is preserved.

The optional `python scripts/download-assets.py` helper can refresh the selected
assets with network access; ordinary installation/build does not need it.

# Architecture and scope

The kickoff explicitly limits this run to Milestone 0 and the foundation of
Milestone 1. The broader design's Milestone 1 exit (auth and database persistence)
is **not** claimed by this delivery. No Milestone 2 implementation is included.

## Source of truth

The provided design is named `TRAVELRELAY_DESIGN_FIXED.md`; there is no
`TRAVELRELAY_DESIGN.md` in this checkout. It was read completely alongside
`TRAVELRELAY_CODEX_KICKOFF.md`. Both are preserved without edits.

## Choices made before implementation

- Single full-stack Next.js App Router application, React, strict TypeScript,
  Tailwind CSS. No separate backend or static-export restriction.
- Semantic HTML controls and small reusable components instead of a large UI kit.
  Lucide supplies consistent accessible decorative icons.
- CSS theme tokens express the approved warm white, teal, deep green, gold,
  spacing, radii, and typography. Locally served Plus Jakarta Sans headings and
  Inter body fonts avoid a build-time Google Fonts dependency; system fallbacks
  remain usable offline. Serif is restricted to the landing headline.
- Server-rendered pages by default. Client components only for mobile navigation,
  image fallback, and wizard interaction. No credential configuration is imported
  into the browser and no service calls are implemented.
- Six hand-authored destination inspirations, explicitly labeled editorial
  examples with non-live illustrative planning estimates. They are not AI output,
  supplier inventory, bookable offers, or saved user trips.
- Wizard is a navigable form foundation with validation, template defaults,
  backward navigation and a review screen. It does not submit, persist or generate
  trips. The interface says so before data entry; refresh clears the form.
- Trip workspace uses `/trips/preview` with deep-linked tabs, clearly presented as
  an empty layout preview. No invented itinerary, spending, or booking records.
- Authentication, PostgreSQL/ORM, jobs, AI, FX, merchant and PayPal modules will
  be introduced with their actual vertical slices, avoiding speculative services.
- No Bryntum, AG Grid, PayPal SDK or model-provider SDK installed. No deployment
  in this repository milestone.

## Structure

`src/app` owns routes and layouts; `src/components` owns shared primitives and
feature UI; `src/lib/curated-trips.ts` owns static inspirations. `public/images`
and `public/fonts` hold licensed local assets. `docs` records architecture and
attribution. Next.js can host server routes/actions alongside pages later.

## Later boundaries

Auth must enforce ownership for every trip read/write. Trips and wizard drafts
will persist to PostgreSQL. Generation must use durable real job stages and
validated structured results. PayPal, FX, model-provider, booking, budget-ledger
and recovery adapters remain server-only; client components receive safe DTOs.
TripWallet will be a planning ledger, not a stored-value account. AI proposals
require explicit preview/approval and cannot directly mutate financial state.

## APIMatic preflight

All nine TypeScript skills exist under `.agents/skills` and are readable:
integrate-paypal, getting-started, authentication, calling-endpoints,
client-initialization, configuration-resilience, error-handling, models, testing
(each prefixed `typescript-`). This is setup verification only, not a completed
integration or sponsor claim. At Milestone 3 load integrate-paypal first, follow
its map/contract-sheet gates, and use the companion skills for Sandbox orders,
verified captures, refunds, error handling and integration tests. Never guess
SDK contracts or install a similarly named package without skill verification.

# Milestone 2B — trip creation and curated personalization

Implemented November 4–5, 2026, on Windows, Node 24.22.1. No live OpenAI/Gemini
requests, deployment, push, PayPal, Bryntum or Trip Recovery work.

## Completed behavior

- All six existing editorial inspirations have public photo-led preview routes,
  explicit non-live per-person USD estimates and Customize links. Templates are
  hand-authored starting points, not pre-generated AI trips or bookable offers.
- Customize preserves its template through sign-in. New template drafts prefill
  city/country and interests; users supply dates/departure, confirm their traveler
  count and enter a group budget. Template length is editable, interests may be
  removed, and the existing four steps/photo summary/autosaves remain. Reopening
  an existing template slot preserves its edits instead of reapplying defaults.
- Optional template provenance and traveler confirmation persist within the
  existing JSONB intent. The shared AI prompt receives bounded editorial themes
  as optional context, with current user choices authoritative. Both providers
  retain identical schemas and the full existing acceptance pipeline.
- Custom trips retain known-destination/discovery paths. Wizard length checks now
  match the engine's existing 1–14-day limit before generation; legacy longer
  intents remain saved. Single-base-city behavior is unchanged; multi-city is
  not implemented, even when requested in free text.
- Cinematic generation reflects real queued, choosing, awaiting-confirmation,
  generating, validating, failed and complete states. It shows real attempt/update
  information, restores on refresh/sign-in, checks saved state after reconnect,
  and reveals no partial itinerary. Provider retries require an explicit action.
  Failure/exhaustion offers revision copies without changing the archived source.
- Dashboard/My Trips expose owner-scoped job state and completed plan estimates,
  dates and traveler counts. Overview shows three visual day cards, View all, and
  stable links to full detailed days. Timelines retain start/end times, durations,
  geography, buffers, cost/category/source labels and the separate reserve.
- Global navigation, trip tabs, landing composition, design tokens, typography
  and local photos are preserved. Ask TravelRelay remains visible with editing
  unavailable; no payment or booking states are fabricated.

## Automated checks

The suite contains **69 tests** (63 existing + 6 new). The new integration file
uses real Better Auth sessions, application handlers, migrations and disk-backed
PGlite, with an explicitly authored model boundary that cannot contact a provider.

Coverage includes all six template prefills and required personal details, edit
restoration, complete saves, queued/confirmation/generation transitions, hidden
partial output, strict schema/domain/quality/budget acceptance, archived drafts,
atomic completion, all six generated records after database reopen/fresh login,
owner-scoped lists/audits/read/write denial, failure and stale-job explicit recovery,
shared provider context, and truthful stage/retry presentation. Offline candidates
are test-only; they are not new evidence of live model quality at six destinations.

The original 63 checks, exact recorded Sol replay, normalization, meal/opening-hour/
geography constraints and reserve/food accounting remain. Existing template-save
tests now explicitly supply budget/traveler confirmation and expect city/country.
One old Kyoto-only expectation failed on the initial full run; its corrected
expectation reflects the intended qualified prefill, not a persistence/validator
relaxation.

Final command results and production smoke/credential checks are recorded at the
top of [validation.md](validation.md).

## Production browser review

An isolated production-preview account/database was used; external fetch was
blocked and no provider keys supplied to that process. The exact accepted real
Sol recording seeded its completed-trip UI, clearly as an offline replay. The
original failed record is preserved. Development accounts/trips were untouched.

Verified public Paris preview → Customize → protected login return → wizard;
entered London departure, April 15–18, 2027, two travelers with confirmation,
€2,500 whole-trip budget; removed template Art interest, retaining Food/Culture.
Autosaved review survived refresh and Save opened the real persisted generation
page. Starting with missing QA credentials produced an honest configuration
failure, retained input and explicit retry, **without a provider request**.

Verified three overview cards, View all revealing day four, and day-four link
opening its stable timeline anchor. Reserve remains €250, genuinely unallocated
€226 and allocation plus reserve €2,274. Detailed activities and unverified/source
labels remain intact. Responsive checks cover 360/390/768/1440px, including local
card scrolling rather than page-level overflow. Screenshots are under
`docs/screenshots/milestone-2b-*`.

## Hosting blockers and remaining limitations

The [hosting/recovery runbook](generation-hosting.md) specifies PostgreSQL, secure
server-only secrets, HTTPS, Node `after()` support, a 240-second execution/drain
window, shared quota/lease behavior, monitoring and explicit five-minute stale
recovery. The 63.727-second recorded latency fits current limits. A short-lived
host, static export or host that freezes after responses is unsuitable.

No public host or hosted PostgreSQL was provisioned/tested. This implementation is
recoverable persistent state, not a durable distributed queue; hard termination
can lose an in-flight result and explicit retry may incur another charge. No
automatic retry/fallback is used to conceal that limitation.

No live test of the new curated context was authorized, so provider output quality
for personalized templates remains to be checked separately. All generated prices,
routes, coordinates and unsourced venue details remain estimates. Orsay is the
only current dated opening-hours reference; none establish future availability.
Existing email verification/reset/OAuth/MFA limitations remain. AI editing,
multi-city, bookings, FX/ledger/payment execution and recovery remain deferred.

Changes are committed locally with DarshP-Dev attribution on
`codex/milestone-2b-trip-experience`; nothing is pushed. The approved uncommitted
2A implementation is preserved in a separate baseline commit on that branch.
No Milestone 3 work is started.

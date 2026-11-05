# Milestone 3A — Interactive itinerary and scheduling

Implemented on `codex/milestone-3a-interactive-itinerary`, preserving the approved
editorial identity, global navigation, workspace tabs, generation engine and
original audit records. No OpenAI/Gemini request, push, deployment, payment or 3B
assistant work was performed. QA used the recorded Sol Paris itinerary in an
isolated local database; development account data was not used for browser edits.

## What works and how to use it

1. Sign in, open a generated trip, and select **Itinerary**. Chronological cards
   remain the default. Pick a day, choose **Add activity** or **Edit**, and supply
   title, description, category, location, trip date, local start/end, arrival
   buffer, group estimate and optional known coordinates/reference links.
2. **Preview changes** runs server checks and budget reconciliation. Review
   proposed times, projection delta, reserve/remaining budget and any conflicts
   or suggestions. **Confirm & save changes** persists an audited revision;
   **Discard** leaves the saved itinerary unchanged. Overruns require explicit
   acknowledgement and never consume/reclassify the emergency reserve.
3. **Reorder earlier/later** proposes every affected time/buffer. **Edit → Trip
   date** moves an activity between existing trip days. Dates/times are local to
   the trip, independent of the browser's timezone. IDs and currency remain stable.
4. **Delete** opens an explicit financial/schedule confirmation. **Undo latest
   saved edit** previews restoration in another audited revision. The history
   lists the latest 20 edits; complete snapshots remain in SQL. Concurrent changes
   require a saved-version reload; no silent merge or overwrite occurs.
5. **Visual schedule** adds real day/time drag-and-drop and edge resize. Gestures
   open the identical proposal path; the scheduler cannot save around the server.
   **Location map** shows that day's stored points and an accessible location
   list. Select a marker/list item to highlight its chronological card. All form
   and reorder controls remain available on touch/keyboard-only devices.

Changes survive refresh, fresh sign-in and closing/reopening the database.
Overview, Dashboard and My Trips read the same stored plan and updated estimates.
The docked **Ask TravelRelay** boundary is preserved and explicitly unavailable;
manual actions do not start model jobs or alter their original generation audits.

## Bryntum availability and licensing

The npm registry and installed `package.json`/license were verified before
integration: **`@bryntum/scheduler-community@8.0.0` is MIT**, with matching
core/grid/engine Community packages. Real drag, resize, resource rows, timescale
zoom and React-managed lifecycle are implemented. No commercial trial package,
private registry, license key or expiring trial was used. The commercial trial
is a different package and is not a dependency. The React wrapper is unnecessary
for this imperative client-only integration.

Version-matched installed SDK source/types were used for v8 drag/resize finalization;
the published Next.js guide still showed an older product release when checked.
Each gesture is reverted inside the widget, then proposed through the editor API.
The shared clock-only display axis never becomes a saved trip date. Full activity
names and actual trip dates/times are available in accessibility labels/cards;
zoom changes scale only. Font Awesome Free CSS/fonts ship locally, avoiding the
vendor's automatic CDN fallback. MIT/BSD and vendor third-party notices ship under
`public/licenses` and are linked from `/credits`.

Primary references: [Bryntum tiers/licensing](https://bryntum.com/tiers-faq/),
[Next.js integration guide](https://bryntum.com/products/scheduler/docs/guide/Scheduler/quick-start/nextjs),
and installed `node_modules/@bryntum/scheduler-community/{LICENSE,scheduler.d.ts}`.
There is no Bryntum licensing blocker for the integrated Community features.

## Map and social references

**Leaflet 1.9.4 (BSD 2-Clause)** renders optional OpenStreetMap raster tiles from
`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, with visible attribution and a
map-issue link. No credential, geocoder, router, distance matrix, fabricated
coordinate or route line is introduced. Existing AI coordinates and user-entered
points are labeled unverified; missing points remain null and appear in the list.
Tile failure leaves the list/cards usable. Tiles load only in map view through
ordinary browser requests/cache/referrers, with no prefetch/bulk download. The
tile provider receives normal map-tile requests (revealing the viewed area);
private session cookies and trip/account IDs are not sent to it.

[OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) applies:
the public tile service is best-effort, may block excessive use and has no SLA.
There is no configured paid provider or API fee/key; sustained production traffic
needs an appropriate tile provider/capacity arrangement, with its own terms/costs.
Leaflet's [stable API](https://leafletjs.com/reference-1.9.4.html) is the map basis.

Each activity supports up to five labeled public HTTPS references. The server
rejects non-HTTPS schemes, credentials and obvious local/private hosts, bounds
URLs/text, and never fetches links. Instagram/TikTok/YouTube labels derive from
the actual hostname; other sources show their hostname. Links use a new tab with
`noopener noreferrer`. No embedded tracking, fabricated posts/creators/engagement,
availability fetch or endorsement is presented. Deleted/private content may fail
at its original source; the itinerary remains usable and references can be removed.

## Persistence, validation and finances

Migration **`0004_overjoyed_infant_terrible.sql`** adds `trip.itinerary_version`
and owner-scoped `itinerary_edit` snapshots/indexes. It was applied successfully
to the existing local development PGlite database with its server stopped, and
to isolated fresh/reopened test databases. Existing trip JSON starts at revision
zero; no destructive data conversion is required. Hosted PostgreSQL is supported
by existing Drizzle conventions but has not been provisioned/tested in this run.

New authenticated APIs are `GET/POST /api/trips/{id}/itinerary` and
`POST /api/trips/{id}/itinerary/preview`. Mutations are strict-schema, bounded JSON,
same-origin and owner-scoped. Commit repeats all checks and atomically applies a
compare-and-swap version plus append-only service history. Duplicate save retries
are idempotent; mutation ID reuse for different edits is rejected. Anonymous
requests return 401, foreign resources 404, stale writes 409 and unsafe edits 422.

Hard checks preserve actual gaps/declared buffers, overlaps, calendar-day/trip
boundaries, single-base-city coordinates, published venue hours/last admission,
unknown indoor visiting windows, valid money/currency/coordinates and unique IDs.
The same geographic transfer assumptions/accessibility increment are reused.
With missing coordinates, only the minimum buffer can be checked; uncertainty
is explicit. No unrequested schedule normalization moves other activities.
Reorder is an explicit multi-time proposal, never a silent repair.

Pace, short experiences, missing food stops, meal-start guidelines, repeated
published venues and original unverified arrival/departure planning windows are
traveler-edit suggestions. Actual travel arrangements are not known. These do
not weaken the unchanged AI response schema or generation acceptance validators;
the complete original 2A/2B regression suite still passes. Source-checked venue
metadata takes precedence over manual category labels. Rue Vieille-du-Temple
remains a street, with its original classification regression preserved.

The existing server-authoritative `calculatePlanningBudget` is reused with
explicit activity categories. Inclusive food/transport allocation = itemized
estimates + retained additional allowance, counted once. Reserve is always
separate from unallocated funds; no actual spending/FX/payment accounting exists.
Stable expense day/activity references, trip currency, integer minor units and
manual/AI estimate provenance remain available for future TripWallet work.
The original fixture remains €2,274 including €250 reserve and €226 remaining.
Browser QA added a €25 food stop: food became €525 (€350 itemized + €175 allowance),
total €2,299, reserve €250, remaining €201. Moving it and changing cost to €30
produced €2,304 / €250 / €196, not another food-allowance charge.

## Validation evidence

| Check                               | Result                                                                                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full automated suite                | **81 passed**, zero failures (69 retained + 12 new); no live transports                                                                                                                                                           |
| Focused editor integration          | CRUD, cross-day movement, chronological reorder, explicit delete/undo, source add/remove, missing coordinates, budgets/currencies, concurrency, idempotency, ownership, body/origin/schema protections and database reopen passed |
| Scheduling safety                   | Overlap, genuinely insufficient travel gap, off-base coordinates, calendar boundary, source-checked hours and unknown indoor windows rejected; suggestions distinct from hard failures                                            |
| Bryntum adapter/UI                  | Stable day/activity IDs, wall-clock drag/resize conversion, integer bounds and safe text rendering tested; actual drag/save and resize/save/refresh exercised in production browser                                               |
| Production HTTP                     | **46 assertions passed**: authenticated preview/save/undo, no-store, invalid requests, denied overlapping save, stale/idempotent writes, foreign reads/previews/writes, protected/public pages and license assets                 |
| Credential boundary                 | **38 public build assets** scanned against three configured private values; no match or frontend OpenAI/Gemini transport                                                                                                          |
| Lint, TypeScript, formatting, build | Passed; `git diff --check` passed                                                                                                                                                                                                 |
| Responsive UI                       | 360/390/768/1440px: no page horizontal overflow; day/time scrolling stays within its control; complete mobile edit, move, reference removal, save, deletion/undo and conflict preview exercised                                   |
| Map                                 | Real OSM tiles/attribution loaded; day switching, missing-coordinate list and selected-card highlighting verified                                                                                                                 |
| Dependency audit                    | 12 moderate advisories in existing lint/migration tooling chains; zero high/critical; no Bryntum/Leaflet advisory reported. No forced unrelated upgrades                                                                          |

Production QA used a separate database and runtime with blank model keys plus
an outbound fetch guard. Full-suite model tests use recorded/explicit test
provider-boundary fixtures; no generation was presented as a new live result.
The original generation-attempt audit remained byte-equivalent through manual
editing and SQL reopen checks. Read-only public example behavior remains intact.

Visual evidence:

- [Desktop schedule](screenshots/milestone-3a-schedule-desktop.png)
- [Desktop map](screenshots/milestone-3a-map-desktop.png)
- [Mobile activity editor](screenshots/milestone-3a-editor-mobile.png)
- [Mobile proposal](screenshots/milestone-3a-preview-mobile.png)
- [Mobile conflict](screenshots/milestone-3a-conflict-mobile.png)
- [Mobile visual schedule](screenshots/milestone-3a-schedule-mobile.png)

The spacious chronological layout, existing photography/palette/type, global
navigation, horizontal workspace tabs and future assistant dock were retained.
The scheduler is an optional bounded surface; mobile forms/cards remain the
primary accessible alternative. Long event names have complete accessible labels
and cards; the optional widget can horizontally scroll/zoom.

## Remaining limitations and 3B boundary

- Coordinates and unsourced venue hours/prices remain unverified. There is no
  route engine, live opening-hours/availability lookup, social embed or FX conversion.
  Published venue references are dated snapshots, currently the existing limited
  reference set; check future operating hours directly before travel.
- One trip currency and existing trip dates/base are fixed. Editing trip-wide
  dates/base, bulk operations, automatic conflict resolution and multi-user
  collaboration are outside 3A. A stale edit needs an explicit reload/reapply.
- Undo covers the latest edit. History is retained in SQL, with only the latest
  20 revisions listed; it is not a financial ledger or tamper-evident audit system.
  Local unsaved forms are not autosaved; save/discard and browser unload protection
  are provided. The persistent trip/wizard draft is not affected by manual failures.
- Browser checks cover desktop/tablet/mobile viewports, not every native device,
  screen reader or browser. Narrow schedules scroll inside the optional widget;
  accessible form/time/day/reorder controls require no drag.
- Existing authentication recovery/email verification and hosted PostgreSQL,
  backups, production tile capacity and the **240-second Node `after()` execution
  contract** remain deployment setup. Manual edits are short transactional API
  requests and do not introduce a new background execution requirement. The
  [existing generation/recovery runbook](generation-hosting.md) remains authoritative.
- The 12 moderate tooling advisories require a separate compatible dependency
  maintenance decision; no unrelated upgrade or validator change was made.

**Milestone 3A is ready for review.** Milestone 3B can use the modular
preview/assessment/versioned-commit service and stable IDs for explicit proposed
changes, preserving user approval and auditing. No AI editing agent, paid request,
PayPal operation, TripWallet accounting or Trip Recovery was implemented.

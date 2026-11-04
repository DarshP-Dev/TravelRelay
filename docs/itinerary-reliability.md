# Milestone 2A targeted reliability pass

Implemented November 4, 2026. Validation is offline: **zero new live Gemini
requests**. Model `gemini-3.5-flash-lite`, SDK configuration, compact provider DTO,
strict response schema, authentication, quota controls and persistent job lifecycle
are preserved. No automatic repair request, fallback or retry was added.

## Safe normalization before acceptance

The pipeline now strictly parses the raw provider response, runs
`normalizeTravelBuffers`, then runs the existing strict `validateItinerary` and
`validateItineraryQuality` before the atomic save. Normalization clones its input;
the recorded response remains unchanged. It changes only understated interactivity
buffers, never dates, start times, durations, locations or costs.

Required travel minutes use the same assumptions as the quality gate: distances
up to 2km use walking at 4.5km/h plus 10 minutes with a 15-minute floor; longer
distances use 20km/h plus 20 minutes with a 30-minute floor. An accessibility
preference adds the existing 10-minute allowance. No threshold was relaxed.

A correction is permitted only when the existing gap accommodates the required
minimum. Insufficient gaps are rejected. Larger declared buffers are never reduced;
the strict validator still rejects them when their schedule gap is insufficient.
First-activity arrival times are unknown and are not invented or normalized; the
existing arrival-buffer check remains mandatory. Derived buffers must still fit
the strict schema limits.

Accepted plans store `normalization.corrections` with activity/day indexes,
original/corrected minutes, available gap and calculation basis. The itinerary
shows these corrections at the activity and in its assumptions disclosure.
Rejected outputs are not saved as trips; their existing safe job-error flow and
archived original draft remain intact.

## Category allocations versus expense estimates

The unchanged model fields `foodMinor`, `localTransportMinor`, `flightsMinor` and
`accommodationMinor` now have explicit **inclusive category allocation** semantics.
They cover itemized estimates plus an allowance for additional unitemized costs.
The prompt supplies this contract. Itemized food/transport activity estimates are
included in those allocations, rather than added again. Non-food activity estimates
form the other-activities allocation.

New version-2 itineraries carry a versioned, server-calculated `budget`:

- Category allocations, their included itemized estimates and their additional
  unitemized allowance. A category below its itemized estimates is rejected; the
  server never drops expenses or expands a category to force success.
- Separate planning-expense rows linked to persisted day/activity IDs, with
  integer minor units, currency, category and estimate provenance.
- In-scope itemized subtotal, unitemized allowance, allocation subtotal, separate
  emergency reserve (unchanged 10% of the selected budget), total including reserve
  and unallocated remaining budget.
- Spending-only exclusions for return travel/accommodation, without silently
  removing their disclosed allocations.

The UI distinguishes these amounts and explains that an unitemized allowance is
an assumed planning envelope, **not a verified expense or extra charge**. Food with
zero itemized cost is described as unitemized within its allowance, not a free meal.
No actual spending, wallet balance, booking, transaction or FX conversion is created.

Classification uses shared, versioned title/location rules and explicit food wording
in the prompt. Obvious mixed food/admission/transport estimates are rejected rather
than assigned an invented split. English lexical classification is imperfect;
ambiguous/local-language/composite experiences still need review. Individual currency
tags and stable source IDs prepare for later TripWallet reconciliation and FX while
keeping planning estimates separate from future actual transactions. No multi-currency
conversion or TripWallet functionality is implemented now.

Existing version-1 plans retain their original saved amounts and metadata. They
are labeled as predating the latest checks; viewing them does not recalculate,
normalize or silently migrate them. JSONB additions require no SQL migration.

## Meal and venue quality

The structured planning brief and instructions now require:

- Full and single days: a substantial lunch of at least 45 minutes starting
  **11:30–14:30**, or a full **60-minute free opportunity within that window**,
  excluding transfers and other activities. The existing lunch timing thresholds
  are preserved. Coffee, pastries and tastings alone no longer count as lunch.
- Full and arrival days: a substantial dinner of at least 45 minutes starting
  **18:00–21:00**, or a full free hour in that window. Explicitly labeled lunches
  or dinners outside their start windows fail even if another free meal opportunity
  exists. An unscheduled evening can provide the dinner opportunity; there is no
  invented restaurant reservation.
- Specific streets, neighborhoods or named venue suggestions. City-only and
  “Central Paris”/downtown/city-centre placeholders fail the strengthened location
  check. The model must not fabricate verified service, access or availability.

Pace/day-role targets, activity durations, interests, duplicate venues, single-city
bounds, published hours, strict schema bounds and scheduling checks remain in place.
Only Orsay currently has a dated official published-hours reference. A suggested
venue, free meal opportunity or source snapshot does not verify future opening,
restaurant service, meal substance, prices, dietary suitability or accessibility.
Meal classification and venue specificity remain conservative lexical checks,
not independent real-world verification; cultural service-hour exceptions may need
richer timing data or future explicit policy support.

## Recorded Paris regression

`tests/fixtures/paris-quality-recorded.json` contains the unchanged failed live
response, original input/base and recorded token usage. It is test-only, never a
runtime fallback. Its raw plan is checked against the earlier ignored live report.
The separate ignored `.test-data/reliability-offline-latest.json` records the new
offline findings; the historical live API report is not rewritten.

- The Bastille stop's supplied coordinates require **35 minutes**; its declared
  **30** is corrected within the existing **60-minute gap**, without moving it.
- A **34-minute** gap is rejected; an exact 35-minute gap can be normalized.
- Food allocation **EUR 450** includes **EUR 280** itemized food experiences plus
  **EUR 170** unitemized allowance. Non-food activities are EUR 32.
- In-scope itemized estimates are **EUR 312** and unitemized allowances **EUR 1570**.
  Their allocation subtotal is **EUR 1882**; with **EUR 250** emergency reserve,
  total is **EUR 2132**, leaving **EUR 368**. This replaces double-counting EUR 280
  in the new calculation; no underlying estimate was erased or reduced.
- The unchanged raw plan still fails **four** genuine quality findings: arrival
  dinner at 17:30, Saturday's lack of substantial lunch/free hour, Saturday dinner
  at 15:30 and “Central Paris” as the departure café location. Correcting the buffer
  does not make these failures acceptable.

A clearly authored offline test candidate fixes those meal/location issues and
proves normalized buffer history, reconciled budget, activity-linked expense IDs,
owner isolation and the entire accepted plan survive SQL close/reopen. This is not
a new Gemini result, and the application does not perform these meal/location edits.

## Validation and remaining limits

- **49 automated tests passed**, including authentication/authorization, schema
  protection, original quality rules, normalization boundaries, insufficient gaps,
  food/transport allocation consistency, mixed-category rejection, JPY/spending-only
  behavior, meal opportunity/timing (including rest-placeholder transfer buffers),
  raw-recording rejection and durable audit data.
- Lint, type-check, production build, format and whitespace checks passed.
- Production HTTP checks passed for 13 routes. Budget display and overflow checks
  passed at 360, 390, 768 and 1440px. Screenshots are saved under `docs/screenshots/`.
  A configured-private-value scan passed for 23 public build assets and the new
  fixture. See [validation.md](validation.md).
- No live request was made. The new prompt's real model compliance and failure rate
  remain untested. The earlier live response is a regression case, not proof of
  acceptance under the new contract. Further live validation requires new approval.
- Routes, hours, prices, source coordinates, exact arrival/departure timing and
  semantic dietary/accessibility suitability remain unverified planning assumptions.

The targeted implementation is ready for code/visual review;
final live quality sign-off remains pending. No Milestone 2B, PayPal, recovery,
Bryntum, deployment, commit or push was performed.

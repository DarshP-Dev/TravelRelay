# Milestone 2A — final offline acceptance

November 4, 2026. **Full offline acceptance passes; ready for Milestone 2A sign-off.**
No additional OpenAI/Gemini requests, model fallback, deployment or push occurred.
This is reprocessing of the actual recorded GPT-6.1 Sol response, not a new live
generation or a claim that the original failed attempt succeeded.

## Targeted fixes

Venue classification now prioritizes directly matched server-owned venue metadata,
then structured activity-category hints, then address-aware activity context.
Street/address clauses are excluded from attraction and interest inference:
the 18:00 bistro on Rue Vieille-du-Temple is dining, not a temple visit. Museum
Street and Gallery Road receive the same protection. The compact provider schema
is unchanged; food/transport hints come from the existing server-reconciled expense
categories, not new provider claims. Classification basis is stored in quality v3.

Actual indoor visits still receive the existing conservative 10:00–17:00 window
without a trusted reference. Published venue schedules override conflicting food
hints. Contradictory/ambiguous indoor activity types require clarification; unknown
venues remain unverified. No pace, meal, duration, geography, travel-buffer,
opening-hours or budget thresholds were relaxed. Activity times are never moved.

Financial summaries now render reconciled server amounts instead of model budget
prose. The original response (including its incorrect €476 prose) remains unchanged
in the recording and saved explanation for provenance. The UI does not repeat that
prose as a budget summary. A shared prompt instruction also leaves these summary
figures to the server; it has not been tested with another live request.

| Recorded Paris budget             | EUR, two travelers |
| --------------------------------- | -----------------: |
| Return travel allocation          |               €480 |
| Accommodation allocation          |               €780 |
| Food allocation                   |               €500 |
| Local transport allocation        |               €220 |
| Other activities                  |                €44 |
| Allocations before reserve        |         **€2,024** |
| Separate emergency reserve        |           **€250** |
| Allocation plus reserve           |         **€2,274** |
| Genuinely unallocated from €2,500 |           **€226** |

Food's €325 itemized activities sit inside its €500 allocation, leaving €175
unitemized allowance. Across all categories: €369 itemized plus €1,655 unitemized
equals €2,024. These remain group estimates, not spending, verified prices or FX.

## Exact recorded response and persistence

The portable fixture `tests/fixtures/paris-sol-recorded.json` retains all original
provider fields and a SHA-256 of the raw plan. The replay uses the same Paris,
April 15–18, 2027, balanced, Culture/Food, two-traveler, €2,500 intent and confirmed
base. It enters the actual application generation worker at the model boundary;
network access is forbidden. It passes strict Zod schema, normalization, core
single-city/date/schedule/geography/currency/budget validation, reconciliation and
the full quality gate. **Zero buffer corrections and zero quality findings.**

Every original activity title, description, date, start, duration, coordinates,
location, declared buffer and cost persists unchanged. Server IDs and validation/
budget metadata are added normally. A real Better Auth session and disk-backed
PGlite exercise queued → generating → validating → complete, archived source
draft retention, atomic save, database close/reopen and exact retrieval.
Anonymous API reads return 401; foreign-owner itinerary/job reads are denied.
Existing cross-user write/auth tests remain in the full suite.

The historical live failure is preserved in its ignored timestamped report,
whose hash is checked before/after the manual replay. Its sanitized audit scalar
values, original validation failure, timestamps and real usage are imported into
the isolated QA database with QA ownership IDs. A separate **offline replay**
attempt is accepted; it has null usage and no fabricated API charge. Audit history
survives reopen unchanged. Production/development trip data is not modified.
Ignored replay evidence is `.test-data/sol-offline-acceptance-latest.json`.

## Itinerary quality and UI

The unchanged plan has 11 activities (2 / 4 / 4 / 1), meeting balanced pace and
lighter arrival/departure windows. Culture is represented by Orsay and neighborhood
walks; Food by five substantial seated meals. Full-day lunches start 12:30 and
12:00; dinners start 18:00. Durations are 60–120 minutes with declared 30-minute
buffers, plus 45 minutes before Canal Saint-Martin. Scheduling and distance checks
pass without correction. Orsay remains Friday 10:00–12:00, inside its stored
09:30–17:30 published visitor reference and 17:00 last admission.

The production-built authenticated Overview and Itinerary views were inspected
using the exact persisted replay, not an authored substitute. Four day cards,
start/end times, durations, costs, reserve/remaining figures, source links and
unverified labels render correctly. Global navigation/workspace tabs remain;
Ask TravelRelay opens with editing explicitly unavailable and its input disabled.
Desktop 1440px and mobile/tablet 360/390/768px have no page-level horizontal
overflow. Screenshots:

- [Desktop budget](screenshots/milestone-2a-offline-acceptance-desktop.png)
- [Desktop activities and source labels](screenshots/milestone-2a-offline-acceptance-activities.png)
- [Mobile budget](screenshots/milestone-2a-offline-acceptance-mobile.png)
- [Mobile activities](screenshots/milestone-2a-offline-acceptance-mobile-activities.png)

Orsay's stored official-source snapshot is dated November 4, 2026; future opening
hours/availability are not guaranteed. Restaurant streets are suggested areas,
not verified named restaurants. Other venue hours, prices, coordinates and routing
remain AI estimates. No new venue verification requests were made.

## Latency and hosting contract

The original **63.727-second** provider response fits the unchanged 150-second
model timeout, 180-second worker/quota lease, five-minute stale recovery and
240-second Node route duration. These values are centralized and regression-tested;
Next's route retains its required literal `maxDuration = 240` export.

Generation POST returns queued state before `after()` runs the worker. Short GET
polls read persistent state; no browser request waits 64 seconds for the model.
The UI explains that planning may take a minute or two and users can return.
An offline clock-controlled 64-second wait test aborts the initiating request,
confirms the job remains generating with no visible partial itinerary, then allows
the exact response to complete and verifies persistence after reopen.

Deployment must provide PostgreSQL and Node hosting that honors `after()` and a
240-second execution window. This repository is not deployed/host-verified in this
pass. Persistent jobs are not a durable distributed queue: abrupt process/host
termination cannot resume an in-flight provider call. Stale work becomes visibly
recoverable after five minutes and requires an explicit retry; no silent extra
request occurs. A short-duration host is unsuitable without a future queue worker.

## Validation

- `npm test`: **63 passed**, zero failures, no live transports.
- `npm run lint`: passed, zero warnings.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Format/whitespace, production HTTP smoke and public credential checks are
  recorded in [validation.md](validation.md).

Regression coverage includes the exact bistro, Museum/Gallery/Temple addresses,
real indoor intent, synthetic source-backed temple restrictions, Orsay outside
published hours, conflicting category hints, ambiguous and unknown venues, exact
record integrity, authoritative budget rendering and durable replay/audit ownership.
All prior buffer-normalization, food accounting, meals, auth and provider tests
remain. The historical live result and token/cost measurements are documented in
[the original report](milestone-2a-sol-paris-result.md); replay adds no API usage.

Remaining limitations are source coverage/heuristic classification, unverified
supplier prices/routes/future hours, assumed travel-day windows, and hosting
execution durability as described above. Milestone 2B, payments, AI editing,
bookings and recovery remain deferred.

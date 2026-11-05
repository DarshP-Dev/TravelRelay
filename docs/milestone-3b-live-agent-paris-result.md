# Milestone 3B — controlled live Paris agent acceptance

**Passed for this controlled scenario on November 5, 2026.** Exactly one real
OpenAI Responses request used `gpt-6.1-sol`, medium reasoning and the existing
strict assistant schema. There was no retry, provider fallback, new paid trip
generation, itinerary approval, deployment or Milestone 4 work. The live proposal
is still **pending**, and its original saved itinerary is still revision **0**.

## Scenario and recorded response

The isolated persisted QA trip reuses the previously validated real Sol Paris
recording: April 15–18, 2027, two travelers, balanced pace, Culture/Food interests,
€2,500 group budget. The recording was imported through the existing offline
generation/validation path, without requesting a newly generated itinerary.
The agent received 12,342 bytes of actual database context with stable saved
day/activity IDs, schedule, budget, preferences and uncertainty. No credentials
or account/session details were included in that context.

Exact user message:

> Day 2 feels a little too packed. Suggest one change that makes it more relaxed while preserving our main culture and food interests and staying within budget.

Actual response:

> I suggest shortening Day 2’s Saint-Germain-des-Prés culture walk from 90 to 45 minutes: 14:00–14:45 instead of 14:00–15:30 on April 16. Focus on fewer streets rather than rushing the full route. This frees another 45 minutes for rest while keeping your Musée d’Orsay visit, café lunch, and dinner unchanged—and preserving all travel buffers.
>
> The walk’s estimated group cost remains 0 EUR minor units, so the budget is unchanged and no reserve is needed. This is a proposal only; nothing has been changed.

The uncertainty explicitly says the shorter walk is a pacing suggestion, **not a
verified route or journey-time estimate**, and existing costs remain unverified.

The entire typed proposal is one `resize_activity` targeting saved activity
`b379a744-04bb-493d-9d65-e0969d0e7533`, with `durationMinutes:45`; all other action
fields are null. Its activity reference exists in saved Day 2. No new location,
URL, venue, opening-hour claim, coordinate, price or booking was generated.

The [credential-free recording](../tests/fixtures/sol-agent-paris-2026-11-05.json)
contains the exact response, original saved plan/IDs, intent, measured usage,
latency and acceptance provenance. The original live job, response, proposal and
usage audit remain in the ignored `controlled-agent-*` PGlite database. Private
access metadata and transport evidence are ignored under `.test-data/`; no keys,
cookies, account credentials or hidden reasoning are included in the fixture.

## Before/after schedule and budget

All times are local to Paris. These are **proposed** changes, not saved edits.

| Day 2 activity                      | Saved           | Proposed        | Estimate, group |
| ----------------------------------- | --------------- | --------------- | --------------- |
| Musée d’Orsay                       | 10:00–12:00     | Unchanged       | €44             |
| Substantial café lunch, Rue du Bac  | 12:30–13:30     | Unchanged       | €50             |
| Saint-Germain-des-Prés culture walk | **14:00–15:30** | **14:00–14:45** | €0              |
| Dinner around Rue de Buci           | 18:00–19:15     | Unchanged       | €75             |

Four activities remain. Itemized activity time decreases from 5h45 to **5h**;
the free interval before dinner increases from 150 to **195 minutes**. Every
declared 30-minute buffer is unchanged, and every actual scheduled gap remains
sufficient. The culture museum and both substantial food experiences are retained.
Other days and activity identifiers remain unchanged. This is a modest, relevant
relaxation of the afternoon rather than unnecessary rearrangement of the trip.

| Financial projection             | Saved    | Proposed |
| -------------------------------- | -------- | -------- |
| Itemized estimates               | €369     | €369     |
| Additional unitemized allowances | €1,655   | €1,655   |
| Total allocations before reserve | €2,024   | €2,024   |
| Protected emergency reserve      | **€250** | **€250** |
| Total allocations + reserve      | €2,274   | €2,274   |
| Genuinely unallocated            | **€226** | **€226** |
| Projection delta                 | —        | **€0**   |

Food remains a €500 inclusive allocation: €325 itemized + €175 additional
allowance, never €825. All amounts remain EUR planning estimates, not spending,
payments, exchange rates or confirmed prices.

## Validation, grounding and approval safeguards

- Existing structured response parse, trip-owned ID checks, typed action
  translation and **unchanged Milestone 3A preview service** all passed.
  `canSave:true`, `overBudget:false`, budget delta zero; **zero hard conflicts**.
  The server audit records `stage:"passed"`, context version 0 and no errors.
- Dates, base city, location, category, coordinates, start time, cost, links and
  other activities are unchanged. No fabricated location, invalid reference,
  unsupported execution/booking claim or new scheduling mistake was identified.
- The existing dated Orsay reference remains attached to the unchanged
  10:00–12:00 visit. It is published-hours evidence checked November 4, 2026,
  **not verified April 2027 opening hours or availability**. No new venue lookup
  was performed. Existing coordinates and restaurant-street estimates remain
  unverified, with the existing labels visible in review.
- The preview retains **one pre-existing advisory**: Day 4 has no itemized food
  stop. It is unchanged by this Day 2 proposal. This is the existing 3A manual
  editing suggestion policy, not a relaxed validator or newly ignored error.
- No live approval was executed. Proposal
  `a54e7734-21da-42f2-9811-fd95025dd3d2` remains pending at preview revision 1,
  based on itinerary revision 0. Its sole event is `proposed`, applied version is
  null and the original itinerary has no edits.
- Reopening the actual database and signing in with a fresh session restored
  the **exact** conversation, proposal, preview, event and usage audit. Fifteen
  restoration assertions passed, including unauthenticated denial and foreign
  ownership denial, with zero external/model calls. The final check after browser
  review again confirmed the unchanged revision-0 itinerary and pending proposal.

## Offline replay of this exact live result

Four new regression tests replay the recorded structured response verbatim on
isolated trip copies with the same activity IDs. Global network access is blocked;
the offline adapter cannot generate a trip and does not duplicate real usage.

1. Exact response/ID/preview checks: one 90→45 minute resize, no new errors,
   unchanged pre-existing warnings, budget and reserve; unchanged saved plan and
   owner isolation while pending.
2. Explicit approval applies one atomic revision with AI-proposal provenance;
   repeating approval does not apply another edit or request a model.
3. Rejection persists, leaves the itinerary unchanged and blocks later approval.
4. An unrelated manual edit makes the old approval return **409**. Local
   re-preview produces revision 2 without a model call; old preview approval
   remains blocked, and newly reviewed approval preserves that manual note.

Only these **offline copies** were approved/rejected. The actual live proposal
was neither approved nor rejected.

## Measured API usage and latency

| Measurement                                    | Actual result                        |
| ---------------------------------------------- | ------------------------------------ |
| Live requests / upstream status                | **1 / HTTP 200**, completed          |
| Requested / returned model                     | `gpt-6.1-sol` / `gpt-6.1-sol`        |
| Reasoning effort / output cap                  | Medium / 8,192 tokens                |
| Input tokens                                   | **4,644**                            |
| Cached reads / cache writes                    | **0 / 4,641**                        |
| Output tokens, including reasoning             | **456**                              |
| Reasoning / visible output                     | **149 / 307**                        |
| Total tokens                                   | **5,100**                            |
| Transport duration, through received JSON body | **10.811 seconds**                   |
| Persisted application response latency         | **10.828 seconds**                   |
| Estimated USD cost                             | **$0.01616850**, about 1.62 US cents |
| API / schema / preview errors                  | **None**                             |

The existing estimator uses standard short-context text reference rates from
[official OpenAI pricing](https://developers.openai.com/api/docs/models/gpt-6.1-sol):
3 ordinary input tokens × $2/M + 4,641 reported cache-write tokens × $2.50/M +
456 output tokens × $10/M. Reasoning is already included in output, counted once.
This is a reference estimate, not an invoice; account adjustments/taxes can differ.
The hidden reasoning content was not requested or recorded.

The transport guard permitted only `POST /v1/responses` on the official endpoint,
checked model/medium/strict-schema/output cap/store:false/stream:false/no tools,
and wrote an exclusive on-disk request marker **before** sending. The SDK has zero
retries. Further calls from this acceptance harness are blocked by that marker.

## UI and final checks

The local production UI reopened the actual live-test database with a fresh
login. For this review its runtime used a literal fake key and blocked external
server fetches, so viewing/restoring the result could not make another paid call.
Verified the actual response, unverified-information labels, stable activity link,
"Unsaved · approval required" card, full before/after schedule and budget table,
separate reserve/unallocated figures, and the existing Day 4 advisory. Refresh
restored the response and pending review entry. No browser console errors were
observed. No approval/rejection control was clicked.

- [Restored live chat](screenshots/milestone-3b-live-paris-chat.png)
- [Pending before/after review](screenshots/milestone-3b-live-paris-pending.png)

Full automated suite: **101 passed, zero failures** (97 prior + 4 recorded-result
regressions). Lint, type-check, formatting, diff checks and production build passed.
Application code, schemas, validation thresholds and provider prompts were not
changed for acceptance. Changes are the guarded harness, sanitized recording,
offline regression tests and this report/evidence. No push or deployment occurred.

## Acceptance and remaining limits

**The live Sol agent is ready for acceptance for this scenario; no blocking
correction is needed.** It gave a grounded, appropriately small suggestion and
respected approval, schedule and financial boundaries. The phrase "0 EUR minor
units" is technically accurate but less natural than "€0"; that is optional
wording polish, not an acceptance failure or a reason to repeat the request.

One successful case does not establish all conversational/model behavior. The
Gemini assistant, live venue/route/weather/availability verification and complex
multi-operation live suggestions remain untested. Existing hosted PostgreSQL,
backup/HTTPS and 240-second execution/drain requirements remain. Milestone 4
and financial tools are not started. Any additional model request requires new
explicit approval.

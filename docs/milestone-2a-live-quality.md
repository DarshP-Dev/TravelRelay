# Milestone 2A: single-request live quality validation

Test started November 4, 2026 at 20:01 UTC. **Not accepted:** Gemini returned a
complete response, but the unchanged server quality gate rejected one declared
travel buffer. No completed itinerary was saved. The one authorized request has
been consumed; no retry, fallback, repair request or additional proposal call ran.

## Request and evidence

- Official `@google/genai` SDK, exact model `gemini-3.5-flash-lite`.
- Original Paris proposal revalidated and reused locally. Input unchanged:
  London departure; April 15–18, 2027; two travelers; balanced pace; EUR 2500 entire
  vacation; Culture/Food; neighborhood walks and one art museum; avoid nightclubs
  and multi-city travel.
- API: **HTTP 200**, finish reason **STOP**, no API error or quota/rate-limit error.
- Tokens: **1671 input + 2042 output + 1743 thinking = 5456 total**. These are
  provider-reported counts for this single itinerary call, excluding earlier runs.
  They do not establish billing or remaining free-tier quota.
- Raw response, input, usage metadata, all automated findings, source metadata,
  persistence checks and pre/post code hashes are recorded in ignored
  `.test-data/live-gemini-quality-latest.json`. The generated response is unchanged;
  it was neither repaired nor substituted into the public example.
- Code hashes confirm the model adapter/prompt, core validator, quality validator,
  generation store and venue references were unchanged during this test.

The opt-in script's `--quality-check --reuse-proposal` mode now hard-limits the
transport to one call at the exact Google model endpoint, preserves earlier live
reports, and records schema/domain/quality findings plus persistence results even
when generation fails. No product implementation or validator was changed.

## Generated itinerary (rejected, all times local Paris time)

All costs below are **unverified AI group estimates**, not ticket quotes or bookings.
The response contains 12 activities, compared with seven in the earlier recording.

| Date   | Time        | Activity and supplied location                                 | Minutes | Declared buffer | Activity estimate |
| ------ | ----------- | -------------------------------------------------------------- | ------: | --------------: | ----------------: |
| Apr 15 | 15:00–16:30 | Latin Quarter Neighborhood Walk — Latin Quarter                |      90 |              30 |             EUR 0 |
| Apr 15 | 17:30–19:00 | Classic Parisian Bistro Dinner — Saint-Germain-des-Prés        |      90 |              30 |            EUR 80 |
| Apr 16 | 09:00–09:45 | Morning Coffee and Croissant — Rue de Rivoli                   |      45 |              30 |            EUR 20 |
| Apr 16 | 10:15–13:15 | Musée d’Orsay Masterpieces Tour — Musée d’Orsay                |     180 |              30 |            EUR 32 |
| Apr 16 | 14:15–15:15 | Bistro Lunch near Orsay — Quay Anatole France                  |      60 |              30 |            EUR 50 |
| Apr 16 | 16:15–18:15 | Montmartre Neighborhood Walk — Montmartre                      |     120 |              30 |             EUR 0 |
| Apr 17 | 09:00–11:00 | Le Marais Historic Walk — Le Marais                            |     120 |              30 |             EUR 0 |
| Apr 17 | 11:30–12:30 | Traditional French Bakery and Pastry Tasting — Rue de Bretagne |      60 |              30 |            EUR 25 |
| Apr 17 | 13:00–14:30 | Seine Riverbank Stroll — Seine Riverbanks                      |      90 |              30 |             EUR 0 |
| Apr 17 | 15:30–17:00 | Culinary Dinner Experience — Bastille                          |      90 |              30 |            EUR 90 |
| Apr 18 | 09:00–10:00 | Final Parisian Morning Cafe — Central Paris                    |      60 |              30 |            EUR 15 |
| Apr 18 | 10:30–11:30 | Souvenir Stroll in Central Paris — Rivoli District             |      60 |              30 |             EUR 0 |

## Evaluation

1. **Pace/detail: automated pass.** Counts are 2/4/4/2 against arrival 2–3,
   full-day 3–5 and departure 1–2 targets. Planned durations are 180/405/360/120
   minutes. Full days stay within the eight-hour activity cap. Arrival begins at
   15:00 and departure activities finish at 11:30, improving on the earlier plan.
   Exact transport timing is still unknown; these are conservative assumptions.
2. **Interests: improved, coverage pass.** Food now has actual café, bistro, pastry
   and dining experiences, rather than only an allowance. Culture has Orsay and
   historic neighborhood walks. The heuristic finds six Food and four Culture
   matches, though that count alone does not prove experience quality.
3. **Timing: quality gate failed one field.** On Apr 17, activity index 3
   (`days[2].activities[3].bufferBeforeMinutes`) is 30. Its supplied coordinates
   put Bastille about 1.856km from the preceding riverbank stop. The unchanged
   short-distance rule requires `ceil(1.856 / 4.5 * 60) + 10 = 35` minutes.
   The actual schedule gap is 60 minutes (14:30–15:30), so the failure is the
   understated declared buffer, not an overlapping or impossible timetable.
   All other declared buffers satisfy the current distance rule. No value was
   silently increased and no revised plan was saved.
4. **Orsay issue resolved against the supplied reference.** Friday's visit is
   10:15–13:15, within the source-checked 09:30–17:30 gallery window and before
   17:00 last admission. The earlier response incorrectly started at 09:00.
   This is a match to the dated [official published-hours reference](https://www.musee-orsay.fr/en/visit)
   checked November 4, 2026, **not verification of April 2027 hours, ticket
   availability, the EUR 32 estimate or a booked tour**. Other venues, routes,
   coordinates, access and prices remain unverified AI estimates.
5. **Budget arithmetic: pass; categorization concern remains.** Server calculations
   use all submitted group estimates without correction:

   | Category                         |      EUR |
   | -------------------------------- | -------: |
   | Return travel                    |      400 |
   | Accommodation                    |      900 |
   | Food allowance                   |      450 |
   | Local transport                  |      100 |
   | Activities                       |      312 |
   | Server reserve (10% of EUR 2500) |      250 |
   | **Total including reserve**      | **2412** |
   | **Remaining budget**             |   **88** |

   The activities include **EUR 280 in meals/cafés/pastry experiences**, in addition
   to `foodMinor = 45000`. This violates the prompt's food-category-only instruction
   and risks double counting. The untyped cost schema cannot independently establish
   whether that allowance includes these meals. Arithmetic is correct for the
   supplied numbers, but the allocation is not cleanly trustworthy. Nothing was
   subtracted, relabeled or rewritten to make the response pass.

6. **Validation:** strict Zod schema passed, with no missing, unknown or rejected
   fields. Core single-city, dates, currency, maximum pace, base-radius, scheduling
   and budget validation passed. Full quality validation **failed** on the single
   buffer finding above. A schema pass is not an overall acceptance.
7. **Persistence:** the completed itinerary is correctly **absent**, including
   after closing/reopening the isolated disk-backed SQL database. Failed job status,
   one itinerary attempt, the original saved input and authenticated session all
   persisted; owner isolation and anonymous denial passed. The raw rejected output
   is retained only as local QA evidence. This run does **not** demonstrate a newly
   accepted completed itinerary persisting; accepted-plan persistence remains
   covered by offline integration tests and the historical pre-refinement live run.

## Additional manual quality findings (not caught by the current gate)

- The Apr 17 “dinner” starts at **15:30**, with no restaurant named or service hours
  verified. This is not a convincing dinner schedule; the gate has no dinner-specific
  window. Arrival dinner at 17:30 also needs venue-specific service confirmation.
- Saturday's pastry tasting satisfies the lexical lunch rule, but does not clearly
  provide a substantive lunch. The rule cannot reliably distinguish a snack from
  a meal. Friday lunch at 14:15 passes its window but restaurant service is unverified.
- Several food stops are neighborhood/street suggestions rather than named venues.
  “Central Paris” is particularly vague and escaped the current placeholder check.
  Generic claims such as “renowned” patisserie have no supplied venue evidence.
- The response claims all buffers respect the rules, which is contradicted by the
  server finding. Its confident feasibility statement is not trusted as validation.

These are diagnosed limitations, not reasons to weaken the validator. No validator,
prompt or production feature was adjusted after the result, and no extra model
call was made.

## Final Milestone 2A status

**Live quality acceptance is not passed.** The revised prompt improves detail,
interest coverage and Orsay timing, and the gate correctly prevents publication of
a rejected result. Remaining work is stronger output compliance and evaluation of
meal categorization, meal timing/substance and location specificity. Any future
changes need offline validation; another live request requires new approval.

Local checks after the reporting-script change: lint, type-check and all **39 tests**
passed. No app source changed, so the previous successful production build and
responsive checks remain applicable; they were not rerun for this script/report-only
update. No Milestone 2B work, deployment, commit or push was performed.

# Milestone 2A: real GPT-6.1 Sol Paris result

November 4, 2026. **The newly authorized single request authenticated and returned
a complete itinerary. Overall acceptance failed on one classifier false positive;
no completed itinerary was saved.** Validators, thresholds, provider settings and
activity times were not changed, and there was no retry or fallback.

## Actual API measurements

| Metric                              | Result                                              |
| ----------------------------------- | --------------------------------------------------- |
| Requests in this run                | **Exactly 1**, itinerary only                       |
| Model / reasoning                   | **`gpt-6.1-sol` / medium**, asserted on the request |
| Returned model / tier               | `gpt-6.1-sol` / `default`                           |
| HTTP / response status              | **200 / completed**, no API error                   |
| Request started                     | `2026-11-04T22:20:20.119Z`                          |
| Headers / complete response latency | **63.721 / 63.727 seconds**                         |
| Input tokens                        | **1917**                                            |
| Output tokens, including reasoning  | **3154**                                            |
| Reasoning subset / visible output   | **977 / 2177**                                      |
| Total tokens                        | **5071** = 1917 + 3154                              |
| Cached reads / cache writes         | **0 / 1914 tokens**                                 |
| Estimated USD cost                  | **$0.036331** (about 3.63 cents), not an invoice    |

Reasoning is included in output and is not billed a second time. The existing
dated standard-rate estimator uses 3 uncached input tokens × $2/M, 1914 reported
cache-write tokens × $2.50/M, and 3154 output tokens × $10/M. No 12-hour write
breakdown was supplied; the configured estimator treats writes without that
breakdown as the ordinary write rate. Taxes, account credits/discounts and other
invoice adjustments are not verified.

The earlier [401 authentication attempt](milestone-2a-sol-live-validation.md) was
separately authorized and is not included in this run's one-request/token count.
Its report was archived before this run. No key or credential fragment is included
here, and the key was not changed by the agent.

## Input and generated days

Original scenario preserved: Paris, France; London departure; April 15–18, 2027;
four days/three nights; two travelers; EUR 2500 entire-trip group budget; balanced
pace; Culture/Food; neighborhood walks and one art museum; avoid nightclubs and
multi-city travel. The recorded Paris proposal was revalidated/reused locally;
there was **no proposal API request**. The inherited `duration:7` field is inactive
because dates are fixed; both server and response correctly use four days.

All costs below are **unverified group estimates**, not verified ticket/meal quotes.
All times are local Paris time.

| Day    | Time        | Activity / supplied location                                               | Duration | Buffer | Itemized estimate |
| ------ | ----------- | -------------------------------------------------------------------------- | -------: | -----: | ----------------: |
| Apr 15 | 15:00–16:30 | Le Marais walk — Place des Vosges / Rue des Francs-Bourgeois               |      90m |    30m |             EUR 0 |
| Apr 15 | 18:00–19:15 | French bistro dinner — Rue Vieille-du-Temple                               |      75m |    30m |            EUR 70 |
| Apr 16 | 10:00–12:00 | Art museum visit — Musée d’Orsay                                           |     120m |    30m |            EUR 44 |
| Apr 16 | 12:30–13:30 | Substantial café lunch — Rue du Bac near Rue de Verneuil                   |      60m |    30m |            EUR 50 |
| Apr 16 | 14:00–15:30 | Saint-Germain culture walk — Place Saint-Germain to Place Saint-Sulpice    |      90m |    30m |             EUR 0 |
| Apr 16 | 18:00–19:15 | French dinner — Rue de Buci                                                |      75m |    30m |            EUR 75 |
| Apr 17 | 09:30–11:00 | Montmartre neighborhood walk — Abbesses / Rue Lepic / Place du Tertre      |      90m |    30m |             EUR 0 |
| Apr 17 | 12:00–13:00 | Bistro lunch — Rue des Abbesses                                            |      60m |    30m |            EUR 55 |
| Apr 17 | 14:15–15:45 | Canal neighborhood walk — Quai de Valmy / Quai de Jemmapes                 |      90m |    45m |             EUR 0 |
| Apr 17 | 18:00–19:15 | Neighborhood dinner — Rue de Lancry                                        |      75m |    30m |            EUR 75 |
| Apr 18 | 09:30–10:30 | Île Saint-Louis farewell walk — Quai de Bourbon / Rue Saint-Louis-en-l’Île |      60m |    30m |             EUR 0 |

## Validation and exact rejection

- **Strict schema passed** with no rejected or missing fields. The provider returned
  the complete required itinerary structure; no schema simplification was needed.
- **Core/domain passed:** one Paris base, selected currency, four consecutive dates,
  activity caps, city/radius, durations, nonoverlap, essential costs and budget.
- **Normalization passed with zero corrections:** all declared travel buffers already
  meet the geographic rule and fit the existing gaps. No start/end time was moved.
- **Quality failed exactly one finding**, at `days[0].activities[1]`:
  `unverified-venue-window`. The recorded error says the French bistro dinner on
  Rue Vieille-du-Temple has no source-checked hours and must use 10:00–17:00.

**Diagnosis:** `activityText` normalizes title + location. The indoor-attraction
regular expression includes the word `temple`; it matches that word inside
**Rue Vieille-du-Temple**, both in the title and location. The activity describes a
bistro dinner on a named street, not a temple visit. The classifier therefore
incorrectly applies the daytime visitor-attraction rule to an 18:00 meal. The same
token also produces a spurious Culture match, though the genuine Orsay visit
independently satisfies Culture.

This is a context/classification defect, not evidence of verified restaurant hours
or an objectively invalid dinner time. Restaurant service remains unverified.
The validator and generated activity were left untouched: the rejection stands.
No counterfactual edited plan was saved or presented as accepted. A future fix
should distinguish street names/food experiences from attraction visits while
retaining real attraction-hour protection; no such fix was implemented here.

## Manual quality review

**Density and travel days:** 11 meaningful activities in a **2/4/4/1** distribution,
within balanced arrival 2–3/full 3–5/departure 1–2 targets. Planned minutes are
165/345/315/60, leaving generous rest opportunities. Arrival starts at 15:00 and
departure sightseeing ends at 10:30. The model discloses conditions on travel timing
rather than inventing a flight or hotel booking; those conditions still need checking.

**Meals and interests:** five substantial food experiences, including explicit lunches
at 12:30 and 12:00 and dinners at 18:00. Meal durations are 60–75 minutes; pastries
do not substitute for lunch. Orsay and several distinct historic/cultural neighborhood
walks provide actual Culture experiences. No nightclub or multi-city excursion is
included. Dining is suggested at specific streets, rather than fabricated named
restaurant reservations or the previous vague “Central Paris” placeholder.

**Geography and buffers:** every supplied activity city is Paris, and supplied
coordinates lie within about 3.5km of the base. Interactivity buffers of 30–45 minutes
exceed the rule's derived 15–30-minute minima, with actual gaps of 30–150 minutes.
These are coordinate-based planning checks, not verified pedestrian/transit routes
or accessibility. Walk descriptions can cover more distance than a single point.

**Opening hours:** the Friday Orsay visit is 10:00–12:00, within the supplied
source-checked 09:30–17:30 gallery window and before 17:00 last admission. The
[official reference](https://www.musee-orsay.fr/en/visit) was checked November 4,
2026; it does **not** verify April 2027 hours, ticket availability, accessibility or
the EUR 44 group estimate. Restaurant hours, meal service, suggested locations,
prices and travel options are unverified. No new supplier/venue lookup was made.

## Budget accounting

Server reconciliation passed with inclusive category allocations:

| Allocation                | Itemized estimates | Additional unitemized allowance | Category total |
| ------------------------- | -----------------: | ------------------------------: | -------------: |
| Return travel             |              EUR 0 |                         EUR 480 |        EUR 480 |
| Accommodation             |              EUR 0 |                         EUR 780 |        EUR 780 |
| Food                      |            EUR 325 |                         EUR 175 |        EUR 500 |
| Local transport           |              EUR 0 |                         EUR 220 |        EUR 220 |
| Other activities / museum |             EUR 44 |                           EUR 0 |         EUR 44 |
| **Subtotal**              |        **EUR 369** |                    **EUR 1655** |   **EUR 2024** |

- Emergency reserve: **EUR 250**, exactly 10% of the EUR 2500 selected budget.
- Total allocation **including reserve: EUR 2274**.
- Unallocated remaining budget: **EUR 226**.
- Food activities are included once within EUR 500; no double counting or discarded
  expenses. These are planning allocations/estimates, not actual spending.

**Additional manual finding:** the model's prose calls EUR 476 “unallocated” after
EUR 2024 spending, conflating the EUR 250 emergency reserve with the EUR 226 remaining
unallocated amount. Numeric fields and the server breakdown are correct; free-text
budget narration is not cross-validated by the current gate. The prose was not
rewritten or treated as authoritative over the server numbers.

## Persistence, audit and comparison

The completed itinerary remained **null**, including after SQL close/reopen. The
failed job, original draft, one itinerary attempt and authenticated session restored
correctly; anonymous denial and owner isolation passed. Usage, normalization and
failure-stage audits were stored/read and captured in the report. This uses the
prepared isolated persistent QA database, cleaned after reopen verification; no QA
trip was inserted into normal development accounts. No accepted-trip persistence
claim is made for this rejected response.

| Dimension               | Latest previous Gemini recording                                              | This Sol response                                                                     |
| ----------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Density                 | 12 activities, 2/4/4/2                                                        | 11 activities, 2/4/4/1; gentler departure                                             |
| Meals                   | Dinners at 17:30 and 15:30; pastry tasting used at lunch                      | Dinners 18:00; substantial lunches 12:00/12:30                                        |
| Buffers                 | 30→35-minute correction needed inside an existing 60-minute gap               | No corrections needed                                                                 |
| Specificity             | “Central Paris” café; several neighborhood-wide suggestions                   | Named streets and bounded neighborhood routes                                         |
| Orsay                   | 10:15–13:15 within published reference                                        | 10:00–12:00 within published reference                                                |
| Food accounting         | Previously risked double counting; current offline reconciliation resolves it | Inclusive allocation/itemization consistent; prose reserve labeling remains imperfect |
| Current quality outcome | Four meal/location findings remain after normalization                        | One classifier false positive; rejected unchanged                                     |
| Tokens                  | 1671 input + 3785 generated = 5456 total; reasoning subset 1743               | 1917 input + 3154 generated = 5071 total; reasoning subset 977                        |
| Latency                 | Not recorded                                                                  | 63.727 seconds                                                                        |

This sample shows improved meal scheduling, buffer compliance and specificity, but
the providers saw **different prompt/policy revisions** and this is one sample each,
not a controlled model benchmark. Neither response passed the current full gate.
No new Gemini request was made.

## Evidence and status

Complete raw output, usage, latency, all findings, stage audits and validator hashes
are in ignored `.test-data/live-openai-paris-latest.json`, also archived as
`.test-data/live-openai-paris-quality-result-2026-11-04.json`. The earlier 401 report
remains `.test-data/live-openai-paris-auth-failure-2026-11-04.json`. Raw outputs were
not repaired. Pre/post hashes prove validator/provider/prompt files unchanged.

**Sol API access and structured output are demonstrated; Milestone 2A's full live
acceptance is still not passed.** Remaining issues are the context-insensitive
attraction classifier and free-text reserve narration. No validator or feature
changes were made during this run. The single authorization is consumed; another
live request requires new approval. No Milestone 2B, deployment, commit or push.

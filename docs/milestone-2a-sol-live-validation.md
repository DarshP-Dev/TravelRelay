# Milestone 2A: GPT-6.1 Sol live validation

Historical first authentication attempt. A separately authorized later request
returned a real itinerary; see [the latest Sol Paris result](milestone-2a-sol-paris-result.md).

November 4, 2026. **The one authorized request failed authentication. No Sol
itinerary was generated, so live itinerary-quality acceptance is not passed.**
There was no retry, provider/model fallback, second proposal call or additional
live request. Validators, provider settings and planning instructions were not
changed to obtain a pass.

## Request and actual result

| Item                                          | Result                                                         |
| --------------------------------------------- | -------------------------------------------------------------- |
| Transport attempts                            | **1 of 1 authorized**                                          |
| Requested provider/model                      | OpenAI Responses API / `gpt-6.1-sol`                           |
| Reasoning                                     | **medium**, asserted against the actual request body           |
| Output format                                 | Existing strict structured-output schema; unchanged            |
| API request started                           | `2026-11-04T22:13:35.733Z`                                     |
| HTTP / provider error                         | **401 / `invalid_api_key`**                                    |
| Response headers observed                     | **337 ms**                                                     |
| Full JSON error response observed             | **339 ms**                                                     |
| Input tokens                                  | Not reported                                                   |
| Output tokens                                 | Not reported                                                   |
| Reasoning tokens                              | Not reported                                                   |
| Estimated USD cost                            | **Unknown / null**: no usage returned; not represented as zero |
| Generated itinerary / returned model identity | None / not reported                                            |

The latency is client-observed authentication-error response latency, **not model
generation latency**. No provider usage metadata was returned. The request model
and medium effort were checked before transport; account access to Sol remains
unverified because authentication failed first.

An offline configuration check found that the effective `OPENAI_API_KEY` in ignored
`.env.local` still resembles a setup placeholder. There was no inherited environment
override, and the local/effective values matched. No key value or fragment is
included in this report. The configured value must be replaced locally with a
valid API secret before a separately approved future attempt. Do not paste it in
chat or commit it. The existing one-request authorization has been consumed.

## Scenario and unchanged acceptance policy

The exact original scenario was used: Paris, France; London departure; April 15–18,
2027 (four days); two travelers; EUR 2500 entire-vacation group budget; balanced
pace; Culture/Food; neighborhood walks and one art museum; avoid nightclubs and
multi-city travel. The original recorded Paris base/proposal was locally revalidated
and confirmed, with **no provider proposal request**.

The harness's accepted proposal audit row describes this local reuse under the
configured test adapter; it is **not a newly generated Sol proposal**, and has no
usage. Only the itinerary transport was attempted.

Strict schema, deterministic gap-safe buffer normalization, single-city/date/radius
rules, activity density/duration, meal windows/substantial opportunities, location
specificity, published-hours checks, duplicate venues, selected interests, budget
allocation reconciliation and reserve policies are unchanged. Hashes captured
before and after the run confirm no changes to these files or the provider/prompt.

## Validation and persistence

| Check                                                       | Result                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| Provider authentication                                     | **Failed: HTTP 401 `invalid_api_key`**                   |
| Itinerary schema / rejected fields                          | **Not run**: no itinerary body; no fields were evaluated |
| Normalization / geographic consistency / buffers            | **Not run**                                              |
| Density / durations / meal timing / interests / venue hours | **Not run**                                              |
| Budget reconciliation / reserve / remaining amount          | **Not run**; input remains EUR 2500                      |
| Completed itinerary                                         | **Absent**, including after SQL close/reopen             |
| Failed job state and original saved draft                   | Persisted and restored unchanged                         |
| Itinerary attempt count                                     | **1**; no silent retry                                   |
| Restored authenticated session                              | Passed                                                   |
| Anonymous denial / owner isolation                          | Passed                                                   |
| Validator/provider/prompt hashes unchanged                  | Passed                                                   |

The application correctly exposed a recoverable failure and did not fabricate or
save a completed trip. This was the prepared in-process application-layer test
using real authentication/resource handlers and isolated disk-backed PGlite. It
did not insert a QA trip into the normal development account/database. The temporary
QA database was cleaned after reopen verification; the report remains available.
There was no hosted browser test, deployment, payment, booking or transaction.

Raw result, input, timestamps, provider error, stage audits and hash evidence are
retained in ignored `.test-data/live-openai-paris-auth-failure-2026-11-04.json`. Its only retained
provider output is the reused historical Paris proposal; there is no Sol itinerary.

## Comparison with the latest real Gemini response

| Dimension                               | Previous Gemini 3.5 Flash-Lite                                                                                    | This Sol request                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| API outcome                             | HTTP 200, complete JSON                                                                                           | HTTP 401; authentication rejected                             |
| Activity density                        | 12 activities, 2/4/4/2 across arrival/full/full/departure                                                         | No activities to assess                                       |
| Culture/Food                            | Museum and historic walks plus six food-related stops                                                             | Not assessable                                                |
| Meals                                   | Early dinners at 17:30 and 15:30; pastry tasting does not ensure substantial lunch                                | Not assessable                                                |
| Geography / buffers                     | One Paris base; 30-minute declared Bastille buffer requires 35; 60-minute gap permits deterministic normalization | Not assessable                                                |
| Orsay                                   | 10:15–13:15 fits dated published-hours reference                                                                  | Not assessable                                                |
| Venue specificity                       | Several district/street suggestions; “Central Paris” is too vague                                                 | Not assessable                                                |
| Budget under current reconciliation     | EUR 2132 including EUR 250 reserve; EUR 368 remaining                                                             | No estimate returned                                          |
| Quality acceptance under current checks | Rejected: four meal/location findings remain after buffer normalization                                           | Not reached                                                   |
| Tokens                                  | 1671 input, 2042 visible output, 1743 reasoning; 5456 total                                                       | Not reported                                                  |
| Response latency                        | Not captured in the earlier run                                                                                   | 339 ms authentication error, not comparable generation timing |

The Gemini figures come from the unchanged historical recording/offline reliability
replay. Its earlier raw arithmetic total was EUR 2412 before reconciling EUR 280 of
food activity estimates within the food allocation; no underlying estimate was
erased. This is not a new Gemini request or acceptance.

Orsay has only a dated, manually source-checked published-hours snapshot. Even
the prior Gemini visit's fit to that window does not verify April 2027 opening,
tickets, tour availability, accessibility or its estimated price. Other venue
details, locations, routes and costs remain unverified AI estimates. No new venue
verification was performed during this authentication-failed run.

No defensible quality ranking between Sol and Gemini can be drawn from this result.
The only comparison established here is an authenticated completed Gemini response
versus a Sol request rejected before generation. Milestone 2A's real Sol quality
sign-off remains pending valid local credentials and a newly approved single attempt.

## Local reporting checks

Only the manual harness was changed to record response latency and assert the
wire model/effort/schema/cap. Type-check passed before the live attempt; reporting
lint/format checks and credential redaction checks were run afterward. The earlier
55-test/production-build results remain applicable to unchanged application code;
this run does not claim a new full build or hosted deployment verification.
No Milestone 2B, unrelated development, commit or push was performed.

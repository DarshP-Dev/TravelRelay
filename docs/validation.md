# Milestone 3B — context-aware assistant validation

The real provider-backed assistant path is implemented with persistent private
chat/drafts/jobs, typed multi-activity proposals, versioned previews and explicit
atomic approval through the 3A editor. No live provider request, push, deployment,
financial feature or Milestone 4 work was performed. Model replies in validation
were explicitly mocked; they are not evidence of new live model quality.

| Final check                              | Result                                                                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                               | **97 passed**, zero failures (81 retained + 16 new)                                                                                                                                                                      |
| Lint / type-check / format / diff checks | Passed                                                                                                                                                                                                                   |
| Production build                         | Passed                                                                                                                                                                                                                   |
| Production HTTP                          | **63 assertions passed**, including real auth/job/approval/undo/isolation boundaries with guarded mocked SDK transport                                                                                                   |
| Credential boundary                      | 38 public build assets; five configured/private QA values; zero leaks/frontend provider transport                                                                                                                        |
| Responsive/browser                       | 360/390/768/1440px, no page overflow; chat/draft restoration, coordinated approval, stale re-preview, card/scheduler/map/Overview synchronization, mobile navigation/rejection/request changes and logout/login verified |
| Database migration                       | `0005` applied locally and to isolated fresh/reopened PGlite; hosted PostgreSQL remains unprovisioned                                                                                                                    |
| Live-agent preflight                     | Passed, **zero live requests**; one-request Sol/medium harness ready only after separate approval                                                                                                                        |

See [the full 3B report, tested conversations, screenshots and cost/hosting limits](milestone-3b-validation.md).
The [hosting/recovery contract](generation-hosting.md) still applies to generation
and assistant jobs. Completed changes are committed locally with DarshP-Dev
attribution. Nothing is pushed or deployed. Historical reports follow unchanged.

---

## Milestone 3A — interactive itinerary acceptance

Activity CRUD, same-day reorder/cross-day movement, server-validated proposals,
atomic revisioned persistence/audited undo, real Bryntum Community drag/resize,
optional Leaflet/OSM maps and safe social references are implemented. Generation
schemas/acceptance, budgets, ownership and original audit history are preserved.
No live model request, push, deployment or Milestone 3B work was performed.

| Final check                              | Result                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                               | **81 passed**, zero failures (69 retained + 12 new)                                                                                   |
| Lint / type-check / format / diff checks | Passed                                                                                                                                |
| Production build                         | Passed, including new authenticated editor endpoints and lazy scheduler/map                                                           |
| Production HTTP                          | **46 assertions passed**, including real authenticated saves/undo, conflict/ownership rejection and pages                             |
| Credential boundary                      | 38 public assets, three configured private values, zero leaks/frontend model transports                                               |
| Responsive UI                            | 360/390/768/1440px without page overflow; real desktop drag/resize, mobile edit/move/save/delete/undo and conflict rejection verified |
| Migration                                | `0004` applied to local development and isolated fresh/reopened PGlite; hosted PostgreSQL remains unprovisioned                       |
| Dependencies                             | Actual Bryntum Scheduler Community 8.0.0 MIT and Leaflet 1.9.4 BSD; 12 moderate existing tooling advisories, zero high/critical       |

See [the full 3A implementation, screenshots, checks and limitations](milestone-3a-validation.md).
The existing [generation hosting contract](generation-hosting.md) remains a
deployment prerequisite. Completed changes are committed locally under DarshP-Dev;
no push or deployment is included. Historical reports follow unchanged.

---

## Milestone 2B — completed offline validation

Custom trip creation and all six curated-template paths are connected to the
approved persistent generation engine. No live model calls, deployment or push
were made. The original 2A validators, provider settings, rate limits, budget
reconciliation and exact recorded-response regression remain intact.

| Final check                                 | Result                                                                                                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                  | **69 passed**, zero failures (63 existing + 6 new)                                                                                                                                            |
| `npm run lint`                              | Passed, zero warnings                                                                                                                                                                         |
| `npm run typecheck`                         | Passed                                                                                                                                                                                        |
| `npm run build`                             | Passed; all six curated previews statically generated                                                                                                                                         |
| `npm run format:check` / `git diff --check` | Passed                                                                                                                                                                                        |
| Production HTTP smoke                       | **29 assertions passed**: six public previews, unknown-template 404, protected redirects, anonymous API denials, six authenticated template pages, Dashboard/My Trips and completed itinerary |
| Credential boundary                         | **20 public assets** checked against 3 configured private values; zero leaks or frontend provider transports                                                                                  |
| Responsive review                           | Overview and curated preview at 360/390/768/1440px; no page overflow. Mobile cards scroll inside their section. Wizard review and itinerary checked on desktop/mobile.                        |
| Browser flow                                | Preview → sign-in → personalized wizard → autosave/refresh → real saved intent → honest offline configuration failure; generated day links and saved/failed trip cards verified               |

See [Milestone 2B implementation and limitations](milestone-2b-validation.md) and
the [hosting/recovery runbook](generation-hosting.md). Hosted PostgreSQL and the
240-second Node background execution/drain window remain unprovisioned deployment
requirements; a persistent job is not a durable distributed worker queue. Live
quality of the new curated prompt context requires separately approved testing.

The approved 2A changes were checkpointed separately and 2B committed locally on
`codex/milestone-2b-trip-experience`, both attributed to DarshP-Dev. Nothing was
pushed, and no Milestone 3 work was started. Historical reports follow unchanged.

---

## Milestone 2A — final offline acceptance

**Pass: ready for Milestone 2A sign-off.** The exact recorded real GPT-6.1 Sol
Paris response passes every schema, schedule, budget, geography and quality check
after the targeted venue-classification fix. No model activity/time/cost was
edited, no threshold relaxed and no additional OpenAI/Gemini request made.

The real application worker persisted/retrieved the complete itinerary in an
isolated disk-backed integration test. The original failed report remains
unchanged; historical failed and clearly labeled accepted offline audit entries
survive database reopen. Ownership/session/draft protections pass. Financial
summaries now show **€250 reserve and €226 unallocated**, with €2,274 total.

| Final check                                 | Result                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                                  | **63 passed**, no failures; zero live transports                                                                                     |
| `npm run lint`                              | Passed, zero warnings                                                                                                                |
| `npm run typecheck`                         | Passed                                                                                                                               |
| `npm run build`                             | Passed                                                                                                                               |
| `npm run format:check` / `git diff --check` | Passed                                                                                                                               |
| Authenticated production UI                 | Exact persisted replay; Overview/Itinerary, day cards, times, source/estimate labels, disabled editing verified                      |
| Responsive overflow                         | None at 360, 390, 768 and 1440px                                                                                                     |
| 63.727-second latency                       | Fits existing timeout/lease/host contract; simulated 64-second background wait and initiating-request abort pass                     |
| Production HTTP smoke                       | 9 public/API checks, 4 protected login redirects, 4 authenticated pages and complete job/audit retrieval passed                      |
| Credential boundary                         | 20 public JS/CSS assets and portable fixture checked against 3 configured private values; no matches or frontend provider transports |

Protected pages in this production build emit Next.js streamed login redirects
(HTTP 200 with `NEXT_REDIRECT`), without private itinerary content; resource APIs
return HTTP 401. The original strict 307-only smoke assertion was corrected to
recognize this framework behavior, without changing application authorization.

Full evidence, budgets, regressions, UI screenshots and hosting limitations are in
[the final acceptance report](milestone-2a-offline-acceptance.md). This is offline
acceptance of a recorded real response, not a newly successful live attempt or a
hosted deployment test. No Milestone 2B, deployment, commit or push was performed.

---

## Historical latest real Sol itinerary result

The newly authorized single GPT-6.1 Sol/medium request returned **HTTP 200 /
completed**, a full four-day itinerary, and no API error. Full-response latency:
**63.727 seconds**. Usage: **1917 input + 3154 output = 5071 total**, with **977
reasoning tokens included in output** (2177 visible), 1914 cache-write tokens and
zero cached reads. Estimated standard-reference USD cost: **$0.036331**.

Strict schema, core/domain/budget and normalization passed with **zero buffer
corrections**. Quality rejected exactly one finding: the indoor-attraction
classifier matches **“Temple” in Rue Vieille-du-Temple**, applying the 10:00–17:00
visitor window to an 18:00 bistro dinner. This is a diagnosed classifier false
positive; the validator and raw response were **not modified** and the rejection
stands. No completed itinerary was saved. Original draft, failed job and session
reopen/ownership checks passed. Pre/post source hashes match.

The server budget is **EUR 2274 including EUR 250 reserve, leaving EUR 226**.
Manual review also flags model prose calling EUR 476 unallocated before separating
the reserve. See [the complete itinerary, diagnosis and Gemini comparison](milestone-2a-sol-paris-result.md).
Exactly **one** provider request was made under this new approval; no retry,
fallback or Gemini call. The prior 401 attempt remains separately archived below.
Full live acceptance is not passed. No Milestone 2B work was performed.

---

## Historical first Sol authentication attempt

The single authorized GPT-6.1 Sol/medium itinerary request returned **HTTP 401
`invalid_api_key`** on November 4, 2026. Client-observed full error-response latency
was **339 ms**. No itinerary or input/output/reasoning usage was returned; estimated
USD cost is unknown, not zero. Offline inspection found a placeholder-like local
key value, without an inherited environment override. No secret value is recorded.

The one-request cap was respected: **no retry, fallback or additional call**. All
validators remained unchanged and were not reached for itinerary data. No completed
trip was saved; failure/draft/session restoration and ownership checks passed in
the isolated SQL reopen check. The historical proposal was reused locally.

See [the full Sol live report and Gemini comparison](milestone-2a-sol-live-validation.md).
Real Sol itinerary-quality acceptance remains unverified. Configure a valid key
locally; another live request requires new approval. No Milestone 2B work was done.

---

## Prior OpenAI provider integration validation

The approved reliability pass remains intact. OpenAI Responses with official SDK,
GPT-6.1 Sol and medium reasoning is now the default; Gemini 3.5 Flash-Lite remains
an explicitly selected backup. No automatic provider/model fallback or SDK retry.
See [ai-providers.md](ai-providers.md) for the implementation and controlled-test
procedure. No live model request was made. Offline preflight confirms original
Paris inputs and a one-request limit; `OPENAI_API_KEY` still needs local setup.

Six added offline tests bring the suite to **55 tests**, covering both SDK wire
contracts, identical prompts/data, strict schemas, refusals/incomplete/malformed
responses, quota/auth/server/network failure handling, token/cache/cost arithmetic,
and owner-scoped durable audits for accepted, quality-rejected, schema-rejected and
upstream-failed attempts. The existing 49 reliability/auth/storage tests remain.

| Check                                       | Result                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `npm test`                                  | **55 passed**, no failures; all SDK transports mocked                                                   |
| `npm run lint`                              | Passed, zero warnings                                                                                   |
| `npm run typecheck`                         | Passed                                                                                                  |
| `npm run build`                             | Passed, public/static and protected/dynamic routes                                                      |
| `npm run format:check` / `git diff --check` | Passed                                                                                                  |
| `db:generate` / local `db:migrate`          | Audit migration generated and applied locally; isolated SQL tests passed                                |
| Production HTTP smoke                       | **13 routes passed**: public pages, protected redirects and anonymous API denial                        |
| Public credential boundary scan             | **23 assets passed** against configured private values; provider transports absent from frontend assets |
| Controlled Paris preflight                  | Passed offline: same input/base, exact Sol/medium and one-request limit; **key not configured**         |
| Live OpenAI/Gemini generation               | **Not run: zero model requests**                                                                        |

Code and harness are ready for review and a separately approved one-request Paris
test once `OPENAI_API_KEY` is configured in ignored `.env.local`. Real Sol output
quality, account access, latency, provider schema acceptance and billed charges
remain unverified. Local production smoke testing is not a hosted deployment.
No Milestone 2B, deployment, commit or push was performed.

---

## Prior targeted reliability validation

The follow-up reliability pass is documented in
[itinerary-reliability.md](itinerary-reliability.md). It adds audited buffer
normalization inside sufficient existing gaps, inclusive category allocations and
itemized/unitemized estimate reconciliation, substantial-meal and meal-time checks,
and stricter city-placeholder rejection. Model and provider response schema remain
unchanged. The strict validators still run after normalization.

All **49 tests**, lint, type-check, production build, format and whitespace checks
passed. Production HTTP smoke checks passed for **13 routes**, including anonymous
API denial and protected-page redirects. Budget/source labels render correctly.
Desktop/mobile review and overflow checks passed at **360, 390, 768 and 1440px**;
screenshots are `docs/screenshots/milestone-2a-reliability-{desktop,mobile}.png`.
The private-value scan passed across **23 public assets** and the new regression
fixture; local credentials and database/report directories remain ignored.
**Zero additional live Gemini requests** were made.
The recorded plan's buffer can be corrected 30→35 within its 60-minute gap, but
the plan still correctly fails four genuine meal/location findings. New budget
reconciliation yields EUR 2132 including EUR 250 reserve, with EUR 368 remaining.
The targeted implementation is ready for code/visual review. Live-quality sign-off
still needs separately approved testing of the updated prompt. No Milestone 2B,
deployment, commit or push was performed.

---

## Previous single-request live quality result

One explicitly approved revised-prompt itinerary request was run on November 4, 2026. **Live quality acceptance failed:** HTTP 200/STOP and strict schema/core
validation passed, but the unchanged quality gate rejected a 30-minute declared
buffer where 35 minutes were required. The rejected itinerary was correctly not
saved; failed-job state, original input, session and ownership protections survived
database reopen. Tokens: 1671 input + 2042 output + 1743 thinking = **5456**.

See [the complete live quality report](milestone-2a-live-quality.md) for all 12
activities, correct EUR 2412 total/EUR 250 reserve/EUR 88 remaining arithmetic,
Orsay's corrected 10:15 visit, the meal-cost categorization concern and additional
manual findings. No fields were rejected by the strict schema. No validator was
changed, no fallback or retry occurred, and no further live call is authorized.
Lint, type-check and all 39 tests passed after the reporting-script update.

The implementation remains reviewable, but **Milestone 2A live quality sign-off is
not passed**. Production build/responsive results below are from the preceding
unchanged app implementation. No Milestone 2B or unrelated work was started.

---

## Preceding offline quality-refinement validation

The latest refinement was implemented and tested offline on November 4, 2026.
See [itinerary-quality.md](itinerary-quality.md) for exact policies, code changes,
recorded Paris regression findings, and remaining limitations. This supersedes
quality-readiness claims in the earlier live-test report below.

- `npm test`: 39 passed, including stronger quality, persistence, provenance and
  unchanged-budget checks. The historical Paris response is now correctly rejected.
- Lint, type-check, production build, format and whitespace checks passed.
- Production HTTP smoke checks: 13 passed, including public pages, private-route
  redirects, anonymous API denial and the new itinerary source labels.
- Responsive itinerary checks passed at 360, 390, 768, 1440 and 1920px with no
  horizontal overflow. Desktop/mobile screenshots are in
  `docs/screenshots/milestone-2a-quality-{desktop,mobile}.png`.
- Public build secret scan passed: 23 assets checked against the two configured
  private values without printing them. Local secrets and data remain ignored.
- This offline refinement made **zero** live Gemini calls. The subsequent single
  approved test is reported above and did not pass live quality acceptance.
- The code/design was ready for review at this stage; no
  Milestone 2B, payment work, deployment, commit or push was performed.

---

## Earlier live pipeline report (before quality refinement)

# Milestone 2A validation — Gemini 3.5 Flash-Lite

Validated November 4, 2026, on Windows, Node 24.22.1 and npm 11.19.1.
This section supersedes the historical 1B/foundation reports below.

## Checks

| Check                                       | Result                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run lint`                              | Passed with zero warnings                                                                        |
| `npm run typecheck`                         | Passed                                                                                           |
| `npm test`                                  | 26 passed: actual auth/SQL plus explicit provider-boundary fixtures                              |
| `npm run build`                             | Passed; static example and dynamic protected routes                                              |
| `npm run format:check` / `git diff --check` | Passed                                                                                           |
| Live application-layer end-to-end check     | Passed after one explicitly approved itinerary retry                                             |
| Production HTTP smoke checks                | 13 passed; public example, public pages, protected redirects and anonymous API denial            |
| Public build secret scan                    | Passed; 23 public assets checked against the two configured private values without printing them |
| Hosted deployment / hosted PostgreSQL       | Not performed                                                                                    |

## Real Gemini test and quality assessment

The user configured `GEMINI_API_KEY` locally and approved one live attempt.
The opt-in `scripts/check-live-generation.ts` exercised real Better Auth signup,
authenticated resource handlers, complete-intent storage, confirmed city proposal,
Gemini through the official SDK, server validation, atomic persistence, database
close/reopen, restored sessions and ownership isolation in a separate disk-backed
SQL database. It did not alter the development accounts/database or deploy a site.
Next.js network routing/background-host durability was not part of this in-process
check; browser and production route checks cover those separate local boundaries.

Input: Paris as a single base; London departure; April 15–18, 2027; two travelers;
EUR 2500 entire-vacation group budget; balanced pace; Culture/Food; neighborhood
walks and one art museum; avoid nightclubs and multi-city travel.

The first city proposal passed with Paris, matching dates, Europe/Paris timezone
and plausible city-center coordinates. The first itinerary request returned HTTP
400 `INVALID_ARGUMENT` with the generic message “Request contains an invalid
argument.” No itinerary was saved, no fallback occurred and no automatic retry ran.
The exact rejected field was not identified by the provider.

Google documents that bounded nested schemas can exceed its decoding state limit.
The provider schema was simplified: object/array structure, required fields and
types remain constrained, while numeric/array bounds and text formatting rules
are described as guidance and remain fully enforced by the original server Zod
schema and domain validator. After the user explicitly approved one additional
itinerary call, the real city proposal from the first run was revalidated/reused
without another proposal call. That itinerary request succeeded with no API error.
This is consistent with schema-complexity rejection, rather than proof of which
individual keyword caused the original 400.

The final itinerary contains four consecutive days and seven activities:

| Day      | Theme                             |
| -------- | --------------------------------- |
| April 15 | Le Marais and Place des Vosges    |
| April 16 | Musée d’Orsay and Seine promenade |
| April 17 | Montmartre and Sacré-Cœur         |
| April 18 | Latin Quarter and departure       |

| Group estimate                    |  EUR |
| --------------------------------- | ---: |
| Return travel                     |  300 |
| Accommodation                     |  700 |
| Food                              |  400 |
| Local transport                   |  100 |
| Activities                        |   32 |
| Server-computed reserve           |  250 |
| Total including reserve           | 1782 |
| Remaining against selected budget |  718 |

All server checks passed: strict output schema, one city, four correct dates,
activity caps, coordinate/distance bounds, nonoverlapping times and travel buffers,
selected currency, essential cost categories and budget including the 10% reserve.
The original draft survived; the completed itinerary and session survived closing
and reopening SQL; list/read retrieval worked; anonymous and foreign reads failed.

Quality is a usable, fairly light baseline, not a fully verified travel schedule.
Neighborhood clustering and durations are plausible, but Food preferences resulted
in a food allowance rather than explicit food experiences. Flights, lodging and
meal estimates are unverified; arrival/departure times are assumed. The model
scheduled Musée d’Orsay at 09:00, whereas its current official Friday opening time
is 09:30. This is a concrete real-world scheduling limitation beyond the arithmetic
validator; the app labels schedules/locations/prices as AI estimates and asks users
to verify details. Published hours may change before April 2027. No museum-hours
integration or verified availability is claimed. [Official visit information](https://www.musee-orsay.fr/en/visit)

### Provider-reported tokens

| Request                             |        Input |       Output |                Thinking |        Total |
| ----------------------------------- | -----------: | -----------: | ----------------------: | -----------: |
| Successful original proposal        |          340 |          133 | Not separately reported |          473 |
| Rejected first itinerary            | Not reported | Not reported |            Not reported | Not reported |
| Approved successful itinerary retry |          600 |          765 |                    1610 |         2975 |

Three actual provider requests were made in total, all to `gemini-3.5-flash-lite`.
Reported usage across successful calls totals 3448 tokens. No usage was returned
for the rejected request, so this is not a claim of complete billing accounting.
The private raw reports are ignored `.test-data/live-gemini-latest.json` and
`.test-data/live-gemini-first-attempt.json`; they contain controlled test inputs,
real model output and sanitized diagnostics, never keys/passwords/cookies.
No more live requests were made after the approved retry.

## Automated coverage

- Original nine auth/storage tests remain: password hashing, session revocation,
  expiry, origin protections, isolation, draft concurrency, idempotency and persistence.
- SDK wire tests assert Flash-Lite endpoint, key only in a server header, structured
  JSON, bounded thinking/output, and no request logging. Rate/quota errors, server
  failures, incomplete/blocked output, invalid JSON/schema and transport errors fail
  without hidden retries, continuation or model fallback.
- Provider grammar omits numeric/array decoding bounds while full server validation
  enforces them, along with city, dates, pace, buffers, group cost arithmetic,
  currency, JPY units, essential categories, budget scope and reserve.
- Generation job tests cover explicit confirmation, missing results before validation,
  duplicate claims, provider/budget failure, safe retry, stale and late workers,
  immutable original input, revision drafts, database reopening and user isolation.
- Shared admission tests cover cross-user concurrency, minute/day/user allowance,
  atomic rollback on denial, Pacific midnight reset, expiring leases, stale release,
  invalid configuration and isolation from auth rate-limit cleanup.
- The hand-authored example passes the actual itinerary/budget validator and has
  no fabricated model or generation timestamp. It never inserts a user trip.

## Browser and security checks

Earlier 2A checks verified the real wizard handoff, error/retry UI, draft restoration,
sign-in restoration, private My Trips records and global navigation. Generation
layout passed 360, 390, 768, 1440 and 1920px checks without horizontal overflow.
The new public `/example-trip` renders without login or an API call, has explicit
hand-authored/unsaved/non-bookable labeling, and reuses the finished itinerary UI.
The example passed 360, 390, 768, 1440 and 1920px overflow checks. Its desktop/mobile screenshots are `screenshots/milestone-2a-example-desktop.png`
and `screenshots/milestone-2a-example-mobile.png`. Existing generation screenshots
show a genuine pre-key configuration error, not generated success.

Secrets remain in ignored `.env.local`; production uses protected server runtime
environment variables. `.env.example` contains blank secret placeholders and a
non-secret Flash-Lite default. No provider key is requested from judges. Gemini
requests use the server runtime; no PayPal secret request/transaction is implemented.
The README documents a future organizer-managed HTTPS demo URL and hosting secrets;
there is no claimed deployed site, and no hosting settings were changed.

## Resource and external limits

Defaults: 2 model attempts/shared rolling minute, 20/shared Pacific calendar day,
6/user/hour and one concurrent model operation per application database. Dedicated
`generation_quota` rows are separate from Better Auth cleanup. Local admission
denials retain explicit retry allowance; failed provider calls consume allowance.
Three attempts per phase, 24KB serialized preferences, 2048/32768 output-token caps,
1–14 days and 150-second provider timeouts bound work. No SDK retries, continuation,
paid-model fallback, tools or grounding are enabled.

Limits must match the Google project's actual Free Tier and active quota. Model
selection/app limits do not guarantee zero charges on a project linked to billing.
Other applications and separate app databases using that project are not observed
by these counters. Google retention and free/paid tier data-use terms still apply.

Jobs require a Node host with Next.js `after()` and 240-second route duration.
Host interruption requires explicit retry after five minutes; no independent
worker queue or hosted PostgreSQL deployment was provisioned. Email verification,
password recovery, OAuth and MFA remain deferred from 1B. Existing dependency-tooling
audit limitations remain recorded in the historical section.

## Files added for the refinement

- `src/server/generation-quota.ts`, `generation_quota` schema and additive
  `drizzle/0002_perpetual_wallow.sql`: shared admission/lease and strict limit config.
- `src/lib/example-trip.ts`, `src/app/example-trip/page.tsx`: honest public example.
- `tests/generation-quota.test.ts`: quota isolation/concurrency/configuration tests.
- `scripts/check-live-generation.ts`: explicit live-check/report harness; never runs
  as part of `npm test`; `--reuse-proposal` permits a separately approved single call.
- Example desktop/mobile screenshots. SDK adapter, runtime, generation service,
  shared itinerary display, footer, environment example and docs were updated.

No commit, push, deployment, PayPal transaction, refund, Trip Recovery, Bryntum,
AG Grid, AI editing or Milestone 2B work was performed.

---

## Historical validation reports

# Milestone 1B validation

Validated November 4, 2026, on Windows with Node 24.22.1 and npm 11.19.1.
The foundation report below is historical; this section describes current behavior.

## Final checks

| Check                                   | Result                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------- |
| Dependency installation and local setup | Passed; generated ignored secret, applied committed PostgreSQL migrations |
| `npm run lint`                          | Passed with zero warnings                                                 |
| `npm run typecheck`                     | Passed                                                                    |
| `npm test`                              | 9 integration tests passed; real auth and persistent database, no mocks   |
| `npm run build`                         | Passed; public pages static, protected/account/API pages dynamic          |
| `npm run format:check`                  | Passed                                                                    |
| Production HTTP smoke checks            | 13 passed: 5 public pages, 5 protected pages, 3 private API requests      |

Production HTTP checks verify public pages return 200; unauthenticated private
API requests return 401. Protected server pages redirect to login without
private data. Next.js streamed page redirects can carry HTTP 200 plus the
redirect instruction; HTTP status alone is not the page authorization test.

Successful native builds and localhost HTTP checks required elevated tool
permissions because the Windows sandbox blocks native compilation/networking.
The local production preview used the explicit ALLOW_LOCAL_DATABASE QA flag;
this is not a deployment or hosted PostgreSQL verification.

## Integration coverage

`tests/application.test.ts` exercises the actual Better Auth handler, application
resource handler, committed SQL migrations and a temporary disk-backed PGlite
instance. It uses generated in-memory secrets/passwords and reserved test email
addresses. Test directories are isolated from `.data/travelrelay` and removed
after closing the database.

- Signup creates a user, scrypt hash and server session; passwords are not stored
  as plaintext. Cookies carry HttpOnly and SameSite=Lax attributes locally.
- Anonymous, forged and database-expired sessions are denied.
- Incorrect credentials fail; logout revokes a session so its old cookie fails.
- Cross-origin auth and resource writes are rejected.
- Draft creation/resumption, autosave data and exact version persistence work.
- Alice cannot read or update Bob's resources, and their lists stay separate.
- Two concurrent writes with one expected version produce one success and one 409.
- Invalid dates, unsupported currencies, owner injection, invalid traveler counts,
  incomplete trip saves and oversized bodies are rejected.
- Saving a complete intent is atomic and idempotent under duplicate requests;
  a delayed write cannot mutate its archived draft. Trips remain owner-scoped.
- Users, sessions, drafts and trip intents survive database close/reopen.
- Auth rate limits return 429; return paths reject off-site destinations.

## Browser verification

- Public planning CTA redirects to login, preserves its return path, and signup
  returns to the intended wizard. Signed-out and signed-in navigation differ.
- Entered Kyoto/Toronto, fixed dates, two travelers, JPY 270000 spending budget
  and a food preference using the actual four-step form. Live summary updates.
- Draft destination and step state restore after refresh. Logout and login restore
  the review step and exact budget/date/preferences from the database.
- Save trip intent creates an actual private record, opens its overview, and adds
  the real trip card/count to the dashboard. No itinerary is fabricated.
- Reopened the same development database in the production server after stopping
  dev: the browser session, Kyoto draft and saved trip still existed. Production
  logout succeeded and restored public navigation.
- Opened two wizard tabs. A newer save caused the stale tab to show a conflict,
  disable writes and offer explicit reload/discard. That action restored the
  newer server version. Fixed an extra unload guard on that explicit discard.
- Supported Tokyo/Kyoto/Paris input changes the photo; unsupported input uses a
  labeled default inspiration image, without pretending to infer a destination.
- Wizard layout checked at 360, 390, 768, 1440 and 1920 CSS pixels with no
  horizontal overflow. At 390px the form stacks, photo is compact and its summary
  can be collapsed/expanded with native accessible controls. Overrides reset.
- Kept the original palette, typefaces, photos, sections and four-step controls;
  increased small text/secondary contrast, widened applicable containers and
  selectively tightened landing section spacing.

Screenshots: `screenshots/milestone-1b-wizard-desktop.jpg` and
`screenshots/milestone-1b-wizard-mobile.jpg`. They show real saved drafts for a
local test account, not AI output or a booking. Test account credentials were
randomly generated, never committed, and the browser was signed out afterward.

## Configuration and remaining limits

- `.env.example` has blank configuration names. `.env.local`, local data and test
  data directories are ignored; no credentials or database records are staged.
- PGlite is local, single-process persistent PostgreSQL-compatible storage.
  Hosted pg/Neon connection code exists but no external database was provisioned
  or exercised. Configure hosted PostgreSQL, migrations and HTTPS before hosting.
- Email ownership verification, password recovery, OAuth and MFA are not connected.
  Profile and auth pages communicate this limitation. No verification flag is faked.
- No itinerary generation/jobs, FX, ledger, supplier availability, PayPal purchase,
  refund, Trip Recovery, Bryntum, or AG Grid implementation was added.
- Full dependency audit reports 20 moderate findings in lint/migration tooling
  chains. `npm audit --omit=dev` includes 4 from Drizzle Kit's legacy esbuild
  dependency chain because npm also classifies it through Better Auth's optional
  CLI peer. No forced incompatible downgrade/override was used. Track compatible
  tooling updates; this run does not claim a clean audit.
- No hosted deployment, Git push, or Milestone 2 work. The supplied untracked
  design/kickoff/sponsor notes, APIMatic skills and skills lockfile are untouched.

## Historical foundation report

# Milestone 1 foundation validation

Validated November 4, 2026, on Windows with Node 24.22.1 and npm 11.19.1.

## Command results

| Check                       | Result                                            |
| --------------------------- | ------------------------------------------------- |
| `npm install`               | Passed; dependency lockfile created               |
| `npm run lint`              | Passed, zero warnings (`--max-warnings=0`)        |
| `npm run typecheck`         | Passed (`next typegen` and strict `tsc --noEmit`) |
| `npm run build`             | Passed; Next.js production output generated       |
| `npm run format:check`      | Passed                                            |
| `git diff --check`          | Passed                                            |
| `npm audit --omit=dev`      | Passed, zero production vulnerabilities           |
| Production HTTP smoke check | Passed all 16 expected route statuses             |

The Windows sandbox blocked the native build and local HTTP networking, so the
successful production build and HTTP checks ran with approved elevated tool
permissions. There is no automated unit-test suite; these are compiler, lint,
production route and manual browser checks, not a claim of integration coverage.

## Production route checks

HTTP 200: `/`, `/dashboard`, `/trips`, `/explore`, `/trips/new`,
`/trips/new?template=tokyo`, `/profile`, `/credits`, `/trips/preview`,
`/trips/preview/itinerary`, `/trips/preview/wallet`, `/trips/preview/bookings`,
`/trips/preview/explore`.

HTTP 404: `/trips/not-a-real-trip`, `/trips/preview/unknown`,
`/trips/preview/itinerary/extra`.

Unknown workspace URLs initially produced streamed HTTP 200 not-found pages.
The final shell explicitly prerenders only the five preview paths with
`generateStaticParams` and `dynamicParams = false`; production 404s now pass.
This restriction must be replaced with ownership-checked real trip retrieval
when persistence is implemented.

## Browser checks

- Inspected the editorial landing page, desktop three-column Explore grid, and
  optional docked assistant. Real photos load from local assets; no map-first
  layout or popup-based main experience.
- Production landing layout checked at 360, 390, 768, 1440 and 1920 CSS pixels;
  no page-level horizontal overflow. 390px mobile layout and 1440px desktop
  screenshots captured. Responsive overrides were reset afterward.
- Mobile navigation opens all five primary destinations, closes on selection,
  and dismisses with Escape. Explicit keyboard focus styles and skip link exist;
  this is not a full assistive-technology audit.
- Explore contains all six editorial cards, real destination photographs,
  non-live estimate labels, day-theme disclosures and customization links.
- Tokyo template opens the form with an editable single base city, 7-day length,
  USD spending-only budget, one traveler and selected interests.
- Required input prevents advancement; fixed dates submit and survive back
  navigation. Flexible month `2027-04` appears in review with the chosen length.
  Native date values are read at submit as well as during edits. End-before-start
  validation exists; no dates or destination availability are verified.
- Traveler controls and optional interest selection work. Back navigation retains
  in-form values. A JPY 200000 sample renders without decimal places, and currency
  selection clearly states it does not perform FX conversion.
- Review explicitly says nothing is saved/generated; save/generate stays disabled.
  Refresh resets the form to its initial/template state, as documented.
- TripWallet navigation uses a stable URL, communicates the planning-ledger
  boundary, and contains no financial records. Opening the assistant docks it
  beside desktop content and stacks it on mobile; message input is disabled.

## Screenshots

- `screenshots/landing-desktop.jpg`: final production landing at 1440px.
- `screenshots/landing-mobile.jpg`: final production landing at 390px.
- `screenshots/wizard-review-mobile.jpg`: sample review at 360px, not a saved trip.
- `screenshots/workspace-desktop.jpg`: empty wallet shell and optional assistant.

## Security, dependencies and repository state

- `.env.example` contains blank assignments and configuration names only.
  No credentials were requested or added.
- Verified `.env.local`, `.env.production`, `.pem` and `.key` files are ignored.
  A source/assets/docs helper scan found no matching private keys or model-key
  patterns. This is a targeted sanity check, not a comprehensive secret audit.
- Full `npm audit` reports 16 moderate **development-tooling** findings related
  to transitive `minimatch` glob amplification. No safe fix compatible with the
  current lint plugin peer requirements was applied. ESLint 9.39.5 is retained
  because bundled React/accessibility/import plugins do not yet accept ESLint 10;
  npm marks ESLint 9 deprecated. Track compatible tooling updates. Production
  audit is clean. No forced overrides or automatic major downgrades were used.
- APIMatic's nine TypeScript skills were verified present/readable, with future
  usage recorded in `architecture.md`. No integration is claimed.
- No PayPal/model SDK, Bryntum, or AG Grid installed. No payment, AI, booking,
  refund or availability result fabricated. No deployment or push performed.
- Existing MIT license and Git history preserved. The supplied untracked design,
  kickoff, sponsor notes, skills and skills lockfile were left untouched and are
  not bundled into the app implementation commit.
- GitHub API verified the active login as `DarshP-Dev` (account ID 254763357).
  The implementation commit uses its GitHub noreply author/committer identity.

## Exact next task

Complete the remaining **Milestone 1** persistence slice: secure authentication,
ownership-scoped PostgreSQL trip schema, durable wizard drafts, save/reopen trip
intent, and database-backed dashboard/overview empty states. AI generation stays
disabled. Do not begin Milestone 2 without user approval.

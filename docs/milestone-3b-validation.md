# Milestone 3B — Context-aware AI travel assistant

Implemented November 5, 2026, on `codex/milestone-3b-travel-agent`, using the
existing Next.js/Better Auth/Drizzle architecture, AI adapters and versioned 3A
editor. No live OpenAI/Gemini request, push, deployment, payment, refund, TripWallet
transaction, Trip Recovery or Milestone 4 work was performed.

## Implemented experience

- **Ask TravelRelay** is a collapsible 400px desktop dock beside the workspace.
  The itinerary remains visible. Mobile/tablet use explicit assistant/itinerary
  views with back controls, no obstructive overlay. Conversations and the composer
  stay mounted while switching; server drafts and owner/trip-scoped tab buffers
  preserve text after refresh and login. Explicit logout clears local buffers,
  while already saved database drafts/history remain private and restorable.
- Real Send/Retry actions queue authenticated durable response jobs. The UI shows
  saved/queued, generating, validating, ready, failed or interrupted state from
  the backend, never simulated percentages or partial assistant answers. Focus,
  reconnect, status checks and polling are reads only. Unknown send outcomes keep
  a stable message ID and offer a status check/explicit same-message retry.
- Questions receive the current saved destination/dates, travelers, original
  preferences/pace/interests, all stable activity IDs, local times/durations/buffers,
  location uncertainty, group estimates, category budgets, protected reserve and
  genuinely unallocated funds. The latest eight prior turns include their typed
  proposal and real approval/rejection state, so a follow-up can revise a suggestion
  without assuming it was applied. Session/credential/account data is excluded.
- Structured add/remove/update/move/resize/replace actions support coordinated
  proposals of up to 12 operations. New IDs are assigned server-side; replacements
  retain the referenced ID. The model cannot submit arbitrary tools, SQL, currency
  conversions, coordinates, URLs, verified metadata, owner IDs or budget totals.
- **Review itinerary proposal** opens a full-size comparison beside chat. It shows
  before/after titles, descriptions, categories, days/times, durations, buffers,
  locations, group estimates and source-reference counts, plus inclusive category
  allocations, itemized estimates, additional allowances, reserve and remaining
  budget. Mobile has a readable reserve/remaining summary and an accessible
  horizontally scrollable detailed comparison. Conflicts disable approval.
- **Approve & save** revalidates and atomically saves one audited itinerary revision.
  **Reject** changes no itinerary data. **Request changes** closes that proposal and
  prepares a follow-up without sending it automatically or overwriting an existing
  draft. **Refresh validated preview** uses no AI; old approval revisions become
  invalid. Overruns need an explicit checkbox and retain the reserve separately.
- Manual edits and approved AI edits update the same stored plan. Trip-scoped
  notifications refresh cards, Bryntum and map state; Overview/Dashboard/My Trips
  use the same JSON. Unsaved manual forms are preserved and version-blocked when
  an AI commit changes the trip. Original generated introductions/day themes are
  labeled historical; current activity highlights/counts/costs drive summaries.
  Latest-edit undo remains the existing non-financial audited restoration path.

## Provider and typed-tool architecture

`TripModel.respond` reuses the official OpenAI Responses SDK and Gemini adapter.
Primary remains **GPT-6.1 Sol / medium**, standard tier, strict structured output,
`store:false`, SDK retries disabled. Gemini 3.5 Flash-Lite remains an explicit
server-configured backup using the existing compact JSON-schema projection and
the same server DTO/validation. There is no provider/model fallback, expensive
continuation, tool loop, search, browsing or external supplier integration.

The assistant envelope is `{answer, activityIds, uncertainties, proposal}`; proposal
actions use an explicit closed type enum and nullable unchanged fields. Root and
action objects reject unknown members. Activity references must belong to the
saved trip. Additions/replacements require complete details; moves/resizes reject
hidden extra edits. Duplicate action targets, unsupported city/currency and false
first-person execution claims fail safely. Free-form text is never executable.
Ordinary factual prose still requires human judgment: the server cannot prove
every sentence is true. The fixed budget display remains server-authoritative.

`agent-context.ts` selects bounded, trip-owned context and translates intentions
into **3A batch operations**. `itineraryEditor.preview/commit` remain the schedule,
location and finance authority. New-location suggestions have unknown coordinates;
no geocoder or invented route is introduced. Refresh re-translates patches against
the latest plan so unrelated manual edits survive. Hard conflicts remain blocking;
pace/meal/travel-day assumptions retain 3A's explicit suggestion policy. The original
AI-generation response schema, normalization and quality thresholds are unchanged.

Sources checked for the provider contract:
[Sol model and pricing](https://developers.openai.com/api/docs/models/gpt-6.1-sol),
[Responses structured output](https://developers.openai.com/api/docs/guides/structured-outputs),
plus installed version-matched OpenAI/Google SDK source/types. No package upgrade
or new dependency was needed. Financial/booking/recovery tools are absent from the
allowlist; future additions require separate verified provider and approval paths.

## Approval, consistency and audit

Each proposal stores its canonical typed intentions, server-assigned IDs, base
itinerary version, preview, status and revision. Approval accepts only a stored
owner-scoped ID/revision, never executable operations from the browser. It invokes
the shared editor with server-only `ai-proposal` provenance. The editor's transaction
writes the plan/edit and conditionally approves the exact pending proposal through
an `onRecorded` hook. Audit/storage failures roll back all of these together.

Manual/version races return 409. A re-preview increments the proposal revision and
records another event; old approval links cannot apply it. Deleted references need
a revised suggestion. Rejected/changes-requested proposals cannot be approved.
Already approved requests return the historical outcome without another mutation
or model call. Subsequent manual edits/undo retain that historical receipt; the
current itinerary revision remains the authority, rather than reapplying it.

The original generation-attempt audit is never rewritten. New itinerary edits
record source/proposal ID and retain full before/after snapshots. Agent attempts
record provider/model, response elapsed time, input/output/reasoning tokens,
reference USD cost, typed tool proposals and validation failures. Usage is written
before schema/quality acceptance, including rejected output. Unknown usage/cost
stays null; reasoning counts are included in output once, never double billed.
Elapsed time includes the model adapter/parsing/usage-write overhead, not a claim
of provider-only wire timing. Keys, raw upstream errors, full internal prompts and
hidden reasoning are not returned or stored as audit payloads.

## Database/API migration

`0005_dark_black_widow.sql` adds five tables: `agent_conversation`, `agent_turn`,
`agent_attempt`, `agent_proposal`, `agent_proposal_event`; it adds `source` and
`proposal_id` to `itinerary_edit`. Existing edits default to `manual` and original
trip/generation JSON is preserved. Unique message mutation/ordinal and attempt
indexes, owner indexes and foreign keys follow the current database conventions.

Migration applied successfully to the local development PGlite database and fresh
isolated test databases. Conversations, draft versions, pending proposals, usage,
audit events and original generation records survive database close/reopen and
fresh authentication. Hosted PostgreSQL is supported by the existing Drizzle path
but was not provisioned or exercised in this milestone.

`GET /api/trips/{id}/assistant` returns private state (20 turns/page, optional `before`
ordinal). POST actions are draft/send/retry/approve/reject/request_changes/
refresh_preview. Auth, strict bounded JSON, exact-origin mutations, no-store and
resource ownership checks precede execution. Send returns 202 before the worker
runs; approvals and drafts are ordinary short transactions, not long HTTP waits.

## Tested conversations and outcomes

All assistant responses below came from explicitly authored **offline provider
fixtures**, not a live model. They exercise the official SDK boundary and real
application/auth/database/UI paths without asserting new live model quality.

| Conversation / proposal                                                                  | Verified outcome                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “How much budget remains?”                                                               | Context/response use the original €226 unallocated and separate €250 reserve; no edit/proposal needed, usage audit retained                                                                                                     |
| Add a €15 café stop on day two                                                           | Before/after remaining €226 → €211, reserve €250 unchanged, food €500 → €515 with the €175 additional allowance retained; nothing changes until approval                                                                        |
| Remove a walk, move another day, replace €70 dinner with €40 alternative, then resize    | Coordinated changes use one atomic batch audit; stable existing IDs, chronology and currency preserved; subsequent resize uses the same service                                                                                 |
| Make day three calmer (browser)                                                          | Remove canal walk and move morning walk 09:30 → 10:00, preserving lunch/dinner. Validated preview committed as one revision; map drops its point, scheduler/cards show the new time and Overview shows three current activities |
| Cheaper dinner (browser)                                                                 | €70 → €50 group estimate; inclusive food allocation €500 → €480, reserve €250, total €2,274 → €2,254, unallocated €226 → €246. No double counting or actual spending                                                            |
| Manual edit after proposal                                                               | Approval disabled for the old trip version. Re-preview retains unrelated manual title/description, invalidates the old proposal revision and permits a newly reviewed approval, without another AI call                         |
| Reject / Request changes                                                                 | Proposal closes, itinerary remains unchanged, and a follow-up draft is preserved. Prior typed actions/status reach the next explicitly sent request                                                                             |
| Overlap, insufficient gap, Orsay outside source-checked hours, foreign IDs/city/currency | Preview or response rejected; no unsafe commit or fabricated execution                                                                                                                                                          |
| Over budget                                                                              | Valid planning proposal requires explicit overrun acknowledgement; reserve and unitemized allowances stay separate                                                                                                              |
| Provider quota/timeout/schema/refusal failure                                            | Safe failed state, preserved message, no automatic retry/fallback. Usage unknown when not returned; known usage retained for rejected JSON                                                                                      |
| Host interruption / stale worker                                                         | Explicit recovery/retry; late original result cannot overwrite the replacement or release its active lease                                                                                                                      |
| Injected approval storage failure                                                        | Itinerary version, edit insertion, proposal approval and approval event all roll back together                                                                                                                                  |

## Validation results

| Check                                        | Result                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Full automated suite                         | **97 passed, zero failures**: 81 retained + 14 agent integration + 2 provider-wire tests                                                                                                                                                                                 |
| Lint / type-check / formatting / diff checks | Passed                                                                                                                                                                                                                                                                   |
| Production build                             | Passed, including the new Node assistant route and current client workspace                                                                                                                                                                                              |
| Real localhost production HTTP               | **63 assertions passed**: authentication, source isolation, strict inputs, stale drafts, queued responses, typed previews, approval/idempotency, audit provenance, undo, provider error, pages and saved drafts                                                          |
| Credential boundary                          | **38 public build assets**, five configured/private QA values, zero matches or client OpenAI/Gemini transports                                                                                                                                                           |
| Responsive UI                                | **360/390/768/1440px** without page overflow; comparison/day/time scrolling stays within its control                                                                                                                                                                     |
| Browser workflow                             | Collapse/refresh restores chat and message; coordinated approval synchronizes cards/scheduler/map; manual edits block stale approval; local re-preview/approval, mobile Request changes/Reject, explicit mocked-quota retry, and logout/login draft restoration verified |
| Controlled live harness preflight            | Passed with **zero live requests**, original four-day Paris context, Sol/medium, €2,500, two travelers, Culture/Food, 12,434 bytes of essential initial model input                                                                                                      |

The production QA process used a separate `agent-ui-review-*` PGlite database,
literal fake key and guarded Node preloader. Fixture messages explicitly say
**OFFLINE QA FIXTURE**. The application itself contains no simulated chatbot or
success fallback. The guard refuses a non-loopback host, non-QA database/fake key,
wrong model/schema or other external request. Normal application runtime always
uses the configured official provider. The HTTP seed/check/preloader scripts are
repeatable development tools, never deployment hooks.

Visual evidence:

- [Docked desktop workspace](screenshots/milestone-3b-workspace-desktop.png)
- [Desktop before/after review](screenshots/milestone-3b-proposal-desktop.png)
- [Stale preview blocked](screenshots/milestone-3b-stale-preview-desktop.png)
- [Mobile conversation](screenshots/milestone-3b-chat-mobile.png)
- [Mobile review / separate reserve and remaining](screenshots/milestone-3b-proposal-mobile.png)

Global navigation, landing identity/photography, cards, manual editor, optional map
and Bryntum are preserved. Landing capability copy now reflects the working
assistant while payments remain explicitly deferred. No browser console errors
were observed in the final review.

## Limits, costs and live-test readiness

- Real assistant **model quality is not live-validated yet**, including Gemini's
  new assistant grammar. Offline fixtures prove contracts/validation/UI/persistence,
  not an LLM's factual accuracy. No live weather, routes, opening-hour, availability,
  social-content or booking source is connected. Dated Orsay information remains
  the existing limited reference set; unsourced/new details are estimates.
- Tools edit activities only. Trip-wide dates/base/currency/travelers/preferences,
  category allowance overrides, actual spending, payments and booking records are
  not mutable by this assistant. It may explain limitations or ask clarification.
  Original AI themes/intro are retained and labeled, rather than silently rewritten.
- Context is limited to 96KB and eight preceding turns, with optional prose/history
  trimming. It does not remember every older message in each provider request.
  Essential context exceeding the cap fails before a call. Response cap is 8,192
  tokens including reasoning; very large coordinated requests may need splitting.
  Messages max 2,000 characters, answers 6,000, actions 12, three admitted explicit
  attempts, 200 turns/trip, 20-row history pages and 50 preview revisions.
- Generation and chat share the unchanged defaults: 2 calls/minute, 20/Pacific day,
  6/user hour and one active provider operation. Quota denials do not consume an
  admitted retry. Other applications/account usage remains outside these counters;
  none of these settings guarantees a free bill. Preview/reject/approve/undo do
  not call a model. API pricing is separate from the travel budget/TripWallet.
- Dated standard-reference Sol rates are $2/M uncached input, $0.10/M cached input,
  $10/M output including reasoning; actual cache writes/tiers follow existing
  accounting. As a rough planning example, **3–8K input + 1–3K total output costs
  about $0.016–$0.046 USD per response**, before special rates/taxes/discounts.
  Using the full 8,192 output cap alone is about $0.08192 plus input. The fixture's
  1,200/800/300-reasoning accounting gives $0.01040 but is **synthetic**, not a real
  token/cost measurement. Actual usage/cost awaits the approved controlled call.
- Hosted PostgreSQL, backups, HTTPS/proxy configuration and a real 240-second Node
  `after()`/drain window remain deployment prerequisites. This is recoverable state,
  not an independent durable queue. A crash can lose a result; an explicit retry
  may incur another charge. Existing email recovery/verification limitations and
  3A's 12 moderate tooling advisories remain. No dependency upgrade was attempted.

**Ready for exactly one controlled live Sol agent request, subject to approval.**
`npx tsx scripts/check-live-agent.ts --preflight` is offline. Only after new explicit
approval, `--confirm-one-live-agent-request` allows one Sol/medium structured
Responses request using the original Paris scenario and a calmer-day-three ask.
It reuses the recorded itinerary locally, verifies a one-request transport ceiling,
records private usage/elapsed/validation results, never retries/switches providers,
and never approves its own proposal or changes the itinerary. That live mode
has not been executed.

Milestone 3B is ready for final offline review and that controlled live test.
Milestone 4 is not started. Future verified booking/recovery tools can extend the
closed proposal/approval/audit boundary, with separate financial authorization.

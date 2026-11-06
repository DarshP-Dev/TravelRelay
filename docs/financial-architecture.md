# Milestone 4A — financial architecture

TripWallet is a planning and financial-history workspace, **not a PayPal balance
or stored-value wallet**. The selected trip currency and budget scope remain in
`trip.data`. The existing itinerary/budget service remains the planning authority.
There is no PayPal SDK, checkout, provider verifier, webhook or payment/refund
execution endpoint configured in this milestone.

## Planning and exact money

`itinerary-budget.ts` and `itineraryEditor.preview/commit` are reused unchanged.
Inclusive food/transport allocations contain their itemized expenses plus the
additional unitemized allowance, once. Reserve remains separate from unallocated
funds. Quote acceptance uses the same schedule/venue constraints and overrun
acknowledgement as other manual edits; the emergency reserve is never spent.

`money.ts` parses decimal input into integer minor units without floating-point
arithmetic. CAD/USD/EUR/GBP/AUD use two decimals and JPY zero. FX uses an exact
BigInt numerator/denominator from the provider's raw decimal token and rounds
half-up once per converted line to the target currency precision. No floating-
point multiply/divide participates in a monetary conversion. Individual amounts
are bounded at 10^12 minor units; sums reject unsafe integers.

## FX provider and snapshots

The server calls the fixed official **Frankfurter v2** single-pair endpoint with
`providers=ecb`. Supported app currencies are CAD/USD/EUR/GBP/JPY/AUD; that list
is **not** a promise of PayPal processing support. Currency inference uses a small
documented country mapping and falls back to the trip currency; users can save a
local-currency override. The home trip currency/history is never changed by it.

[Frankfurter documentation](https://frankfurter.dev/) describes daily reference
rates, provider pinning and caching. v1 is deprecated, so v2 is used. No key is
required. These are indicative ECB references, not current dealer prices, actual
PayPal conversion rates, charged amounts, guaranteed refunds or fees.

`fx_snapshot` stores an immutable UUID, original/quote currencies, exact decimal
rate, provider, source URL, source date, retrieval/expiry timestamps and rounding
rule. `fx_cache` points to the latest snapshot. The persistent one-hour cache and
SQL pair lease coalesce concurrent requests across replicas; lookup timeout is
eight seconds, redirects are rejected, responses are bounded at 16KB, failures
cool down for a minute and no automatic retry/fallback is used. Response pair,
date, rate bounds and duplicate rate fields are validated. Page reads do not
fetch FX. Same-currency identity snapshots make no external request.

Expired snapshots or references older than four days are explicitly stale. A
usable stale snapshot can be returned during an outage/refresh cooldown with its
dates and warning. Applying it requires a **separate stale-rate acknowledgement**;
references older than seven days cannot be applied. New quote saves recheck
staleness, pair and age server-side. Missing/unusable rates fail safely, retain
the original input and never fabricate a conversion. Stored historical quotes
are not silently repriced when rates change. No endpoint/base-URL env override
or frontend provider transport is supported. This public service has no paid API
account in the app and no uptime/availability guarantee.

## Quote and booking-intent lifecycle

`POST /api/trips/{id}/wallet` accepts only strict discriminated actions:
`preview_quote`, `save_quote`, `cancel_intent`, `settings`, `convert`.
All require a real owner session and same-origin mutation, bounded JSON and
server-side validation; anonymous requests are 401 and foreign trips 404.
GET restores a snapshot and never fetches FX or starts a model/provider action.
The Node route has a 30-second hosting budget, independent of 240-second AI jobs.

A quote targets an existing stable activity ID. It preserves the original native
amount/currency, an optional **unverified user supplier note**, converted home
estimate and immutable FX reference. Preview builds a normal editor update from
current server activity fields, with the converted cost and exact activity
category/index. It shows whole-trip before/after budgets; there is no second
frontend calculator. Saving requires the reviewed itinerary and wallet versions.

The existing editor transaction writes the plan/audit, then `onRecorded` performs
wallet CAS, inserts the original intent, mutation receipt and zero-money
`intent_created` event. Any error rolls back all writes. Duplicate exact mutation
IDs return saved state; conflicting payloads and stale versions fail. Up to 500
historical references/trip and one active planning reference/activity are allowed.

The quote is **planned/unbooked**, not an order, capture or supplier reservation.
Closing a never-paid reference requires explicit confirmation, appends
`intent_canceled`, and retains its original amount/FX. It does not undo the activity
estimate or cancel/refund anything. References with provider history cannot be
closed through that planning-only action. A new quote is a new reference; prior
native amounts are not rewritten. Current activities link to their stable days.

Manual/approved AI edits, moves, replacements, deletions and latest-edit undo use
the same current plan. Wallet projections are derived anew, and quote title/time/
location/cost/category mismatches are flagged. Removing an activity retains its
financial reference/history; no financial event is automatically generated.

## Financial ledger and trusted-provider port

`financial-ledger.ts` defines a closed **domain** event model, not PayPal SDK/wire
types: checkout pending, authorized, payment pending, captured, failed/canceled,
refund pending/completed/failed and completed reversals. Original and provider-
reported charged currencies/amounts are separate. Order, capture, refund,
reversal and reconciliation references, occurrence/record timestamps, fees and
minimal verified outcome metadata are retained. Each event also freezes its
display currency, estimated converted principal and fee, alongside the immutable
rate snapshot/rounding rule. Historical display amounts need not be recomputed
after a conversion-code upgrade. No hidden credentials/raw
provider response is stored.

`createWallet(...,{verifier})` has a server-only reconciliation port. **Runtime
does not supply a verifier**, and the authenticated HTTP schema has no reconcile,
event/status injection, capture or refund action. Frontend-supplied amounts cannot
establish payment success. A later adapter must independently verify the intended
merchant/product, order ownership/reference, status, currency and amounts through
PayPal API or signature-verified webhook evidence. The port supplies only a stored
owner-scoped intent and opaque reconciliation reference, never a browser outcome.
4A tests inject clearly labeled offline verifier fixtures into isolated databases;
these are not production fallback records or demo successful payments.

Reconciliation locks the wallet row before reading history and atomically appends
one event with a monotonic sequence and new wallet version. Global provider/event
and provider/business-operation unique indexes deduplicate callbacks and multiple
webhook IDs for one capture/refund. Conflicting duplicate monetary/reference/fee
data fail closed. The reducer validates currency, owned capture/order references,
pending-stage prerequisites, original intended amount limits, cumulative capture/
refund/reversal and fee limits, and immutable fee treatment. Pending refunds reserve
their amount so concurrent refund/reversal attempts cannot over-release it.

Reported fees retain explicit currency and treatment: additional traveler cost,
included in capture, merchant-paid or unknown. **Only additional traveler fees**
enter projections. Merchant/included fees are not added to captured principal a
second time; unknown treatment remains separate with a warning. Fee credits cannot
exceed that capture's verified fees or change its treatment. Different-currency
fees require a separate verified accounting entry rather than a guessed conversion.

Original-currency spending is captured principal less **completed** refunds and
reversals. Pending refunds never reduce spending. Home equivalents of foreign
events use the intent's immutable indicative rate and are labeled accordingly;
provider-reported charged values are preserved/displayed separately. They are not
silently substituted for that planning reference rate or claimed as settlement FX.
Milestone 4B preserves capture and refund settlement metadata separately. The
demo uses a USD capture and indicative trip FX; it does not infer the buyer's
bank or card conversion from the merchant's reported settlement.

Financial projections replace covered itemized estimates, instead of adding both:
for each current item take the greater of its estimate and net confirmed plus
pending principal, retain the additional unitemized allowances, include orphaned
paid/pending references and only additional traveler fees. A refunded but still
planned activity retains its unpaid estimate until the traveler separately edits
the plan. Planning unallocated funds and financial-projection headroom have distinct
labels; both protect the same reserve. Original-currency amounts remain authoritative.

## Persistence and audit constraints

Migration `0006_powerful_angel.sql` adds six tables: `fx_snapshot`, `fx_cache`,
`trip_wallet`, `wallet_intent`, `wallet_mutation`, `financial_event`. A unique
trip/owner index supports composite FKs through wallet → intent → event so owners
cannot be mismatched by a database write. Amount/currency/status/proof-kind checks,
active-reference uniqueness and version/business-event indexes supplement service
checks. Wallet mutations/settings share optimistic versioning with financial events.

The reviewed migration orders composite unique indexes before referencing FKs
and includes custom PostgreSQL/PGlite triggers. Events, rate snapshots and mutation
receipts reject UPDATE/DELETE. An intent permits only planned→canceled status and
timestamp changes; original currency, amount, FX and activity context are immutable.
FK retention prevents accidental cascading deletion of financial evidence. Future
account-deletion/retention policies need an explicit design before enabling deletion.
Keep these custom SQL guards when generating later migrations.

Migration `0007_pretty_namorita.sql` adds the frozen per-event conversion fields.
It backfills only those new metadata columns from each existing exact snapshot
using numeric half-up rounding inside the migration transaction. It temporarily
reinstalls the immutable-event trigger for that schema backfill; original native
amounts, statuses and proof are unchanged. New writes supply all fields from the
server's BigInt converter, never frontend conversion results.

`TripWallet`/`wallet-summary` reuse existing tokens, horizontal tabs and optional
assistant dock. Wallet save notifications refresh editor/agent views through the
existing scoped event; focus/reconnect/status reads restore financial state without
discarding quote input. Unsaved manual forms keep the existing stale-save protection.
Overview, cards, Bookings and Itinerary use the same saved planning amounts. Native
quote history and source metadata remain distinct from current projections.

## Milestone 4B Sandbox adapter

All nine installed APIMatic TypeScript skills are readable under local
`.agents/skills/`: integrate-paypal, getting-started, authentication,
client-initialization, calling-endpoints, models, configuration-resilience,
error-handling and testing. Their installed skill names have the `typescript-`
prefix. The generated `paypal` package is not installed. Milestone 4B uses
the authorized fixed-host REST alternative and official browser SDK v6.

Migration `0008` adds `paypal_booking`, `paypal_operation` and
`paypal_webhook_receipt`. The booking's composite FK binds it to one immutable
owner/trip/activity quote. A short transaction records an outgoing operation
and stable request UUID before its external write. Refund claims serialize on
the booking row and reserve against the verified capture in native currency.
Refund authorization remains separate from capture; no AI money tool is registered.

The adapter verifies order ownership references, merchant, currency and exact
amount, then verifies the associated capture/refund by provider retrieval.
Only then does it call the wallet's server-side verified append path.
Append and wallet version advance in one transaction. A duplicate or a later
notification cannot count the same capture/refund again. If interrupted before
booking or operation metadata is updated, a new retrieval can finish linking
the already recorded immutable event. Signed webhook receipts deduplicate
notifications; history uses stable provider-operation keys independent of delivery.

Milestone 5 can use the same owner-bound booking/capture and refundable balance,
call the reviewed refund operation after explicit approval, and wait for a
verified immutable outcome. It must not treat an outgoing claim or pending
refund as returned funds. See [Sandbox setup and acceptance](paypal-sandbox.md).

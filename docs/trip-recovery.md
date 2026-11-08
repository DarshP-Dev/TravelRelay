# Trip Recovery

Enable `ENABLE_RECOVERY_SIMULATION=true` with the existing Sandbox merchant
configuration. The flag is off by default and has no effect without a configured
Sandbox client. Apply migration `0010` before starting the application.
Existing cases and history remain readable after the simulation flag is disabled.

1. Open a saved trip's **Recovery** tab from Bookings or Ask TravelRelay.
2. Choose a demo booking with a verified capture, enter a reason, and record a
   simulated cancellation. Its itinerary card keeps its schedule and links to the case.
3. Ask for AI alternatives or review leaving the slot free. Review each
   alternative's dates, buffers, conflicts, estimated group costs and assumptions.
   Approving an option applies only the itinerary edit.
4. Open the original booking for a separately reviewed full or partial refund.
   Use **Check PayPal status** after an interrupted provider request.
5. A replacement may stay unbooked. For the optional demo, follow the link to
   review and save a separate USD 5.00 recovery checkout quote on its activity,
   after the original full refund is verified, then separately
   approve checkout with a PayPal Sandbox buyer. The demonstration does not
   buy access to the venue described by the itinerary.

Migration `0011` preserves the approved activity estimate and itinerary revision
when preparing this quote. The quote has its own native price, FX evidence and
expiry. Its zero-money audit is distinct from a future verified payment. For
example, an approved EUR 4.00 stroll and USD 5.00 quote (EUR 4.48 indicative) keep
EUR 222 planning funds and EUR 250 reserve unchanged. After a future capture,
actual spending is USD 5.00 and the indicative financial projection covers the
EUR 4 estimate once; its remaining headroom may differ from planned unallocated
funds. Changing the approved revision invalidates replacement checkout. 6. Mark the plan complete once the itinerary choice is saved and outstanding
provider operations have been reconciled. A failed replacement or refund
remains visible even if the traveler closes the plan.

## Data and approval boundaries

`recovery_case` binds the original booking, trip, owner and activity via a
composite foreign key. It keeps the cancellation's provenance, reason,
original schedule, estimate, captured/refunded snapshot and indicative FX.
The unique booking key deduplicates cancellation requests. A database trigger
protects cancellation evidence and the approved edit and completion references.
The migration adds tables and an index on bookings without modifying existing
booking, order, capture, refund or ledger rows.

`recovery_attempt` stores review input, itinerary and wallet versions, bounded
alternatives, rejected-option findings, model and usage metadata. The
authenticated, same-origin `/api/trips/{id}/recovery` route returns private,
uncached state. An explicit suggestion POST queues at most one active attempt
per case. The same assistant provider, timeout and project quota apply. Refresh
never starts a model call. An interrupted job remains visible and can be
replaced with an explicit request. Production must support the existing
240-second Node background duration or move this worker to a durable hosted
runner before relying on it.

The model receives saved activities, preferences, travelers, timing, estimates,
venue references and the original booking's financial summary. It can return
only the existing typed activity intentions inside a bounded alternatives
schema. The server translates them into editor operations, checks the current
schedule, and projects finances using the same TripWallet calculations.
Replacement operations preserve the old booking/activity identity in history
and assign a fresh ID to the new activity. An unverified planning move retains
the original ID and requires explicit acknowledgement. The existing editor
commits the plan, audit and recovery approval in one transaction, with itinerary
and wallet version guards. Rejection, expiry and conflicting edits cannot save
a plan. Assistant conversations receive a bounded case summary and direct the
traveler to Recovery and Bookings for consequential actions.

Recovery has no money mutation endpoint. It reads financial steps from the
original booking and the replacement activity's own immutable quote and booking
references. The existing PayPal service records authorization claims before
provider writes, verifies the results and appends the ledger. The case reflects
unresolved, failed and verified provider outcomes from those records without
copying balances or inventing a shared database/PayPal transaction. A refund and
a replacement checkout can therefore succeed or fail independently. Uncertain
operations use the existing read-only reconciliation and signed-webhook paths.

## Financial example

At the isolated fixture's USD→EUR reference rate of 0.8, a USD 5.00 capture is
EUR 4.00 indicative actual spending. A pending USD 2.00 refund keeps actual
spending at EUR 4.00. Once verified, that partial refund leaves USD 3.00 net
(EUR 2.40 indicative). A verified refund of the remaining USD 3.00 returns the
original net to zero. A separate USD 5.00 replacement capture brings trip net
actual spending to EUR 4.00 again. A failed replacement instead leaves it at
zero. The EUR 250 reserve stays separate and unchanged throughout. Planning
unallocated funds and headroom after verified spending are shown separately.

## Boundaries and controlled live checks

Supplier notifications, inventory, operating hours for unknown venues and
venue prices have no live verification adapter. A planning reschedule cannot
reschedule a supplier booking. Proposed locations without stored coordinates
have no map pin. Refunds or orders without recoverable provider IDs can require
a signed webhook or Sandbox operator reconciliation. Hosted PostgreSQL and signed
webhook delivery need separate validation.

For one separately authorized live AI test, use a fresh isolated four-day Paris
fixture with an explicitly simulated cancellation of the Day 2 culture walk
and request one GPT-6.1 Sol response at medium reasoning. Compare the saved
schema, schedule, reserve and wallet impact, record usage and latency, and stop
with the review pending. Do not retry or switch providers.

For a separately authorized Sandbox recovery test, use a dedicated new QA trip
and an eligible verified demo capture with remaining refundable balance. Show the
reviewed refund amount and obtain explicit approval before any refund. Verify
and reconcile that result before opening any separately approved USD 5.00
replacement order and buyer capture. Use read-only reconciliation on ambiguous
results. The historical refunded Paris acceptance booking is excluded.

## Offline validation

- All 144 tests passed. The five recovery scenarios include cancellation
  isolation and deduplication, typed Sol responses, rejections and stale wallet
  versions, blocked schedule conflicts, interruption recovery, and independent
  refund/replacement outcomes after database reopen and fresh sign-in.
- An isolated `0009` to `0010` migration preserved all 12 seeded records across
  bookings, provider operations, wallet intents, FX and ledger history. The
  database rejected a cross-owner reference and attempted changes to cancellation
  evidence. The migration was reapplied idempotently.
- Lint, type-check, formatting and the Webpack production build passed. The
  client asset scan found no configured credentials or provider secret keys.
- The production Chromium scenario passed 59 HTTP and browser assertions,
  including a private case after refresh, itinerary approval, separate refund
  approval and a separate replacement capture. It verified two distinct
  captures, one completed refund and an unchanged EUR 250 reserve. The comparison
  had no page-level overflow at 360, 390, 768 and 1440 CSS pixels.

To reproduce the browser check after a production build, set
`PLAYWRIGHT_CORE_PATH` to a local Playwright Core package with Chromium available.
Run `node --import tsx scripts/prepare-recovery-review.ts` and then
`node scripts/check-recovery-browser.mjs`. The harness starts a loopback-only
production server on port 3003 with an isolated fixture and mocked AI, PayPal
and FX transports. Screenshots are written under the ignored
`.test-data/recovery-screenshots/` directory.

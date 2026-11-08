# Milestone 5 — final recovery acceptance

**Stage 5: PASS.** The local Sandbox recovery workflow is ready for final
Milestone 5 sign-off. This is local application/Sandbox acceptance, not a
deployment, supplier reservation or signed-webhook acceptance.

Implementation reviewed: `86fa445` on
`codex/recovery-checkout-quote-separation`. No application change, new live model
request, PayPal order/capture/refund, push or deployment was performed in Stage 5.

## Provider-confirmed financial outcomes

Fresh, fixed-host read-only Sandbox retrieval verified the merchant association,
booking/order/capture relationships, native amounts and statuses. OAuth was used
only to authenticate these reads. All transaction writes were blocked in the
reconciliation transport.

| Record                         | Native amount | Confirmed status    |
| ------------------------------ | ------------- | ------------------- |
| Original capture               | USD 5.00      | REFUNDED            |
| Original full refund           | USD 5.00      | COMPLETED           |
| Replacement capture            | USD 5.00      | COMPLETED           |
| Captures less completed refund | USD 5.00      | Net actual spending |

There are exactly two distinct capture events and one completed-refund event,
with separate original/replacement booking and provider references. The original
capture has USD 0.00 available to refund. No duplicate or unresolved provider
operation was found. USD 0.90 total reported merchant fees remain separate from
traveler spending; no additional traveler fee was invented.

Provider identifiers and private reconciliation responses remain in ignored
local evidence, not in this report or Git.

## Itinerary, approval and case state

The historical canceled Saint-Germain culture walk remains in the immutable
cancellation snapshot, booking/quote history and itinerary approval audit.
The selected similar replacement is the self-guided Saint-Germain literary and
architecture stroll on Day 2, April 16, 2027, 14:00–15:30 local Paris time,
90 minutes with a 30-minute planned buffer and EUR 4.00 group estimate.
Itinerary revision remains **3** and wallet revision is **7**.

Exactly one recovery review is applied in this QA case, with its first selected
option linked to the same atomic editor audit by proposal ID, mutation ID and
version. Its provenance honestly states offline replay of the previously
recorded Sol recommendation, followed by explicit user approval; no new live
model usage was recorded. The separate original live AI recovery review was
checked on a read-only database copy: it remains ready/pending with no applied
option. Its original files and the historical fully refunded Paris transaction
remain unchanged.

The real case is still **Itinerary updated** (`itinerary_updated`), with
`resolvedAt = null`. All current payment operations are verified; the applied
edit exists and there is no attention, pending-refund or pending-replacement
state. It is therefore eligible for the supported **Finish recovery plan**
action. Executing that action twice on an isolated offline copy produced the
derived `complete` state and one stable completion timestamp, without modifying
itinerary or financial records. The real case was **not** completed. There is no
invented `RECOVERED` supplier status or claim of fulfilled travel inventory.

## Budget reconciliation

| Value                                            |       Result |
| ------------------------------------------------ | -----------: |
| Group budget                                     | EUR 2,500.00 |
| Planned allocations before reserve               | EUR 2,028.00 |
| Approved replacement estimate within allocations |     EUR 4.00 |
| Protected emergency reserve                      |   EUR 250.00 |
| Genuinely unallocated planning funds             |   EUR 222.00 |
| Net actual payment                               |     USD 5.00 |
| Indicative home equivalent                       |     EUR 4.48 |
| Financial projection before reserve              | EUR 2,028.48 |
| Financial projection headroom after reserve      |   EUR 221.52 |

The recorded Frankfurter/ECB reference is 0.89566 EUR per USD, source date
November 6, 2026. Original currencies, original/refreshed immutable FX snapshots,
expiry metadata and transaction timestamps are preserved. This is an indicative
reference, not PayPal's buyer funding conversion or a verified supplier price.
The original capture/refund offset exactly. The replacement payment covers its
EUR 4.00 estimate once; the EUR 0.48 difference reduces financial headroom while
planning unallocated funds remain EUR 222.00. Quote creation/FX refresh are
zero-money planning events, not extra expenses or captures.

## Persistence and workspace checks

- Reopened the configured PGlite database and verified exact itinerary,
  wallet/ledger, booking and recovery restoration. Historical rows and approval
  evidence were compared with pre-payment baselines.
- Duplicate order/capture and completion requests were replayed only on offline
  copies with external transport disabled. They created no duplicate financial
  event or edit. Foreign-owner reads and completion were denied.
- The user signed out and signed back in to the intended account; protected
  saved-trip views restored after refresh. No password was collected.
- Recovery, chronological Itinerary, Bryntum Scheduler, Overview, Bookings and
  TripWallet showed the same revision, replacement, payment references and
  reserve-separated totals. The assistant showed revision 3 and the same
  planning funds/reserve; its saved context was inspected without sending a
  message or invoking a model. Recovery context correctly remains unfinished.
- Responsive checks at 360, 390, 768 and 1440 CSS pixels found no page-level
  horizontal overflow. Local screenshots remain in ignored QA evidence.

## Automated validation

| Check                               | Result                                    |
| ----------------------------------- | ----------------------------------------- |
| Full `npm test` regression suite    | 151 passed; 0 failed/skipped              |
| Isolated production HTTP regression | 67 assertions passed                      |
| Lint                                | Passed; zero warnings                     |
| `npm run typecheck`                 | Passed                                    |
| Formatting check                    | Passed                                    |
| `npm run build -- --webpack`        | Passed; 22 static pages generated         |
| Configured private-credential scan  | Passed; zero matches in 336 checked files |

HTTP and regression provider traffic was explicitly mocked in isolated databases.
No live OpenAI/Gemini request or real PayPal financial mutation was made by these
checks. The credential scan covered source, tests, documentation, public files
and production client assets. Environment files, database files, private evidence
and screenshots remain ignored.

A final post-report scan also checked 218 source/document files and 64 production
client assets against configured private credentials and credential signatures:
zero violations. No files were staged or committed during this review.

## Known limits and Milestone 6 deployment prerequisites

Supplier cancellation is explicitly simulated. No supplier inventory, venue
availability, new coordinates, verified routes or confirmed venue admission was
invented. The stroll's missing coordinates limit geographic transfer verification;
existing minimum-buffer and schedule checks remain enforced. The unchanged Day 4
meal advisory remains a planning suggestion. Signed Sandbox webhook delivery has
not been verified; hosted PostgreSQL and deployed-host acceptance remain untested.

Before an independently approved deployment:

1. Provision shared hosted PostgreSQL with backups and a tested restore; apply
   migrations through 0011. PGlite and the local production-preview override are
   not a shared/serverless production database.
2. Configure the exact HTTPS origin, stable auth secret, database connections,
   approved model settings and merchant credentials in protected server-side
   environment variables. Keep PayPal Sandbox explicit for this demonstration.
3. Verify a Node host supporting Next.js `after()` for the entire 240-second
   model-worker window, or implement and test the documented durable-worker
   deployment strategy before depending on shorter-lived hosting. Test graceful
   restarts, stale-job recovery and shared provider quotas on that host.
4. Validate trusted proxy/client-IP handling, authentication/rate limits, secret
   boundaries, HTTPS and production resource limits. Email verification, password
   reset, OAuth and MFA remain documented authentication limitations.
5. Separately authorize Sandbox webhook configuration and verify real signed
   delivery, replay/deduplication and reconciliation on the intended HTTPS host.
6. Run isolated host acceptance and browser/SDK checks without loading QA
   preloaders or fixture credentials into the deployed demonstration. Publish a
   judge URL only after deployment approval; do not use live provider mutations
   as build/deployment hooks.

No Milestone 6 work or deployment was started. Real case completion remains a
separate explicit application action for the user to approve.

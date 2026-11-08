# Recovery checkout quote correction

The original planning quote intentionally committed a converted price through
the itinerary editor. Applying that operation to an approved recovery activity
would have replaced EUR 4.00 with EUR 4.48, advanced revision 3 and reduced the
EUR 222 planning balance. The new explicitly designated `recovery-checkout`
intent keeps the native USD 5.00 price and FX evidence separate from that plan.
Ordinary planning quote behavior remains covered by the existing wallet tests.

## Implementation and migration

- Migration `0011_recovery_checkout_quotes` adds purpose, recovery-case identity
  and an immutable planning-estimate snapshot to wallet intents. Old records
  default to `planning`; no booking, financial event, refund or audit is rewritten.
- A composite owner/trip/replacement-activity FK and unique recovery-case key
  prevent cross-owner links and duplicate replacement quote identities.
- The shared server guard verifies applied approval/edit references, the unchanged
  approved revision, active case, original merchant and verified full refund.
  Quote save and checkout revalidate under trip/wallet/case locks. Capture retains
  its single durable claim and also rejects a stale recovery quote.
- Quote save/refresh appends zero-money planning history and updates the wallet
  version only. Existing append-only FX refresh preserves the same quote identity.
  An expired reference, changed activity, finished case or manipulated price
  cannot create a replacement order. No validator threshold was weakened.
- UI review distinguishes planning estimate, native Sandbox price, indicative
  conversion and expiry. It never claims a supplier reservation or paid admission.
  Wallet-only saves notify the existing shared wallet event so the checkout panel
  reloads the new quote/FX state even when the itinerary has not changed.

## Validation

- **151 automated tests passed**, including seven new quote/migration regressions.
  Coverage includes EUR 4 / USD 5 / EUR 4.48 separation, unchanged revision 3,
  EUR 222 unallocated and EUR 250 reserve, duplicate saves/orders/captures,
  manipulated inputs, owner/origin/auth checks, stale and finished recoveries,
  expired FX and identity-preserving refresh, mocked capture projections and
  database restoration. The 0010→0011 upgrade test preserves prior quote,
  booking, capture/refund operation and append-only ledger rows and reapplies safely.
- **67 production HTTP assertions passed** using an isolated fixture database
  and explicit mocked model/PayPal/FX transports. Reproduce with
  `node --import tsx scripts/prepare-recovery-review.ts`, then
  `node --import tsx scripts/check-recovery-checkout-http.ts` after a production
  build. This harness cannot access the configured real QA database or providers.
- Lint, type-check, formatting and the Webpack production build passed. Local
  build output needed filesystem escalation after an EPERM sandbox error.
  Lint excludes ignored private QA/evidence directories; application, tests and
  committed harnesses remain checked. Configured-credential scan across source,
  tests, docs, public assets and production client assets found no private values.
- Local UI review confirmed the separate amounts, original fully refunded booking,
  revision 3, reserve and zero-money quote history. At 390px and 1440px the page
  had no horizontal overflow. Production continues requiring hosted PostgreSQL;
  actual local PGlite UI review uses development mode without weakening that gate.

## Configured Paris QA preflight

Backed up the stopped configured database, applied 0011 and compared original
financial, booking, generation, itinerary and recovery rows before/after upgrade.
Read-only PayPal retrieval confirmed the original capture REFUNDED and full
USD 5.00 refund COMPLETED with the matching Sandbox merchant. Saved exactly one
eligible USD 5.00 replacement checkout quote through the corrected service and
reopened the database to confirm exact restoration, owner isolation and a
duplicate-save no-op. Its native price and timestamped Frankfurter/ECB conversion
are separate from the approved EUR 4.00 estimate. Itinerary revision 3,
EUR 222 unallocated, EUR 250 reserve and zero actual net spending are preserved.
The quote contributes one zero-money creation event. Its original rate subsequently
expired during review; the normal application controls refreshed the same quote
with one additional zero-money FX event, without editing revision 3 or the budget.
The final refreshed state passed another configured-database reopen. Original capture/refund and
the historical booking and separate live-AI proposal remain intact.

No real order, capture, refund, AI request, webhook registration, push or deployment
was performed. Provider IDs and local evidence remain ignored/private.

## Remaining boundaries

Quote eligibility expires with its saved one-hour FX reference. Refresh that
same quote before a separately authorized checkout if it expires. Reference FX
is indicative, not PayPal's charged conversion. A future completed capture will
cover the activity estimate once in financial projections, while planned funds
stay separate. A post-approval itinerary change fails closed and needs recovery
review; this patch adds no operator reset/re-approval tool. Signed webhook
delivery and hosted PostgreSQL/deployment acceptance remain unverified. The real
replacement buyer approval/capture and Stage 5 reconciliation remain separate.

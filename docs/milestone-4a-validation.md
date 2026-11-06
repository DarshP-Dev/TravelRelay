# Milestone 4A — TripWallet, currencies and financial foundation

Implemented November 5, 2026, on `codex/milestone-4a-tripwallet`, from approved
checkpoint `4577cf1`. Work is committed locally with DarshP-Dev attribution; no
push, deployment, Milestone 4B, Trip Recovery or paid model request is included.

## Working features and use

- Open **TripWallet** for the selected currency/scope, itemized activity estimates,
  additional allowances, planned allocations, protected reserve, genuinely
  unallocated budget, financial projections, confirmed/pending/refund summaries,
  category meters and append-only financial/planning history. Real data drives
  every number/visual. With no verified provider events, actuals are honestly zero.
- **Bookings** is now a persistent planning-reference workspace, rather than a
  decorative placeholder. It shows native amount, original supplier note, stored
  home estimate/rate, exact status, activity link and event evidence. References
  are explicitly **planned/not booked**. No invented reservation code or payment
  confirmation is shown, and a payment record never proves a supplier reservation.
- Select an existing activity, enter an original group amount/currency and an
  optional unverified supplier note. **Preview rate & budget consequences** uses
  the existing editor. Review reserve, allocation and remaining-budget changes,
  then explicitly **Save reference & activity estimate**. Save/discard/error states
  retain input; stale versions block approval, overruns and stale rates have
  separate acknowledgements. An uncertain save uses the same mutation ID on retry.
- Saving atomically updates that activity estimate, itinerary history, wallet
  version, immutable native quote and planning event. Refresh/relogin/reopened DB
  restore records. Closing a never-paid planning reference needs confirmation,
  retains its audit and does **not** undo the estimate or cancel/refund anything.
- Home trip currency stays fixed; the supported local-currency suggestion has a
  persistent override. The indicative converter shows source/rate dates. USD,
  EUR, CAD, GBP, AUD and whole-yen JPY use correct precision and exact rounding.
- Overview/Dashboard/My Trips/Itinerary/Bookings use the same stored plan. Wallet
  reads rederive projections after manual edits, approved AI changes or undo.
  Referenced activities edited/removed later are flagged, while original quote/
  payment amounts remain immutable. No edit automatically changes a real payment.
- Desktop retains the top navigation, horizontal tabs, existing typography/palette,
  spacious cards and optional assistant dock. Mobile retains full quote controls,
  confirmation, readable cards and contained keyboard-scrollable tables.

## Budget acceptance

The original four-day Paris fixture passes the required exact arithmetic:

| Planning amount                         |        EUR |
| --------------------------------------- | ---------: |
| Selected trip budget                    |   2,500.00 |
| Itemized estimates                      |     369.00 |
| Additional unitemized allowances        |   1,655.00 |
| Planned allocations, before reserve     |   2,024.00 |
| Protected emergency reserve             | **250.00** |
| Allocations including reserve           |   2,274.00 |
| Genuinely unallocated                   | **226.00** |
| Confirmed spending / pending / refunded |   **0.00** |

Food's €500 is €325 itemized + €175 additional allowance, not €825.
Transport's existing unitemized allowance is retained once. Spending-only scope
excludes return travel/accommodation without changing the user's choice.

The separate financial projection replaces covered itemized estimates rather
than adding both. Completed refunds/reversals affect confirmed spending; pending
refunds never release money. A refunded but still-planned activity retains its
remaining planning estimate until separately edited. Removing a paid activity
retains its spending as an orphaned financial reference. Fees are tagged by payer/
treatment: merchant/included fees are not added twice, unknown treatment is flagged,
and only explicit additional traveler fees enter projections.

## Data, API and persistence

Migration **`0006_powerful_angel.sql`** adds six tables: immutable FX snapshots,
persistent FX cache/lease, trip wallet/version, original native-currency intent,
immutable mutation receipts, and append-only financial events. Composite owner
FKs, safe amount/currency/status/proof constraints, unique active references,
version/business-event indexes and custom immutability triggers supplement the
service checks. Original generation and assistant audits are unchanged.

Migration **`0007_pretty_namorita.sql`** freezes each event's display currency,
converted principal estimate and fee estimate. Existing snapshots backfill those
new fields transactionally without changing original evidence. New events receive
server-calculated exact values, not frontend conversions.

Both migrations applied successfully to local development PGlite and isolated fresh/reopened
test/QA databases. The migration's composite indexes are intentionally created
before their FKs. Tests prove evidence cannot be updated/deleted, original intent
amounts cannot be rewritten and owner mismatches fail. Hosted PostgreSQL was not
provisioned or live-tested; the migration uses ordinary PostgreSQL features.
The populated QA upgrade retained all five planning events, preserved every
original column, backfilled the conversion metadata and restored the immutability
trigger. A fresh sign-in verified those five events through the final production API.

`GET/POST /api/trips/{id}/wallet` uses the existing session/origin/bounded-JSON/error
conventions and no-store responses. The browser can only request planning quotes,
save them, close a never-paid reference, change local-currency preference or
convert an estimate. There is **no frontend capture/refund/status injection API**.
CAS, a single editor transaction hook and immutable mutation receipts protect
planning saves; SQL wallet locks and global provider/business-event uniqueness
protect financial reconciliation. Injected storage failure rolled back the plan,
edit, intent and financial/planning event together.

The server-only verifier port is unconfigured in normal runtime. Offline tests
inject explicitly labeled verifier fixtures to prove captures/refunds/reversals,
fees, duplicate events and concurrent over-refunds. These fixtures never become
production demo transactions. No real PayPal API request or SDK integration was
performed. See [the full financial architecture and 4B boundary](financial-architecture.md).

## FX verification

Uses the fixed **Frankfurter v2** pair endpoint pinned to **ECB**, as documented
by [Frankfurter](https://frankfurter.dev/). No API key or new dependency is needed.
The server caches snapshots for one hour, leases concurrent pair lookups, times
out after eight seconds, bounds responses, applies failure cooldown and never
automatically retries. Stale cache results retain source/retrieval dates and an
explicit warning/acknowledgement; references older than seven days cannot be
applied. Missing rates fail without inventing a conversion. Identity conversions
make no external request. Original values/rates are never silently repriced.

One **free public FX request**, no AI/PayPal request, was made through the real
server service during production HTTP QA:

| Measurement                       | Actual result                                               |
| --------------------------------- | ----------------------------------------------------------- |
| Endpoint                          | `https://api.frankfurter.dev/v2/rate/USD/EUR?providers=ecb` |
| HTTP status / response latency    | **200 / 463ms**                                             |
| Reference date / rate             | **2026-11-05 / 0.89095 EUR per USD**                        |
| Original / converted group amount | **USD 100.00 / EUR 89.10**                                  |
| Rounding                          | Exact 8,909.5 euro cents → **8,910 cents**, half-up         |
| Snapshot expiry                   | One hour after retrieval                                    |
| Paid AI / PayPal calls            | **0 / 0**                                                   |

It is indicative reference FX, **not actual PayPal charged FX**. Normal runtime
uses the official service; the guarded QA preloader allowed at most one free FX
lookup in the process and blocked all AI/PayPal/other external transports. The
cache was reused for visual review. Private QA configuration stays ignored.

## Automated and HTTP validation

| Check                                        | Result                                                                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Untouched baseline                           | **101 passed**                                                                                                                      |
| Final full suite                             | **129 passed**, zero failures: all 101 retained + 28 money/FX/ledger/wallet regressions                                             |
| Lint / type-check / formatting / diff checks | Passed                                                                                                                              |
| Production build                             | Passed, including authenticated Node wallet route                                                                                   |
| Real production HTTP                         | **74 assertions passed**                                                                                                            |
| Credential/public transport boundary         | **38 public build assets**, five configured/private QA values, zero credential matches or frontend AI/PayPal/FX provider transports |
| Migration / persistence                      | Local development and isolated fresh/reopened PGlite passed; original currencies, settings, history and login restoration retained  |

Coverage includes exact Paris totals, planned-versus-actual separation, food and
transport preservation, native/JPY precision and half-up rounding, malformed FX,
concurrent cache leases/outages/staleness, quote previews/overrun acknowledgements,
atomic saves/rollback and idempotency, currencies/original metadata, foreign users,
origin/status forgery, pending payments/authorizations, captures, partial/full
refunds/failure/reversal limits, fees by treatment, concurrent refund serialization,
duplicate/foreign provider IDs, activity edits/deletions/AI approvals, immutable
evidence and DB reopening with a fresh login. No test relaxes existing validators.

HTTP checks exercised real auth and production handlers/pages: initial Paris
figures, owner/origin/schema guards, one actual public FX lookup, preview-before-
save, repeated mutation, manual edit/undo synchronization, stale wallet rejection,
currency preference, explicit planning closure and protected Overview/Itinerary/
Bookings/Dashboard/My Trips. Both currencies and rate metadata persisted, while
all financial events remained planning-only and confirmed spending stayed zero.

## Responsive and interaction review

Tested production Bookings and TripWallet at **360, 390, 768 and 1440px**. Page
widths were 345/375/753/1425px respectively (scrollbar gutters), with no horizontal
page overflow. Tables scroll inside their own labeled focusable regions. Desktop
was checked with the assistant open and collapsed; no redesign was introduced.

Mobile verified invalid decimal JPY input without losing form data, a €50→€45
lunch estimate preview, explicit save, truthful success message, refresh restoration
and explicit closure confirmation retaining the estimate. The USD quote remained
USD 100 / approximately EUR 89.10. After those intentional QA planning changes,
the plan is €2,038.10 before the unchanged €250 reserve, leaving €211.90; confirmed
spending is still zero. These modified QA figures are not the original regression
fixture and do not represent payments. Bookings/Overview/Itinerary remained
consistent. Final console review found no JavaScript errors.

- [Desktop wallet](screenshots/milestone-4a-wallet-desktop.png)
- [Mobile wallet and navigation](screenshots/milestone-4a-wallet-mobile.png)
- [Mobile quote preview](screenshots/milestone-4a-quote-mobile.png)
- [Desktop Bookings workspace](screenshots/milestone-4a-bookings-desktop.png)

## Remaining limits and 4B readiness

- **The financial foundation is ready for Milestone 4B**, which still requires
  separately approved demo inventory, durable outgoing provider-operation claims,
  SDK/map contract verification, secure Sandbox credentials, buyer checkout,
  server verification, webhook signatures/status reconciliation and refund approval/
  execution. No payment is usable or claimed operational now. Sandbox captures
  must never be advertised as genuine third-party travel reservations.
- All nine APIMatic PayPal TypeScript skill files were verified readable. Their
  idempotency/host/unknown-outcome boundaries inform the handoff; no SDK package
  was installed, contract call guessed or sponsor prize/integration claimed.
- Original-currency events are exact. Foreign home equivalents remain explicitly
  indicative at the stored reference rate; provider-reported charged values stay
  separate. Different-currency fees need a verified accounting entry, not a guessed
  split/conversion. 4B must map actual PayPal amounts and fee payer semantics.
- Planning references currently target existing activities. Flights/accommodation
  remain unitemized allowances or external planning, without arbitrary supplier
  booking claims. Budget scope and existing allowances cannot be silently changed
  from a quote. A closed reference does not restore its prior activity estimate.
- A small country mapping suggests local currency; unsupported destinations fall
  back to the trip currency and can be overridden among the six supported codes.
  Public ECB daily rates may be delayed/unavailable, are not intraday quotes and
  have no app uptime guarantee. Historical quotes are not automatically repriced.
- Latest 100 history events are displayed; all earlier evidence remains in the
  DB. References are limited to 500/trip. Retention/account deletion needs explicit
  design because financial evidence cannot be cascaded away.
- Hosted PostgreSQL/backups, HTTPS and existing 240-second AI execution hosting
  remain deployment prerequisites. No host provisioning or deployment occurred.
  Existing authentication recovery/verification and tooling advisory limitations
  remain. No unrelated dependency upgrade, AI request or recovery tool was added.

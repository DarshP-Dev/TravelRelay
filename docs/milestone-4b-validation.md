# Milestone 4B offline acceptance

Milestone 4B uses PayPal Sandbox Orders v2 and Payments v2 through a small,
fixed-host REST adapter. Buyer approval uses official JavaScript SDK v6. The
generated APIMatic server SDK is not installed. The adapter and SDK handoff
were checked against [PayPal's developer documentation](paypal-sandbox.md);
the acceptance runs use synthetic wire data and an intercepted browser SDK.

## Financial and security evidence

- Migration `0008_workable_johnny_blaze.sql` applied to local PGlite, including
  the owner-bound booking FK, single capture claim, unique provider references
  and webhook receipts. The integration fixture reopens the database and
  restores the original charge, partial/full refund history and owner isolation
  without needing a configured provider to read them.
- Parallel checkout/capture/refund requests do not duplicate provider writes
  or money. Missing and altered inputs, other users' bookings, foreign order
  IDs, merchant mismatch, wrong currency, stale versions and mismatched
  amounts were rejected. A verified create or approval alone did not add spend.
- The Paris fixture records USD 5.00 captured, USD 0.30 merchant fee and
  EUR 4.00 indicative actual spending at the fixture's USD→EUR rate of 0.8.
  The existing EUR 4.00 itemized estimate is not counted a second time.
  A USD 2.00 refund leaves EUR 2.40 estimated actual; a subsequent USD 3.00
  full remaining refund returns it to zero. The itinerary revision and
  protected reserve are unchanged by PayPal operations.
- A lost capture response restores from read-only status. A lost refund ID is
  found by signed notification and the verified invoice/parent capture.
  Unsigned, replayed, early terminal and delayed pending notifications do not
  establish or duplicate money. Pending/failed refunds never reduce actual
  spending. The existing ledger remains the authoritative money record.
- Only the public client ID is serialized to checkout. No buyer/card data
  from PayPal is stored. The credential scan checks source and built client
  assets without printing local credential values. Local QA databases and
  browser artifacts live in ignored `.test-data/`.

## Checks

- `npm test`: 138 passed, including nine new PayPal tests.
- `npm run lint`, `npm run typecheck`, and `npm run format:check`: passed.
- `npm run build -- --webpack`: production build passed. Default Turbopack
  failed to start its Windows CSS worker in this workspace. The successful
  Webpack build used local sandbox escalation for prerender filesystem writes.
- `npm run db:migrate`: passed using the isolated local PostgreSQL-compatible
  PGlite database. No hosted PostgreSQL connection was configured.
- Production HTTP: 56 assertions passed, including ownership and cross-origin
  gates, capture/refund reconciliation, signed notification replay, and the
  rendered Overview, Bookings, TripWallet and Itinerary routes.
- Production Chromium: checkout review, cancellation and resume, capture,
  reload, partial/full refund review and synchronized activity status passed.
  No page-level horizontal overflow at 360, 390, 768 or 1440 CSS pixels. Local
  screenshots cover the desktop checkout and confirmation and mobile refund
  review and history.
- Production HTTP/browser checks use `scripts/prepare-paypal-review.ts` and the
  explicit localhost-only `scripts/paypal-qa-transport.mjs` preloader, with
  the HTTP and browser checks in `scripts/check-paypal-http.ts` and
  `scripts/check-paypal-browser.mjs`. The browser runner accepts a locally
  installed `playwright-core` via `PLAYWRIGHT_CORE_PATH` and intercepts all
  requests outside localhost.

## Remaining acceptance

Real PayPal buyer approval, capture and refund, webhook delivery, and hosted
PostgreSQL migration still need validation in the configured environment.
This milestone did not deploy, register webhooks, send live Sandbox or AI
requests, or start Trip Recovery. See the [one-order, one-refund acceptance
plan](paypal-sandbox.md#one-controlled-live-sandbox-test-separate-approval-required).

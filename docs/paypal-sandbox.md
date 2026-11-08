# PayPal Sandbox setup and acceptance

TravelRelay demonstrates a **USD 5.00** purchase linked to an existing itinerary
activity. The price is fixed on the server. A saved planning quote must match
that amount and currency, be less than 24 hours old, have a fresh rate, and still
match the activity. Changing the quote updates the planning estimate only after
review. Checkout, capture and refunds never edit an itinerary or reserve real
supplier inventory.

Approved recovery replacements use a separate **recovery checkout quote**.
Apply migration `0011` and earlier migrations. Open the approved case's
replacement link in Bookings, preview the fixed USD 5.00 Sandbox quote, and
choose **Save recovery checkout quote**. Its indicative conversion is shown
beside the unchanged itinerary estimate; saving it never changes the itinerary
revision, planning allocations or reserve. The original payment must first have
a verified completed full refund with the matching Sandbox merchant. A changed
itinerary or completed case blocks replacement checkout. Each recovery case
retains one quote identity; use its rate-refresh control before checkout if
expired. Refresh never creates a second quote or changes the approved estimate.
The optional demo purchase does not buy venue access or supplier inventory.

If an unpaid quote's FX reference expires, use **Review fresh reference rate**
and **Save refreshed reference rate**. The same quote keeps its original amount,
activity and audit record. The newer estimate is recorded as a planning event
with zero money movement. Once checkout starts, its reference rate is frozen.

## Local or hosted configuration

1. Use a PayPal Sandbox **business** account and its Sandbox REST app. Configure
   `PAYPAL_ENVIRONMENT=sandbox`, `ENABLE_DEMO_MERCHANT=true`,
   `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_MERCHANT_ID` (the
   business account's merchant/account ID). These must belong to the same
   merchant and Sandbox app. A non-Sandbox setting disables the adapter.
2. Use ignored `.env.local` locally or secret settings on the server host. The
   public client ID alone reaches PayPal JavaScript SDK v6. Never send API
   credentials or OAuth tokens to the browser or to judges.
3. A separate Sandbox **personal** buyer account is needed to approve checkout.
   A deployed demo uses the organizer's merchant app; each authorized tester
   signs in to TravelRelay and uses Sandbox buyer credentials inside PayPal.
4. When authorized to set it up, register the exact public HTTPS
   `/api/paypal/webhook` URL in the same Sandbox app and save the resulting
   `PAYPAL_WEBHOOK_ID`. Subscribe to `CHECKOUT.ORDER.APPROVED`,
   `CHECKOUT.ORDER.COMPLETED`, `PAYMENT.CAPTURE.PENDING`,
   `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DECLINED`,
   `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.REFUND.PENDING`,
   `PAYMENT.REFUND.FAILED`, and `PAYMENT.CAPTURE.REVERSED` if exposed by
   the app. The endpoint is disabled without a webhook ID; known orders and
   refunds can still be checked through the UI. No webhook was registered here.

PayPal documentation: [Sandbox accounts](https://developer.paypal.com/tools/sandbox/accounts/),
[JavaScript SDK v6](https://developer.paypal.com/sdk/js/set-up/),
[Orders v2](https://developer.paypal.com/api/rest/integration/orders-api),
[Payments v2 refund](https://developer.paypal.com/api/payments/v2/captures-refund),
[webhook verification](https://developer.paypal.com/api/rest/webhooks/rest/),
and [event names](https://developer.paypal.com/api/rest/webhooks/event-names/).

## Recovery and deployment

- Apply migration `0009` and earlier migrations. Use hosted PostgreSQL with
  backups and tested restore for deployment; PGlite is local/single-process only.
- Commerce routes run in the Node runtime with a 60-second duration hint and
  individually bounded 7.5-second provider calls. No PayPal operation depends
  on an in-memory background task. If the host or browser disconnects between
  a PayPal write and SQL settlement, the durable operation still exists and a
  signed webhook or explicit status check can reconcile it. No automatic write
  retry, fallback host or replacement order occurs. Keep the existing
  [240-second generation/assistant hosting requirement](generation-hosting.md)
  separately; this change does not shorten those model tasks.
- Six checkout claims per user per hour, one capture claim per order, at most
  20 refund claims per booking, one unresolved refund per booking, and a
  five-second user lookup interval per booking are enforced in storage. Put a
  deployment-level request/size limit on the public webhook endpoint; unsigned
  requests with syntactically plausible PayPal headers still need authenticity
  checks. Preserve the request body and PayPal transmission headers at the proxy.
- If order creation loses the provider ID, an associated signed event can
  recover it; PayPal may never send such an event for an unapproved order.
  If a refund ID is lost, an associated verified refund event can identify the
  original invoice/operation. When no event or usable resource ID exists,
  compare the durable operation, request key and time against the merchant's
  Sandbox activity. The UI leaves it unresolved and will not resend it. There
  is no operator replay/reset UI. An externally initiated refund or reversal
  requires operator reconciliation and does not fabricate a matching traveler
  authorization or a financial adjustment. Use the in-app refund path for the
  controlled test.
- Hosted PostgreSQL, real Sandbox SDK approval and live provider event shapes
  still require acceptance on the configured host. No real-money mode exists.

## One controlled live Sandbox test (separate approval required)

1. Configure the isolated Sandbox merchant and buyer above. If signature
   acceptance is included, obtain authorization to register **one** webhook
   for the configured HTTPS target before testing. Use a saved Paris fixture
   with no model call and one fresh USD 5.00 quote on a named activity. Record
   the initial TripWallet values and itinerary version.
2. Review and initiate **one** Sandbox checkout from Bookings. Sign in to PayPal
   with the separate buyer and approve once. Verify the captured USD 5.00 and
   merchant, order/capture IDs, capture timestamp and any fee in the Sandbox
   dashboard and TravelRelay. Check there is one capture event, the correct
   indicative home conversion, no new itinerary estimate, and no double-counted
   expense. Refresh and verify the booking and activity labels.
3. Only with explicit refund approval, review and submit **one USD 5.00 full
   Sandbox refund** against that capture. Wait for a signed event or use
   **Check PayPal status**, which reads only. Compare the PayPal refund ID and
   status against the immutable ledger and verify that net confirmed spending
   returns to zero while the original charge, refund history, reserve and
   itinerary estimate are retained.
4. Stop at the first unresolved provider error. Do not retry or replace any
   write, create a second order, send a second refund or use live credentials.
   Record sanitized references/statuses and the observed mismatch if any.

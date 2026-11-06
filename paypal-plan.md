# Milestone 4B PayPal contracts

Use the documented Sandbox REST API on `https://api-m.sandbox.paypal.com` and the PayPal JavaScript SDK v6 Sandbox core for buyer approval. The APIMatic skills were reviewed; the generated `paypal` package is not installed and this implementation uses the authorized REST option. It does not assume any generated SDK contracts.

- OAuth: `POST /v1/oauth2/token`, client credentials grant with Basic auth. Cache a short-lived server token; never send it to the browser.
- Orders v2: `POST /v2/checkout/orders` (CAPTURE, one purchase unit, immutable USD 5.00, custom/reference booking ID, configured merchant), `GET /v2/checkout/orders/{id}`, and `POST /v2/checkout/orders/{id}/capture`. The v6 browser only starts and approves an order. Verify order and capture associations and amounts by provider retrieval.
- Payments v2: `GET /v2/payments/captures/{id}`, `POST /v2/payments/captures/{id}/refund`, `GET /v2/payments/refunds/{id}`. Refund an explicit reviewed amount with a stable invoice and request ID; verify the refund's parent capture and exact currency/amount.
- Webhooks: `POST /v1/notifications/verify-webhook-signature` with the configured webhook ID, transmission headers and parsed event. Only signed events trigger retrieval. Process known resources idempotently; never issue payment writes from a webhook.

Commit local operation claims before external writes. Serialize refund reservations by booking row; reuse the wallet's append-only reconciliation and exact amounts. A lost response or crashed worker never causes an automatic second write. Expose read-only reconciliation and unresolved states. Offline tests use an injected fetch; no live transaction or webhook registration is part of this milestone.

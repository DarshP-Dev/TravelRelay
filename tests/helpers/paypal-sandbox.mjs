import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

// Deliberately synthetic identifiers; this transport cannot call the network.
export const sandboxFixtureConfig = {
  clientId: "offline-sandbox-client",
  secret: "offline-sandbox-secret",
  merchantId: "OFFLINEMERCHANT",
  webhookId: "OFFLINE-WEBHOOK",
};
const host = "https://api-m.sandbox.paypal.com";
const id = (prefix) => prefix + randomBytes(8).toString("hex").toUpperCase();
const time = "2026-10-01T12:00:00Z";
const money = (value) => ({ currency_code: "USD", value });

export function fakeSandbox() {
  const orders = new Map(),
    captures = new Map(),
    refunds = new Map(),
    writes = [];
  const switches = {
    autoApprove: false,
    loseOrder: false,
    loseCapture: false,
    loseRefund: false,
    declineCapture: false,
    nextRefundStatus: "COMPLETED",
    nextCaptureStatus: "COMPLETED",
  };
  async function transport(input, init) {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(init?.headers);
    assert.equal(url.origin, host);
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    if (url.pathname === "/v1/oauth2/token") {
      assert.equal(
        headers.get("authorization"),
        "Basic " +
          Buffer.from(
            sandboxFixtureConfig.clientId + ":" + sandboxFixtureConfig.secret,
          ).toString("base64"),
      );
      assert.equal(init?.body, "grant_type=client_credentials");
      return Response.json({
        access_token: "offline-bearer-fixture",
        expires_in: 3600,
      });
    }
    assert.equal(headers.get("authorization"), "Bearer offline-bearer-fixture");
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const key = headers.get("PayPal-Request-Id");
    if (url.pathname === "/v1/notifications/verify-webhook-signature") {
      assert.equal(body.webhook_id, sandboxFixtureConfig.webhookId);
      assert.ok(body.webhook_event.id);
      return Response.json({
        verification_status:
          body.transmission_sig === "signed-offline-fixture"
            ? "SUCCESS"
            : "FAILURE",
      });
    }
    if (init?.method === "POST") {
      assert.match(key ?? "", /^[a-f0-9-]{36}$/);
      assert.equal(headers.get("prefer"), "return=representation");
      assert.ok(
        !writes.some((w) => w.key === key),
        "A provider write must never be sent twice",
      );
      writes.push({ path: url.pathname, key, body });
      if (url.pathname === "/v2/checkout/orders") {
        assert.equal(body.intent, "CAPTURE");
        assert.equal(body.purchase_units.length, 1);
        const unit = body.purchase_units[0];
        assert.deepEqual(unit.amount, money("5.00"));
        assert.equal(unit.custom_id, unit.reference_id);
        assert.equal(unit.payee.merchant_id, sandboxFixtureConfig.merchantId);
        assert.equal(
          body.payment_source.paypal.experience_context.shipping_preference,
          "NO_SHIPPING",
        );
        const order = {
          id: id("ORDER"),
          status: switches.autoApprove ? "APPROVED" : "CREATED",
          intent: body.intent,
          purchase_units: [unit],
        };
        orders.set(order.id, order);
        if (switches.loseOrder) throw Error("simulated interrupted order");
        return Response.json({ id: order.id }, { status: 201 });
      }
      if (url.pathname.endsWith("/capture")) {
        const order = orders.get(url.pathname.split("/")[4]);
        assert.equal(order?.status, "APPROVED");
        if (switches.declineCapture)
          return Response.json(
            { details: [{ issue: "INSTRUMENT_DECLINED" }] },
            { status: 422 },
          );
        const cap = {
          id: id("CAPTURE"),
          status: switches.nextCaptureStatus,
          amount: money("5.00"),
          create_time: time,
          supplementary_data: { related_ids: { order_id: order.id } },
          seller_receivable_breakdown: {
            gross_amount: money("5.00"),
            paypal_fee: money("0.30"),
            net_amount: money("4.70"),
          },
        };
        captures.set(cap.id, cap);
        order.purchase_units[0].payments = { captures: [{ id: cap.id }] };
        order.status = "COMPLETED";
        if (switches.loseCapture) throw Error("simulated interrupted capture");
        return Response.json({ id: order.id }, { status: 201 });
      }
      if (url.pathname.endsWith("/refund")) {
        const cap = captures.get(url.pathname.split("/")[4]);
        assert.ok(cap);
        assert.equal(body.invoice_id, key);
        const r = {
          id: id("REFUND"),
          amount: body.amount,
          invoice_id: key,
          create_time: time,
          update_time: time,
          status: switches.nextRefundStatus,
          links: [
            { rel: "up", href: host + "/v2/payments/captures/" + cap.id },
          ],
        };
        refunds.set(r.id, r);
        if (switches.loseRefund) throw Error("simulated interrupted refund");
        return Response.json({ id: r.id }, { status: 201 });
      }
    } else {
      const resourceId = url.pathname.split("/").at(-1);
      const map = url.pathname.includes("/orders/")
        ? orders
        : url.pathname.includes("/refunds/")
          ? refunds
          : captures;
      const result = map.get(resourceId);
      return result
        ? Response.json(result)
        : Response.json({ name: "RESOURCE_NOT_FOUND" }, { status: 404 });
    }
    throw Error("Unexpected offline request " + url.pathname);
  }
  return { transport, orders, captures, refunds, writes, switches };
}

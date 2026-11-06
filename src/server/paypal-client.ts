import { z } from "zod";
import { amountText } from "@/lib/money";

export const sandboxHost = "https://api-m.sandbox.paypal.com";
export const paypalId = z.string().regex(/^[A-Z0-9-]{1,64}$/i);
const money = z.object({
  currency_code: z.string().regex(/^[A-Z]{3}$/),
  value: z.string().regex(/^\d{1,12}(?:\.\d{1,4})?$/),
});
export const captureSchema = z.object({
  id: paypalId,
  status: z.enum([
    "COMPLETED",
    "PENDING",
    "DECLINED",
    "FAILED",
    "REFUNDED",
    "PARTIALLY_REFUNDED",
  ]),
  amount: money,
  create_time: z.iso.datetime({ offset: true }),
  update_time: z.iso.datetime({ offset: true }).optional(),
  supplementary_data: z
    .object({
      related_ids: z.object({ order_id: paypalId.optional() }).optional(),
    })
    .optional(),
  seller_receivable_breakdown: z
    .object({
      gross_amount: money.optional(),
      paypal_fee: money.optional(),
      net_amount: money.optional(),
      receivable_amount: money.optional(),
      exchange_rate: z
        .object({
          source_currency: z.string().regex(/^[A-Z]{3}$/),
          target_currency: z.string().regex(/^[A-Z]{3}$/),
          value: z.string().regex(/^\d{1,12}(?:\.\d{1,18})?$/),
        })
        .optional(),
    })
    .optional(),
});
export const orderSchema = z.object({
  id: paypalId,
  intent: z.literal("CAPTURE"),
  status: z.enum([
    "CREATED",
    "SAVED",
    "APPROVED",
    "VOIDED",
    "COMPLETED",
    "PAYER_ACTION_REQUIRED",
  ]),
  purchase_units: z
    .array(
      z.object({
        reference_id: z.string(),
        custom_id: z.string(),
        amount: money,
        payee: z.object({ merchant_id: paypalId }),
        payments: z
          .object({
            captures: z
              .array(z.object({ id: paypalId }))
              .max(1)
              .optional(),
          })
          .optional(),
      }),
    )
    .length(1),
});
export const refundSchema = z.object({
  id: paypalId,
  invoice_id: z.string().optional(),
  status: z.enum(["CANCELLED", "FAILED", "PENDING", "COMPLETED"]),
  amount: money,
  create_time: z.iso.datetime({ offset: true }),
  update_time: z.iso.datetime({ offset: true }).optional(),
  seller_payable_breakdown: z
    .object({
      gross_amount: money.optional(),
      paypal_fee: money.optional(),
      net_amount: money.optional(),
      total_refunded_amount: money.optional(),
    })
    .optional(),
  links: z.array(z.object({ rel: z.string(), href: z.string() })).max(20),
});
const writeResponse = z.object({ id: paypalId });
const tokenSchema = z.object({
  access_token: z.string().min(1).max(4096),
  expires_in: z.number().int().positive(),
});
export const webhookEvent = z.object({
  id: paypalId,
  event_type: z.string().regex(/^[A-Z.0-9_]{1,80}$/),
  resource: z.record(z.string(), z.unknown()),
});

export type SandboxConfig = {
  clientId: string;
  secret: string;
  merchantId: string;
  webhookId?: string;
};
export function sandboxConfig(
  env: Record<string, string | undefined>,
): SandboxConfig | undefined {
  if (
    env.PAYPAL_ENVIRONMENT !== "sandbox" ||
    env.ENABLE_DEMO_MERCHANT !== "true"
  )
    return;
  const clientId = env.PAYPAL_CLIENT_ID,
    secret = env.PAYPAL_CLIENT_SECRET,
    merchantId = env.PAYPAL_MERCHANT_ID;
  if (
    !clientId?.match(/^[A-Za-z0-9_-]{8,256}$/) ||
    !secret ||
    !paypalId.safeParse(merchantId).success ||
    !merchantId
  )
    return;
  return {
    clientId,
    secret,
    merchantId,
    webhookId: paypalId.safeParse(env.PAYPAL_WEBHOOK_ID).data,
  };
}
export class PayPalFailure extends Error {
  constructor(
    readonly reason: "unavailable" | "invalid" | "declined" | "throttled",
  ) {
    super("PayPal Sandbox could not complete verification.");
  }
}

export async function boundedJson(
  response: Request | Response,
  limit: number,
): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new PayPalFailure("invalid");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new PayPalFailure("invalid");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new PayPalFailure("invalid");
  } finally {
    reader.releaseLock();
  }
}

export function createPayPalClient(
  config: SandboxConfig,
  fetcher: typeof fetch = fetch,
) {
  let token: { value: string; until: number } | undefined;
  let loading: Promise<string> | undefined;
  async function call(
    path: string,
    headers: Record<string, string>,
    body?: string,
  ) {
    let response: Response;
    try {
      response = await fetcher(sandboxHost + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { Accept: "application/json", ...headers },
        body,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(7500),
      });
    } catch {
      throw new PayPalFailure("unavailable");
    }
    if (response.status === 401) token = undefined;
    if (response.status === 429) throw new PayPalFailure("throttled");
    const data = await boundedJson(response, 128 * 1024);
    if (!response.ok) {
      const result = z
        .object({
          details: z.array(z.object({ issue: z.string() })).optional(),
        })
        .safeParse(data);
      if (
        response.status === 422 &&
        result.success &&
        result.data.details?.some((d) =>
          [
            "INSTRUMENT_DECLINED",
            "REFUND_AMOUNT_EXCEEDED",
            "REFUND_TIME_LIMIT_EXCEEDED",
          ].includes(d.issue),
        )
      )
        throw new PayPalFailure("declined");
      throw new PayPalFailure("unavailable");
    }
    return data;
  }
  function bearer() {
    if (token && Date.now() < token.until) return Promise.resolve(token.value);
    return (loading ??= (async () => {
      const data = tokenSchema.parse(
        await call(
          "/v1/oauth2/token",
          {
            Authorization:
              "Basic " +
              Buffer.from(config.clientId + ":" + config.secret).toString(
                "base64",
              ),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          "grant_type=client_credentials",
        ),
      );
      token = {
        value: data.access_token,
        until:
          Date.now() + Math.max(0, Math.min(data.expires_in, 3600) - 45) * 1000,
      };
      return token.value;
    })().finally(() => {
      loading = undefined;
    }));
  }
  async function request<T>(
    schema: z.ZodType<T>,
    path: string,
    body?: object,
    key?: string,
  ) {
    try {
      return schema.parse(
        await call(
          path,
          {
            Authorization: "Bearer " + (await bearer()),
            ...(body && { "Content-Type": "application/json" }),
            ...(key && {
              "PayPal-Request-Id": key,
              Prefer: "return=representation",
            }),
          },
          body === undefined ? undefined : JSON.stringify(body),
        ),
      );
    } catch (error) {
      if (error instanceof PayPalFailure) throw error;
      throw new PayPalFailure("invalid");
    }
  }
  const orderPath = (id: string) => "/v2/checkout/orders/" + paypalId.parse(id);
  const capturePath = (id: string) =>
    "/v2/payments/captures/" + paypalId.parse(id);
  return {
    clientId: config.clientId,
    merchantId: config.merchantId,
    webhookEnabled: !!config.webhookId,
    create: (bookingId: string, key: string, minor: number) =>
      request(
        writeResponse,
        "/v2/checkout/orders",
        {
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: bookingId,
              custom_id: bookingId,
              description:
                "TravelRelay Sandbox demonstration — no travel inventory",
              payee: { merchant_id: config.merchantId },
              amount: { currency_code: "USD", value: amountText(minor, "USD") },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                shipping_preference: "NO_SHIPPING",
                user_action: "PAY_NOW",
              },
            },
          },
        },
        key,
      ),
    order: (id: string) => request(orderSchema, orderPath(id)),
    capture: (id: string) => request(captureSchema, capturePath(id)),
    captureOrder: (id: string, key: string) =>
      request(writeResponse, orderPath(id) + "/capture", {}, key),
    refundCapture: (id: string, key: string, minor: number) =>
      request(
        writeResponse,
        capturePath(id) + "/refund",
        {
          invoice_id: key,
          amount: { currency_code: "USD", value: amountText(minor, "USD") },
        },
        key,
      ),
    refund: (id: string) =>
      request(refundSchema, "/v2/payments/refunds/" + paypalId.parse(id)),
    async verify(headers: Headers, event: unknown) {
      if (!config.webhookId) return false;
      const names = [
        "auth_algo",
        "cert_url",
        "transmission_id",
        "transmission_sig",
        "transmission_time",
      ] as const;
      const values = Object.fromEntries(
        names.map((n) => [
          n,
          headers.get("paypal-" + n.replaceAll("_", "-")) ?? "",
        ]),
      );
      if (Object.values(values).some((v) => !v || v.length > 2048))
        return false;
      const cert = URL.parse(values.cert_url);
      if (
        !cert ||
        ![
          "https://api-m.sandbox.paypal.com",
          "https://api.sandbox.paypal.com",
        ].includes(cert.origin) ||
        cert.username ||
        cert.password ||
        cert.search ||
        cert.hash ||
        !/^\/v1\/notifications\/certs\/[A-Za-z0-9-]{1,160}$/.test(
          cert.pathname,
        ) ||
        values.auth_algo !== "SHA256withRSA" ||
        !z.iso.datetime({ offset: true }).safeParse(values.transmission_time)
          .success
      )
        return false;
      const result = await request(
        z.object({ verification_status: z.enum(["SUCCESS", "FAILURE"]) }),
        "/v1/notifications/verify-webhook-signature",
        { ...values, webhook_id: config.webhookId, webhook_event: event },
      );
      return result.verification_status === "SUCCESS";
    },
  };
}
export type PayPalClient = ReturnType<typeof createPayPalClient>;

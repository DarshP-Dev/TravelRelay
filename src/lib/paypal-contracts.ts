import { z } from "zod";

export const demoPriceMinor = 500;
export const demoCurrency = "USD";
export const demoName = "TravelRelay Sandbox experience";
export const commerceRequest = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("checkout"),
    intentId: z.uuid(),
    walletVersion: z.number().int().nonnegative(),
    itineraryVersion: z.number().int().nonnegative(),
  }),
  z.strictObject({
    action: z.literal("capture"),
    bookingId: z.uuid(),
    orderId: z.string().regex(/^[A-Z0-9-]{1,64}$/i),
  }),
  z.strictObject({ action: z.literal("reconcile"), bookingId: z.uuid() }),
  z.strictObject({
    action: z.literal("refund"),
    bookingId: z.uuid(),
    mutationId: z.uuid(),
    mode: z.enum(["full", "partial"]),
    amount: z.string().max(16),
  }),
]);

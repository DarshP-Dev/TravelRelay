import type { CommerceState } from "@/server/paypal-commerce";
type Booking = CommerceState["bookings"][number];
export const operationStage = {
  sending: "Request in progress or interrupted",
  uncertain: "Outcome unknown · needs reconciliation",
  pending: "Pending at PayPal",
  failed: "Declined or failed",
  verified: "Verified",
};
export function bookingPaymentLabel(booking: Booking) {
  if (booking.needsReview) return "Needs Sandbox operator review";
  const capture = booking.operations.find((o) => o.kind === "capture");
  const order = booking.operations.find((o) => o.kind === "order");
  if (booking.payment.capturedMinor) {
    const refund = booking.operations.find(
      (o) => o.kind === "refund" && !["verified", "failed"].includes(o.status),
    );
    if (refund)
      return refund.status === "pending"
        ? "Refund pending"
        : "Refund awaiting verification";
    if (booking.payment.refundedMinor === booking.payment.capturedMinor)
      return "Fully refunded";
    if (booking.payment.refundedMinor) return "Partially refunded";
    return "Payment verified";
  }
  if (capture) return operationStage[capture.status];
  if (order?.providerStatus === "VOIDED")
    return "PayPal order expired or voided";
  if (booking.orderId) return "Awaiting buyer approval or capture";
  return order ? operationStage[order.status] : "No verified payment";
}

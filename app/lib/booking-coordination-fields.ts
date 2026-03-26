/** Order metafields for booking coordination (staff writes via Admin; customers read on order status). */

/** App-owned namespace; matches waiver route and Customer Account API order queries. */
export const BOOKING_COORDINATION_NAMESPACE = "$app:andes_freeride";

export const BOOKING_COORDINATION_KEYS = [
  "booking_status",
  "booking_status_note",
  "payment_status",
] as const;

export type BookingCoordinationFieldKey =
  (typeof BOOKING_COORDINATION_KEYS)[number];

export const BOOKING_STATUS_VALUES = [
  "pending",
  "under_review",
  "confirmed",
  "needs_attention",
] as const;

export type BookingStatusValue = (typeof BOOKING_STATUS_VALUES)[number];

export const PAYMENT_STATUS_VALUES = [
  "pending",
  "authorized",
  "paid",
  "action_required",
] as const;

export type PaymentStatusValue = (typeof PAYMENT_STATUS_VALUES)[number];

export const BOOKING_STATUS_LABELS: Record<BookingStatusValue, string> = {
  pending: "Pending",
  under_review: "Under review",
  confirmed: "Confirmed",
  needs_attention: "Needs attention",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatusValue, string> = {
  pending: "Pending",
  authorized: "Authorized",
  paid: "Paid",
  action_required: "Action required",
};

export type BookingCoordinationForm = Record<
  BookingCoordinationFieldKey,
  string
>;

export const EMPTY_BOOKING_COORDINATION: BookingCoordinationForm = {
  booking_status: "",
  booking_status_note: "",
  payment_status: "",
};

export const BOOKING_COORDINATION_FIELD_TYPES: Record<
  BookingCoordinationFieldKey,
  string
> = {
  booking_status: "single_line_text_field",
  booking_status_note: "single_line_text_field",
  payment_status: "single_line_text_field",
};

/** GraphQL for Customer Account API: read booking coordination on a specific order. */
export function customerAccountOrderBookingCoordinationQueryDocument(): {
  query: string;
} {
  const identifierLines = BOOKING_COORDINATION_KEYS.map(
    (key) =>
      `{ namespace: "${BOOKING_COORDINATION_NAMESPACE}", key: "${key}" }`,
  ).join(",\n        ");
  return {
    query: `query getOrderBookingCoordination($orderId: ID!) {
    order(id: $orderId) {
      id
      metafields(identifiers: [
        ${identifierLines}
      ]) {
        key
        value
      }
    }
  }`,
  };
}

export function bookingStatusDisplayLabel(raw: string): string {
  if (!raw) return "";
  if ((BOOKING_STATUS_VALUES as readonly string[]).includes(raw)) {
    return BOOKING_STATUS_LABELS[raw as BookingStatusValue];
  }
  return raw;
}

export function paymentStatusDisplayLabel(raw: string): string {
  if (!raw) return "";
  if ((PAYMENT_STATUS_VALUES as readonly string[]).includes(raw)) {
    return PAYMENT_STATUS_LABELS[raw as PaymentStatusValue];
  }
  return raw;
}

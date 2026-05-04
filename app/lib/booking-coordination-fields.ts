/** Order metafields for booking coordination (staff writes via Admin; customers read on order status). */

/** App-owned namespace; matches waiver route and Customer Account API order queries. */
export const BOOKING_COORDINATION_NAMESPACE = "$app:andes_freeride";

export const BOOKING_COORDINATION_KEYS = [
  "booking_status",
  "booking_status_note",
  "payment_status",
  "balance_due_date",
  "payment_note",
  "tentative_start_date",
  "tentative_end_date",
  "confirmed_start_date",
  "confirmed_end_date",
] as const;

export type BookingCoordinationFieldKey =
  (typeof BOOKING_COORDINATION_KEYS)[number];

export const BOOKING_STATUS_VALUES = [
  "pending_dates",
  "dates_requested",
  "dates_under_review",
  "dates_confirmed",
  "changes_requested",
  "cancelled",
  "completed",
] as const;

export type BookingStatusValue = (typeof BOOKING_STATUS_VALUES)[number];

export const LEGACY_BOOKING_STATUS_VALUES = [
  "pending",
  "under_review",
  "confirmed",
  "needs_attention",
] as const;

export type LegacyBookingStatusValue =
  (typeof LEGACY_BOOKING_STATUS_VALUES)[number];

export type NormalizedBookingStatusValue = BookingStatusValue;

export type BookingStatusTone = "success" | "critical" | "subdued";

const LEGACY_BOOKING_STATUS_MAP: Record<
  LegacyBookingStatusValue,
  NormalizedBookingStatusValue
> = {
  pending: "pending_dates",
  under_review: "dates_under_review",
  confirmed: "dates_confirmed",
  needs_attention: "changes_requested",
};

export const BOOKING_STATUS_LABELS: Record<BookingStatusValue, string> = {
  pending_dates: "Pending dates",
  dates_requested: "Dates requested",
  dates_under_review: "Dates under review",
  dates_confirmed: "Dates confirmed",
  changes_requested: "Changes requested",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const PAYMENT_STATUS_VALUES = [
  "deposit_pending",
  "deposit_paid",
  "balance_due",
  "paid",
  "action_required",
  "refunded",
] as const;

export type PaymentStatusValue = (typeof PAYMENT_STATUS_VALUES)[number];

export const LEGACY_PAYMENT_STATUS_VALUES = [
  "pending",
  "authorized",
  "paid",
  "action_required",
] as const;

export type LegacyPaymentStatusValue =
  (typeof LEGACY_PAYMENT_STATUS_VALUES)[number];

export type NormalizedPaymentStatusValue = PaymentStatusValue;

export type PaymentStatusTone = "success" | "critical" | "subdued";

const LEGACY_PAYMENT_STATUS_MAP: Record<
  LegacyPaymentStatusValue,
  NormalizedPaymentStatusValue
> = {
  pending: "deposit_pending",
  authorized: "deposit_paid",
  paid: "paid",
  action_required: "action_required",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatusValue, string> = {
  deposit_pending: "Deposit pending",
  deposit_paid: "Deposit paid",
  balance_due: "Balance due",
  paid: "Paid",
  action_required: "Action required",
  refunded: "Refunded",
};

export type BookingCoordinationForm = Record<
  BookingCoordinationFieldKey,
  string
>;

export const EMPTY_BOOKING_COORDINATION: BookingCoordinationForm = {
  booking_status: "",
  booking_status_note: "",
  payment_status: "",
  balance_due_date: "",
  payment_note: "",
  tentative_start_date: "",
  tentative_end_date: "",
  confirmed_start_date: "",
  confirmed_end_date: "",
};

export const BOOKING_COORDINATION_FIELD_TYPES: Record<
  BookingCoordinationFieldKey,
  string
> = {
  booking_status: "single_line_text_field",
  booking_status_note: "single_line_text_field",
  payment_status: "single_line_text_field",
  balance_due_date: "date",
  payment_note: "multi_line_text_field",
  tentative_start_date: "date",
  tentative_end_date: "date",
  confirmed_start_date: "date",
  confirmed_end_date: "date",
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
  return getBookingStatusLabel(raw);
}

export function normalizeBookingStatus(
  raw: string,
): NormalizedBookingStatusValue | "" {
  if (!raw) return "";
  if ((BOOKING_STATUS_VALUES as readonly string[]).includes(raw)) {
    return raw as NormalizedBookingStatusValue;
  }
  if ((LEGACY_BOOKING_STATUS_VALUES as readonly string[]).includes(raw)) {
    return LEGACY_BOOKING_STATUS_MAP[raw as LegacyBookingStatusValue];
  }
  return "";
}

export function getBookingStatusLabel(raw: string): string {
  const normalized = normalizeBookingStatus(raw);
  if (normalized) {
    return BOOKING_STATUS_LABELS[normalized];
  }
  return raw;
}

export function getBookingStatusTone(raw: string): BookingStatusTone {
  const normalized = normalizeBookingStatus(raw);
  if (normalized === "dates_confirmed" || normalized === "completed") {
    return "success";
  }
  if (normalized === "changes_requested" || normalized === "cancelled") {
    return "critical";
  }
  return "subdued";
}

export function paymentStatusDisplayLabel(raw: string): string {
  return getPaymentStatusLabel(raw);
}

export function normalizePaymentStatus(
  raw: string,
): NormalizedPaymentStatusValue | "" {
  if (!raw) return "";
  if ((PAYMENT_STATUS_VALUES as readonly string[]).includes(raw)) {
    return raw as NormalizedPaymentStatusValue;
  }
  if ((LEGACY_PAYMENT_STATUS_VALUES as readonly string[]).includes(raw)) {
    return LEGACY_PAYMENT_STATUS_MAP[raw as LegacyPaymentStatusValue];
  }
  return "";
}

export function getPaymentStatusLabel(raw: string): string {
  const normalized = normalizePaymentStatus(raw);
  if (normalized) {
    return PAYMENT_STATUS_LABELS[normalized];
  }
  return raw;
}

export function getPaymentStatusTone(raw: string): PaymentStatusTone {
  const normalized = normalizePaymentStatus(raw);
  if (normalized === "deposit_paid" || normalized === "paid") {
    return "success";
  }
  if (normalized === "action_required" || normalized === "refunded") {
    return "critical";
  }
  return "subdued";
}

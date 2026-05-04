import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { useApi, useOrder } from '@shopify/ui-extensions/customer-account/preact';
import {
  bookingStatusDisplayLabel,
  customerAccountOrderBookingCoordinationQueryDocument,
  getBookingStatusTone,
  getPaymentStatusTone,
  paymentStatusDisplayLabel,
  BOOKING_COORDINATION_KEYS,
} from '../../../app/lib/booking-coordination-fields';

const API_VERSION = '2026-01';

const BOOKING_QUERY = customerAccountOrderBookingCoordinationQueryDocument();

function metafieldMap(rows) {
  const out = {};
  if (!rows) return out;
  for (const row of rows) {
    if (row?.key) out[row.key] = row.value ?? '';
  }
  return out;
}

function isEmptyBookingCoordination(m) {
  return !BOOKING_COORDINATION_KEYS.some(
    (key) => String(m[key] ?? '').trim() !== '',
  );
}

function formatBookingDate(raw, i18n) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  try {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return value;
    return i18n.formatDate(new Date(year, month - 1, day));
  } catch {
    return value;
  }
}

function formatDateRange(start, end, i18n) {
  if (start && end) {
    return `${start} ${i18n.translate('booking.dateRangeSeparator')} ${end}`;
  }
  return start || end || '';
}

async function fetchBookingCoordination(orderId) {
  const res = await fetch(
    `shopify://customer-account/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: BOOKING_QUERY.query,
        variables: { orderId },
      }),
    },
  );
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join(', '));
  }
  return metafieldMap(json.data?.order?.metafields);
}

export default async () => {
  render(<OrderStatusBlock />, document.body);
};

function OrderStatusBlock() {
  const api = useApi();
  const order = useOrder();
  const i18n = api.i18n;

  const orderId = order?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mf, setMf] = useState({});

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBookingCoordination(orderId);
      setMf(data);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId) {
      setLoading(true);
      return;
    }
    load();
  }, [orderId, load]);

  if (!orderId) {
    return (
      <s-section heading={i18n.translate('booking.heading')}>
        <s-text color="subdued">{i18n.translate('booking.loadingOrder')}</s-text>
      </s-section>
    );
  }

  if (loading) {
    return (
      <s-section heading={i18n.translate('booking.heading')}>
        <s-text color="subdued">{i18n.translate('booking.loading')}</s-text>
      </s-section>
    );
  }

  if (error) {
    return (
      <s-section heading={i18n.translate('booking.heading')}>
        <s-text color="critical">{error}</s-text>
      </s-section>
    );
  }

  if (isEmptyBookingCoordination(mf)) {
    return (
      <s-section heading={i18n.translate('booking.heading')}>
        <s-text color="subdued">{i18n.translate('booking.empty')}</s-text>
      </s-section>
    );
  }

  const bookingLabel = bookingStatusDisplayLabel(mf.booking_status ?? '');
  const paymentLabel = paymentStatusDisplayLabel(mf.payment_status ?? '');
  const noteRaw = String(mf.booking_status_note ?? '').trim();
  const paymentNoteRaw = String(mf.payment_note ?? '').trim();
  const balanceDueDate = formatBookingDate(mf.balance_due_date, i18n);
  const tentativeStartDate = formatBookingDate(mf.tentative_start_date, i18n);
  const tentativeEndDate = formatBookingDate(mf.tentative_end_date, i18n);
  const confirmedStartDate = formatBookingDate(mf.confirmed_start_date, i18n);
  const confirmedEndDate = formatBookingDate(mf.confirmed_end_date, i18n);
  const tentativeDates = formatDateRange(
    tentativeStartDate,
    tentativeEndDate,
    i18n,
  );
  const confirmedDates = formatDateRange(
    confirmedStartDate,
    confirmedEndDate,
    i18n,
  );

  return (
    <s-section heading={i18n.translate('booking.heading')}>
      <s-stack direction="block" gap="base">
        {bookingLabel ? (
          <s-stack direction="block" gap="small">
            <s-text type="strong">{i18n.translate('booking.bookingLabel')}</s-text>
            <s-text color={getBookingStatusTone(mf.booking_status)}>
              {bookingLabel}
            </s-text>
          </s-stack>
        ) : null}
        {tentativeDates ? (
          <s-stack direction="block" gap="small">
            <s-text type="strong">{i18n.translate('booking.tentativeDatesLabel')}</s-text>
            <s-text>{tentativeDates}</s-text>
          </s-stack>
        ) : null}
        {confirmedDates ? (
          <s-stack direction="block" gap="small">
            <s-text type="strong">{i18n.translate('booking.confirmedDatesLabel')}</s-text>
            <s-text>{confirmedDates}</s-text>
          </s-stack>
        ) : null}
        {noteRaw ? (
          <s-stack direction="block" gap="small">
            <s-text type="strong">{i18n.translate('booking.noteLabel')}</s-text>
            <s-text color="subdued">{noteRaw}</s-text>
          </s-stack>
        ) : null}
        {paymentLabel ? (
          <s-stack direction="block" gap="small">
            <s-text type="strong">{i18n.translate('booking.paymentLabel')}</s-text>
            <s-text color={getPaymentStatusTone(mf.payment_status)}>
              {paymentLabel}
            </s-text>
          </s-stack>
        ) : null}
        {balanceDueDate ? (
          <s-stack direction="block" gap="small">
            <s-text type="strong">{i18n.translate('booking.balanceDueDateLabel')}</s-text>
            <s-text>{balanceDueDate}</s-text>
          </s-stack>
        ) : null}
        {paymentNoteRaw ? (
          <s-stack direction="block" gap="small">
            <s-text type="strong">{i18n.translate('booking.paymentNoteLabel')}</s-text>
            <s-text color="subdued">{paymentNoteRaw}</s-text>
          </s-stack>
        ) : null}
      </s-stack>
    </s-section>
  );
}

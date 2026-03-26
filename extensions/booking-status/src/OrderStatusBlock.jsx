import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { useApi, useOrder } from '@shopify/ui-extensions/customer-account/preact';
import {
  bookingStatusDisplayLabel,
  customerAccountOrderBookingCoordinationQueryDocument,
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

function bookingStatusTone(raw) {
  const v = String(raw ?? '').trim();
  if (v === 'confirmed') return 'success';
  if (v === 'needs_attention') return 'critical';
  return 'subdued';
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

  return (
    <s-section heading={i18n.translate('booking.heading')}>
      <s-stack direction="block" gap="base">
        {bookingLabel ? (
          <s-stack direction="block" gap="small">
            <s-text type="strong">{i18n.translate('booking.bookingLabel')}</s-text>
            <s-text color={bookingStatusTone(mf.booking_status)}>
              {bookingLabel}
            </s-text>
          </s-stack>
        ) : null}
        <s-stack direction="block" gap="small">
          <s-text type="strong">{i18n.translate('booking.noteLabel')}</s-text>
          <s-text color="subdued">
            {noteRaw || i18n.translate('booking.noteFallback')}
          </s-text>
        </s-stack>
        {paymentLabel ? (
          <s-stack direction="block" gap="small">
            <s-text type="strong">{i18n.translate('booking.paymentLabel')}</s-text>
            <s-text>{paymentLabel}</s-text>
          </s-stack>
        ) : null}
      </s-stack>
    </s-section>
  );
}

import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { useApi, useOrder } from '@shopify/ui-extensions/customer-account/preact';

const API_VERSION = '2026-01';
const NS = '$app:andes_freeride';

const WAIVER_QUERY = `#graphql
  query WaiverContext($orderId: ID!) {
    shop {
      id
      metafields(
        identifiers: [
          { namespace: "${NS}", key: "waiver_body" },
          { namespace: "${NS}", key: "waiver_version" }
        ]
      ) {
        key
        namespace
        value
      }
    }
    order(id: $orderId) {
      id
      metafields(
        identifiers: [
          { namespace: "${NS}", key: "waiver_accepted_at" },
          { namespace: "${NS}", key: "waiver_accepted_version" }
        ]
      ) {
        key
        namespace
        value
      }
    }
  }
`;

function metafieldMap(rows) {
  const out = {};
  if (!rows) return out;
  for (const row of rows) {
    if (row?.key) out[row.key] = row.value;
  }
  return out;
}

async function fetchWaiverContext(orderId) {
  const res = await fetch(`shopify://customer-account/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: WAIVER_QUERY,
      variables: { orderId },
    }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join(', '));
  }
  const shopMf = metafieldMap(json.data?.shop?.metafields);
  const orderMf = metafieldMap(json.data?.order?.metafields);
  return {
    waiverBody: shopMf.waiver_body ?? '',
    waiverVersion: shopMf.waiver_version ?? '',
    acceptedAt: orderMf.waiver_accepted_at ?? null,
    acceptedVersion: orderMf.waiver_accepted_version ?? null,
  };
}

async function submitWaiverAcceptance(orderId, version) {
  const acceptedAt = new Date().toISOString();
  const res = await fetch(`shopify://customer-account/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation SubmitWaiver($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { key value }
          userErrors { field message }
        }
      }`,
      variables: {
        metafields: [
          {
            ownerId: orderId,
            namespace: NS,
            key: 'waiver_accepted_at',
            type: 'date_time',
            value: acceptedAt,
          },
          {
            ownerId: orderId,
            namespace: NS,
            key: 'waiver_accepted_version',
            type: 'single_line_text_field',
            value: version,
          },
        ],
      },
    }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join(', '));
  }
  const result = json.data?.metafieldsSet;
  if (result?.userErrors?.length) {
    throw new Error(result.userErrors.map((e) => e.message).join(', '));
  }
  return { acceptedAt, acceptedVersion: version };
}

export default async () => {
  render(<OrderWaiverBlock />, document.body);
};

function OrderWaiverBlock() {
  const api = useApi();
  const order = useOrder();
  const i18n = api.i18n;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ctx, setCtx] = useState({
    waiverBody: '',
    waiverVersion: '',
    acceptedAt: null,
    acceptedVersion: null,
  });
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const orderId = order?.id;

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWaiverContext(orderId);
      setCtx(data);
      setAgreed(false);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to load waiver');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    if (!orderId || !agreed || !ctx.waiverVersion?.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { acceptedAt, acceptedVersion } = await submitWaiverAcceptance(
        orderId,
        ctx.waiverVersion.trim(),
      );
      setCtx((prev) => ({
        ...prev,
        acceptedAt,
        acceptedVersion,
      }));
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  if (!orderId) {
    return (
      <s-section heading={i18n.translate('waiver.heading')}>
        <s-text color="subdued">{i18n.translate('waiver.loadingOrder')}</s-text>
      </s-section>
    );
  }

  if (loading) {
    return (
      <s-section heading={i18n.translate('waiver.heading')}>
        <s-text color="subdued">{i18n.translate('waiver.loading')}</s-text>
      </s-section>
    );
  }

  if (error && !ctx.waiverBody?.trim()) {
    return (
      <s-section heading={i18n.translate('waiver.heading')}>
        <s-text color="critical">{error}</s-text>
      </s-section>
    );
  }

  if (!ctx.waiverBody?.trim()) {
    return (
      <s-section heading={i18n.translate('waiver.heading')}>
        <s-text color="subdued">{i18n.translate('waiver.notConfigured')}</s-text>
      </s-section>
    );
  }

  if (ctx.acceptedAt) {
    return (
      <s-section heading={i18n.translate('waiver.heading')}>
        <s-stack direction="block" gap="small">
          <s-text>{i18n.translate('waiver.acceptedLine', {
            version: ctx.acceptedVersion ?? '—',
          })}</s-text>
          <s-text color="subdued">
            {i18n.translate('waiver.acceptedAt', { date: formatDate(ctx.acceptedAt, i18n) })}
          </s-text>
        </s-stack>
      </s-section>
    );
  }

  return (
    <s-section heading={i18n.translate('waiver.heading')}>
      <s-stack direction="block" gap="base">
        <s-text color="subdued">
          {i18n.translate('waiver.versionLabel', { version: ctx.waiverVersion })}
        </s-text>
        <s-stack direction="block" gap="small" padding="base">
          <s-text>{ctx.waiverBody}</s-text>
        </s-stack>
        <s-checkbox
          checked={agreed}
          onChange={(e) => setAgreed(!!e.currentTarget.checked)}
          label={i18n.translate('waiver.checkboxLabel')}
        />
        {error && <s-text color="critical">{error}</s-text>}
        <s-button
          onClick={handleSubmit}
          disabled={!agreed || submitting || !ctx.waiverVersion?.trim()}
        >
          {submitting ? i18n.translate('waiver.submitting') : i18n.translate('waiver.submit')}
        </s-button>
      </s-stack>
    </s-section>
  );
}

function formatDate(iso, i18n) {
  try {
    const d = new Date(iso);
    return i18n.formatDate(d);
  } catch {
    return iso;
  }
}

import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import {
  CUSTOMER_ACCOUNT_PROFILE_FIELDS,
  RIDER_PROFILE_METAFIELD_NAMESPACE,
  customerAccountRiderProfileQueryDocument,
} from '../../../app/lib/profile-fields';

const API_VERSION = '2026-01';

const RIDER_PROFILE_QUERY = customerAccountRiderProfileQueryDocument();

const METAFIELD_TYPE_BY_KEY = new Map(
  CUSTOMER_ACCOUNT_PROFILE_FIELDS.map((f) => [f.key, f.metafieldType]),
);

/** View grid: same order as config, excluding notes (full-width block below). */
const VIEW_GRID_FIELDS = CUSTOMER_ACCOUNT_PROFILE_FIELDS.filter((f) => f.key !== 'notes');

const EDITABLE_FIELD_KEYS = CUSTOMER_ACCOUNT_PROFILE_FIELDS.map((f) => f.key);

function isFieldComplete(value) {
  if (value === undefined || value === null) return false;
  return String(value).trim().length > 0;
}

function completionPercent(source) {
  const filled = EDITABLE_FIELD_KEYS.filter((key) => isFieldComplete(source[key])).length;
  return Math.round((filled / EDITABLE_FIELD_KEYS.length) * 100);
}

function formatValue(key, value) {
  if (!value) return null;
  if (key === 'height_cm') return `${value} cm`;
  if (key === 'weight_kg') return `${value} kg`;
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, ' ');
}

function shouldShowSummaryTag(key, raw) {
  if (!isFieldComplete(raw)) return false;
  if (key === 'rental_interest' || key === 'dietary_restrictions') {
    return raw !== 'none';
  }
  return true;
}

function CompletionStatus({ i18n, percent }) {
  return (
    <s-stack direction="block" gap="small">
      <s-text color="subdued">
        {i18n.translate('profileCompletion', { percent })}
      </s-text>
      <s-text color="subdued">{i18n.translate('tailorExperience')}</s-text>
    </s-stack>
  );
}

function RiderSummaryCard({ i18n, profile }) {
  const skill = profile.skill_level;
  const hasSkill = isFieldComplete(skill);

  const tagParts = [];
  if (shouldShowSummaryTag('rental_interest', profile.rental_interest)) {
    const t = formatValue('rental_interest', profile.rental_interest);
    if (t) tagParts.push(t);
  }
  if (shouldShowSummaryTag('dietary_restrictions', profile.dietary_restrictions)) {
    const t = formatValue('dietary_restrictions', profile.dietary_restrictions);
    if (t) tagParts.push(t);
  }

  if (!hasSkill) {
    return (
      <s-stack direction="block" gap="small">
        <s-text type="strong">{i18n.translate('summary.inProgressTitle')}</s-text>
        <s-text color="subdued">{i18n.translate('summary.inProgressHint')}</s-text>
      </s-stack>
    );
  }

  const ridingFmt = isFieldComplete(profile.riding_style)
    ? formatValue('riding_style', profile.riding_style)
    : null;

  return (
    <s-stack direction="block" gap="small">
      <s-text type="strong">{formatValue('skill_level', skill)}</s-text>
      {ridingFmt && <s-text color="subdued">{ridingFmt}</s-text>}
      {tagParts.length > 0 && (
        <s-text color="subdued">{tagParts.join(' · ')}</s-text>
      )}
    </s-stack>
  );
}

function CustomerAccountFieldInput({ field, i18n, editValues, updateEdit }) {
  const ui = field.ui;
  const labelKey = `fields.${field.key}`;
  const value = editValues[field.key] ?? '';

  if (ui.kind === 'select') {
    return (
      <s-select
        label={i18n.translate(labelKey)}
        value={value}
        onChange={(e) => updateEdit(field.key, e.currentTarget.value ?? '')}
      >
        <s-option value="">{i18n.translate('selectPlaceholder')}</s-option>
        {ui.options.map((opt) => (
          <s-option key={opt.value} value={opt.value}>
            {i18n.translate(`options.${field.key}.${opt.value}`)}
          </s-option>
        ))}
      </s-select>
    );
  }

  if (ui.kind === 'text') {
    return (
      <s-text-field
        label={i18n.translate(labelKey)}
        value={value}
        onChange={(e) => updateEdit(field.key, e.currentTarget.value ?? '')}
      />
    );
  }

  if (ui.kind === 'number') {
    return (
      <s-number-field
        label={i18n.translate(labelKey)}
        value={value}
        onChange={(e) => updateEdit(field.key, e.currentTarget.value ?? '')}
        min={ui.min}
        max={ui.max}
      />
    );
  }

  if (ui.kind === 'textarea') {
    const rows = field.key === 'notes' ? 3 : ui.rows;
    return (
      <s-text-area
        label={i18n.translate(labelKey)}
        value={value}
        onChange={(e) => updateEdit(field.key, e.currentTarget.value ?? '')}
        rows={rows}
      />
    );
  }

  if (ui.kind === 'boolean') {
    const checked = value === true || value === 'true' || value === '1';
    return (
      <s-checkbox
        label={i18n.translate(labelKey)}
        checked={checked}
        onChange={(e) => updateEdit(field.key, e.currentTarget.checked ? 'true' : '')}
      />
    );
  }

  return null;
}

async function fetchProfile() {
  const res = await fetch(
    `shopify://customer-account/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(RIDER_PROFILE_QUERY),
    },
  );
  const { data } = await res.json();
  const customerId = data?.customer?.id;
  const metafields = data?.customer?.metafields ?? [];
  const profile = {};
  let hasData = false;

  for (const mf of metafields) {
    if (mf && mf.key && mf.value) {
      profile[mf.key] = mf.value;
      hasData = true;
    }
  }

  return { customerId, profile, hasData };
}

async function saveProfileFields(customerId, fields) {
  const metafields = fields.map(({ key, value }) => ({
    ownerId: customerId,
    namespace: RIDER_PROFILE_METAFIELD_NAMESPACE,
    key,
    type: METAFIELD_TYPE_BY_KEY.get(key),
    value,
  }));

  const res = await fetch(
    `shopify://customer-account/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation setRiderProfile($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { key value }
            userErrors { field message }
          }
        }`,
        variables: { metafields },
      }),
    },
  );
  const { data } = await res.json();
  return data.metafieldsSet;
}

function collectFieldsToSave(editValues) {
  const fields = [];
  for (const field of CUSTOMER_ACCOUNT_PROFILE_FIELDS) {
    const v = editValues[field.key];
    if (field.ui.kind === 'boolean') {
      fields.push({
        key: field.key,
        value: v === true || v === 'true' ? 'true' : 'false',
      });
      continue;
    }
    if (v !== undefined && v !== '') {
      fields.push({ key: field.key, value: String(v) });
    }
  }
  return fields;
}

function validateNumberFields(editValues, i18n) {
  for (const field of CUSTOMER_ACCOUNT_PROFILE_FIELDS) {
    if (field.ui.kind !== 'number') continue;
    const raw = editValues[field.key];
    if (raw === '' || raw === undefined) continue;
    const num = Number(raw);
    if (isNaN(num) || num < field.ui.min || num > field.ui.max) {
      if (field.key === 'height_cm') return i18n.translate('validation.height');
      if (field.key === 'weight_kg') return i18n.translate('validation.weight');
      return i18n.translate('saveError');
    }
  }
  return null;
}

export default async () => {
  render(<ProfileBlockExtension />, document.body);
};

function ProfileBlockExtension() {
  const i18n = shopify.i18n;
  const [customerId, setCustomerId] = useState(null);
  const [profile, setProfile] = useState({});
  const [editValues, setEditValues] = useState({});
  const [hasData, setHasData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('view');
  const [saveMessage, setSaveMessage] = useState(null);

  useEffect(() => {
    fetchProfile()
      .then(({ customerId: cid, profile: p, hasData: hd }) => {
        setCustomerId(cid);
        setProfile(p);
        setHasData(hd);
      })
      .catch((err) => {
        console.error('Failed to fetch rider profile:', err);
        setError(err.message || 'Failed to load profile');
      })
      .finally(() => setLoading(false));
  }, []);

  const updateEdit = (key, value) => {
    setEditValues((prev) => ({ ...prev, [key]: value }));
  };

  const startEdit = () => {
    const initial = {};
    for (const field of CUSTOMER_ACCOUNT_PROFILE_FIELDS) {
      initial[field.key] = profile[field.key] ?? '';
    }
    setEditValues(initial);
    setSaveMessage(null);
    setMode('edit');
  };

  const cancelEdit = () => {
    setMode('view');
    setSaveMessage(null);
  };

  const handleSave = async () => {
    if (!customerId) return;

    const validationError = validateNumberFields(editValues, i18n);
    if (validationError) {
      setSaveMessage({ type: 'error', text: validationError });
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    const fields = collectFieldsToSave(editValues);

    if (fields.length === 0) {
      setSaving(false);
      return;
    }

    try {
      const result = await saveProfileFields(customerId, fields);
      if (result.userErrors?.length > 0) {
        setSaveMessage({
          type: 'error',
          text: result.userErrors.map((e) => e.message).join(', '),
        });
      } else {
        const updated = { ...profile };
        for (const mf of result.metafields) {
          updated[mf.key] = mf.value;
        }
        setProfile(updated);
        setHasData(true);
        setMode('view');
        setSaveMessage({ type: 'success', text: i18n.translate('saveSuccess') });
      }
    } catch (err) {
      setSaveMessage({ type: 'error', text: i18n.translate('saveError') });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <s-section heading={i18n.translate('heading')}>
        <s-text color="subdued">{i18n.translate('loading')}</s-text>
      </s-section>
    );
  }

  if (error) {
    return (
      <s-section heading={i18n.translate('heading')}>
        <s-text color="subdued">{i18n.translate('error')}</s-text>
      </s-section>
    );
  }

  if (!hasData && mode !== 'edit') {
    const pctEmpty = completionPercent({});
    return (
      <s-section heading={i18n.translate('heading')}>
        <s-stack direction="block" gap="base">
          <CompletionStatus i18n={i18n} percent={pctEmpty} />
          <s-stack direction="block" gap="small">
            <s-text type="strong">{i18n.translate('emptyTitle')}</s-text>
            <s-text color="subdued">{i18n.translate('emptyLead')}</s-text>
            <s-text color="subdued">{i18n.translate('emptyDisclaimer')}</s-text>
          </s-stack>
          <s-button onClick={startEdit}>{i18n.translate('emptyCta')}</s-button>
        </s-stack>
      </s-section>
    );
  }

  if (mode === 'edit') {
    const pctEdit = completionPercent(editValues);
    return (
      <s-section heading={i18n.translate('heading')}>
        <s-stack direction="block" gap="base">
          <CompletionStatus i18n={i18n} percent={pctEdit} />
          <s-text color="subdued">{i18n.translate('disclaimer')}</s-text>

          {CUSTOMER_ACCOUNT_PROFILE_FIELDS.map((field) => (
            <CustomerAccountFieldInput
              key={field.key}
              field={field}
              i18n={i18n}
              editValues={editValues}
              updateEdit={updateEdit}
            />
          ))}

          {saveMessage?.type === 'error' && (
            <s-text color="critical">{saveMessage.text}</s-text>
          )}

          <s-stack direction="inline" gap="base">
            <s-button onClick={handleSave} disabled={saving}>
              {saving ? i18n.translate('saving') : i18n.translate('saveProfile')}
            </s-button>
            <s-button onClick={cancelEdit} kind="secondary">
              {i18n.translate('cancel')}
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>
    );
  }

  // View mode
  const filledFields = VIEW_GRID_FIELDS.filter((f) => profile[f.key]);
  const pctView = completionPercent(profile);

  return (
    <s-section heading={i18n.translate('heading')}>
      <s-stack direction="block" gap="base">
        {saveMessage?.type === 'success' && (
          <s-text color="success">{saveMessage.text}</s-text>
        )}
        <CompletionStatus i18n={i18n} percent={pctView} />
        <RiderSummaryCard i18n={i18n} profile={profile} />
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          {filledFields.map((f) => (
            <s-stack direction="block" gap="small" key={f.key}>
              <s-text color="subdued">{i18n.translate(`fields.${f.key}`)}</s-text>
              <s-text type="strong">{formatValue(f.key, profile[f.key])}</s-text>
            </s-stack>
          ))}
        </s-grid>
        {profile.notes && (
          <s-stack direction="block" gap="small">
            <s-text color="subdued">{i18n.translate('fields.notes')}</s-text>
            <s-text>{profile.notes}</s-text>
          </s-stack>
        )}
        <s-button onClick={startEdit}>{i18n.translate('updateProfile')}</s-button>
      </s-stack>
    </s-section>
  );
}

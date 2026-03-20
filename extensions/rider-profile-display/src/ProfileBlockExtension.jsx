import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';

const API_VERSION = '2026-01';

const RIDER_PROFILE_QUERY = {
  query: `query getCustomerRiderProfile {
    customer {
      id
      metafields(identifiers: [
        { namespace: "rider_profile", key: "skill_level" },
        { namespace: "rider_profile", key: "riding_style" },
        { namespace: "rider_profile", key: "fitness_level" },
        { namespace: "rider_profile", key: "multi_day_experience" },
        { namespace: "rider_profile", key: "country" },
        { namespace: "rider_profile", key: "dietary_restrictions" },
        { namespace: "rider_profile", key: "rental_interest" },
        { namespace: "rider_profile", key: "height_cm" },
        { namespace: "rider_profile", key: "weight_kg" },
        { namespace: "rider_profile", key: "notes" }
      ]) {
        key
        value
      }
    }
  }`,
};

const FIELD_ORDER = [
  'skill_level',
  'riding_style',
  'fitness_level',
  'multi_day_experience',
  'country',
  'dietary_restrictions',
  'rental_interest',
  'height_cm',
  'weight_kg',
];

const EDITABLE_FIELDS = [
  'skill_level',
  'riding_style',
  'fitness_level',
  'multi_day_experience',
  'country',
  'dietary_restrictions',
  'rental_interest',
  'height_cm',
  'weight_kg',
  'notes',
];

const FIELD_TYPES = {
  skill_level: 'single_line_text_field',
  riding_style: 'single_line_text_field',
  fitness_level: 'single_line_text_field',
  multi_day_experience: 'single_line_text_field',
  country: 'single_line_text_field',
  dietary_restrictions: 'single_line_text_field',
  rental_interest: 'single_line_text_field',
  height_cm: 'number_integer',
  weight_kg: 'number_integer',
  notes: 'multi_line_text_field',
};

function isFieldComplete(value) {
  if (value === undefined || value === null) return false;
  return String(value).trim().length > 0;
}

function completionPercent(source) {
  const filled = EDITABLE_FIELDS.filter((key) => isFieldComplete(source[key])).length;
  return Math.round((filled / EDITABLE_FIELDS.length) * 100);
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
    namespace: 'rider_profile',
    key,
    type: FIELD_TYPES[key],
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
    for (const key of EDITABLE_FIELDS) {
      initial[key] = profile[key] ?? '';
    }
    setEditValues(initial);
    setSaveMessage(null);
    setMode('edit');
  };

  const cancelEdit = () => {
    setMode('view');
    setSaveMessage(null);
  };

  const validateFields = () => {
    const h = editValues.height_cm;
    if (h !== '' && h !== undefined) {
      const num = Number(h);
      if (isNaN(num) || num < 100 || num > 230) {
        return i18n.translate('validation.height');
      }
    }
    const w = editValues.weight_kg;
    if (w !== '' && w !== undefined) {
      const num = Number(w);
      if (isNaN(num) || num < 30 || num > 200) {
        return i18n.translate('validation.weight');
      }
    }
    return null;
  };

  const handleSave = async () => {
    if (!customerId) return;

    const validationError = validateFields();
    if (validationError) {
      setSaveMessage({ type: 'error', text: validationError });
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    const fields = EDITABLE_FIELDS.filter(
      (key) => editValues[key] !== undefined && editValues[key] !== '',
    ).map((key) => ({ key, value: String(editValues[key]) }));

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

          <s-select
            label={i18n.translate('fields.skill_level')}
            value={editValues.skill_level ?? ''}
            onChange={(e) => updateEdit('skill_level', e.currentTarget.value ?? '')}
          >
            <s-option value="">{i18n.translate('selectPlaceholder')}</s-option>
            <s-option value="beginner">{i18n.translate('options.skill_level.beginner')}</s-option>
            <s-option value="intermediate">{i18n.translate('options.skill_level.intermediate')}</s-option>
            <s-option value="advanced">{i18n.translate('options.skill_level.advanced')}</s-option>
            <s-option value="expert">{i18n.translate('options.skill_level.expert')}</s-option>
          </s-select>

          <s-select
            label={i18n.translate('fields.riding_style')}
            value={editValues.riding_style ?? ''}
            onChange={(e) => updateEdit('riding_style', e.currentTarget.value ?? '')}
          >
            <s-option value="">{i18n.translate('selectPlaceholder')}</s-option>
            <s-option value="cross-country">{i18n.translate('options.riding_style.cross-country')}</s-option>
            <s-option value="trail">{i18n.translate('options.riding_style.trail')}</s-option>
            <s-option value="all-mountain">{i18n.translate('options.riding_style.all-mountain')}</s-option>
            <s-option value="enduro">{i18n.translate('options.riding_style.enduro')}</s-option>
            <s-option value="downhill">{i18n.translate('options.riding_style.downhill')}</s-option>
          </s-select>

          <s-select
            label={i18n.translate('fields.fitness_level')}
            value={editValues.fitness_level ?? ''}
            onChange={(e) => updateEdit('fitness_level', e.currentTarget.value ?? '')}
          >
            <s-option value="">{i18n.translate('selectPlaceholder')}</s-option>
            <s-option value="low">{i18n.translate('options.fitness_level.low')}</s-option>
            <s-option value="moderate">{i18n.translate('options.fitness_level.moderate')}</s-option>
            <s-option value="high">{i18n.translate('options.fitness_level.high')}</s-option>
            <s-option value="athletic">{i18n.translate('options.fitness_level.athletic')}</s-option>
          </s-select>

          <s-select
            label={i18n.translate('fields.multi_day_experience')}
            value={editValues.multi_day_experience ?? ''}
            onChange={(e) => updateEdit('multi_day_experience', e.currentTarget.value ?? '')}
          >
            <s-option value="">{i18n.translate('selectPlaceholder')}</s-option>
            <s-option value="none">{i18n.translate('options.multi_day_experience.none')}</s-option>
            <s-option value="some">{i18n.translate('options.multi_day_experience.some')}</s-option>
            <s-option value="experienced">{i18n.translate('options.multi_day_experience.experienced')}</s-option>
          </s-select>

          <s-text-field
            label={i18n.translate('fields.country')}
            value={editValues.country ?? ''}
            onChange={(e) => updateEdit('country', e.currentTarget.value ?? '')}
          />

          <s-select
            label={i18n.translate('fields.dietary_restrictions')}
            value={editValues.dietary_restrictions ?? ''}
            onChange={(e) => updateEdit('dietary_restrictions', e.currentTarget.value ?? '')}
          >
            <s-option value="">{i18n.translate('selectPlaceholder')}</s-option>
            <s-option value="none">{i18n.translate('options.dietary_restrictions.none')}</s-option>
            <s-option value="vegetarian">{i18n.translate('options.dietary_restrictions.vegetarian')}</s-option>
            <s-option value="vegan">{i18n.translate('options.dietary_restrictions.vegan')}</s-option>
            <s-option value="gluten-free">{i18n.translate('options.dietary_restrictions.gluten-free')}</s-option>
            <s-option value="other">{i18n.translate('options.dietary_restrictions.other')}</s-option>
          </s-select>

          <s-select
            label={i18n.translate('fields.rental_interest')}
            value={editValues.rental_interest ?? ''}
            onChange={(e) => updateEdit('rental_interest', e.currentTarget.value ?? '')}
          >
            <s-option value="">{i18n.translate('selectPlaceholder')}</s-option>
            <s-option value="none">{i18n.translate('options.rental_interest.none')}</s-option>
            <s-option value="bike">{i18n.translate('options.rental_interest.bike')}</s-option>
            <s-option value="e-bike">{i18n.translate('options.rental_interest.e-bike')}</s-option>
            <s-option value="undecided">{i18n.translate('options.rental_interest.undecided')}</s-option>
          </s-select>

          <s-number-field
            label={i18n.translate('fields.height_cm')}
            value={editValues.height_cm ?? ''}
            onChange={(e) => updateEdit('height_cm', e.currentTarget.value ?? '')}
            min={100}
            max={230}
          />

          <s-number-field
            label={i18n.translate('fields.weight_kg')}
            value={editValues.weight_kg ?? ''}
            onChange={(e) => updateEdit('weight_kg', e.currentTarget.value ?? '')}
            min={30}
            max={200}
          />

          <s-text-area
            label={i18n.translate('fields.notes')}
            value={editValues.notes ?? ''}
            onChange={(e) => updateEdit('notes', e.currentTarget.value ?? '')}
            rows={3}
          />

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
  const filledFields = FIELD_ORDER.filter((key) => profile[key]);
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
          {filledFields.map((key) => (
            <s-stack direction="block" gap="small" key={key}>
              <s-text color="subdued">{i18n.translate(`fields.${key}`)}</s-text>
              <s-text type="strong">{formatValue(key, profile[key])}</s-text>
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

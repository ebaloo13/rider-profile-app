/** Ordered rider profile field definitions for admin UI and Shopify metafields. */

export const RIDER_PROFILE_METAFIELD_NAMESPACE = "rider_profile";

/** Customer Account API access for metafield definitions; must align with shopify.app.toml. */
export type CustomerAccountMetafieldAccess = "READ_WRITE" | "NONE";

export type RiderMetafieldDefinitionInput = {
  name: string;
  namespace: string;
  key: string;
  type: string;
  description: string;
  customerAccountAccess: CustomerAccountMetafieldAccess;
};

export const PROFILE_SECTIONS = [
  "Qualification",
  "Trip Logistics",
  "Physical Info",
  "Notes",
] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export const PROFILE_FIELD_CONFIG = [
  {
    key: "skill_level",
    metafieldType: "single_line_text_field",
    label: "Skill Level",
    definitionDescription:
      "MTB rider ability: beginner, intermediate, advanced, expert",
    customerAccountAccess: "READ_WRITE",
    section: "Qualification",
    required: true,
    ui: {
      kind: "select",
      options: [
        { value: "beginner", label: "Beginner" },
        { value: "intermediate", label: "Intermediate" },
        { value: "advanced", label: "Advanced" },
        { value: "expert", label: "Expert" },
      ],
    },
  },
  {
    key: "riding_style",
    metafieldType: "single_line_text_field",
    label: "Riding Style",
    definitionDescription:
      "Preferred MTB discipline: cross-country, trail, all-mountain, enduro, downhill",
    customerAccountAccess: "READ_WRITE",
    section: "Qualification",
    required: true,
    ui: {
      kind: "select",
      options: [
        { value: "cross-country", label: "Cross-Country" },
        { value: "trail", label: "Trail" },
        { value: "all-mountain", label: "All-Mountain" },
        { value: "enduro", label: "Enduro" },
        { value: "downhill", label: "Downhill" },
      ],
    },
  },
  {
    key: "fitness_level",
    metafieldType: "single_line_text_field",
    label: "Fitness Level",
    definitionDescription:
      "Self-assessed physical fitness: low, moderate, high, athletic",
    customerAccountAccess: "READ_WRITE",
    section: "Qualification",
    required: true,
    ui: {
      kind: "select",
      options: [
        { value: "low", label: "Low" },
        { value: "moderate", label: "Moderate" },
        { value: "high", label: "High" },
        { value: "athletic", label: "Athletic" },
      ],
    },
  },
  {
    key: "multi_day_experience",
    metafieldType: "single_line_text_field",
    label: "Multi-Day Experience",
    definitionDescription:
      "Previous multi-day MTB trip experience: none, some, experienced",
    customerAccountAccess: "READ_WRITE",
    section: "Qualification",
    required: true,
    ui: {
      kind: "select",
      options: [
        { value: "none", label: "None" },
        { value: "some", label: "Some (1–2 trips)" },
        { value: "experienced", label: "Experienced (3+)" },
      ],
    },
  },
  {
    key: "country",
    metafieldType: "single_line_text_field",
    label: "Country of Residence",
    definitionDescription:
      "Customer country of residence for travel logistics",
    customerAccountAccess: "READ_WRITE",
    section: "Trip Logistics",
    recommended: true,
    ui: { kind: "text" },
  },
  {
    key: "dietary_restrictions",
    metafieldType: "single_line_text_field",
    label: "Dietary Restrictions",
    definitionDescription:
      "Meal planning: none, vegetarian, vegan, gluten-free, other",
    customerAccountAccess: "READ_WRITE",
    section: "Trip Logistics",
    recommended: true,
    ui: {
      kind: "select",
      options: [
        { value: "none", label: "None" },
        { value: "vegetarian", label: "Vegetarian" },
        { value: "vegan", label: "Vegan" },
        { value: "gluten-free", label: "Gluten-Free" },
        { value: "other", label: "Other (specify in Notes)" },
      ],
    },
  },
  {
    key: "rental_interest",
    metafieldType: "single_line_text_field",
    label: "Rental Interest",
    definitionDescription:
      "Bike/e-bike rental add-on interest: none, bike, e-bike, undecided",
    customerAccountAccess: "READ_WRITE",
    section: "Trip Logistics",
    recommended: true,
    ui: {
      kind: "select",
      options: [
        { value: "none", label: "None (bringing own bike)" },
        { value: "bike", label: "Bike rental" },
        { value: "e-bike", label: "E-bike rental" },
        { value: "undecided", label: "Undecided" },
      ],
    },
  },
  {
    key: "height_cm",
    metafieldType: "number_integer",
    label: "Height (cm)",
    definitionDescription: "Rider height in centimeters",
    customerAccountAccess: "READ_WRITE",
    section: "Physical Info",
    recommended: true,
    ui: { kind: "number", min: 100, max: 230 },
  },
  {
    key: "weight_kg",
    metafieldType: "number_integer",
    label: "Weight (kg)",
    definitionDescription: "Rider weight in kilograms",
    customerAccountAccess: "READ_WRITE",
    section: "Physical Info",
    recommended: true,
    ui: { kind: "number", min: 30, max: 200 },
  },
  {
    key: "notes",
    metafieldType: "multi_line_text_field",
    label: "Notes",
    definitionDescription: "Customer-facing notes about the rider",
    customerAccountAccess: "READ_WRITE",
    section: "Notes",
    ui: { kind: "textarea", rows: 4 },
  },
  {
    key: "internal_notes",
    metafieldType: "multi_line_text_field",
    label: "Internal Notes (Staff Only)",
    /** Shopify definition name (shorter than admin UI label). */
    definitionName: "Internal Notes",
    definitionDescription:
      "Staff-only internal notes about the rider (not visible to customers)",
    customerAccountAccess: "NONE",
    section: "Notes",
    ui: { kind: "textarea", rows: 4 },
  },
] as const;

export type ProfileFieldConfig = (typeof PROFILE_FIELD_CONFIG)[number];

export type RiderProfileFieldKey = ProfileFieldConfig["key"];

export type RiderProfileForm = Record<RiderProfileFieldKey, string>;

export const PROFILE_FIELDS = Object.fromEntries(
  PROFILE_FIELD_CONFIG.map((f) => [f.key, f.metafieldType]),
) as Record<RiderProfileFieldKey, string>;

export const PROFILE_KEYS = PROFILE_FIELD_CONFIG.map(
  (f) => f.key,
) as RiderProfileFieldKey[];

export const FIELD_LABELS = Object.fromEntries(
  PROFILE_FIELD_CONFIG.map((f) => [f.key, f.label]),
) as Record<RiderProfileFieldKey, string>;

export const EMPTY_PROFILE: RiderProfileForm = PROFILE_FIELD_CONFIG.reduce(
  (acc, f) => {
    acc[f.key] = "";
    return acc;
  },
  {} as RiderProfileForm,
);

export const REQUIRED_PROFILE_FIELDS = PROFILE_FIELD_CONFIG.filter(
  (f) => "required" in f && f.required,
).map((f) => f.key);

export const RECOMMENDED_PROFILE_FIELDS = PROFILE_FIELD_CONFIG.filter(
  (f) => "recommended" in f && f.recommended,
).map((f) => f.key);

/** Inputs for Admin API metafieldDefinitionCreate / metafieldDefinitionUpdate. */
export const RIDER_METAFIELD_DEFINITIONS: RiderMetafieldDefinitionInput[] =
  PROFILE_FIELD_CONFIG.map((f) => ({
    name: "definitionName" in f ? f.definitionName : f.label,
    namespace: RIDER_PROFILE_METAFIELD_NAMESPACE,
    key: f.key,
    type: f.metafieldType,
    description: f.definitionDescription,
    customerAccountAccess: f.customerAccountAccess,
  }));

/** Customer Account extension: READ_WRITE fields only, same order as PROFILE_FIELD_CONFIG. */
export const CUSTOMER_ACCOUNT_PROFILE_FIELDS = PROFILE_FIELD_CONFIG.filter(
  (f): f is Extract<ProfileFieldConfig, { customerAccountAccess: "READ_WRITE" }> =>
    f.customerAccountAccess === "READ_WRITE",
);

export type CustomerAccountProfileField = (typeof CUSTOMER_ACCOUNT_PROFILE_FIELDS)[number];

/** GraphQL document for Customer Account API rider_profile metafields (identifiers only). */
export function customerAccountRiderProfileQueryDocument(): { query: string } {
  const identifierLines = CUSTOMER_ACCOUNT_PROFILE_FIELDS.map(
    (f) =>
      `{ namespace: "${RIDER_PROFILE_METAFIELD_NAMESPACE}", key: "${f.key}" }`,
  ).join(",\n        ");
  return {
    query: `query getCustomerRiderProfile {
    customer {
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

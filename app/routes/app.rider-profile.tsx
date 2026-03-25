import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  EMPTY_PROFILE,
  FIELD_LABELS,
  PROFILE_FIELD_CONFIG,
  PROFILE_FIELDS,
  PROFILE_KEYS,
  PROFILE_SECTIONS,
  RECOMMENDED_PROFILE_FIELDS,
  REQUIRED_PROFILE_FIELDS,
  type ProfileFieldConfig,
  type RiderProfileForm,
} from "../lib/profile-fields";
import { authenticate } from "../shopify.server";

interface Customer {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  defaultAddress: {
    city: string | null;
    province: string | null;
    country: string | null;
  } | null;
}

function ProfileFieldInput({
  field,
  value,
  onChange,
}: {
  field: ProfileFieldConfig;
  value: string;
  onChange: (next: string) => void;
}) {
  const ui = field.ui;
  if (ui.kind === "select") {
    return (
      <s-select
        label={field.label}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value ?? "")}
      >
        <s-option value="">— Select —</s-option>
        {ui.options.map((opt) => (
          <s-option key={opt.value} value={opt.value}>
            {opt.label}
          </s-option>
        ))}
      </s-select>
    );
  }
  if (ui.kind === "text") {
    return (
      <s-text-field
        label={field.label}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value ?? "")}
      ></s-text-field>
    );
  }
  if (ui.kind === "number") {
    return (
      <s-number-field
        label={field.label}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value ?? "")}
        min={ui.min}
        max={ui.max}
      ></s-number-field>
    );
  }
  return (
    <s-text-area
      label={field.label}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value ?? "")}
      rows={ui.rows}
    ></s-text-area>
  );
}

function formatLocation(address: Customer["defaultAddress"]): string | null {
  if (!address) return null;
  const parts = [address.city, address.province, address.country].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

function adminCustomerUrl(gid: string): string {
  return `shopify:admin/customers/${gid.split("/").pop()}`;
}

const SEARCH_CUSTOMERS = `#graphql
  query searchCustomers($query: String!) {
    customers(first: 10, query: $query) {
      edges {
        node {
          id
          displayName
          email
          phone
          defaultAddress {
            city
            province
            country
          }
        }
      }
    }
  }
`;

const GET_CUSTOMER_PROFILE = `#graphql
  query getCustomerProfile($customerId: ID!) {
    customer(id: $customerId) {
      metafields(first: 20, namespace: "rider_profile") {
        edges {
          node {
            key
            value
          }
        }
      }
    }
  }
`;

const SET_METAFIELDS = `#graphql
  mutation setRiderProfile($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        key
        value
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_METAFIELDS = `#graphql
  mutation deleteRiderProfileMetafields($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields {
        key
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "search") {
    const query = formData.get("query");
    if (typeof query !== "string" || query.trim() === "") {
      return { customers: [], searchPerformed: true };
    }

    const response = await admin.graphql(SEARCH_CUSTOMERS, {
      variables: { query: query.trim() },
    });
    const json = await response.json();
    const customers: Customer[] =
      json.data!.customers!.edges.map(
        (edge: { node: Customer }) => edge.node,
      ) ?? [];

    return { intent: "search", customers, searchPerformed: true };
  }

  if (intent === "load") {
    const customerId = formData.get("customerId");
    if (typeof customerId !== "string") {
      return { intent: "load", profile: {}, hasExistingProfile: false };
    }

    const response = await admin.graphql(GET_CUSTOMER_PROFILE, {
      variables: { customerId },
    });
    const json = await response.json();
    const edges = json.data!.customer!.metafields!.edges ?? [];

    const profile: Record<string, string> = {};
    for (const edge of edges) {
      const { key, value } = edge.node as { key: string; value: string };
      if (key in PROFILE_FIELDS) {
        profile[key] = value;
      }
    }

    return {
      intent: "load",
      profile,
      hasExistingProfile: Object.keys(profile).length > 0,
    };
  }

  if (intent === "save") {
    const customerId = formData.get("customerId");
    if (typeof customerId !== "string") {
      return { intent: "save", saved: false, errors: ["Missing customer ID"] };
    }

    const previousProfileRaw = formData.get("previousProfile");
    let previousProfile: Partial<RiderProfileForm> = {};
    if (typeof previousProfileRaw === "string" && previousProfileRaw !== "") {
      try {
        previousProfile = JSON.parse(previousProfileRaw) as Partial<RiderProfileForm>;
      } catch {
        previousProfile = {};
      }
    }

    const metafieldsToSet: Array<{
      ownerId: string;
      namespace: string;
      key: string;
      type: string;
      value: string;
    }> = [];
    const metafieldsToDelete: Array<{
      ownerId: string;
      namespace: string;
      key: string;
    }> = [];

    for (const [key, type] of Object.entries(PROFILE_FIELDS) as Array<
      [keyof RiderProfileForm, string]
    >) {
      const rawCurrent = formData.get(key);
      const currentValue = typeof rawCurrent === "string" ? rawCurrent : "";
      const previousValue = previousProfile[key] ?? "";

      if (currentValue.trim() !== "") {
        metafieldsToSet.push({
          ownerId: customerId,
          namespace: "rider_profile",
          key,
          type,
          value: currentValue,
        });
      } else if (previousValue.trim() !== "") {
        // Field used to have a value and is now blank: delete stored metafield.
        metafieldsToDelete.push({
          ownerId: customerId,
          namespace: "rider_profile",
          key,
        });
      }
    }

    if (metafieldsToSet.length === 0 && metafieldsToDelete.length === 0) {
      return {
        intent: "save",
        saved: false,
        errors: ["No changes to save"],
      };
    }

    const errors: string[] = [];

    if (metafieldsToSet.length > 0) {
      const response = await admin.graphql(SET_METAFIELDS, {
        variables: { metafields: metafieldsToSet },
      });
      const json = await response.json();
      const userErrors = json.data!.metafieldsSet!.userErrors ?? [];
      for (const e of userErrors) {
        errors.push((e as { message: string }).message);
      }
    }

    if (metafieldsToDelete.length > 0) {
      const deleteResponse = await admin.graphql(DELETE_METAFIELDS, {
        variables: { metafields: metafieldsToDelete },
      });
      const deleteJson = await deleteResponse.json();
      const deleteErrors = deleteJson.data!.metafieldsDelete!.userErrors ?? [];
      for (const e of deleteErrors) {
        errors.push((e as { message: string }).message);
      }
    }

    if (errors.length > 0) {
      return { intent: "save", saved: false, errors };
    }

    return { intent: "save", saved: true, errors: [] };
  }

  return { intent: null, customers: [], searchPerformed: false };
};

export default function RiderProfile() {
  const fetcher = useFetcher<typeof action>();
  const loadFetcher = useFetcher<typeof action>();
  const saveFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [profile, setProfile] = useState<RiderProfileForm>({ ...EMPTY_PROFILE });
  const [savedProfile, setSavedProfile] = useState<RiderProfileForm | null>(
    null,
  );
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [uiMode, setUiMode] = useState<"edit" | "view">("edit");
  const [showOverwriteWarning, setShowOverwriteWarning] = useState(false);

  const updateField = (key: keyof RiderProfileForm, value: string) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const isSearching =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  const isLoading =
    ["loading", "submitting"].includes(loadFetcher.state) &&
    loadFetcher.formMethod === "POST";

  const isSaving =
    ["loading", "submitting"].includes(saveFetcher.state) &&
    saveFetcher.formMethod === "POST";

  useEffect(() => {
    if (loadFetcher.data && "profile" in loadFetcher.data) {
      const loaded = {
        ...EMPTY_PROFILE,
        ...(loadFetcher.data.profile as Partial<RiderProfileForm>),
      };
      setProfile(loaded);
      if (loadFetcher.data.hasExistingProfile) {
        setSavedProfile(loaded);
      } else {
        setSavedProfile(null);
      }
      setShowOverwriteWarning(false);
    }
  }, [loadFetcher.data]);

  useEffect(() => {
    if (saveFetcher.data && "saved" in saveFetcher.data) {
      if (saveFetcher.data.saved) {
        shopify.toast.show("Rider profile saved");
        setSavedProfile({ ...profile });
        setSaveErrors([]);
        setUiMode("view");
        setShowOverwriteWarning(false);
      } else if (saveFetcher.data.errors?.length) {
        const errors = saveFetcher.data.errors as string[];
        setSaveErrors(errors);
        shopify.toast.show(`Error: ${errors.join(", ")}`, { isError: true });
      }
    }
  }, [saveFetcher.data, shopify]);

  const customers = fetcher.data?.customers ?? [];
  const searchPerformed = fetcher.data?.searchPerformed ?? false;

  const handleSearch = () => {
    fetcher.submit(
      { intent: "search", query: searchQuery },
      { method: "POST" },
    );
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSaveErrors([]);
    setUiMode("edit");
    setShowOverwriteWarning(false);
    loadFetcher.submit(
      { intent: "load", customerId: customer.id },
      { method: "POST" },
    );
  };

  const handleChangeCustomer = () => {
    setSelectedCustomer(null);
    setSearchQuery("");
    setProfile({ ...EMPTY_PROFILE });
    setSavedProfile(null);
    setSaveErrors([]);
    setUiMode("edit");
    setShowOverwriteWarning(false);
  };

  const hasChangesAgainstSavedProfile =
    savedProfile !== null &&
    PROFILE_KEYS.some((key) => profile[key] !== savedProfile[key]);

  const submitSave = () => {
    if (!selectedCustomer) return;
    saveFetcher.submit(
      {
        intent: "save",
        customerId: selectedCustomer.id,
        previousProfile: JSON.stringify(savedProfile ?? EMPTY_PROFILE),
        ...profile,
      },
      { method: "POST" },
    );
  };

  const handleSave = () => {
    if (savedProfile && hasChangesAgainstSavedProfile) {
      setShowOverwriteWarning(true);
      return;
    }
    submitSave();
  };

  if (selectedCustomer) {
    const viewProfile = savedProfile ?? profile;
    const activeProfile = uiMode === "view" ? viewProfile : profile;
    const location = formatLocation(selectedCustomer.defaultAddress);

    const missingCustomerInfo: string[] = [];
    if (!selectedCustomer.email) missingCustomerInfo.push("Email");
    if (!selectedCustomer.phone) missingCustomerInfo.push("Phone");
    if (!selectedCustomer.defaultAddress) missingCustomerInfo.push("Address");

    const missingRequired = REQUIRED_PROFILE_FIELDS.filter(
      (key) => !activeProfile[key].trim(),
    ).map((key) => FIELD_LABELS[key]);
    const missingRecommended = RECOMMENDED_PROFILE_FIELDS.filter(
      (key) => !activeProfile[key].trim(),
    ).map((key) => FIELD_LABELS[key]);
    const requiredCount =
      REQUIRED_PROFILE_FIELDS.length - missingRequired.length;
    const recommendedCount =
      RECOMMENDED_PROFILE_FIELDS.length - missingRecommended.length;

    return (
      <s-page heading="Rider Profile">
        {uiMode === "edit" && (
          <s-button
            slot="primary-action"
            onClick={handleSave}
            {...(isSaving ? { loading: true } : {})}
          >
            Save Profile
          </s-button>
        )}
        <s-section heading="Customer">
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base">
              <s-heading>{selectedCustomer.displayName}</s-heading>
              <s-paragraph>
                <s-text>
                  {"Email: "}
                  {selectedCustomer.email ?? "Not set"}
                </s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text>
                  {"Phone: "}
                  {selectedCustomer.phone ?? "Not set"}
                </s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text>
                  {"Location: "}
                  {location ?? "No address on file"}
                </s-text>
              </s-paragraph>
            </s-stack>
          </s-box>
          <s-box padding-block-start="base">
            <s-stack direction="inline" gap="base">
              <s-button onClick={handleChangeCustomer} variant="tertiary">
                Back to Search
              </s-button>
              <s-link
                href={adminCustomerUrl(selectedCustomer.id)}
                target="_blank"
              >
                Open in Shopify Admin
              </s-link>
              {uiMode === "view" && (
                <s-button onClick={() => setUiMode("edit")} variant="tertiary">
                  Edit Profile
                </s-button>
              )}
            </s-stack>
          </s-box>
        </s-section>

        {missingCustomerInfo.length > 0 && (
          <s-section heading="">
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-paragraph>
                <s-text>
                  {"Missing customer info: " +
                    missingCustomerInfo.join(", ") +
                    ". "}
                </s-text>
                <s-link
                  href={adminCustomerUrl(selectedCustomer.id)}
                  target="_blank"
                >
                  Update in Shopify Admin
                </s-link>
              </s-paragraph>
            </s-box>
          </s-section>
        )}

        <s-section heading="Profile Completeness">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              <s-text>
                {`Required: ${requiredCount} of ${REQUIRED_PROFILE_FIELDS.length} complete`}
                {missingRequired.length > 0 &&
                  ` — missing: ${missingRequired.join(", ")}`}
              </s-text>
            </s-paragraph>
            <s-paragraph>
              <s-text>
                {`Recommended: ${recommendedCount} of ${RECOMMENDED_PROFILE_FIELDS.length} complete`}
                {missingRecommended.length > 0 &&
                  ` — missing: ${missingRecommended.join(", ")}`}
              </s-text>
            </s-paragraph>
          </s-stack>
        </s-section>

        {isLoading && uiMode === "edit" && (
          <s-section heading="Loading Profile">
            <s-paragraph>Loading rider profile data...</s-paragraph>
          </s-section>
        )}

        {!isLoading && savedProfile && uiMode === "edit" && (
          <s-section heading="">
            <s-paragraph>
              This customer has an existing rider profile. Edit the fields below
              and click Save Profile to update.
            </s-paragraph>
          </s-section>
        )}

        {uiMode === "edit" && showOverwriteWarning && (
          <s-section heading="Confirm Overwrite">
            <s-paragraph>
              This customer already has saved rider profile data. Saving now will
              overwrite existing values, and any previously saved field you leave
              blank will be removed.
            </s-paragraph>
            <s-box padding-block-start="base">
              <s-stack direction="inline" gap="base">
                <s-button onClick={submitSave} {...(isSaving ? { loading: true } : {})}>
                  Confirm Save
                </s-button>
                <s-button
                  onClick={() => setShowOverwriteWarning(false)}
                  variant="tertiary"
                >
                  Cancel
                </s-button>
              </s-stack>
            </s-box>
          </s-section>
        )}

        {uiMode === "view" ? (
          <s-section heading="Completed Rider Profile">
            <s-stack direction="block" gap="base">
              {PROFILE_FIELD_CONFIG.map((field) => (
                <s-paragraph key={field.key}>
                  <s-text>{field.label}: </s-text>
                  <s-text>{viewProfile[field.key] || "—"}</s-text>
                </s-paragraph>
              ))}
            </s-stack>
          </s-section>
        ) : (
          <>
            {PROFILE_SECTIONS.map((sectionHeading) => (
              <s-section key={sectionHeading} heading={sectionHeading}>
                {PROFILE_FIELD_CONFIG.filter((f) => f.section === sectionHeading).map(
                  (field) => (
                    <ProfileFieldInput
                      key={field.key}
                      field={field}
                      value={profile[field.key]}
                      onChange={(v) => updateField(field.key, v)}
                    />
                  ),
                )}
              </s-section>
            ))}

        {saveErrors.length > 0 && (
          <s-section heading="Save Errors">
            <s-stack direction="block" gap="base">
              {saveErrors.map((err, i) => (
                <s-paragraph key={i}>
                  <s-text>{err}</s-text>
                </s-paragraph>
              ))}
            </s-stack>
          </s-section>
        )}
          </>
        )}
      </s-page>
    );
  }

  return (
    <s-page heading="Rider Profile">
      <s-section heading="Find a Customer">
        <s-stack direction="inline" gap="base">
          <s-text-field
            label="Search by name or email"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value ?? "")}
          ></s-text-field>
          <s-button
            onClick={handleSearch}
            {...(isSearching ? { loading: true } : {})}
          >
            Search
          </s-button>
        </s-stack>
      </s-section>

      {searchPerformed && customers.length === 0 && !isSearching && (
        <s-section heading="Results">
          <s-paragraph>No customers found. Try a different search.</s-paragraph>
        </s-section>
      )}

      {customers.length > 0 && (
        <s-section heading="Results">
          <s-stack direction="block" gap="base">
            {customers.map((customer) => (
              <s-box
                key={customer.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="inline" gap="base">
                  <s-stack direction="block" gap="base">
                    <s-paragraph>
                      <s-text>{customer.displayName}</s-text>
                    </s-paragraph>
                    {customer.email && (
                      <s-paragraph>
                        <s-text>{customer.email}</s-text>
                      </s-paragraph>
                    )}
                  </s-stack>
                  <s-button
                    onClick={() => handleSelectCustomer(customer)}
                    variant="tertiary"
                  >
                    Select
                  </s-button>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}

import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

/** Customer Account API: must match shopify.app.toml access.customer_account. */
type CustomerAccountAccess = "READ_WRITE" | "NONE";

type RiderMetafieldDefinition = {
  name: string;
  namespace: string;
  key: string;
  type: string;
  description: string;
  customerAccountAccess: CustomerAccountAccess;
};

const METAFIELD_DEFINITIONS: RiderMetafieldDefinition[] = [
  {
    name: "Skill Level",
    namespace: "rider_profile",
    key: "skill_level",
    type: "single_line_text_field",
    description:
      "MTB rider ability: beginner, intermediate, advanced, expert",
    customerAccountAccess: "READ_WRITE",
  },
  {
    name: "Riding Style",
    namespace: "rider_profile",
    key: "riding_style",
    type: "single_line_text_field",
    description:
      "Preferred MTB discipline: cross-country, trail, all-mountain, enduro, downhill",
    customerAccountAccess: "READ_WRITE",
  },
  {
    name: "Fitness Level",
    namespace: "rider_profile",
    key: "fitness_level",
    type: "single_line_text_field",
    description:
      "Self-assessed physical fitness: low, moderate, high, athletic",
    customerAccountAccess: "READ_WRITE",
  },
  {
    name: "Multi-Day Experience",
    namespace: "rider_profile",
    key: "multi_day_experience",
    type: "single_line_text_field",
    description:
      "Previous multi-day MTB trip experience: none, some, experienced",
    customerAccountAccess: "READ_WRITE",
  },
  {
    name: "Country of Residence",
    namespace: "rider_profile",
    key: "country",
    type: "single_line_text_field",
    description: "Customer country of residence for travel logistics",
    customerAccountAccess: "READ_WRITE",
  },
  {
    name: "Dietary Restrictions",
    namespace: "rider_profile",
    key: "dietary_restrictions",
    type: "single_line_text_field",
    description:
      "Meal planning: none, vegetarian, vegan, gluten-free, other",
    customerAccountAccess: "READ_WRITE",
  },
  {
    name: "Rental Interest",
    namespace: "rider_profile",
    key: "rental_interest",
    type: "single_line_text_field",
    description:
      "Bike/e-bike rental add-on interest: none, bike, e-bike, undecided",
    customerAccountAccess: "READ_WRITE",
  },
  {
    name: "Height (cm)",
    namespace: "rider_profile",
    key: "height_cm",
    type: "number_integer",
    description: "Rider height in centimeters",
    customerAccountAccess: "READ_WRITE",
  },
  {
    name: "Weight (kg)",
    namespace: "rider_profile",
    key: "weight_kg",
    type: "number_integer",
    description: "Rider weight in kilograms",
    customerAccountAccess: "READ_WRITE",
  },
  {
    name: "Notes",
    namespace: "rider_profile",
    key: "notes",
    type: "multi_line_text_field",
    description: "Customer-facing notes about the rider",
    customerAccountAccess: "READ_WRITE",
  },
  {
    name: "Internal Notes",
    namespace: "rider_profile",
    key: "internal_notes",
    type: "multi_line_text_field",
    description:
      "Staff-only internal notes about the rider (not visible to customers)",
    customerAccountAccess: "NONE",
  },
];

function definitionForCreate(def: RiderMetafieldDefinition) {
  return {
    name: def.name,
    namespace: def.namespace,
    key: def.key,
    type: def.type,
    description: def.description,
    ownerType: "CUSTOMER" as const,
    access: {
      customerAccount: def.customerAccountAccess,
    },
  };
}

function definitionForAccessUpdate(def: RiderMetafieldDefinition) {
  return {
    namespace: def.namespace,
    key: def.key,
    ownerType: "CUSTOMER" as const,
    name: def.name,
    description: def.description,
    access: {
      customerAccount: def.customerAccountAccess,
    },
  };
}

const CREATE_METAFIELD_DEFINITION = `#graphql
  mutation createMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
        name
        namespace
        key
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_METAFIELD_DEFINITION = `#graphql
  mutation updateMetafieldDefinition($definition: MetafieldDefinitionUpdateInput!) {
    metafieldDefinitionUpdate(definition: $definition) {
      updatedDefinition {
        id
        namespace
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

type GraphqlJson<T> = {
  data?: T;
  errors?: { message: string }[];
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const results: Array<{
    key: string;
    status: "created" | "updated" | "error";
    message?: string;
  }> = [];

  const isAlreadyExistsError = (userErrors: { message: string }[]) =>
    userErrors.some(
      (e) =>
        e.message.includes("already exists") ||
        e.message.includes("Key is in use"),
    );

  for (const def of METAFIELD_DEFINITIONS) {
    const createResponse = await admin.graphql(CREATE_METAFIELD_DEFINITION, {
      variables: {
        definition: definitionForCreate(def),
      },
    });

    const createJson = (await createResponse.json()) as GraphqlJson<{
      metafieldDefinitionCreate?: {
        createdDefinition?: { id: string };
        userErrors?: { message: string }[];
      };
    }>;
    const createPayload = createJson.data?.metafieldDefinitionCreate;

    if (!createPayload) {
      results.push({
        key: def.key,
        status: "error",
        message: createJson.errors?.[0]?.message ?? "Create request failed",
      });
      continue;
    }

    const { createdDefinition, userErrors: createErrors } = createPayload;

    if (createdDefinition) {
      results.push({ key: def.key, status: "created" });
      continue;
    }

    if (!isAlreadyExistsError(createErrors ?? [])) {
      results.push({
        key: def.key,
        status: "error",
        message: (createErrors ?? [])
          .map((e: { message: string }) => e.message)
          .join(", "),
      });
      continue;
    }

    const updateResponse = await admin.graphql(UPDATE_METAFIELD_DEFINITION, {
      variables: {
        definition: definitionForAccessUpdate(def),
      },
    });

    const updateJson = (await updateResponse.json()) as GraphqlJson<{
      metafieldDefinitionUpdate?: {
        updatedDefinition?: { id: string };
        userErrors?: { message: string }[];
      };
    }>;
    const updatePayload = updateJson.data?.metafieldDefinitionUpdate;

    if (!updatePayload) {
      results.push({
        key: def.key,
        status: "error",
        message: updateJson.errors?.[0]?.message ?? "Update request failed",
      });
      continue;
    }

    if (updatePayload.updatedDefinition) {
      results.push({ key: def.key, status: "updated" });
    } else {
      results.push({
        key: def.key,
        status: "error",
        message: (updatePayload.userErrors ?? [])
          .map((e: { message: string }) => e.message)
          .join(", "),
      });
    }
  }

  return { results };
};

export default function SetupMetafields() {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.results) {
      const created = fetcher.data.results.filter(
        (r) => r.status === "created",
      ).length;
      const updated = fetcher.data.results.filter(
        (r) => r.status === "updated",
      ).length;
      const errors = fetcher.data.results.filter(
        (r) => r.status === "error",
      ).length;

      if (errors > 0) {
        shopify.toast.show(`Setup complete with ${errors} error(s)`, {
          isError: true,
        });
      } else {
        shopify.toast.show(
          `Done: ${created} created, ${updated} access updated (Customer Account API)`,
        );
      }
    }
  }, [fetcher.data, shopify]);

  const runSetup = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="Setup Metafield Definitions">
      <s-section heading="Rider Profile Metafields">
        <s-paragraph>
          Registers rider profile metafield definitions and sets Customer
          Account API access (read/write for customer fields, none for internal
          notes). Safe to run again: new definitions are created; existing ones
          get access updated so the customer account extension can save.
        </s-paragraph>

        <s-box padding-block-start="base">
          <s-button
            onClick={runSetup}
            {...(isLoading ? { loading: true } : {})}
          >
          Create or update metafield definitions
          </s-button>
        </s-box>
      </s-section>

      {fetcher.data?.results && (
        <s-section heading="Results">
          <s-stack direction="block" gap="base">
            {fetcher.data.results.map((r) => (
              <s-paragraph key={r.key}>
                <s-text>{r.key}</s-text>
                {": "}
                {r.status === "created" && "Created"}
                {r.status === "updated" && "Updated (Customer Account access)"}
                {r.status === "error" && `Error — ${r.message}`}
              </s-paragraph>
            ))}
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}

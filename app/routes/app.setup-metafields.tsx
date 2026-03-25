import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  RIDER_METAFIELD_DEFINITIONS,
  type RiderMetafieldDefinitionInput,
} from "../lib/profile-fields";
import { authenticate } from "../shopify.server";

function definitionForCreate(def: RiderMetafieldDefinitionInput) {
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

function definitionForAccessUpdate(def: RiderMetafieldDefinitionInput) {
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

  for (const def of RIDER_METAFIELD_DEFINITIONS) {
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

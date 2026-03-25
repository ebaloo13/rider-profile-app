import { useEffect, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const WAIVER_NAMESPACE = "andes_freeride";

const GET_SHOP_WAIVER = `#graphql
  query ShopWaiver {
    shop {
      id
      waiverBody: metafield(namespace: "${WAIVER_NAMESPACE}", key: "waiver_body") {
        value
      }
      waiverVersion: metafield(namespace: "${WAIVER_NAMESPACE}", key: "waiver_version") {
        value
      }
    }
  }
`;

const SET_SHOP_WAIVER = `#graphql
  mutation SetShopWaiver($metafields: [MetafieldsSetInput!]!) {
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(GET_SHOP_WAIVER);
  const json = await response.json();
  const shop = json.data?.shop;

  return {
    waiverBody: shop?.waiverBody?.value ?? "",
    waiverVersion: shop?.waiverVersion?.value ?? "",
    shopId: shop?.id as string | undefined,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const waiverBody = typeof formData.get("waiverBody") === "string" ? formData.get("waiverBody") : "";
  const waiverVersion = typeof formData.get("waiverVersion") === "string" ? formData.get("waiverVersion") : "";

  const shopResponse = await admin.graphql(GET_SHOP_WAIVER);
  const shopJson = await shopResponse.json();
  const shopId = shopJson.data?.shop?.id as string | undefined;

  if (!shopId) {
    return { saved: false, errors: ["Could not load shop"] };
  }

  const metafields = [
    {
      ownerId: shopId,
      namespace: WAIVER_NAMESPACE,
      key: "waiver_body",
      type: "multi_line_text_field",
      value: String(waiverBody ?? ""),
    },
    {
      ownerId: shopId,
      namespace: WAIVER_NAMESPACE,
      key: "waiver_version",
      type: "single_line_text_field",
      value: String(waiverVersion ?? "").trim(),
    },
  ];

  const setResponse = await admin.graphql(SET_SHOP_WAIVER, {
    variables: { metafields },
  });
  const setJson = await setResponse.json();
  const userErrors = setJson.data?.metafieldsSet?.userErrors ?? [];

  if (userErrors.length > 0) {
    return {
      saved: false,
      errors: userErrors.map((e: { message: string }) => e.message),
    };
  }

  return { saved: true, errors: [] as string[] };
};

export default function WaiverSettings() {
  const { waiverBody: initialBody, waiverVersion: initialVersion } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [waiverBody, setWaiverBody] = useState(initialBody);
  const [waiverVersion, setWaiverVersion] = useState(initialVersion);

  useEffect(() => {
    setWaiverBody(initialBody);
    setWaiverVersion(initialVersion);
  }, [initialBody, initialVersion]);

  useEffect(() => {
    if (fetcher.data && "saved" in fetcher.data) {
      if (fetcher.data.saved) {
        shopify.toast.show("Waiver saved");
      } else if (fetcher.data.errors?.length) {
        shopify.toast.show(`Error: ${fetcher.data.errors.join(", ")}`, {
          isError: true,
        });
      }
    }
  }, [fetcher.data, shopify]);

  const isSaving = ["loading", "submitting"].includes(fetcher.state);

  return (
    <s-page heading="Post-order waiver">
      <s-section heading="Waiver text & version">
        <s-paragraph>
          Customers see this on the Customer Account order page after checkout. Update the
          version when you change the terms so accepted waivers stay auditable.
        </s-paragraph>
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Waiver version"
            name="waiverVersion"
            value={waiverVersion}
            onChange={(e) => setWaiverVersion(e.currentTarget.value)}
            placeholder="e.g. v1 or 2025-03"
          />
          <s-text-area
            label="Waiver body"
            name="waiverBody"
            value={waiverBody}
            onChange={(e) => setWaiverBody(e.currentTarget.value)}
            rows={12}
          />
          <s-button
            variant="primary"
            disabled={isSaving}
            onClick={() => {
              fetcher.submit(
                { waiverBody, waiverVersion },
                { method: "POST" },
              );
            }}
          >
            {isSaving ? "Saving…" : "Save waiver"}
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

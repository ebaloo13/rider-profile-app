import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export default function Index() {
  return (
    <s-page heading="Andes Freeride Rider Profile App">
      <s-section heading="Home">
        <s-paragraph>
          Welcome to the Andes Freeride Rider Profile App dashboard.
        </s-paragraph>
        <s-paragraph>
          Use this app to manage rider profile configuration and setup.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Dashboard">
        <s-paragraph>
          Rider profile tools will appear here as they are added.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

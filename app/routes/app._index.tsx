import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const QUICK_ACTIONS = [
  {
    title: "Rider Profiles",
    description:
      "Find a customer and manage rider details such as skill level, riding style, emergency contact, rental needs, and dietary restrictions.",
    href: "/app/rider-profile",
    action: "Manage rider profiles",
  },
  {
    title: "Booking Coordination",
    description:
      "Find an order and update booking status, tentative dates, confirmed dates, deposit status, balance due date, and customer-facing notes.",
    href: "/app/booking-coordination",
    action: "Coordinate bookings",
  },
  {
    title: "Waiver Settings",
    description:
      "Update the waiver text and version shown to customers on the order status page.",
    href: "/app/waiver",
    action: "Update waiver settings",
  },
  {
    title: "Metafield Setup",
    description:
      "Create or update required Shopify metafield definitions for customer profile data.",
    href: "/app/setup-metafields",
    action: "Set up metafields",
  },
];

const STAFF_WORKFLOW = [
  "Search or update rider profiles",
  "Find the customer's order",
  "Confirm trip dates",
  "Update deposit and balance status",
  "Add customer-facing notes",
  "Confirm waiver settings",
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export default function Index() {
  return (
    <s-page heading="Andes Freeride Booking Coordination">
      <s-section heading="">
        <s-paragraph>
          Manage rider profiles, trip dates, payment status, and waiver details
          for Andes Freeride bookings.
        </s-paragraph>
      </s-section>

      <s-section heading="Quick Actions">
        <s-stack direction="block" gap="base">
          {QUICK_ACTIONS.map((action) => (
            <s-box
              key={action.href}
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <s-stack direction="block" gap="base">
                <s-heading>{action.title}</s-heading>
                <s-paragraph>{action.description}</s-paragraph>
                <s-link href={action.href}>{action.action}</s-link>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Staff Workflow">
        <s-stack direction="block" gap="base">
          {STAFF_WORKFLOW.map((step, index) => (
            <s-paragraph key={step}>
              <s-text>{`${index + 1}. ${step}`}</s-text>
            </s-paragraph>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

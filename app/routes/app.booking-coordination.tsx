import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  BOOKING_COORDINATION_FIELD_TYPES,
  BOOKING_COORDINATION_KEYS,
  BOOKING_COORDINATION_NAMESPACE,
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_VALUES,
  EMPTY_BOOKING_COORDINATION,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_VALUES,
  normalizeBookingStatus,
  normalizePaymentStatus,
  type BookingCoordinationFieldKey,
  type BookingCoordinationForm,
} from "../lib/booking-coordination-fields";
import { authenticate } from "../shopify.server";

interface OrderSummary {
  id: string;
  name: string;
  createdAt: string;
  customerDisplayName: string | null;
  customerEmail: string | null;
  processedAt?: string | null;
}

function adminOrderUrl(gid: string): string {
  return `shopify:admin/orders/${gid.split("/").pop()}`;
}

function formatOrderDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

const SEARCH_DEBOUNCE_MS = 400;
const MIN_TYPEAHEAD_QUERY_LENGTH = 2;

function BookingDateInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    </div>
  );
}

function getBookingCoordinationWarnings(
  booking: BookingCoordinationForm,
): string[] {
  const warnings: string[] = [];
  const bookingStatus =
    normalizeBookingStatus(booking.booking_status) || booking.booking_status;
  const paymentStatus =
    normalizePaymentStatus(booking.payment_status) || booking.payment_status;
  const hasConfirmedStart = booking.confirmed_start_date.trim() !== "";
  const hasConfirmedEnd = booking.confirmed_end_date.trim() !== "";
  const hasConfirmedDate = hasConfirmedStart || hasConfirmedEnd;
  const hasCompleteConfirmedRange = hasConfirmedStart && hasConfirmedEnd;

  if (bookingStatus === "dates_confirmed" && !hasCompleteConfirmedRange) {
    warnings.push(
      "Booking status is Dates confirmed, but one or both confirmed dates are missing.",
    );
  }

  if (bookingStatus === "pending_dates" && hasConfirmedDate) {
    warnings.push(
      "Booking status is Pending dates, but confirmed dates are already set.",
    );
  }

  if (
    paymentStatus === "balance_due" &&
    booking.balance_due_date.trim() === ""
  ) {
    warnings.push(
      "Payment status is Balance due, but the balance due date is missing.",
    );
  }

  if (bookingStatus === "cancelled" && paymentStatus === "paid") {
    warnings.push("Booking is Cancelled, but payment status is Paid.");
  }

  if (bookingStatus === "completed" && !hasCompleteConfirmedRange) {
    warnings.push(
      "Booking status is Completed, but one or both confirmed dates are missing.",
    );
  }

  return warnings;
}

const SEARCH_ORDERS = `#graphql
  query searchOrders($query: String!) {
    orders(first: 10, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          customer {
            displayName
            email
          }
        }
      }
    }
  }
`;

const GET_ORDER_BOOKING = `#graphql
  query getOrderBookingCoordination($orderId: ID!) {
    order(id: $orderId) {
      id
      name
      createdAt
      processedAt
      customer {
        displayName
        email
      }
      bookingMf: metafields(first: 20, namespace: "${BOOKING_COORDINATION_NAMESPACE}") {
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
  mutation setBookingCoordination($metafields: [MetafieldsSetInput!]!) {
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
  mutation deleteBookingCoordinationMetafields($metafields: [MetafieldIdentifierInput!]!) {
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
      return { intent: "search", orders: [], searchPerformed: true };
    }

    const response = await admin.graphql(SEARCH_ORDERS, {
      variables: { query: query.trim() },
    });
    const json = await response.json();
    const edges = json.data?.orders?.edges ?? [];
    const orders: OrderSummary[] = edges.map(
      (edge: {
        node: {
          id: string;
          name: string;
          createdAt: string;
          customer: { displayName: string | null; email: string | null } | null;
        };
      }) => ({
        id: edge.node.id,
        name: edge.node.name,
        createdAt: edge.node.createdAt,
        customerDisplayName: edge.node.customer?.displayName ?? null,
        customerEmail: edge.node.customer?.email ?? null,
      }),
    );

    return { intent: "search", orders, searchPerformed: true };
  }

  if (intent === "load") {
    const orderId = formData.get("orderId");
    if (typeof orderId !== "string") {
      return {
        intent: "load",
        order: null,
        booking: { ...EMPTY_BOOKING_COORDINATION },
      };
    }

    const response = await admin.graphql(GET_ORDER_BOOKING, {
      variables: { orderId },
    });
    const json = await response.json();
    const orderNode = json.data?.order;
    if (!orderNode) {
      return {
        intent: "load",
        order: null,
        booking: { ...EMPTY_BOOKING_COORDINATION },
        loadError: "Order not found.",
      };
    }

    const mfEdges = orderNode.bookingMf?.edges ?? [];
    const booking: BookingCoordinationForm = { ...EMPTY_BOOKING_COORDINATION };
    for (const edge of mfEdges) {
      const { key, value } = edge.node as { key: string; value: string };
      if ((BOOKING_COORDINATION_KEYS as readonly string[]).includes(key)) {
        booking[key as BookingCoordinationFieldKey] =
          key === "booking_status"
            ? normalizeBookingStatus(value ?? "") || (value ?? "")
            : key === "payment_status"
              ? normalizePaymentStatus(value ?? "") || (value ?? "")
            : value ?? "";
      }
    }

    const order: OrderSummary & {
      processedAt: string | null;
    } = {
      id: orderNode.id,
      name: orderNode.name,
      createdAt: orderNode.createdAt,
      customerDisplayName: orderNode.customer?.displayName ?? null,
      customerEmail: orderNode.customer?.email ?? null,
      processedAt: orderNode.processedAt ?? null,
    };

    return { intent: "load", order, booking };
  }

  if (intent === "save") {
    const orderId = formData.get("orderId");
    if (typeof orderId !== "string") {
      return { intent: "save", saved: false, errors: ["Missing order"] };
    }

    const previousBookingRaw = formData.get("previousBooking");
    let previousBooking: BookingCoordinationForm = {
      ...EMPTY_BOOKING_COORDINATION,
    };
    if (typeof previousBookingRaw === "string" && previousBookingRaw !== "") {
      try {
        const parsed = JSON.parse(previousBookingRaw) as Partial<BookingCoordinationForm>;
        for (const key of BOOKING_COORDINATION_KEYS) {
          if (typeof parsed[key] === "string") {
            previousBooking[key] = parsed[key]!;
          }
        }
      } catch {
        previousBooking = { ...EMPTY_BOOKING_COORDINATION };
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

    for (const key of BOOKING_COORDINATION_KEYS) {
      const type = BOOKING_COORDINATION_FIELD_TYPES[key];
      const rawCurrent = formData.get(key);
      const currentValue = typeof rawCurrent === "string" ? rawCurrent : "";
      const previousValue = previousBooking[key] ?? "";

      if (currentValue.trim() !== "") {
        metafieldsToSet.push({
          ownerId: orderId,
          namespace: BOOKING_COORDINATION_NAMESPACE,
          key,
          type,
          value: currentValue,
        });
      } else if (previousValue.trim() !== "") {
        metafieldsToDelete.push({
          ownerId: orderId,
          namespace: BOOKING_COORDINATION_NAMESPACE,
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

  return { intent: null, orders: [], searchPerformed: false };
};

export default function BookingCoordination() {
  const fetcher = useFetcher<typeof action>();
  const loadFetcher = useFetcher<typeof action>();
  const saveFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderSummary | null>(null);
  const [booking, setBooking] = useState<BookingCoordinationForm>({
    ...EMPTY_BOOKING_COORDINATION,
  });
  const [savedBooking, setSavedBooking] =
    useState<BookingCoordinationForm | null>(null);
  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [lastSearchQuery, setLastSearchQuery] = useState("");

  const updateBookingField = (
    key: BookingCoordinationFieldKey,
    value: string,
  ) => {
    setBooking((prev) => ({ ...prev, [key]: value }));
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
    if (loadFetcher.data && "intent" in loadFetcher.data) {
      const d = loadFetcher.data;
      if (d.intent === "load" && "order" in d) {
        if ("loadError" in d && typeof d.loadError === "string") {
          shopify.toast.show(d.loadError, { isError: true });
          setSelectedOrder(null);
          setBooking({ ...EMPTY_BOOKING_COORDINATION });
          setSavedBooking(null);
          return;
        }
        if (d.order) {
          setSelectedOrder(d.order as OrderSummary);
          const b = {
            ...EMPTY_BOOKING_COORDINATION,
            ...(d.booking as Partial<BookingCoordinationForm>),
          };
          setBooking(b);
          setSavedBooking(b);
        } else {
          setSelectedOrder(null);
          setBooking({ ...EMPTY_BOOKING_COORDINATION });
          setSavedBooking(null);
        }
        setSaveErrors([]);
      }
    }
  }, [loadFetcher.data, shopify]);

  useEffect(() => {
    if (saveFetcher.data && "saved" in saveFetcher.data) {
      if (saveFetcher.data.saved) {
        shopify.toast.show("Saved");
        setSavedBooking({ ...booking });
        setSaveErrors([]);
      } else if (saveFetcher.data.errors?.length) {
        const errors = saveFetcher.data.errors as string[];
        setSaveErrors(errors);
        shopify.toast.show(`Error: ${errors.join(", ")}`, { isError: true });
      }
    }
  }, [saveFetcher.data, shopify, booking]);

  const orders = fetcher.data?.orders ?? [];
  const searchPerformed = fetcher.data?.searchPerformed ?? false;
  const trimmedSearchQuery = searchQuery.trim();
  const orderSuggestions = orders.slice(0, 5);

  const handleSearch = () => {
    const trimmed = searchQuery.trim();
    setLastSearchQuery(trimmed);
    fetcher.submit(
      { intent: "search", query: trimmed },
      { method: "POST" },
    );
  };

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < MIN_TYPEAHEAD_QUERY_LENGTH) return;
    if (trimmed === lastSearchQuery) return;

    const timer = window.setTimeout(() => {
      setLastSearchQuery(trimmed);
      fetcher.submit(
        { intent: "search", query: trimmed },
        { method: "POST" },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [fetcher, lastSearchQuery, searchQuery]);

  const handleSelectOrder = (order: OrderSummary) => {
    setSaveErrors([]);
    setSelectedOrder(order);
    loadFetcher.submit({ intent: "load", orderId: order.id }, { method: "POST" });
  };

  const handleBackToSearch = () => {
    setSelectedOrder(null);
    setSearchQuery("");
    setLastSearchQuery("");
    setBooking({ ...EMPTY_BOOKING_COORDINATION });
    setSavedBooking(null);
    setSaveErrors([]);
  };

  const handleSave = () => {
    if (!selectedOrder) return;
    saveFetcher.submit(
      {
        intent: "save",
        orderId: selectedOrder.id,
        previousBooking: JSON.stringify(savedBooking ?? EMPTY_BOOKING_COORDINATION),
        ...booking,
      },
      { method: "POST" },
    );
  };

  const adminWarnings = selectedOrder
    ? getBookingCoordinationWarnings(booking)
    : [];

  if (selectedOrder) {
    return (
      <s-page heading="Booking coordination">
        <s-button
          slot="primary-action"
          onClick={handleSave}
          {...(isSaving ? { loading: true } : {})}
        >
          Save
        </s-button>

        <s-section heading="Order you are editing">
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base">
              <s-heading>{selectedOrder.name}</s-heading>
              <s-paragraph>
                <s-text>
                  {"Created: "}
                  {formatOrderDate(selectedOrder.createdAt)}
                </s-text>
              </s-paragraph>
              {selectedOrder.processedAt != null &&
                selectedOrder.processedAt !== "" && (
                  <s-paragraph>
                    <s-text>
                      {"Processed: "}
                      {formatOrderDate(selectedOrder.processedAt)}
                    </s-text>
                  </s-paragraph>
                )}
              <s-paragraph>
                <s-text>
                  {"Customer: "}
                  {selectedOrder.customerDisplayName ?? "—"}
                </s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text color="subdued">{selectedOrder.id}</s-text>
              </s-paragraph>
            </s-stack>
          </s-box>
          <s-box padding-block-start="base">
            <s-stack direction="inline" gap="base">
              <s-button onClick={handleBackToSearch} variant="tertiary">
                Back to order search
              </s-button>
              <s-link href={adminOrderUrl(selectedOrder.id)} target="_blank">
                Open order in Shopify Admin
              </s-link>
            </s-stack>
          </s-box>
        </s-section>

        {isLoading && (
          <s-section heading="">
            <s-paragraph>Loading booking coordination…</s-paragraph>
          </s-section>
        )}

        {!isLoading && (
          <s-section heading="Booking coordination fields">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text color="subdued">
                  Customers see these values on this order’s status page (read-only
                  for customers).
                </s-text>
              </s-paragraph>
              {adminWarnings.length > 0 && (
                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="subdued"
                >
                  <s-stack direction="block" gap="small">
                    <s-heading>Review before saving</s-heading>
                    {adminWarnings.map((warning) => (
                      <s-paragraph key={warning}>
                        <s-text>{warning}</s-text>
                      </s-paragraph>
                    ))}
                  </s-stack>
                </s-box>
              )}
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-heading>Booking status</s-heading>
                  <s-select
                    label="Booking status"
                    value={booking.booking_status}
                    onChange={(e) =>
                      updateBookingField(
                        "booking_status",
                        e.currentTarget.value ?? "",
                      )
                    }
                  >
                    <s-option value="">— Select —</s-option>
                    {BOOKING_STATUS_VALUES.map((v) => (
                      <s-option key={v} value={v}>
                        {BOOKING_STATUS_LABELS[v]}
                      </s-option>
                    ))}
                  </s-select>
                  <s-text-field
                    label="Customer booking message"
                    value={booking.booking_status_note}
                    onChange={(e) =>
                      updateBookingField(
                        "booking_status_note",
                        e.currentTarget.value ?? "",
                      )
                    }
                  />
                  <s-paragraph>
                    <s-text color="subdued">
                      Visible to the customer on their order status page.
                    </s-text>
                  </s-paragraph>
                </s-stack>
              </s-box>
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-heading>Trip dates</s-heading>
                  <BookingDateInput
                    id="tentative-start-date"
                    label="Tentative start date"
                    value={booking.tentative_start_date}
                    onChange={(value) =>
                      updateBookingField("tentative_start_date", value)
                    }
                  />
                  <BookingDateInput
                    id="tentative-end-date"
                    label="Tentative end date"
                    value={booking.tentative_end_date}
                    onChange={(value) =>
                      updateBookingField("tentative_end_date", value)
                    }
                  />
                  <BookingDateInput
                    id="confirmed-start-date"
                    label="Confirmed start date"
                    value={booking.confirmed_start_date}
                    onChange={(value) =>
                      updateBookingField("confirmed_start_date", value)
                    }
                  />
                  <BookingDateInput
                    id="confirmed-end-date"
                    label="Confirmed end date"
                    value={booking.confirmed_end_date}
                    onChange={(value) =>
                      updateBookingField("confirmed_end_date", value)
                    }
                  />
                </s-stack>
              </s-box>
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-heading>Payment coordination</s-heading>
                  <s-select
                    label="Payment status"
                    value={booking.payment_status}
                    onChange={(e) =>
                      updateBookingField(
                        "payment_status",
                        e.currentTarget.value ?? "",
                      )
                    }
                  >
                    <s-option value="">— Select —</s-option>
                    {PAYMENT_STATUS_VALUES.map((v) => (
                      <s-option key={v} value={v}>
                        {PAYMENT_STATUS_LABELS[v]}
                      </s-option>
                    ))}
                  </s-select>
                  <BookingDateInput
                    id="balance-due-date"
                    label="Balance due date"
                    value={booking.balance_due_date}
                    onChange={(value) =>
                      updateBookingField("balance_due_date", value)
                    }
                  />
                  <s-text-area
                    label="Customer payment note"
                    value={booking.payment_note}
                    onChange={(e) =>
                      updateBookingField(
                        "payment_note",
                        e.currentTarget.value ?? "",
                      )
                    }
                    rows={3}
                  />
                  <s-paragraph>
                    <s-text color="subdued">
                      Visible to the customer on their order status page.
                    </s-text>
                  </s-paragraph>
                </s-stack>
              </s-box>
            </s-stack>
          </s-section>
        )}

        {saveErrors.length > 0 && (
          <s-section heading="Save errors">
            <s-stack direction="block" gap="base">
              {saveErrors.map((err, i) => (
                <s-paragraph key={i}>
                  <s-text>{err}</s-text>
                </s-paragraph>
              ))}
            </s-stack>
          </s-section>
        )}
      </s-page>
    );
  }

  return (
    <s-page heading="Booking coordination">
      <s-section heading="Find an order">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text color="subdued">
              Search by order name (e.g. #1001), customer email, or keywords. Then
              select an order to edit booking coordination for that order only.
            </s-text>
          </s-paragraph>
          <s-text-field
            label="Search orders"
            value={searchQuery}
            onInput={(e) => setSearchQuery(e.currentTarget.value ?? "")}
            details="Type at least 2 characters to see order suggestions."
          />
          {trimmedSearchQuery.length < MIN_TYPEAHEAD_QUERY_LENGTH &&
            !isSearching && (
              <s-paragraph>
                <s-text color="subdued">
                  Type at least 2 characters to see order suggestions.
                </s-text>
              </s-paragraph>
            )}
          {isSearching && (
            <s-paragraph>
              <s-text color="subdued">Searching orders…</s-text>
            </s-paragraph>
          )}
          {searchPerformed && orders.length === 0 && !isSearching && (
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-paragraph>No orders found. Try a different search.</s-paragraph>
            </s-box>
          )}
          {orderSuggestions.length > 0 && (
            <s-box padding="small" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="small">
                {orderSuggestions.map((order) => (
                  <s-clickable
                    key={order.id}
                    padding="small"
                    borderWidth="base"
                    borderRadius="small"
                    onClick={() => handleSelectOrder(order)}
                  >
                    <s-stack direction="block" gap="small">
                      <s-text>{order.name}</s-text>
                      <s-text color="subdued">
                        {formatOrderDate(order.createdAt)}
                        {order.customerDisplayName
                          ? ` · ${order.customerDisplayName}`
                          : ""}
                      </s-text>
                      {order.customerEmail && (
                        <s-text color="subdued">{order.customerEmail}</s-text>
                      )}
                    </s-stack>
                  </s-clickable>
                ))}
              </s-stack>
            </s-box>
          )}
          <s-button
            onClick={handleSearch}
            {...(isSearching ? { loading: true } : {})}
          >
            Search
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

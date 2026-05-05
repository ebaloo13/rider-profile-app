import '@shopify/ui-extensions';

//@ts-expect-error generated Shopify extension module declaration
declare module './src/OrderStatusBlock.jsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.order-status.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

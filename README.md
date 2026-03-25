# Andes Freeride — Connected Rider Profile & Post-Order Waiver

## Overview

A **connected Shopify app** for Andes Freeride: staff configure and edit trip-related customer data in the **embedded admin**, while customers interact with the same data through **Customer Account UI extensions** on the **profile** and **order status** surfaces. All persisted state lives in **Shopify metafields** on Customer, Shop, and Order—no separate waiver backend.

The app started from the Shopify **React Router** app template and was extended with declarative metafield definitions, Admin GraphQL, and a single Customer Account UI extension package with **two extension targets**.

## What the app does

- **Rider profile:** Staff search customers and manage structured rider fields (skills, logistics, measurements, notes). Customers view and edit allowed fields on their **Customer Account profile** page.
- **Post-order waiver:** Staff set **waiver text and a version label** per store. After purchase, customers who open **their order** in Customer Accounts can **read the waiver and submit acceptance**; acceptance is stored on **that order**.

This is an **acknowledgment flow** (checkbox + timestamp + version snapshot), not a legal e-signature product.

## Core surfaces / components

| Surface | Role |
|--------|------|
| **Embedded admin app** | Authentication, navigation, staff workflows |
| **Admin — Rider Profile** (`/app/rider-profile`) | Search customers; load/save `rider_profile` customer metafields via Admin API |
| **Admin — Waiver** (`/app/waiver`) | Edit shop-level waiver body and version; save via Admin API `metafieldsSet` on Shop |
| **Admin — Setup Metafields** (`/app/setup-metafields`) | Ensures customer metafield definitions have correct Customer Account access |
| **Customer Account — Profile block** | `customer-account.profile.block.render` — reads/writes rider profile via Customer Account API |
| **Customer Account — Order status block** | `customer-account.order-status.block.render` — loads shop waiver + order acceptance; writes order metafields on submit |

The order-status target is **dynamic**: in dev/production, the block may need to be **placed** in the checkout / customer account editor for your theme, like other order-status UI extensions.

## Data model / metafields

Definitions are declared in **`shopify.app.toml`** (deploy / `shopify app dev` syncs them to the store).

### Customer — namespace `rider_profile`

| Keys | Access |
|------|--------|
| `skill_level`, `riding_style`, `fitness_level`, `multi_day_experience`, `country`, `dietary_restrictions`, `rental_interest`, `height_cm`, `weight_kg`, `notes` | Customer Account **read/write** (via extension + definitions) |
| `internal_notes` | **Admin only** (not exposed to the Customer Account extension) |

### Shop — namespace `andes_freeride`

| Key | Purpose |
|-----|---------|
| `waiver_body` | Multi-line waiver text |
| `waiver_version` | Short version label (e.g. `v1`) when terms change |

Customers can **read** these via the Customer Account API in the order-status flow; staff edit values through the **Waiver** admin route (and definitions allow merchant access in admin).

### Order — namespace `andes_freeride`

| Key | Purpose |
|-----|---------|
| `waiver_accepted_at` | `date_time` — set when the customer accepts |
| `waiver_accepted_version` | Snapshot of `waiver_version` at acceptance |

**Pending vs completed:** if `waiver_accepted_at` is empty, the order is treated as not yet accepted in the UI.

## Key workflows

1. **Staff — rider profile:** Open Rider Profile → search customer → load metafields → save. Uses **Admin GraphQL** `metafieldsSet` / delete as needed.
2. **Customer — rider profile:** Open **Account → Profile** → extension loads metafields → customer edits allowed fields → **Customer Account API** `metafieldsSet` on Customer.
3. **Staff — waiver:** Open **Waiver** → set body + version → save to **Shop** metafields.
4. **Customer — waiver:** Place an order → open **Customer Account → Order** (order status) → read waiver → check acknowledgment → submit → **Customer Account API** `metafieldsSet` on **Order**.

If customer-side writes fail with access errors, run **Setup Metafields** again so definitions match `shopify.app.toml`.

## Tech stack

- **Shopify:** Embedded app, Admin GraphQL, Customer Account API, declarative metafields, Customer Account UI Extensions (Preact, `@shopify/ui-extensions` 2026.1)
- **App runtime:** React Router 7, React 18, TypeScript (admin routes), Vite
- **Session / DB:** Prisma + SQLite (sessions; not used as source of truth for rider or waiver data)

## Local development

From the **`rider-profile-app`** directory (where `shopify.app.toml` lives):

```sh
shopify app dev
```

Requirements: Shopify CLI, Partner app linked to this project, dev store with **new Customer Accounts** / extensibility as appropriate for Customer Account extensions.

**Scopes** (see `shopify.app.toml`) include Admin customer + order access and Customer Account customer + order access. Declarative **order** metafields require **`read_orders` / `write_orders`** for dev preview to start. After scope changes, **reinstall or approve** the app on the store.

Tunneling can be flaky; validating extensions in a **deployed** preview or Customer Account customizer is often more reliable than local tunnel alone.

## Deployment

```sh
shopify app deploy
```

Push updated `shopify.app.toml` and extension config so metafield definitions and scopes stay aligned across environments.

## Challenge framing (Intermediate-level connected app)

This project fits an **Intermediate** “connected experience” narrative because it:

- Uses **multiple surfaces**: embedded admin + **two** Customer Account extension targets (profile + order status).
- Shares **one app installation** with **native Shopify storage** across **three resource types** (Customer, Shop, Order).
- Separates concerns clearly: **staff** configure data (profiles + waiver text); **customers** complete actions in **Account** UI tied to **metafield definitions** and **OAuth scopes**.

It demonstrates real integration patterns (declarative custom data, Admin vs Customer Account APIs, extension `metafieldsSet`) without relying on a bespoke server database for core rider or waiver state.

## Future improvements

- **Waiver:** Optional PDF / file upload for the document; email or admin reminder if order is unpaid and waiver pending (out of current scope).
- **Rider profile:** Operational admin view (e.g. readiness flags), prompts for missing high-value fields, or Flow-friendly signals.
- **Hardening:** Automated tests, stricter validation on waiver version/body, and clearer handling when shop waiver version changes after an order was already accepted.

# Andes Freeride — Connected Rider Profile and Post-Order Waiver App

## Overview

A **connected Shopify app** built for Andes Freeride. Staff manage trip-related customer data and store-specific waiver settings in the **embedded admin app**, while customers interact with connected data flows through **Customer Account UI extensions** on the **profile** and **order status** surfaces. All core state is stored in **Shopify-native metafields** on Customer, Shop, and Order.

The project started from the Shopify **React Router** app template and evolved into a multi-surface Shopify app using declarative metafield definitions, Admin GraphQL, and a single Customer Account UI extension package with **two extension targets**.

## What the app does

- **Rider profile:** Staff search customers and manage structured rider fields such as skill level, fitness, logistics, measurements, and notes. Customers can view and edit the allowed rider profile fields on their **Customer Account profile** page.
- **Post-order waiver:** Staff configure **waiver text and a version label** per store. After purchase, customers who open **their order** in Customer Accounts can **read the waiver and submit acceptance**. Acceptance is stored on **that specific order**.

This is an **acknowledgment flow** using a checkbox, timestamp, and version snapshot, not a legal e-signature product.

## Core surfaces and components

| Surface | Role |
|--------|------|
| **Embedded admin app** | Authentication, navigation, and staff workflows |
| **Admin — Rider Profile** (`/app/rider-profile`) | Search customers and load/save `rider_profile` customer metafields through the Admin API |
| **Admin — Waiver** (`/app/waiver`) | Edit shop-level waiver body and version, then save via Admin API `metafieldsSet` on Shop |
| **Admin — Setup Metafields** (`/app/setup-metafields`) | Reconciles rider profile customer metafield definitions and Customer Account access |
| **Customer Account — Profile block** | `customer-account.profile.block.render` — reads and writes rider profile data through the Customer Account API |
| **Customer Account — Order status block** | `customer-account.order-status.block.render` — loads shop waiver configuration and order acceptance state, then writes order metafields on submit |

The order-status target is **dynamic**. In development or production, the block may need to be **placed** in the checkout or customer account editor, similar to other order-status UI extensions.

## Data model and metafields

Definitions are declared in **`shopify.app.toml`**, and `shopify app deploy` or `shopify app dev` syncs them to the store.

### Customer — namespace `rider_profile`

| Keys | Access |
|------|--------|
| `skill_level`, `riding_style`, `fitness_level`, `multi_day_experience`, `country`, `dietary_restrictions`, `rental_interest`, `height_cm`, `weight_kg`, `notes` | Customer Account **read/write** through the extension and metafield definitions |
| `internal_notes` | **Admin only** |

### Shop — namespace `andes_freeride`

| Key | Purpose |
|-----|---------|
| `waiver_body` | Multi-line waiver text |
| `waiver_version` | Short version label such as `v1` when terms change |

Customers can **read** these values in the order-status flow through the Customer Account API, while staff edit them through the **Waiver** admin route.

### Order — namespace `andes_freeride`

| Key | Purpose |
|-----|---------|
| `waiver_accepted_at` | `date_time` value set when the customer accepts |
| `waiver_accepted_version` | Snapshot of `waiver_version` at the time of acceptance |

**Pending vs completed:** if `waiver_accepted_at` is empty, the order is treated as not yet accepted in the UI.

## Key workflows

1. **Staff — rider profile:** Open Rider Profile, search for a customer, load metafields, and save updates. This uses **Admin GraphQL** `metafieldsSet` and delete operations as needed.
2. **Customer — rider profile:** Open **Account → Profile**, load rider profile metafields in the extension, edit allowed fields, and save through **Customer Account API** `metafieldsSet` on Customer.
3. **Staff — waiver:** Open **Waiver**, set body and version, and save to **Shop** metafields.
4. **Customer — waiver:** Place an order, open **Customer Account → Order**, read the waiver, check acknowledgment, and submit. The extension writes acceptance through **Customer Account API** `metafieldsSet` on **Order**.

If customer-side writes fail because of metafield access mismatches, run **Setup Metafields** again so the definitions match `shopify.app.toml`.

## Tech stack

- **Shopify:** Embedded app, Admin GraphQL, Customer Account API, declarative metafields, Customer Account UI Extensions (Preact, `@shopify/ui-extensions` 2026.1)
- **App runtime:** React Router 7, React 18, TypeScript for admin routes, Vite
- **Session and DB:** Prisma + SQLite for sessions only, not as the source of truth for rider or waiver data

## Local development

From the **`rider-profile-app`** directory, where `shopify.app.toml` lives:

```sh
shopify app dev
```

Requirements:
- Shopify CLI
- Partner app linked to this project
- Development store with **new Customer Accounts** and the required extensibility enabled

**Scopes** in `shopify.app.toml` include Admin customer and order access plus Customer Account customer and order access. Declarative **order** metafields require **`read_orders`** and **`write_orders`** for dev preview to start correctly. After scope changes, reinstall or approve the app again on the store.

Tunnel-based development can be flaky. Validating extensions in a **deployed preview** or in the Customer Account customizer is often more reliable than relying only on a local tunnel.

## Deployment

```sh
shopify app deploy
```

Deploying pushes updated `shopify.app.toml` and extension configuration so scopes, targets, and metafield definitions stay aligned across environments.

## Challenge framing

This project fits an **Intermediate-level connected Shopify app** challenge because it:

- Uses **multiple surfaces**: one embedded admin app and **two** Customer Account extension targets (profile and order status)
- Shares one app installation with **Shopify-native storage** across **three resource types**: Customer, Shop, and Order
- Separates responsibilities clearly: staff configure and manage data in admin, while customers complete actions in Customer Account UI backed by metafield definitions and OAuth scopes

It demonstrates real Shopify integration patterns such as declarative custom data, Admin API versus Customer Account API usage, and extension-side `metafieldsSet`, without relying on a custom backend database for core rider or waiver state.

## Future improvements

- **Waiver:** Optional PDF or file upload support for the waiver document
- **Rider profile:** More operational admin views, such as readiness flags or prompts for missing high-value fields
- **Hardening:** Automated tests, stricter validation on waiver version and body, and clearer handling when a shop waiver version changes after an order was already accepted
# Andes Freeride — Connected Rider Profile, Booking Coordination & Post-Order Waiver

## Overview

A **connected Shopify app** for Andes Freeride: staff manage rider data, **per-order booking coordination**, and store-level waiver copy in the **embedded admin**, while customers use **Customer Account UI extensions** on the **profile** and **order status** pages. All persisted state lives in **Shopify metafields** on Customer, Shop, and Order—no separate backend for those flows.

The project started from the Shopify **React Router** app template and uses declarative metafield definitions, Admin GraphQL, and **two Customer Account UI extension packages** with **three extension targets** total (profile block, order-status waiver, order-status booking coordination).

## What the app does

- **Rider profile:** Staff search customers and manage structured rider fields (skills, logistics, measurements, notes). Customers view and edit allowed fields on their **Customer Account profile** page.
- **Booking coordination:** Staff set **booking status**, **booking status note**, and **payment status** **per order** via **Booking coordination** in the embedded app. Customers see a read-only **Booking coordination** block on **that order’s** status page (order metafields, not customer metafields).
- **Post-order waiver:** Staff set **waiver text and a version label** per store. After purchase, customers who open **their order** in Customer Accounts can **read the waiver and submit acceptance**; acceptance is stored on **that order**.

The waiver flow is an **acknowledgment** (checkbox + timestamp + version snapshot), not a legal e-signature product.

## Core surfaces / components

| Surface | Role |
|--------|------|
| **Embedded admin app** | Authentication, navigation, staff workflows |
| **Admin — Rider Profile** (`/app/rider-profile`) | Search customers; load/save `rider_profile` **customer** metafields via Admin API |
| **Admin — Booking coordination** (`/app/booking-coordination`) | Search orders; load/save `andes_freeride` **booking** metafields on the **selected order** (`booking_status`, `booking_status_note`, `payment_status`) |
| **Admin — Waiver** (`/app/waiver`) | Edit shop-level waiver body and version; save via Admin API `metafieldsSet` on Shop |
| **Admin — Setup Metafields** (`/app/setup-metafields`) | Ensures rider profile **customer** metafield definitions have correct Customer Account access |
| **Customer Account — Profile** (`rider-profile-display`) | `customer-account.profile.block.render` — reads/writes rider profile via Customer Account API |
| **Customer Account — Order status — Waiver** (`rider-profile-display`) | `customer-account.order-status.block.render` — shop waiver + order acceptance; writes order metafields on submit |
| **Customer Account — Order status — Booking** (`booking-status`) | `customer-account.order-status.block.render` — reads **current order** booking coordination metafields (read-only for customers) |

Order-status targets are **dynamic**: in dev/production, each block must be **placed** in the Customer Account editor for your theme. You may have **multiple** `order-status.block` app blocks (e.g. booking + waiver); avoid placing the **same** app block twice in different regions or you will see duplicate UI.

**Shared app code:** [`app/lib/booking-coordination-fields.ts`](app/lib/booking-coordination-fields.ts) holds booking field keys, labels, types, and the Customer Account GraphQL shape for order-scoped reads (namespace `$app:andes_freeride` in API calls, aligned with [`shopify.app.toml`](shopify.app.toml) `order.metafields.andes_freeride.*`).

## Data model / metafields

Definitions are declared in **`shopify.app.toml`** (`shopify app dev` / deploy syncs them to the store).

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

Customers can **read** these via the Customer Account API in the order-status waiver flow; staff edit through the **Waiver** admin route.

### Order — namespace `andes_freeride`

| Key | Purpose |
|-----|---------|
| `waiver_accepted_at` | `date_time` — set when the customer accepts the waiver |
| `waiver_accepted_version` | Snapshot of `waiver_version` at acceptance |
| `booking_status` | Booking coordination status (e.g. pending, confirmed) — **staff write**, customer **read** |
| `booking_status_note` | Short customer-visible note — **staff write**, customer **read** |
| `payment_status` | Simple payment line for the order — **staff write**, customer **read** |

**Waiver pending vs completed:** if `waiver_accepted_at` is empty, the waiver UI treats the order as not yet accepted.

**Booking coordination:** values are **per order**. Legacy data that lived on **customer** metafields for these keys is not migrated automatically.

## Key workflows

1. **Staff — rider profile:** Open **Rider Profile** → search customer → load/save `rider_profile` metafields (Admin GraphQL `metafieldsSet` / delete).
2. **Staff — booking coordination:** Open **Booking coordination** → search orders → select the order (identity shown on screen) → edit fields → save to **that order’s** metafields.
3. **Customer — rider profile:** **Account → Profile** → extension loads/saves allowed fields via Customer Account API on **Customer**.
4. **Staff — waiver:** Open **Waiver** → set body + version → save to **Shop** metafields.
5. **Customer — waiver:** Open **Account → Order** → read waiver → acknowledge → submit → Customer Account API `metafieldsSet` on **Order**.
6. **Customer — booking coordination:** Same order page shows read-only booking status, note, and payment status from **order** metafields.

If customer-side writes fail with access errors, run **Setup Metafields** again so **customer** rider definitions match `shopify.app.toml`. Order/shop booking and waiver definitions are declarative in TOML; deploy after changing them.

## Tech stack

- **Shopify:** Embedded app, Admin GraphQL, Customer Account API, declarative metafields, Customer Account UI Extensions (Preact, `@shopify/ui-extensions` 2026.1)
- **App runtime:** React Router 7, React 18, TypeScript (admin routes), Vite
- **Session / DB:** Prisma + SQLite (sessions only; not used as source of truth for rider, booking, or waiver data)

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

- Uses **multiple surfaces**: embedded admin + **three** Customer Account extension targets (profile + two order-status blocks via two extension packages).
- Shares **one app installation** with **native Shopify storage** across **three resource types** (Customer, Shop, Order).
- Separates concerns: **staff** configure rider profile, **per-order** booking coordination, and waiver text; **customers** complete actions in **Account** UI tied to **metafield definitions** and **OAuth scopes**.

It demonstrates declarative custom data, Admin vs Customer Account APIs, and extension `metafieldsSet` without a bespoke server database for core rider, booking, or waiver state.

## Future improvements

- **Admin:** Optional **Admin UI extension** on the order details page for booking coordination (today: embedded **Booking coordination** route).
- **Waiver:** Optional PDF / file upload; email or admin reminder if waiver pending (out of current scope).
- **Rider profile:** Operational admin view (readiness flags), prompts for missing fields, or Flow-friendly signals.
- **Hardening:** Automated tests, stricter validation on waiver version/body, and clearer handling when shop waiver version changes after acceptance.

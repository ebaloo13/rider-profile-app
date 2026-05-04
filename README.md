# Andes Freeride — Connected Rider Profile, Booking Coordination & Post-Order Waiver

## Overview

A **connected Shopify app** for Andes Freeride: staff manage rider data, **per-order booking coordination**, and store-level waiver copy in the **embedded admin**, while customers use **Customer Account UI extensions** on the **profile** and **order status** pages. All persisted state lives in **Shopify metafields** on Customer, Shop, and Order—no separate backend for those flows.

The project started from the Shopify **React Router** app template and uses declarative metafield definitions, Admin GraphQL, and **two Customer Account UI extension packages** with **three extension targets** total (profile block, order-status waiver, order-status booking coordination).

## Product direction

This app started as a **Rider Profile** app. It has evolved into a private **booking coordination** app for the Andes Freeride Shopify store, with rider profile data now acting as one module inside a broader post-purchase coordination workflow.

The future working product name may be **Booking Bridge**, but the codebase, app config, extension handles, UI labels, and metafield namespaces are **not being renamed yet**. For now, this remains an **Andes Freeride private app** until the booking flow is validated in production.

Current product modules:

- **Customer/Rider Profile:** Customer-level rider details used for qualification, logistics, fit, meals, and staff notes.
- **Booking Coordination:** Order-level booking status, payment status, and customer-visible coordination notes.
- **Waiver Management:** Shop-level waiver copy/version plus order-level waiver acceptance records.

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
| **Admin — Booking coordination** (`/app/booking-coordination`) | Search orders; load/save `andes_freeride` **booking** metafields on the **selected order** (`booking_status`, `booking_status_note`, `payment_status`, booking dates) |
| **Admin — Waiver** (`/app/waiver`) | Edit shop-level waiver body and version; save via Admin API `metafieldsSet` on Shop |
| **Admin — Setup Metafields** (`/app/setup-metafields`) | Ensures rider profile **customer** metafield definitions have correct Customer Account access |
| **Customer Account — Profile** (`rider-profile-display`) | `customer-account.profile.block.render` — reads/writes rider profile via Customer Account API |
| **Customer Account — Order status — Waiver** (`rider-profile-display`) | `customer-account.order-status.block.render` — shop waiver + order acceptance; writes order metafields on submit |
| **Customer Account — Order status — Booking** (`booking-status`) | `customer-account.order-status.block.render` — reads **current order** booking coordination metafields (read-only for customers) |

Order-status targets are **dynamic**: in dev/production, each block must be **placed** in the Customer Account editor for your theme. You may have **multiple** `order-status.block` app blocks (e.g. booking + waiver); avoid placing the **same** app block twice in different regions or you will see duplicate UI.

**Profile page layout:** The Rider Profile app block uses **`default_placement = "PROFILE2"`** in [`extensions/rider-profile-display/shopify.extension.toml`](extensions/rider-profile-display/shopify.extension.toml) so it defaults **below** Shopify’s built-in Profile content (name, email, addresses). **`default_placement` only applies when the block is first added**; if your store already had the block higher on the page, open **Customize → Customer accounts → Profile** and **move “Rider Profile Display” below** the default profile blocks, or remove and re-add the block after deploying the updated TOML.

**Shared app code:** [`app/lib/booking-coordination-fields.ts`](app/lib/booking-coordination-fields.ts) holds booking field keys, labels, types, and the Customer Account GraphQL shape for order-scoped reads (namespace `$app:andes_freeride` in API calls, aligned with [`shopify.app.toml`](shopify.app.toml) `order.metafields.andes_freeride.*`).

## Data model / metafields

Definitions are declared in **`shopify.app.toml`** (`shopify app dev` / deploy syncs them to the store).

### Customer — namespace `rider_profile`

| Keys | Access |
|------|--------|
| `skill_level`, `riding_style`, `fitness_level`, `multi_day_experience`, `emergency_contact_name`, `country`, `dietary_restrictions`, `rental_interest`, `height_cm`, `weight_kg`, `notes` | Customer Account **read/write** (via extension + definitions) |
| `internal_notes` | **Admin only** (not exposed to the Customer Account extension) |

These fields describe the rider/customer and are intentionally stored on the **Customer**:

- `skill_level`
- `riding_style`
- `fitness_level`
- `multi_day_experience`
- `emergency_contact_name`
- `country`
- `dietary_restrictions`
- `rental_interest`
- `height_cm`
- `weight_kg`
- `notes`
- `internal_notes`

### Shop — app-owned namespace `$app:andes_freeride`

| Key | Purpose |
|-----|---------|
| `waiver_body` | Multi-line waiver text |
| `waiver_version` | Short version label (e.g. `v1`) when terms change |

Customers can **read** these via the Customer Account API in the order-status waiver flow; staff edit through the **Waiver** admin route.

### Order — app-owned namespace `$app:andes_freeride`

| Key | Purpose |
|-----|---------|
| `waiver_accepted_at` | `date_time` — set when the customer accepts the waiver |
| `waiver_accepted_version` | Snapshot of `waiver_version` at acceptance |
| `booking_status` | Booking coordination lifecycle status — **staff write**, customer **read** |
| `booking_status_note` | Short customer-visible note — **staff write**, customer **read** |
| `payment_status` | Simple payment line for the order — **staff write**, customer **read** |
| `balance_due_date` | Date when the remaining booking balance is due — **staff write**, customer **read** |
| `payment_note` | Customer-visible payment coordination note — **staff write**, customer **read** |
| `tentative_start_date` | Tentative booking start date — **staff write**, customer **read** |
| `tentative_end_date` | Tentative booking end date — **staff write**, customer **read** |
| `confirmed_start_date` | Confirmed booking start date — **staff write**, customer **read** |
| `confirmed_end_date` | Confirmed booking end date — **staff write**, customer **read** |

**Waiver pending vs completed:** if `waiver_accepted_at` is empty, the waiver UI treats the order as not yet accepted.

**Booking coordination:** values are **per order**. Booking-specific information belongs to the order because status, dates, payment state, and coordination notes can differ across bookings for the same customer. Customer profile data can remain customer-level because it describes the rider; booking coordination data should remain order-level, not customer-level. Legacy data that lived on **customer** metafields for these keys is not migrated automatically.

Current order booking fields:

- `booking_status`
- `booking_status_note`
- `payment_status`
- `balance_due_date`
- `payment_note`
- `tentative_start_date`
- `tentative_end_date`
- `confirmed_start_date`
- `confirmed_end_date`

Current `booking_status` values:

- `pending_dates`
- `dates_requested`
- `dates_under_review`
- `dates_confirmed`
- `changes_requested`
- `cancelled`
- `completed`

Booking status compatibility:

| Legacy value | Current lifecycle value |
|--------------|------------------------|
| `pending` | `pending_dates` |
| `under_review` | `dates_under_review` |
| `confirmed` | `dates_confirmed` |
| `needs_attention` | `changes_requested` |

The admin select now saves the current lifecycle values. Existing order metafields that still contain legacy values are normalized when loaded in the admin UI and when displayed to customers, so they do not require a bulk migration.

Payment status compatibility:

Current `payment_status` values:

- `deposit_pending`
- `deposit_paid`
- `balance_due`
- `paid`
- `action_required`
- `refunded`

| Legacy value | Current deposit-aware value |
|--------------|----------------------------|
| `pending` | `deposit_pending` |
| `authorized` | `deposit_paid` |
| `paid` | `paid` |
| `action_required` | `action_required` |

The admin payment select now saves the current deposit-aware values. Existing order metafields that still contain legacy values are normalized when loaded in the admin UI and when displayed to customers, so they do not require a bulk migration. `payment_status` remains order-level and separate from `booking_status`. `balance_due_date` and `payment_note` are implemented as simple order-level payment coordination fields. Amount fields such as `deposit_amount` and `balance_due_amount` are not implemented yet.

Current waiver fields:

- Shop-level: `waiver_body`, `waiver_version`
- Order-level: `waiver_accepted_at`, `waiver_accepted_version`

## Key workflows

1. **Staff — rider profile:** Open **Rider Profile** → search customer → load/save `rider_profile` metafields (Admin GraphQL `metafieldsSet` / delete).
2. **Staff — booking coordination:** Open **Booking coordination** → search orders → select the order (identity shown on screen) → edit grouped booking status, trip date, and payment coordination fields → save to **that order’s** metafields.
3. **Customer — rider profile:** **Account → Profile** → extension loads/saves allowed fields via Customer Account API on **Customer**.
4. **Staff — waiver:** Open **Waiver** → set body + version → save to **Shop** metafields.
5. **Customer — waiver:** Open **Account → Order** → read waiver → acknowledge → submit → Customer Account API `metafieldsSet` on **Order**.
6. **Customer — booking coordination:** Same order page shows read-only booking status, trip dates, customer-visible notes, and payment status from **order** metafields.

The admin booking coordination form is grouped by **Booking status**, **Trip dates**, and **Payment coordination**. Customer-visible notes are labeled as customer messages, and lightweight consistency warnings are shown for combinations that may need review. These warnings are informational only and do not block saving.

If customer-side writes fail with access errors, run **Setup Metafields** again so **customer** rider definitions match `shopify.app.toml`. Order/shop booking and waiver definitions are declarative in TOML; deploy after changing them.

## Tech stack

- **Shopify:** Embedded app, Admin GraphQL, Customer Account API, declarative metafields, Customer Account UI Extensions (Preact, `@shopify/ui-extensions` 2026.1)
- **App runtime:** React Router 7, React 18, TypeScript (admin routes), Vite
- **Session / DB:** Prisma + PostgreSQL for Shopify sessions only; rider, booking, and waiver data remain in Shopify metafields

## Local development

From the **`rider-profile-app`** directory (where `shopify.app.toml` lives):

```sh
shopify app dev
```

Requirements: Shopify CLI, Partner app linked to this project, dev store with **new Customer Accounts** / extensibility as appropriate for Customer Account extensions.

PostgreSQL is required for Prisma session storage. SQLite was used only for local prototype development and is not the production path. Set `DATABASE_URL` before running Prisma commands or the app server.

Local PostgreSQL example:

```sh
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/booking_bridge_dev?schema=public"
```

Production `DATABASE_URL` should come from a managed PostgreSQL provider such as Render Postgres or Railway Postgres.

**Scopes** (see `shopify.app.toml`) include Admin customer + order access and Customer Account customer + order access. Declarative **order** metafields require **`read_orders` / `write_orders`** for dev preview to start. After scope changes, **reinstall or approve** the app on the store.

Tunneling can be flaky; validating extensions in a **deployed** preview or Customer Account customizer is often more reliable than local tunnel alone.

## Deployment

```sh
shopify app deploy
```

Push updated `shopify.app.toml` and extension config so metafield definitions and scopes stay aligned across environments.

Production hosting must provide PostgreSQL-backed session storage. The deployment should run Prisma setup before starting the app:

```sh
npm run setup
npm run start
```

`npm run setup` runs `prisma generate && prisma migrate deploy`, so the production `DATABASE_URL` must be present before that command runs.

Deployment blockers before production:

- Replace the placeholder `application_url = "https://example.com"` in `shopify.app.toml`.
- Replace the placeholder auth redirect URL `https://example.com/api/auth` in `shopify.app.toml`.
- Select production hosting for the embedded app.
- Provision managed PostgreSQL for Prisma session storage, for example Render Postgres or Railway Postgres.
- Customer Account extensions currently target `2026-01`; upgrading them should be a deliberate compatibility pass, not an incidental deployment change.

## Challenge framing (Intermediate-level connected app)

This project fits an **Intermediate** “connected experience” narrative because it:

- Uses **multiple surfaces**: embedded admin + **three** Customer Account extension targets (profile + two order-status blocks via two extension packages).
- Shares **one app installation** with **native Shopify storage** across **three resource types** (Customer, Shop, Order).
- Separates concerns: **staff** configure rider profile, **per-order** booking coordination, and waiver text; **customers** complete actions in **Account** UI tied to **metafield definitions** and **OAuth scopes**.

It demonstrates declarative custom data, Admin vs Customer Account APIs, and extension `metafieldsSet` without a bespoke server database for core rider, booking, or waiver state.

## Future improvements

- **Booking workflow:** Improved booking status workflow beyond the current `booking_status`, `booking_status_note`, and `payment_status` fields.
- **Payment workflow:** Andes Freeride uses deposits to secure a spot, with the remaining balance due before the trip start date. A future `payment_status` model should support values such as `deposit_pending`, `deposit_paid`, `balance_due`, `paid`, `action_required`, and `refunded`.
- **Productization:** Eventual app rename / productization, possibly under the working name **Booking Bridge**, after the Andes Freeride flow is validated.
- **Deployment:** Production deployment once URL, hosting, scopes, extension placement, and database/session storage are confirmed.
- **Database:** Confirm production managed PostgreSQL, backups, and migration timing for durable session storage.
- **Admin:** Optional **Admin UI extension** on the order details page for booking coordination (today: embedded **Booking coordination** route).
- **Waiver:** Optional PDF / file upload; email or admin reminder if waiver pending (out of current scope).
- **Rider profile:** Operational admin view (readiness flags), prompts for missing fields, or Flow-friendly signals.
- **Hardening:** Automated tests, stricter validation on waiver version/body, and clearer handling when shop waiver version changes after acceptance.

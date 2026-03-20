# Rider Profile App

A Shopify app that lets staff manage rider profile data from the admin side and allows customers to view and update their own rider profile from the Customer Account profile page.

This project was built on top of the Shopify React Router app template and extended into a working end to end rider profile system using customer metafields, a Customer Account UI Extension, and an embedded admin workflow.

## Overview

The app supports two connected experiences:

### Admin app
Staff can search for a customer and manage rider profile data from the embedded admin app.

### Customer account
Customers can open their account profile page and:
- view their rider profile
- edit their own profile information
- save changes directly to customer metafields

## Features

### Customer-facing
- Editable rider profile in Shopify Customer Accounts
- Profile completion indicator
- Rider summary card
- Improved empty state and UX copy
- Inline edit flow
- Validation for height and weight
- Customer-facing notes field

### Staff-facing
- Admin route for editing rider profile metafields
- Separate `internal_notes` field for staff only
- Full visibility into customer profile fields
- Metafield setup/update flow for customer account access

## Metafields model

Namespace: `rider_profile`

### Customer-facing fields
- `skill_level`
- `riding_style`
- `fitness_level`
- `multi_day_experience`
- `country`
- `dietary_restrictions`
- `rental_interest`
- `height_cm`
- `weight_kg`
- `notes`

These fields are configured with Customer Account access so they can be read and written by the customer through the Customer Account UI Extension.

### Staff-only field
- `internal_notes`

This field is admin-only and is not exposed in the Customer Account UI.

## How it works

### Admin flow
The embedded admin app writes customer metafields using the Shopify Admin API.

### Customer flow
The Customer Account UI Extension:
- reads rider profile metafields through the Customer Account API
- renders them on the customer Profile page
- allows customers to update editable fields
- saves updates using `metafieldsSet`

## Technical highlights

- Shopify React Router app
- Customer Account UI Extension
- Customer metafields with declarative definitions
- Customer Account API read/write flow
- Admin GraphQL for staff-side profile editing
- Metafield definition repair/update flow to ensure correct Customer Account access
- Inline UX improvements for profile completion and rider summary

## Important implementation note

Customer-side metafield writes only work when the metafield definitions on the store explicitly allow Customer Account write access.

This project includes a setup flow that creates or updates metafield definitions so customer-facing rider profile fields have the correct Customer Account access, while `internal_notes` remains staff-only.

If customer-side saving fails with an access error, run the metafield setup flow again from the embedded app.

## Project structure

- `app/routes/app.rider-profile.tsx` — admin rider profile management
- `app/routes/app.setup-metafields.tsx` — creates/updates metafield definitions
- `extensions/rider-profile-display/` — Customer Account UI Extension
- `shopify.app.toml` — app scopes and declarative metafield definitions

## Local development

Run the app locally:

```sh
shopify app dev
```

## Deploy

Deploy the app with:

```sh
shopify app deploy
```

## Notes

During development, local preview via Shopify CLI tunnel may be unstable. In this project, deployed testing through the Customer Account customizer was the most reliable way to validate the extension end to end.

## Future improvements

Planned next iterations include:
- personalized rider recommendations
- missing info prompts
- admin operational summary
- rider readiness logic

## Tech stack

- Shopify
- React Router
- TypeScript
- Preact
- Prisma
- Shopify CLI

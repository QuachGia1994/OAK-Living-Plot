# Phase 1 RevenueCat entitlement boundary

> updated 2026-08-17 · 0.0.0

## Authority
RevenueCat is the store/subscription provider boundary; D1 is the application authorization source of truth after provider verification. Mobile `CustomerInfo`, paywall return values, public RevenueCat SDK keys, and client booleans such as `isPlus` are never quota authority.

Living Plot uses the internal `users.id` as RevenueCat App User ID. Email and Clerk subject are not purchase identities.

## Server configuration
Worker-only values:
- `REVENUECAT_SECRET_API_KEY` — RevenueCat server REST key;
- `REVENUECAT_PLUS_ENTITLEMENT_ID` — entitlement identifier, currently `plus`;
- `REVENUECAT_WEBHOOK_AUTHORIZATION` — exact custom Authorization value expected on the webhook;
- `REVENUECAT_WEBHOOK_SIGNING_SECRET` — HMAC signing secret.

Mobile receives only public SDK keys. `EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY` may be used for RevenueCat Test Store validation and takes precedence over platform keys; otherwise mobile uses `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` or `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`.

## Webhook trust flow
`POST /v1/webhooks/revenuecat` is public only in the routing sense; it is not unauthenticated data authority.

1. Read the exact raw request bytes.
2. Require the configured `Authorization` header.
3. Verify the timestamped HMAC-SHA256 signature over `<timestamp>.<raw-body>` and reject requests outside the five-minute tolerance.
4. Parse and validate the minimal RevenueCat event only after signature verification.
5. Deduplicate by RevenueCat `event.id` before any repeat provider lookup.
6. For a new event, call RevenueCat `GET /v1/subscribers/{app_user_id}` with the Worker-only secret key.
7. Derive current Free/Plus state from the provider subscriber snapshot, including expiration/grace period.
8. Append a minimal event audit row and update the materialized entitlement only when the provider snapshot is not older than the current one.

Provider or persistence failure returns a non-2xx result so the delivery may be retried. Raw webhook bodies, receipts, RevenueCat secret keys, and store credentials are not persisted.

## D1 model
Migration `0006_revenuecat_entitlements.sql` adds:

### `revenuecat_events`
Append-only audit keyed by provider event ID. Stores only normalized fields needed for idempotency/debugging: internal user, event type/environment/timestamp, entitlement IDs, product/transaction identifiers, provider snapshot time, and resulting tier.

### `user_entitlements`
One materialized row per internal user containing effective tier, optional Plus expiration, provider snapshot timestamp, source event, and sync time.

Older provider snapshots cannot overwrite newer state. Independently, the read path fails closed to effective Free after a finite `plus_expires_at` passes even if an expiration webhook is delayed. A null Plus expiration represents a provider-reported non-expiring entitlement.

## Quota integration
`GET /v1/entitlement` exposes only backend-materialized Free/Plus state to an authenticated owner.

Voice generation now resolves the user's tier from D1 immediately before quota reservation. Free remains 1 fresh voice/day; verified Plus receives 10. The client cannot elevate quota by sending a tier flag.

Text generation orchestration is not yet wired to mobile HTTP, so its eventual request path must use the same repository instead of trusting the client.

## Mobile boundary
The Expo client installs `react-native-purchases`, `react-native-purchases-ui`, and `expo-dev-client`.

`RevenueCatPurchaseGateway`:
- requires an explicit internal App User ID before configuring RevenueCat;
- never intentionally configures an anonymous purchase identity;
- selects the public Test Store key when configured, otherwise only the current iOS/Android public SDK key;
- presents the configured Plus paywall;
- performs user-initiated restore.

`BillingCoordinator` always refreshes `/v1/entitlement` with the authenticated bearer token after purchase/paywall or restore. The local RevenueCat result can explain UI progress but cannot unlock Plus by itself.

Authenticated runtime wiring now supplies the internal `users.id` plus a fresh-token provider to `BillingSessionContext`. Preview/signed-out mode still refuses to invent an anonymous purchase identity. After any paywall/restore action, `BillingCoordinator` refreshes backend entitlement before the UI treats Plus as active.

## Test Store and external integration gate
The mobile configuration can select RevenueCat Test Store for purchase-flow validation without shipping an App Store/Google Play product. This proves only the client configuration boundary; it does not make local RevenueCat state authoritative.

Still unverified without external provider configuration:
- RevenueCat dashboard offering/entitlement setup and webhook convergence;
- real Test Store purchase against this project;
- App Store Connect / Google Play product creation or native sandbox purchase;
- renewal, cancellation, billing issue, refund, transfer, and restore convergence against provider infrastructure;
- public deployment or store submission.

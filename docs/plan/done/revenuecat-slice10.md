# RevenueCat entitlement implementation slice 10

Status: COMPLETE — STOP GATE PASSED

## Scope
Implement RevenueCat webhook/provider verification, event idempotency, D1 Free/Plus entitlement materialization, backend quota-tier authority, and Expo purchase/paywall/restore boundary. Preserve uncommitted Slice 8–9 changes. Do not create real store products, run sandbox purchases, provision/deploy remote resources, add analytics/cost telemetry, or commit/push.

## Completed
- Migration `0006_revenuecat_entitlements.sql` with append-only `revenuecat_events` and materialized `user_entitlements`.
- Exact webhook Authorization verification plus timestamped HMAC-SHA256 over raw request bytes.
- Five-minute replay tolerance and validated minimal event parsing after signature verification.
- RevenueCat event-ID idempotency before duplicate provider lookup.
- RevenueCat v1 subscriber provider client using Worker-only server API key.
- Current entitlement derivation from provider expiration/grace state instead of event-type inference.
- Monotonic D1 updates by provider `request_date_ms`; stale subscriber snapshots cannot overwrite newer materialized state.
- Finite expired Plus rows fail closed to effective Free on backend read using server time.
- Protected `GET /v1/entitlement` and public-but-verified `POST /v1/webhooks/revenuecat`.
- Voice generation now resolves Free/Plus from backend D1 before quota reservation; no client tier flag is accepted.
- Expo `react-native-purchases` + `react-native-purchases-ui` + `expo-dev-client` integration boundary.
- Explicit internal `users.id` RevenueCat App User ID; no intentional anonymous configuration in the Living Plot gateway.
- RevenueCat paywall, user-initiated restore, backend entitlement refresh, and explicit Refresh access path.
- Local Plus screen refuses real store actions until an authenticated mobile billing session supplies internal user ID + bearer token.
- Public platform RevenueCat SDK key/API URL example env; Worker secrets remain separate.
- Test migration dependencies were narrowed so the Cloudflare Vitest shared D1 environment does not serialize redundant full migration chains and hit hook timeouts.

## Verification evidence
- Focused root lint/typecheck: PASS for API and mobile.
- Focused API Vitest: 22 files, 106/106 tests PASS.
- Focused mobile lint/typecheck: PASS; mobile Vitest: 3 files, 13/13 tests PASS.
- First Expo Android export with RevenueCat native packages: PASS — 1,276 modules, ~4.2 MB Hermes bundle.
- Fresh local D1 migrations: PASS.
  - `0001_initial.sql`: 13 commands.
  - `0002_episode_publication.sql`: 15 commands.
  - `0003_choice_commit.sql`: 8 commands.
  - `0004_quota_ledger.sql`: 9 commands.
  - `0005_tts_audio.sql`: 4 commands.
  - `0006_revenuecat_entitlements.sql`: 5 commands.
- Secret/static credential scan: PASS; no private-key payload, Google access token, RevenueCat server secret assignment, or raw service-account JSON private key found in repo.
- `git diff --check`: PASS.
- Final clean `npm ci`: PASS — 910 packages from lockfile.
- Final clean root lint: PASS for API and mobile.
- Final clean root typecheck: PASS for API and mobile.
- Final clean API Vitest: 22 files, 106/106 tests PASS.
- Final clean mobile Vitest: 3 files, 13/13 tests PASS.
- Final clean Expo Android export: PASS — 1,276 modules, ~4.2 MB Hermes bundle.
- Final clean Wrangler deploy dry-run: PASS — upload 409.86 KiB / gzip 81.48 KiB; Queue/D1/R2 bindings recognized; no deployment performed.

## Guarantees established
- A mobile/store result cannot directly grant Plus; D1 materialized entitlement is backend authority.
- Webhook trust requires both configured Authorization and timestamped HMAC over exact raw bytes.
- Duplicate provider event IDs converge without duplicate event history or repeat provider refresh.
- New deliveries refresh canonical subscriber state from RevenueCat instead of assuming entitlement from event type alone.
- An older provider snapshot cannot overwrite newer entitlement state.
- A finite expired Plus entitlement fails closed to effective Free using server time even before another webhook arrives.
- Voice quota uses only backend-resolved Free/Plus tier.
- RevenueCat server key, webhook signing secret, and webhook Authorization secret remain backend-only.
- Mobile SDK receives only platform public keys and requires an explicit internal App User ID before Living Plot opens a real paywall/restore flow.
- Paywall/restore results are followed by a backend entitlement refresh; local CustomerInfo is not quota authority.

## Deferred real integration
RevenueCat dashboard products/offerings, App Store Connect/Google Play products, real device development-build purchase, renewal/cancel/billing issue/refund/restore webhook convergence, Clerk mobile billing-session wiring, remote D1/Worker/Queue/R2 provisioning, public deployment, and store submission remain later integration/release work.

## STOP
Reached with PASS result. Slice 10 is complete. Do not begin analytics/cost telemetry, real store integration, remote provisioning/deployment, or commit/push in this run.

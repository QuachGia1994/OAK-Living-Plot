# RevenueCat Test Store slice 18

Status: COMPLETE WITH PROVIDER CONFIGURATION BLOCKED

## Scope
Made the existing RevenueCat mobile boundary test-store-ready without app-store submission and without weakening backend entitlement authority.

## Implemented
- Added `EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY`.
- Test Store key takes precedence over platform keys in development/native builds.
- Plus screen reports Test Store, platform-store, or unconfigured mode.
- Billing still requires internal Living Plot user ID and refreshes `/v1/entitlement` after purchase/restore.

## Verification
Pure config tests cover Test Store precedence, platform fallback, and explicit unconfigured state. Existing billing coordinator tests continue to prove backend refresh and no anonymous identity.

## External blocker
No real RevenueCat project Test Store transaction/webhook convergence was possible because provider configuration/secrets were absent. No App Store/Google Play account or submission is required by this slice.

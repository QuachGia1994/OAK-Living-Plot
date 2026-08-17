# Live beta slices 31–40

Status: source implementation complete; external live-provider proof remains blocked until development credentials/resources exist.

## Scope
Slices 31–40 move the Phase 1 native beta from source-complete preview toward a measurable live beta without opening the excluded video/PWA/marketplace scope.

## Delivered
- Slice 31: closed the account-erasure sign-out edge case and shipped it separately before the new batch.
- Slices 32–35: added one secret-safe live smoke runner for API health, authenticated story convergence, Queue/TTS/R2 private audio, and RevenueCat-to-D1 Plus convergence. The runner passes only on real external behavior.
- Slice 36: saved `uiLocale` now drives English/Vietnamese core native UI while each plot keeps its own canonical story locale.
- Slice 37: first-run users receive a daily-spark setup with all three creation choices prefilled; generation still requires an explicit action and custom creation remains available.
- Slice 38: narrative regression scoring adds protagonist anchoring, locale alignment, and durable scene progression to the existing continuity/thread/branch/consequence/repetition dimensions.
- Slice 39: observational product telemetry adds a bounded episode-depth bucket, and a D1 aggregate query exposes activation/depth/D1/D7 counts without returning identifiers.
- Slice 40: CI quality now includes local D1 migrations and a Cloudflare development dry-run, with separate iOS production-export and Android native-APK gates.

## External gate
At implementation time there is no local `apps/api/.dev.vars`, no `apps/mobile/.env`, and no GitHub Actions secrets/variables for the live stack. Real Clerk, remote Cloudflare development resources, Gemini, Google TTS, and RevenueCat Test Store/provider convergence therefore remain BLOCKED, not simulated or claimed as passing.

## Verification contract
Final closure requires the exact final pushed SHA to pass GitHub quality, iOS static export, and Android APK jobs. Real-provider smoke stays a separate external gate and is run with the commands documented in `docs/ref/live-development.md` once development credentials/resources are available.

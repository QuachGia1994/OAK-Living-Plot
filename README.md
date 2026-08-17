# Living Plot

Living Plot is a mobile interactive-drama app where each short episode ends with three choices and later episodes reflect the user's committed decisions.

## Repository

- `apps/mobile` — Expo/React Native client.
- `apps/api` — Cloudflare Worker API.
- `docs` — product and architecture source of truth.

## Requirements

- Node.js 24.x.
- npm 11.16.0.

## Setup

```bash
npm install
npm run check
```

Start the mobile app. When `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_LIVING_PLOT_API_URL` are set, the core loop uses Clerk-authenticated live story APIs and resolves the internal Living Plot user through `/v1/me`. If either public live configuration value is intentionally absent, the deterministic preview client remains available for local UI work.

```bash
npm --workspace @living-plot/mobile run start
```

Copy `apps/mobile/.env.example` to a local `.env` and set the Clerk publishable key plus API URL for authenticated live stories. RevenueCat-capable native development can use `EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY` for Test Store validation, otherwise the public platform SDK keys; store purchase behavior requires a native development/release build and is not proven by Expo Go.

Start the local Worker. Copy `apps/api/.dev.vars.example` to an untracked `.dev.vars` file when exercising protected/provider routes. Clerk and Gemini values are required for their live paths; Google TTS additionally requires the service-account email and PKCS#8 private key. RevenueCat backend sync requires the server REST key, Plus entitlement identifier, webhook Authorization value, and HMAC signing secret. Automated provider tests inject boundaries and do not require live credentials. Run `npm run live:check:preview` to see which live values are absent without printing their contents; `npm run live:check` is the strict credential-readiness gate. Non-production remote setup is documented in `docs/ref/live-development.md`.

The Worker also binds the `living_plot_events` Analytics Engine dataset. Story-generation telemetry contains provider/model/outcome, provider-reported token counts, pricing revision, and integer nano-USD cost only. Product funnel telemetry records only newly canonical bounded events such as plot creation, committed choice, next episode, archive/restore, and fresh voice request. Neither telemetry family contains story text or user identifiers, and neither is an authorization or quota source.

```bash
npm --workspace @living-plot/api run dev
```

Apply Phase 1 D1 migrations to the local database:

```bash
npm --workspace @living-plot/api run db:migrate:local
```

Focused narrative evaluation remains available with `npm --workspace @living-plot/api run eval:narrative`.

The native client also exposes a reversible Story Library and a read-only Story So Far timeline. Authenticated GETs use bounded timeout/abort behavior and may retry once; POST mutations are never automatically retried.

## GitHub Android preview build

Every push (and manual `workflow_dispatch`) runs the quality gate and, after it passes, builds an installable standalone Android arm64 preview APK. Download the `living-plot-android-preview-arm64` artifact from the successful GitHub Actions run. The release variant embeds the JavaScript bundle so it can open without a Metro development server, and the APK is retained for 14 days.

The artifact is preview-safe by default. To make a GitHub-built APK use live services, define repository Actions variables named `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_LIVING_PLOT_API_URL`; purchase-flow builds can additionally use `EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY` or the iOS/Android RevenueCat public keys. Server credentials remain backend-only and must never be stored in `EXPO_PUBLIC_*` variables.

Phase 1 scope and architecture are indexed in [`docs/index.md`](docs/index.md).

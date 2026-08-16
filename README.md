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

Copy `apps/mobile/.env.example` to a local `.env` and set the Clerk publishable key plus API URL for authenticated live stories. RevenueCat-capable native development also needs the public platform SDK keys and an Expo development build; store purchase behavior is not proven by Expo Go.

Start the local Worker. Copy `apps/api/.dev.vars.example` to an untracked `.dev.vars` file when exercising protected/provider routes. Clerk and Gemini values are required for their live paths; Google TTS additionally requires the service-account email and PKCS#8 private key. RevenueCat backend sync requires the server REST key, Plus entitlement identifier, webhook Authorization value, and HMAC signing secret. Automated provider tests inject boundaries and do not require live credentials.

The Worker also binds the `living_plot_events` Analytics Engine dataset. Story-generation telemetry contains provider/model/outcome, provider-reported token counts, pricing revision, and integer nano-USD cost only; it contains no story text or user identifier and is never an authorization or quota source.

```bash
npm --workspace @living-plot/api run dev
```

Apply Phase 1 D1 migrations to the local database:

```bash
npm --workspace @living-plot/api run db:migrate:local
```

Focused narrative evaluation remains available with `npm --workspace @living-plot/api run eval:narrative`.

## GitHub Android preview build

Every push (and manual `workflow_dispatch`) runs the quality gate and, after it passes, builds an installable Android debug APK. Download the `living-plot-android-debug` artifact from the successful GitHub Actions run. The APK is retained for 14 days.

The artifact is preview-safe by default. To make a GitHub-built APK use live services, define repository Actions variables named `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_LIVING_PLOT_API_URL`, `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`, and `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`. Server credentials remain backend-only and must never be stored in `EXPO_PUBLIC_*` variables.

Phase 1 scope and architecture are indexed in [`docs/index.md`](docs/index.md).

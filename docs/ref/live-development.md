# Live development setup

> updated 2026-08-19 · 0.0.0

Living Plot keeps preview-safe local/UI work separate from provider-backed development. Do not put Worker secrets in `EXPO_PUBLIC_*` values.

## Readiness check

From the repository root:

```bash
npm run live:check:preview
npm run live:check
```

`live:check:preview` reports missing live values without failing for absence. It still fails if a value is present but malformed or still a placeholder. `live:check` additionally fails when required provider values are missing. The checker reports names/status only and never prints secret values.

## Mobile development values

Copy `apps/mobile/.env.example` to the ignored `apps/mobile/.env`.

Required for authenticated live stories:
- `EXPO_PUBLIC_LIVING_PLOT_API_URL`
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`

Optional purchase configuration:
- `EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY` for RevenueCat Test Store validation;
- otherwise the iOS/Android platform RevenueCat public SDK keys.

When the Test Store key is present, it intentionally takes priority over platform keys in development builds.

## Worker development secrets

Copy `apps/api/.dev.vars.example` to ignored `apps/api/.dev.vars` for local work. Clerk, Gemini, and RevenueCat server values remain Worker-only. Gemini scene generation and Gemini TTS share the same server-side `GEMINI_API_KEY`; narration no longer requires Google Cloud service-account credentials.

## Cloudflare named development environment

`apps/api/wrangler.jsonc` defines the non-production `development` environment as `living-plot-api-dev`, with separate development D1, R2, and Queue/DLQ bindings. Analytics Engine is observational and optional; the development Worker runs with a no-op telemetry sink when that account service is not enabled.

As of 2026-08-19, D1 `living-plot-dev`, `living-plot-tts-dev`, `living-plot-tts-dlq-dev`, and private R2 bucket `living-plot-audio-dev` are provisioned; remote D1 migrations `0001`–`0009` are current. The development Worker uses `GEMINI_API_KEY` for both scene generation and Gemini TTS. The R2 bucket has no public application URL and remains owner-served only through authenticated Worker media routes.

Useful commands:

```bash
npm --workspace @living-plot/api run dev:remote
npm --workspace @living-plot/api run db:migrate:development
```

Do not run a remote migration before the development resources have actually been provisioned and selected. Production resources are not part of this setup path.

## GitHub Android live build

The Android artifact remains preview-safe when repository variables are absent. A live-development artifact can use these repository Actions variables:
- `EXPO_PUBLIC_LIVING_PLOT_API_URL`
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY` or platform RevenueCat public SDK keys.

Backend credentials belong in the Worker secret store, not GitHub public Expo variables.

## Live beta smoke gates

After the development Worker and Clerk session exist, set `LIVING_PLOT_SMOKE_API_URL` and a short-lived `LIVING_PLOT_SMOKE_BEARER_TOKEN` in the local shell. The smoke runner never prints the token.

```bash
npm run live:smoke:health
npm run live:smoke:core
npm run live:smoke:voice
npm run live:smoke:billing
npm run live:smoke:all
```

`core` proves authenticated Drama creation → choice commit → next Scene → resume and archives the smoke Drama afterward. `voice` requires either the Scene created by `all` or `LIVING_PLOT_SMOKE_SCENE_ID`; it calls the canonical `/v1/scenes/:sceneId/voice` + `/v1/media/:assetId` boundary, waits for Queue/TTS/R2 to reach `ready`, and then fetches private audio bytes. `billing` is intentionally strict: it passes only when `/v1/entitlement` is actually Plus with a provider sync timestamp, so a local RevenueCat SDK action without webhook/D1 convergence is not accepted as proof.

These commands are external gates, not CI substitutes. Missing live values/resources are reported as blocked rather than replaced by fixtures.

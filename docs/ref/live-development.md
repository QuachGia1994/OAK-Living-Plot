# Live development setup

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

Copy `apps/api/.dev.vars.example` to ignored `apps/api/.dev.vars` for local work. Clerk, Gemini, Google TTS, and RevenueCat server values remain Worker-only.

## Cloudflare named development environment

`apps/api/wrangler.jsonc` defines the non-production `development` environment as `living-plot-api-dev`, with separate development D1, R2, Queue/DLQ, and Analytics Engine bindings.

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

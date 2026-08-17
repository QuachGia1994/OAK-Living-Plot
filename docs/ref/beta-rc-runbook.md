# Closed Beta RC runbook

> updated 2026-08-17 · Stage 50

## RC definition
A Living Plot Closed Beta Release Candidate is source-complete and distributable when the exact pushed SHA passes the Node 24 quality job, local D1 migrations, Cloudflare development dry-run, iOS production bundle export, and standalone Android arm64 APK build/upload.

This definition does not fabricate live-provider proof. A preview-safe RC may be build-green while the authenticated live beta remains blocked by missing provider credentials or Cloudflare services.

## Current development infrastructure
Provisioned in the non-production Cloudflare account:

- D1 `living-plot-dev` — ID `bbd5a628-cf93-4ffa-a459-2368025b4067`, APAC; migrations `0001` through `0008` applied remotely.
- Queue `living-plot-tts-dev`.
- DLQ `living-plot-tts-dlq-dev`.
- Development Analytics Engine binding remains `living_plot_events_dev` in Wrangler configuration.
- Intended private R2 bucket is `living-plot-audio-dev`.

R2 is currently BLOCKED before bucket creation: Wrangler returns Cloudflare API code `10042` and requires R2 to be enabled in the Cloudflare Dashboard. Do not deploy the development Worker or claim private-audio E2E until that service is enabled and the bucket is created.

## Current provider gate
`npm run live:check:preview` currently reports `0/12` required live values ready. No local `apps/api/.dev.vars`, no local `apps/mobile/.env`, and no repository Actions variables/secrets are configured for the live stack.

Required before authenticated provider E2E:

- Clerk publishable key, JWT verification key, and authorized party.
- Gemini API key.
- Google service-account email/private key.
- RevenueCat server key, Plus entitlement ID, webhook authorization/signing secret.
- Mobile HTTPS development API URL and Clerk publishable key.
- Optional RevenueCat Test Store/public SDK key for purchase flow proof.

Worker secrets must stay Worker-only. Never copy provider/server secrets into `EXPO_PUBLIC_*` values or GitHub public variables.

## Live bring-up sequence
After R2 and credentials are available:

1. Create `living-plot-audio-dev` and confirm D1/Queue/DLQ names still match `apps/api/wrangler.jsonc`.
2. Put Worker secrets into the development Worker secret store; put only public mobile values in ignored `apps/mobile/.env` / repository variables.
3. Re-run `npm run live:check` and require 12/12 required values ready.
4. Re-run `npm --workspace @living-plot/api run db:migrate:development` and require no pending migrations.
5. Deploy only the `development` Worker environment.
6. Run `npm run live:smoke:health`.
7. Obtain a short-lived Clerk bearer token and run `npm run live:smoke:core`.
8. Run `npm run live:smoke:voice` only after Queue/TTS/R2 are live.
9. Configure RevenueCat Test Store + webhook and run `npm run live:smoke:billing`; Plus is proven only when D1 entitlement converges with a provider sync timestamp.
10. Run `npm run live:smoke:all` as the final live-provider gate.

## Abuse, cost, and failure guardrails
- Text and fresh-voice generation are protected by backend D1 daily quotas; client tier flags never authorize extra spend.
- Protected JSON requests reject declared bodies above 16,384 characters before authentication/database work; JSON parsing also refuses oversized payload text.
- Mobile safe GETs may retry once; POST mutations never retry automatically.
- Gemini requests have a 12-second timeout and only one controlled retry for structurally invalid output.
- RevenueCat subscriber lookup has an 8-second timeout and fails closed to no entitlement change on provider failure.
- TTS runs asynchronously through Queue/DLQ with bounded retries; text episodes remain canonical if voice fails.
- R2 audio remains private and account deletion is R2-first/fail-closed.
- API JSON responses are `no-store`, `nosniff`, and `no-referrer`.
- Analytics Engine remains observational and contains no user/story identifiers or text.

## Retention / beta signal
`npm run retention:summary:dev` executes the aggregate query against remote development D1 and displays:

- activated users;
- users who committed a choice;
- D1 and D7 returners;
- day-7-plus returners;
- users reaching episode 4+ and episode 8+.

The query returns counts only. The newly provisioned database currently reports zero for every metric, as expected before live beta traffic.

## RC verification
Before tagging a candidate:

```bash
git diff --check
npm run live:check:preview
npm run lint
npm run typecheck
npm run test
npm --workspace @living-plot/api run db:migrate:local
npx wrangler deploy --dry-run --env development --config apps/api/wrangler.jsonc
```

Then commit/push and require GitHub Actions success on the exact SHA for `quality`, `ios-static`, and `android-apk`. The Android job must upload `living-plot-android-preview-arm64`.

No production Worker deployment, App Store submission, or Google Play submission belongs to this gate.

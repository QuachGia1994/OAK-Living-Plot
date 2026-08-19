# Closed Beta RC runbook

> updated 2026-08-17 · Stage 50

## RC definition
A Living Plot Closed Beta Release Candidate is source-complete and distributable when the exact pushed SHA passes the Node 24 quality job, local D1 migrations, Cloudflare development dry-run, iOS production bundle export, and standalone Android arm64 APK build/upload.

This definition does not fabricate live-provider proof. A preview-safe RC may be build-green while the authenticated live beta remains blocked by missing provider credentials or Cloudflare services.

## Current development infrastructure
Provisioned in the non-production Cloudflare account:

- D1 `living-plot-dev` — ID `bbd5a628-cf93-4ffa-a459-2368025b4067`, APAC; migrations `0001` through `0009` applied remotely, including retryable quota reservations.
- Queue `living-plot-tts-dev`.
- DLQ `living-plot-tts-dlq-dev`.
- Development Analytics Engine is optional observational telemetry; when the account service is not enabled, the development Worker omits the binding and uses no-op telemetry without affecting canonical Drama/voice behavior.
- Private R2 bucket `living-plot-audio-dev` is provisioned and must remain non-public.

R2 account enablement is complete. Private-audio proof still requires a deployed development Worker plus authenticated Queue → Gemini TTS → R2 → media playback convergence; bucket existence alone is not E2E proof.

## Current provider gate
As verified on 2026-08-19, the development Worker secret store contains Clerk verification configuration and `GEMINI_API_KEY`; GitHub already contains the mobile Clerk publishable variable. The strict repository readiness checker intentionally still includes RevenueCat and mobile API configuration, while Google service-account credentials are no longer required after the narration provider migration.

Required before authenticated private-voice E2E:

- Clerk publishable key, JWT verification key, and authorized party on the Worker.
- Gemini API key on the Worker for both scene generation and Gemini TTS.
- Mobile HTTPS development API URL and Clerk publishable key.

RevenueCat server values and mobile store keys remain separate billing/store gates and do not block proving one Free fresh narration.

Worker secrets must stay Worker-only. Never copy provider/server secrets into `EXPO_PUBLIC_*` values or GitHub public variables.

## Live bring-up sequence
Current live bring-up sequence:

1. Confirm `living-plot-audio-dev`, D1, Queue, and DLQ still match `apps/api/wrangler.jsonc`.
2. Keep Worker-only Clerk/Gemini credentials in the development Worker secret store; put only public mobile values in ignored `apps/mobile/.env` / repository variables.
3. Re-run remote D1 migrations and require no pending migrations.
4. Deploy only the `development` Worker environment and verify `/health`.
5. Set the public mobile API URL to the deployed development Worker HTTPS URL.
6. Obtain a short-lived Clerk bearer token and run authenticated core smoke.
7. Run private voice smoke and require Queue → Gemini TTS → private R2 → ready media → authenticated bytes.
8. Treat RevenueCat Test Store/webhook/Plus purchase proof as a separate billing closure gate.

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

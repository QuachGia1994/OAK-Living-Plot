# Living Plot Stages 41–50 — Closed Beta RC

> completed 2026-08-17

## Stage 41 — Huashu redesign closeout
The Cinematic Editorial redesign was reviewed, documented, committed, pushed, and isolated as its own baseline commit `6722d5b` before later RC work. Quality and iOS static CI passed on that SHA; Android standalone build remained independently running while later local RC work proceeded on a clean post-commit working tree.

## Stage 42 — Native layout hardening
- Shared `Screen` now uses keyboard avoidance/interactive keyboard dismissal and a bounded 760-point content measure for larger devices.
- Small-screen flex wrapping was added where long VI/EN labels could collide: quota metrics, library actions, diagnostics, plot metadata, and story decision headings.
- The mobile presentation remains native Expo/React Native and preserves safe-area behavior.

## Stage 43 — Navigation / information architecture 2.0
- Story top navigation now exposes one primary destination (`My stories`) instead of three competing horizontal actions.
- Episode Share and History actions live beside story metadata and can wrap safely.
- Plus now uses the same top-bar/back pattern as the rest of the product instead of a trailing back control.

## Stage 44 — Cinematic motion
The existing reduced-motion-aware `MotionReveal` primitive now carries episode, choice, and consequence transitions. No canonical mutation is tied to animation, and operating-system Reduce Motion still bypasses entrance movement.

## Stage 45 — Onboarding 2.0
First-run Home makes the deterministic daily spark the primary CTA. The user can review the prefilled premise/mood/character before explicitly generating Episode 1, and custom creation remains available. Returning users keep the normal create/library path; introductory How It Works content no longer occupies every returning session.

## Stage 46 — Story reading experience 2.0
- Episode content now uses an explicit scene marker/rule and narrative reveal.
- Voice playback was flattened from a generic card into the story reading rhythm while preserving authenticated private playback/progress semantics.
- Choice/consequence sections preserve the editorial hierarchy and are safer on narrow screens.

## Stage 47 — Live development infrastructure
Actually provisioned in Cloudflare development scope:
- D1 `living-plot-dev` (`bbd5a628-cf93-4ffa-a459-2368025b4067`, APAC).
- Queue `living-plot-tts-dev`.
- DLQ `living-plot-tts-dlq-dev`.
- Remote migrations `0001`–`0008` applied successfully.

Development Wrangler config now names the intended private R2 bucket `living-plot-audio-dev`.

External blocker: Cloudflare R2 is not enabled for the account. `wrangler r2 bucket create living-plot-audio-dev` fails with API code `10042`. No development Worker deployment is claimed while that binding cannot exist.

## Stage 48 — Real authenticated story E2E
BLOCKED by missing live credentials/configuration. Secret-safe readiness reports 0/12 required values. There is no Clerk dev session or Gemini key in this project environment, so create → choice → next → resume cannot legitimately be claimed against a real provider.

Source smoke tooling from Slices 31–40 remains ready for immediate execution once the live development Worker and Clerk token exist.

## Stage 49 — Voice / monetization E2E
BLOCKED by the same provider gate plus R2:
- Google TTS private-audio E2E cannot complete without service-account credentials and enabled R2.
- RevenueCat Test Store/webhook/D1 entitlement convergence cannot complete without provider keys/webhook configuration.

No local SDK result is treated as Plus authority.

## Stage 50 — Closed Beta RC hardening
- Protected API JSON requests now have a 16,384-character/declared-size guard before expensive protected work and bounded JSON parsing.
- JSON API responses add `no-store`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`.
- Oversized-request/security-header regression coverage was added to the protected HTTP suite.
- Remote retention summary was repaired: the previous `UNION ALL` file path failed against D1; the query now returns one aggregate row and a Node runner invokes Wrangler with `--command`, so metrics are visible.
- `npm run retention:summary:dev` now succeeds against remote development D1 and currently reports zero beta traffic across all metrics, expected for a new dev database.
- `docs/ref/beta-rc-runbook.md` records provisioning, provider blockers, live bring-up order, cost/abuse guardrails, and exact RC verification.

## Verification status before final push
- Mobile TypeScript PASS.
- Modified mobile ESLint groups PASS.
- Mobile Vitest PASS: 14 files / 43 tests.
- API TypeScript PASS and API ESLint PASS under the available local toolchain.
- Remote D1 migrations PASS 8/8.
- Remote retention query PASS and returns metrics.
- R2 provisioning BLOCKED by Cloudflare service enablement, not source code.
- Real Clerk/Gemini/TTS/RevenueCat E2E BLOCKED by 0/12 live values.

Final exact-SHA Node 24 CI is the authoritative full-suite/build gate after this batch is committed and pushed.

# TTS/private-audio implementation slice 9

Status: COMPLETE — STOP GATE PASSED

> route vocabulary synchronized 2026-08-19 · 0.0.0

## Scope
Implement Google Cloud TTS OAuth/provider isolation, asynchronous Queue/DLQ processing, private R2 audio persistence, owner-scoped audio delivery, and voice-quota orchestration. Preserve Slice 8 mobile changes. RevenueCat, analytics/cost telemetry, remote production resources/deploy, and mobile audio playback are outside this slice.

## Completed
- Migration `0005_tts_audio.sql` with one derived audio asset per episode/voice and `reserving → queued → processing → staged → ready/failed` lifecycle.
- Provider-neutral `SpeechSynthesizer` plus Google Cloud Text-to-Speech v1 MP3 adapter.
- Service-account JWT/OAuth token provider using Worker Web Crypto RS256 and cached access tokens.
- Explicit approved Phase 1 Vietnamese/English Wavenet voice variants.
- Race-safe audio request service: unique asset claim occurs before voice quota reservation, so concurrent duplicate logical work holds one quota slot and one Queue job.
- Queue consumer processing lease, retryable provider/R2 retry behavior, staged recovery that avoids duplicate TTS spend, and terminal quota release.
- Wrangler Queue producer/consumer retry configuration plus `living-plot-tts-dlq` consumer.
- Private `AUDIO_BUCKET` R2 binding with deterministic backend-only MP3 object keys.
- Authenticated canonical `POST /v1/scenes/:sceneId/voice` plus owner-scoped `GET /v1/media/:assetId/status` and `GET /v1/media/:assetId`; object keys/provider voice IDs are not exposed.
- Until RevenueCat is implemented, HTTP voice requests intentionally use the server-side Free tier and cannot trust a client Plus flag.
- Durable TTS/audio, foundation, data-model, README, docs-index, and changelog updates.

## Verification evidence
- Focused root lint/typecheck: PASS for API and mobile.
- Focused API Vitest: 18 files, 86/86 tests PASS.
- Mobile behavior: 2 files, 9/9 tests PASS.
- Real local R2 binding tests: MP3 write/read/content-type, ready replay without repeat TTS, staged recovery, owner isolation PASS.
- OAuth tests: runtime-generated RSA key, RS256 signature verification, claim validation, token exchange/cache/failure normalization PASS.
- Fresh Wrangler local D1 migrations PASS: 0001=13, 0002=15, 0003=8, 0004=9, 0005=4 commands.
- First Wrangler deploy dry-run PASS; recognized `TTS_QUEUE`, local D1, and `AUDIO_BUCKET`; no deployment performed.
- Secret/static-key scan: PASS; no PEM payload, service-account JSON private key, or Google access-token material found in repo.
- `git diff --check`: PASS.
- Final clean `npm ci`: PASS — 898 packages from lockfile.
- Final clean root lint: PASS for API and mobile.
- Final clean root typecheck: PASS for API and mobile.
- Final clean API Vitest: 18 files, 86/86 tests PASS.
- Final clean mobile Vitest: 2 files, 9/9 tests PASS.
- Final clean Wrangler deploy dry-run: PASS; upload 393.24 KiB / gzip 77.82 KiB; Queue/D1/R2 bindings recognized; no deployment performed.

## Guarantees established
- Google service-account credential material stays behind the Worker environment boundary.
- Fresh voice quota is reserved before Queue/provider spend and released on terminal failure.
- Concurrent requests for one episode/voice converge on one asset, one quota reservation, and one Queue job.
- Ready/cached R2 replay consumes no fresh voice quota.
- Retryable provider/R2 failures remain retryable without mutating story state.
- Once MP3 reaches `staged`, retry does not call Google TTS again.
- DLQ cleanup releases unfinished held quota; staged work first attempts safe finalization/recovery.
- R2 object keys are not exposed to clients; ready bytes are served only through authenticated owner-scoped Worker reads.
- Client-supplied entitlement/Plus flags have no authority; HTTP voice requests remain Free-tier until RevenueCat backend verification exists.

## Deferred
Live Google credential/provider call, remote Queue/R2/D1 provisioning, RevenueCat Plus entitlement, exact TTS cost telemetry, mobile audio player, public deployment, and store build.

## STOP
Reached with PASS result. Slice 9 is complete. Do not begin RevenueCat, analytics/cost telemetry, remote provisioning/deployment, or mobile audio playback in this run.
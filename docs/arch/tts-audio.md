# Phase 1 TTS and private-audio boundary

> updated 2026-08-19 · 0.0.0

## Responsibility
Slice 9 adds derived voice generation without making audio part of canonical story state. Text episodes remain canonical and usable when voice is queued, retrying, failed, or unavailable.

The boundary owns:
- server-side Gemini API-key authentication at the speech-provider edge;
- provider-neutral speech synthesis;
- fresh-voice quota reservation/consumption/release;
- asynchronous Queue processing and DLQ cleanup;
- private R2 object persistence;
- owner-scoped HTTP request/status/audio delivery.

RevenueCat entitlement materialization and analytics/cost accounting remain separate authority domains. Mobile playback consumes this boundary without making audio canonical. When provider-generated private audio is unavailable, the native app may explicitly offer device text-to-speech as a local fallback; that fallback is not a `MediaAsset`, is not uploaded, and consumes no server narration quota.

## Gemini authentication
The configured private-audio adapter keeps `GEMINI_API_KEY` strictly server-side. `GeminiTtsSynthesizer` sends the key only as the Gemini API `x-goog-api-key` header from the Worker; it never enters D1, mobile configuration, public DTOs, or R2 metadata. Development Scene generation is independently provider-neutral and currently uses Workers AI, so Scene text can remain live even while the Gemini narration provider is unhealthy. Google Cloud service-account credentials are not required by the current narration runtime.

## Speech provider
`SpeechSynthesizer` remains provider-neutral. The configured private-audio adapter is `GeminiTtsSynthesizer` using `gemini-2.5-flash-preview-tts` through the Gemini Interactions API. It requests inline MP3 output, validates the returned MIME/container, and exposes only normalized MP3 bytes, `audio/mpeg`, and input-character count to `AudioProcessor`.

The current Cloudflare development egress does not prove this Gemini TTS path healthy: live assets have exhausted retries and ended `failed`. That provider failure does not block canonical Scene text. Mobile therefore exposes a clearly labeled device-system speech fallback via `expo-speech`; it reads the already-canonical Scene text locally in `dramaLocale`, does not create/cache private media, and does not consume the Free/Plus narration ledger.

Approved Phase 1 product variants remain stable and map internally to Gemini voice `Aoede`:
- `vi-narrator-female` → `vi-VN` product locale → `Aoede`;
- `en-narrator-female` → `en-US` product locale → `Aoede`.

Gemini TTS detects input language automatically; both Vietnamese and English are supported by the provider. Clients send only the approved product variant and cannot supply arbitrary provider voice IDs. The older Google Cloud TTS adapter remains isolated legacy code and is not instantiated by the live factory or required by readiness checks.

## Canonical audio lifecycle
Migration `0005_tts_audio.sql` adds `audio_assets`. One `(episode_id, voice_variant)` owns one logical derived audio asset.

Lifecycle:

`reserving → queued → processing → staged → ready`

Terminal failure is `failed`.

- `reserving`: unique asset claim exists before quota reservation. Concurrent requests for the same episode/voice converge here, so losers never reserve extra quota.
- `queued`: voice quota is reserved and the Queue message was accepted.
- `processing`: a consumer lease/token owns the current synthesis attempt.
- `staged`: MP3 already exists in private R2, but quota finalization/ready transition has not completed. Retries from this state never call Gemini TTS again.
- `ready`: quota is consumed, the object key exists, and authenticated playback may stream it.
- `failed`: terminal provider/configuration/queue/DLQ failure; held quota is released where applicable.

`object_key` is backend-only canonical metadata. It is never returned by the HTTP API.

## Request flow
`POST /v1/scenes/:sceneId/voice`:

1. authenticate Clerk session and resolve internal user;
2. verify episode ownership;
3. resolve an approved voice variant;
4. return an existing non-failed asset immediately (ready cache replay consumes no fresh quota);
5. atomically claim the unique episode/voice asset as `reserving`;
6. winner reserves `voice_episode` quota; concurrent losers return the canonical asset without reserving quota;
7. transition to `queued` and send `{assetId}` only to the Queue;
8. if enqueue fails, mark failed and release the reservation.

The HTTP boundary resolves Free/Plus from the backend materialized RevenueCat entitlement immediately before voice quota reservation. The client cannot elevate itself by sending a tier flag.

## Queue and DLQ
Wrangler declares:
- producer binding `TTS_QUEUE` → the environment's canonical TTS queue;
- consumer batch size 5, three retries, 30-second retry delay;
- `TTS_DLQ_NAME` as a nonsecret runtime var that exactly matches the environment's DLQ consumer name;
- a second consumer for that DLQ. Development uses `living-plot-tts-dev` → `living-plot-tts-dlq-dev`; the default environment uses `living-plot-tts` → `living-plot-tts-dlq`.

The queue payload contains only `assetId`. It contains no story state, text, provider token, service-account credential, or R2 key.

Retryable Gemini/network/R2 failures reset the asset to `queued` and call message retry. Gemini HTTP 408/429/5xx and transport timeouts are retryable; authentication/configuration failures and ordinary invalid requests are terminal. Non-retryable provider failures release quota and end as `failed`. After primary retries are exhausted, the DLQ consumer marks unfinished work failed and releases held quota. A `staged` item first attempts quota/ready recovery so a successful provider call is not discarded merely because finalization was delayed.

## Private R2 storage
Wrangler binds `AUDIO_BUCKET` to `living-plot-audio`. The bucket is not exposed through a public URL in application code.

The consumer writes deterministic MP3 keys:

`audio/{episodeId}/{voiceVariant}.mp3`

`GET /v1/media/:assetId/status` authenticates the user and returns only client-safe lifecycle metadata for polling. `GET /v1/media/:assetId` separately authenticates the owner through scene → drama ownership before reading R2; non-ready reads return HTTP 202 metadata and ready assets stream `audio/mpeg` with private cache headers. The object key and provider voice ID are never exposed.

The Expo client requests one approved narrator variant, polls the status route while work is pending, and uses Expo Audio with the protected stream URL plus an Authorization header after `ready`. Automatic polling now spans the server retry window instead of stopping after the first ~20 seconds, so `queued/processing` can naturally converge to `ready` or `failed` after provider retries. Pending cloud narration is presented as background work rather than a blocking action. Until that generated-media path is healthy, `expo-speech` can read the Scene locally as an explicitly separate device-voice fallback. Public live configuration and signed-in session state are separate concerns: API URL + Clerk configuration select the authenticated HTTP client, while a missing session produces `auth_required` at the transport boundary. A deliberately unconfigured preview build exposes cloud voice as unavailable and never fabricates private audio. Playback/provider failure never invalidates or hides the text scene.

## Quota and referral credits
Fresh cloud narration first reserves from the user's normal daily voice allowance (Free 1/day, Plus 10/day). Only when that daily allowance is exhausted may `D1VoiceQuota` reserve one persistent referral bonus credit. Bonus credits use their own D1 reservation lifecycle and are restored on queue/provider failure; successful private audio consumes exactly one. Device-system speech never touches either quota source.

## Idempotency and failure semantics
- same episode/voice request while work exists returns the canonical asset;
- concurrent different request keys for one episode/voice create one asset, one quota reservation, and one queue message;
- Queue retry cannot synthesize again after the asset reaches `staged`;
- processing uses a two-minute lease so duplicate deliveries do not immediately double-call the provider, while a crashed consumer can later be reclaimed;
- ready replay never consumes new voice quota;
- non-retryable provider failure releases quota;
- DLQ terminal cleanup releases held quota;
- R2 remains private even if D1 finalization fails.

## External environment gate
Live narration requires the Worker-side Gemini key, development Queue/DLQ, private R2 bucket, and authenticated Clerk/mobile API configuration. It does not require Google Cloud billing or service-account activation. Preview-safe APK/IPA artifacts keep text scenes functional when live public configuration is absent and never substitute fixture audio. Production deployment and store submission are not part of the current Phase 1 development gate.

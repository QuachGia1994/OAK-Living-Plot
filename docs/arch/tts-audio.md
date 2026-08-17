# Phase 1 TTS and private-audio boundary

> updated 2026-08-17 · 0.0.0

## Responsibility
Slice 9 adds derived voice generation without making audio part of canonical story state. Text episodes remain canonical and usable when voice is queued, retrying, failed, or unavailable.

The boundary owns:
- Google service-account OAuth access-token acquisition;
- provider-neutral speech synthesis;
- fresh-voice quota reservation/consumption/release;
- asynchronous Queue processing and DLQ cleanup;
- private R2 object persistence;
- owner-scoped HTTP request/status/audio delivery.

RevenueCat entitlement materialization and analytics/cost accounting remain separate authority domains. Mobile playback now consumes this boundary without making audio canonical.

## Google authentication
`GoogleAccessTokenProvider` performs the explicit server-to-server flow required by the architecture:

1. construct a JWT with `alg=RS256`, service-account email as `iss`, `https://www.googleapis.com/auth/cloud-platform` as `scope`, Google OAuth token endpoint as `aud`, and a one-hour `iat/exp` window;
2. import the PKCS#8 private key with Worker Web Crypto;
3. sign with `RSASSA-PKCS1-v1_5` + SHA-256;
4. exchange the JWT assertion at `https://oauth2.googleapis.com/token`;
5. reuse the returned access token until 60 seconds before expiry.

The service-account email/private key exist only in Worker environment secrets. No credential or assertion reaches the mobile client or D1.

## Speech provider
`SpeechSynthesizer` is provider-neutral. `GoogleTtsSynthesizer` currently calls Google Cloud Text-to-Speech v1 `text:synthesize` with MP3 output and returns only audio bytes, content type, and input-character count.

Approved Phase 1 variants are explicit and reversible:
- `vi-narrator-female` → `vi-VN-Wavenet-A`;
- `en-narrator-female` → `en-US-Wavenet-F`.

Clients send only the approved variant name; they cannot supply arbitrary provider voice IDs.

## Canonical audio lifecycle
Migration `0005_tts_audio.sql` adds `audio_assets`. One `(episode_id, voice_variant)` owns one logical derived audio asset.

Lifecycle:

`reserving → queued → processing → staged → ready`

Terminal failure is `failed`.

- `reserving`: unique asset claim exists before quota reservation. Concurrent requests for the same episode/voice converge here, so losers never reserve extra quota.
- `queued`: voice quota is reserved and the Queue message was accepted.
- `processing`: a consumer lease/token owns the current synthesis attempt.
- `staged`: MP3 already exists in private R2, but quota finalization/ready transition has not completed. Retries from this state never call Google again.
- `ready`: quota is consumed, the object key exists, and authenticated playback may stream it.
- `failed`: terminal provider/configuration/queue/DLQ failure; held quota is released where applicable.

`object_key` is backend-only canonical metadata. It is never returned by the HTTP API.

## Request flow
`POST /v1/episodes/:episodeId/audio`:

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
- producer binding `TTS_QUEUE` → `living-plot-tts`;
- consumer batch size 5, three retries, 30-second retry delay;
- DLQ `living-plot-tts-dlq`;
- a second consumer for the DLQ.

The queue payload contains only `assetId`. It contains no story state, text, provider token, service-account credential, or R2 key.

Retryable Google/network/R2 failures reset the asset to `queued` and call message retry. Non-retryable provider failures release quota and end as `failed`. After primary retries are exhausted, the DLQ consumer marks unfinished work failed and releases held quota. A `staged` item first attempts quota/ready recovery so a successful provider call is not discarded merely because finalization was delayed.

## Private R2 storage
Wrangler binds `AUDIO_BUCKET` to `living-plot-audio`. The bucket is not exposed through a public URL in application code.

The consumer writes deterministic MP3 keys:

`audio/{episodeId}/{voiceVariant}.mp3`

`GET /v1/audio/:assetId/status` authenticates the user and returns only client-safe lifecycle metadata for polling. `GET /v1/audio/:assetId` separately authenticates the owner through episode → plot before reading R2; non-ready reads return HTTP 202 metadata and ready assets stream `audio/mpeg` with private cache headers. The object key and provider voice ID are never exposed.

The Expo client requests one approved narrator variant, polls the status route while work is pending, and uses Expo Audio with the protected stream URL plus an Authorization header after `ready`. Playback failure never invalidates or hides the text episode.

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
Live Google credential/network synthesis and remote development Queue/R2 provisioning remain unverified until credentials/resources exist. Production deployment and store submission are not part of the current Phase 1 development gate.

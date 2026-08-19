# Canonical drama runtime ownership

> updated 2026-08-19 · current application contract

Living Plot has one product vocabulary above persistence: **Drama → Scene → Choice → Branch → next Scene**. The existing D1 schema still stores historical table/column names such as `plots`, `episodes`, `plot_id`, `episode_id`, and `story_locale`. Those names are storage details and must not be projected into new mobile or HTTP contracts.

## End-to-end flow and owners

| Transition | Owner | Canonical state/result |
| --- | --- | --- |
| user premise/mood/lead → generation request | mobile `features/drama/setup.ts` + `HttpDramaExperienceClient` | `DramaDraft`, idempotency keys, `DramaLocale` |
| generation request → provider-neutral scene proposal | API `SceneGenerator` | `SceneGenerationInput` → `SceneProposal` or normalized generation error |
| provider payload → validated proposal | `SceneGenerator` adapter + `scene-schema.ts` | strict `SceneProposal`; raw provider JSON never reaches domain/UI |
| validated proposal → persisted current scene | `D1EpisodePublisher` persistence adapter + `DramaService` | D1 write with generation-key/idempotency/version guards, then `D1DramaRepository` projects `Drama` |
| persisted rows → application drama | `D1DramaRepository` | `Drama`, `Scene`, `CharacterIdentity`, `Branch` |
| scene → voice request/status/private playback | `D1AudioService` + `AudioProcessor` | public `MediaAsset` lifecycle; R2/provider fields remain private |
| canonical drama → player phase | mobile `useDramaPlayback` + `derivePlaybackState` | `PlaybackState` |
| provisional choice → committed branch | API `D1ChoiceCommitter` | exactly one durable choice commit; `Branch.open → Branch.committed` only after canonical response |
| committed branch → next scene | `DramaService` | idempotent generation request using prior canonical consequence |
| persisted scenes/commits → recap | `D1DramaRepository.loadHistory` | ordered `DramaHistory` with scene/branch terminology |

UI components render these states and issue intents. They do not mutate D1, infer a successful branch from local selection, infer media readiness from unrelated fields, or normalize provider output.

## Domain source of truth

API product domain:
- `apps/api/src/domain/drama.ts` — `Drama`, `Scene`, `CharacterIdentity`, `Choice`, `Branch`, `DramaMood`.
- `apps/api/src/domain/drama-state.ts` — durable relationship/fact/thread/tone memory applied by committed branches.
- `apps/api/src/drama-runtime/` — authenticated application orchestration and D1 projection.

Mobile product domain:
- `apps/mobile/src/features/drama/domain.ts` — client `Drama/Scene/Branch`, `GenerationJob`, and `MediaAsset` product status.
- `apps/mobile/src/features/drama/contracts.ts` — application client/summary/history contracts.
- `apps/mobile/src/features/drama/use-drama-playback.ts` — playback orchestration owner.
- `apps/mobile/src/features/drama/playback-state.ts` — pure phase derivation.

The D1 schema is not the domain model. In particular, a D1 `episode` row is projected as a product `Scene`, and `plots.state_json` is parsed as `DramaState` before it is trusted.

## Branching rule

`D1ChoiceCommitter` is the only owner of canonical choice commitment. The persistence adapter still speaks D1 identifiers (`plotId`, `episodeId`) internally because those are schema names, while `DramaService` maps product `dramaId/sceneId` at the boundary.

A branch can be:
- `{ state: 'open' }`
- `{ state: 'committed', choiceId, consequence }`

The mobile selection before commit is provisional playback state, not a canonical branch. Replaying the same committed choice is idempotent. A different second choice returns a conflict and the client resynchronizes from the canonical drama.

## Generation boundary

`SceneGenerator` is provider-neutral. The non-production live-development Worker uses the Workers AI binding with `@cf/meta/llama-3.1-8b-instruct-fast`; deployments without that binding retain `GeminiSceneGenerator` as the adapter. `DramaService`, D1 projection, and mobile code depend on neither provider response type.

Provider flow:
1. `SceneGenerationInput` is assembled only from bounded canonical drama memory.
2. `scene-prompt.ts` serializes user/drama strings as data inside `DRAMA_CONTEXT_JSON`.
3. the selected adapter requests structured JSON; the Workers AI adapter constrains output size and removes only provider references that do not exist in the canonical character/fact/thread input.
4. `scene-schema.ts` parses and validates the proposal, including A/B/C branches, canonical references, score bounds, script envelope, and no unexpected fields. Schema string bounds mirror the domain envelope so incomplete/undersized provider output is rejected before publication.
5. One controlled regeneration is allowed only for a successful-but-invalid provider proposal.
6. provider/network failures normalize to `provider_unavailable`; a second invalid proposal normalizes to `invalid_generation` at HTTP/mobile application boundaries.
7. only validated `SceneProposal` reaches publication.

Provider/model names may exist in adapter telemetry and persistence provenance. They are never application state.

## Generation job/idempotency

Mobile `GenerationJob` represents user-visible generation state. Server mutation idempotency is owned by stable creation/generation keys and D1 uniqueness/version guards.

- initial drama creation reuses the caller creation key and a stable generation key;
- continuation reuses its generation key after a lost response;
- provider failure releases the reservation; retrying the same logical generation key re-arms that released reservation against the current UTC-day quota instead of creating duplicate work;
- a published-but-response-lost mutation converges on persisted state rather than generating a second canonical scene;
- HTTP `201 Created` reflects the first successfully published canonical Drama, not the earlier insertion of an internal D1 `plots` row.

## Media pipeline

Phase 1 implements **voice media only**. There is no generated image/video media pipeline yet; UI artwork remains deterministic native presentation and must not be represented as generated media.

Internal D1/TTS lifecycle may use `reserving`, `queued`, `processing`, `staged`, `ready`, `failed`. The public product lifecycle is intentionally smaller:
- `queued`
- `processing`
- `ready`
- `failed`

`D1AudioService` normalizes internal storage state to the public `MediaAsset`. `objectKey`, provider voice ID, provider credentials, and staging state never cross the HTTP boundary. Binary playback uses an authenticated owner-scoped endpoint. Automatic status polling is bounded; after the poll budget is exhausted, the UI requires an explicit status refresh instead of polling forever. If private R2 cleanup fails during a terminal media transition, the processor keeps the staged object key, records `r2_cleanup_failed`, and retries instead of deleting the only reconciliation pointer.

Script readiness therefore does **not** imply voice readiness.

## Playback ownership

`useDramaPlayback` owns:
- restore/resync;
- provisional selected choice;
- canonical commit request;
- continuation request;
- foreground refresh;
- recoverable failure state.

`derivePlaybackState` produces `restoring`, `playing`, `choice`, `committing_choice`, `consequence`, `continuing`, or `failed`. `drama.tsx` renders that phase. It does not decide whether a branch is canonical.

Voice playback has a separate media state because narrative state and media readiness are independent.

## Locale and preferences SSoT

`UserPreferences` owns:
- `uiLocale: 'en' | 'vi'`
- `dramaLocale: 'en-US' | 'vi-VN'`
- approved narrator variant

D1 migration history still names the physical column `story_locale`; `D1UserPreferencesRepository` maps and validates it as application `dramaLocale`. The mobile preview reader accepts a legacy persisted `storyLocale` key only as a one-way compatibility migration, then exposes `dramaLocale`.

Changing UI language may choose matching defaults for a new drama/narrator, but existing dramas preserve the locale captured when they were created.

## Failure ownership

- auth failure: HTTP auth boundary; no canonical mutation.
- invalid input: setup/HTTP validation; provider not called.
- provider unavailable: `SceneGenerator` normalized failure; reserved generation quota released.
- invalid provider proposal after controlled retry: `invalid_generation`; no publication.
- stale/conflicting branch: choice/version boundary; mobile reloads canonical drama.
- media queue/provider failure: explicit `MediaAsset.failed` plus failure code; narrative scene remains readable.
- private R2 cleanup failure: staged metadata is retained and retried; no silent orphaning.
- lost network response after POST: stable idempotency key + canonical reload, never local success inference.

## Verification map

Behavioral proof is intentionally attached to business transitions:
- `apps/api/test/http-drama.test.ts` — create, persisted restore, owner isolation, branch commit/conflict, next-scene consequence, idempotent retry, generation failure/quota release.
- `apps/api/test/scene-schema.test.ts` — provider normalization and invalid references/shape rejection.
- `apps/api/test/gemini-scene-generator.test.ts` + `workers-ai-scene-generator.test.ts` — provider adapters, Worker-safe fetch binding, structured output, canonical-reference normalization, controlled validation retry, normalized failures.
- `apps/api/test/gemini-tts-synthesizer.test.ts` + `audio-service.test.ts` + `audio-processor.test.ts` + `http-media.test.ts` — Gemini TTS normalization plus media ownership, quota/idempotency, internal/partial/ready/failure states, private delivery.
- `apps/mobile/test/http-drama-client.test.ts` — HTTP normalization, conflict resync, stable continuation key, malformed branch rejection.
- `apps/mobile/test/drama-domain.test.ts` — player phase transitions.
- `apps/mobile/test/drama-preview-client.test.ts` — branch rules, continuation, restore, locale integrity.
- `apps/mobile/test/media-polling.test.ts` + `http-scene-voice-client.test.ts` — bounded polling and public media contract.
- `apps/mobile/test/localization.test.ts` + preferences tests — canonical VI/EN preference behavior.

## Persistence vocabulary exception

Do not rename existing D1 tables/columns solely to mirror product terminology. `plots`, `episodes`, `episode_choices`, quota resource strings, and migration file names are schema history with real migration cost. New application contracts must translate them at `D1DramaRepository`, publication, choice, preferences, and media boundaries. This prevents storage naming from becoming a second product model.

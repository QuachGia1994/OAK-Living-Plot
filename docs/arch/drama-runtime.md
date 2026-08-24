# Canonical drama runtime ownership

> updated 2026-08-23 · 0.0.0

Living Plot has one product vocabulary above persistence: **Drama → Scene → Choice → Branch → next Scene**. The existing D1 schema still stores historical table/column names such as `plots`, `episodes`, `plot_id`, `episode_id`, and `story_locale`. Those names are storage details and must not be projected into new mobile or HTTP contracts.

## End-to-end flow and owners

| Transition | Owner | Canonical state/result |
| --- | --- | --- |
| optional draft inspiration → three editable AI seeds | mobile suggestion coordinator + API `DramaSeedSuggester` | noncanonical `{label,premise,mood,characterName}` ×3; form only |
| user premise/mood/lead → generation request | mobile `features/drama/setup.ts` + `HttpDramaExperienceClient` | `DramaDraft`, idempotency keys, `DramaLocale` |
| generation request → provider-neutral scene proposal | API `SceneGenerator` | `SceneGenerationInput` → `SceneProposal` or normalized generation error |
| provider payload → validated proposal | `SceneGenerator` adapter + `scene-compiler.ts` + `scene-schema.ts` | strict `SceneProposal`; raw provider JSON never reaches domain/UI |
| validated proposal → persisted current scene | `D1EpisodePublisher` persistence adapter + `DramaService` | D1 write with generation-key/idempotency/version guards, then `D1DramaRepository` projects `Drama` |
| persisted rows → application drama | `D1DramaRepository` | `Drama`, `Scene`, `CharacterIdentity`, `Branch` |
| scene → voice request/status/private playback | `D1AudioService` + `AudioProcessor` | public `MediaAsset` lifecycle; R2/provider fields remain private |
| published scene → derived illustration | Scene artwork Queue job + `D1SceneArtworkService` | Scene-specific private R2 image and derived status; canonical Scene publication never waits or rolls back |
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

## Pre-story AI suggestion boundary

AI suggestions are an optional **noncanonical form helper**, not a Scene-generation mode. `POST /v1/dramas/suggestions` authenticates the owner server-side, reads the saved `dramaLocale`, normalizes bounded optional inspiration/preferred mood/lead name, and returns exactly three public items containing only `label`, `premise`, `mood`, and a normalized 2–50 character `characterName`. Raw provider output, model/provider names, prompts, usage, IDs, scripts, choices, state deltas, facts, threads, relationships, and Scene context never cross this boundary.

`DramaSeedSuggester` is separate from `SceneGenerator`. The Workers AI adapter makes exactly one structured call on the happy path and at most one repair for malformed/invalid output. Primary + repair share one 24-second total provider deadline using the supported Workers AI `AbortSignal`; timeout normalizes to `provider_unavailable`. The D1 lease is 35 seconds, so the configured provider pipeline must terminate before a stale lease can be reclaimed; a live lease returns retryable `suggestion_in_progress`, while stale recovery uses a conditional lease-token update and an old owner cannot overwrite a newer ready row.

Migration `0013_drama_suggestion_cache` is rebuildable/derived data only. `(user_id, request_key)` is unique; `input_fingerprint` distinguishes conflicting reuse; `pending|ready` lifecycle checks constrain lease/suggestion fields; ready rows store only the validated public DTO for byte-equivalent semantic replay. Same owner/key/fingerprint ready replay makes zero provider calls and does not count against the abuse cap. A different fingerprint conflicts; different owners are isolated. Invalid provider results/failures are not cached ready and release the reservation for safe same-key retry. Malformed ready-cache DTOs fail closed instead of becoming application state. Cache cleanup is opportunistic with a 24-hour retention window, account erasure cascades it with the owner, and account export deliberately excludes it because it is transient provider-derived helper data rather than user-authored or canonical story state.

The separate operational cap is 12 **successful new suggestion batches** per owner per UTC day. Replay, provider failure, invalid output, and rate-limited attempts do not consume it. The UTC day is recomputed immediately before the atomic ready transition so a request that crosses midnight cannot finalize as batch 13 of the new day. This cap has no relation to Scene or voice quota and never blocks manual Drama/Scene creation.

Suggestion telemetry records only provider/parse/validate/total timings, provider-call count, repair count, and normalized outcome. It contains no user ID, request key, premise/inspiration, lead name, or suggestion text and is fail-open.

## Generation boundary

`SceneGenerator` is provider-neutral. Canonical provider selection is explicit through `SCENE_GENERATOR_PROVIDER`; merely binding Workers AI for suggestions cannot switch Scene generation. The default environment is configured for `gemini`, while development is explicitly configured for `workers_ai` with `@cf/meta/llama-3.1-8b-instruct-fast` (slim creative schema, no `stateDelta` in provider output). Both environments may expose the `AI` binding for noncanonical suggestions. `DramaService`, D1 projection, and mobile code depend on neither provider response type.

Provider flow is `bounded context -> one 8B creative call -> deterministic compiler -> structural/publication gate -> targeted repair when appropriate -> atomic persistence`:

1. `SceneGenerationInput` is assembled only from bounded canonical drama memory: full canonical D1 history is retained, but generation input is bounded to last 4 scenes, ≤24 facts, ≤12 threads, ≤20 relationships, ≤3 arc checkpoints, bounded latest-unique resolved tombstones rebuilt from commits (≤24 fact texts + ≤24 thread titles), and bounded novelty (`excludedBeats` ≤4, `trajectoryConstraints` ≤20, `motifHistory` ≤12). Old `script_json` rows without `beat`/`pacingRole`/`motifSignature` remain readable.
2. `scene-prompt.ts` serializes user/drama strings as data inside `DRAMA_CONTEXT_JSON`; the creative path strips provider-irrelevant canonical keys/state-version metadata, maps relationship/trajectory endpoints to character names, omits server-only committed relationship deltas, and instructs the provider to emit `durableFact` per choice plus exact natural-language resolution hints rather than canonical keys or relationship deltas.
3. The selected adapter requests structured JSON via the slim creative schema; on the happy path exactly one 8B provider call is made (`max_tokens: 2300`, `temperature: 0.45`). Primary and repair schemas require `durableFact`; an omitted primary field is held as an incomplete draft only long enough to request provider-authored targeted repair. The adapter never derives a canonical fact from a label or consequence, and compilation does exact normalized mapping only.
4. `scene-compiler.ts` deterministically compiles the creative proposal: `durableFact` text is copied into `factsToAdd`, `factTextsToResolve`/`threadTitlesToResolve` are exact-mapped to canonical keys (unknown/ambiguous dropped, no invented relationships), and `resolvedMemory` tombstones block exact resurrection.
5. `scene-schema.ts` parses and validates the compiled proposal, including A/B/C branches, canonical references, score bounds, script envelope, continuation advancement, active-thread duplication, and no unexpected fields. Schema string bounds mirror the domain envelope so incomplete/undersized provider output is rejected before publication.
6. Failures are handled with at most one controlled follow-up: malformed JSON or a script-level failure such as unrealized prior consequence triggers one full regeneration; publication/metadata/branch rejections that do not require rewriting `script` trigger one targeted repair using the smaller repair schema (1200 tokens, no `script`, byte-for-byte script preservation). A second failure normalizes to `invalid_response`; binding/network exceptions normalize to `provider_unavailable`. Telemetry (`providerCalls`/`repairs`/`timings`/`outcome`) is observational and fail-open.
7. Only validated `SceneProposal` reaches publication. Canonical state application deduplicates semantically identical fact/thread text before and during branch commits, and generation context performs the same normalization so previously polluted development state cannot keep feeding repeated facts/threads back into later Scenes. `arc_checkpoints` (`plot_id`, `through_scene_number`, `summary`, `created_at`, unique on `(plot_id, through_scene_number)`) is a derived cache only; `saveArcCheckpoint` is fail-open and never invalidates a successful canonical commit.

Provider/model names may exist in adapter telemetry and persistence provenance. They are never application state.

## Generation job/idempotency

Mobile `GenerationJob` represents user-visible generation state. Server mutation idempotency is owned by stable creation/generation keys and D1 uniqueness/version guards.

- initial drama creation reuses the caller creation key and a stable generation key;
- mobile persists the pending normalized-draft fingerprint + creation key in owner-scoped secure device storage before sending Scene 1, so an app/route remount after an uncertain response replays the same canonical request; success or a definite invalid/conflicting response clears it;
- continuation reuses its generation key after a lost response;
- provider failure releases the reservation; retrying the same logical generation key re-arms that released reservation without creating duplicate work, and Scene reservations never block on a daily text limit;
- a published-but-response-lost mutation converges on persisted state rather than generating a second canonical scene;
- HTTP `201 Created` reflects the first successfully published canonical Drama, not the earlier insertion of an internal D1 `plots` row.

## Media pipeline

Voice and Scene illustration are independent **derived media**. Neither is canonical story state, and neither can make a published Scene fail.

Internal D1/TTS lifecycle may use `reserving`, `queued`, `processing`, `staged`, `ready`, `failed`. The public product lifecycle is intentionally smaller:
- `queued`
- `processing`
- `ready`
- `failed`

`D1AudioService` normalizes internal storage state to the public `MediaAsset`. `objectKey`, provider voice ID, provider credentials, and staging state never cross the HTTP boundary. Binary playback uses an authenticated owner-scoped endpoint. Automatic status polling is bounded; after the poll budget is exhausted, the UI requires an explicit status refresh instead of polling forever. If private R2 cleanup fails during a terminal media transition, the processor keeps the staged object key, records `r2_cleanup_failed`, and retries instead of deleting the only reconciliation pointer.

`D1SceneArtworkService` uses `scene_artworks` as a rebuildable derived cache. Create/continue schedules a Queue job only after canonical publication; enqueue is fail-open. The consumer fingerprints canonical Scene material, converges concurrent work by a 120-second lease and generation token, renders one Scene-specific 1024×640 image with a single hosted fallback on primary failure, and stores it under a private R2 plot prefix. The client immediately shows a bundled classical fallback, auto-backfills old Scenes without an artwork row, then polls within a bounded budget. Status/delivery are owner-scoped and expose no R2 key or provider details. Account export carries lifecycle metadata only; deletion clears portrait and Scene-artwork prefixes before D1 cascade.

Script readiness therefore implies neither voice nor artwork readiness. A failed voice or image provider leaves script/choices/branch continuity fully usable.

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
- provider unavailable: `SceneGenerator` normalized failure; reserved generation ledger entry released.
- invalid provider proposal after controlled retry/repair: `invalid_generation`; no publication.
- stale/conflicting branch: choice/version boundary; mobile reloads canonical drama.
- media queue/provider failure: explicit `MediaAsset.failed` plus failure code; narrative scene remains readable.
- private R2 cleanup failure: staged metadata is retained and retried; no silent orphaning.
- lost network response after POST: stable idempotency key + canonical reload, never local success inference.
- checkpoint write failure: derived-cache only, fail-open; canonical commit remains valid.
- telemetry write failure: observational only, fail-open; never changes generation behavior.

## Verification map

Behavioral proof is intentionally attached to business transitions:
- `apps/api/test/http-drama.test.ts` — create, persisted restore, owner isolation, branch commit/conflict, next-scene consequence, idempotent retry, generation failure/quota release.
- `apps/api/test/creative-scene-schema.test.ts` + `apps/api/test/scene-compiler.test.ts` — slim creative schema, durableFact quality, exact-map compilation, no invented relationships, resolved tombstone blocking.
- `apps/api/test/workers-ai-scene-generator.test.ts` — one 8B happy-path call, no `stateDelta` in primary schema, targeted repair with immutable script, malformed→`invalid_response`, exception→`provider_unavailable`, pipeline telemetry and fail-open behavior.
- `apps/api/test/long-run-soak.test.ts` — 50-scene deterministic D1 soak with bounded memory and plateaued context bytes, old episode rows readable.
- `apps/api/test/scene-schema.test.ts` — provider normalization and invalid references/shape rejection.
- `apps/api/test/gemini-scene-generator.test.ts` + `workers-ai-scene-generator.test.ts` — provider adapters, Worker-safe fetch binding, structured output, canonical-reference normalization, controlled validation retry, normalized failures.
- `apps/api/test/gemini-tts-synthesizer.test.ts` + `audio-service.test.ts` + `audio-processor.test.ts` + `http-media.test.ts` — Gemini TTS normalization plus media ownership, quota/idempotency, internal/partial/ready/failure states, private delivery.
- `apps/mobile/test/http-drama-client.test.ts` — HTTP normalization, conflict resync, stable continuation key, malformed branch rejection, 120s defensive timeout.
- `apps/mobile/test/drama-domain.test.ts` — player phase transitions.
- `apps/mobile/test/drama-preview-client.test.ts` — branch rules, continuation, restore, locale integrity.
- `apps/mobile/test/media-polling.test.ts` + `http-scene-voice-client.test.ts` — bounded polling and public media contract.
- `apps/mobile/test/localization.test.ts` + preferences tests — canonical VI/EN preference behavior.

## Persistence vocabulary exception

Do not rename existing D1 tables/columns solely to mirror product terminology. `plots`, `episodes`, `episode_choices`, quota resource strings, and migration file names are schema history with real migration cost. New application contracts must translate them at `D1DramaRepository`, publication, choice, preferences, and media boundaries. This prevents storage naming from becoming a second product model.

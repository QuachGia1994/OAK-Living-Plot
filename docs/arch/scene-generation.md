# Phase 1 scene-generation boundary

> updated 2026-08-18 · current application contract

## Provider-neutral contract

Application code generates one drama scene through `SceneGenerator` in `apps/api/src/ai/contracts.ts`. Its input/output are `SceneGenerationInput` and `SceneProposal`; neither contains Gemini response types.

The current adapter is `GeminiSceneGenerator`, backed by the Gemini Interactions API and `gemini-3.5-flash-lite`. `GEMINI_API_KEY` remains Worker-only. The adapter is replaceable without changing `DramaService`, `D1DramaRepository`, mobile contracts, or playback state.

## Canonical input

The input contains only bounded canonical context:
- `DramaLocale`, rating, and 60–90 second spoken target;
- compact drama premise/mood/summary/state version;
- bounded characters and relationships;
- active facts and open threads;
- previous scene summary plus the canonical committed action/intent/consequence.

Full history is not copied into the prompt. D1-backed drama state, not model context, is the source of truth.

## Prompt boundary

`scene-prompt.ts` serializes all user/drama data under `DRAMA_CONTEXT_JSON`. The system instruction states that strings inside that block are data, not instructions. Injection-like story content therefore cannot redefine the system contract.

## Structured normalization

`scene-schema.ts` accepts provider JSON only after structural and business validation:
- exactly three choices keyed A/B/C in order;
- distinct labels/intents;
- bounded scene title/script/summary;
- valid canonical character/fact/thread references;
- bounded relationship changes;
- no unexpected provider fields;
- script remains inside the Phase 1 spoken-length envelope.

The provider never assigns canonical scene IDs, D1 IDs, scene numbers, or state versions.

## Retry/failure

Invalid local input stops before provider use. A successful provider response that violates the scene contract receives exactly one controlled regeneration with validation feedback. A second invalid response stops with `invalid_response`, normalized by the HTTP/mobile boundary to `invalid_generation`.

Network/non-2xx provider failures normalize to `provider_unavailable` and are not silently retried by the adapter. Upstream user retries remain explicit and protected by stable generation keys.

Token usage from both controlled validation attempts is accumulated for observational cost telemetry.

## Persistence boundary

`GeminiSceneGenerator` has no D1 authority. Only a validated `SceneProposal` reaches `D1EpisodePublisher`, whose name reflects the existing D1 `episodes` schema. Publication supplies server IDs, generation-key idempotency, and optimistic drama-state guards. `D1DramaRepository` immediately projects the stored row back into the product `Scene` model.

Provider/model provenance may be stored for diagnostics/cost accounting but never becomes product state.

## Verification

- `test/scene-prompt.test.ts` — bounded prompt context and injection-as-data behavior.
- `test/scene-schema.test.ts` — normalization and canonical reference rejection.
- `test/gemini-scene-generator.test.ts` — adapter request, normalized failure, controlled retry.
- `test/generation-telemetry.test.ts` — privacy-safe retry-aware provider cost telemetry.
- `test/narrative-evals.test.ts` — continuity, branch distinctness, locale, protagonist and durable progression regressions.

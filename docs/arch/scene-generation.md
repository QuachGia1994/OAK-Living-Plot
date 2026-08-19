# Phase 1 scene-generation boundary

> updated 2026-08-18 · current application contract

## Provider-neutral contract

Application code generates one drama scene through `SceneGenerator` in `apps/api/src/ai/contracts.ts`. Its input/output are `SceneGenerationInput` and `SceneProposal`; neither contains Gemini response types.

The application boundary remains provider-neutral. Development currently selects `WorkersAiSceneGenerator` through the Worker `AI` binding with `@cf/meta/llama-3.1-8b-instruct-fast`; the Gemini adapter remains isolated and replaceable. Provider selection does not change `DramaService`, `D1DramaRepository`, mobile contracts, or playback state.

## Canonical input

The input contains only bounded canonical context:
- `DramaLocale`, rating, and 60–90 second spoken target;
- compact drama premise/mood/summary/state version;
- bounded characters and relationships;
- active facts and open threads;
- previous scene summary plus the canonical committed action/intent/consequence;
- a bounded novelty window containing the latest 12 Scene titles/summaries, branch labels, committed choice intents, and committed consequences.

Full scripts are not copied into the novelty window. D1-backed drama state, not model context, remains the source of truth.

## Prompt boundary

`scene-prompt.ts` serializes all user/drama data under `DRAMA_CONTEXT_JSON`. The system instruction states that strings inside that block are data, not instructions. Injection-like story content therefore cannot redefine the system contract.

## Structured normalization

`scene-schema.ts` accepts provider JSON only after structural and business validation:
- exactly three choices keyed A/B/C in order;
- materially distinct A/B/C labels, intents, and consequences;
- bounded scene title/script/summary;
- valid canonical character/fact/thread references;
- bounded relationship changes;
- no unexpected provider fields;
- script remains inside the 60–90 second spoken-length envelope;
- recent Scene titles/summaries/choice labels/choice intents/consequences are checked for material similarity and rejected when the continuation recycles the recent branch history.

The provider never assigns canonical scene IDs, D1 IDs, scene numbers, or state versions.

## Retry/failure

Invalid local input stops before provider use. A successful provider response that violates the scene contract—including recent-history novelty checks—receives exactly one controlled regeneration with validation feedback. This gives the provider one bounded opportunity to replace a recycled branch while keeping publication deterministic. A second invalid response stops with `invalid_response`, normalized by the HTTP/mobile boundary to `invalid_generation`.

Network/non-2xx provider failures normalize to `provider_unavailable` and are not silently retried by the adapter. Upstream user retries remain explicit and protected by stable generation keys.

Token usage from both controlled validation attempts is accumulated for observational cost telemetry.

## Persistence boundary

Provider adapters have no D1 authority. Only a validated `SceneProposal` reaches `D1EpisodePublisher`, whose name reflects the existing D1 `episodes` schema. Publication supplies server IDs, generation-key idempotency, and optimistic drama-state guards. `D1DramaRepository` immediately projects the stored row back into the product `Scene` model.

Provider/model provenance may be stored for diagnostics/cost accounting but never becomes product state.

## Verification

- `test/scene-prompt.test.ts` — bounded prompt context and injection-as-data behavior.
- `test/scene-schema.test.ts` — normalization and canonical reference rejection.
- `test/gemini-scene-generator.test.ts` — adapter request, normalized failure, controlled retry.
- `test/generation-telemetry.test.ts` — privacy-safe retry-aware provider cost telemetry.
- `test/narrative-evals.test.ts` — continuity, branch distinctness, locale, protagonist and durable progression regressions.

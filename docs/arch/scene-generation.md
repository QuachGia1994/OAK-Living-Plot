# Scene-generation boundary

> updated 2026-08-22 0.0.0

## Provider-neutral contract

Application code generates one drama scene through `SceneGenerator` in `apps/api/src/ai/contracts.ts`. Its input/output are `SceneGenerationInput` and `SceneProposal`; neither contains provider-native response types.

Development uses `WorkersAiSceneGenerator` whenever the Worker `AI` binding exists, using `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. The Workers AI binding receives `response_format.type = json_schema` with the Living Plot JSON Schema directly in `json_schema`, a 4096-token output ceiling, and a lower 0.35 temperature. A live remote-binding smoke test with the real Living Plot schema/prompt produced a publication-valid 143-word Scene in about 21 seconds; the previous 8B adapter repeatedly truncated or violated the full contract. Environments without the `AI` binding keep the Gemini adapter. A configured Gemini key is not used as failover when Workers AI exists because the deployed Worker region currently receives a Gemini HTTP 400 location restriction; routing a deterministic Workers AI validation failure into that endpoint only changed the user-visible error to `provider_unavailable`. Both provider adapters retain the same structural parser and narrative publication decision.

## Canonical input

Bounded canonical context only:
- `DramaLocale`, rating, and 60–90 second spoken target;
- compact drama premise/mood/summary/state version;
- bounded characters and relationships;
- active facts and open threads;
- previous scene summary plus the canonical committed action/intent/consequence;
- a bounded novelty window (latest ~12 Scene titles/summaries, branch labels, committed intents/consequences, optional beat/pacingRole).

D1-backed drama state remains the source of truth.

## Prompt boundary

`scene-prompt.ts` places all user/drama data under `DRAMA_CONTEXT_JSON` (data, not instructions). Novelty, consequence-realization, thread-payoff, and pacing guidance are part of the system instruction.

## Structured normalization

`scene-schema.ts` accepts provider JSON only after structural and business validation:
- exactly three choices keyed A/B/C;
- required `beat` (NarrativeBeat SSoT from `narrative-novelty.ts`) and `pacingRole` (PacingRole SSoT from `narrative-quality.ts`) on newly generated proposals;
- materially distinct labels/intents/consequences;
- valid canonical character/fact/thread references;
- input-aware branch shape: a one-character drama structurally forbids relationship deltas and requires at least one branch-specific fact per choice, so canonical-reference normalization cannot erase the branch's only durable effect;
- bounded fields and spoken-length envelope;
- recent-history material-similarity rejection for recycled titles/summaries/branches.

Legacy `recentHistory` rows may omit beat/pacingRole. The provider never assigns canonical scene IDs, D1 IDs, scene numbers, or state versions.

## Publication gate (shared)

After structural parse, **both** adapters call `validateNarrativePublication(input, proposal)`:

1. structural/canonical failures → reject/retry;
2. Phase-1 objective novelty floors (`trajectoryDiversity`, `structuralVariety`, `longRangeNovelty`) → reject/retry;
3. Phase-2 hard codes only: `BRANCH_NO_DURABLE_EFFECT`, `THREAD_EXPLOSION`, `CONSEQUENCE_NOT_REALIZED`, `PACING_ROLE_INVALID` (+ branch-commitment floor).

Eval-only scores (`relationshipProgression`, `protagonistAgency`, `arcCoherence`, `returnPull`, `ENDLESS_ESCALATION`, `ENDLESS_BREATHER`, `CRITICAL_THREAD_STALLED`, `CONSEQUENCE_UNRELATED_PROGRESSION`) feed offline `evaluateNarrative()` regressions and **do not** block publication by themselves.

Offline `evaluateNarrative().passed` (average ≥80 and every dimension ≥60) is a fixture/regression signal, not the runtime publication authority.

## Retry/failure

Invalid local input stops before provider use and is never forwarded to another provider. Inside each adapter, a successful provider response that fails structural validation or the shared publication gate receives exactly one controlled regeneration with validation feedback.

With a Workers AI binding present, the adapter owns the complete two-attempt structured-generation cycle. A first structural/publication rejection receives one controlled retry with validation feedback. Provider failure returns `provider_unavailable`; two rejected structured proposals return `invalid_generation` through the HTTP boundary. The client allows 60 seconds end-to-end, which covers the observed ~21-second 70B generation while preserving generation-key idempotency. Gemini remains available only for environments where Workers AI is absent; it is deliberately not a development failover while the Worker execution location is rejected by the Gemini API.

## Persistence boundary

Adapters have no D1 authority. Only a publication-accepted `SceneProposal` reaches the episode publisher (server IDs, generation-key idempotency, optimistic state version). Provider/model provenance may be stored for cost diagnostics but is not product state.

## Verification

- `test/scene-prompt.test.ts`, `test/scene-schema.test.ts`
- `test/gemini-scene-generator.test.ts`, `test/workers-ai-scene-generator.test.ts`, `test/scene-generator-factory.test.ts`
- `test/narrative-novelty.test.ts`, `test/narrative-quality.test.ts`, `test/narrative-evals.test.ts`

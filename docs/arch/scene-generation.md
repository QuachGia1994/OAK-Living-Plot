# Scene-generation boundary

> updated 2026-08-20 · current application contract

## Provider-neutral contract

Application code generates one drama scene through `SceneGenerator` in `apps/api/src/ai/contracts.ts`. Its input/output are `SceneGenerationInput` and `SceneProposal`; neither contains provider-native response types.

Development currently selects `WorkersAiSceneGenerator` when the Worker `AI` binding exists (`@cf/meta/llama-3.1-8b-instruct-fast`); otherwise `GeminiSceneGenerator` is used. Both adapters share the same post-parse publication decision. Provider selection does not change `DramaService`, `D1DramaRepository`, mobile contracts, or playback state.

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

Invalid local input stops before provider use. A successful provider response that fails structural validation or the shared publication gate receives exactly one controlled regeneration with validation feedback. A second failure returns `invalid_response` → HTTP/mobile `invalid_generation`.

Network/non-2xx provider failures normalize to `provider_unavailable` without silent adapter retry. Upstream retries remain explicit and generation-key protected.

## Persistence boundary

Adapters have no D1 authority. Only a publication-accepted `SceneProposal` reaches the episode publisher (server IDs, generation-key idempotency, optimistic state version). Provider/model provenance may be stored for cost diagnostics but is not product state.

## Verification

- `test/scene-prompt.test.ts`, `test/scene-schema.test.ts`
- `test/gemini-scene-generator.test.ts`, `test/workers-ai-scene-generator.test.ts`
- `test/narrative-novelty.test.ts`, `test/narrative-quality.test.ts`, `test/narrative-evals.test.ts`

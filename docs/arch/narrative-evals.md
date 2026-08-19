# Phase 1 narrative quality evaluations

> updated 2026-08-17 · 0.0.0

## Purpose
Schema validation protects canonical state, but valid JSON can still produce weak interactive drama. Slice 12 adds a deterministic offline evaluation layer for narrative regressions without granting an evaluator authority over runtime story state.

The required CI gate does not call an LLM-as-judge and does not require a paid provider request. This keeps the gate reproducible, cheap, and independent from provider availability.

## Fixture corpus
`apps/api/evals/narrative-fixtures.ts` contains a small representative corpus covering:

- a Vietnamese confession aftermath where the previous committed choice must become visible immediately;
- an English family-debt escalation with a secret, threatened relationship, and branch-specific fallout;
- a school mystery containing prompt-injection-like text as ordinary story data.

Each fixture contains bounded canonical `EpisodeGenerationInput` plus a provider-neutral `EpisodeProposal`. The corpus intentionally exercises existing facts, relationships, open threads, exactly three choices, and state deltas.

## Deterministic dimensions
`evaluateNarrative()` first passes the proposal through the same structural/canonical validator used by production. A structural failure receives score zero.

Valid proposals are then scored from 0–100 on eleven dimensions:

1. `continuity` — a previous committed consequence must be materially visible in the first third of the episode, and the chosen action must be reflected in the opening/summary.
2. `threadMomentum` — at least one open thread must be resolved or materially reflected in the new narrative.
3. `branchDistinctness` — choice labels/intents cannot be near-duplicates and all three state-delta signatures must differ.
4. `consequenceSpecificity` — branch consequences must be sufficiently specific and materially different from each other.
5. `repetitionControl` — the script must not collapse into repeated three-word sequences.
6. `characterConsistency` — the canonical protagonist must remain visibly anchored in the scene/summary/branches instead of disappearing behind a replacement lead.
7. `localeAlignment` — supported English/Vietnamese requests must produce visible language signal matching the requested locale across the narrative and branches.
8. `sceneProgression` — the episode must establish a durable fact or open/resolve a canonical thread before branching, preventing structurally valid scene resets.
9. `trajectoryDiversity` — after ≥3 material same-direction relationship moves on one pair/dimension, not all three choices may continue that trajectory; at least one must reverse materiality or open independent fact/thread progression.
10. `structuralVariety` — proposals declare a finite narrative beat; beats inside the shared cooldown (`BEAT_COOLDOWN_SCENES = 3`) are rejected.
11. `longRangeNovelty` — compact per-scene motif signatures detect recycled structure beyond the bounded recent prompt window without Vector DB.

A fixture passes only when the average score is at least 80 and every dimension is at least 60 (novelty dimensions share the same floor). These metrics are regression heuristics, not claims of objective literary quality.

### Anti-repeat stack
Bounded prompt memory + trajectory diversity + beat rotation + long-range motif signatures + deterministic publication validation in the Gemini adapter (reject → controlled retry → no publish). Shadow LLM predictability judges remain **deferred** (YAGNI).

## Adversarial coverage
The suite explicitly proves failure for:

- semantically near-duplicate choices that still use different strings;
- an episode that ignores the prior committed consequence;
- an unknown canonical thread key;
- generic branch consequences;
- a structurally valid but excessively repetitive script;
- a proposal that drops the canonical protagonist;
- English narrative output for a Vietnamese locale;
- an episode that adds no durable canonical progression before branching.

Run the focused gate with:

```bash
npm --workspace @living-plot/api run eval:narrative
```

The same tests are also included in the normal API Vitest suite.

## Model baseline
The production story adapter now targets `gemini-3.5-flash-lite` through the Gemini Interactions API with `thinking_level: minimal`. This replaces the deprecated Gemini 2.5 Flash-Lite baseline before narrative results are treated as the Phase 1 reference corpus.

Provider-generated live eval sampling can be added later, but the required gate remains provider-neutral and deterministic so a model outage, rate limit, or billing state cannot make CI nondeterministic.

## Boundary
Narrative evaluation is engineering evidence only. It does not mutate D1, publish episodes, consume user quota, grant entitlements, or decide access. Runtime provider output still must pass the production schema/canonical validator before persistence.

## Deferred
Large live-model benchmark sets, human preference studies, A/B experimentation, automated quality dashboards, production alert thresholds, and per-locale editorial tuning remain later product-validation work.

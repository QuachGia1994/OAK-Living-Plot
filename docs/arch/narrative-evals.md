# Phase 1 narrative quality evaluations

> updated 2026-08-16 · 0.0.0

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

Valid proposals are then scored from 0–100 on five dimensions:

1. `continuity` — a previous committed consequence must be materially visible in the first third of the episode, and the chosen action must be reflected in the opening/summary.
2. `threadMomentum` — at least one open thread must be resolved or materially reflected in the new narrative.
3. `branchDistinctness` — choice labels/intents cannot be near-duplicates and all three state-delta signatures must differ.
4. `consequenceSpecificity` — branch consequences must be sufficiently specific and materially different from each other.
5. `repetitionControl` — the script must not collapse into repeated three-word sequences.

A fixture passes only when the average score is at least 80 and every dimension is at least 60. These metrics are regression heuristics, not claims of objective literary quality.

## Adversarial coverage
The suite explicitly proves failure for:

- semantically near-duplicate choices that still use different strings;
- an episode that ignores the prior committed consequence;
- an unknown canonical thread key;
- generic branch consequences;
- a structurally valid but excessively repetitive script.

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

# Narrative quality evaluations

> updated 2026-08-26 · 0.0.0

## Purpose
Deterministic offline scoring for narrative regressions, plus a separate **runtime publication gate** shared by every SceneGenerator adapter.

Offline pass (`evaluateNarrative().passed`) is **not** identical to runtime publication authority.

## Runtime publication (`validateNarrativePublication`)
Provider-neutral. Called by **both** `GeminiSceneGenerator` and `WorkersAiSceneGenerator` after the strict provider parser and canonical business rules.

Runtime publication rejects only structural/canonical failures. All narrative-score findings—including `trajectoryDiversity`, `structuralVariety`, `longRangeNovelty`, `branchCommitment`, `consequenceRealization`, and `threadPayoff`—remain visible in the report and in offline regressions, but cannot turn an otherwise valid continuation into `invalid_generation` after a canonical Branch commit.

The provider prompt still receives bounded novelty, pacing, consequence, and thread guidance. The strict creative/schema boundary still rejects malformed JSON, invalid or repeated Scene/Choice structure, missing provider-authored durable branch facts, invalid canonical references, and the spoken-length envelope. This separates fail-closed contract validity from heuristic narrative quality.

## Phase-1 dimensions
continuity, threadMomentum, branchDistinctness, consequenceSpecificity, repetitionControl, characterConsistency, localeAlignment, sceneProgression, trajectoryDiversity, structuralVariety, longRangeNovelty.

## Phase-2 dimensions
consequenceRealization, threadPayoff, pacingQuality, branchCommitment, relationshipProgression, protagonistAgency, arcCoherence, returnPull.

Material relationship movement uses SSoT `MATERIAL_RELATIONSHIP_DELTA = 4` from `narrative-novelty.ts`.

## Metadata contract
New Scene proposals require valid `beat` (NarrativeBeat) and `pacingRole` (PacingRole). Legacy recentHistory rows may omit them.

## Run
```bash
npm --workspace @living-plot/api test -- narrative-quality narrative-evals narrative-novelty
```

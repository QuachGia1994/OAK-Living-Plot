# Narrative quality evaluations

> updated 2026-08-20 · 0.0.0

## Purpose
Deterministic offline scoring for narrative regressions, plus a separate **runtime publication gate** shared by every SceneGenerator adapter.

Offline pass (`evaluateNarrative().passed`) is **not** identical to runtime publication authority.

## Runtime publication (`validateNarrativePublication`)
Provider-neutral. Called by **both** `GeminiSceneGenerator` and `WorkersAiSceneGenerator` after structural parse and before accepting a proposal.

May reject only:
- structural/canonical failures
- Phase-1 objective novelty failures (`trajectoryDiversity`, `structuralVariety`, `longRangeNovelty`)
- Phase-2 hard codes: `BRANCH_NO_DURABLE_EFFECT`, `THREAD_EXPLOSION`, `CONSEQUENCE_NOT_REALIZED`, `PACING_ROLE_INVALID`
- branch commitment floor

Must **not** reject solely on eval-only dimensions: `relationshipProgression`, `protagonistAgency`, `arcCoherence`, `returnPull`, `ENDLESS_ESCALATION`, `ENDLESS_BREATHER`, `CRITICAL_THREAD_STALLED`, `CONSEQUENCE_UNRELATED_PROGRESSION`.

`CRITICAL_THREAD_STALLED` remains eval-only because current history does not encode per-thread first-seen age cheaply.

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

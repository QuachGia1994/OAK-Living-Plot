# Narrative quality evaluations

> updated 2026-08-19 · 0.0.0

## Purpose
Schema validation protects canonical state, but valid JSON can still produce weak interactive drama. Deterministic offline evaluation scores narrative regressions without granting an evaluator authority over runtime story state (except objective publication gates).

The required CI gate does not call an LLM-as-judge and does not require a paid provider request.

## Phase split

**Phase 1 — novelty / anti-repeat**
Answers: “Is this Scene structurally new enough to publish?”
Dimensions: trajectoryDiversity, structuralVariety, longRangeNovelty (+ continuity stack).

**Phase 2 — consequence depth / payoff / pacing / meaningful continuation**
Answers: “Was the player’s choice worth making, and does the resulting story make them want the next Scene?”
Dimensions: consequenceRealization, threadPayoff, pacingQuality, branchCommitment, relationshipProgression, protagonistAgency, arcCoherence, returnPull.

`returnPull` is a **narrative proxy** only. Real retention is measured from user behavior telemetry when present; the heuristic is not claimed to equal retention.

## Fixture corpus
`apps/api/evals/narrative-fixtures.ts` plus focused Phase-2 unit tests in `apps/api/test/narrative-quality.test.ts`.

## Deterministic dimensions
`evaluateNarrative()` validates structure first, then scores 0–100 on:

### Phase-1 / continuity stack
1. continuity
2. threadMomentum
3. branchDistinctness
4. consequenceSpecificity
5. repetitionControl
6. characterConsistency
7. localeAlignment
8. sceneProgression
9. trajectoryDiversity
10. structuralVariety
11. longRangeNovelty

### Phase-2 quality
12. consequenceRealization — prior committed consequence causes canonical development (fact/thread/durable branch), not mere echo
13. threadPayoff — critical high-urgency threads must not starve while new mysteries proliferate
14. pacingQuality — pacingRole in setup|build|escalate|payoff|breather|cliffhanger; forbid endless escalation / endless breather
15. branchCommitment — each of A/B/C creates at least one durable state effect
16. relationshipProgression — material relationship deltas should be narratively visible
17. protagonistAgency — structured choice intent + durable effects (eval-first)
18. arcCoherence — long-run opens vs payoffs stay balanced
19. returnPull — prefer payoff + concrete return hook over pure cliffhanger

Pass rule: average ≥ 80, every dimension ≥ 60, plus hard floors on novelty dimensions and objective Phase-2 dimensions (branchCommitment, consequenceRealization, threadPayoff). Hard codes may reject publication: BRANCH_NO_DURABLE_EFFECT, CRITICAL_THREAD_STALLED, THREAD_EXPLOSION, CONSEQUENCE_NOT_REALIZED, PACING_ROLE_INVALID.

## Runtime publication gate
provider proposal → structural validation → Phase-1 novelty → Phase-2 objective invariants → one bounded regeneration if rejected → publish exactly once. Failed proposals never persist; quota released per existing ledger.

## Persistence
No Phase-2 schema migration. Thread age/urgency/pacing history derived from canonical Scene history + generation input.

## LLM judge
Deferred. No production mandatory judge. Optional shadow telemetry remains YAGNI unless a trivial seam already exists.

## Telemetry
Prefer existing product events (scene_viewed / choice_committed / next_scene_requested) when present. No new analytics SDK in this stage.

Run focused gates:

```bash
npm --workspace @living-plot/api test -- narrative-quality
npm --workspace @living-plot/api run eval:narrative
```

# Choice-commit implementation slice 6

Status: COMPLETE — STOP GATE PASSED

## Scope
Commit exactly one offered choice for a ready episode, apply canonical episode/choice state atomically, and enforce idempotency/concurrency. Quota, TTS, billing, remote D1, deployment, notifications, and mobile UI are outside this slice.

## Completed
- Canonical plot-memory schema v2 with keyed affinity/trust/tension relationships, keyed facts, keyed threads, and tone.
- Deterministic legacy-v1 read/upgrade preserving relationship score and all fact/thread text.
- Pure choice-state application for episode-established facts/thread changes plus selected relationship/fact/thread/tone delta.
- Migration `0003_choice_commit.sql` adding committed choice provenance, state versions, and canonical state snapshot.
- `D1ChoiceCommitter` with owner/episode/choice membership checks and exact publication-state version enforcement.
- Same-choice idempotent replay before stale-version rejection; different-choice retry returns canonical `already_committed` winner.
- Atomic D1 batch: append choice history, complete episode, update canonical `plots.state_json`, advance plot version once.
- Deterministic episode/choice scoped keys for newly established facts and threads.
- Publication regression fix: no second episode may publish while any episode on the plot remains `ready`; blocked publication returns `pending_episode`.
- State, idempotency, stale-state, owner isolation, wrong-choice membership, corrupted-state, same-choice race, and different-choice race tests.
- Durable choice-commit/data-model/publication/foundation docs and changelog updates.

## Verification evidence
- Focused lint/typecheck: PASS for API and mobile.
- Focused API Vitest: 12 files, 52/52 tests PASS.
- Fresh Wrangler local D1 state: PASS.
  - `0001_initial.sql`: 13 commands PASS.
  - `0002_episode_publication.sql`: 15 commands PASS.
  - `0003_choice_commit.sql`: 8 commands PASS.
- Final clean `npm ci`: PASS — 898 packages from lockfile.
- Final root lint: PASS for API and mobile.
- Final root typecheck: PASS for API and mobile.
- Final API Vitest from clean install: 12 files, 52/52 tests PASS.
- Mobile test command: exits 0 with no behavior tests.

## Guarantees established
- Exactly one choice becomes canonical per episode.
- Retrying the canonical choice cannot apply its state twice or advance version twice.
- Concurrent different choices cannot both win; the loser learns the canonical committed choice ID.
- A commit cannot target another owner's plot or a choice from another episode.
- Choice commit requires the exact state version produced by that episode's publication.
- Invalid/corrupted canonical state is rejected before mutation.
- Successful commit persists a post-commit state snapshot in append-only history and materializes the same state in `plots.state_json`.
- New episode publication is blocked until the current ready episode has a canonical choice.

## STOP
Reached with PASS result. Slice 6 is complete. Do not begin quota/entitlement, TTS, billing, remote infrastructure, deployment, notifications, or mobile UI in this run.

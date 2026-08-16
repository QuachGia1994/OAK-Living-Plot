# Episode-publication implementation slice 5

Status: COMPLETE — STOP GATE PASSED

## Scope
Persist an already-validated episode proposal atomically with generation-key idempotency and optimistic plot-state version guards. Choice commit/state-delta application, quota, TTS, billing, remote D1, deployment, notifications, and mobile UI are outside this slice.

## Completed
- Migration `0002_episode_publication.sql`.
- Provider-neutral publication request/result/error contracts.
- `D1EpisodePublisher` with server-generated episode and choice IDs.
- Owner-scoped duplicate lookup by plot + generation key.
- Single D1 `batch()` transaction for episode, exactly three choice snapshots, and plot summary/version/episode-number advance.
- Optimistic guards on owner, active status, expected plot version, and expected next episode number.
- Same-key retry convergence before publication and after transaction-race failure.
- Persistence of script + episode facts/thread changes, choice intent/consequence/state deltas, model/provider metadata, attempt count, and token usage.
- Focused atomicity, idempotency, concurrency, stale-state, and ownership tests.
- Durable episode-publication architecture documentation.

## Verification evidence
- Fresh Wrangler local D1 state: PASS.
  - `0001_initial.sql`: 13 commands, PASS.
  - `0002_episode_publication.sql`: 15 commands, PASS.
- Clean `npm ci`: PASS — 898 packages from lockfile.
- Root lint: PASS for API and mobile.
- Root typecheck: PASS for API and mobile.
- API Vitest: 10 files, 40/40 tests passed.
- Mobile test command: exits 0 with no behavior tests.
- Concurrent same-key test: both requests resolve to one episode; state advances once.
- Concurrent different-key/same-version test: exactly one publication commits; loser returns `stale_state`; no partial loser rows remain.

## Guarantees established
- Publication uses server-generated episode/choice IDs; model output has no identifier authority.
- A generation key is unique per plot and duplicate retries return the original canonical episode.
- Plot ownership is part of both preflight and transactional publication guards.
- Publication advances `plots.version` and `next_episode_number` exactly once on success.
- Stale competing publication cannot partially persist an episode or choices.
- Exactly three offered choices persist with the intent, consequence, and state-delta snapshot required by the next choice-commit stage.
- Provider/model/attempt/token metadata is persisted with the canonical episode for later cost telemetry.

## STOP
Reached with PASS result. Slice 5 is complete. Do not begin choice commit/state-delta application, quota, TTS, billing, remote infrastructure, deployment, notifications, or mobile UI in this run.

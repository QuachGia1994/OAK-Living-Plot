# Phase 1 branch / choice-commit boundary

> updated 2026-08-18 · current application contract

## Responsibility

A user may select a provisional choice in the player, but only the server can commit a canonical branch. `DramaService` maps product `dramaId/sceneId` into the existing D1 choice-commit adapter; `D1ChoiceCommitter` performs the atomic storage mutation.

A successful commit:
1. appends one durable `choice_commits` row;
2. marks the persisted D1 scene row (`episodes`) completed;
3. applies the selected choice delta to `DramaState` in `plots.state_json`;
4. advances the persisted state version once;
5. is re-projected as `Branch { state: 'committed', choiceId, consequence }` by `D1DramaRepository`.

The UI never sets a canonical branch from local selection.

## DramaState

`apps/api/src/domain/drama-state.ts` owns relationship/fact/thread/tone memory. Current state is schema v2 and uses keyed facts/threads plus affinity/trust/tension relationship dimensions. Legacy persisted state can be upgraded when parsed; new state is serialized in the current shape.

The choice application order is deterministic:
1. apply scene-level fact/thread changes from the validated `SceneProposal`;
2. apply the selected relationship deltas;
3. resolve/add selected facts and threads;
4. set next tone;
5. reject duplicate keys or scores outside canonical bounds.

Unknown references or malformed persisted data return an explicit failure and write no canonical branch.

## Idempotency and concurrency

The D1 schema allows one commit per persisted scene row. The committer first checks owner-scoped existing state:
- replaying the same choice converges on the original commit;
- a different second choice returns `choice_conflict` with the canonical committed choice ID.

New commits are guarded by both the drama state version and the state version captured when the scene was published. The insert/update batch is conditioned on owner, drama, scene, choice membership, active lifecycle, ready scene, and expected version.

This prevents two conflicting choices from both advancing drama state. The mobile HTTP client resynchronizes the canonical drama after a conflict rather than trusting its provisional selection.

## Publication sequencing

A new scene cannot publish while the previous persisted scene is still awaiting a choice. `D1EpisodePublisher` retains its storage-oriented name because it writes the existing D1 `episodes` table, but its input is a provider-neutral `SceneProposal`.

## Verification

- `test/http-drama.test.ts` — canonical commit, conflicting second choice, idempotent replay, next scene uses committed consequence.
- `test/choice-commit.test.ts` — D1 transaction/version/idempotency behavior.
- `test/choice-state.test.ts` — deterministic `DramaState` application.
- mobile `test/http-drama-client.test.ts` — conflict resync.
- mobile `test/drama-domain.test.ts` — provisional selection/commit/consequence playback phases.

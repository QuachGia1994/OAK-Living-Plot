# Phase 1 episode publication boundary

> updated 2026-08-16 · 0.0.0

## Responsibility
Slice 5 converts one already-validated `EpisodeProposal` into canonical D1 rows. The publisher does not call Gemini and does not apply the user's later choice. It only publishes the episode, snapshots the three offered choices, updates the plot summary, and advances the publication state version/episode number.

## Idempotency
Each generation request carries a bounded `generationKey`. D1 enforces uniqueness for `(plot_id, generation_key)`.

Before publishing, the repository looks for an owner-scoped existing episode with that key. A retry returns the original episode and does not advance `plots.version` or `next_episode_number` again.

The same lookup is repeated after a failed transaction. This handles the race where two same-key requests both initially observe no episode: whichever transaction wins creates the episode; the loser resolves the winner and returns it as a replay.

## Optimistic state guard
Publication requires the caller's `expectedStateVersion` to match `plots.version`. The publisher also captures and guards the current `next_episode_number` and now refuses publication while any episode on the plot remains `ready`.

The first transactional statement is an `INSERT INTO episodes ... SELECT ... FROM plots` whose `WHERE` clause requires:

- matching plot ID and authenticated internal owner ID;
- active plot status;
- exact expected state version;
- exact expected next episode number;
- no existing `ready` episode on the plot.

If another publication wins first, this guarded insert produces no episode. The following choice insert then fails its foreign key, causing the D1 batch transaction to roll back instead of leaving partial rows. After rollback, the publisher re-reads canonical state and returns the winning same-key episode, `pending_episode`, or `stale_state` as appropriate.

## Atomic batch
One `D1Database.batch()` transaction contains:

1. guarded episode insert with server-generated episode ID;
2. choice A snapshot with server-generated ID;
3. choice B snapshot with server-generated ID;
4. choice C snapshot with server-generated ID;
5. guarded plot summary/version/next-episode advance.

Cloudflare D1 guarantees that batched statements are a SQL transaction and that a failing statement aborts/rolls back the sequence. No successful result is returned unless the whole publication batch commits.

## Persisted publication metadata
Migration `0002_episode_publication.sql` adds:

- `episodes.generation_key`;
- state version before/after publication;
- provider/model, controlled-attempt count, input tokens, and output tokens;
- choice key, intent, consequence, and `state_delta_json`.

The existing `episodes.script_json` stores the immutable episode script plus episode-established facts/thread changes as JSON. The three choice rows store each choice's immutable state-delta snapshot for the later choice-commit stage.

## Failure semantics
- malformed publication input: `invalid_input`;
- plot not owned/found: `not_found`;
- completed/archived plot: `inactive_plot`;
- another episode still awaits a choice: `pending_episode` with the canonical ready episode ID;
- optimistic version lost: `stale_state` with current version;
- unexpected D1 failure with no concurrent winner: `persistence_error`.

A duplicate same-key request is a success with `replayed: true`, not an error.

## Next boundary
Slice 6 now implements choice state-delta application and committed-choice idempotency in a separate `D1ChoiceCommitter`. Publication itself still only snapshots the offered episode/choices and advances the publication version.

## Deferred
Exact quota charging, TTS, RevenueCat, remote D1 provisioning, deployment, notifications, and mobile story UI remain outside these persistence slices.

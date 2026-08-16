# Phase 1 choice-commit boundary

> updated 2026-08-16 · 0.0.0

## Responsibility
Slice 6 converts one offered episode choice into canonical long-term plot memory. The committer does not call Gemini, charge quota, synthesize audio, or publish the next episode.

A successful choice commit performs three canonical mutations atomically:

1. append one durable `choice_commits` history row;
2. mark the ready episode `completed`;
3. replace `plots.state_json` with the new canonical v2 state and advance `plots.version` once.

## Canonical state v2
The original Slice 2 materialized state used a legacy v1 shape with a single relationship score and unkeyed fact/thread strings. That representation cannot safely apply Slice 4 choice deltas, which reference three relationship dimensions and keyed facts/threads.

Runtime canonical state is now v2:

```json
{
  "schemaVersion": 2,
  "relationships": [
    {
      "fromKey": "hero",
      "toKey": "linh",
      "affinity": 40,
      "trust": 35,
      "tension": 45,
      "status": "strained"
    }
  ],
  "facts": [{ "key": "fact-hidden-message", "text": "An hid a message from Linh." }],
  "openThreads": [{ "key": "thread-trust", "title": "Linh questions An’s honesty.", "urgency": 80 }],
  "tone": "tense"
}
```

`parseStructuredPlotState()` still accepts legacy v1. It upgrades legacy relationship scores to a preserved `legacy -> key` relationship, assigns deterministic `legacy-fact-N` and `legacy-thread-N` keys, and keeps all legacy text. New committed state is always serialized as v2.

## State application order
For the selected choice, the server applies state in this order:

1. resolve episode-level thread keys;
2. add episode-level opened threads and established facts using deterministic episode-scoped keys;
3. apply selected relationship deltas;
4. resolve selected fact keys and add selected facts with deterministic choice-scoped keys;
5. resolve selected thread keys and add selected threads with deterministic choice-scoped keys;
6. set the selected next tone;
7. validate duplicate keys and relationship score bounds.

Unknown resolution keys, malformed stored data, or relationship values outside canonical bounds return `invalid_state` and write nothing.

## Idempotency
`choice_commits` already enforces one commit per episode. The server first reads the owner-scoped existing commit before checking state version.

- retry of the same `choiceId`: returns the original commit with `replayed: true`;
- retry with another `choiceId`: returns `already_committed` and the canonical committed choice ID.

This means a network retry after a successful commit remains idempotent even though the caller's old expected state version is now stale.

## Optimistic concurrency
A new commit requires both:

- `plots.version == expectedStateVersion`;
- `episodes.state_version_after_publish == expectedStateVersion`.

The append statement is an `INSERT ... SELECT` guarded by owner, plot, episode, selected choice membership, active plot, ready episode, and exact state version.

The episode-completion and plot-state updates are conditioned on the newly generated commit ID existing. Therefore, if the guarded insert produces no row, later statements in the same batch are no-ops. After the batch, the server re-reads canonical commit/state and classifies the race as replay, `already_committed`, `stale_state`, or persistence failure.

Concurrent different choices therefore cannot both mutate plot state. Concurrent retries of the same choice converge on one commit.

## Publication sequencing fix
Slice 6 also closes a cross-slice invariant discovered while wiring commits: Slice 5 publication now refuses a different generation key while any episode on the plot is still `ready`.

A blocked second publication returns `pending_episode` with the canonical ready episode ID. The transactional publication guard also checks that no ready episode exists. This prevents advancing `plots.version` past an uncommitted choice and making that choice permanently stale.

## Migration 0003
`0003_choice_commit.sql` adds immutable commit provenance:

- committed choice key, intent, and consequence;
- state version before/after commit;
- `state_json_after`, the canonical materialized state snapshot after the commit;
- an episode/choice lookup index.

The original append-only `choice_commits` row remains the durable decision history.

## Deferred
Quota accounting, entitlement enforcement, TTS, RevenueCat, remote D1 provisioning, deployment, notifications, and mobile story UI remain outside this slice.

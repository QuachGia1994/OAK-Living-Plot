# Phase 1 D1 data model

> updated 2026-08-16 · 0.0.0

## Source of truth
Cloudflare D1 is the canonical Phase 1 story/product state. `apps/api/migrations/*.sql` is the schema source of truth. AI/TTS/provider responses are not canonical until server validation succeeds and the resulting state is persisted.

## Tables

### `users`
Internal user identity. `auth_subject` is nullable and unique. Authenticated requests map the verified Clerk subject to this field, while `users.id` remains the internal ownership key used by plots and usage counters.

### `plots`
One interactive story owned by a user. Stores the materialized structured memory (`state_json`), compact plot summary, optimistic `version`, and `next_episode_number`.

### `characters`
Characters belonging to one plot. `traits_json` remains structured JSON but provider-neutral.

### `episodes`
Canonical validated episodes. Episode numbers are unique inside a plot. Migration `0002_episode_publication.sql` adds the per-plot generation/idempotency key, publication state versions, provider/model provenance, controlled-attempt count, and token usage. Only `ready` and `completed` states are persisted; raw AI drafts remain outside canonical state.

### `episode_choices`
The three candidate choices attached to an episode. SQL enforces positions 1–3 and uniqueness per episode; the TypeScript domain contract enforces exactly three choices before persistence. Migration 0002 adds A/B/C key, intent, consequence, and the serialized state-delta snapshot needed for later choice commit.

### `choice_commits`
Append-only committed choice history. An episode can be committed once, sequence numbers are unique within a plot, and composite foreign keys prevent committing a choice from another episode. Migration `0003_choice_commit.sql` adds choice key/intent/consequence, state versions before/after commit, and the canonical `state_json_after` snapshot.

### `daily_usage`
Server-side counters for fresh text and voiced episode generation. The schema enforces non-negative counts and `voiced_episodes <= text_episodes`. Subscription/entitlement provider state is intentionally deferred.

## Structured memory
Phase 1 does not use Vectorize or a vector database. Runtime canonical plot state is schema v2 with keyed relationships/facts/threads:

```json
{
  "schemaVersion": 2,
  "relationships": [
    { "fromKey": "hero", "toKey": "linh", "affinity": 40, "trust": 35, "tension": 45, "status": "strained" }
  ],
  "facts": [{ "key": "fact-hidden-message", "text": "An hid a message from Linh." }],
  "openThreads": [{ "key": "thread-trust", "title": "Linh questions An’s honesty.", "urgency": 80 }],
  "tone": "tense"
}
```

Legacy v1 state is still read and deterministically upgraded without dropping its text. Relationship affinity/trust remain -100…100, tension remains 0…100, and fact/thread keys are unique. Choice commits remain the durable decision history; `plots.state_json` is the read-optimized current state.

## Local migration

```bash
npm --workspace @living-plot/api run db:migrate:local
```

The current Wrangler `database_id` is a non-production placeholder and `preview_database_id` is `living-plot-local`. A real remote D1 database ID must be supplied in a later deployment slice before any remote migration/deploy command is used.

## Invariants covered by tests
- Core tables and supporting indexes exist.
- Publication generation keys are unique per plot and duplicate retries converge on the original episode.
- Concurrent publications at the same expected state version cannot both commit; the loser leaves no partial episode/choice rows.
- A plot cannot publish another episode while an existing episode remains `ready`.
- Same-choice commit retries converge on one append-only commit; different-choice races produce one canonical winner.
- Choice commit advances canonical plot state/version once and leaves no partial episode/state mutation on failure.
- Choice position 4 is rejected.
- Only one choice can be committed per episode.
- A choice cannot be committed against a different episode.
- Voiced daily usage cannot exceed text episode usage.
- Repository reads structured plot memory and character state through one D1 boundary.

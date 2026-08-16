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

### `usage_events`
Append-only quota audit ledger added in migration `0004_quota_ledger.sql`. Records `reserved`, `consumed`, and `released` transitions for text/voice work on the reservation's original UTC day.

### `quota_reservations`
Materialized current quota-reservation lifecycle keyed by `(user_id, reservation_key)`. Used to make reserve/consume/release idempotent and race-safe.

### `daily_usage`
Materialized UTC-day enforcement counters. Migration 0004 rebuilds the table with independent text/voice consumed counters plus text/voice in-flight reservation counters. Effective quota usage is `consumed + reserved`; voice is no longer constrained by same-day text consumption.

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
- Free/Plus text and voice quotas are enforced atomically under concurrent reservation attempts.
- Quota reserve/consume/release retries are idempotent and materialized counters reconcile with the append-only usage ledger.
- Voice quota is independent from same-day text consumption and UTC rollover preserves the reservation's original day.
- Repository reads structured plot memory and character state through one D1 boundary.

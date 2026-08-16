# Phase 1 D1 data model

> updated 2026-08-16 · 0.0.0

## Source of truth
Cloudflare D1 is the canonical Phase 1 story/product state. `apps/api/migrations/*.sql` is the schema source of truth. AI/TTS/provider responses are not canonical until server validation succeeds and the resulting state is persisted.

## Tables

### `users`
Internal user identity. `auth_subject` is nullable and unique. Authenticated requests map the verified Clerk subject to this field, while `users.id` remains the internal ownership key used by plots and usage counters.

### `plots`
One interactive story owned by a user. Stores the materialized structured memory (`state_json`), compact plot summary, optimistic `version`, and `next_episode_number`. Migration `0007_live_story_integration.sql` adds per-user `creation_key` idempotency plus persisted `locale` and initial `mood` for live mobile creation/resume. Evolving tone remains canonical inside `state_json`.

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

### `audio_assets`
Derived episode voice lifecycle added by migration `0005_tts_audio.sql`. Exactly one asset exists per `(episode_id, voice_variant)`. The row stores only backend provider metadata and a private R2 `object_key`; no public URL is canonical. States are `reserving`, `queued`, `processing`, `staged`, `ready`, and `failed`. `staged` means R2 already contains the MP3 but quota/final-ready persistence is still being reconciled, so a retry must not call the TTS provider again.

### `revenuecat_events`
Append-only normalized RevenueCat delivery audit added by migration `0006_revenuecat_entitlements.sql`. Provider event ID is the idempotency key. Raw webhook bodies and store receipts are not persisted. Each accepted event records the internal user, minimal provider metadata, subscriber snapshot timestamp, and resulting tier.

### `user_entitlements`
One materialized Free/Plus row per internal user. Updates are monotonic by RevenueCat subscriber `request_date_ms`, so an older provider snapshot cannot overwrite newer state. A finite expired Plus row is read as effective Free using the server clock even if the next webhook is delayed.

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
- Concurrent audio requests for one episode/voice converge on one asset, one voice reservation, and one Queue job.
- Ready audio replay does not reserve or consume fresh voice quota.
- R2 object keys remain backend-only and audio reads are owner-scoped through the Worker.
- Retryable TTS/R2 work can resume without corrupting story state; staged retries do not synthesize twice.
- RevenueCat event IDs are append-only idempotency keys; duplicate webhook delivery does not duplicate entitlement history or provider refresh.
- Older RevenueCat subscriber snapshots cannot overwrite newer entitlement state, and expired finite Plus state fails closed to Free on read.
- Voice quota reads the backend materialized entitlement and cannot be elevated by a client tier flag.
- Repository reads structured plot memory and character state through one D1 boundary.
- Live mobile plot creation retries converge by `(user_id, creation_key)` and cannot move ownership by supplying a client user ID.
- Live story continuation derives generation context and choice state version from canonical D1 state; the client cannot authorize a stale/cross-owner mutation.

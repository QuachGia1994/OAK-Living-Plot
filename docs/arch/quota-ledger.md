# Phase 1 quota ledger and UTC enforcement

> updated 2026-08-16 · 0.0.0

## Policy
Phase 1 quota limits are server constants from the product/economic design:

- Free: 3 text episodes per UTC day, 1 fresh voice generation per UTC day.
- Plus: 20 text episodes per UTC day, 10 fresh voice generations per UTC day.
- No unlimited tier.

The quota tier is a trusted server-side input. RevenueCat/provider-verified entitlement ingestion is not implemented in Slice 7, so clients have no authority to choose their own tier.

## Why reservation exists
Quota must be checked before an external AI/TTS provider call, not after it. A simple consumed counter is insufficient because concurrent requests can all observe the same remaining slot and overspend before any one finishes.

`D1QuotaLedger.reserve()` therefore atomically claims one in-flight slot before provider work begins. The caller must later make exactly one terminal transition:

- `consume()` when a canonical resource was successfully created;
- `release()` when provider/application work failed and the user should regain the slot.

Retries use the same reservation key.

## Canonical records

### `usage_events`
Append-only audit ledger. Each logical reservation can emit at most one event of each type:

- `reserved`;
- `consumed`;
- `released`.

Events retain the reservation's original UTC day. They are never deleted to refund quota.

### `quota_reservations`
Materialized current lifecycle for one server-side reservation key. Status is `reserved`, `consumed`, or `released`. `last_event_id` lets one D1 transaction condition counter changes on the exact transition that won a race.

### `daily_usage`
Materialized enforcement counters:

- text consumed;
- voice consumed;
- text in-flight reserved;
- voice in-flight reserved.

Effective usage for a resource is `consumed + reserved`. A reservation is accepted only when effective usage is below the tier limit.

Migration `0004_quota_ledger.sql` rebuilds the old table and removes the old `voiced_episodes <= text_episodes` constraint. Voice quota is intentionally independent because a user may request fresh voice for an older text episode on a day when no new text episode is generated.

## UTC day rule
The service derives `YYYY-MM-DD` from server UTC time. Client timestamps/date strings are not accepted.

A reservation remains attached to the UTC day on which it was created. If provider work crosses midnight, its later consume/release updates that original day's ledger/counter. A new reservation after midnight uses the new UTC day and its fresh daily limit.

## Atomic reserve
One D1 `batch()` transaction:

1. ensures the `(user, UTC day)` counter row exists;
2. inserts a reservation only if `consumed + reserved < tier limit` and the key is unused;
3. appends the `reserved` ledger event only for that newly generated reservation ID/event ID;
4. increments the matching in-flight counter only for that exact event.

Concurrent unique keys therefore cannot exceed the limit. Concurrent retries with the same key converge on the original reservation.

## Atomic consume/release
A terminal transition first changes the reservation only from `reserved` and assigns a unique `last_event_id`. The ledger append and daily counter update both require that exact event ID.

This makes concurrent consume/release safe: only one transition wins. The loser reads canonical status and returns an idempotent replay or `invalid_transition`; it cannot decrement/increment counters twice.

## Idempotency
- Same reservation key + same resource: returns canonical reservation state with `replayed: true` when appropriate.
- Same key reused for another resource type: `key_conflict`.
- Repeated consume with the same canonical resource ID: replay success, no duplicate counter/event.
- Repeated release: replay success, no duplicate counter/event.
- Consume after release or release after consume: `invalid_transition`.

## Reconciliation
`reconcileDay()` independently projects expected counters from the append-only ledger:

- consumed = count of `consumed` events;
- in-flight reserved = `reserved - consumed - released`.

Tests require this projection to equal `daily_usage` after success, provider-release, retries, UTC rollover, and concurrent races.

## Integration boundary
Slice 7 provides the server-side quota enforcement primitive. Future story/TTS orchestration must call `reserve()` before the provider and `consume()`/`release()` afterward. No provider call should be introduced without that lifecycle.

## Deferred
RevenueCat entitlement events/materialization, TTS, Cloudflare Queues/R2, AI-operation cost ledger, remote D1 provisioning, deployment, notifications, and mobile quota/paywall UI remain outside this slice.

# Quota ledger and UTC enforcement

> updated 2026-08-19 · current server contract

## Policy
Current limits remain server-owned:

- Free: 50 generated Scenes per UTC day, 1 fresh cloud narration per UTC day.
- Plus: 100 generated Scenes per UTC day, 10 fresh cloud narrations per UTC day.
- Successful referral rewards may add persistent voice bonus credits; these are not a daily tier and do not raise text quota.
- Store/production runtime keeps those limits enforced.
- The isolated development preview runtime uses server-owned `QUOTA_MODE=preview_unlimited`: requests still pass through the same D1 reservation/consume/release ledger for observability and idempotency, but the daily limit guard does not reject Scene or fresh-voice work while the product is being tested.

`preview_unlimited` is an environment/runtime policy, not an entitlement tier and not a client flag. Missing, unknown, or production values fail closed to `enforced`, so a Store client cannot unlock preview access. The trusted tier still comes from backend entitlement state; clients cannot select their own quota tier. D1 stores historical resource strings `text_episode` and `voice_episode`; those are persistence vocabulary for generated-scene and fresh-voice usage.

## Why reservation exists
Quota is claimed before an external scene/TTS provider call. `D1QuotaLedger.reserve()` atomically owns one in-flight slot. The caller then makes one transition for that attempt:

- `consume()` after a canonical resource is successfully persisted;
- `release()` after provider/application failure so the slot returns to the user.

A stable reservation key identifies the logical work. If a failed attempt was released, retrying that same logical key may **re-arm** the reservation rather than creating a second logical job.

## Canonical records

### `usage_events`
Append-only transition ledger. Migration `0009_retryable_quota_reservations.sql` removes the old uniqueness constraint on `(user, reservation_key, event_type)` so one logical key can record more than one reserve/release cycle across explicit retries.

Every transition still has a unique event ID and is written only by the transition that wins the materialized reservation's `last_event_id` guard. Events are never deleted to refund quota.

### `quota_reservations`
One materialized lifecycle row per `(user_id, reservation_key)`. Status is `reserved`, `consumed`, or `released`. A released row can move back to `reserved` for an explicit retry. When it is re-armed, its `utc_day` moves to the current server UTC day so a retry never consumes yesterday's allowance.

### `daily_usage`
Materialized enforcement counters for consumed and in-flight text/voice work. Effective usage is `consumed + reserved`; a new or re-armed reservation succeeds only while that current UTC-day total is below the trusted tier limit.

## UTC rule
Server time is authoritative. Client timestamps are not accepted.

A currently reserved attempt remains attached to the UTC day on which that attempt was reserved, so work crossing midnight consumes/releases against its reservation day. If the attempt fails and is released, a later explicit re-arm uses the **new current UTC day** and that day's quota.

The append-only ledger therefore preserves both cycles:

`reserved(day A) → released(day A) → reserved(day B) → consumed(day B)`.

## Atomic transitions

Initial reserve and released-reservation re-arm both use guarded D1 batches:
1. ensure the current daily counter row exists;
2. materialize the reservation transition only when current effective usage is below the limit;
3. append a uniquely identified transition event only for the winning `last_event_id`;
4. adjust exactly the matching current-day counter.

Consume/release similarly change only a currently `reserved` row and condition the event/counter changes on one transition event ID. Competing terminal transitions therefore cannot both mutate counters.

## Idempotency

- Same key + same resource while reserved/consumed: canonical replay, no duplicate counter mutation.
- Same key after `released`: explicit reserve re-arms the same logical work under the current UTC-day limit.
- Same key reused for another resource type: `key_conflict`.
- Repeated consume with the same resource ID: replay success.
- Repeated release while already released: replay success until a later explicit reserve begins a new attempt cycle.
- Consume/release without a currently reserved attempt: explicit `invalid_transition` where applicable.

## Reconciliation

`reconcileDay()` independently projects expected materialized counters from all append-only events on that UTC day:

- consumed = count of `consumed` events;
- in-flight = `reserved - consumed - released`.

Because retries append new events, the arithmetic remains valid for same-day and cross-day retry cycles. Tests verify initial reservations, provider release, same-key re-arm, consumption, concurrent races, and UTC rollover.

## Integration boundary

`DramaService` reserves before `SceneGenerator`; provider failure releases the reservation. Retrying the same generation key re-arms that reservation. `D1AudioService` uses `D1VoiceQuota`: it first reserves from the normal daily voice ledger, then falls back to a persistent referral bonus credit only when daily voice quota is exhausted. Referral bonus reservations have the same reserve/release/consume lifecycle so queue/provider failures refund the bonus credit and successful private audio consumes exactly one. Neither UI nor provider adapter mutates quota counters directly.

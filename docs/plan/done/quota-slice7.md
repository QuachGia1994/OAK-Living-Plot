# Quota implementation slice 7

Status: COMPLETE — STOP GATE PASSED

## Scope
Implement server-side UTC quota policy, append-only usage ledger, materialized counters, and atomic/idempotent reserve/consume/release. RevenueCat entitlement ingestion, TTS, remote D1, deployment, notifications, and mobile UI are outside this slice.

## Completed
- Migration `0004_quota_ledger.sql`.
- Free 3 text/1 voice and Plus 20 text/10 voice per UTC day policy.
- Rebuilt `daily_usage` with independent text/voice consumed and in-flight reservation counters.
- Removed the invalid legacy dependency that required same-day text consumption before voice consumption.
- Append-only `usage_events` plus materialized `quota_reservations` lifecycle.
- `D1QuotaLedger.reserve()`, `consume()`, `release()`, daily read, and independent ledger reconciliation.
- Server-clock-only UTC day derivation; terminal transitions remain on the reservation's original UTC day across midnight.
- Same-key idempotency, cross-resource key conflict, repeated terminal transition handling, and consume/release race safety.
- Atomic concurrent enforcement using `consumed + reserved` effective usage.
- Reset/test utilities made forward-compatible with optional later tables.
- Durable quota/data-model/foundation documentation and changelog update.

## Verification evidence
- Focused lint/typecheck: PASS for API and mobile.
- Focused API Vitest: 13 files, 63/63 tests PASS.
- Fresh Wrangler local D1 state: PASS.
  - `0001_initial.sql`: 13 commands PASS.
  - `0002_episode_publication.sql`: 15 commands PASS.
  - `0003_choice_commit.sql`: 8 commands PASS.
  - `0004_quota_ledger.sql`: 9 commands PASS.
- Final clean `npm ci`: PASS — 898 packages from lockfile.
- Final root lint: PASS for API and mobile.
- Final root typecheck: PASS for API and mobile.
- Final API Vitest from clean install: 13 files, 63/63 tests PASS.
- Mobile test command: exits 0 with no behavior tests.
- Free concurrent text contention: exactly 3 reservations win.
- Plus concurrent text contention: exactly 20 reservations win.
- Voice-only consumption with zero same-day text: PASS.
- UTC rollover preserves old reservation day and starts a fresh new-day quota: PASS.
- Mixed reserve/consume/release and terminal race reconciliation: PASS.

## Guarantees established
- Quota can be reserved before provider work so concurrent external calls cannot oversubscribe the daily limit.
- Provider/application failure can release a reservation without deleting audit history.
- Successful work consumes the reservation exactly once.
- Daily enforcement counters reconcile with an independent append-only ledger projection.
- Client date/time is not part of quota authority.
- Reservation keys are idempotent and cannot be reused for another resource type.
- Text and fresh voice quotas are independent resources.

## STOP
Reached with PASS result. Do not begin RevenueCat entitlement ingestion, TTS, Queues/R2, remote infrastructure, deployment, notifications, or mobile UI in this run.

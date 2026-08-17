# Slice 24 — Mobile network resilience

Status: COMPLETE — STOP GATE PASSED

Added a shared authenticated JSON transport with bounded timeout/abort behavior. Safe GET requests retry once and obtain a fresh bearer token for each attempt; POST mutations never retry automatically. Story mutation idempotency keys remain stable across explicit retry after uncertain responses.

Story, audio status/playback authorization, backend identity, and entitlement reads now use the transport. Tests cover timeout, GET retry, fresh tokens, and no automatic POST duplication.

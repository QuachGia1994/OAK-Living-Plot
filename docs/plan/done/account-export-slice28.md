# Slice 28 — Owner-scoped data export

Status: COMPLETE — STOP GATE PASSED

Added authenticated `GET /v1/account/export` with schema-versioned application-data export. The snapshot contains user-owned preferences, entitlement summary, usage, plots, characters, validated episode text/summaries, choices, commit markers, and client-safe audio metadata.

Tests prove the export excludes authentication identity/tokens, provider voice IDs, quota reservation keys, private R2 object keys, provider secrets, raw RevenueCat webhook data, telemetry rows, and audio bytes. Mobile exposes the export only through a user-initiated native Share sheet.

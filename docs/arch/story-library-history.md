# Phase 1 story library and history

> updated 2026-08-17 · 0.0.0

## Plot lifecycle
D1 `plots.status` remains the lifecycle source of truth. Slice 21 uses the existing `active` and `archived` states; it does not add a second archive table or local-only flag.

`GET /v1/story/library` returns owner-scoped active and archived summaries. `POST /v1/story/plots/:plotId/archive` and `/restore` are idempotent. Archived plots disappear from home/retention active counts but remain readable. Choice commit and next-episode generation require an active plot, so archive is reversible read-only storage rather than destructive deletion.

## Canonical recap
`GET /v1/story/plots/:plotId/history` reconstructs the timeline directly from persisted episodes, choice commits, and episode choices. Items are ordered by episode number and expose only episode title/summary, current/committed status, chosen A/B/C action, and committed consequence.

History never exposes `state_json`, prompt context, raw generation metadata, provider payloads, auth identity, or unpublished client selection. The mobile history screen is read-only.

## Ownership
Every library/lifecycle/history operation is resolved from the authenticated internal user ID. Foreign plots return the same not-found boundary as other owner-scoped story reads.

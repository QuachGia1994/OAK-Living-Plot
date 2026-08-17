# Phase 1 mobile resilience and accessibility

> updated 2026-08-17 · 0.0.0

## Authenticated HTTP transport
Story, private audio, backend identity, and entitlement reads share one authenticated transport. Each attempt obtains a current bearer token and is bounded by an AbortController timeout.

Safe `GET` requests may retry once after a transport failure or 5xx response. Mutating `POST` requests never retry automatically. Story creation/next generation continue to retain their existing idempotency keys across explicit user/manual retry after an uncertain response.

## App lifecycle
Home and the current story perform read-only refreshes when the app returns from background/inactive to active. Foreground refresh never commits a choice, generates an episode, archives/restores a plot, starts a purchase, or requests fresh voice generation.

## Render failure
The root error boundary replaces a crashed React tree with a local interface-recovery surface. Resetting the boundary rebuilds UI only; it does not write canonical state or clear server-owned data.

## Accessibility
Shared action buttons expose disabled/busy state and labels. Loading and error surfaces use live-region/progress semantics; choices expose selected/disabled state; voice playback exposes progress. Motion reveal checks the operating-system Reduce Motion preference and falls back to immediate visibility if that query fails.

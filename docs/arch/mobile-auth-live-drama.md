# Phase 1 mobile auth and live drama

> updated 2026-08-19 · current application contract

## Identity boundary

Clerk authenticates the external session. The Worker resolves that subject to one internal Living Plot user before any protected application read or mutation. Mobile never supplies the canonical internal user ID for drama ownership.

## Protected drama API

The live mobile core uses:
- `GET /v1/dramas/home`
- `GET /v1/dramas/library`
- `POST /v1/dramas`
- `GET /v1/dramas/:dramaId`
- `GET /v1/dramas/:dramaId/history`
- `POST /v1/dramas/:dramaId/archive|restore`
- `POST /v1/dramas/:dramaId/scenes/:sceneId/choices/:choiceId`
- `POST /v1/dramas/:dramaId/scenes`
- `POST /v1/scenes/:sceneId/voice`
- `GET /v1/media/:assetId/status`
- `GET /v1/media/:assetId`

All IDs are checked against the authenticated internal owner before canonical state or private media is returned.

## Mobile client boundary

`DramaExperienceClient` is the application interface. The authenticated implementation uses fresh Clerk bearer tokens through the shared bounded transport. Preview implements the same Drama/Scene/Branch behavior for local UI development but is never used as a runtime fallback after a configured live provider/API failure.

Safe GETs may retry once with a fresh token. POST mutations are never automatically retried by the transport. Instead, drama creation/continuation uses stable idempotency keys and canonical resync behavior.

`AuthenticatedRuntimeProvider` keys the session-owned runtime by preview/live-auth state and Clerk user ID. A sign-out, sign-in transition, or account switch therefore unmounts the prior Drama/voice runtime subtree, disposing private narration state and transient canonical projections before a different principal can render them.

## Canonical resync

The mobile player does not manufacture success after a lost response or choice conflict. `HttpDramaExperienceClient` reloads the canonical `Drama` when conflict/stale semantics require resynchronization; `useDramaPlayback` then derives the visible playback phase from that server state.

## Billing identity

RevenueCat purchase state and D1 entitlement state remain separate from Clerk auth but share the same resolved internal Living Plot identity. The client cannot self-assert Plus tier.

See `drama-runtime.md` for the complete owner map and `auth-security.md` for session verification details.

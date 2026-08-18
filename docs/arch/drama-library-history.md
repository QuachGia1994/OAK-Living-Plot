# Phase 1 drama library and history

> updated 2026-08-18 · current application contract

`D1DramaRepository` owns the owner-scoped projection used by Home, Library, resume, and History. Mobile does not reconstruct canonical drama state from cards or cached text.

## Library lifecycle

- `GET /v1/dramas/library` returns active/archived `DramaSummary` values.
- `POST /v1/dramas/:dramaId/archive` and `/restore` are owner-scoped and idempotent.
- archived dramas remain readable but branch/continuation mutations are rejected until restore.
- `DramaSummary` uses `sceneNumber` and `awaiting_choice | ready_for_next_scene`; D1 `episode_number` is not exposed as application terminology.

## History

`GET /v1/dramas/:dramaId/history` returns ordered `DramaHistory`:
- `dramaId`;
- scene ID/number/title/summary;
- `branchState: open | committed`;
- committed choice key/label/consequence when present.

History is reconstructed from persisted D1 scene/choice rows. It never trusts a mobile-side replay of choices and does not expose `state_json`, provider payloads, auth identity, or storage keys.

## Resume

`GET /v1/dramas/:dramaId` projects the latest persisted scene into the canonical `Drama`. The mobile playback controller resumes from that projection, so app restart/foreground refresh never manufactures branch success locally.

## Verification

- API `http-drama.test.ts` proves persisted restore, owner isolation, history order, archive/restore and mutation lock.
- Mobile `http-drama-client.test.ts` proves storage vocabulary is normalized to Drama/Scene/Branch contracts.
- Preview client tests apply the same lifecycle and history semantics for deterministic UI development.

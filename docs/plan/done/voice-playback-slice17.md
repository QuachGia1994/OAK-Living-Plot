# Voice playback slice 17

Status: COMPLETE WITH LIVE PROVIDER SMOKE BLOCKED

## Scope
Connected the existing private TTS/R2 lifecycle to the Expo story experience while keeping text canonical and independently usable.

## Implemented
- Added owner-scoped JSON `GET /v1/audio/:assetId/status` for safe polling.
- Added authenticated mobile audio request/status/playback client.
- Added Expo Audio playback with Authorization headers, progress, pause, replay, pending polling, and graceful failure copy.
- Preserved server voice-quota and approved-voice authority.

## Verification
API tests cover owner/attacker status access and private stream separation. Mobile tests cover fresh auth headers, status parsing, protected playback source, quota errors, and missing-session failure.

## External blocker
No live Google TTS credential/network request or remote Queue/R2 run was possible because development credentials/resources were absent.

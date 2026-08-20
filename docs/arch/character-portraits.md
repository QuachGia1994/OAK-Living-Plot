# Derived character portraits

> updated 2026-08-19 · current derived-media contract

## Ownership
Character identity and story state remain canonical D1 text/domain data. A portrait is optional derived media. Portrait failure, provider delay, or R2 failure never blocks Scene publication, choice commit, continuation, History, or account restore.

## Story fingerprint
The backend derives a SHA-256 fingerprint from bounded owner-scoped inputs: protagonist ID/name/traits, drama premise/mood/summary, latest Scene number/title/summary, and the current committed branch label/intent/consequence when one exists. One `(drama, fingerprint)` maps to one portrait generation record. Repeating Generate for the same fingerprint replays the canonical row instead of spending another provider call.

A branch commit therefore invalidates the portrait immediately, even before the next Scene is generated. The previous ready portrait remains available as `stale` until the user explicitly requests an update. The mobile card rechecks status when the current Scene/branch revision changes, but the app never regenerates images merely because a screen mounted or foregrounded.

## Identity continuity
Development uses Workers AI behind the `AI` binding. The primary path is FLUX.2 Klein 4B: the first portrait is generated from structured protagonist/story context, and later updates supply the latest ready private portrait as `input_image_0`; generated portraits remain 480×480 so the identity reference stays inside the provider input-size boundary. The prompt asks the provider to preserve the same face, apparent age, hair, eye shape, and core identity while adapting expression, wardrobe, and lighting to the current story.

If the primary partner model is unavailable, the service retries once through the Cloudflare-hosted FLUX.1 Schnell text-to-image model. That fallback keeps optional portrait creation available but does not claim reference-image identity continuity; the database records the model that actually produced the winning private image. If both providers fail, the existing ready portrait or bundled fallback remains visible and canonical text story state is untouched.

This is a continuity aid, not a canonical biometric identity guarantee. The text character record remains authority if an image drifts.

## Private delivery
Provider output is accepted only when its decoded bytes identify as JPEG, PNG, or WebP. The winning generation is stored privately in R2 under a tokenized key such as `portraits/{dramaId}/{fingerprint}/{generationToken}.{ext}`. The generation token prevents a stale concurrent worker from overwriting the winning object; losing temporary objects are removed best-effort. Client DTOs expose only status/timestamps and never expose the object key, generation token, model prompt, or provider payload.

Owner-scoped routes:
- `GET /v1/dramas/:dramaId/portrait/status`
- `POST /v1/dramas/:dramaId/portrait`
- `GET /v1/dramas/:dramaId/portrait`

The media GET authenticates the drama owner before private R2 read and sends private cache headers. If the current fingerprint has no ready image, the latest older ready portrait may be delivered as stale. The bundled Mina illustration remains the zero-network mobile fallback.

## Account deletion
Account erasure deletes both private narration objects and private character portraits from R2 before deleting the D1 user so D1 cascade cannot orphan object keys.

## Cost boundary
Portrait updates are explicit user actions rather than per-Scene automatic work. Product quota for text Scenes does not imply a matching portrait-generation allowance; provider capacity/cost remains an operational constraint and can be given its own quota later if usage data requires it.

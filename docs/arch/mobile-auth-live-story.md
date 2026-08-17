# Phase 1 mobile auth and live-story integration

> updated 2026-08-17 · 0.0.0

## Identity trust chain
The mobile client never chooses its canonical owner ID.

1. Expo initializes Clerk with the public `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and a SecureStore-backed token cache.
2. JavaScript email OTP uses Clerk sign-in-or-up with `signUpIfMissing`, so account existence is not disclosed before email verification.
3. Every protected Living Plot API request asks Clerk for the current session token and sends it as `Authorization: Bearer ...`.
4. The Worker verifies that session and maps the verified Clerk subject to an internal `users.id`.
5. Plot ownership, quota, entitlement, publication, choice commits, audio ownership, and RevenueCat App User ID all use that internal ID on the server boundary.

The mobile client does not send `userId` or authoritative plot state versions for live story mutations. A forged user field in a request body is ignored by the HTTP contract.

## Runtime modes
When both the Clerk publishable key and Living Plot API URL are configured, the app is in live mode. A configured but signed-out app does not silently fall back to preview stories; it requires authentication.

The deterministic preview `StoryExperienceClient` remains only as a local-development fallback when Clerk/API public configuration is intentionally absent. Preview state is never uploaded or treated as canonical.

## Mobile email OTP
The Phase 1 native screen is a custom JavaScript flow:

- create sign-in with email plus `signUpIfMissing: true`;
- send an email code;
- verify the code;
- finalize an existing-user sign-in, or transfer the verified identifier to sign-up;
- fail closed with a configuration message if the Clerk instance requires extra sign-up fields or additional verification not supported by the email-only Phase 1 contract.

No Clerk secret key is present in the mobile workspace.

## Live story HTTP contract
All routes below are protected by the existing Clerk session verifier and internal-user resolver.

- `GET /v1/story/home` — recent owned plots, backend quota projection, and retention metadata derived from canonical choice history.
- `POST /v1/story/plots` — idempotent plot creation and first episode generation.
- `GET /v1/story/plots/:plotId` — latest canonical episode for one owned plot.
- `POST /v1/story/plots/:plotId/episodes` — generate/publish the next episode after a committed choice.
- `POST /v1/story/plots/:plotId/episodes/:episodeId/choices/:choiceId` — commit exactly one server-owned choice.

The create request carries a client-generated `creationKey` and a generation key, but never an owner ID. `creationKey` is unique per internal user and lets a lost mobile response converge on the same plot rather than create a duplicate. The mobile client retains both creation and generation keys across uncertain network failures. Next-episode requests similarly retain one generation key per plot until canonical success or a definite invalid request. Episode generation uses the existing server quota ledger, Gemini provider boundary, D1 episode publisher, and publication idempotency. Choice commit derives its expected state version from D1 rather than accepting a client version; stale/conflicting mobile responses reload canonical server state.

## Plot integration metadata
Migration `0007_live_story_integration.sql` adds:

- nullable `plots.creation_key`, unique per user when present;
- persisted `plots.locale` for stable generation language across episodes;
- persisted initial `plots.mood` for mobile presentation while evolving canonical tone remains in `state_json`.

This is additive and preserves plots created by earlier slices through defaults.

## Quota and failure semantics
Text generation resolves Free/Plus from backend materialized entitlement, reserves text quota before calling Gemini, consumes only after publication succeeds, and releases the reservation on provider/publication failure. A retry that finds an already-ready episode returns that canonical episode instead of generating again.

Provider failure, quota exhaustion, auth expiry, stale state, and ownership failure are mapped to explicit HTTP/mobile error states. Local screen state cannot convert one of those failures into canonical success.

## Billing identity reuse
After Clerk sign-in, mobile resolves `/v1/me` once to obtain the internal Living Plot user ID. RevenueCat configuration uses that internal ID as App User ID. Backend entitlement refresh still obtains a current Clerk bearer token at request time rather than retaining one session JWT indefinitely.

## External environment gate
Source now includes an isolated Cloudflare `development` environment contract and a secret-safe readiness checker, but this does not prove external resources exist. Real Clerk email delivery, remote Worker/D1/R2/Queue/Analytics provisioning, live Gemini/TTS requests, RevenueCat provider convergence, and store submission remain unverified until the required development credentials/resources are supplied.

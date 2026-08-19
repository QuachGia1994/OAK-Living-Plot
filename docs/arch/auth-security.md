# Phase 1 auth and ownership boundary

> updated 2026-08-16 · 0.0.0

## Trust chain
Protected API requests use this chain only:

1. Client sends a Clerk session token in the request.
2. `ClerkSessionVerifier` validates the request with `@clerk/backend` using the configured JWT public key and authorized parties.
3. The verified Clerk `userId` becomes an external authentication subject only; it is never used as a plot owner ID directly.
4. `D1UserRepository.resolveOrCreate()` maps that subject to exactly one internal `users.id` through the unique `users.auth_subject` constraint.
5. Persistence queries receive the internal user ID from server code. The client cannot supply or override ownership.
6. `D1StoryRepository.loadOwnedPlotMemory()` requires both internal user ID and plot ID in the SQL predicate.

## Protected routes

- `GET /v1/me` — resolves the authenticated subject and returns the internal user identifier.
- `GET /v1/plots/:plotId` — returns the canonical plot-memory snapshot only when the authenticated internal user owns the plot.

The health endpoint remains public. Unknown routes remain 404.

## Authorization behavior

- Missing or invalid authentication: `401 unauthorized` with `WWW-Authenticate: Bearer`.
- Authentication verifier/configuration failure: `503 auth_unavailable`; provider/internal error details are not returned.
- Plot missing or owned by another user: `404 not_found`. This intentionally avoids confirming that another user's plot ID exists.
- Protected responses use `Cache-Control: no-store`.
- Client headers/body/query parameters are not used to select an owner. A forged `x-user-id` has no authority.

## Clerk runtime configuration

The Worker auth path uses networkless JWT verification and does not require a Clerk secret key.

Required Worker runtime values:

- `CLERK_JWT_KEY` — Clerk JWT public key/PEM
- `CLERK_AUTHORIZED_PARTIES` — comma-separated allowlist of approved token parties/origins

The mobile app separately requires the public `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`; the Worker verifier does not.

`apps/api/.dev.vars.example` documents names only. Real `.dev.vars` files are ignored and must never be committed.

The actual production values, native Expo sign-in UI, provider dashboard configuration, and mobile token acquisition are deferred to later slices.

## Persistence guarantees

`users.auth_subject` is unique. User resolution uses an insert-on-conflict followed by lookup, so retries/concurrent first requests converge on one internal user instead of trusting a client-generated account ID.

Ownership checks live at the repository query boundary rather than only in an HTTP handler. This keeps future callers from accidentally loading a plot by ID without its owner context.

## Out of scope

No AI generation, TTS, RevenueCat entitlement logic, remote D1 provisioning, production secrets, deployment, mobile Clerk UI, account deletion workflow, or admin/service-account authorization is implemented in this slice.

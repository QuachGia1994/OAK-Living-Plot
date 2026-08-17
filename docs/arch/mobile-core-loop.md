# Phase 1 mobile core loop

> updated 2026-08-17 · 0.0.0

## Responsibility
The Expo client owns presentation, transient selection/loading state, native audio playback, and navigation. Canonical plot, episode, choice, quota, entitlement, audio lifecycle, and retention history remain backend-owned.

## Routes
- `/` presents recent/resumable plots, canonical quota projection, choice momentum, the UTC daily spark, and start/resume actions.
- `/create` collects only premise, mood, and one main character. Daily-spark route params may prefill these fields, but the user may edit them before generation.
- `/story?plotId=...` reads the latest canonical episode, selects/commits exactly one of three choices, displays the committed consequence, requests the continuation, and optionally generates/plays private narration.
- `/plus` presents the Free/Plus quota hypothesis and the configured RevenueCat store mode without treating store state as entitlement authority.
- `/auth` owns Clerk email-code sign-in-or-up when live public configuration is present.

## Story client boundary
UI routes depend on `StoryExperienceClient`. Live mode uses the authenticated HTTP implementation; deterministic preview mode is selected only when Clerk/API public configuration is intentionally absent.

The live client requests a fresh Clerk bearer token for every protected request and validates DTOs before exposing them to screens. It never writes canonical state locally.

### Retry convergence
Client-generated request keys survive uncertain network failures:
- plot creation keeps the same creation key and first-generation key across retry;
- next-episode generation keeps the same generation key per plot until canonical success or a definite invalid request;
- stale/choice-conflict responses reload the canonical plot rather than inventing a local winner.

This composes with server idempotency so a lost HTTP response does not imply a second Gemini episode.

## Episode and consequence UX
All three choices render together. A tap selects locally; only a successful server commit changes the screen to committed state. The consequence appears before the next-episode action.

Loading/error paths preserve the last canonical session. Auth expiry, quota exhaustion, provider unavailability, ownership failure, and stale/conflicting state remain explicit errors or canonical resync paths.

## Voice UX
Narration is optional derived media. Text remains readable when audio is absent, queued, processing, failed, or quota-exhausted.

The story route can:
1. request an approved voice variant with an idempotent reservation key;
2. poll the authenticated JSON audio-status route;
3. when ready, hand Expo Audio a private stream URL plus a fresh Authorization header;
4. play, pause, seek to start, and show progress.

The R2 object key and provider voice ID never reach mobile.

## Retention UX
Home receives retention metadata derived from canonical choice history. It shows a descriptive choice streak, total committed choices, active plot count, per-plot `Previously:` resume lines, and one deterministic UTC daily spark. Streaks have no quota, pricing, or access effect.

## Visual system
The mobile design stays dependency-light and token-driven:
- cinematic dark surfaces and warm decision accent;
- high-contrast long-form reading typography;
- reusable Screen/Card/Pill/ActionButton/loading/error primitives;
- semantic theme tokens rather than raw values in TSX;
- short entrance motion through the shared primitive, automatically disabled when the OS Reduce Motion setting is enabled;
- Safe Area handling at the root and screen level.

## Verification
Mobile tests cover setup validation, preview semantics, authenticated story DTO parsing, fresh bearer tokens, retry-key reuse, canonical resync after conflict, retention parsing, private audio request/status/playback-source authorization, RevenueCat Test Store selection, and backend entitlement refresh behavior. TypeScript, lint, Expo native prebuild/release build, and GitHub CI remain release gates.

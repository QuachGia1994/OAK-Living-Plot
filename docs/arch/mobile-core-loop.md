# Phase 1 mobile core loop

> updated 2026-08-19 · 0.0.0

## Responsibility
The Expo client owns presentation, transient selection/loading state, native audio playback, and navigation. Canonical Drama, Scene, Branch/Choice, quota, entitlement, media lifecycle, and retention history remain backend-owned.

## Routes
- `/` presents recent/resumable Dramas, canonical quota projection, choice momentum, the UTC daily spark, and start/resume actions. A user with no active Dramas receives the daily spark as the fastest first-run path with all three setup decisions prefilled before the explicit generation action.
- `/create` collects only premise, mood, and one main character. Daily-spark route params may prefill these fields, but the user may edit them before generation.
- `/drama?dramaId=...` reads the latest canonical Scene, selects/commits exactly one of three choices, displays the committed consequence, requests the continuation, and optionally generates/plays private narration.
- `/plus` presents the Free/Plus quota hypothesis and the configured RevenueCat store mode without treating store state as entitlement authority.
- `/auth` owns Clerk email-code sign-in-or-up when live public configuration is present.

## Drama client boundary
UI routes depend on `DramaExperienceClient`. Live mode uses the authenticated HTTP implementation; deterministic preview mode is selected only when Clerk/API public configuration is intentionally absent.

The live client requests a fresh Clerk bearer token for every protected request and validates DTOs before exposing them to screens. It never writes canonical state locally.

### Retry convergence
Client-generated request keys survive uncertain network failures:
- Drama creation keeps the same creation key and first-generation key across retry;
- next-Scene generation keeps the same generation key per Drama until canonical success or a definite invalid request;
- stale/choice-conflict responses reload the canonical Drama rather than inventing a local winner.

This composes with server idempotency so a lost HTTP response does not imply a second Gemini Scene generation.

## Scene and consequence UX
All three choices render together. A tap selects locally; only a successful server commit changes the screen to committed state. The consequence appears before the next-Scene action.

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
Home receives retention metadata derived from canonical choice history. It shows a descriptive choice streak, total committed choices, active Drama count, per-Drama `Previously:` resume lines, and one deterministic UTC daily spark. Streaks have no quota, pricing, or access effect.

## Localization and first run
The saved `uiLocale` (`en`/`vi`) drives core native product copy independently from each Drama's persisted drama locale. Validation, mood labels, auth, navigation/actions, library/history, Plus, Settings/Data, voice controls, and daily-spark copy switch with the UI preference; canonical Scene text is never translated in place. A new user with no active Drama sees a prefilled daily-spark path first and can still choose custom creation, so onboarding removes setup decisions without auto-generating or creating a hidden mutation.

## Platform tab behavior
The four top-level destinations remain one tab navigation owner. iOS continues using system `NativeTabs` with `minimizeBehavior="onScrollDown"`. Expo's native minimize API is iOS-only, so Android uses the Expo Router JavaScript Tabs navigator for the same four routes. The shared `Screen` scroll owner reports thresholded scroll intent to one Android tab-shell controller: meaningful downward travel compacts the bar and hides labels while preserving all four tap targets; meaningful upward travel or returning to the top expands it. Route changes reset to expanded state. The controller updates React state only when compact/expanded state changes, not on every scroll pixel.

## Visual system
The mobile design stays dependency-light and token-driven:
- cinematic dark surfaces and warm decision accent;
- high-contrast long-form reading typography;
- reusable Screen/Card/Pill/ActionButton/loading/error primitives;
- semantic theme tokens rather than raw values in TSX;
- short entrance motion through the shared primitive, automatically disabled when the OS Reduce Motion setting is enabled;
- Safe Area handling at the root and screen level.

## Verification
Mobile tests cover setup/localization validation, passwordless email-OTP existing/new-user transitions and single-flight guards, Android compact-tab scroll thresholds/route mapping, preview semantics, authenticated story DTO parsing, fresh bearer tokens, retry-key reuse, canonical resync after conflict, retention parsing, private audio request/status/playback-source authorization, RevenueCat Test Store selection, and backend entitlement refresh behavior. GitHub quality now also applies local D1 migrations and a Cloudflare development dry-run; iOS production export and Android native release APK are separate CI gates.

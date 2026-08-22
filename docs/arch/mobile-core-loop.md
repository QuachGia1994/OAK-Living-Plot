# Phase 1 mobile core loop

> updated 2026-08-22 · 0.0.0

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

This composes with server idempotency so a lost HTTP response does not imply a second provider Scene generation. Read-only HTTP keeps the bounded 12-second transport budget; idempotent Scene-generation mutations use a 120-second defensive request budget because the backend may run one 8B creative call plus at most one controlled repair or full regeneration before publishing a canonical Scene. This budget is a defensive ceiling, not an expected latency target; no p50/p95 is claimed without live measurement. Stable creation/generation keys prevent duplicate canonical work on manual retry, and timeout-specific UI copy distinguishes a slow generation request (which preserves the generation key safely) from a dead API. Foreground/same-Drama refreshes adopt canonical data without clearing the current read/selection state unless the Scene ID or branch state actually changes; refresh is also skipped while a commit/continue mutation owns the action lock. Storyboard beats are reversible: tapping any progress segment can revisit an earlier/later beat without changing canonical branch state.

## Scene and consequence UX
All three choices render together. A tap selects locally; only a successful server commit changes the screen to committed state. The consequence appears before the next-Scene action.

Active Drama and History now live inside the Library tab's nested Stack. Home/Create/Library navigation enters `/library/drama` and `/library/history`, so the approved native iOS tab bar and Android bar remain available throughout reading, branching, continuation, and recap progress. Legacy `/drama` and `/history` routes redirect into this tab-owned stack for compatibility.

Loading/error paths preserve the last canonical session. Auth expiry, quota exhaustion, provider unavailability, ownership failure, and stale/conflicting state remain explicit errors or canonical resync paths. Home treats newly added quota-display fields as additive: an older development Worker that omits `voiceBonusCredits` or the preview-mode marker is parsed conservatively as zero bonus + enforced quota instead of making the entire recent-Drama read fail.

## Preview access policy
Development preview access is selected only by the backend Worker environment. When `/v1/dramas/home` reports quota enforcement disabled, the client renders Scene/voice allowance as `∞`; it still sends the same authenticated requests and cannot choose or elevate this mode itself. Store/production deployments remain server-enforced.

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
The saved `uiLocale` (`en`/`vi`) drives core native product copy independently from each Drama's persisted drama locale. `expo-localization` declares English/Vietnamese as supported app locales and resolves the device/app language before auth, so an authenticated profile with no saved preference is seeded from that locale instead of snapping back to the backend English default after sign-in. An explicit saved preference remains authoritative afterward. Validation, mood labels, auth, navigation/actions, library/history, Plus, Settings/Data, voice controls, and daily-spark copy switch with the UI preference; canonical Scene text is never translated in place. A new user with no active Drama sees a prefilled daily-spark path first and can still choose custom creation, so onboarding removes setup decisions without auto-generating or creating a hidden mutation.

## Platform tab behavior
The four top-level destinations remain one tab navigation owner. iOS continues using system `NativeTabs` with `minimizeBehavior="onScrollDown"`. Expo's native minimize API is iOS-only, so Android uses the Expo Router JavaScript Tabs navigator with one custom tab-bar renderer for the same four routes. The shared `Screen` scroll owner reports thresholded intent to one ref-backed Android controller: meaningful downward travel replaces the full-width labeled bar with a centered 46dp icon-only rail capped at 248dp, while meaningful upward travel, returning to the top, or changing route restores the expanded bar. Navigator route state remains the SSOT, keyboard visibility hides the Android renderer, bottom content padding follows the active rail height plus safe-area inset, and React state changes only when compact/expanded mode changes.

## Visual system
The mobile design stays dependency-light and token-driven while matching the approved concept-preview direction:
- near-black cinematic canvas with gold primary actions and violet selection/glow states;
- glass-like panels use opaque/alpha theme tokens rather than a new blur dependency, keeping Android/iOS behavior predictable;
- a shared six-step story-flow rail maps Create world → Write scene → Choose → Consequence → Living cast → Timeline across the core native journey without changing route or canonical state semantics;
- Scene/Choice/Consequence keep the existing player contract but use stronger luminous borders, denser editorial hierarchy, and clearer active-step emphasis;
- Living Character and History use the same purple/gold hierarchy while avoiding invented character stats or non-canonical story data;
- high-contrast long-form reading typography remains prioritized over decorative glass effects;
- reusable Screen/Card/Pill/ActionButton/loading/error primitives remain the presentation base;
- semantic theme tokens rather than raw product state in TSX;
- short entrance motion through the shared primitive, automatically disabled when the OS Reduce Motion setting is enabled;
- Safe Area handling at the root and screen level.

## Verification
Mobile tests cover setup/localization validation, passwordless email-OTP existing/new-user transitions and single-flight guards, Android mini-tab scroll thresholds/route mapping/rail dimensions, authenticated API diagnostic normalization without bearer leakage, preview semantics, authenticated story DTO parsing, fresh bearer tokens, retry-key reuse, canonical resync after conflict, retention parsing, private audio request/status/playback-source authorization, RevenueCat Test Store selection, and backend entitlement refresh behavior. GitHub quality now also applies local D1 migrations and a Cloudflare development dry-run; iOS production export and Android native release APK are separate CI gates.

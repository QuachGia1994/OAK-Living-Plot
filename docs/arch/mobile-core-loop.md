# Phase 1 mobile core loop

> updated 2026-08-23 · 0.0.0

## Responsibility
The Expo client owns presentation, transient selection/loading state, native audio playback, and navigation. Canonical Drama, Scene, Branch/Choice, quota, entitlement, media lifecycle, and retention history remain backend-owned.

## Routes
- `/` presents recent/resumable Dramas, canonical quota projection, choice momentum, the UTC daily spark, and start/resume actions. A user with no active Dramas receives the daily spark as the fastest first-run path with all three setup decisions prefilled before the explicit generation action.
- `/create` collects only premise, mood, and one main character. Daily-spark route params may prefill these fields, but the user may edit them before generation.
- `/library/drama?dramaId=...` reads the latest canonical Scene, selects/commits exactly one of three choices, displays the committed consequence, requests the continuation, and optionally generates/plays private narration.
- `/library/character?dramaId=...` presents the Living Character stage from the current canonical Drama plus ordered history. Identity, journey counts, latest consequence, and the four most recent displayed memories are derived client-side from those DTOs; the UI does not fabricate character stats, relationships, or journal events.
- `/library/history?dramaId=...` presents the full ordered canonical Scene/choice/consequence timeline and branch summary.
- `/plus` presents the Free/Plus quota hypothesis and the configured RevenueCat store mode without treating store state as entitlement authority.
- `/auth` owns Clerk email-code sign-in-or-up when live public configuration is present.

## Six-stage frontend flow
The approved concept is represented as six product stages: Create World, Write Scene, Choice, Consequence, Living Character, and Timeline. Home owns the horizontal six-stage journey overview. Task routes render a compact numbered stage header instead of repeating the full rail, preventing duplicate numbering and keeping the current objective visible.

`/create` keeps the setup contract to premise, mood, and protagonist name, with a compact live preview and a fixed Create Scene action. `/library/drama` keeps Scene, Choice, and Consequence in one swipeable/reviewable sheet deck; the fixed action changes from See Choices, to Lock Choice, to Continue Scene according to `PlaybackState`. Review mode returns to the canonical live sheet without mutating story state. Voice and sharing are collapsed secondary Scene tools, while Living Character and Timeline are explicit stage links.

The fixed action dock is rendered outside the scroll surface and reserves space above the custom Android tab bar. This keeps the primary action reachable without covering form fields or narrative content. The Living Character screen uses existing private portrait behavior but treats media as derived and optional; canonical identity and memory still come only from Drama/history responses. Previously stored stories need no migration for this presentation change.

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

## Scene artwork UX

Every current canonical Scene can display private generated artwork without coupling image readiness to reading or choice commitment. Home, the Library cover, and the Scene stage render `SceneArtworkBackdrop`: the bundled classical painting is immediate, a configured client checks owner-scoped status, old/missing rows request generation once, and a bounded 2-second poll loop swaps in authenticated bytes when ready. A stale prior image remains usable during regeneration; network/provider failure silently retains the fallback and never changes canonical UI state.

The server—not mobile—builds the image prompt from canonical title/summary/script/protagonist context. Mobile receives only `missing|generating|ready|stale|failed`, timestamps/attempts, and private image bytes. It never sees model names, prompts, R2 keys, fingerprints, or provider errors beyond a normalized unavailable state.

## Retention UX
Home receives retention metadata derived from canonical choice history. It shows a descriptive choice streak, total committed choices, active Drama count, per-Drama `Previously:` resume lines, and one deterministic UTC daily spark. Streaks have no quota, pricing, or access effect.

## Localization and first run
The saved `uiLocale` (`en`/`vi`) drives core native product copy independently from each Drama's persisted drama locale. `expo-localization` declares English/Vietnamese as supported app locales and resolves the device/app language before auth, so an authenticated profile with no saved preference is seeded from that locale instead of snapping back to the backend English default after sign-in. An explicit saved preference remains authoritative afterward. Validation, mood labels, auth, navigation/actions, library/history, Plus, Settings/Data, voice controls, and daily-spark copy switch with the UI preference; canonical Scene text is never translated in place. A new user with no active Drama sees a prefilled daily-spark path first and can still choose custom creation, so onboarding removes setup decisions without auto-generating or creating a hidden mutation.

## Platform tab behavior
The four top-level destinations remain one tab navigation owner. iOS is reserved exclusively for system `NativeTabs` with `minimizeBehavior="onScrollDown"`; no custom blur renderer runs on iOS. The unsigned iOS CI artifact is built on the explicit `macos-26` runner and rejects Xcode older than 26, preserving the native iOS 26 Liquid Glass path rather than approximating it in React Native. Android and responsive web preview use the Expo Router JavaScript Tabs navigator with one custom glass tab-bar renderer for the same four routes. The shared `Screen` scroll owner reports thresholded intent to one ref-backed controller: meaningful downward travel replaces the full-width labeled 68dp bar with a centered 46dp icon-only rail capped at 248dp, while meaningful upward travel, returning to the top, or changing route restores the expanded bar. Navigator route state remains the SSOT, keyboard visibility hides the custom renderer, bottom content padding follows the active rail height plus safe-area inset, and React state changes only when compact/expanded mode changes. Tapping Library from a nested Scene/Character/History route explicitly returns to the Library root.

## Visual system
The mobile design stays token-driven while matching the approved classical concept direction:
- near-black canvas, parchment text, tarnished-gold/bronze actions and hairlines, restrained patina, serif editorial hierarchy, compact radii, ornament dividers, and nested frames;
- iOS keeps system Liquid Glass while the custom Android/web rail uses `expo-blur` with a translucent warm-black fallback, retaining the existing collapse-on-scroll behavior;
- a shared six-step story-flow rail maps Create world → Write scene → Choose → Consequence → Living cast → Timeline across the core native journey without changing route or canonical state semantics;
- Scene/Choice/Consequence keep the existing player contract but use classical framed surfaces; A is amber/gold, B slate/silver, and C forest green so branches remain materially scannable without encoding canonical meaning;
- Living Character and History use the same black/gold hierarchy and ornate portrait/timeline frames while avoiding invented affinity scores, character stats, or non-canonical story data;
- a generated 1280px classical fallback painting covers offline/loading/legacy cases; configured current Scenes swap to owner-private artwork generated from their actual canonical content;
- high-contrast long-form reading typography remains prioritized over decorative glass effects;
- reusable Screen/Card/Pill/ActionButton/loading/error primitives remain the presentation base;
- semantic theme tokens rather than raw product state in TSX;
- short entrance motion through the shared primitive, automatically disabled when the OS Reduce Motion setting is enabled;
- Safe Area handling at the root and screen level.

## Verification
Mobile tests cover setup/localization validation, passwordless email-OTP existing/new-user transitions and single-flight guards, Android mini-tab scroll thresholds/route mapping/rail dimensions, authenticated API diagnostic normalization without bearer leakage, preview semantics, authenticated story DTO parsing, fresh bearer tokens, retry-key reuse, canonical resync after conflict, retention parsing, private audio request/status/playback-source authorization, RevenueCat Test Store selection, and backend entitlement refresh behavior. GitHub quality now also applies local D1 migrations and a Cloudflare development dry-run; iOS production export and Android native release APK are separate CI gates.

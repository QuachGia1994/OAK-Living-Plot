# Changelog

All notable changes to Living Plot will be documented in this file.

## [Unreleased]

### Added
- Phase 2 narrative quality: consequenceRealization, threadPayoff, pacingRole rhythm, branchCommitment, relationshipProgression, protagonistAgency, arcCoherence, returnPull proxy; shared provider-neutral `validateNarrativePublication` gate for Gemini and Workers AI; required beat/pacingRole on new Scene proposals; material-delta SSoT; long-horizon synthetic fixtures; no new schema migration; no mandatory LLM judge.

### Fixed
- One-character Scene continuation now constrains structured output to valid durable branches, preventing impossible relationship deltas from being stripped into `invalid_generation` after retry.
- Scene generation no longer fails after a daily text threshold; generated Scenes remain fully ledgered for idempotency/reconciliation, while fresh-voice limits stay server-enforced outside the development preview. Home exposes resource-specific enforcement so mobile can show unlimited Scenes without misreporting voice quota.
- Publication authority no longer rejects on eval-only dimensions; CRITICAL_THREAD_STALLED is eval-only (not per-thread age); Workers AI now runs the same narrative publication gate as Gemini.

### Changed
- Phase 1 long-run narrative novelty: trajectory diversity, structural beat rotation (`BEAT_COOLDOWN_SCENES`), long-range motif signatures, evaluator dimensions, and Gemini publication reject/retry gate without Vector DB.
- Raised owner-data export to schema v3 so referral/bonus-credit state and privacy-safe portrait metadata travel with account export while internal IDs, reward events, reservation keys, portrait fingerprints, private R2 keys, and generated media bytes remain excluded.
- Made generated Scenes unlimited for Free and Plus while keeping fresh cloud narration at Free 1 / Plus 10; referral voice credits remain persistent bonus inventory rather than a client-selected tier.
- Strengthened continuation novelty with a bounded 12-Scene history blocklist plus deterministic rejection of materially recycled titles, summaries, branch labels, choice intents, and consequences; A/B/C actions, intents, and consequences must also be materially distinct inside each Scene before canonical publication.
- Switched the Worker Clerk boundary to direct networkless `verifyToken()` validation with the configured JWT public key and authorized parties; the backend no longer requires a Clerk publishable key while mobile keeps its public Expo key.
- Migrated live Beta RC narration from Google Cloud Text-to-Speech service-account auth to server-side Gemini TTS using the existing `GEMINI_API_KEY`, preserving provider-neutral Queue/R2/media ownership and private MP3 delivery without a Google Cloud billing dependency.
- Production RC freeze: documented SSOT/state ownership, strengthened playback domain tests for selected≠locked and in-flight commit gating; UI surfaces feature-frozen for beta.
- Final concept closure: Android launch-safe DynamicColorIOS guards, Library dense list rows + featured Now Playing cover, Plus benefits + “Nâng cấp Plus” copy, compact mood silhouettes, and smaller production Settings intro.
- Concept parity close-out: Android NativeTabs dark/gold branding (`backgroundColor`/`indicatorColor`/`iconColor`/`rippleColor`), compact A/B/C choice rows + selective commit dock, responsive scene stage height, secondary voice control, and looser Mina crop presets.
- Premium core-flow polish: tighter display type scale, shared Mina artwork crop variants (hero/card/scene), native-tab-safe scroll bottom inset, and top-level Create/Settings without redundant Cancel/Back chrome.
- Living Plot brand system: LP serif monogram assets, app/adaptive/splash icons, stronger BrandMark lockup, and Expo app config pointed at the new brand files.
- Native system tab bar via `expo-router/unstable-native-tabs` for Home/Create/Library/Settings (SF Symbols + Material symbols); iOS 26 adopts Liquid Glass from the system tab bar; removed the custom RN capsule dock.
- Professional app shell pass: shared `SectionHeader`/`SettingsRow` primitives without changing business logic.

### Added
- Referral growth loop with server-generated codes, one claim per referred account, RevenueCat-verified Plus activation reward, and 50 replay-safe persistent cloud-narration bonus credits for the inviter.
- Private story-aware character portraits using a story fingerprint that includes the current committed branch consequence, explicit regeneration, prior ready portrait identity reference, owner-scoped R2 delivery, and account-erasure cleanup without making portrait media canonical story state.
- Mirror-concept gap audit with Adopt/Defer/Reject product decisions so public Explore/social/notification surfaces do not displace the branching-retention core.
- Canonical drama runtime ownership map covering `Drama`, `Scene`, `Character`, `Choice`, `Branch`, `GenerationJob`, `MediaAsset`, `PlaybackState`, locale ownership, failure paths, and the verification tests that prove each transition.
- Provider-neutral `SceneGenerator`/`SceneProposal` boundary with strict scene normalization, bounded prompt context, controlled invalid-response retry, and Gemini isolated as the current adapter.
- Explicit mobile playback orchestration owner (`useDramaPlayback` + `PlaybackState`) and bounded product-level voice media lifecycle independent from scene readiness.
- Initial npm workspace with Expo mobile and Cloudflare Worker API foundations.
- Strict TypeScript, lint, test, and GitHub Actions CI baseline.
- Cloudflare D1 schema/migration baseline for users, plots, characters, episodes, choices, committed choice history, and daily usage counters.
- Provider-neutral structured-memory domain contracts and D1 story repository boundary.
- D1 schema/invariant integration tests and a local migration command.
- Clerk backend session verification with networkless JWT validation and explicit authorized parties.
- Internal authenticated-user mapping plus owner-scoped protected plot reads and auth/authorization integration tests.
- Provider-neutral story-generation contracts, bounded prompt assembly, strict episode proposal validation, and Gemini Interactions API adapter.
- Controlled one-retry handling for invalid structured AI output with normalized token usage and provider errors.
- Atomic D1 episode publication with per-plot generation-key idempotency, optimistic state-version guards, and server-generated episode/choice IDs.
- Publication migration storing choice intent/consequence/state-delta snapshots plus episode generation/version/provider metadata.
- Canonical plot-memory schema v2 with keyed multi-dimensional relationships, facts, and threads plus deterministic legacy-v1 upgrade.
- Atomic/idempotent choice commit with append-only commit snapshots, episode completion, canonical state application, and optimistic version enforcement.
- Server-side UTC quota ledger with atomic reserve/consume/release, Free/Plus limits, in-flight counters, idempotency, and reconciliation.
- Expo core-loop UI for home/recent plots, three-decision plot setup, episode reading, exactly three choices, committed consequence, next episode, and resume.
- Provider-neutral mobile `StoryExperienceClient` with deterministic preview implementation and mobile behavior tests.
- Google Cloud TTS service-account JWT/OAuth adapter plus provider-neutral MP3 `SpeechSynthesizer`.
- D1 audio-asset lifecycle with voice-quota reservation, Queue/DLQ processing, private R2 storage, staged retry recovery, and owner-scoped audio delivery.
- RevenueCat webhook security with custom authorization, raw-body HMAC verification, event-id idempotency, subscriber refresh, and D1-materialized Free/Plus entitlement.
- Expo RevenueCat purchase/paywall/restore boundary with explicit internal App User ID, backend entitlement refresh, public platform SDK-key configuration, and development-build support.
- Privacy-safe Cloudflare Analytics Engine story-generation telemetry with retry-aware provider token usage and exact revisioned Gemini Standard paid rate-card cost in integer nano-USD.
- Deterministic narrative quality fixtures/evals covering continuity, thread momentum, branch distinctness, consequence specificity, repetition control, and adversarial story regressions.
- Gemini 3.5 Flash-Lite production story baseline with minimal thinking and updated Standard paid cost accounting, replacing the deprecated Gemini 2.5 Flash-Lite target.
- Clerk Expo 4 mobile identity with SecureStore-backed token cache and privacy-preserving email-code sign-in-or-up flow.
- Protected live-story HTTP core loop for home/create/resume/generate/commit using internal ownership, server-derived state versions, backend quota, and existing Gemini/publication/choice boundaries.
- Idempotent live plot creation metadata (`creation_key`, locale, initial mood) plus mobile HTTP story client and shared `/v1/me` internal identity for RevenueCat.
- Non-production live-development readiness checks and isolated Cloudflare development binding contract without production provisioning.
- Retry-safe mobile story generation keys and canonical resync after stale/conflicting choice state.
- Authenticated Expo private-audio generation, status polling, playback, pause, replay, and progress over the existing R2/TTS boundary.
- RevenueCat Test Store public-key selection for native purchase-flow validation while D1 remains entitlement authority.
- Reduced-motion-aware mobile entrance motion, semantic visual tokens, richer empty/error/store/audio states, and removal of raw TSX color values.
- Choice-history retention metadata with UTC streaks, per-plot resume context, and deterministic daily story sparks that prefill the existing create flow.
- Reversible owner-scoped Story Library archive/restore lifecycle with archived plots kept readable and mutation-locked until restore.
- Canonical Story So Far history reconstructed from persisted episode summaries and committed choice consequences.
- Replay-safe privacy-preserving product funnel Analytics Engine events for newly canonical story/lifecycle/voice actions.
- Shared authenticated mobile HTTP transport with bounded timeout/abort, one safe GET retry with fresh tokens, and no automatic POST retry.
- Root native UI error recovery, foreground read-only home/story refresh, and expanded busy/error/choice/audio accessibility semantics.
- Owner-scoped D1 story/narrator preferences with new-story locale defaults and approved narrator selection.
- Spoiler-safe native story sharing with bounded title/episode/premise-hook copy and no public-story backend exposure.
- Versioned owner-scoped Living Plot application-data export with explicit exclusion of auth/provider secrets, telemetry, quota keys, and private R2 keys.
- R2-first fail-closed Living Plot application-data erasure with exact typed confirmation and D1 cascade cleanup.
- Settings & Data release-candidate surface with privacy boundary summary, bounded backend health probe, and non-secret diagnostics sharing.
- Secret-safe live beta smoke runner for API health, authenticated story convergence, Queue/TTS/R2 private audio, and backend RevenueCat entitlement convergence.
- English/Vietnamese native core-interface localization driven by the saved UI-language preference without rewriting canonical story locale.
- First-run daily-spark path that prefills the three plot-setup decisions while keeping generation explicit and custom creation available.
- Narrative regression dimensions for protagonist anchoring, requested-locale alignment, and durable canonical scene progression.
- Privacy-safe episode-depth telemetry buckets plus aggregate D1 activation/depth/D1/D7 retention queries.
- CI release-candidate gates for local D1 migrations, Cloudflare development dry-run, iOS production export, and Android native preview APK.
- Closed Beta RC runbook covering real development provisioning, provider blockers, abuse/cost guardrails, live bring-up order, and exact-SHA verification.
- Provisioned non-production D1 `living-plot-dev` plus development TTS Queue/DLQ and applied migrations `0001`–`0009` remotely, including retryable quota reservations; R2 remains explicitly blocked until the Cloudflare account enables the service.
- Protected JSON request-size guard and API response hardening with `no-store`, `nosniff`, and `no-referrer` headers.
- iOS unsigned Native RC pipeline on GitHub macOS: explicit Expo iOS identity, clean prebuild/CocoaPods, Release `iphoneos` Xcode build with code signing disabled, negative signature verification, `Payload/LivingPlot.app` IPA packaging, and artifact upload.

### Changed
- Added a real Living Plot branching-plot brand mark/app icon and replaced the Plus procedural character artwork with a bundled premium cinematic anime-style hero while preserving the existing product/runtime boundaries.
- Replaced application-level Story/Plot/Episode vocabulary with the canonical Drama/Scene/Branch model across mobile contracts, `/v1/dramas` HTTP routes, runtime services, history/library summaries, product telemetry, sharing, and EN/VI UI terminology. Existing D1 `plots/episodes/story_locale` names remain persistence-only compatibility vocabulary.
- Renamed saved application generation locale from `storyLocale` to `dramaLocale`; the preview store reads the legacy key only as a compatibility migration, while authenticated preferences and new-drama creation use the canonical field.
- Account export is now schema v2 with `dramas[]`, `scenes[]`, generated/voiced scene usage, and provider-neutral media metadata instead of projecting D1 plot/episode/audio naming.
- Removed the duplicate legacy `/v1/plots/:id` application read path and `D1StoryRepository`; `D1DramaRepository` is the single owner for persisted Drama restoration/projection.
- Completed the visual-first correction pass for Big Stages C+D: Home/Library/Create now share a persistent four-destination drama navigation dock, story playback gives the scene frame priority over utility metadata, History adds a compact branch map, Settings returns to a consumer-facing experience with diagnostics hidden behind Advanced, and Plus removes backend/store jargon from the primary subscription surface.
- Replaced the former head/body silhouette scene rig with deterministic illustrated character portraits (face, hair, eyes, clothing, rim lighting) while preserving the existing mood- and content-derived scene motifs and avoiding a backend media-schema change.
- Completed final cinematic RC productization: localized EN/VI cinematic interaction copy and accessibility cues, semantic scene progress, localized form labels, History empty-state recovery, and final small-screen/reduced-motion audit without changing canonical business logic.
- Completed the cinematic surface redesign across History, Plus, Auth, and Settings: visual recap filmstrip, Plus stage-pass metrics, ambient email-code identity flow, structured privacy/data control room, safer diagnostic console, and reduced explanatory copy across Home/Create/Story without changing canonical business logic.
- Reworked the Phase 1 native mobile presentation into a Huashu-inspired Cinematic Editorial system: warmer low-chroma surfaces, restrained amber/rust accent, narrative display type, mono operational metadata, flatter controls, ruled reading lists/timelines, and fewer generic dashboard cards across Home, Create, Story, Library, History, Plus, Auth, and Settings.
- Hardened native layout/navigation with keyboard-safe screens, bounded large-screen reading measure, small-screen wrapping, daily-spark-first onboarding, reduced-motion episode/choice/consequence reveals, simplified story navigation, and voice playback integrated into the reading flow.
- Pinned project orchestration and default implementation to GPT-5.6 Sol; GPT-5.6 Luna is used only when the user explicitly requests a worker handoff.
- Localized daily story sparks now follow the saved interface language while newly generated story content continues to follow each plot's independent story-locale preference.
- Narrative prompt guidance now keeps the canonical protagonist visible, requires durable scene progress, and keeps narrative/branch output in the requested locale.

### Fixed
- Fixed the active-drama progress UX: Scene subtitle/storyboard beats can now be revisited directly from the progress segments, Drama/History run inside the Library tab stack so the bottom bar stays available throughout progress, and cloud narration polling now spans the server retry window while device voice remains immediately usable as the non-quota fallback.
- Closed the post-Scene-1 live loop: continuation validation now rejects repeated prior summaries/actions and duplicate active threads, canonical state deduplicates repeated fact/thread semantics before later generation, same-Scene foreground refresh no longer resets reading/selection state, and mobile offers an explicit device-system speech fallback that consumes no narration quota when private generated voice fails.
- Closed live Scene 1 creation in the Cloudflare development stack: bound native Worker `fetch` correctly, added a provider-neutral Workers AI Scene adapter for the region-blocked Gemini development path, constrained structured output to the canonical script envelope, drops only non-canonical provider references before validation, and gives idempotent Scene-generation mutations a dedicated 30-second mobile timeout while ordinary HTTP retains the 12-second budget.
- Made first-run UI language follow the device/app locale across the auth boundary: English/Vietnamese are declared through `expo-localization`, unsaved authenticated profiles are seeded from the resolved locale instead of snapping to the backend English default, and explicit saved preferences still win afterward.
- Made Scene 1 creation fail visibly before the network when required setup is still empty: example placeholders are now labeled as examples, the primary action says Create/Tạo Scene 1, local validation shows an assertive submit summary, and same-tick duplicate generation requests are blocked.
- Reworked Android compact navigation into a true centered 46dp icon-only mini rail capped at 248dp with navigator-owned tab semantics, safe-area-aware content inset, keyboard hiding, and a small selected-icon treatment while keeping the approved expanded bar and iOS NativeTabs behavior unchanged.
- Hardened native Clerk bearer verification and diagnostics: the Worker keeps authorized-party validation when `azp` exists but no longer invents a web-origin requirement for signed native tokens without `azp`; Settings now probes authenticated `/v1/me` with status/reason and safe `azp`/`iss` visibility without exposing the bearer, API URL, internal user ID, or drama text.
- Closed passwordless Clerk sign-in/sign-up transfer handling without introducing a password UI: email OTP now single-flight guards Send/Verify/Resend, resets both Clerk attempts on Start over, sanitizes provider errors, and reports password/extra-field requirements as dashboard configuration drift.
- Made development Analytics Engine observational instead of deployment-critical: when the account service is unavailable, telemetry becomes a no-op while canonical Drama, Gemini, Queue, and private-media behavior continue unchanged.
- Fixed development DLQ routing so Queue batches use the environment-configured dead-letter queue name; `living-plot-tts-dlq-dev` now reaches terminal cleanup instead of being mistaken for the primary TTS queue.
- Closed the same-render double-action race in Drama playback: commit/continue now acquire a synchronous action lock before React rerenders, so rapid taps cannot start parallel canonical mutations.
- Closed RC session ownership leakage: sign-out, auth loading transitions, and Clerk account changes now remount the session-owned runtime so stale canonical Drama state and already-loaded private narration cannot survive across principals; added ownership regression coverage.
- Repaired the live beta smoke runner after Drama/Scene/Media canonicalization: it now exercises `/v1/dramas`, `/v1/scenes/:sceneId/voice`, and `/v1/media/:assetId` DTOs instead of removed Story/Plot/Episode/audio routes.
- Closed the RC voice-client state gap: configured builds now keep the authenticated HTTP voice client before sign-in and surface `auth_required` truthfully, while deliberately unconfigured preview builds show a neutral unavailable state without a dead generate action; TTS architecture docs now match the current `/v1/scenes/:sceneId/voice` and `/v1/media/:assetId` routes.
- Replaced the shared `SceneArtwork` flat face/hair/eyes primitive rig with bundled shaded anime character artwork, so story playback and every drama surface using that renderer no longer show the old geometric portrait; Plus now uses the same replacement artwork.
- Aligned Free/Plus quota metrics on one typographic baseline and constrained Vietnamese Settings privacy/delete-data headers so long copy wraps cleanly without the old danger signal protruding beyond its card.
- Fixed an integration mismatch where the API emitted `recentDramas/sceneNumber/ready_for_next_scene/activeDramas` while the mobile HTTP parser still expected the older plot/episode field names; both sides now share one canonical contract.
- Fixed live Vietnamese metadata localization for relative update/reset labels and localized spoiler-safe share copy while preserving each existing drama's creation locale.
- Fixed preview localization so `storyLocale` actually controls seeded stories, Episode 1, continuations, choices, intents and consequences; Vietnamese preview stories no longer fall back to English while the UI is Vietnamese. Locale-specific preview clients now share story state, so existing plots remain visible across EN/VI preference changes and each plot keeps its original story locale for future continuation episodes. Preview summary timestamps and episode labels are localized as well.
- Preview preferences now persist on-device through SecureStore, and choosing the Vietnamese interface defaults new-story locale plus narrator to Vietnamese while still allowing those two preferences to be changed independently afterward.
- Fixed the final subtitle-beat accessibility state so a scene no longer announces itself as an actionable button when no further beat can be advanced.
- Hardened unsigned iOS RC dependency resolution against CocoaPods/GitHub `429 Too Many Requests`: the job now builds a minimal local CocoaPods Specs repo from exact pinned RevenueCat upstream podspecs (`PurchasesHybridCommon 18.30.0`, `RevenueCat 5.83.1`) so dependencies remain transitive with normal pod semantics while the throttled public Specs CDN is excluded from the RC install path.
- Reworked the remote retention summary from a compound `UNION ALL` file execution that failed on D1 into a single aggregate row executed through a Node/Wrangler command runner, so development activation/D1/D7/depth metrics are visible.
- Unified ESLint 9 across workspaces and loaded Cloudflare Vitest test types so clean-install quality gates pass.
- Prevented publishing a new episode while a previous episode is still ready and awaiting a committed choice.

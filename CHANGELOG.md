# Changelog

All notable changes to Living Plot will be documented in this file.

## [Unreleased]

### Added
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

### Changed
- Pinned project orchestration and default implementation to GPT-5.6 Sol; GPT-5.6 Luna is used only when the user explicitly requests a worker handoff.

### Fixed
- Unified ESLint 9 across workspaces and loaded Cloudflare Vitest test types so clean-install quality gates pass.
- Prevented publishing a new episode while a previous episode is still ready and awaiting a committed choice.

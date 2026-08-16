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

### Fixed
- Unified ESLint 9 across workspaces and loaded Cloudflare Vitest test types so clean-install quality gates pass.
- Prevented publishing a new episode while a previous episode is still ready and awaiting a committed choice.

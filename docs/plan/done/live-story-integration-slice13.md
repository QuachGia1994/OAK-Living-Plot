# Authenticated live-story integration slice 13

Status: COMPLETE — STOP GATE PASSED

## Scope
Connect the Expo core loop to authenticated canonical Living Plot state. Add Clerk Expo identity, internal-user resolution, protected live-story HTTP orchestration, idempotent mobile plot creation, and shared internal identity for RevenueCat while preserving the existing server-authoritative auth/quota/entitlement/publication/choice boundaries. Preserve uncommitted Slice 8–12 work. Do not provision/deploy production infrastructure, run real store purchases, submit stores, commit, or push.

## Completed
- Added `@clerk/expo` 4.3.0 and `expo-secure-store` to the Expo SDK 57 workspace.
- Added ClerkProvider with SecureStore-backed token cache; no Clerk secret is shipped to mobile.
- Added custom email-code sign-in-or-up flow using `signUpIfMissing`, verified-identifier transfer to sign-up, resend, reset, and fail-closed handling for Clerk instances requiring unsupported extra fields/verification.
- Added mobile live/preview mode boundary: configured live mode never silently falls back to preview when signed out; deterministic preview remains only when Clerk/API public configuration is intentionally absent.
- Added `/v1/me` internal identity resolution after Clerk sign-in; RevenueCat App User ID remains the internal D1 `users.id`, not the Clerk subject.
- Billing backend refresh now asks Clerk for a current bearer token per request instead of retaining a session JWT string indefinitely.
- Added migration `0007_live_story_integration.sql` with per-user `creation_key` idempotency plus persisted plot locale and initial mood.
- Added owner-scoped D1 live-story repository and orchestration service.
- Added protected core-loop endpoints:
  - `GET /v1/story/home`;
  - `POST /v1/story/plots`;
  - `GET /v1/story/plots/:plotId`;
  - `POST /v1/story/plots/:plotId/episodes`;
  - `POST /v1/story/plots/:plotId/episodes/:episodeId/choices/:choiceId`.
- Client body cannot select `userId` or authoritative plot state version; owner comes from verified Clerk/internal-user mapping and choice state version is derived from D1.
- First/next text generation resolves backend Free/Plus, reserves text quota, invokes the current Gemini 3.5 Flash-Lite provider boundary, atomically publishes through `D1EpisodePublisher`, then consumes quota; provider/publication failure releases quota.
- Lost-response/retry paths converge on an existing ready episode instead of double-generation/double-charge.
- Mobile HTTP story client obtains a fresh Clerk token on every request, validates server DTOs, preserves a stable create idempotency key across form retries, uses device locale, and maps auth/quota/provider/conflict failures without creating local canonical state.
- Home/create/story/Plus screens now use authenticated runtime contexts and expose sign-in/sign-out gates where appropriate.
- React Compiler lint findings from initial integration were fixed by removing synchronous effect-state resets and keying resolved backend identity to the active Clerk user.
- Added architecture/readme/data-model/changelog/docs-index updates.

## Verification evidence
- Backend focused live-story HTTP suite: 5/5 PASS.
- Focused mobile story/identity/billing suite: 3 files, 9/9 PASS.
- Final clean `npm ci --no-audit --no-fund`: PASS — 1,086 packages from lockfile.
- Final root lint: PASS, API + mobile, no errors/warnings.
- Final root typecheck: PASS, API + mobile.
- Final API Vitest: 26 files, 125/125 tests PASS.
- Final mobile Vitest: 5 files, 18/18 tests PASS.
- Final Expo Android export: PASS — Clerk iOS/Android config plugins loaded; 1,404 modules; ~5.8 MB Hermes bundle.
- Fresh local D1 migrations: PASS — all 7 migrations applied; command counts 13, 15, 8, 9, 4, 5, 5.
- Wrangler deploy dry-run: PASS — upload 479.34 KiB / gzip 95.74 KiB; Queue, D1, R2, and Analytics Engine bindings recognized; no deployment performed.
- Secret/config scan: PASS — no Clerk secret key, provider server secret literal, private-key payload, real Gemini key pattern, or long literal bearer token found in the repository.
- `git diff --check`: PASS after final source changes.

## Dependency-audit note
`npm audit` and `npm audit --omit=dev` currently report 37 advisories: 16 moderate, 21 high, 0 critical. The graph is dominated by the current Expo/React Native/RevenueCat/Clerk dependency chains (including Clerk wallet-adapter transitives and Metro tooling). npm's proposed remediations include incompatible major downgrades such as Clerk Expo 4.3 -> 3.4, Expo SDK 57 -> 53, React Native 0.86 -> 0.72, and RevenueCat 9 -> 8.12. No `npm audit fix --force` or incompatible downgrade was applied. This is tracked ecosystem dependency risk and must be re-evaluated before a production/store release; it does not change the local Slice 13 functional/integration gate result.

## Guarantees established
- A mobile caller cannot choose another user's canonical owner ID.
- A mobile caller cannot choose the authoritative expected plot version for a choice commit.
- Authenticated live mode uses current Clerk bearer tokens and backend internal ownership; preview state cannot become canonical.
- Plot creation retries converge by `(user_id, creation_key)`.
- Generation quota is server-reserved/consumed/released around actual provider/publication work.
- A lost response after publication can converge on the already-ready canonical episode without another Gemini call.
- RevenueCat identity and story ownership converge on the same internal Living Plot user while Clerk remains the external authentication subject.
- No Apple Developer payment or store submission is required for this source/integration gate.

## Deferred real-environment integration
Real Clerk project configuration/email delivery, live Worker/D1/Queue/R2/Analytics provisioning, a physical-device or development-build sign-in against that environment, live Gemini smoke generation, RevenueCat sandbox purchase/webhook convergence, production cost alerts, store signing/submission, and production deployment remain later stages.

## STOP
Reached with PASS result for the source/local integration gate. Do not begin remote provisioning, real-device/sandbox integration, commit, push, deployment, or store submission in this run.

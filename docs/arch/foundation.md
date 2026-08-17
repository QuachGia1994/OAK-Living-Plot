# Phase 1 foundation architecture

> updated 2026-08-17 · 0.0.0

## Runtime boundary
Living Plot uses one mobile codebase and one backend trust boundary.

- `apps/mobile`: Expo SDK 57, React Native, Expo Router, TypeScript strict.
- `apps/api`: Cloudflare Worker, TypeScript strict.
- Phase 1 state: Cloudflare D1 with versioned SQL migrations and a server-side repository boundary.
- Phase 1 audio: private Cloudflare R2 with Cloudflare Queues/DLQ for asynchronous TTS.
- Phase 1 API auth: Clerk session JWT verification mapped to internal D1 users; Expo now has SecureStore-backed Clerk identity and custom email OTP live-session wiring.
- Phase 1 subscription/IAP: RevenueCat with verified webhook/provider refresh and D1-materialized Free/Plus entitlement; mobile supports RevenueCat Test Store configuration while real store-provider convergence remains an external gate.
- Phase 1 story generation: Gemini 3.5 Flash-Lite behind a provider-neutral boundary using the Gemini Interactions API; AI output remains a non-canonical proposal until server validation and later persistence succeed.
- Phase 1 TTS: Google Cloud Text-to-Speech Standard/WaveNet behind a provider-neutral boundary with service-account JWT/OAuth authentication in the Worker.
- Phase 1 telemetry: Cloudflare Workers Analytics Engine is observational only; Gemini provider attempts use provider-reported token counts plus revisioned integer nano-USD pricing.

## Source of truth
D1 owns canonical product/story state. AI/provider outputs are proposals until server validation and persistence succeed. Analytics is observational only and cannot enforce quota, entitlement, authentication, or story state.

## Current repository slice
Slices 1–14 established the workspace, D1 canonical story model, Clerk ownership, Gemini generation/publication, choice memory, quota ledger, Expo core loop, private TTS/R2/Queue audio, RevenueCat entitlement authority, telemetry/evals, authenticated live-story HTTP integration, and a standalone Android preview artifact. Slices 15–20 add non-production environment readiness checks/configuration, retry-safe mobile live-story convergence, authenticated private audio playback, RevenueCat Test Store selection, a tokenized reduced-motion-aware UI pass, and a retention surface derived from canonical choice history plus deterministic daily prompts. Real provider credentials, remote development resource provisioning, Clerk email/device delivery, live Gemini/TTS smoke, and RevenueCat provider convergence remain external environment gates until those credentials/resources exist.

# Phase 1 foundation architecture

> updated 2026-08-16 · 0.0.0

## Runtime boundary
Living Plot uses one mobile codebase and one backend trust boundary.

- `apps/mobile`: Expo SDK 57, React Native, Expo Router, TypeScript strict.
- `apps/api`: Cloudflare Worker, TypeScript strict.
- Phase 1 state: Cloudflare D1 with versioned SQL migrations and a server-side repository boundary.
- Phase 1 audio: private Cloudflare R2 with Cloudflare Queues/DLQ for asynchronous TTS.
- Phase 1 API auth: Clerk session JWT verification mapped to internal D1 users; Expo now has SecureStore-backed Clerk identity and custom email OTP live-session wiring.
- Phase 1 subscription/IAP: RevenueCat with verified webhook/provider refresh and D1-materialized Free/Plus entitlement; real store sandbox integration remains deferred.
- Phase 1 story generation: Gemini 3.5 Flash-Lite behind a provider-neutral boundary using the Gemini Interactions API; AI output remains a non-canonical proposal until server validation and later persistence succeed.
- Phase 1 TTS: Google Cloud Text-to-Speech Standard/WaveNet behind a provider-neutral boundary with service-account JWT/OAuth authentication in the Worker.
- Phase 1 telemetry: Cloudflare Workers Analytics Engine is observational only; Gemini provider attempts use provider-reported token counts plus revisioned integer nano-USD pricing.

## Source of truth
D1 owns canonical product/story state. AI/provider outputs are proposals until server validation and persistence succeed. Analytics is observational only and cannot enforce quota, entitlement, authentication, or story state.

## Current repository slice
Slice 1 established workspace/runtime foundations. Slice 2 added the D1 schema and story persistence boundary. Slice 3 added API authentication and owner-scoped plot reads. Slice 4 added bounded story prompts, structured Gemini proposals, provider isolation, and validation. Slice 5 added atomic/idempotent episode publication. Slice 6 added canonical v2 plot memory plus atomic/idempotent choice commit and state application. Slice 7 added server-side UTC quota reservation/consumption/release with append-only reconciliation. Slice 8 added the Expo core-loop UI and a replaceable story-client boundary. Slice 9 added Google TTS OAuth/provider isolation, Queue/DLQ processing, private R2 audio, owner-scoped audio delivery, and voice-quota orchestration. Slice 10 added RevenueCat webhook/provider verification, D1 Free/Plus materialization, server-side quota-tier resolution, and the mobile paywall/restore boundary. Slice 11 added privacy-safe Analytics Engine story-generation telemetry and exact revisioned Gemini rate-card cost arithmetic across controlled retries. Slice 12 migrated the story baseline to Gemini 3.5 Flash-Lite and added deterministic narrative fixtures/evals for continuity, thread momentum, branch distinctness, consequence specificity, and repetition control. Slice 13 adds Clerk Expo email-OTP identity, internal-user resolution, protected live-story HTTP orchestration, server-authoritative quota/generation/choice resume, and shared RevenueCat identity wiring. Real Clerk email/device tests, live-model/human quality studies, store sandbox tests, remote infrastructure, and deployment remain deferred.

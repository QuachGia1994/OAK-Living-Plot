# Phase 1 foundation architecture

> updated 2026-08-16 · 0.0.0

## Runtime boundary
Living Plot uses one mobile codebase and one backend trust boundary.

- `apps/mobile`: Expo SDK 57, React Native, Expo Router, TypeScript strict.
- `apps/api`: Cloudflare Worker, TypeScript strict.
- Phase 1 state: Cloudflare D1 with versioned SQL migrations and a server-side repository boundary.
- Future Phase 1 audio: private Cloudflare R2 with Cloudflare Queues for asynchronous TTS.
- Phase 1 API auth: Clerk session JWT verification mapped to internal D1 users; mobile Clerk UI remains deferred.
- Future subscription/IAP: RevenueCat.
- Phase 1 story generation: Gemini 2.5 Flash-Lite behind a provider-neutral boundary using the Gemini Interactions API; AI output remains a non-canonical proposal until server validation and later persistence succeed.
- Future TTS: Google Cloud Text-to-Speech Standard/WaveNet behind a provider-neutral boundary.

## Source of truth
D1 owns canonical product/story state. AI/provider outputs are proposals until server validation and persistence succeed. Analytics is observational only and cannot enforce quota, entitlement, or story state.

## Current repository slice
Slice 1 established workspace/runtime foundations. Slice 2 added the D1 schema and story persistence boundary. Slice 3 added API authentication and owner-scoped plot reads. Slice 4 added bounded story prompts, structured Gemini proposals, provider isolation, and validation. Slice 5 added atomic/idempotent episode publication. Slice 6 added canonical v2 plot memory plus atomic/idempotent choice commit and state application. Slice 7 adds server-side UTC quota reservation/consumption/release with append-only reconciliation. Entitlement ingestion, TTS, mobile UI, remote infrastructure, and deployment remain deferred.

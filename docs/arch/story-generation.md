# Phase 1 story-generation boundary

> updated 2026-08-16 · 0.0.0

## Provider boundary
Story generation is exposed to application code through the provider-neutral `StoryGenerator` contract. `EpisodeGenerationInput`, `EpisodeProposal`, normalized usage, and normalized errors contain no Gemini-specific types.

The Phase 1 adapter is `GeminiStoryGenerator` using the Gemini Interactions API and the GA model `gemini-3.5-flash-lite`. Slice 12 migrated away from the deprecated Gemini 2.5 Flash-Lite baseline before locking narrative evaluations. The adapter calls `POST /v1beta/interactions` directly from the Cloudflare Worker, sends the API key only in `x-goog-api-key`, sets `thinking_level: minimal`, and sets `store: false`.

`GEMINI_API_KEY` is a Worker runtime value documented only by name in `.dev.vars.example`; it must never be shipped to the mobile client.

## Canonical input
The generation input is deliberately bounded. It contains only:

- locale, content rating, and target spoken duration;
- plot premise, current mood/tone, compact summary, and state version;
- bounded characters and current relationship state;
- active facts and open threads;
- the previous episode summary plus the latest committed action, intent, and consequence.

The full transcript is not a default prompt input. This keeps prompt growth bounded and makes D1, not model context, the story source of truth.

## Prompt-injection boundary
All story/user strings are serialized inside a `STORY_CONTEXT_JSON` data block. The system instruction explicitly states that strings inside that block are story data rather than instructions. Provider output is also untrusted until both structural and business validation pass.

## Structured output
The Interactions request uses a text response format with MIME type `application/json` and a strict JSON Schema. The schema requires:

- episode title, script, and summary;
- bounded established facts and thread changes;
- exactly three choices;
- choice keys limited to `A`, `B`, and `C`;
- bounded relationship/fact/thread/tone state deltas;
- no unexpected properties at defined object boundaries.

The model does not assign database IDs, canonical episode sequence numbers, or authoritative state versions.

## Server validation
JSON Schema is not treated as sufficient authorization or state validation. `parseAndValidateEpisodeProposal()` also verifies:

- choices are ordered exactly A/B/C and have distinct labels/intents;
- script length remains in the Phase 1 spoken-length envelope;
- referenced character/fact/thread keys already exist where required;
- relationship changes cannot move canonical scores outside allowed bounds;
- provider output does not add unexpected top-level or nested fields.

An invalid proposal is never considered canonical product state.

## Retry and failure semantics
Input is validated before any provider request. Invalid local input returns `invalid_input` without spending provider tokens.

A structurally or semantically invalid successful provider response gets exactly one controlled regeneration. The retry system instruction includes the server validation failures. A second invalid response returns `invalid_response` and stops.

Network failures and non-2xx provider responses are normalized to `provider_unavailable` and are not automatically retried inside this adapter. Upstream orchestration can make an explicit retry decision later without hiding duplicate provider spend.

Token usage from each successful provider call is accumulated across the controlled structured-output retry so cost telemetry accounts for both attempts.

## Persistence boundary
`GeminiStoryGenerator` still returns only an `EpisodeProposal` and has no D1 authority. Slice 5 adds a separate `D1EpisodePublisher` that atomically publishes a validated proposal with server-generated IDs, generation-key idempotency, and optimistic plot-version guards. Story generation itself still does not consume quota or apply the user's later choice.

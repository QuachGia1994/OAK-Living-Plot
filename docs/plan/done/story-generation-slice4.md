# Story-generation implementation slice 4

Status: COMPLETE — STOP GATE PASSED

## Scope
Add the provider-neutral story-generation contract, bounded prompt assembly, Gemini structured-output adapter, server-side episode-proposal validation, and focused tests. Episode publication/idempotency, quota charging, TTS, billing, remote D1, deployment, notifications, and mobile AI UI are explicitly outside this slice.

## Completed
- Provider-neutral `Result<T>`, `StoryGenerator`, generation input, proposal, usage, and error contracts.
- Bounded prompt input validation and prompt-injection data boundary.
- Strict episode response JSON Schema requiring exactly three choices and bounded state deltas.
- Independent structural/business validation for references, relationship bounds, choice distinctness, and script envelope.
- Gemini Interactions API adapter pinned to stable `gemini-2.5-flash-lite`.
- `store: false`, API-key header isolation, normalized provider errors, 12-second request timeout, and token-usage extraction.
- Exactly one controlled retry for invalid structured output only.
- Factory wiring from Worker `GEMINI_API_KEY` without exposing provider types to application contracts.
- Prompt/schema/provider tests with injected fetch; no live Gemini key required.
- Durable story-generation architecture documentation.

## Verification evidence
- Clean `npm ci`: PASS — 898 packages installed from lockfile.
- Root lint: PASS for API and mobile.
- Root typecheck: PASS for API and mobile.
- Root tests: PASS.
- API Vitest: 9 files, 34/34 tests passed.
- Existing D1/auth regression tests remain green.
- Gemini key-pattern scan: PASS; no API key material found in repo.
- AI tests exercise Interactions request shape, `store:false`, structured schema, one controlled retry, provider failure no-retry, input prevalidation, and token usage accumulation without a live Gemini key.

## Guarantees established
- AI output is a proposal only and has no persistence authority.
- User/story strings are serialized as data and model output is treated as untrusted.
- Exactly three A/B/C choices are required by schema and server business validation.
- Existing canonical fact/thread/character references are checked server-side.
- Relationship state cannot be moved outside canonical bounds by a proposal.
- Invalid local input spends zero provider requests.
- Invalid structured output receives at most one controlled regeneration.
- Network/HTTP provider failures do not cause hidden duplicate retries inside the adapter.
- Provider token usage across the controlled retry is accumulated for later cost telemetry.

## STOP
Reached with PASS result. Slice 4 is complete. Do not begin episode publication/idempotency, quota charging, TTS, billing, remote infrastructure, deployment, notifications, or mobile AI UI in this run.

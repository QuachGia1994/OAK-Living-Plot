# Phase 1 analytics and AI cost telemetry

> updated 2026-08-17 · 0.0.0

## Boundary
Workers Analytics Engine is observational only. Telemetry cannot authorize a request, grant an entitlement, reserve quota, publish an episode, commit a choice, or become canonical story state. A telemetry write failure is deliberately fail-open for product behavior.

The Worker binding is `ANALYTICS` and the dataset is `living_plot_events`. The dataset contains operational/product metrics only; D1 remains the product source of truth.

## Story-generation event
Each successful Gemini provider response produces one `story_generation_attempt` data point after server-side proposal validation determines whether that attempt was accepted or rejected. A controlled retry therefore produces two independently costed points instead of hiding the spend of the rejected first response.

Ordered Analytics Engine fields are:

- `index1`: model identifier, used as the sampling key.
- `blob1`: event name (`story_generation_attempt`).
- `blob2`: provider (`gemini`).
- `blob3`: model.
- `blob4`: validation outcome (`accepted` or `rejected`).
- `blob5`: pricing tier (`standard_paid`).
- `blob6`: pricing revision date.
- `double1`: event count (`1`).
- `double2`: attempt number.
- `double3`: provider-reported input tokens.
- `double4`: provider-reported output tokens.
- `double5`: input cost in nano-USD.
- `double6`: output cost in nano-USD.
- `double7`: total cost in nano-USD.

No user ID, plot ID, prompt, premise, character data, script, choice, auth token, API key, or raw provider response is written to Analytics Engine.

## Exact rate-card arithmetic
The current production story model is `gemini-3.5-flash-lite`. Pricing revision `2026-08-16` uses the Gemini Developer API Standard paid rate:

- input: USD 0.30 per 1,000,000 tokens;
- output: USD 2.50 per 1,000,000 tokens, including thinking tokens.

Cost is calculated as integer nano-USD to avoid floating-point currency rounding:

- each input token = 300 nano-USD;
- each output token = 2,500 nano-USD;
- total = input tokens × 300 + output tokens × 2,500 nano-USD.

This is exact against the recorded rate-card revision and provider-reported token counts. It is not a claim that account-level credits or a free-tier allowance cannot reduce the final Google invoice. A model, serving tier, or rate change requires a new pricing revision before the new rate is used.

## Product funnel events
Slice 23 adds a second bounded event family for the Phase 1 value test. Events are emitted only when canonical work is newly created, not when an idempotent replay returns existing state:

- `plot_created`;
- `choice_committed`;
- `next_episode_published`;
- `plot_archived`;
- `plot_restored`;
- `voice_requested` after new voice work is successfully queued.

Product points contain only event name plus optional bounded mood, Free/Plus tier, episode number, and an episode-depth bucket (`episode_1`, `episodes_2_3`, `episodes_4_7`, `episode_8_plus`). They contain no user/plot/episode/choice ID, premise, prompt, script, choice label, consequence, auth data, or credential. Product telemetry uses the same Analytics Engine binding and is fail-open.

## Retention aggregate
`scripts/retention-summary.sql` computes aggregate activation/depth plus exact D1/D7 return counts from canonical D1 timestamps. The query may join on internal user IDs inside D1, but its output is one aggregate row of metric counts only; identifiers never leave the database. `npm run retention:summary:dev` runs the query through a Node/Wrangler `--command` wrapper so the metric row is displayed directly. It intentionally targets the development D1 and requires real Cloudflare development resources/credentials before it can run remotely.

## Failure semantics
Provider HTTP/network failures do not invent token usage or cost. Unknown model pricing or unsafe numeric input is dropped rather than estimated. Analytics Engine exceptions are swallowed at the observational boundary so generation results are unchanged.

A successful provider response with invalid story structure is still costed because tokens were consumed before validation rejected it. The existing aggregate token usage returned by `StoryGenerator` remains unchanged for downstream publication metadata.

## Deferred
Remote Analytics Engine dashboarding, production Worker provisioning/deployment, and production cost-budget alerting remain later work.

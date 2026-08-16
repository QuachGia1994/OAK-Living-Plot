# Narrative fixtures and evaluations implementation slice 12

Status: COMPLETE — STOP GATE PASSED

## Scope
Add deterministic narrative-quality fixtures/evaluations and migrate the production story baseline away from deprecated Gemini 2.5 Flash-Lite before treating the fixture corpus as the Phase 1 reference. Preserve uncommitted Slice 8–11 work. Do not run paid live-model evaluations, wire Clerk mobile identity/live story APIs, provision/deploy remote infrastructure, run store sandbox purchases, commit, or push.

## Model compatibility precondition
- Migrated `GeminiStoryGenerator` to GA `gemini-3.5-flash-lite` on the existing Interactions API boundary.
- Added explicit `generation_config.thinking_level = minimal` for the low-cost/high-throughput story path.
- Preserved structured JSON `response_format`, `store: false`, controlled one-retry validation, and provider-neutral contracts.
- Updated exact Standard paid cost accounting to 300 nano-USD/input token and 2,500 nano-USD/output token for pricing revision `2026-08-16`.
- Production TypeScript no longer targets `gemini-2.5-flash-lite`; the only retained 2.5 string is a negative cost-regression assertion proving stale pricing is rejected.

## Narrative evaluation baseline
- Added three representative provider-neutral fixture scenarios:
  - Vietnamese confession aftermath with visible committed-choice consequence and trust escalation.
  - English family-debt escalation with secret disclosure, relationship pressure, and concrete branch fallout.
  - Prompt-injection-like system-message text treated strictly as school-mystery story data.
- Added deterministic `evaluateNarrative()` after the existing production structural/canonical validator.
- Added five 0–100 evaluation dimensions:
  - continuity;
  - thread momentum;
  - branch distinctness;
  - consequence specificity;
  - repetition control.
- Gate threshold: average >= 80 and every dimension >= 60.
- Added adversarial regression cases for semantically near-duplicate choices, ignored prior consequence, unknown canonical thread key, generic consequences, and excessive script repetition.
- Added `npm --workspace @living-plot/api run eval:narrative` as a focused reproducible gate; no LLM-as-judge or paid provider request is required.

## Verification evidence
- Focused model/cost/telemetry/narrative gate: 4 files, 19/19 tests PASS.
- Narrative eval suite: 8/8 tests PASS, including all positive fixtures and adversarial failures.
- Final clean `npm ci --no-audit --no-fund`: PASS — 910 packages.
- Final root lint: PASS for API and mobile.
- Final root typecheck: PASS for API and mobile.
- Final API Vitest: 25 files, 120/120 tests PASS.
- Final mobile Vitest: 3 files, 13/13 tests PASS.
- Fresh local D1 migrations: PASS — all 6 migrations applied (13, 15, 8, 9, 4, 5 commands).
- Wrangler deploy dry-run: PASS — 409.86 KiB upload / 81.48 KiB gzip; Queue, D1, R2, and Analytics Engine bindings recognized; no deployment performed.
- Static model/secret scan: PASS — no Gemini 2.5 Flash-Lite production target and no secret-like literals in Slice 12 files.
- `git diff --check`: PASS before closure; rerun at final readback.

Known nonblocking install warnings remain unchanged: transitive `uuid@7.0.3` deprecation and npm allow-scripts notices for `esbuild@0.28.1`, `unrs-resolver@1.12.2`, and `workerd@1.20260811.1`.

## Guarantees established
- Narrative CI is deterministic and provider-neutral; a Gemini outage, quota state, billing state, or model latency cannot make the required quality gate flaky.
- The eval layer cannot mutate D1, publish episodes, consume user quota, grant entitlements, or authorize requests.
- Valid JSON is no longer sufficient evidence for narrative quality: continuity, thread movement, meaningful branch divergence, concrete consequences, and repetition are separately regression-tested.
- The runtime story model baseline no longer depends on the deprecated Gemini 2.5 Flash-Lite target.
- Cost telemetry fails closed for stale/unknown model pricing rather than applying the old 2.5 rate to 3.5 usage.

## Deferred
Live provider benchmark sampling, human preference studies, per-locale editorial calibration, mobile funnel analytics, Clerk mobile identity/live story API integration, real-device/store sandbox integration, remote infrastructure provisioning/deployment, production cost alerts, and store submission remain later work.

## STOP
Reached with PASS result. Slice 12 is complete. Do not begin the next integration/release stage in this run.

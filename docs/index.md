# Living Plot docs

- [Product baseline](biz/product.md) — audience, value proposition, monetization guardrails, and Phase 1 exclusions.
- [Phase 1 foundation architecture](arch/foundation.md) — current workspace/runtime boundaries and deferred infrastructure.
- [Phase 1 D1 data model](arch/data-model.md) — canonical story state, schema invariants, and local migration workflow.
- [Phase 1 auth and ownership boundary](arch/auth-security.md) — Clerk session verification, internal-user mapping, and owner-scoped access rules.
- [Phase 1 story-generation boundary](arch/story-generation.md) — bounded prompt context, Gemini structured output, validation, retry, and provider isolation.
- [Phase 1 episode publication boundary](arch/episode-publication.md) — atomic D1 publish, generation-key idempotency, and optimistic version guards.
- [Phase 1 choice-commit boundary](arch/choice-commit.md) — canonical state v2, choice idempotency, state application, and commit concurrency.
- [Phase 1 quota ledger](arch/quota-ledger.md) — UTC daily limits, atomic reservations, terminal transitions, and reconciliation.
- [Foundation implementation slice 1](plan/done/foundation-slice1.md) — completed workspace/CI foundation and verification evidence.
- [D1 implementation slice 2](plan/done/d1-slice2.md) — completed D1/domain baseline and verification evidence.
- [Authentication implementation slice 3](plan/done/auth-slice3.md) — completed auth/ownership boundary and verification evidence.
- [Story-generation implementation slice 4](plan/done/story-generation-slice4.md) — completed AI provider boundary and verification evidence.
- [Episode-publication implementation slice 5](plan/done/episode-publication-slice5.md) — completed publication transaction/idempotency boundary and verification evidence.
- [Choice-commit implementation slice 6](plan/done/choice-commit-slice6.md) — completed choice commit/state application boundary and verification evidence.
- [Quota implementation slice 7](plan/done/quota-slice7.md) — completed quota ledger/enforcement boundary and verification evidence.

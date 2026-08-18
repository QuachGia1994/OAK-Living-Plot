# Phase 1 retention loop

> updated 2026-08-18 · current application contract

Retention remains subordinate to the product value test: users return to see branch consequences, not because the app manufactures pressure.

## Canonical sources

No retention-only mutable story state exists.
- `activeDramas` is derived from owner-scoped active dramas with persisted scenes.
- total choices/daily activity derive from append-only `choice_commits` joined through owned persisted drama rows.
- streak is derived from UTC commit days.
- each `DramaSummary.resumeLine` derives from the current scene summary or canonical committed consequence.

The underlying D1 tables still use `plots/episodes`; `D1DramaRepository` normalizes them to application Drama/Scene terminology.

## Daily spark

`GET /v1/dramas/home` includes one deterministic UTC daily drama prompt with label, premise, mood, and lead name. The prompt set is bounded in code and localized using the saved `uiLocale`; the user's `dramaLocale` remains the generation-language default for newly created dramas.

The mobile Home surface passes the prompt into `/create` as editable setup data. Generation remains an explicit user action.

## Home contract

The authenticated home payload returns:
- `recentDramas`;
- `currentStreakDays`;
- `choicesMade`;
- `activeDramas`;
- `dailyPrompt`;
- per-drama `resumeLine`.

Preview mode implements the same application contract rather than a separate screen model.

## Trust floor

Streaks do not change quota, entitlement, branch outcomes, pricing, or access. Phase 1 sends no streak-loss notifications and introduces no confirm-shaming, forced continuity, countdown pressure, or reward currency.

Retention tests cover UTC streak derivation and stable localized prompt selection. `http-drama.test.ts` proves the HTTP home projection is derived from canonical owned state.

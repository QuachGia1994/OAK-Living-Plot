# Phase 1 retention loop

> updated 2026-08-17 · 0.0.0

## Purpose
Retention stays subordinate to the product value test: users should return because they want to see consequences, not because the app manufactures pressure.

## Canonical sources
No retention-only database state is introduced.

- active plot count comes from owned active plots that already have episodes;
- total choices and daily activity come from append-only `choice_commits` joined through owned plots;
- current streak is derived from UTC commit days and remains alive when the latest committed choice is today or yesterday;
- recent-story `resumeLine` is derived from the current episode summary or the committed consequence.

This keeps D1 story history as the single source of truth and makes streaks rebuildable rather than mutable counters.

## Daily spark
`GET /v1/story/home` includes one deterministic UTC daily story prompt. The prompt contains a label, premise, mood, and character name. It is selected from a bounded in-code Phase 1 prompt set by UTC day, so all users see a stable prompt during that UTC day without additional persistence.

The mobile home surface can pass the prompt directly into `/create`, where it prefills the existing three-field setup. The user can still edit every field before generation.

## Home retention surface
The authenticated home payload returns:

- `currentStreakDays`;
- `choicesMade`;
- `activePlots`;
- `dailyPrompt`;
- per-plot `resumeLine`.

Preview mode mirrors the same DTO with deterministic sample data so UI work does not fork the screen contract.

## Trust and behavior floor
Streaks are descriptive only. They do not change quota, entitlement, story outcomes, pricing, or access. Phase 1 sends no streak-loss notifications and adds no confirm-shaming, forced continuity, countdown pressure, or reward currency.

## Verification
Pure retention tests cover consecutive UTC days, yesterday continuity, gap reset, total choice aggregation, and stable daily prompt selection. Live-story HTTP tests verify retention is emitted from canonical owned history.

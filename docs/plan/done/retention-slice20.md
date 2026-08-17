# Retention loop slice 20

Status: COMPLETE

## Scope
Added lightweight reasons to resume Living Plot while keeping the Phase 1 value test centered on story consequences.

## Implemented
- Derived choice streak and total choices from append-only canonical `choice_commits`; no mutable streak table/counter was added.
- Added active-plot count and per-plot `Previously:` resume line.
- Added one deterministic UTC daily spark with premise/mood/character prefill into the existing create flow.
- Added an empty-state path for users with no active plot.
- Added no notification pressure, reward currency, access penalty, or dark pattern.

## Verification
Pure tests cover UTC streak continuity/gap reset and daily prompt stability. Live-story HTTP tests prove retention metadata is produced from owned canonical history. Mobile HTTP tests verify retention/resume DTO parsing.

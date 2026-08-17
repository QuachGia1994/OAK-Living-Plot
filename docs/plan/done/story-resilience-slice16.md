# Live story resilience slice 16

Status: COMPLETE

## Scope
Made the authenticated mobile core loop converge safely after uncertain network responses and stale/conflicting client views.

## Implemented
- Plot creation reuses one generation key for a stable creation key until definite success/failure.
- Next-episode generation reuses one per-plot generation key across network retries.
- Choice conflict/stale state reloads the canonical plot instead of selecting a local winner.
- Home parsing now includes server retention/resume metadata with strict DTO validation.

## Verification
Behavior tests cover lost-response retry key reuse, canonical conflict resync, fresh bearer tokens, malformed server payload rejection, and backend-owned state semantics.

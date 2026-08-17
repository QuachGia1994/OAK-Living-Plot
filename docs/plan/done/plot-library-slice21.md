# Slice 21 — Plot library lifecycle

Status: COMPLETE — STOP GATE PASSED

Implemented owner-scoped active/archived library reads, idempotent archive/restore mutations, home exclusion for archived plots, read-only archived story UX, and preview/live client parity. Existing `plots.status` remains canonical; no migration or shadow archive state was added.

Verification coverage proves owner isolation, archive/restore replay, active-home convergence, and mutation lock while archived.

# Slice 29 — Safe account erasure

Status: COMPLETE — STOP GATE PASSED

Added authenticated `POST /v1/account/delete` with an exact typed confirmation phrase. The server resolves private audio keys from owner-scoped D1 rows, deletes R2 objects first, and only then deletes the internal D1 user so existing foreign-key cascades remove application-owned dependent state.

R2 cleanup failure is fail-closed: canonical D1 state is retained for a later explicit retry. Mobile deletion is a non-retried POST and signs out only after server success. This boundary deletes Living Plot application data; it does not claim to delete/cancel the separate Clerk identity or RevenueCat/store account.

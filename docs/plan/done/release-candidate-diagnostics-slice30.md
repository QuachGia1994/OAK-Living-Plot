# Slice 30 — Release-candidate diagnostics and privacy surface

Status: COMPLETE — STOP GATE PASSED

Added a Settings/About surface with app version, preview/live mode, API configured status, Clerk configured/sign-in state, RevenueCat mode, and a bounded backend health probe. Safe diagnostics can be shared without API URLs, tokens, internal IDs, story text, provider responses, or secret values.

The same surface explains the D1/private-R2/analytics boundaries plus export and application-data erasure behavior. Live-provider verification remains external and is not inferred from local configuration status.

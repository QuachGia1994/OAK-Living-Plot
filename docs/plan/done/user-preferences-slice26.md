# Slice 26 — User story preferences

Status: COMPLETE — STOP GATE PASSED

Added owner-scoped D1 preferences for interface-language preference, new-story locale, and approved narrator variant. Protected GET/POST routes derive ownership from the authenticated internal user and validate bounded values. Mobile Settings uses the preference boundary; new live plots use the preferred story locale and fresh narration uses the preferred approved voice. Existing plot locale/canonical history is never rewritten.

The current beta stores the interface-language preference but does not claim full translated product copy in this slice.

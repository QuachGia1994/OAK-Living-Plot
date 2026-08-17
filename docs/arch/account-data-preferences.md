# Phase 1 preferences, sharing, and account-data boundary

> updated 2026-08-17 · 0.0.0

## User preferences
Migration `0008_user_preferences.sql` adds one owner-scoped preference row per internal user. The row stores only bounded application defaults:

- interface-language preference: `en` or `vi`;
- default locale for newly created stories: `en-US` or `vi-VN`;
- approved narrator variant: `en-narrator-female` or `vi-narrator-female`.

`GET /v1/preferences` returns defaults when a row does not exist. `POST /v1/preferences` validates every value and derives ownership from the authenticated internal user; client-supplied identity is ignored. Preferences do not rewrite existing plots. A plot's persisted `plots.locale` remains canonical for that story.

The saved interface-language preference now drives the native product shell and core-loop copy in English or Vietnamese, including auth, home/onboarding, create, story controls, history, library, Plus, Settings/Data, validation, and narration controls. Generated episode text remains in the plot's own persisted story locale; switching interface language never rewrites canonical plot content. Daily-spark copy is returned in the saved interface locale, while the new-story locale and narrator remain separate preferences.

## Spoiler-safe native share
Sharing is a client-only native Share action. Copy is deterministically built from the plot title, current episode number, and a bounded premise hook plus a generic Living Plot call-to-action.

Share copy does not contain internal IDs, auth identity, bearer tokens, full episode scripts, selected-choice consequences, provider metadata, or private audio information. No public story endpoint, public deep link, or generated video is introduced.

## Owner data export
`GET /v1/account/export` returns a versioned read-only snapshot for the authenticated internal user. The export includes application-owned preferences, effective entitlement summary, UTC usage counters, plots, characters, validated episode scripts/summaries, choices/commit markers, and client-safe audio metadata.

The export excludes Clerk subjects/tokens, provider credentials, RevenueCat raw webhook bodies or secrets, Analytics Engine rows, quota reservation keys, provider voice IDs, private R2 object keys, and audio bytes. The mobile client exposes the JSON snapshot only through a user-initiated native Share sheet.

## Application-data erasure
`POST /v1/account/delete` requires the exact phrase `DELETE MY LIVING PLOT DATA`. It is a mutation and therefore receives no automatic network retry from the shared transport.

Deletion order is fail-closed:

1. resolve owned private audio object keys server-side;
2. delete those R2 objects;
3. only if all private-audio cleanup succeeds, delete the internal D1 user;
4. rely on D1 foreign-key cascades for plots, episodes, choices, preferences, usage/quota rows, RevenueCat audit/materialized entitlement rows, and audio metadata.

If R2 cleanup fails, D1 is retained so the operation can be safely retried. This boundary deletes Living Plot application data only. It does not claim to delete or cancel the separate Clerk identity or RevenueCat/store account.

## Release-candidate diagnostics
The Settings surface displays only safe runtime facts: app version, preview/live mode, API configured state, Clerk configured/signed-in state, RevenueCat mode, and a bounded `/health` result. The health check aborts after five seconds.

The diagnostics share payload contains only those status values. It excludes API URLs, user IDs, tokens, story text, provider responses, and secret values.

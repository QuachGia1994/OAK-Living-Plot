# Phase 1 preferences, sharing, and account-data boundary

> updated 2026-08-19 · current application contract

## Preferences SSoT

`UserPreferences` is the application owner of:
- `uiLocale: en | vi`;
- `dramaLocale: en-US | vi-VN` for newly created dramas;
- approved narrator variant.

`GET/POST /v1/preferences` are authenticated and owner-scoped. The existing D1 column remains named `story_locale` for migration compatibility; `D1UserPreferencesRepository` validates and maps it to application `dramaLocale`. Mobile does not use the physical column name. Before a profile has any saved row (`updatedAt: null`), mobile resolves the device/app language and persists matching EN/VI defaults after authentication; this prevents the UI from changing language merely because the backend default is English. Once the user explicitly saves preferences, that saved profile remains authoritative.

Changing UI language does not rewrite existing drama content. A drama keeps the locale captured on creation. Preview SecureStore accepts legacy `storyLocale` only as a one-way compatibility read, then exposes `dramaLocale`.

When VI is selected, user-facing UI copy follows VI keys. Provider/model proper nouns may remain unchanged.

## Spoiler-safe share

Sharing is a client-only native Share action built from a bounded drama title, current scene number, premise hook, and generic Living Plot copy. The share builder follows `uiLocale` and uses Scene/Cảnh terminology.

It excludes IDs, bearer tokens, full scene scripts, committed consequences, provider metadata, and private media information. There is no public drama endpoint or public deep-link backend in Phase 1.

## Owner data export v3

New clients request `GET /v1/account/export?schema=3`, which returns `schemaVersion: 3` with application vocabulary. The queryless `GET /v1/account/export` remains a v2 compatibility projection for already-installed clients and omits the new referral/portrait fields rather than breaking their parser:
- preferences and effective entitlement;
- UTC usage as generated/voiced scenes;
- privacy-safe referral state: own share code, claimed code, successful-referral count, and available/earned/spent bonus voice-credit totals;
- `dramas[]` with characters, `scenes[]`, client-safe voice media metadata, and derived portrait status/attempt/ready timestamps.

The export excludes Clerk subjects/tokens, inviter/referred internal user IDs, referral event IDs, provider credentials, RevenueCat secrets/raw webhook bodies, Analytics Engine rows, quota/bonus reservation keys, portrait story fingerprints, provider voice IDs, private R2 object keys, and generated audio/image bytes.

D1 queries may still read `plots/episodes/story_locale`; those names are normalized before the export crosses the HTTP boundary.

## Application-data erasure

`POST /v1/account/delete` requires the exact phrase `DELETE MY LIVING PLOT DATA`. Mutation requests are never automatically retried.

Deletion is fail-closed:
1. resolve owner-scoped private voice keys and enumerate every `portraits/{dramaId}/` R2 prefix for owned dramas, including any race-orphan portrait object no longer referenced by a canonical row;
2. delete those R2 objects;
3. only after private-object cleanup succeeds, delete the internal D1 user;
4. D1 foreign-key cascades remove application-owned drama/media/preference/quota/billing/referral rows.

This deletes Living Plot application data, not the separate Clerk identity or store/RevenueCat account.

## Safe diagnostics

Settings exposes only bounded runtime/configuration/health facts. Diagnostics never include API URLs, internal user IDs, tokens, drama text, provider payloads, or secret values.

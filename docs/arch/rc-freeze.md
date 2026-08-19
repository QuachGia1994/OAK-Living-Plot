# Living Plot RC freeze — state ownership

> updated 2026-08-19 · 0.0.0

## Feature freeze
UI/visual systems are frozen for beta RC unless a functional/accessibility/platform bug requires a minimal fix.

Frozen surfaces: Home, Create, Playback A/B/C, Library, Settings, Plus, LP brand, iOS Liquid Glass tabs + minimize-on-scroll, Android native dark tabs.

## State owners (SSOT)

| Concern | Owner |
| --- | --- |
| Drama / Scene / Branch / Choice lock | API D1 (`plots`, `episodes`, `choice_commits`) via `D1ChoiceCommitter` / drama runtime |
| Generation job + provider normalize | API AI boundary (`gemini-scene-generator` + scene schema) |
| Quota | API `D1QuotaLedger` (reserve → consume / release); Free 3/1, Plus 20/10 UTC day |
| Voice / MediaAsset | API `D1AudioService` + queue; ready asset replay does not re-reserve |
| Entitlement | API entitlement repository + RevenueCat webhook/subscriber |
| Session / auth | Clerk session verifier → mobile auth context |
| Preferences | API preferences + mobile preferences context |
| Playback phase (UI) | `derivePlaybackState` from canonical drama + local action only |
| Selected choice (transient) | Mobile `useDramaPlayback.selectedChoiceId` only; never written as branch until commit succeeds |

## Invariants
- `selected != locked`: UI selection does not mutate `branch` until `commitChoice` succeeds server-side.
- One choice lock per episode: `choice_commits` + episode `ready → completed` guarded batch; replay is idempotent.
- Quota cannot double-charge: reservation key + ledger transitions; release on provider failure.
- Voice replay: existing non-failed `audio_assets` returns without new reservation.
- Voice configuration != auth session: public API URL + Clerk configuration select the authenticated HTTP voice client; a missing session surfaces `auth_required`, while only an intentionally unconfigured preview uses the unavailable client.
- Session ownership is fail-closed: auth loading/sign-out/account change changes the keyed authenticated runtime owner, unmounting prior Drama playback and private narration state before another principal can render it.
- Navigation params carry identity only (`dramaId`), not business DB.

## Client concurrency
`useDramaPlayback` acquires a synchronous ref-backed playback-action lock before updating React presentation state. `commitChoice` / `continueDrama` therefore reject a second tap in the same render tick as well as later taps while a mutation is in flight.

## Platform
- Android: `DynamicColorIOS` only under `Platform.OS === 'ios'`; the four-tab shell uses Expo Router JavaScript Tabs because Expo NativeTabs has no Android minimize API. One shared thresholded scroll controller compacts labels/height on downward scroll and expands on upward/top/route reset without changing route ownership.
- iOS: NativeTabs + `minimizeBehavior="onScrollDown"` retained unchanged.

## External live gate
Preview-safe APK/IPA builds remain valid RC artifacts when public live configuration is absent. Private narration becomes live only after the mobile API/Clerk values and backend Queue/Gemini TTS/private R2 resources are provisioned; the current narration path uses the server-side `GEMINI_API_KEY` and has no Google Cloud billing/service-account dependency. The client must report live state honestly and never fall back to fixture audio.

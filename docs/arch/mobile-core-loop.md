# Phase 1 mobile core loop

> updated 2026-08-16 · 0.0.0

## Responsibility
Slice 8 makes the product loop concrete in the Expo client without moving backend authority into the device. The mobile app owns presentation and transient selection state only. Canonical plot/choice/quota state remains a backend responsibility.

## Routes
Expo Router owns three core routes:

- `/` — product home, quota display, recent plots, start/resume actions.
- `/create` — first-run plot setup with exactly three meaningful decisions: premise, mood, and one main character.
- `/story?plotId=...` — current episode reader, all three choices, commit confirmation, visible committed consequence, and next-episode action.

The root Stack keeps headers hidden because the product supplies its own compact navigation affordances and story context.

## Story client boundary
UI routes depend on `StoryExperienceClient`, not Gemini, D1, Clerk, or provider payloads. The interface covers:

- load home/recent plot state;
- create a plot;
- load/resume a plot;
- commit one choice;
- request the next episode.

`PreviewStoryExperienceClient` is deterministic local preview data for this UI-only slice. It exists so the complete interaction can be exercised before HTTP orchestration routes are added. Replacing it with an authenticated API client must not require screen rewrites.

The preview client deliberately mirrors backend semantics where useful:

- every episode has exactly A/B/C choices;
- a next episode requires a committed choice;
- retrying the same choice is idempotent;
- committing a different choice after one is canonical returns a conflict;
- episode 2 includes the prior committed consequence;
- resume returns the current unresolved episode unchanged.

It is not canonical persistence and is not presented as production networking.

## First-run friction
Before episode 1, the user supplies only:

1. premise/situation;
2. mood;
3. main character name.

Premise and character input are NFC-normalized and length-bounded in a pure validation module outside React components. Optional traits, relationships, title editing, and advanced setup are intentionally absent.

## Episode UX
The story screen always communicates current plot, episode number, and state:

- `Awaiting your choice` while the episode is unresolved;
- `Choice committed` after one option is canonical in the client boundary.

All three choices render together in one group. Tapping only selects locally; no transition is treated as committed until the explicit commit action succeeds. After commit, the UI shows the consequence before exposing `Generate episode N+1`.

This separation prevents a transient tap from being visually confused with canonical choice state.

## Waiting and failure states
Home/resume/create/commit/next actions have explicit loading or retryable error states. A failed next-episode request preserves the committed consequence. A failed create request preserves the user's setup fields. Missing plot links provide a path back home.

No voice loading state is coupled to text because TTS remains a later derived-media slice.

## Quota display
The home screen shows text/voice remaining values as display-only data through the client boundary and explicitly labels the backend as authoritative. Slice 8 does not reimplement quota enforcement on device.

## Visual system
The first mobile system is intentionally small:

- cinematic dark background;
- warm accent for decisions/continuity;
- high-contrast reading typography;
- reusable `Screen`, `Card`, `Pill`, `ActionButton`, loading, and error primitives;
- Safe Area handling at the root and screen level.

No icon package, animation library, image asset pipeline, or design-system dependency was added.

## Verification
Mobile behavior tests cover:

- NFC input normalization;
- minimal setup validation;
- exactly three A/B/C choices;
- same-choice idempotency and conflicting-choice rejection;
- next-episode choice requirement;
- visible prior consequence in episode 2;
- unresolved episode resume behavior.

Expo Android static export is part of the STOP gate so file-based routes, aliases, Safe Area imports, React Compiler, and Metro resolution are checked beyond TypeScript alone.

## Deferred
Clerk mobile auth/session storage, live API orchestration, server plot-create/generate endpoints, TTS playback, RevenueCat/paywall, analytics, remote D1, deployment, native-store builds, and external beta remain outside this slice.

# Living Plot — Cinematic drama redesign

## Product correction

Living Plot is a 60–90 second interactive AI mini-drama product. The core player should be understood visually before the user reads explanatory copy.

The redesign rule is:

> Visuals tell the story. Text supports the story.

The target loop is:

`poster / scene → character → visual scene → subtitle beat → scene transition → branching choices → consequence → next scene`

The previous UI leaned toward:

`heading → paragraph → paragraph → button → paragraph`

That pattern remains acceptable for history, settings and legal/data explanations, but not for the main drama loop.

## Reference weighting

- React Bits — 40%: memorable composition and motion, adapted to React Native and kept narrative-purposeful.
- Huashu Design — 30%: content-derived art direction, editorial hierarchy, restraint, anti-generic-AI styling.
- Magic UI — 20%: selective glow, beam and reveal language, adapted without effect spam.
- shadcn/ui — 10%: primitive boundaries, accessible interaction states and predictable composition.

No reference demo/effect is copied directly. The implementation stays native to the existing Expo / React Native stack and adds no UI dependency.

## UI audit

### Full redesign priority

1. **Story player — highest priority**
   - Previous state: episode title followed by one long body paragraph, optional voice card, list-like choices and text consequence card.
   - Current vertical slice: visual scene stage, character presence, content-derived scene motif, subtitle beats, scene progress, large branching cards and consequence reveal.

2. **Library — next full redesign**
   - Current state is still title/resume text rows.
   - Target is a poster/cover shelf with visual status, episode number and one-line resume metadata.

3. **Home lower feed — next full redesign**
   - Above the fold is now poster-first.
   - Retention, quota, how-it-works and recent-plot sections below remain information/text led.

4. **Create setup — substantial redesign later**
   - Generation state is now cinematic.
   - Premise/mood/character setup still reads as an editorial form. It should evolve toward a visual casting + mood + premise composer without changing draft validation/business logic.

### Hybrid / text can remain important

5. **History**
   - Text-heavy is acceptable because this is recap/reference territory.
   - Later add scene thumbnail/motif markers and clearer episode chronology.

6. **Plus / Auth / Settings & Data**
   - Utility screens may stay structurally text-led.
   - They should inherit the same tokens, contrast and visual identity but must not mimic the drama player unnecessarily.

## Reusable components and logic

Keep:

- Story client contracts and canonical state flow.
- `createPlot`, `commitChoice`, `requestNextEpisode`, archive/restore and history behavior.
- Auth gates and localization.
- `ActionButton`, `ErrorState`, basic `Card`/`Pill` primitives.
- Reduced-motion handling.
- Episode voice state machine and audio client behavior.
- Share/history navigation.

The voice feature is intentionally secondary to the scene/decision loop in the new player, rather than inserted between scene and choice.

## Current data constraint

The current story contract provides:

- plot title and premise,
- mood,
- one main character name,
- episode title/body/summary,
- exactly three choices,
- committed consequence.

It does **not** provide generated artwork URLs, video, scene lists, character portraits or camera metadata.

This checkpoint therefore does not invent a backend media schema. Instead it uses deterministic native visual direction derived from existing canonical data:

- mood controls the cinematic palette and rim light,
- character name controls framing position,
- episode/premise language selects a lightweight scene motif,
- episode prose becomes subtitle-sized beats without changing canonical text.

Current motifs:

- `signal` — phone/message/recording language,
- `threshold` — door/hallway/elevator/building language,
- `table` — restaurant/kitchen/meal language,
- `street` — street/city/train/rain language,
- `interior` — fallback dramatic interior.

This is a transitional visual layer until a future product/backend gate explicitly supports generated scene media.

## Visual system

### Typography

- Display serif: plot title, scene title, branching choice headline.
- System body: subtitles, support copy and controls for mobile readability.
- Monospace: episode number, scene cue, intent/status metadata.

Long canonical episode prose is no longer displayed as one reading block in the player. It is segmented into at most four subtitle beats while preserving all text.

### Cinematic palette

Large surfaces use dark, low-chroma scene colors. Each mood has one controlled rim/accent color:

- tense — deep black-red / warm danger rim,
- romantic — black-plum / restrained rose rim,
- mysterious — blue-black / cold blue rim,
- hopeful — green-black / soft mint rim.

The palette avoids generic neon SaaS gradients. Light is treated as scene lighting, not decoration.

### Scene surfaces

- Player scene minimum height: 560px-equivalent native points.
- Home poster minimum height: 500.
- Scene radius token: 28.
- Choice radius token: 20.
- Subtitle dock uses a high-opacity near-black overlay for legible text over lighting/art.
- Character silhouette remains visible behind the dialogue layer.

### Branching choices

- Exactly three large cards from the canonical episode choices.
- Strong A/B/C key and intent metadata.
- Selected state uses the scene mood rim/haze.
- Commit action is separated into a clear canonical lock step.

### Motion

Timing tokens:

- micro response: 160ms,
- subtitle/reveal: 280ms,
- scene transition: 420ms,
- consequence sweep: 560ms.

Motion is limited to narrative events:

- new subtitle beat,
- loading/generation pulse,
- consequence reveal,
- existing screen reveal.

Reduced-motion preference disables or collapses these animations to static states.

## Vertical slice implemented in this checkpoint

### Home

- Above-the-fold entry is now a full visual drama poster.
- Existing plot: poster resumes the current episode.
- No plot: poster frames the daily prompt as a new drama.
- Create/library/settings remain secondary actions below the poster.
- Initial loading now uses a scene-framing visual state rather than a spinner-only reading state.

### Create

- Draft form and validation remain unchanged.
- After pressing Start Episode 1, the waiting state becomes a cinematic generation frame with character presence and mood lighting.
- No fake percentage or fake generation stage is shown.

### Story player

- Full visual scene is the primary surface.
- Main character is visibly present as a rim-lit silhouette.
- Scene motif reflects episode language where possible.
- Canonical body is shown as subtitle beats, not a long paragraph.
- User taps the scene to advance subtitle beats.
- Scene progress is visible at the top.
- Three large choice cards follow the scene.
- Choice commit/business logic is unchanged.
- Once committed, consequence animates over the same scene visual.
- Next-episode CTA continues from the canonical consequence.
- Voice controls remain available but follow the core scene/decision flow.

## State audit for the vertical slice

- Home loading: visual drama loading stage.
- Home error: existing explicit error state retained.
- Home full: poster-first experience.
- Create idle: existing validated setup.
- Create invalid: existing field validation retained.
- Create generation: cinematic generation visual.
- Create generation error: existing canonical-safe retry messaging retained.
- Story loading: cinematic scene loading stage.
- Story missing/error: explicit retry/back states retained.
- Story awaiting choice: scene + subtitle beats + three choices.
- Story partial selection: selected choice highlighted, commit dock summarizes it.
- Story committed: consequence reveal + next episode action.
- Story read-only/archive: explicit paused state retained.
- Voice unavailable/pending/ready/error: existing audio state machine retained.

## Visual Library + Home supporting feed checkpoint

### Library

- Active and paused stories now render as cinematic cover tiles rather than title/resume rows.
- Covers reuse the same mood lighting, character silhouette and content-derived scene motifs as the core player.
- Episode number and decision status are visible directly on the cover.
- Open/read remains a cover interaction; pause/restore stays a separate explicit action so archive semantics are unchanged.
- Paused covers are visually subdued without hiding their identity.
- Library loading uses the visual drama loading stage.
- A truly empty library now gets a visual scene invitation plus a direct Create CTA instead of explanatory copy alone.

### Home supporting feed

- The explanatory `How Living Plot works` block is removed from the main home flow.
- The old text-heavy retention card, quota card and repeated Daily Spark card are replaced by a compact four-metric story HUD.
- Daily Spark becomes a visual cover in the `Up next` shelf when a current drama already occupies the hero poster.
- Secondary recent plots become cover tiles and the currently featured hero plot is excluded from the shelf to avoid duplication.
- Plus remains accessible as a compact utility row rather than another large information card.
- First-run support copy is reduced to one short cue beneath the poster instead of repeating the product explanation.

## Large Stage A — Complete cinematic surfaces

The remaining surface redesign is now consolidated and complete:

- History is a cinematic hybrid recap with visual episode frames, illuminated chronology, locked/current markers, choice/consequence blocks and a visual empty/loading state.
- Plus is a cinematic daily-pass surface with Free→Plus metrics, clear primary purchase action and separated recovery utilities.
- Auth uses an ambient identity frame and a single OTP dock while preserving the Clerk email-code state machine exactly.
- Settings uses a control-room visual hierarchy, option tiles, compact owned-data policy cards, irreversible deletion vault and terminal-style safe diagnostics.
- Home signed-out/first-run/Plus support copy is compressed into visual/mono cues instead of explanatory paragraphs.
- Create sign-in and helper copy are reduced; Story read-only/control surfaces are compact cinematic docks.
- No core screen in the main journey now depends on a long explanatory paragraph to communicate what the product is.

History and utility screens intentionally retain more text than the drama player where the task is recap, billing, privacy or diagnostics.

## Next rollout stages

### Stage A — Visual Library — COMPLETE

Poster/cover shelf, visual loading/empty treatment and unchanged archive/restore behavior are implemented.

### Stage B — Home supporting feed — COMPLETE

Recent story covers, compact retention/quota HUD and removal of redundant explanatory sections are implemented.

### Stage C — Visual Create — COMPLETE

Create now behaves like a lightweight scene director rather than a three-row form:

- A live cinematic scene preview sits above the setup and reacts to premise, mood and lead name without creating fake backend state.
- Premise is a focused spark composer with the existing 600-character limit and validation preserved.
- The four canonical moods render as 2×2 visual scene swatches using the same cinematic palette as the player.
- Character naming is paired with a casting frame so the lead is visually present before generation starts.
- The submit action is framed as `Play episode 1`; request-key reuse, normalization, validation, auth and `createPlot` behavior are unchanged.
- Generation continues into the existing cinematic directing state rather than falling back to a generic spinner.

### Stage D — History hybrid — COMPLETE

Visual recap frames, episode chronology, locked/current state and choice/consequence presentation are implemented without changing canonical history ordering.

### Stage E — Utility consistency — COMPLETE

Plus/Auth/Settings now share the cinematic palette, display/mono hierarchy and dark high-contrast surfaces while remaining utility-first.

### Large Stage B — Final cinematic productization — NEXT

Run the full journey/device QA, motion/performance/accessibility/localization pass, then exact-SHA Android/iOS native release verification and final cinematic RC closeout.

### Stage F — Real generated scene media gate

Only after product/backend architecture is explicitly reopened for scene media, define a durable media contract for poster/scene artwork (and later motion/video if warranted). Until then, the native deterministic art layer keeps the app visually coherent without pretending that generated assets exist.

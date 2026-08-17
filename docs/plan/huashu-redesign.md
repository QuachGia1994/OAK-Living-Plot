# Huashu-inspired mobile redesign

> started 2026-08-17 · production React Native adaptation

## What is being adapted
The reference repository is an HTML-native design/prototyping skill, not a production mobile framework. Living Plot therefore adopts its design reasoning rather than its HTML runtime:

- existing-context-first: preserve the current product/content model and backend behavior;
- anti-AI-slop: no purple tech gradients, decorative emoji, fake metrics, gratuitous imagery, or nested rounded-card dashboards;
- content-derived form: the visual motif comes from scenes, chapters, decisions, and consequences;
- typography carries hierarchy: narrative display type for story moments, restrained system sans for controls and metadata;
- fewer containers: separators, spacing, scale, and surface contrast should do more work than borders;
- one signature detail at 120%: use a chapter/scene marker and warm editorial accent consistently instead of decorating every region;
- real interaction remains mandatory: the redesign cannot weaken existing live/preview behavior, accessibility, reduced motion, or canonical-state handling.

## Three Living Plot directions

### A — Cinematic Editorial — initial implementation
Warm charcoal paper, restrained amber/rust accent, serif display/story typography, quiet metadata, chapter/scene markers, broad breathing room. Home reads like a story frontispiece rather than a product dashboard. Choices feel like editorial decision blocks rather than generic cards.

Why first: Living Plot's primary content is short-form narrative text and branching decisions. This direction makes the content itself the visual anchor and requires no fabricated imagery.

### B — Script Room
Near-black production desk aesthetic, screenplay-like hierarchy, monospace scene/episode metadata, denser information, stronger horizontal rules. Best if future validation shows users value speed and plot-state legibility over atmosphere.

### C — Signal Noir
High-contrast black/ivory with one electric warm signal color, compact status language, audio/signal motif used only where voice/state is meaningful. Best if the AI/voice identity needs to be more visible later without becoming a generic neon AI interface.

## First implementation checkpoint
Direction A is applied to the shared theme/primitives plus Home, Create, and Story. The first pass establishes the editorial typography, warm restrained accent, flatter controls, story-first hierarchy, and reduction of generic dashboard cards.

## Second implementation checkpoint — complete
The remaining Phase 1 product surfaces now use the same grammar:

- Library is a reading list with ruled active/paused sections instead of a stack of plot cards.
- History is a chronological editorial timeline; each episode is separated by rhythm and rules rather than a container.
- Plus keeps one warm feature surface for the paid plan so monetization remains visually distinct without turning into a pricing dashboard.
- Auth uses text-first email/code fields and ruled sections rather than a generic form card.
- Settings uses editorial sections for preferences, privacy/data, and diagnostics; destructive deletion remains a semantically distinct danger surface.
- Compact operational metadata uses the mono token while story-facing titles/body use the display token.

The redesign deliberately keeps meaningful pills/status indicators and the destructive-data container because these carry state or safety meaning. It removes containers where spacing, type, and separators can express the hierarchy more clearly.

No API, schema, entitlement, quota, story-state, telemetry authority, or Phase 1 product boundary changes are part of this redesign.

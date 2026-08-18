# Living Plot project guidance

Use the shared Aki rule router at `~/.claude/skills/akirule/SKILL.md` before work that matches its signals.
Follow `AGENTS.md` for project-scoped agent orchestration and stage handoff.

## Product boundary
- Phase 1 targets iOS and Android through Expo/React Native.
- `apps/api` is the single backend trust boundary on Cloudflare Workers.
- Canonical application state is `Drama → Scene → Branch`; D1 persists it and `D1DramaRepository` projects storage rows into the product model. Provider payloads are never canonical.
- Runtime ownership starts at `docs/arch/drama-runtime.md`; the wider product and architecture index is `docs/index.md`.

## Scope discipline
Do not add generated video, voice cloning, Vector DB, multiplayer, creator marketplace, ads in the core loop, studio API, or a Web/PWA product client without reopening the product gate.

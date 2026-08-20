# Living Plot concept-gap audit

> updated 2026-08-20 · current product decisions

## Purpose
The supplied Living Plot mirror is a product-direction reference, not an implementation specification. The current app keeps the dark cinematic/editorial identity, native tab ownership, canonical Drama/Scene/Branch state, account privacy, and server-owned quota/entitlement boundaries. Features are adopted only when they strengthen the core loop: create → read → choose → consequence → continue → return.

## Adopt now

### Branch depth and novelty
The mirror's strongest product promise is that every choice opens a different fate. This is core business behavior, not decorative copy. The live Scene generator receives a bounded recent-history blocklist (latest 12 Scenes), and the server rejects near-recycled Scene titles, summaries, choice labels, choice intents, and consequences before publication. It also rejects materially similar A/B/C actions, intents, or consequences inside the same Scene. Rejected provider output gets the existing single controlled regeneration attempt with validator feedback. Canonical facts/threads still provide continuity; novelty never overrides established state.

### Living character profile
The static Mina artwork remains the zero-latency fallback. An owner-scoped derived portrait can be generated from the protagonist identity plus the current canonical story development. The story fingerprint includes the current plot/Scene state and, once a branch is committed, that choice, intent, and immediate consequence, so the portrait becomes stale as soon as the canonical branch changes rather than waiting for the next Scene to publish. The latest ready portrait remains visible while stale and can be explicitly regenerated. The previous portrait is supplied as an identity reference so story-aware wardrobe/expression/lighting can evolve without intentionally replacing the character's face. Portraits live privately in R2 and are deleted with account data; portrait failure never blocks the text story.

### Growth loop with a real reward boundary
Every signed-in account receives a random referral code. A referred account may claim one code. The inviter receives 50 persistent cloud-narration bonus credits only when the referred internal account is later verified as Plus through the canonical RevenueCat webhook path. Sharing, clicking, installing, or signing up alone never grants credits. Bonus credits are used only after the normal daily voice allowance is exhausted and use reserve/consume/release idempotency.

### Unlimited branching text
Generated Scenes are unlimited on both Free and Plus so a committed branch can always continue without a daily text-quota dead end. Plus differentiation remains fresh cloud narration at 10/day versus 1/day on Free, plus referral voice rewards. Scene quota policy and provider/account capacity remain separate operational concerns.

### Existing concept parity retained
The current product already covers the mirror's core surfaces in a different visual system: Library/Home, Create, character-led Scene, three choices, consequence, continue, History branch map, narration, Plus, Settings, privacy/export/delete, email OTP, persistent bottom navigation, and resume.

## Defer

### Public Explore / trending catalog
A public story catalog, likes, ratings, and popularity ranking add moderation, public-content ownership, recommendation quality, abuse, and privacy requirements. They do not improve the private branching-loop proof enough to justify that surface before retention data exists.

### Social sign-in
Google/Apple sign-in can reduce auth friction, but email OTP currently works and keeps the account model small. Add social providers only after the core retention and purchase funnel justify the extra identity surface.

### Notifications
Scene-ready/reminder notifications require explicit permission UX, token lifecycle, scheduling/reconciliation, and platform delivery verification. Defer until there is a measured return trigger worth notifying about.

### Install-safe referral links
The current share payload exposes both a plain referral code and the installed-app deep link, so recipients can still enter the code manually. Before a public growth launch, add an HTTPS Android App Link / iOS Universal Link on a Living Plot-owned domain so a recipient without the app installed lands on a real install/landing path instead of a custom scheme that only works after installation. This is deferred until the public domain/store destination exists; it should not block the server-owned reward ledger.

### Dedicated character profile / manual character creator
The current Drama surface already exposes the living portrait and protagonist identity, so a separate profile route is not required for the retention loop yet. A later profile can collect appearances/history once character attachment data justifies another destination. Hair/skin/wardrobe editors are deferred even further because they can conflict with AI-generated identity continuity and would create a second character-authority path. Any future editor should write structured canonical traits, not paint over the portrait as canonical state.

### Rich journey statistics
Current Home quota/streak/choice metrics and History branch map cover the useful minimum. Detailed hours-played, endings unlocked, favorites, and relationship dashboards should wait until the data has a clear retention use.

## Reject as literal claims

- "Infinite stories" / "always unique" — no generative system can truthfully guarantee mathematical uniqueness. Product copy should promise branching consequences and active repetition control instead.
- Rewarding the share tap itself — trivially farmable and disconnected from business value. Reward only verified referred Plus activation.
- Public/generated portrait URLs — character media is owner-scoped private derived media.
- Making portrait or voice generation block Scene publication — text/branch state is canonical; media is optional derived output.

## Decision order
1. Branch consequence quality and novelty.
2. Reliable canonical persistence/resume.
3. Character continuity and optional media.
4. Referral economics tied to verified Plus.
5. Retention evidence.
6. Only then broaden into Explore/social/notifications/customization.

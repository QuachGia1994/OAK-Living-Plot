# Living Plot

Living Plot is a mobile interactive-drama app where each short episode ends with three choices and later episodes reflect the user's committed decisions.

## Repository

- `apps/mobile` — Expo/React Native client.
- `apps/api` — Cloudflare Worker API.
- `docs` — product and architecture source of truth.

## Requirements

- Node.js 24.x.
- npm 11.16.0.

## Setup

```bash
npm install
npm run check
```

Start the mobile app:

```bash
npm --workspace @living-plot/mobile run start
```

Start the local Worker. For protected routes and future story-generation wiring, first copy `apps/api/.dev.vars.example` to an untracked `.dev.vars` file and set the Clerk values plus `GEMINI_API_KEY`. The current Slice 4 AI tests inject `fetch` and do not require a live Gemini key.

```bash
npm --workspace @living-plot/api run dev
```

Apply Phase 1 D1 migrations to the local database:

```bash
npm --workspace @living-plot/api run db:migrate:local
```

Phase 1 scope and architecture are indexed in [`docs/index.md`](docs/index.md).

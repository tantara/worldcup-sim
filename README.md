<div align="center">

# WorldCupSim

**Explore and simulate the 2026 FIFA World Cup.**

Browse every group, venue, fixture, squad, and bracket path, then run unofficial match simulations with a typed tournament dataset and an LLM-friendly simulation kernel.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with Next.js](https://img.shields.io/badge/built%20with-Next.js-black.svg?logo=nextdotjs)](https://nextjs.org)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?logo=typescript&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-11.2.2-F69220.svg?logo=pnpm&logoColor=white)

[Features](#features) | [Repository Layout](#repository-layout) | [Setup](#setup) | [Development](#local-development) | [Packages](#packages) | [Verification](#verification)

![WorldCupSim preview placeholder](https://placehold.co/1200x675/0f172a/f8fafc?text=WorldCupSim+Preview)

</div>

WorldCupSim is a pnpm workspace centered on a Next.js app for the 2026 FIFA World Cup. It combines a browsable tournament command center, a processed WC26 dataset, and a lightweight TypeScript agent kernel for simulation workflows.

## Features

- **Tournament browser** - inspect all 12 groups, 48 teams, 104 fixtures, and 16 host venues.
- **Bracket view** - follow the group-stage and knockout structure from opener to final.
- **Match simulations** - run minute-by-minute unofficial simulations from the web app.
- **Playground** - experiment with simulation inputs and generated match narratives.
- **Voice narration** - play any commentary line aloud with on-device text-to-speech (Supertonic 3 via ONNX Runtime Web, WebGPU with WASM fallback). Ten voices and 31 languages, synthesized entirely in the browser inside a Web Worker - no server inference. Models stream from the Hugging Face CDN on first use.
- **Typed data package** - import teams, squads, fixtures, venues, and qualification campaigns from `@worldcupsim/wc26-data`.
- **Cache-aware agent kernel** - use `@worldcupsim/sim-agent` for provider-neutral streaming agents tuned for stable prompt prefixes.

The main app opens on a fixture and tournament dashboard with links into match, team, and playground views.

![Dashboard placeholder](https://placehold.co/1200x675/e2e8f0/0f172a?text=Dashboard+Screenshot+Placeholder)

Open a match to kick off a simulation and inspect the generated result stream.

![Simulation placeholder](https://placehold.co/1200x675/dbeafe/172554?text=Simulation+Screenshot+Placeholder)

## Repository Layout

```text
client/
  src/
    app/                  Next.js App Router pages and route handlers
    app/_components/      Bracket, simulator, and page-level UI
    components/           Shared UI, navigation, theme, and auth components
    lib/                  Tournament, team, match-engine, and playground logic
    lib/supertonic/       In-browser TTS engine + Web Worker (ONNX Runtime Web)
    server/
      agent/              Match simulation agent orchestration and tools
      api/                tRPC root and routers
      auth/               NextAuth configuration
      db/                 Drizzle schema and database client
      simulations/        Simulation model, archive, and store
  drizzle.config.ts       Drizzle configuration
  start-database.sh       Local Postgres helper

packages/
  sim-agent/              Runtime-agnostic TypeScript agent kernel
  wc26-data/              Typed 2026 World Cup squads, schedule, venues, and qualification data

infra/                    Local infrastructure notes and environment examples
```

## Requirements

- Node.js compatible with the Next.js app and tooling
- pnpm `11.2.2`
- Docker or Podman for the local Postgres helper
- Auth provider credentials for sign-in flows
- Optional DeepSeek-compatible API key for LLM-backed simulation routes

Use the package manager declared in `package.json`.

## Setup

Install dependencies from the repository root:

```bash
pnpm install
```

Create local environment values:

```bash
cd client
cp .env.example .env
```

Start the local database when working with persistence:

```bash
cd client
./start-database.sh
pnpm db:push
```

## Local Development

Run the web app from the repository root:

```bash
pnpm dev
```

The Next.js app runs at `http://localhost:3000`.

Common app commands:

```bash
pnpm --filter worldcupsim lint
pnpm --filter worldcupsim typecheck
pnpm --filter worldcupsim test:unit
pnpm --filter worldcupsim check
```

Database helpers:

```bash
cd client
pnpm db:generate
pnpm db:migrate
pnpm db:push
pnpm db:studio
```

Cloudflare/OpenNext helpers:

```bash
pnpm preview
pnpm deploy
pnpm cf-typegen
```

## Packages

### `@worldcupsim/wc26-data`

Processed 2026 FIFA World Cup data exported as typed TypeScript values and raw JSON.

```ts
import {
  getMatch,
  getTeam,
  getTeamsByGroup,
  matches,
  teams,
  venues,
} from "@worldcupsim/wc26-data";

getTeamsByGroup("A").map((team) => team.country);
getMatch(104);
getTeam("Argentina")?.manager;
```

### `@worldcupsim/sim-agent`

A dependency-free, OpenAI-compatible streaming agent kernel designed for stable prefix caching and append-only histories.

```ts
import {
  Agent,
  ToolRegistry,
  createOpenAICompatProvider,
} from "@worldcupsim/sim-agent";

const provider = createOpenAICompatProvider({
  apiKey: process.env.DEEPSEEK_API_KEY!,
});

const agent = new Agent({
  provider,
  registry: new ToolRegistry([]),
  systemPrompt: "You are a football match simulator.",
});
```

## Verification

Run the repository check before considering changes complete:

```bash
pnpm check
```

For narrower checks:

```bash
pnpm --filter worldcupsim lint
pnpm --filter worldcupsim typecheck
pnpm --filter worldcupsim test:unit
pnpm --filter @worldcupsim/wc26-data typecheck
pnpm --filter @worldcupsim/sim-agent typecheck
git diff --check
```

Do not run the production build unless you specifically need to validate build output.

## Acknowledgements

WorldCupSim builds on and takes inspiration from several projects:

- [Supertonic](https://github.com/supertone-inc/supertonic/) for Supertonic 3 in-browser text-to-speech.
- [DeepSeek-Reasonix](https://github.com/esengine/deepseek-reasonix) for cache-stable agent kernel design inspiration.

## License

WorldCupSim is licensed under the [MIT License](LICENSE).

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout

The application lives in `client/` (a [T3 Stack](https://create.t3.gg/) app). All commands below must be run from `client/`, and the package manager is **pnpm** (`packageManager: pnpm@11.2.2`). The repo root currently holds only `client/`.

Exclude `DeepSeek-Reasonix/` from git.

## Commands

```bash
pnpm dev            # Next.js dev server (Turbo)
pnpm build          # production build  (don't run unless requested)
pnpm preview        # build + start

pnpm check          # next lint + tsc --noEmit  (run this before considering work done)
pnpm typecheck      # tsc --noEmit only
pnpm lint           # eslint
pnpm lint:fix       # eslint --fix
pnpm format:write   # prettier write
pnpm format:check   # prettier check

./start-database.sh # start local Postgres in Docker/Podman (reads DATABASE_URL from .env)
pnpm db:push        # push schema to DB (dev, no migration files)
pnpm db:generate    # generate a SQL migration from schema changes
pnpm db:migrate     # apply migrations
pnpm db:studio      # Drizzle Studio
```

There is no test runner configured. `pnpm check` (lint + typecheck) is the gate. **Don't run `pnpm build` (or `pnpm run build`) unless explicitly requested.**

Env vars are validated at build/runtime by `src/env.js` (Zod). Adding a new env var requires updating both `src/env.js` and `.env.example`. Required: `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `DATABASE_URL`. Set `SKIP_ENV_VALIDATION=1` to bypass validation (e.g. Docker builds).

## Architecture

End-to-end typesafe stack: **Next.js 15 App Router (React 19 RSC) + tRPC v11 + Drizzle (Postgres) + NextAuth v5 + Tailwind v4**. The path alias `~/` maps to `client/src/`.

**tRPC is the API layer — there are no REST route handlers to add.** To add an endpoint:
1. Add/extend a router in `src/server/api/routers/` using `publicProcedure` or `protectedProcedure` from `src/server/api/trpc.ts`.
2. Register it in the `appRouter` in `src/server/api/root.ts`.

Both procedure types run a `timingMiddleware` (logs duration; adds artificial 100–500ms delay in dev to surface waterfalls). `protectedProcedure` additionally guarantees `ctx.session.user` is non-null. The tRPC context (`createTRPCContext`) exposes `db` and `session`.

**Two ways to call the API, depending on component type:**
- **Server Components**: import `api` and `HydrateClient` from `~/trpc/server`. Calls go through a direct server-side caller (no HTTP). Use `void api.x.y.prefetch()` then wrap children in `<HydrateClient>` to stream prefetched data to the client.
- **Client Components** (`"use client"`): import `api` from `~/trpc/react` and use the React Query hooks (`api.x.y.useQuery()`). These hit `/api/trpc/[trpc]` over HTTP with superjson + httpBatchStreamLink.

**Database**: Drizzle ORM, schema in `src/server/db/schema.ts`, client in `src/server/db/index.ts`. All tables use the `pgTableCreator` prefix `worldcupsim_` (multi-project schema pattern) and `drizzle.config.ts` filters on `worldcupsim_*` — always define tables via the exported `createTable` helper so the prefix is applied. `eslint-plugin-drizzle` is enabled to catch unsafe queries.

**Auth**: NextAuth v5 with the Drizzle adapter and Discord provider, configured in `src/server/auth/config.ts`. The session callback injects `user.id`; the `Session.user` type is augmented there. Import `auth` from `~/server/auth` server-side.

The `post` router and `src/app/_components/post.tsx` are scaffold examples — safe to replace as the real World Cup simulation features land.

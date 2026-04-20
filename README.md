# AI Movie & Series Recommender

Monorepo for a personalised movie and TV recommendation platform with a Next.js web app, Fastify API, and (future) Telegram bot.

## Stack

| Layer     | Technology                                           |
| --------- | ---------------------------------------------------- |
| Frontend  | Next.js 14 (App Router) + Tailwind CSS + `next-intl` |
| API       | Fastify + TypeScript                                 |
| Database  | PostgreSQL 16 + Prisma                               |
| Monorepo  | pnpm workspaces + Turborepo                          |
| Languages | English (`en`) + Burmese (`my`)                      |

## Prerequisites

- Node.js 20+ (`nvm use` if you have `.nvmrc`)
- pnpm 10+ (`npm i -g pnpm`)
- PostgreSQL 16 running locally

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env template and fill in values
cp .env.example .env
# Edit .env: set DATABASE_URL, TMDB_API_KEY, etc.

# 3. Copy DB env (Prisma CLI reads this)
cp .env packages/db/.env   # or just set DATABASE_URL there

# 4. Generate Prisma client
pnpm db:generate

# 5. Apply migrations
pnpm db:migrate

# 6. Start development servers
pnpm dev
# → Web:  http://localhost:3000
# → API:  http://localhost:4000
```

## Environment variables

See `.env.example` for the full list. Required at startup:

| Variable       | Description                                                               |
| -------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string                                              |
| `TMDB_API_KEY` | TMDB v3 API key ([get one free](https://www.themoviedb.org/settings/api)) |

Optional (used in later phases):

| Variable                    | Description                            |
| --------------------------- | -------------------------------------- |
| `REDIS_URL`                 | Redis connection (caching, rate-limit) |
| `SESSION_SECRET`            | Phase 2 auth                           |
| `GOOGLE_CLIENT_ID / SECRET` | Phase 2 OAuth                          |

## Useful commands

```bash
pnpm dev                    # start all apps in parallel
pnpm lint                   # lint all packages
pnpm typecheck              # typecheck all packages
pnpm test                   # run all tests

pnpm db:migrate             # run pending migrations (dev)
pnpm db:migrate:status      # check migration state
pnpm db:generate            # regenerate Prisma client after schema change

pnpm tmdb:probe "Inception" # smoke-test TMDB client
```

## Repository layout

```
apps/
  web/          Next.js web app
  bot/          Telegram bot (Phase 2+)
packages/
  api/          Fastify HTTP API
  db/           Prisma schema + migrations
  core/         Domain logic
  tmdb/         TMDB API client
  i18n/         Shared en/my message catalogs
  shared/       Shared types and utilities
  gateway-llm/  AI provider abstraction (Phase 9)
  config-eslint/ Shared ESLint config
infra/
  docker/       Dockerfiles
  compose/      docker-compose files
  caddy/        Caddyfile (TLS)
docs/           Phase implementation plans
```

## API

- `GET /healthz` — liveness probe
- `GET /readyz` — readiness probe (DB check)
- `GET /docs` — Swagger UI
- `GET /api/titles/trending` — trending movies/TV (TMDB, cached)
- `GET /api/titles/:id?media=movie|tv` — title detail

## Locales

Navigate to `/en` or `/my` to switch language. The language toggle in the header switches between the two.

## Contributing

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). The `commit-msg` hook enforces this automatically.

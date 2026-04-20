# Phase 1 — Foundation and Project Setup

## Goal

Establish the technical foundation so that all later phases can move quickly without accumulating structural debt. At the end of Phase 1 a developer can clone the repo, run one command, and see a working homepage, a healthy database connection, a successful TMDB fetch, and a language toggle — locally and on a deployed environment.

## Scope

In scope:

- Repository, environment structure, CI baseline
- Backend skeleton (framework + config + logging)
- Frontend skeleton (mobile-first shell + i18n)
- PostgreSQL database with migrations
- Auth scaffolding (not full flows — those are Phase 2)
- TMDB API client wrapper
- Health-check + readiness endpoints
- Deployment target on a single VPS / staging environment

Out of scope (deferred):

- Full Google OAuth flow (Phase 2)
- Guest-to-permanent upgrade (Phase 2)
- Onboarding wizard (Phase 4)
- Recommendation engine (Phase 5)

## Tech choices

| Layer | Choice | Why |
|-------|--------|-----|
| Backend | Node.js 20 + Fastify (or NestJS) | Strict modular monolith, explicit DDD interfaces between internal packages. Fast and low footprint. |
| Language | TypeScript everywhere | Shared types between web + bot |
| ORM / DB | PostgreSQL 16 + Prisma | Mature migrations, type-safety. Shard-aware design (but not shard-first), prepared for `pgvector` schemas. |
| Frontend | Next.js 14 (App Router) + React + Tailwind CSS | Mobile-first CSS utilities, SSR for SEO, one codebase for web |
| i18n | `next-intl` (web) + message catalogs shared with bot | Same keys for both clients |
| Auth (scaffolding) | `auth.js` / NextAuth baseline | Plug Google later |
| Caching & Queues | Redis | **Required** for deployed environments (cache, rate-limiting, job queue). Local dev may use minimal fallback gracefully. |
| Infra | Single VPS, Docker Compose, Caddy (TLS) | Low cost, easy ops |
| CI | GitHub Actions | Lint, typecheck, test, build on PR |

> Note: While alternative languages are viable, the architectural rules stand: modular monolith first, LLM gateway for AI, transactional core + async worker patterns.

## Repository layout

Must enforce **module/domain boundaries** inside the monorepo via explicit interfaces. Random cross-imports are forbidden.

```
/
├─ apps/
│  ├─ web/              # Next.js WebApp
│  └─ bot/              # Telegram bot (empty shell in Phase 1)
├─ packages/
│  ├─ api/              # Backend HTTP API (Fastify)
│  ├─ db/               # Prisma schema + migrations + seed
│  ├─ core/             # Domain logic (strict boundaries: identity, recommendations, onboarding)
│  ├─ gateway-llm/      # Abstraction layer over AI providers (Phase 9)
│  ├─ tmdb/             # TMDB client wrapper
│  ├─ i18n/             # Shared translation catalogs (en, my)
│  └─ shared/           # Types, zod schemas, utilities
├─ infra/
│  ├─ docker/           # Dockerfiles
│  ├─ compose/          # docker-compose.{dev,staging,prod}.yml
│  └─ caddy/            # Caddyfile
├─ docs/                # This plan
├─ .github/workflows/   # CI
├─ package.json         # pnpm workspace root
├─ pnpm-workspace.yaml
└─ turbo.json           # Turborepo task graph
```

## Work breakdown

### 1.1 Repository bootstrap

- [ ] Initialize git repo (`main` as default, protected on remote)
- [x] `pnpm init` + workspace config
- [x] Add Turborepo
- [x] Add `.editorconfig`, `.gitignore`, `.nvmrc` (node 20)
  - `.gitignore` covers: `node_modules/`, `dist/`, `build/`, `coverage/`, `.turbo/`, `.pnpm-store/`, `apps/*/.next/`, `packages/*/dist/`, `*.log`, `*.out`, `.env`, `.env.*`, home-dir system files, `.claude/`, `.codex/`
  - `.vscode/settings.json` includes `files.watcherExclude` for `node_modules`, `.next`, `.turbo`, `dist`, `coverage` to keep VS Code responsive
- [ ] Add root `README.md` with local-dev instructions

### 1.2 Tooling baseline

- [x] TypeScript strict mode (shared `tsconfig.base.json`)
  - All 7 packages + 2 apps extend `tsconfig.base.json`; `pnpm -r run typecheck` passes clean (0 errors)
  - `packages/config-eslint` has no typecheck script — intentional, pure-JS ESLint config package
  - `root/package.json` adds `pnpm.onlyBuiltDependencies` for `@prisma/client`, `@prisma/engines`, `esbuild`, `prisma` (required for pnpm v10 build-script approval)
- [ ] ESLint + Prettier (shared config in `packages/config-eslint`)
- [ ] Husky + lint-staged for pre-commit
- [ ] Commitlint (conventional commits)

### 1.3 Backend skeleton (`packages/api`)

- [x] Fastify app factory with plugins: CORS, helmet
- [x] Structured logging with `pino` (pretty in dev via `pino-pretty`; level driven by `LOG_LEVEL` config)
- [x] Config loader via `zod` (`apps/api/src/config.ts`): fails fast on missing `DATABASE_URL`; optional Phase-2 placeholders (`SESSION_SECRET`, `GOOGLE_*`) validated but not required
  - `dotenv` loads root `.env` at startup via `dotenv.config({ path: resolve(cwd, '../../.env') })`
  - Config type exported as `Config`; passed into `buildApp(config)` — no `process.env` scattered in app code
- [x] `/health` + `/healthz` — liveness, always 200
- [x] `/readyz` — attempts `db.$queryRaw\`SELECT 1\``; returns `200 { status:'ready' }` or `503 { status:'degraded', checks }` (DB down = degraded, not crash)
- [ ] Request ID middleware; propagate to logs
- [ ] Error handler producing stable JSON error shape
- [ ] Cookie and compress plugins
- [ ] OpenAPI spec published at `/docs`

### 1.4 Database (`packages/db`)

- [x] Prisma init against PostgreSQL
- [x] Initial schema (minimum viable — expand in later phases):
  - `users` — internal user identity (with `merged_into_user_id`, `deleted_at` for merge safety)
  - `auth_identities` — rows per identity provider (google, guest, telegram)
  - `sessions`
- [x] `db` PrismaClient singleton exported from `packages/db/src/index.ts` (globalThis pattern prevents duplicate connections during hot-reload)
  - `@types/node` added to `packages/db` devDeps (required for `process.env`/`globalThis` usage)
  - `@ai-mv/db` moved from devDeps → deps in `apps/api/package.json` (runtime, not build-only)
- [x] Migration workflow scripts added to `packages/db/package.json`:
  - `generate` — regenerate Prisma client after schema changes
  - `migrate` — `prisma migrate dev` (dev: creates + applies, interactive)
  - `migrate:deploy` — `prisma migrate deploy` (CI/prod: applies pending, non-interactive)
  - `migrate:status` — inspect applied vs pending migrations
  - `migrate:reset` — full dev reset (kept in package scope only; no root shortcut, intentionally dangerous)
  - `validate` — schema syntax check (requires DATABASE_URL in env or `packages/db/.env`)
  - `format` — `prisma format` to auto-align schema.prisma columns
  - `studio` — visual DB browser (dev only)
- [x] Root `package.json` shortcuts: `db:generate`, `db:migrate`, `db:migrate:deploy`, `db:migrate:status`
- [x] `packages/db/.env` pattern: Prisma CLI reads DATABASE_URL from `packages/db/.env` (gitignored); copy DATABASE_URL from root `.env.example` when setting up locally
- [ ] Initial migration file — requires a running PostgreSQL instance; run `pnpm db:migrate` once DB is provisioned (Docker Compose in 1.8)
- [ ] `titles_cache` table — cached TMDB metadata (deferred to 1.5/Phase 3)
- [ ] Seed script with one demo user + a handful of TMDB-known titles (deferred, needs migration applied first)
- Note: Prisma client generation (`pnpm db:generate`) must run on fresh checkout before typecheck; `pnpm.onlyBuiltDependencies` in root `package.json` enables this in pnpm v10.

### 1.5 TMDB client (`packages/tmdb`)

- [ ] Typed client covering: `/search/multi`, `/movie/{id}`, `/tv/{id}`, `/discover/movie`, `/discover/tv`, `/trending/*`
- [ ] Retry + exponential backoff on 429/5xx
- [ ] In-memory LRU + Redis cache (Redis optional in Phase 1)
- [ ] Response normalization to internal `Title` shape (decouple from TMDB field names)
- [ ] CLI: `pnpm tmdb:probe "Inception"` for manual smoke-testing

### 1.6 Frontend skeleton (`apps/web`)

- [x] Next.js 14 App Router project
- [x] Tailwind CSS + PostCSS + `autoprefixer` wired up (note: `autoprefixer` must be explicit in `devDependencies` for pnpm hoisting)
- [x] Base layout + home page placeholder (renders app name)
- [x] API base URL config: `apps/web/lib/config.ts` exports `apiBaseUrl` from `NEXT_PUBLIC_API_URL`
  - `next.config.mjs` passes `NEXT_PUBLIC_API_URL` through to client bundle via `env:` field
  - `apps/web/.env.local` (gitignored) sets `NEXT_PUBLIC_API_URL=http://localhost:4000` for local dev
- [ ] Mobile-first breakpoint strategy (`sm` = 640px, design for <640 first)
- [ ] Base layout: top bar with app name + language toggle + (placeholder) avatar
- [ ] Routes: `/` (home placeholder), `/healthz` (proxied to API)
- [ ] `next-intl` wiring with `en` and `my` locales; URL strategy `/[locale]/...`
- [ ] Working home page that fetches `GET /api/titles/trending` (backed by TMDB cache) and renders 6 cards
- [ ] Dark mode safe (not required, but tokens ready)

### 1.7 i18n structure (`packages/i18n`)

- [ ] Catalogs in JSON: `packages/i18n/locales/en.json`, `my.json`
- [ ] Namespaces: `common`, `auth`, `onboarding`, `recommend`, `bot`
- [ ] Shared loader consumed by web + bot
- [ ] Key naming convention: `namespace.screen.element`, lowercase dotted

### 1.8 Deployment target

- [ ] Dockerfile per app (`web`, `api`, `bot` stub)
- [ ] `docker-compose.dev.yml` with Postgres + Redis + web + api + caddy
- [ ] `docker-compose.prod.yml` stripped of dev-only services
- [ ] Caddyfile with automatic HTTPS for staging domain
- [ ] Deploy script: SSH + `docker compose pull && up -d`
- [ ] Document VPS provisioning steps in `infra/README.md`

### 1.9 CI baseline

- [ ] PR workflow: install → lint → typecheck → test → build
- [ ] Cache pnpm store + turbo cache
- [ ] Required status checks on `main`

## Data model (initial)

```sql
-- conceptual; Prisma file is the source of truth

users(
  id uuid primary key,
  created_at timestamptz not null default now(),
  display_name text,
  preferred_locale text not null default 'en', -- 'en' | 'my'
  is_guest boolean not null default true
);

auth_identities(
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,      -- 'google' | 'guest' | 'telegram'
  provider_subject text not null, -- google sub, guest token, telegram user id
  created_at timestamptz not null default now(),
  unique(provider, provider_subject)
);

sessions(
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

titles_cache(
  id bigint primary key,        -- TMDB id
  media_type text not null,     -- 'movie' | 'tv'
  payload jsonb not null,       -- normalized Title JSON
  refreshed_at timestamptz not null default now()
);
```

## API surface (Phase 1)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Liveness |
| GET | `/readyz` | Readiness (DB, Redis, TMDB ping) |
| GET | `/api/titles/trending?media=movie\|tv` | Trending list (cached) |
| GET | `/api/titles/:id` | Title detail (cached) |
| GET | `/api/i18n/:locale` | Bulk-fetch message catalog (optional; SSR can import directly) |

## Environment variables

```
NODE_ENV=development
APP_BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:4000
DATABASE_URL=postgres://...
REDIS_URL=redis://... # optional Phase 1
TMDB_API_KEY=...
TMDB_API_BASE=https://api.themoviedb.org/3
LOG_LEVEL=info
SESSION_SECRET=...      # placeholder, used in Phase 2
GOOGLE_CLIENT_ID=...    # placeholder, used in Phase 2
GOOGLE_CLIENT_SECRET=...# placeholder, used in Phase 2
```

## Acceptance criteria

- `pnpm install && pnpm dev` launches web on `:3000` and api on `:4000`
- `GET /healthz` returns `200 {"status":"ok"}`
- `GET /readyz` returns `200` only when Postgres and TMDB are reachable
- Home page renders at `/en` and `/my` with switched strings
- TMDB probe CLI returns at least one result for a common search
- Prisma migrations apply cleanly from a fresh database
- CI passes on a fresh PR
- Staging deployment reachable via HTTPS

## Dependencies

- Domain or subdomain decision finalized (for Caddy TLS)
- TMDB API key provisioned
- VPS or staging environment available
- Google OAuth credentials requested (not required to block Phase 1, used in Phase 2)

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Over-engineering the monorepo | Start with just the packages listed; add more only when a second consumer exists |
| TMDB rate limits during dev | Cache aggressively; share a dev cache file committed to `.gitignore` |
| i18n added late causes string scattering | Enforce lint rule that forbids raw user-facing strings in JSX |
| Docker complexity slows dev | Keep `pnpm dev` as primary path; Docker only for staging/prod parity |

## Estimated effort

**M (1–2 weeks for a single full-stack dev).** The risk is rework, not line count — invest in structure now.

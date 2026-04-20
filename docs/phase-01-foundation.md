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
- [ ] `pnpm init` + workspace config
- [ ] Add Turborepo
- [ ] Add `.editorconfig`, `.gitignore`, `.nvmrc` (node 20)
- [ ] Add root `README.md` with local-dev instructions

### 1.2 Tooling baseline

- [ ] ESLint + Prettier (shared config in `packages/config-eslint`)
- [ ] TypeScript strict mode (shared `tsconfig.base.json`)
- [ ] Husky + lint-staged for pre-commit
- [ ] Commitlint (conventional commits)

### 1.3 Backend skeleton (`packages/api`)

- [ ] Fastify app factory with plugins: CORS, helmet, cookie, compress
- [ ] Config loader via `zod` (fails fast on missing env vars)
- [ ] Structured logging with `pino` (JSON in prod, pretty in dev)
- [ ] Request ID middleware; propagate to logs
- [ ] Error handler producing stable JSON error shape
- [ ] Health check: `GET /healthz` (liveness) + `GET /readyz` (DB + Redis + TMDB reachable)
- [ ] OpenAPI spec published at `/docs`

### 1.4 Database (`packages/db`)

- [ ] Prisma init against PostgreSQL
- [ ] Initial schema (minimum viable — expand in later phases):
  - `users` — internal user identity
  - `auth_identities` — rows per identity provider (google, guest, telegram)
  - `sessions`
  - `titles_cache` — cached TMDB metadata
  - `i18n_translations` — optional DB-backed strings (seed via files)
- [ ] Migration workflow: `pnpm db:migrate`, `pnpm db:seed`
- [ ] Seed script with one demo user + a handful of TMDB-known titles

### 1.5 TMDB client (`packages/tmdb`)

- [ ] Typed client covering: `/search/multi`, `/movie/{id}`, `/tv/{id}`, `/discover/movie`, `/discover/tv`, `/trending/*`
- [ ] Retry + exponential backoff on 429/5xx
- [ ] In-memory LRU + Redis cache (Redis optional in Phase 1)
- [ ] Response normalization to internal `Title` shape (decouple from TMDB field names)
- [ ] CLI: `pnpm tmdb:probe "Inception"` for manual smoke-testing

### 1.6 Frontend skeleton (`apps/web`)

- [ ] Next.js App Router project
- [ ] Tailwind with mobile-first breakpoint strategy (`sm` = 640px, design for <640 first)
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

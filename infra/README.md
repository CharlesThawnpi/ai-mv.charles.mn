# Infrastructure

## Directory layout

```
infra/
  docker/             Dockerfiles per app
  compose/            docker-compose files
  caddy/              Caddyfile (automatic TLS via Let's Encrypt)
  deploy.sh           SSH deploy script
```

## Local Docker dev

Bring up the full local stack (Postgres + Redis + API + Web):

```bash
cd infra/compose
TMDB_API_KEY=your_key docker compose -f docker-compose.dev.yml up --build
```

Services:

- Web: http://localhost:3000
- API: http://localhost:4000
- Postgres: localhost:5432
- Redis: localhost:6379

> Prefer `pnpm dev` from the repo root for day-to-day development; Docker is for staging/prod parity checks.

## VPS provisioning (Ubuntu 24.04)

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# 2. Clone repo
git clone git@github.com:CharlesThawnpi/ai-mv.charles.mn.git /opt/ai-mv

# 3. Create production .env
cp /opt/ai-mv/.env.example /opt/ai-mv/.env
# Fill in all production secrets

# 4. Deploy
cd /opt/ai-mv
./infra/deploy.sh
```

## Caddyfile

Edit `infra/caddy/Caddyfile` and replace `yourdomain.com` with your actual domain before deploying. Caddy will auto-provision TLS via Let's Encrypt when the domain resolves to the VPS IP.

## Environment secrets (prod)

Store these as environment variables on the VPS — never commit them:

```
DATABASE_URL=postgresql://...
REDIS_URL=redis://:password@redis:6379
TMDB_API_KEY=...
SESSION_SECRET=<64-byte random hex>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
POSTGRES_USER=ai_mv
POSTGRES_PASSWORD=<strong password>
POSTGRES_DB=ai_recommender
REDIS_PASSWORD=<strong password>
API_BASE_URL=https://yourdomain.com
```

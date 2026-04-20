#!/usr/bin/env bash
# Usage: ./infra/deploy.sh [staging|prod]
# Deploys via SSH to the VPS using docker compose.
#
# Requirements on the remote:
#   - Docker + Docker Compose v2
#   - Git repo cloned at /opt/ai-mv
#   - /opt/ai-mv/.env populated with production secrets

set -euo pipefail

REMOTE_HOST="${DEPLOY_HOST:-your-vps-ip}"
REMOTE_USER="${DEPLOY_USER:-root}"
REMOTE_DIR="${DEPLOY_DIR:-/opt/ai-mv}"
COMPOSE_FILE="infra/compose/docker-compose.prod.yml"

echo "Deploying to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"

ssh "${REMOTE_USER}@${REMOTE_HOST}" bash -s <<EOF
  set -euo pipefail
  cd "${REMOTE_DIR}"
  git pull --ff-only origin main
  docker compose -f "${COMPOSE_FILE}" pull
  docker compose -f "${COMPOSE_FILE}" up -d --build --remove-orphans
  docker compose -f "${COMPOSE_FILE}" exec -T api node -e \
    "const {db}=require('./node_modules/@ai-mv/db/src/index'); db.\$queryRaw\`SELECT 1\`.then(()=>{console.log('DB ok');process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})"
  echo "Deploy complete."
EOF

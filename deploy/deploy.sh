#!/usr/bin/env bash
# Deploy the latest main: pull, rebuild changed images, restart. Admin starts first (Flyway), then portal.
#   /opt/fieldops/app/deploy/deploy.sh
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DEPLOY_DIR/.."

git pull --ff-only
cd "$DEPLOY_DIR"
COMPOSE="docker compose -f docker-compose.prod.yml"

$COMPOSE build
$COMPOSE up -d db
$COMPOSE up -d backend
echo "Waiting for the admin backend (migrations)..."
for i in $(seq 1 60); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$($COMPOSE ps -q backend)" 2>/dev/null || true)"
  [ "$status" = "healthy" ] && break
  sleep 5
done
[ "$status" = "healthy" ] || { echo "backend not healthy — check: $COMPOSE logs backend"; exit 1; }
$COMPOSE up -d
docker image prune -f >/dev/null
$COMPOSE ps

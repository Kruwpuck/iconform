#!/usr/bin/env bash
# deploy.sh — build/redeploy/run ICONFORM. One script, all ops.
#
#   ./deploy.sh            → pull latest, rebuild, restart (default redeploy)
#   ./deploy.sh up         → start containers (no rebuild)
#   ./deploy.sh down       → stop containers
#   ./deploy.sh rebuild    → rebuild image + restart (no git pull)
#   ./deploy.sh logs       → tail app logs
#   ./deploy.sh migrate    → apply schema to DB now (prisma db push in container)
#   ./deploy.sh seed       → run seed script in container
#   ./deploy.sh psql       → open psql shell on the DB
#   ./deploy.sh status     → show container status
#
# Schema changes (e.g. 2FA columns) auto-apply at container boot via the app
# CMD (`prisma db push` + seed). A plain redeploy already migrates.
set -euo pipefail
cd "$(dirname "$0")"

DC="docker compose"
APP=iconform-app
DB=iconform-db

wait_healthy() {
  echo "⏳ waiting for app…"
  for i in $(seq 1 60); do
    if $DC ps "$APP" | grep -q "Up"; then echo "✅ app up"; return 0; fi
    sleep 2
  done
  echo "⚠️  app not up after 120s — check: ./deploy.sh logs"; return 1
}

cmd="${1:-redeploy}"
case "$cmd" in
  redeploy)
    echo "🔄 git pull…"; git pull --rebase origin main || echo "⚠️  git pull skipped"
    echo "🏗️  building…"; $DC build "$APP"
    echo "🚀 restarting…"; $DC up -d
    wait_healthy
    ;;
  rebuild)
    $DC build "$APP"; $DC up -d; wait_healthy ;;
  up)
    $DC up -d; wait_healthy ;;
  down)
    $DC down ;;
  logs)
    $DC logs -f --tail=100 "$APP" ;;
  migrate)
    # schema.prisma → DB. --accept-data-loss matches the boot CMD behavior.
    $DC exec "$APP" prisma db push --accept-data-loss ;;
  seed)
    $DC exec "$APP" node prisma/seed.cjs ;;
  psql)
    $DC exec "$DB" psql -U iconform -d iconform ;;
  status)
    $DC ps ;;
  *)
    echo "unknown: $cmd — see header for commands"; exit 1 ;;
esac

#!/usr/bin/env bash
# Pulls the latest code, rebuilds the images one at a time (small VPS) and restarts the stack.
# Usage, on the VPS:  ~/crociata_nera/deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing deploy/.env: copy .env.example to .env and fill it in." >&2
  exit 1
fi

if [ "${1:-}" != "--updated" ]; then
  echo "== Updating the code =="
  git -C .. pull --ff-only
  # Go on with the deploy.sh just pulled: a running script keeps executing its old version (git
  # replaces the file), which may build services the new docker-compose.yml no longer has.
  exec "$PWD/$(basename "$0")" --updated
fi

echo "== Building the images (one at a time to spare memory) =="
for service in backend web; do
  docker compose build "$service"
done

echo "== Checking the Caddy configuration =="
docker compose run --rm --no-deps -T web caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

echo "== Starting =="
docker compose up -d --remove-orphans
docker image prune -f > /dev/null

docker compose ps
echo "== Done: https://$(grep -E '^DOMAIN=' .env | cut -d= -f2) =="

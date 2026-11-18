#!/usr/bin/env bash
# Updates the code, rebuilds the images one at a time (small VPS) and restarts the stack.
# Usage, on the VPS:  ~/crociata_nera/deploy/deploy.sh [<commit sha>]
#   without a sha: the latest origin/master;
#   with a sha (40 hex characters, a commit of origin/master): exactly that commit. GitHub Actions
#   passes the commit it tested as the ssh command: its key is restricted to
#   `command="…/deploy.sh"`, so sshd hands the sha over in SSH_ORIGINAL_COMMAND.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing deploy/.env: copy .env.example to .env and fill it in." >&2
  exit 1
fi

if [ "${1:-}" != "--updated" ]; then
  target="${1:-${SSH_ORIGINAL_COMMAND:-}}"
  if [ -n "$target" ] && ! [[ "$target" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Invalid commit: expected a full 40-character sha." >&2
    exit 1
  fi

  echo "== Updating the code =="
  git -C .. fetch --quiet origin master
  if [ -z "$target" ]; then
    target=$(git -C .. rev-parse origin/master)
  elif ! git -C .. merge-base --is-ancestor "$target" origin/master 2>/dev/null; then
    # Only commits that reached master (tested by CI) are deployed.
    echo "Commit $target is not on origin/master." >&2
    exit 1
  fi
  # Local master follows the deployed commit (also backwards, to redeploy an older one); local
  # changes to tracked files stop the checkout instead of being lost.
  git -C .. checkout --quiet -B master "$target"
  echo "Deploying $(git -C .. log -1 --format='%h %s')"
  # Go on with the deploy.sh just checked out: a running script keeps executing its old version (git
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

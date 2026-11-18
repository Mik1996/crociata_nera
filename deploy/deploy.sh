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

. ./lib.sh
tag=$(new_build_tag)

echo "== Building the images $tag (one at a time to spare memory) =="
for service in "${SERVICES[@]}"; do
  IMAGE_TAG=$tag docker compose build "$service"
done

echo "== Checking the Caddy configuration =="
IMAGE_TAG=$tag docker compose run --rm --no-deps -T web caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

echo "== Starting =="
switch_current "$tag"
if ! { docker compose up -d --remove-orphans && wait_healthy; }; then
  # Automatic rollback to the images that were running before (README "Rollback").
  if [ -z "$(image_id "$(image_of backend):previous")" ]; then
    echo "== Deploy of $tag failed, no previous images to roll back to ==" >&2
    exit 1
  fi
  echo "== Deploy of $tag failed: rolling back to the previous images ==" >&2
  docker compose logs --tail 50 backend >&2 || true
  switch_current previous
  docker compose up -d --remove-orphans
  wait_healthy || echo "The previous images are not healthy either." >&2
  docker compose ps
  exit 1
fi
prune_image_tags

docker compose ps
echo "== Done: $tag on https://$(grep -E '^DOMAIN=' .env | cut -d= -f2) =="

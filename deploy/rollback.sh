#!/usr/bin/env bash
# Puts back the images of an earlier deploy, without rebuilding (see README "Rollback").
# Usage, on the VPS:  ~/crociata_nera/deploy/rollback.sh [previous|<commit>|<build tag>|list]
#   previous (default)  the images that ran before the current ones; run it again to swap back;
#   <commit>            (at least 7 hex characters) the newest kept build of that commit;
#   <build tag>         one of the last builds (20261118093000-0123456789ab);
#   list                the builds kept (the last 3, plus current and previous).
# The code in the clone stays where it is: the next deploy builds master again. To keep the old
# version, revert the faulty commit on master (the push deploys it) or run ./deploy.sh <sha>.
set -euo pipefail
cd "$(dirname "$0")"
. ./lib.sh

target="${1:-previous}"
if [ "$target" = list ]; then
  for service in "${SERVICES[@]}"; do
    docker image ls "$(image_of "$service")" --format '{{.Repository}}:{{.Tag}}  {{.ID}}' | sort
  done
  exit 0
fi
if [[ "$target" =~ ^[0-9a-f]{7,40}$ ]]; then
  commit=$target
  target=$(build_tags "$(image_of backend)" | { grep -E "^[0-9]{14}-${commit:0:12}" || true; } | head -n 1)
  [ -n "$target" ] || { echo "No kept build of commit $commit (see: $0 list)." >&2; exit 1; }
elif [ "$target" != previous ] && ! [[ "$target" =~ $BUILD_TAG_PATTERN ]]; then
  echo "Usage: $0 [previous|<commit>|<build tag>|list]" >&2
  exit 1
fi
for service in "${SERVICES[@]}"; do
  if [ -z "$(image_id "$(image_of "$service"):$target")" ]; then
    echo "No image $(image_of "$service"):$target (see: $0 list)." >&2
    exit 1
  fi
done

echo "== Rolling back to $target =="
switch_current "$target"
docker compose up -d --remove-orphans
wait_healthy
docker compose ps
echo "== Done =="

# shellcheck shell=bash
# Helpers shared by the scripts of deploy/ (sourced, not run). Expects the current directory to
# be deploy/.

# Images of the stack. docker-compose.yml runs <image>:${IMAGE_TAG:-current}: deploy.sh builds
# <image>:<build tag> and moves `current` to it; `previous` is the image that ran before.
# Build tag: UTC time of the deploy + commit (20261118093000-0123456789ab), so that the tags sort
# by deploy (an image's own creation time stays the old one when its build is fully cached).
SERVICES=(backend web)
KEEP_IMAGE_TAGS=3
BUILD_TAG_PATTERN='^[0-9]{14}-[0-9a-f]{12}$'

image_of() { echo "crociata-nera-$1"; }

new_build_tag() { echo "$(date -u +%Y%m%d%H%M%S)-$(git -C .. rev-parse --short=12 HEAD)"; }

# Build tags of <image>, newest first.
build_tags() {
  docker image ls "$1" --format '{{.Tag}}' | { grep -E "$BUILD_TAG_PATTERN" || true; } | sort -r
}

# Image id of <image>:<tag>, empty when missing.
image_id() {
  docker image inspect --format '{{.Id}}' "$1" 2>/dev/null || true
}

# Points <image>:current of every service at <image>:<tag> (a build tag, or `previous`). Keeps the
# image that was current as <image>:previous, so two rollbacks in a row swap them back.
switch_current() {
  local tag=$1 service image old
  for service in "${SERVICES[@]}"; do
    image=$(image_of "$service")
    old=$(image_id "$image:current")
    # First deploy with build tags: the running image is the one compose built as `latest`.
    [ -n "$old" ] || old=$(image_id "$image:latest")
    docker tag "$image:$tag" "$image:current"
    if [ -n "$old" ] && [ "$old" != "$(image_id "$image:current")" ]; then
      docker tag "$old" "$image:previous"
    fi
  done
}

# Waits until every service's container is healthy (docker-compose.yml healthchecks). Fails on an
# unhealthy container or after $1 seconds (default 180).
wait_healthy() {
  local deadline=$((SECONDS + ${1:-180})) service container state pending
  while :; do
    pending=0
    for service in "${SERVICES[@]}"; do
      container=$(docker compose ps -q "$service")
      state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || echo missing)
      case "$state" in
        healthy) ;;
        unhealthy)
          echo "$service is unhealthy." >&2
          return 1
          ;;
        *) pending=1 ;;
      esac
    done
    [ "$pending" = 0 ] && return 0
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "Timed out waiting for the services to become healthy." >&2
      docker compose ps >&2
      return 1
    fi
    sleep 5
  done
}

# Removes the build tags beyond the newest $KEEP_IMAGE_TAGS (`current` and `previous` stay), and
# the `latest` tag of the images built before the build tags, then the untagged images.
prune_image_tags() {
  local service image tag
  for service in "${SERVICES[@]}"; do
    image=$(image_of "$service")
    build_tags "$image" | tail -n +$((KEEP_IMAGE_TAGS + 1)) |
      while read -r tag; do docker image rm "$image:$tag" > /dev/null || true; done
    docker image rm "$image:latest" > /dev/null 2>&1 || true
  done
  docker image prune -f > /dev/null
}

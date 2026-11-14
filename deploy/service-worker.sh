#!/usr/bin/env bash
# Emergency switch of the service worker (offline cache) in the visitors' browsers.
# Usage, on the VPS:  ~/crociata_nera/deploy/service-worker.sh off|on|status
#
#   off     at once, on the running site: the service worker is replaced by Angular's safety worker,
#           which unregisters itself and deletes its caches at the next visit of each browser.
#           Lasts until the next deploy: to keep it off across deploys set SW_DISABLED=1 in .env.
#   on      back to the service worker of the current image (needs SW_DISABLED unset or 0).
#   status  what the site is serving now.
set -euo pipefail
cd "$(dirname "$0")"

domain=$(grep -E '^DOMAIN=' .env | cut -d= -f2)
disabled_in_env=$(grep -E '^SW_DISABLED=' .env | cut -d= -f2 || true)

status() {
  local manifest worker
  manifest=$(curl -s -o /dev/null -w '%{http_code}' "https://$domain/ngsw.json")
  if curl -s "https://$domain/ngsw-worker.js" | grep -q 'NGSW Safety Worker'; then
    worker='safety worker (service worker OFF)'
  else
    worker='Angular service worker (ON)'
  fi
  echo "ngsw-worker.js: $worker"
  echo "ngsw.json: HTTP $manifest"
  echo "SW_DISABLED in .env: ${disabled_in_env:-0}"
}

case "${1:-}" in
  off)
    docker compose exec -T web sh -c 'cp /srv/safety-worker.js /srv/ngsw-worker.js && rm -f /srv/ngsw.json'
    echo "Service worker switched off: each browser drops it at its next visit."
    [ "${disabled_in_env:-0}" = "1" ] || echo "Until the next deploy: set SW_DISABLED=1 in .env to keep it off."
    status
    ;;
  on)
    if [ "${disabled_in_env:-0}" = "1" ]; then
      echo "SW_DISABLED=1 in .env: remove it (or set 0) and run ./deploy.sh to switch the service worker back on." >&2
      exit 1
    fi
    docker compose up -d --force-recreate --no-deps web
    status
    ;;
  status)
    status
    ;;
  *)
    echo "Usage: $0 off|on|status" >&2
    exit 1
    ;;
esac

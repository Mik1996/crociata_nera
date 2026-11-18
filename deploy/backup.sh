#!/usr/bin/env bash
# Backup of the production data, meant to run every night from cron (see README "Backup"):
#   - MongoDB (users, sessions, saved wars, bases) with mongodump, compressed, then checked (gzip
#     integrity, minimum size);
#   - the archive volume of the old proxy (retired: wars.json and monthly history), kept until its
#     wars are imported into MongoDB or discarded. Nothing writes it any more: it is archived again
#     only when its files change.
# Settings, from the environment or deploy/.env (all optional):
#   BACKUP_DIR               where the files go (default /root/backups)
#   KEEP_DAYS                days the database dumps are kept there (default 14)
#   BACKUP_MIN_BYTES         smaller dumps are an error (default 4096; an empty database gives ~150)
#   BACKUP_RCLONE_REMOTE     copy each dump offsite with rclone, e.g. `crociata-crypt:` (an encrypted
#                            crypt remote, see README); empty = no offsite copy
#   BACKUP_RCLONE_KEEP_DAYS  days the dumps are kept on the remote (default 60)
#   BACKUP_HEALTHCHECK_URL   dead-man switch (e.g. healthchecks.io): pinged after a good backup,
#                            <url>/fail after a failed one; empty = no ping
set -euo pipefail
cd "$(dirname "$0")"
. ./lib.sh
umask 077

BACKUP_DIR=$(setting BACKUP_DIR /root/backups)
KEEP_DAYS=$(setting KEEP_DAYS 14)
MIN_BYTES=$(setting BACKUP_MIN_BYTES 4096)
RCLONE_REMOTE=$(setting BACKUP_RCLONE_REMOTE)
RCLONE_KEEP_DAYS=$(setting BACKUP_RCLONE_KEEP_DAYS 60)
HEALTHCHECK_URL=$(setting BACKUP_HEALTHCHECK_URL)

STAMP="$(date -u +%Y%m%d-%H%M%S)"
MONGO_FILE="$BACKUP_DIR/mongo-$STAMP.archive.gz"
PROXY_FILE="$BACKUP_DIR/proxy-data.tar.gz"
PROXY_VOLUME=crociata-nera_proxy_data

log() { echo "[$(date -u +%FT%TZ)] backup: $*"; }
fail() {
  log "ERROR: $*" >&2
  exit 1
}
ping_healthcheck() {
  [ -n "$HEALTHCHECK_URL" ] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null "$HEALTHCHECK_URL$1" || log "healthcheck ping failed"
}

# A failed run must not leave half-written files that look like good backups, and is reported.
finish() {
  local status=$?
  rm -f "$MONGO_FILE.part" "$PROXY_FILE.part"
  if [ "$status" -ne 0 ]; then
    log "FAILED"
    ping_healthcheck /fail
  fi
}
trap finish EXIT

[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] || fail "KEEP_DAYS must be a number of days"
[[ "$RCLONE_KEEP_DAYS" =~ ^[0-9]+$ ]] || fail "BACKUP_RCLONE_KEEP_DAYS must be a number of days"
[[ "$MIN_BYTES" =~ ^[0-9]+$ ]] || fail "BACKUP_MIN_BYTES must be a number"
if [ -n "$RCLONE_REMOTE" ] && ! command -v rclone > /dev/null; then
  fail "BACKUP_RCLONE_REMOTE is set but rclone is not installed"
fi
mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"

# DATABASE_URL reaches mongodump from deploy/.env through the environment of the mongo-tools
# service (docker-compose.yml), never on the command line: it contains the database password.
log "MongoDB"
docker compose run --rm -T mongo-tools \
  sh -c 'mongodump --uri="$DATABASE_URL" --archive --gzip --quiet' > "$MONGO_FILE.part"
gzip -t "$MONGO_FILE.part" || fail "the dump is not a valid gzip file"
size=$(wc -c < "$MONGO_FILE.part")
[ "$size" -ge "$MIN_BYTES" ] || fail "the dump is $size bytes, less than BACKUP_MIN_BYTES ($MIN_BYTES)"
mv "$MONGO_FILE.part" "$MONGO_FILE"
new_files=("$MONGO_FILE")

if ! docker volume inspect "$PROXY_VOLUME" > /dev/null 2>&1; then
  log "proxy archive: no volume $PROXY_VOLUME, skipped"
else
  # Fingerprint of the volume (names, sizes, modification times): re-archived only when it changes.
  fingerprint=$(docker compose run --rm -T archive-tools \
    sh -c 'cd /data && find . -type f -exec stat -c "%n %s %Y" {} + | sort | md5sum')
  if [ -s "$PROXY_FILE" ] && [ "$fingerprint" = "$(cat "$PROXY_FILE.sum" 2>/dev/null)" ]; then
    log "proxy archive: unchanged, already in $PROXY_FILE"
  else
    log "proxy archive"
    docker compose run --rm -T archive-tools tar czf - -C /data . > "$PROXY_FILE.part"
    gzip -t "$PROXY_FILE.part" || fail "the proxy archive is not a valid gzip file"
    mv "$PROXY_FILE.part" "$PROXY_FILE"
    printf '%s\n' "$fingerprint" > "$PROXY_FILE.sum"
    new_files+=("$PROXY_FILE")
  fi
fi

# Only the dated files expire (proxy-data-<stamp> are the nightly copies of older versions); the
# single proxy-data.tar.gz stays.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'mongo-*.archive.gz' -o -name 'proxy-data-*.tar.gz' \) \
  -mtime +"$KEEP_DAYS" -delete

if [ -n "$RCLONE_REMOTE" ]; then
  log "offsite copy to $RCLONE_REMOTE"
  for file in "${new_files[@]}"; do
    rclone copy --no-traverse "$file" "$RCLONE_REMOTE"
  done
  rclone delete "$RCLONE_REMOTE" --include 'mongo-*.archive.gz' --min-age "${RCLONE_KEEP_DAYS}d"
fi

log "done:"
ls -lh "${new_files[@]}"
ping_healthcheck ""

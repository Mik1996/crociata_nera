#!/usr/bin/env bash
# Backup of the production data, meant to run every night from cron (see README "Backup"):
#   - MongoDB (users, sessions, saved wars) with mongodump, compressed;
#   - the proxy archive volume (server/data: wars.json and monthly history).
# Files go to $BACKUP_DIR (default /root/backups) and are kept for $KEEP_DAYS days (default 14).
set -euo pipefail
cd "$(dirname "$0")"

BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
MONGO_FILE="$BACKUP_DIR/mongo-$STAMP.archive.gz"
PROXY_FILE="$BACKUP_DIR/proxy-data-$STAMP.tar.gz"

mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"
# A failed run must not leave half-written files that look like good backups.
trap 'rm -f "$MONGO_FILE.part" "$PROXY_FILE.part"' EXIT

# DATABASE_URL comes from deploy/.env and is passed to the container through the environment,
# never on the command line (it contains the database password).
set -a; . ./.env; set +a

echo "[$(date -u +%FT%TZ)] backup: MongoDB"
docker run --rm -e DATABASE_URL mongo:8 sh -c 'mongodump --uri="$DATABASE_URL" --archive --gzip --quiet' > "$MONGO_FILE.part"
mv "$MONGO_FILE.part" "$MONGO_FILE"

echo "[$(date -u +%FT%TZ)] backup: proxy archive"
docker run --rm -v crociata-nera_proxy_data:/data:ro alpine tar czf - -C /data . > "$PROXY_FILE.part"
mv "$PROXY_FILE.part" "$PROXY_FILE"

find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.gz' -mtime +"$KEEP_DAYS" -delete
echo "[$(date -u +%FT%TZ)] backup done:"
ls -lh "$MONGO_FILE" "$PROXY_FILE"

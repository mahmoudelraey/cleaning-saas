#!/usr/bin/env bash
# Nightly backup: database dump + uploaded files, kept locally for BACKUP_KEEP_DAYS and copied
# off the server with rclone (Oracle Object Storage via its S3-compatible API).
#   cron (UTC 00:00 = 03:00 Riyadh):  0 0 * * * /opt/fieldops/app/deploy/backup.sh >> /opt/fieldops/backups/backup.log 2>&1
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
set -a; . "$DEPLOY_DIR/.env"; set +a

BACKUP_DIR=/opt/fieldops/backups
KEEP="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%d-%H%M)"
mkdir -p "$BACKUP_DIR"

echo "[$(date -u)] backup $STAMP"

# 1. Database (custom format: pg_restore can restore single tables)
docker compose -f "$DEPLOY_DIR/docker-compose.prod.yml" exec -T db \
  pg_dump -U fieldops -d fieldops -Fc > "$BACKUP_DIR/db-$STAMP.dump"

# 2. Uploaded files (visit photos, logos)
docker run --rm -v fieldops_uploads:/data:ro -v "$BACKUP_DIR":/backup alpine \
  tar czf "/backup/uploads-$STAMP.tar.gz" -C /data .

# 3. Off-server copy
if [ -n "${BACKUP_REMOTE:-}" ]; then
  rclone copy "$BACKUP_DIR" "$BACKUP_REMOTE" --include "*-$STAMP.*"
  rclone delete "$BACKUP_REMOTE" --min-age "${KEEP}d"
fi

# 4. Local retention
find "$BACKUP_DIR" -name 'db-*.dump' -mtime +"$KEEP" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime +"$KEEP" -delete

echo "[$(date -u)] done: $(du -h "$BACKUP_DIR/db-$STAMP.dump" | cut -f1) db, $(du -h "$BACKUP_DIR/uploads-$STAMP.tar.gz" | cut -f1) uploads"

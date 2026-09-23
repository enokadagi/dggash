#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups"
LOG_FILE="$PROJECT_DIR/logs/backup-$(date +%Y%m%d-%H%M%S).log"

# Configuration
POSTGRES_USER="${POSTGRES_USER:-dggash}"
POSTGRES_DB="${POSTGRES_DB:-dggash}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BUCKET:-}"
S3_PREFIX="${S3_PREFIX:-dggash/backups}"

mkdir -p "$BACKUP_DIR" "$PROJECT_DIR/logs"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cleanup_old_backups() {
    log "Cleaning up backups older than $BACKUP_RETENTION_DAYS days..."
    find "$BACKUP_DIR" -name "dggash-*.sql.gz" -mtime +"$BACKUP_RETENTION_DAYS" -delete -print | while read -r file; do
        log "Deleted: $file"
    done
}

upload_to_s3() {
    if [ -z "$S3_BUCKET" ]; then
        log "S3_BUCKET not set, skipping S3 upload"
        return 0
    fi

    if ! command -v aws &> /dev/null; then
        log "AWS CLI not installed, skipping S3 upload"
        return 0
    fi

    log "Uploading backup to S3..."
    aws s3 cp "$BACKUP_FILE" "s3://$S3_BUCKET/$S3_PREFIX/$BACKUP_FILENAME" \
        --storage-class STANDARD_IA \
        >> "$LOG_FILE" 2>&1
    log "Uploaded to s3://$S3_BUCKET/$S3_PREFIX/$BACKUP_FILENAME"
}

log "=== Starting database backup ==="

BACKUP_TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILENAME="dggash-$BACKUP_TIMESTAMP.sql.gz"
BACKUP_FILE="$BACKUP_DIR/$BACKUP_FILENAME"

log "Database: $POSTGRES_DB"
log "User: $POSTGRES_USER"
log "Backup file: $BACKUP_FILE"

log "Step 1: Creating database dump..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T postgres \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --format=custom \
    --compress=9 \
    --verbose \
    > "$BACKUP_FILE" 2>> "$LOG_FILE"

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Backup created: $BACKUP_SIZE"

log "Step 2: Verifying backup integrity..."
if gzip -t "$BACKUP_FILE" 2>/dev/null; then
    log "Backup integrity verified"
else
    log "ERROR: Backup file is corrupted!"
    exit 1
fi

log "Step 3: Uploading to S3..."
upload_to_s3

log "Step 4: Cleaning up old backups..."
cleanup_old_backups

log "=== Backup completed successfully ==="
log "Backup file: $BACKUP_FILE"
log "Backup size: $BACKUP_SIZE"

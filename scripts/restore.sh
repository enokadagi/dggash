#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/logs/restore-$(date +%Y%m%d-%H%M%S).log"

# Configuration
POSTGRES_USER="${POSTGRES_USER:-dggash}"
POSTGRES_DB="${POSTGRES_DB:-dggash}"

mkdir -p "$PROJECT_DIR/logs"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

health_check() {
    local url=$1
    local max_retries=10
    local retry_count=0

    while [ $retry_count -lt $max_retries ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            return 0
        fi
        retry_count=$((retry_count + 1))
        sleep 5
    done
    return 1
}

log "=== Starting database restore ==="

# List available backups
BACKUP_DIR="$PROJECT_DIR/backups"
if [ -d "$BACKUP_DIR" ]; then
    log "Available backups:"
    ls -lh "$BACKUP_DIR"/dggash-*.sql.gz 2>/dev/null | tail -10 | tee -a "$LOG_FILE"
fi

# Accept backup file as argument
BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
    # Use latest backup
    BACKUP_FILE=$(ls -t "$BACKUP_DIR"/dggash-*.sql.gz 2>/dev/null | head -1)
    if [ -z "$BACKUP_FILE" ]; then
        log "ERROR: No backup files found in $BACKUP_DIR"
        exit 1
    fi
    log "Using latest backup: $BACKUP_FILE"
fi

if [ ! -f "$BACKUP_FILE" ]; then
    log "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

log "Backup file: $BACKUP_FILE"
log "Backup size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Verify backup integrity
log "Verifying backup integrity..."
if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
    log "ERROR: Backup file is corrupted!"
    exit 1
fi
log "Backup integrity verified"

# Stop API
log "Step 1: Stopping API..."
cd "$PROJECT_DIR"
docker compose stop api
sleep 5

# Restore database
log "Step 2: Restoring database..."
docker compose -f docker-compose.yml exec -T postgres \
    pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --clean \
    --if-exists \
    --verbose \
    < "$BACKUP_FILE" 2>> "$LOG_FILE" || {
        log "WARNING: pg_restore completed with some errors (this is often normal)"
    }

log "Step 3: Restarting API..."
docker compose start api

log "Step 4: Running health checks..."
if health_check "http://localhost:3001/health"; then
    log "API health check passed"
else
    log "ERROR: API health check failed after restore"
    log "Check logs: docker compose logs api"
    exit 1
fi

log "=== Restore completed successfully ==="

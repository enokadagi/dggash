#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/logs/deploy-$(date +%Y%m%d-%H%M%S).log"

mkdir -p "$PROJECT_DIR/logs"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        log "ERROR: Deployment failed with exit code $exit_code"
        rollback
    fi
}

trap cleanup EXIT

rollback() {
    log "Rolling back to previous version..."
    cd "$PROJECT_DIR"
    log "Deployment failed; preserving the checked-out source. Automatic git reset is disabled."
    docker compose -f docker-compose.yml -f docker-compose.prod.yml down >> "$LOG_FILE" 2>&1 || true
    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build >> "$LOG_FILE" 2>&1 || true
    log "Services restarted from the current source. Restore a known release explicitly if required."
}

health_check() {
    local url=$1
    local max_retries=10
    local retry_count=0

    while [ $retry_count -lt $max_retries ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            log "Health check passed: $url"
            return 0
        fi
        retry_count=$((retry_count + 1))
        log "Waiting for $url (attempt $retry_count/$max_retries)..."
        sleep 5
    done

    log "ERROR: Health check failed for $url after $max_retries attempts"
    return 1
}

log "=== Starting deployment ==="

cd "$PROJECT_DIR"

log "Step 1: Updating code..."
if git rev-parse --git-dir > /dev/null 2>&1 && git remote get-url origin > /dev/null 2>&1; then
    git fetch origin main
    git reset --hard origin/main
    git pull origin main >> "$LOG_FILE" 2>&1
    log "Code updated to $(git rev-parse --short HEAD)"
else
    log "Skipping git update (no git remote present; deploying the supplied bundle)."
fi

log "Step 2: Building Docker images..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache >> "$LOG_FILE" 2>&1

log "Step 3: Running database migrations..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d postgres redis
sleep 10
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma >> "$LOG_FILE" 2>&1

log "Step 4: Restarting containers..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml down >> "$LOG_FILE" 2>&1
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

log "Step 5: Running health checks..."
sleep 20
health_check "http://localhost:3001/health"
health_check "http://localhost:3000"

log "Step 6: Cleaning up old images..."
docker image prune -f >> "$LOG_FILE" 2>&1

log "=== Deployment completed successfully ==="
log "API: http://localhost:3001"
log "Web: http://localhost:3000"

#!/bin/sh
# Container entrypoint for the API.
#
# Applies pending Prisma migrations before the server starts. Without this a
# fresh deployment starts against an empty database and every request fails,
# because `prisma migrate deploy` is the only thing that creates the schema.
set -e

SCHEMA="packages/database/prisma/schema.prisma"

if [ -f "$SCHEMA" ]; then
  echo "[entrypoint] Applying database migrations..."
  # `migrate deploy` is idempotent: it only applies migrations that are not yet
  # recorded, so running it on every container start is safe and is what makes
  # rolling restarts and fresh deploys behave identically.
  npx prisma migrate deploy --schema="$SCHEMA"
  echo "[entrypoint] Migrations up to date."
else
  echo "[entrypoint] WARNING: schema not found at $SCHEMA; skipping migrations." >&2
fi

# Optional first-run administrator creation. Only runs when explicitly
# configured, and becomes a no-op once an administrator exists.
if [ -n "$BOOTSTRAP_ADMIN_PASSWORD" ] && [ -f "packages/database/prisma/bootstrap.js" ]; then
  echo "[entrypoint] Running first-run admin bootstrap..."
  node packages/database/prisma/bootstrap.js
fi

exec "$@"

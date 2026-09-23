# Deployment Guide (Hostinger VPS / generic Linux)

This document describes how to run AWIK NET in production. It targets a single
Hostinger VPS running Ubuntu 24.04 + Docker, but applies to any Linux host.

## Architecture

```
                       ┌───────────────────────────────┐
 Internet ──► 80/443 ──►  nginx (reverse proxy)        │
                       │   /        ──► web :3000      │
                       │   /api/v1/ ──► api :3001      │
                       └───────────────┬───────────────┘
                                       │
                        api ─► postgres:5432  (PostgreSQL 16)
                        api ─► redis:6379    (optional, used if enabled)
```

All services run as Docker containers (`docker-compose.yml` + overrides).
Everything is orchestrated by the checked-in `docker-compose.yml`,
`docker-compose.prod.yml`, `nginx/`, and `scripts/`.

## Requirements on the server

- Ubuntu 24.04 (or similar), 2 vCPU / 4 GB RAM minimum
- Docker Engine + Docker Compose v2
- A domain name pointing (A record) to the server's public IP
- Ports open: `22`, `80`, `443`

## 1. Provision the server

```bash
# Log in as a sudo user, then install Docker:
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

## 2. Clone the code

```bash
cd /srv
git clone <your-repo-url> awiknet
cd awiknet
```

## 3. Configure secrets

Copy the reference env file and fill in real values. **Never commit `.env`:**

```bash
cp .env.example .env.production
nano .env.production
```

Required values:

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Point at the container host `postgres`, see `docker-compose.yml` (e.g. `postgresql://postgres:<pass>@postgres:5432/awik_net?schema=public`) |
| `POSTGRES_PASSWORD` | Used by the compose file to create the DB container password |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Generate: `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | 32-char random key: `openssl rand -base64 32` |
| `NODE_ENV` | `production` |
| `APP_URL`, `API_URL`, `ALLOWED_ORIGINS` | Your public domain(s) |
| `NEXT_PUBLIC_API_URL` | Leave `/api/v1` when using the bundled nginx same-origin proxy |
| `WHATSAPP_*` | Meta WhatsApp Business Cloud credentials (see WhatsApp section) |

## 4. Apply migrations and seed

The API applies migrations automatically on boot via
`prisma migrate deploy`. To run them manually first:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
```

Seed only if you want demo data (not for production):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api npm run seed
```

## 5. HTTPS with Let's Encrypt

The bundled nginx needs a real certificate bundle. Two options:

**Option A — certbot on the host (simplest):**

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot certonly --standalone -d yourdomain.com   # stop nginx container first
```

Then place the certs where nginx looks for them:

```bash
sudo mkdir -p /srv/awiknet/certs
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem /srv/awiknet/certs/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem /srv/awiknet/certs/
```

**Option B — certbot inside nginx container:** mount the certs volume and run
certbot from the container.

Update `nginx/conf.d/default.conf`: uncomment the `listen 443 ssl` server block,
set `server_name`, fill certificate paths (`/etc/nginx/certs/fullchain.pem`,
`/etc/nginx/certs/privkey.pem`), and enable the HTTP→HTTPS redirect.

Renewal: `sudo certbot renew --deploy-hook 'docker compose -f /srv/awiknet/docker-compose.yml -f /srv/awiknet/docker-compose.prod.yml restart nginx'`

## 6. Deploy

The checked-in script builds and starts everything, then health-checks each
service (requires curl in the container network; adjust as needed):

```bash
bash scripts/deploy.sh
```

Manual equivalent:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl -s http://localhost/health          # nginx
curl -s http://localhost/api/v1/health   # API (verify with your actual health path)
```

## 7. Verify

- `https://yourdomain.com` → login page loads
- `https://yourdomain.com/api/v1` → Swagger disabled in production (`NODE_ENV=production`)
- Login with a seeded/created admin account

## Backups

Run `scripts/backup.sh` (pg_dump of the running `postgres` container into
`backups/`) and `scripts/restore.sh` to restore a dump. Add a cron entry:

```bash
0 2 * * * /srv/awiknet/scripts/backup.sh >> /var/log/awiknet-backup.log 2>&1
```

Keep dumps off the server for safety (e.g., rclone/aws s3 sync of `backups/`).

## WhatsApp integration

1. Create a Meta WhatsApp Business API app; obtain
   `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`,
   `WHATSAPP_BUSINESS_ACCOUNT_ID`.
2. Set `WHATSAPP_WEBHOOK_VERIFY_TOKEN` to a strong random string.
3. In Meta, configure the webhook callback URL:
   `https://yourdomain.com/api/v1/whatsapp/webhook`
   with the same verify token (the API answers the GET verification and
   validates the HMAC-SHA256 signature on POST payloads using
   `WHATSAPP_APP_SECRET`).
4. Approve templates: `reminder_5d`, `reminder_3d`, `reminder_1d`,
   `reminder_expiry`, `renewal_confirmation`. Template bodies live in the
   `company_settings` table (`whatsapp.reminder_*_template` keys) and must
   contain the same `{{placeholder}}` variables Meta approved.

## Production notes

- API environment validation runs at boot and refuses to start on invalid
  config (see `apps/api/src/common/config/env.validation.ts`).
- Swagger is disabled in production.
- The frontend is built with `NEXT_PUBLIC_API_URL=/api/v1`, so all API traffic
  flows through nginx (same origin) — no CORS surface exposed to browsers.
- CORS allowances come from `ALLOWED_ORIGINS`, not wildcards.
- Database migrations follow the checked-in `packages/database/prisma/migrations`
  directory via `prisma migrate deploy` — never `prisma db push` in production.

## Troubleshooting

- `docker compose logs -f api web nginx` to inspect.
- Database connection refused → confirm `postgres` container is healthy and
  `DATABASE_URL` uses host `postgres` with the container password.
- Web shows build-time API URL → rebuild with `--build` after changing
  `NEXT_PUBLIC_API_URL` (it is read at build time).
- 404 on `/api/v1/*` → verify nginx `location /api/` proxy and that the API
  listens on port 3001 inside the container.
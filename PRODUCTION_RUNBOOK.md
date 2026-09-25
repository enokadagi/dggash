# AWIK NET — Production Deployment Runbook (from release bundle)

This runbook deploys AWIK NET on a fresh Ubuntu 24.04 VPS (e.g. Hostinger)
**without GitHub** — everything ships inside this package. If you later add a
git remote to this directory, `scripts/deploy.sh` will also support `git pull`.

> Read the whole file once before running anything. Every command is copy-paste
> safe; replace the `<...>` placeholders.

---

## 1. Server requirements

- Ubuntu 24.04 (or 22.04), 2 vCPU / 4 GB RAM minimum
- Docker Engine + Docker Compose v2
- Open ports: `22` (SSH), `80`, `443`
- Optional: a domain with an A record pointing at the server IP

Install Docker:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

Confirm: `docker --version && docker compose version`

---

## 2. Upload and extract the bundle

From your laptop (Mac/Linux/WSL) or FileZilla, upload the tarball:

```bash
# from your laptop
scp awiknet-release-v1.0.0.tar.gz user@<SERVER_IP>:~/
```

On the server:

```bash
sudo mkdir -p /srv/awiknet
sudo chown -R $USER:$USER /srv/awiknet
tar -xzf ~/awiknet-release-v1.0.0.tar.gz -C /srv/awiknet
cd /srv/awiknet
```

Verify the layout: `ls` should show `apps/`, `docker-compose*.yml`, `nginx/`,
`scripts/`, `.env.example`, `PRODUCTION_RUNBOOK.md`.

---

## 3. Create the production environment file

```bash
cp .env.example .env.production
```

Edit `.env.production` (`nano .env.production`) and set:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgresql://postgres:<DB_PASSWORD>@postgres:5432/awik_net?schema=public` (host `postgres`, not `localhost`) |
| `POSTGRES_USER` | `postgres` |
| `POSTGRES_PASSWORD` | same value as in `DATABASE_URL` |
| `POSTGRES_DB` | `awik_net` |
| `REDIS_PASSWORD` | a random password |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | 32-char key: `openssl rand -base64 32` (must stay stable) |
| `APP_URL` / `API_URL` / `ALLOWED_ORIGINS` | your public domain or `http://<SERVER_IP>` |
| `NEXT_PUBLIC_API_URL` | `/api/v1` (leave as-is; nginx proxies same-origin) |
| `WHATSAPP_*` | Meta WhatsApp Cloud API creds (optional at first boot — see §7) |

Notes:
- **Never** commit or share `.env.production`.
- Redis is optional in code but referenced by compose; set a password so the
  container comes up.
- Only `.env.production` is required now. `api` and `web` both read it in prod.

---

## 4. Build, migrate, and start

```bash
cd /srv/awiknet
bash scripts/deploy.sh
```

`deploy.sh` (non-git mode) does:
1. (skips git if no remote) 
2. `docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache`
3. starts `postgres` + `redis`, then runs `prisma migrate deploy`
4. starts all services detached
5. health-checks `:3001/health` and `:3000`

Or the manual equivalent (same result):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d postgres redis
sleep 10
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api \
  npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## 5. Create your admin account (one-time bootstrap)

The database starts empty. Seed **once** to create the initial admin +
default WhatsApp reminder templates and settings:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api \
  npx prisma db seed
```

This creates admin login **`+96170000000` / `Admin123!`**.
**Immediately after first login:**
1. Change the password (Profile → Change Password).
2. Create your real staff accounts / plans in the UI.

> Re-running the seed is safe (idempotent upserts) but unnecessary.

---

## 6. Verify and (optionally) add HTTPS

Smoke test on the server:

```bash
curl -s http://localhost/health          # nginx -> "OK"
curl -s http://localhost/api/v1/health   # api (if the route exists)
curl -s http://localhost:3000            # web
```

Open `http://<SERVER_IP>` in a browser. Log in with the seeded admin.

### Add your domain + HTTPS (recommended)

1. In your DNS panel, add **A record** `@` and `www` → server IP, wait for it to
   propagate (`dig yourdomain.com`).
2. Install certbot and issue a certificate:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot certonly --nginx -d yourdomain.com -d www.yourdomain.com
# for a VPS with "hostinger.hosting" suffix certs often just work; otherwise
# use a manual dns-challenge
```

3. Copy certs into the nginx cert volume and update nginx config:

   The bundled `nginx/conf.d/default.conf` has the production HTTPS block
   **commented out as a template**. Replace `server_name _;` with your domain and
   put real paths in `/etc/nginx/certs` (mounted from the `nginx-certs` volume):
   - put your `fullchain.pem` / `privkey.pem` into the volume:
     `docker run --rm -v dggash-nginx-certs:/certs alpine cp /path/to/fullchain.pem /certs/`
   - uncomment the HTTPS server block, then reload nginx:
     `docker compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx nginx -s reload`

---

## 7. Enable WhatsApp (optional)

Set these in `.env.production`, then restart the api:

```bash
WHATSAPP_API_URL="https://graph.facebook.com/v18.0"
WHATSAPP_PHONE_NUMBER_ID="<your_id>"
WHATSAPP_ACCESS_TOKEN="<token>"
WHATSAPP_BUSINESS_ACCOUNT_ID="<acct>"
WHATSAPP_APP_SECRET="<app secret>"
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart api
```

Until creds are set, messages are queued as `pending` and reminders are
scheduled but not delivered.

---

## 8. Backups (do this once production has data)

The scripts run with `pg_dump` on the host + uploads to S3 if configured:

```bash
# on the server, or via cron (see scripts/backup.sh header)
bash scripts/backup.sh
```

Restore:

```bash
bash scripts/restore.sh <dumpfile>
```

---

## 9. Operations / troubleshooting

| Symptom | Fix |
|---|---|
| `docker compose ... up` fails on `.env.production` | file missing → create it (§3) |
| Port 5432 conflicts | prod binds DB to `127.0.0.1` only; check `ss -tlnp` if you run your own postgres |
| Services crash-loop | `docker compose logs api` / `... web` |
| Reset all containers but **keep DB** | `docker compose ... down && docker compose ... up -d` (volumes persist) |
| Full reset (destroys data) | `docker compose ... down -v` — only if you really mean it |

Useful: `docker compose -f docker-compose.yml -f docker-compose.prod.yml ps`
and `docker compose ... exec postgres psql -U postgres -d awik_net`.

---

## 10. Security checklist

- [ ] `.env.production` not committed / backed up separately
- [ ] Default admin password changed after first login
- [ ] PostgreSQL/Redis only listening on `127.0.0.1` (already configured in prod
      compose) — optionally block with `ufw` too
- [ ] Firewall: allow only `22`, `80`, `443` (`sudo ufw allow OpenSSH; ufw allow 80; ufw allow 443`)
- [ ] `JWT_SECRET`, `ENCRYPTION_KEY` are strong random values
- [ ] Scheduled `scripts/backup.sh` if this holds real business data
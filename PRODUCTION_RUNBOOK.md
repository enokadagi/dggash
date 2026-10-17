# AWIK NET â€” Production Deployment Runbook (from release bundle)

This runbook deploys AWIK NET on a fresh Ubuntu 24.04 VPS (e.g. Hostinger)
**without GitHub** â€” everything ships inside this package. If you later add a
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
| `WHATSAPP_*` | Meta WhatsApp Cloud API creds (optional at first boot â€” see Â§7) |

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

This creates admin login **`from the BOOTSTRAP_ADMIN credentials you configured`**.
**Immediately after first login:**
1. Change the password (Profile â†’ Change Password).
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

1. In your DNS panel, add **A record** `@` and `www` â†’ server IP, wait for it to
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

## 7. Enable WhatsApp â€” connect your business number (Meta setup)

Two things drive WhatsApp here: the **Cloud API** (sends via your business
number) and the **webhook** (delivery status marks messages sent/delivered/read).

### How sending works in AWIK NET

1. You send from the app (composer, template button, or an expiry reminder).
2. A message row is created (`pending`), then the API POSTs to
   `https://graph.facebook.com/<version>/<PHONE_NUMBER_ID>/messages`
   with your bearer token.
3. If the API isn't configured yet, rows stay `pending` and the 5â€‘minute
   scheduler retries up to 3 times once creds are added.

> **Important constraint (verified in code):** manual composer messages are
> sent as free-form `type: text`. Meta only allows these **inside the 24â€‘hour
> customer-service window** (after the customer messages you). For proactive
> notifications (expiry reminders, renewal confirmations) outside that window
> you MUST use an **approved message template**. Before going live you will
> need to create & submit 1â€“5 real templates in Meta to match the keys shown
> in **Settings â†’ WhatsApp** (`whatsapp.reminder_5d_template`, etc.), or such
> sends will be rejected with error 131047. (The reminder code currently sends
> plain text; plan to switch reminders to template type in a future iteration
> â€” say the word and I'll wire it up.)

### Step-by-step connection

1. **Create a Meta app** (developer account + business verification, ~3â€“10 days):
   https://developers.facebook.com â†’ *My Apps* â†’ *Create App* â†’ *Business* â†’
   add *WhatsApp* â†’ *Set up*.
2. **Add your WhatsApp Business number** under ProduÃ§Ã£o â†’ WhatsApp â†’
   *API Setup* â€” connect an existing number or get a new one inside Business
   Suite. Keep **the phone number linked and the business account verified**.
3. **Grab credentials** from your app's *API Setup* page:
   - `WHATSAPP_PHONE_NUMBER_ID` (the number's phone number ID)
   - `WHATSAPP_ACCESS_TOKEN` (the temporary or permanent access token;
     for a permanent one create a **System User** in Business Settings with
     `whatsapp_business_messaging` + `whatsapp_business_management` and generate
     a token there)
   - `WHATSAPP_APP_SECRET` (app secret, for webhook signature checks)
   - `WHATSAPP_BUSINESS_ACCOUNT_ID` (optional, for reference)
4. **Set the webhook** in the app: *Webhooks â†’ Configuration* â†’
   Subscribe to `messages`. Callback URL:
   `https://yourdomain.com/api/v1/whatsapp/webhook` (or `http://<SERVER_IP>/api/v1/whatsapp/webhook` for testing â€” Meta requires HTTPS; use a tunnel like `cloudflared`/`ngrok` on the VPS if you only have an IP). Verify token:
   the value of `WHATSAPP_WEBHOOK_VERIFY_TOKEN` you set in `.env.production`.
   Click *Verify and Save*.
5. **Set in `.env.production`**, then restart:

   ```bash
   WHATSAPP_API_URL="https://graph.facebook.com/v18.0"
   WHATSAPP_API_VERSION="v18.0"
   WHATSAPP_PHONE_NUMBER_ID="<phone_number_id>"
   WHATSAPP_ACCESS_TOKEN="<permanent_token>"
   WHATSAPP_BUSINESS_ACCOUNT_ID="<business_account_id>"
   WHATSAPP_APP_SECRET="<app_secret>"
   WHATSAPP_WEBHOOK_VERIFY_TOKEN="choose_a_random_string"
   docker compose -f docker-compose.yml -f docker-compose.prod.yml restart api
   ```

6. **Test**: confirm `GET /api/v1/whatsapp/status` returns `configured: true`,
   then send a message from **WhatsApp Messages â†’ New Message**. The customer's
   phone must be entered with country code (`+961â€¦`). If the customer hasn't
   messaged you in the last 24h, the manual text send is rejected by Meta â€”
   use the WhatsApp app to message your business number once, then re-send.

### Testing tips

- Mirrors of this: our end-to-end run validated the full path (create â†’
  send â†’ `sent` + external id â†’ webhook â†’ `delivered`, plus failure â†’ retry)
  against a mock of the Graph API; nothing in our code needs a real number to
  run. Real delivery to a customer's WhatsApp can only be verified with live
  Meta credentials on the account bound to your number.
- Watch message statuses on the **Messages** page: `pending â†’ sent â†’
  delivered â†’ read`. `failed` messages show the Meta error (e.g. 131047 =
  template missing, 131026 = recipient not on WhatsApp) and the app can retry
  them on demand.
- Until creds are set, everything queues as `pending` â€” nothing breaks.

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
| `docker compose ... up` fails on `.env.production` | file missing â†’ create it (Â§3) |
| Port 5432 conflicts | prod binds DB to `127.0.0.1` only; check `ss -tlnp` if you run your own postgres |
| Services crash-loop | `docker compose logs api` / `... web` |
| Reset all containers but **keep DB** | `docker compose ... down && docker compose ... up -d` (volumes persist) |
| Full reset (destroys data) | `docker compose ... down -v` â€” only if you really mean it |

Useful: `docker compose -f docker-compose.yml -f docker-compose.prod.yml ps`
and `docker compose ... exec postgres psql -U postgres -d awik_net`.

---

## 10. Security checklist

- [ ] `.env.production` not committed / backed up separately
- [ ] Default admin password changed after first login
- [ ] PostgreSQL/Redis only listening on `127.0.0.1` (already configured in prod
      compose) â€” optionally block with `ufw` too
- [ ] Firewall: allow only `22`, `80`, `443` (`sudo ufw allow OpenSSH; ufw allow 80; ufw allow 443`)
- [ ] `JWT_SECRET`, `ENCRYPTION_KEY` are strong random values
- [ ] Scheduled `scripts/backup.sh` if this holds real business data

---

## 11. Hostinger â€” which product, and the exact steps

### Pick the right Hostinger product first

Hostinger sells several products and **only some of them can run AWIK NET**:

| Hostinger product | Can it run AWIK NET? | Why |
|---|---|---|
| **Web Hosting** (shared, hPanel, "Business"/"Premium") | **No** | Shared hosting runs PHP/cPanel apps only. It cannot run a long-lived Node/Nest process, a Next.js server, or a PostgreSQL container. There is no Node app runtime for this stack. |
| **VPS** (KVM 1 / KVM 2, "Business" or "Premium" with root) | **Yes â€” recommended** | Full root over SSH, Docker supported, enough RAM for Postgres + API + Next. This is what this runbook assumes. |
| **Cloud** (managed containers) | Possible, more work | You must run Postgres + Redis + API + web yourself and wire networking. |

> **Rule of thumb:** if the Hostinger plan you are looking at has "hPanel",
> "unlimited websites", "PHP", or no root/SSH access, it will not work. You need
> a plan that gives you a **root shell and Docker**. The smallest workable VPS is
> **2 vCPU / 4 GB RAM**; KVM 1 (1 vCPU/4 GB) will run but feels slow under load.

### Steps for a Hostinger VPS

1. **Order a VPS** with Ubuntu 24.04 and your domain's DNS pointed at it.
2. **Point the domain** at the VPS IP in Hostinger hPanel â†’ *Domains* â†’ *DNS*:
   add A records for `@` and `www` to the VPS IP. Wait for propagation
   (`dig +short yourdomain.com`).
3. **SSH in** using the root/password or key shown in hPanel â†’ *VPS* â†’ *Settings*:

   ```bash
   ssh root@<SERVER_IP>
   ```

4. **Follow sections 1â€“6 of this runbook** from here (Docker install, upload the
   bundle, `.env.production`, `scripts/deploy.sh`, HTTPS with certbot).

### Hostinger-specific notes

- **Ports:** Hostinger's firewall is in hPanel â†’ *Servers* â†’ *VPS* â†’ *Firewall*.
  Open `22`, `80`, `443`. Do **not** open `3000`, `3001`, `5432`, `6379` to the
  internet â€” nginx is the only public entry point, everything else stays on
  `127.0.0.1`/the compose network. If you add a Hostinger firewall rule for
  Docker, note that Docker can bypass `ufw`; the compose file already binds the
  database/Redis to loopback.
- **Swap:** on a 1 vCPU/4 GB VPS, add swap so a Next.js build cannot OOM the box:
  `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`
  (add `/swapfile none swap sw 0 0` to `/etc/fstab` to persist).
- **RAM:** the first `docker compose build` compiles Next.js and is the heaviest
  step. On a small VPS it is normal for it to take several minutes.
- **Email/WhatsApp:** if you want hPanel mail on the same domain, the VPS has no
  mail server â€” use Hostinger Email (IMAP/SMTP) separately, it is not part of
  this app.

### After deploying: the barcode/QR features need HTTPS

The inventory scanner uses the device camera (`BarcodeDetector`) plus a QR
generator. Browsers only grant camera access on a **secure origin**, so:

- **Do not test the camera over plain `http://<SERVER_IP>`.** It will fail even
  though the app works.
- Test the camera only after HTTPS is configured (Â§6) and you are on
  `https://yourdomain.com`, or on `http://localhost` during local dev.
- Without camera access the app still accepts **USB barcode scanners** (they type
  the code and send Enter â€” no HTTPS needed) and manual code entry/QR download.
- The QR code printed on a product label carries the product identifier, so
  scanning that label from another device resolves the same product by its
  barcode/SKU/ID.

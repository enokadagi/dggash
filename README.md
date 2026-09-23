# AWIK NET — ISP Management Platform

Full-stack management platform for an Internet Service Provider (ISP): customer
management, subscription lifecycle with expiry tracking, point-of-sale and
barcode-driven inventory, financial reports, and WhatsApp expiry notifications.

Formerly branded "DGGASH"; all legacy UI/modules have been removed. The app now
only surfaces real, verified functionality.

---

## Stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | Next.js 16 (App Router), React 18, TanStack Query, Tailwind CSS, shadcn-style components, lucide-react |
| Backend   | NestJS 11, Prisma ORM 6 |
| Database  | PostgreSQL 16 |
| Auth      | JWT access + refresh tokens, global guards, throttling, account lockout |
| WhatsApp  | Meta WhatsApp Business Cloud API (webhook signature verified) |
| Realtime  | Socket.IO, metrics dashboard |
| DevOps    | npm workspaces monorepo, docker-compose dev/prod, nginx reverse proxy config |

## Repository layout

```
apps/
  api/         NestJS API (REST under /api/v1, Socket.IO gateway, schedulers)
  web/         Next.js web app
packages/
  database/    Prisma schema, migrations, seed script
docs/          Deployment docs and archived legacy reports
nginx/         Production reverse-proxy configs
scripts/       Helper scripts
load-test/     k6 load-testing scripts
```

## Getting started (development)

Requirements: Node.js 20+, PostgreSQL 16.

```bash
# 1. Install dependencies (workspaces)
npm install

# 2. Configure environment (see .env.example for all variables)
copy .env.example .env    # set DATABASE_URL, JWT secrets, etc.

# 3. Apply Prisma migrations to your database
npm run db:migrate

# 4. Seed development data (admin user, plans, settings, demo data)
npm run db:seed

# 5. Run API (:3001) and web (:3000)
npm run dev
```

Seeded demo accounts:

- Admin: `+96170000000` / `Admin123!`
- Super admin: `+1000000000` / `SuperAdmin123!`

> The API validates required env vars on boot (`apps/api/src/common/config/env.validation.ts`)
> and exits if config is invalid. Never commit `.env` — only `.env.example`.

## Scripts (root)

| Command           | Description |
|-------------------|-------------|
| `npm run dev`     | Build API + run API and web dev servers |
| `npm run build`   | Build database package, API, and web |
| `npm run lint`    | Lint all workspaces |
| `npm run test`    | Run tests across workspaces |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:migrate`  | Apply migrations (dev) |
| `npm run db:deploy`   | Apply migrations (production, `prisma migrate deploy`) |
| `npm run db:seed`     | Seed development data |
| `npm run db:studio`   | Open Prisma Studio |

Workspace scripts: `npm run typecheck` and `npm run build` inside
`apps/web` / `apps/api`; `npm test` inside `apps/api`.

## API surface

Active modules (all under `/api/v1`):

`auth`, `customers`, `plans`, `subscriptions`, `inventory` (products, categories,
movements), `sales`, `reports`, `dashboard`, `whatsapp` (templates, messages,
reminders, webhooks), `settings`, `users`, `audit`, `backups`, `metrics`.

Swagger UI is enabled on the API root in development.

## What is verified

The following were exercised end-to-end against the running API + database
(browser and API-level E2E), not merely code-reviewed:

- POS barcode lookup (by barcode / SKU), cart, payment, sale completion, stock decrement
- Oversell rejection (`Insufficient stock`) with stock unchanged when blocked
- Stock movements (`PURCHASE`, `SALE`, `RETURN`, `DAMAGED`, `LOST`, `ADJUSTMENT`, `CORRECTION` with signed quantities)
- Subscription creation, renewal (atomic, updates expiry, clears expiry reminders, records renewal), status refresh cron
- Expiry-reminder generation (5d/3d/1d/expiry-day, Asia/Beirut dates), WhatsApp template selection, duplicate-guard preventing re-sends
- Dashboard KPIs, revenue/customer/inventory reports
- Legacy "DGGASH" pages, hooks, and dead-endpoint references removed; customer detail, settings, and reported pages rewritten on real endpoints

## Security posture

- Global JWT auth guard with role-based access; WHITELISTED public routes only (`login`, `refresh`, `demo`, WhatsApp webhook)
- bcrypt (12 rounds) password hashing; JWT secrets from env
- Account lockout after repeated failed logins; request throttling
- Global validation pipe (whitelist + forbid non-whitelisted), input sanitization
- Helmet security headers, CORS restricted to `ALLOWED_ORIGINS`
- WhatsApp webhook requires HMAC-SHA256 signature (constant-time compare)
- Swagger disabled in production; env validation on boot

## Deployment

See `docs/DEPLOYMENT.md` for Hostinger-compatible production deployment
instructions (PostgreSQL, API + web under a reverse proxy, HTTPS via Let's Encrypt,
WhatsApp webhook wiring, and backup/restore).

## Feedback

Report issues at the project's git repository when initialized.
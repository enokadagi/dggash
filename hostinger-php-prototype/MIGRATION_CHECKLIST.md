# AWIK NET PHP/MariaDB feature migration checklist

**Status updated 2026-10-14:** unchecked boxes below mean full original NestJS parity/acceptance is still open; they do not necessarily mean that no PHP handler exists. PHP routes now exist for auth/users/permissions, plans/settings, customers, subscriptions, inventory, sales/refunds/cancellations, dashboard, JSON/CSV reports, and an ADMIN-only backup API (list/create/integrity/download/cleanup) with CLI-only isolated restore. Selected workflows were tested on isolated MariaDB 10.5. See `MIGRATION_STATUS.md` for exact evidence and feature gaps.

## 1. Authentication and user identity

- [ ] Login with `identifier` (phone or email) and password
- [ ] JWT access token and refresh token generation with same payload semantics as NestJS
- [ ] Protected route enforcement using bearer token validation
- [ ] Logout and server-side token invalidation
- [ ] Profile retrieval and profile update validation
- [ ] Password change with current-password enforcement and re-auth token invalidation
- [ ] Role gating for ADMIN/STAFF access
- [ ] account status checks (ACTIVE, INACTIVE, SUSPENDED)

## 2. Frontend pages and expected API contracts

- [ ] Login page: `/api/v1/auth/login`
- [ ] Demo login page: `/api/v1/auth/demo` (if enabled in non-production)
- [ ] Dashboard: `/api/v1/dashboard/kpis`, `/api/v1/sales`, `/api/v1/products`, `/api/v1/inventory-summary`
- [ ] Customers: `/api/v1/customers` and `/api/v1/customers/:id`
- [ ] Plans and subscriptions: `/api/v1/plans`, `/api/v1/plans/active`, `/api/v1/subscriptions`
- [ ] Inventory: `/api/v1/products`, `/api/v1/inventory/categories`, `/api/v1/products/:id/restock`
- [ ] Sales and POS: `/api/v1/sales`, `/api/v1/sales/:id/cancel`, `/api/v1/sales/:id/refund`
- [ ] Reports: `/api/v1/reports/revenue`, `/api/v1/reports/customers`, `/api/v1/reports/inventory`
- [ ] Settings: `/api/v1/settings`, `/api/v1/backups`, `/api/v1/inventory/categories`
- [ ] WhatsApp: `/api/v1/whatsapp/messages`, `/api/v1/whatsapp/templates`, `/api/v1/whatsapp/reminders`

## 3. Database models and migration scope

- [ ] `users` table with unique phone/email, role, status, last login metadata
- [ ] `customers` table with phone, address, WhatsApp number, subscription relations
- [ ] `plans` table with price, duration, speed, active state
- [ ] `subscriptions` table with expiry, payment status, notes, subscription lifecycle
- [ ] `inventory_categories` and `products` tables with stock and pricing
- [ ] `stock_movements` table for purchases, sales, adjustments, damages
- [ ] `whatsapp_reminders`, `whatsapp_messages`, `customer_reminders` support
- [ ] `sales`, `sale_items`, and payment state for POS transactions
- [ ] `audit_logs` for auth, settings changes, and security events
- [ ] indexes on phone, email, status, expiry date, and active products/plans

## 4. Background jobs and scheduled work

- [ ] WhatsApp reminder scheduler for expiry warnings
- [ ] subscription renewal reminders and expiry notifications
- [ ] stale stock or low stock alerts
- [ ] backup generation/retention cleanup
- [ ] audit log pruning and maintenance tasks

## 5. Reports and analytics

- [ ] revenue by date and plan
- [ ] customer churn and active subscription summary
- [ ] inventory stock history and low-stock counts
- [ ] payment status and renewal pipeline reports

## 6. External integrations

- [ ] WhatsApp Business API / WhatsApp Cloud API integration
- [ ] SMTP or mail provider for password reset or notifications
- [ ] backup storage target for Hostinger-compatible file or cloud archival
- [ ] optional barcode/QR print and POS hardware integration
- [x] DB-backed account/IP login throttling (5 failures/15 minutes per account; 10 failures/5 minutes per IP), validated against disposable MariaDB over HTTP
- [ ] request logging and retention cleanup for public auth endpoints

## 7. Security and deployment requirements

- [ ] PDO prepared statements only
- [ ] password hashing via bcrypt/password_hash()
- [ ] JWT secret isolation from source control
- [ ] CORS and domain allow-list configuration
- [ ] session-compatible same-domain API routing under `/api/v1`
- [ ] environment-specific configuration for production vs local development

## 8. Local migration execution status

- [x] auth/token/lockout, first-admin provisioning, and selected PHP business slices exercised on isolated MariaDB 10.5.29
- [x] clean-install chain tested in auth-core, login-attempts, full-application order; empty database only (no migration ledger/drift validator)
- [x] 16 standalone PHP contract/validation tests passed; all 27 PHP files (10 runtime + 17 tests) linted
- [x] ADMIN-only backup API (list/create/integrity/download/cleanup) with encrypted gzip snapshots and CLI-only isolated restore
- [ ] complete route-role/failure/race coverage and full NestJS parity
- [ ] WhatsApp, incremental/scheduled backups and HTTP restore, scheduled jobs, mail/recovery, uploads, PDF/XLSX and data import
- [ ] authoritative Hostinger secure environment-variable injection and supported first-admin CLI execution
- [ ] isolated Hostinger staging acceptance for PHP/FPM, MariaDB grants/version, LiteSpeed/open_basedir, cron/TLS/browser flows
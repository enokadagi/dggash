# AWIK NET — Release Finalization Report

**Date:** 2026-10-15
**Branch:** `hostinger-php-migration`
**Verdict:** **NOT READY for Hostinger production**
**Scope of this report:** local source, test, and packaging evidence only. No Hostinger/prod system, database, DNS, or hosting setting was accessed or changed. Nothing was committed, deployed, or uploaded.

This document is the single consolidated record of the finalization pass. It contains all ten requested deliverables:

1. [Current-state report](#1-current-state-report)
2. [Prioritized launch-blocker list](#2-prioritized-launch-blocker-list)
3. [Feature acceptance matrix](#3-feature-acceptance-matrix)
4. [Hostinger compatibility matrix](#4-hostinger-compatibility-matrix)
5. [Cloudflare removed / retained list](#5-cloudflare-removed--retained-list)
6. [Files changed](#6-files-changed)
7. [Tests run and results](#7-tests-run-and-results)
8. [Tests not run and why](#8-tests-not-run-and-why)
9. [Package path, entry count, checksum](#9-package-path-entry-count-checksum)
10. [Deployment and rollback runbook](#10-deployment-and-rollback-runbook)

---

## 1. Current-state report

The product being released is the **Hostinger Premium shared-hosting** target: a statically exported Next.js frontend (`public_html/`) plus a PHP 8.3 API (`api/`) on MariaDB 10.5, driven by `.htaccess` rewrites under LiteSpeed, with no external backend and no Cloudflare dependency.

**What is real and locally verified**

- PHP API with working handlers for authentication/token lifecycle, login lockout, users/permissions, plans, company settings, customers, subscriptions (create/update/renew/suspend/activate/cancel), inventory (categories/products/movements), sales (refund/cancel), dashboard, and report downloads in CSV/PDF/XLSX.
- PHP-only password recovery (`POST /api/v1/auth/forgot-password`, `/auth/reset-password`): 256-bit tokens, SHA-256-at-rest, 30-minute single-use expiry, generic responses, hashed per-email/IP throttling, session revocation on reset.
- ADMIN-only backup API (list/create/integrity/download/cleanup): AES-256-GCM + HMAC-SHA256, gzip JSON snapshots, storage refused under the document root, CLI-only isolated restore.
- Bounded CLI auth-state cleanup job (advisory-lock, single transaction, batch limit 5000).
- Clean-install MariaDB chain of **18 tables** across **four ordered migrations**.
- Frontend contract verified: `apps/web/src/lib/api.ts` unwraps `raw.data`; PHP list responses return `{success, data:{data:[...], total, page, limit}}` — consistent.
- **WhatsApp PHP endpoints implemented** for every path the shipped screens call: `GET /whatsapp/status`, `POST /whatsapp/test-connection` (ADMIN), `POST /whatsapp/send`, `GET /whatsapp/messages`, `GET /whatsapp/templates`, `POST /whatsapp/templates` (ADMIN), `GET /whatsapp/reminders`, `GET /whatsapp/reminders/due`, `POST /whatsapp/reminders/trigger`. Auth is enforced (`ADMIN`/`STAFF`), input is validated, provider config is resolved from settings with env fallback, and when Meta credentials are absent the code **queues messages as `pending`** rather than faking a send. Covered by `WhatsAppApiContractTest`.

**What is NOT real / missing**

- WhatsApp **webhook** (`GET`/`POST /whatsapp/webhook`) is intentionally **not** implemented: correct Meta signature verification needs the raw request bytes, which the HTTP entrypoint does not expose. Outbound provider calls (real Meta delivery, delivery-status callbacks, provider-driven `sent`/`failed` transitions) remain **unconfigured/unverified** — no credentials were exercised.
- No audit-listing API, no financial-overview endpoint, no full NestJS authorization/audit parity.
- No email-verification flow; Hostinger mail transport and recipient delivery unverified.
- No subscription status refresh, no scheduled WhatsApp/backup jobs, no backup cron; only the cleanup CLI exists (unscheduled).
- No file uploads.
- No PostgreSQL→MariaDB data-migration path.

**Evidence freshness (this pass):** PHP lint 28/28 clean (27 prototype + 1 bridge); standalone suite 17/17 pass (incl. the new `WhatsAppApiContractTest`); build-script parse OK; a new candidate archive was built and verified (§9). The MariaDB integration harness was **not** re-run (requires explicit approval) — its latest corroborated run is the isolated `10.5.29` run recorded in the source docs.

**Key risk:** the app is a partial port. It runs, but it is not feature-complete, and none of the Hostinger-side gates (env injection, extensions, LiteSpeed rewrites, `open_basedir`, grants, cron, mail) have any account-specific evidence.

---

## 2. Prioritized launch-blocker list

| # | Priority | Blocker | Evidence | Owner action |
|---|---|---|---|---|
| 1 | **P0** | WhatsApp screens previously hit **guaranteed 404s** with no PHP endpoints | `sidebar.tsx:115-118`; `whatsapp/*/page.tsx`; routes previously absent from `private/bootstrap.php` | **RESOLVED locally** — all nine frontend-called `/whatsapp/*` routes implemented + tested this pass; Meta provider calls and webhook remain unconfigured (see note) |
| 2 | **P0** | Hostinger **secure PHP-FPM env injection** unverified — runtime reads DSN/JWT secrets via `getenv()` | `private/config.php`; `manifest.json:deploymentBlockers` | Verify a supported secure mechanism; never place secrets in `public_html/` |
| 3 | **P0** | **Sibling `open_basedir` include** for the API bridge unverified | bridge `scripts/hostinger-api-bridge.php`; `.htaccess:12`; builder README | Verify Hostinger permits `<pkg>/api/public/index.php` include from `public_html/api/index.php` |
| 4 | **P0** | **LiteSpeed rewrite** behavior for both `.htaccess` files unverified | `apps/web/public/.htaccess`; `hostinger-php-prototype/.htaccess` | Verify `/api/v1` bridge + SPA fallback + HTTPS force under LiteSpeed |
| 5 | **P0** | **MariaDB 10.5 build/grants/SQL mode/collation/timezone** unverified on account | local harness is isolated 10.5.29 only | Verify in hPanel / staging; confirm `utf8mb4_unicode_ci` semantics and CHECK support |
| 6 | **P1** | **CLI execution path** (first-admin provisioning, cleanup cron, CLI restore) unverified; shell disabled on plan | `provision-admin.php`, `cron/cleanup-auth-state.php`, `restore-backup.php` | Confirm a supported CLI/cron execution path and env injection |
| 7 | **P1** | **PHP extensions** (`openssl`, `zlib`, `zip`, `pdo_mysql`, `mbstring`) unverified for the account SAPI/FPM | `manifest.json:deploymentBlockers` | Verify each extension in hPanel |
| 8 | **P1** | **Email delivery** for password recovery unverified | `manifest.json`; builder README | Verify `php-mail` transport + authenticated sender |
| 9 | **P1** | **VPS `deploy.yml` contradicts Hostinger-only architecture** (SSH + Docker to VPS on push to `main`) | `.github/workflows/deploy.yml` | Decide: remove/disable, or leave inert on a non-`main` branch |
| 10 | **P2** | **Backup restore** has no HTTP path and no cron; large-export memory behavior untested | builder README; `manifest.json` | Accept as documented limitation or scope follow-up |
| 11 | **P2** | **Repo hygiene:** many untracked scratch/debug files at repo root (not packaged) | `git status` (e.g. `check*.php`, `dbg*.py`, `patch*.php`, `*.txt`) | Clean up when permitted (not deleted in this pass) |
| 12 | **P2** | **`deployment/*` artifacts are frozen and unversioned**; multiple timestamped candidates coexist | `deployment/` | Decide the canonical release artifact (see §9) |

**P0 owner decision — WhatsApp:** resolved by **implementing the missing PHP endpoints** (new WhatsApp block in `private/bootstrap.php` + `WhatsAppApiContractTest`). The nine frontend-called routes now return the expected envelopes, enforce `ADMIN`/`STAFF` auth, validate input, and **fail safe**: with no Meta credentials the send/reminder paths queue `pending` instead of reporting a fake success. Still **NOT READY** for WhatsApp because (a) **no real Meta credentials were exercised**, so provider delivery and delivery-status transitions are unverified, and (b) the **webhook is deliberately not implemented** (raw-body signature verification is unavailable through the entrypoint). If credentials/scope cannot be provided, the fallback remains to hide the WhatsApp navigation group.

---

## 3. Feature acceptance matrix

Legend: **Implemented+tested** = PHP handler exists and has local test evidence; **Partial** = handler exists but coverage/parity incomplete; **Missing** = no endpoint.

| Area | Frontend route(s) | PHP endpoint(s) | State | Notes |
|---|---|---|---|---|
| Login / refresh / logout | `/login` | `/auth/login`, `/auth/refresh`, `/auth/logout` | Implemented+tested | lockout + token lifecycle tested |
| Profile | dashboard | `/auth/profile` GET/PATCH | Implemented+tested | |
| Change password | settings | `/auth/change-password` | Implemented+tested | |
| Password recovery | `/forgot-password`, `/reset-password` | `/auth/forgot-password`, `/auth/reset-password` | Implemented+tested | mail delivery unverified |
| Users & permissions | settings/users | `/users` | Partial | full role matrix not exhaustive |
| Plans | settings/plans | `/plans` | Implemented+tested | duplicate race is app-side |
| Company settings | `/settings/company` | `/settings` GET/PATCH | Implemented+tested | |
| Customers | `/customers`, `/customers/new`, `/customers/view` | `/customers` (+search,+id) | Implemented+tested | |
| Subscriptions | dashboard | `/subscriptions` (+renew/suspend/activate/cancel) | Implemented+tested | no expiry refresh job |
| Inventory | `/inventory`, `/inventory/movements` | `/inventory`, `/inventory-lifecycle`, `/products`, `/movements` | Implemented+tested | |
| Sales | `/sales`, `/sales/pos`, `/sales/detail`, `/sales/invoice` | `/sales` (+refund,+cancel) | Implemented+tested | concurrency locked |
| Dashboard | `/dashboard` | `/dashboard` (+kpis/revenue-chart/recent-activity/alerts) | Partial | no MariaDB end-to-end result-set check |
| Reports | dashboard export | `/reports` | Partial | CSV/PDF/XLSX tested; JSON projection parity incomplete |
| Backups | none | `/backups` (ADMIN) | Implemented+tested | restore CLI-only |
| **WhatsApp — Connection & Setup** | `/whatsapp/connect` | `/whatsapp/status`, `/whatsapp/test-connection` (ADMIN), `/whatsapp/reminders/due` | Implemented+tested | provider calls unverified; webhook absent |
| **WhatsApp — Templates** | `/whatsapp/templates` | `/whatsapp/templates` GET, POST (ADMIN) | Implemented+tested | backed by `awik_company_settings` (`whatsapp.*`) |
| **WhatsApp — Messages** | `/whatsapp/messages`, `/whatsapp` | `/whatsapp/messages` GET, `/whatsapp/send` POST | Implemented+tested | queues `pending` when Meta unconfigured |
| **WhatsApp — Expiry Notifications** | `/whatsapp/reminders` | `/whatsapp/reminders` GET, `/whatsapp/reminders/trigger` POST | Implemented+tested | sends `pending` when Meta unconfigured |
| Audit listing | — | **none** | Missing | no endpoint |
| Financial overview | — | **none** | Missing | no endpoint |
| File uploads | — | **none** | Missing | no endpoint |
| Demo login (Nest) | — | **none** | Missing | intentionally not ported |

---

## 4. Hostinger compatibility matrix

All Hostinger rows are **UNVERIFIED** unless stated; no account was contacted.

| Dimension | Target / requirement | Local status | Hostinger status |
|---|---|---|---|
| PHP version | 8.3 | 8.3.13 CLI verified locally | **UNVERIFIED** (account reports 8.3.35) |
| PHP extensions | `pdo_mysql`, `mbstring`, `json`, `openssl`, `zlib`, `zip` | present locally (sqlite via `-d`) | **UNVERIFIED** per SAPI/FPM |
| MariaDB | 10.5 | clean chain applied on isolated **10.5.29** | **UNVERIFIED** patch/build/collation/SQL mode/timezone |
| Schema | 18 tables, 4 ordered migrations | applied locally, CHECKs verified | **UNVERIFIED** on account |
| Rewrites | `/api/v1` bridge, SPA fallback, HTTPS force | `.htaccess` present in package | **UNVERIFIED** under LiteSpeed |
| `open_basedir` | sibling include of `api/public/index.php` | bridge logic verified by construction | **UNVERIFIED** |
| Env injection | PHP-FPM secure env for DSN/JWT/backup key | reads via `getenv()` | **UNVERIFIED** |
| CLI / cron | first-admin, cleanup, CLI restore; hourly cadence | scripts exist, DB-tested | **UNVERIFIED** (plan shell disabled) |
| Mail | native `php-mail` for recovery | disabled unless configured | **UNVERIFIED** delivery |
| TLS / headers | HSTS + CSP + security headers via `.htaccess` | present in package | **UNVERIFIED** |
| Document root | `public_html` with `api/` outside web root | package layout enforced by builder | **UNVERIFIED** placement |
| Extensions for XLSX | PHP ZIP | verified locally | **UNVERIFIED** |
| Backup key | `AWIK_BACKUP_ENCRYPTION_KEY` (64 hex or passphrase) | required by code | **UNVERIFIED** injection |

---

## 5. Cloudflare removed / retained list

**Finding: there are no functional Cloudflare dependencies.** No `wrangler.toml`, `_headers`, `_redirects`, or other Cloudflare configuration files exist; no `CLOUDFLARE_*`/`CF_*` environment keys exist; the packaged `.htaccess` files use Apache/LiteSpeed modules (`mod_rewrite`, `mod_headers`, `mod_deflate`) — not Cloudflare constructs.

**Removed:** none — nothing Cloudflare-specific existed to remove.

**Retained (documentation mentions only, non-functional; left intact in historical/legacy docs):**

| File:line | Nature |
|---|---|
| `docs/legacy/ARCHITECTURE_REVIEW.md:168,307,390` | Legacy architecture prose suggesting Cloudflare/CloudFront CDN + WAF |
| `REMOVAL_PROPOSAL.md:5-6` | Proposal text listing Cloudflare config as removable |
| `PRODUCTION_RUNBOOK.md:211` | Mentions `cloudflared`/`ngrok` only as an optional VPS test tunnel (legacy VPS path) |

**Recommendation:** treat these as historical; no code change required for a Hostinger-only release. Do not introduce Cloudflare into the runtime path.

---

## 6. Files changed

Two passes are represented here: the documentation/packaging finalization pass (8 files, below) and the **WhatsApp implementation pass**.

**WhatsApp implementation pass (this pass) — code + tests:**

| File | Change |
|---|---|
| `hostinger-php-prototype/private/bootstrap.php` | Added the WhatsApp route matcher + `awikHandleWhatsAppRequest` and helpers (settings/provider resolution, HTTP client, send/messages/templates/reminders handlers); wired a dispatch call in `awikHandleRequest`. One cross-DB fix: message search uses `INSTR(...)` instead of MySQL-only `LOCATE(...)`. |
| `hostinger-php-prototype/tests/WhatsAppApiContractTest.php` | New focused contract test (route match, 401/403 auth, validation 400, unknown customer 404, unconfigured send queues `pending`, messages/templates/reminders list + filters, reminder trigger, secret non-leak, DB-error 500). |

**Finalization (documentation/packaging) pass — 8 files:**

1. `scripts/build-hostinger-package.ps1` — harness version `10.5.27 → 10.5.29`; WhatsApp note.
2. `DEPLOYMENT_READINESS.md` (root)
3. `hostinger-php-prototype/MIGRATION_STATUS.md`
4. `hostinger-php-prototype/DEPLOYMENT_READINESS.md`
5. `hostinger-php-prototype/DATABASE_READINESS.md`
6. `hostinger-php-prototype/SECURITY_REVIEW.md`
7. `hostinger-php-prototype/FEATURE_PARITY_AND_MIGRATION_PLAN.md`
8. `hostinger-php-prototype/MIGRATION_CHECKLIST.md`

**Intentionally preserved (not modified):**

- All **dated historical** sections and **quoted harness logs** (e.g. `10.5.27` inside `2026-10-14` update blocks) — records of specific past runs, not rewritten.
- **Frozen artifacts** under `deployment/*` (never modified).
- **Legacy docs** under `docs/legacy/*`.
- **Untracked scratch/debug files** at repo root (not deleted — user work is preserved).

**Unchanged:** all SQL migrations and all frontend source.

---

## 7. Tests run and results

Command pattern (PowerShell 5.1, working dir repo root):

- Lint: `php -l` over every `*.php` in `hostinger-php-prototype/` (excluding `.backup`/`.bak2`/`.corrupted`) plus `scripts/hostinger-api-bridge.php`.
- Suite: each `tests/*Test.php` except `MariaDbCompatibilityTest.php`, run with `php -d extension=php_pdo_sqlite.dll -d extension=php_zip.dll`.
- MariaDB 10.5.29 isolated integration: `php -d extension=php_pdo_mysql.dll -d extension=php_pdo_sqlite.dll hostinger-php-prototype\tests\MariaDbCompatibilityTest.php` (isolated temp DB; no production DB touched; log `mariadb-compat-20261015.log`).

| Check | Result |
|---|---|
| PHP lint — prototype | **27/27 pass** |
| PHP lint — bridge | **1/1 pass** |
| PHP lint — total | **28/28 pass, 0 failures** |
| `AdminProvisioningTest` | PASS |
| `AuthApiContractTest` | PASS |
| `BackupWorkflowTest` | PASS |
| `ConfigurationValidationTest` | PASS |
| `CustomerValidationTest` | PASS |
| `DashboardReportsValidationTest` | PASS |
| `HttpEntrypointTest` | PASS |
| `InventoryValidationTest` | PASS |
| `MaintenanceJobTest` | PASS |
| `PasswordRecoveryTest` | PASS |
| `PlanApiContractTest` | PASS |
| `SalesValidationTest` | PASS |
| `SchemaSetupTest` | PASS |
| `SettingsValidationTest` | PASS |
| `SubscriptionValidationTest` | PASS |
| `UserValidationTest` | PASS |
| `WhatsAppApiContractTest` | PASS |
| **Standalone suite total** | **17/17 pass, exit 0** |
| `MariaDbCompatibilityTest.php` (isolated 10.5.29) | **PASS, exit 0**; DB server version `10.5.29-MariaDB`; covered DDL, constraints, auth/lockout, sales/refund/cancel, inventory movements, concurrency/lock semantics, rollback, HTTP via PHP built-in server, cleanup |
| Build script parse | **OK** |
| Candidate archive re-hash | **matches reported SHA-256** |

These are **local unit/contract** results. They are **not** Hostinger acceptance, not all-model Prisma parity, not browser E2E, and not a backup/restore rehearsal. The MariaDB run used a fully disposable temporary server (temp data dir, ephemeral port, randomly named database, isolated runtime user) — no production data or existing repo DB was accessed or modified. Full output: `mariadb-compat-20261015.log`.

---

## 8. Tests not run and why

| Test | Why not run |
|---|---|
| `MariaDbCompatibilityTest.php` (isolated MariaDB integration harness) | **Ran and PASS, exit 0** (isolated temp MariaDB `10.5.29`); no production DB used/changed; temporary datadir and user created/destroyed; concurrency and lock-wait semantics verified. Log: `mariadb-compat-20261015.log`. |
| Hostinger staging smoke test (`POST_DEPLOY_SMOKE_TEST.md`) | No authorized non-production Hostinger environment; no credentials; not permitted. |
| Browser / E2E acceptance | No deployed environment; not authorized. |
| `npm run typecheck --workspace=apps/web` | Not needed — no frontend code changed this pass (it passed in the prior recovery pass). |
| Backup restore rehearsal | CLI-only, isolated-DB only; not authorized this pass. |

---

## 9. Package path, entry count, checksum

| Property | Value |
|---|---|
| Artifact | Value |
|---|---|
| Prior candidate | `deployment/hostinger-premium-backup-candidate-20261014-2153.zip` — 261 entries, SHA-256 `F9B82C7BCDA5EA766965F8ACB867BA430F872FD4D781212EBC41DBF3D4ADEFFF` (preserved; not overwritten) |
| **New candidate (this pass)** | `deployment/hostinger-premium-whatsapp-candidate-20261015.zip` |
| Entry count | **261** |
| SHA-256 | `F60D975050AF941564A464382BF6BE62BBA1DADB27421E5666FDD4D4058F8862` |
| Size | 1,461,683 bytes |
| Verified | built with `scripts/build-hostinger-package.ps1 -PackageName hostinger-premium-whatsapp-candidate-20261015`; archive re-opened and required entries (`public_html/.htaccess`, `api/.htaccess`) present; packaged `api/private/bootstrap.php` confirmed to contain `awikHandleWhatsAppRequest` and the `INSTR(...)` search fix |
| Status metadata | `manifest.json` → `"status": "NOT_READY"` |

**Package layout:**

```
hostinger-premium-whatsapp-candidate-20261015/
  public_html/                 <- document root: static export + apps/web/public/.htaccess
  public_html/api/index.php    <- bridge → <pkg>/api/public/index.php
  api/                         <- PHP app kept OUTSIDE the web root
    .htaccess                  <- blocks private/, routes /api/v1 to public/index.php
    private/  public/
  migrations/                  <- 4 ordered clean-install SQL files
  README.md  manifest.json
```

**Note:** this candidate includes the WhatsApp PHP endpoints and the updated builder README/manifest. The packaged frontend (`apps/web/out`) contains the WhatsApp screens. All Hostinger-side gates (env injection, extensions, LiteSpeed, `open_basedir`, grants, cron, mail) remain **unverified**, so the verdict stays **NOT READY**.

---

## 10. Deployment and rollback runbook

**Guiding rule:** staging-only, disposable data only, and no step is executed here. If any gate fails, stop and record the blocker; never proceed to production on assumption.

### Pre-flight gates (all UNVERIFIED — must pass first)

1. Confirm the plan is **Hostinger Premium shared hosting** (not VPS/Docker).
2. Verify in hPanel: PHP 8.3 for FPM **and** CLI; extensions `pdo_mysql`, `mbstring`, `json`, `openssl`, `zlib`, `zip`.
3. Verify MariaDB version/build, collation, SQL mode, timezone, InnoDB config, grants.
4. Verify LiteSpeed honors both `.htaccess` files and that the bridge sibling include works under `open_basedir`.
5. Verify a **secure env-variable injection** mechanism for the PHP app.
6. Verify a supported **CLI/cron** execution path for provisioning, cleanup, and restore.

### Deploy (staging)

1. Create a disposable staging site/subdomain and a **new empty database** with a dedicated user.
2. Upload the package: set document root to `public_html/`; keep `api/` and `migrations/` **outside** the web root.
3. Apply migrations **in order** to the empty DB: `2026_10_11_auth_core.sql` → `2026_10_12_login_attempts.sql` → `2026_10_13_full_application.sql` → `2026_10_14_password_recovery.sql` (18 tables).
4. Inject secrets securely: `AWIK_MIGRATION_DSN`, `AWIK_MIGRATION_DB_USER`, `AWIK_MIGRATION_DB_PASSWORD`, `AWIK_MIGRATION_JWT_SECRET`, `AWIK_MIGRATION_JWT_REFRESH_SECRET`, `AWIK_BACKUP_ENCRYPTION_KEY`; and recovery mail vars if enabling mail.
5. Create the first admin via the CLI-only `api/private/provision-admin.php` using a user-chosen password (never a default).
6. Optionally install **only** the cleanup cron (`api/private/cron/cleanup-auth-state.php`, hourly starting point) after confirming CLI/env support. Do **not** schedule WhatsApp/backup jobs (they don't exist).
7. Run the smoke test in `POST_DEPLOY_SMOKE_TEST.md` (login → dashboard → create customer → plan/subscription → product/stock → sale → refund/cancel → protected-route denial → report download → deep-link/404 behavior).

### Expected smoke results

No negative stock; no duplicate refund winner under concurrency; no unauthorized access to protected endpoints; report files generate; session/expiry behavior correct.

### Rollback

1. Remove/disable uploaded staging content; restore the previous document root.
2. Revert control-panel config changes.
3. Recreate the disposable database or restore its last known-good snapshot (never destructive SQL).
4. If a migration failed: stop, keep the DB disposable, restore the schema snapshot, and re-apply in smaller additive slices.
5. Re-run the smoke test only after DB and route config are corrected.

**Final rule:** do not promote to production, and do not label the package ready, until every gate above has non-production Hostinger evidence and rollback is validated.

## 11. Final decision

**Status: NO-GO (not ready for production)**

**Rationale:**
- **WhatsApp:** PHP endpoints implemented and contract-tested; real Meta Graph delivery and inbound webhook (raw-body signature verification) remain unverified; no production credentials exercised.
- **Hostinger-side gates:** PHP extensions, LiteSpeed rewrites, `open_basedir` sibling include, secure FPM env injection, supported CLI/cron execution path, MariaDB grants/SQL mode/timezone on account, and mail delivery are **unverified** (no authorized Hostinger staging account in this pass).
- **Backups/restoration:** CLI-only isolation exists; no HTTP restore/cron/scheduled jobs tested; large exports untested on Hostinger resources.
- **E2E/Browser acceptance:** not performed.

**Evidence (local, green):**
- PHP lint 28/28; standalone suite 17/17 PASS (incl. `WhatsAppApiContractTest`).
- Isolated MariaDB 10.5.29 compatibility harness: PASS, exit 0 (temp server, disposable DB/user, cleanup; log `mariadb-compat-20261015.log`).
- ZIP: `deployment/hostinger-premium-whatsapp-candidate-20261015.zip`, **261 entries**, SHA-256 **F60D975050AF941564A464382BF6BE62BBA1DADB27421E5666FDD4D4058F8862**; `api/private/bootstrap.php` contains `awikHandleWhatsAppRequest` and `INSTR(...)` fix.
- WhatsApp: 9 routes (status, test-connection ADMIN, send, messages, templates GET/POST ADMIN, reminders, reminders/due, reminders/trigger) with auth/validation; queues `pending` when unconfigured.

**GO only when:** all P0 Hostinger gates have account-specific evidence; WhatsApp has non-production provider verification or documented accepted limitation + nav hidden (if not required); HTTP restore rehearsal done if required; `.github/workflows/deploy.yml` (VPS) is disabled or confirmed inert for Hostinger; rollback plan validated on staging.
## Appendix — owner decisions required

1. **WhatsApp (P0):** endpoints implemented + contract-tested this pass. Remaining decisions: provide real Meta credentials to verify delivery, decide whether to implement the inbound webhook (needs raw-body access), and decide whether to schedule automated reminder dispatch.
2. **VPS CI/CD (`deploy.yml`):** remove/disable, or confirm it is inert for the Hostinger release.
3. **Data migration:** define the PostgreSQL→MariaDB approach if production data exists.
4. **Canonical artifact:** confirm whether `hostinger-premium-whatsapp-candidate-20261015.zip` supersedes the `…2153` backup candidate.
5. **Repo hygiene:** authorize cleanup of untracked root-level scratch files.

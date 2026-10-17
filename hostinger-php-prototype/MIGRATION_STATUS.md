# AWIK NET PHP/MariaDB migration status

**Updated:** 2026-10-14  
**Release verdict:** **NOT READY for Hostinger.** The PHP code is a partial port. No deployment, upload, production/database access, DNS/hosting change, or migration against Hostinger occurred.

## Implemented PHP handlers

`private/bootstrap.php` contains handlers for:

- Authentication/token lifecycle and persistent account/IP login throttling.
- ADMIN user management and role checks; customer and staff-level workflows.
- Plans and company settings.
- Customer create/list/search/detail/update/soft-delete.
- Subscription create/list/detail/update/renew/suspend/activate/cancel.
- Inventory categories, products, lookups, movements, low-stock/summary.
- Sales/items, refunds, and cancellations with inventory restoration.
- Dashboard and JSON reports plus generated CSV, PDF and XLSX downloads (XLSX requires PHP ZIP).
- PHP-only password-recovery request/reset endpoints with hashed, expiring, single-use tokens and hashed email/IP throttling. The inspected NestJS API has no corresponding recovery or email-verification endpoint.
- ADMIN-only database backups: `GET /api/v1/backups` (list), `POST /api/v1/backups/create`, `GET /api/v1/backups/integrity/{id}`, `GET /api/v1/backups/{id}/download`, and `POST /api/v1/backups/cleanup`. A snapshot is a gzip-compressed JSON document of ordered `CREATE TABLE`/`INSERT` statements, encrypted with AES-256-GCM and authenticated with HMAC-SHA256, stored outside and refused under the public document root. Restore is CLI-only (`private/restore-backup.php <backup-id>`) and requires `AWIK_BACKUP_RESTORE_ACTOR_ID`; it is intended for an isolated database only.

Presence of handlers is not a claim of complete NestJS parity or exhaustive coverage. The NestJS `/auth/demo` development route, audit listing, financial overview, full authorization/audit parity, verified Hostinger native-mail delivery, email verification, WhatsApp delivery/webhooks/reminders, subscription status refresh, file uploads, complete report JSON/projection parity, and PostgreSQL-to-MariaDB data import remain absent or incomplete. Backups are a partial port: list/create/integrity/download/cleanup and CLI restore exist, but incremental backups, backup schedules, the HTTP restore/restore-token routes, and full NestJS restore/crypto parity do not. Backup coverage is standalone (encryption, integrity, path-safety, authorization) plus create/list/integrity/download/cleanup route smoke tests; Hostinger secure key injection, PHP `openssl` availability, and a supported CLI restore execution path remain unverified. Password recovery itself has standalone and isolated MariaDB HTTP/concurrency coverage; it is not original NestJS parity. CSV/PDF/XLSX download generation is locally exercised; isolated MariaDB tests now cover all seven download queries, roles/date filters, and all three formats for 101 matching sales. Revenue, sales, and stock-movement downloads include all matching rows; large result sets are buffered in memory and need representative host resource testing. Hostinger ZIP/iconv extension availability is unverified. A bounded CLI auth-state cleanup job is implemented and tested locally, but Hostinger cron invocation/environment injection remains unverified. The shipped static frontend still presents WhatsApp, demo-login, audit and financial screens; because no PHP route exists for `/api/v1/whatsapp/*` (and the other absent areas), those pages receive 404 responses until the features are ported or removed from navigation.

## Fresh-install schema

The builder now emits this ordered chain for a **new empty database only**:

1. `migrations/2026_10_11_auth_core.sql` — copied from `private/schema/auth-slice.sql`.
2. `migrations/2026_10_12_login_attempts.sql`.
3. `migrations/2026_10_13_full_application.sql`.
4. `migrations/2026_10_14_password_recovery.sql`.

The PHP clean chain now defines 18 tables, including password-recovery token and throttle tables. `awik_company_settings` appears once in that chain; the legacy `2026_10_13_company_settings.sql` is deliberately excluded because the core baseline already creates the table. The duplicate DDL was removed from the full-application migration. `2026_10_13_company_settings.sql` remains only as a legacy additive helper.

`SchemaSetupTest.php` checks the package order, duplicate DDL, foreign-key prerequisite order and destructive SQL patterns across PHP schema/migration files. The isolated MariaDB 10.5.29 harness applies the ordered chain, verifies all 18 table names, enforces stock/quantity CHECK constraints, and exercises application workflows. There is still no migration ledger or schema-drift validator; `IF NOT EXISTS` does not make this an existing-install upgrade path. The PostgreSQL Prisma migrations remain unchanged and must not be applied to MariaDB.

## Initial ADMIN provisioning

`private/provision-admin.php` is CLI-only, has no HTTP route, takes initial account values only from process environment, and passes data to `admin-provisioner.php`. The helper rejects caller-selected roles, validates fields/password, takes MariaDB `GET_LOCK`, requires that the complete users table is empty, creates a fixed `ADMIN`/`ACTIVE` user with a bcrypt hash, commits, releases the lock, and refuses a repeat attempt. `AdminProvisioningTest.php` covers the input and exposure boundaries; the MariaDB 10.5 harness verifies real creation, password hash and role/status, and that a repeat cannot alter the user count.

Hostinger's supported secure PHP-FPM variable mechanism and a secure supported way to invoke this CLI on the reported no-shell plan are unverified. Do not put credentials in a public file, source control, package, `.htaccess`, cron command, or command-line arguments. First-admin setup is a Hostinger release blocker until the account's supported secure execution/configuration path is independently confirmed.

## Configuration and migration safety

Runtime reads `AWIK_MIGRATION_DSN`, `AWIK_MIGRATION_DB_USER`, `AWIK_MIGRATION_DB_PASSWORD`, `AWIK_MIGRATION_JWT_SECRET`, and `AWIK_MIGRATION_JWT_REFRESH_SECRET` from `getenv()`. The legacy test-variable fallbacks were removed. Runtime config rejects missing DSN/DB credentials, JWT secrets under 32 bytes or equal to each other, non-MariaDB production DSNs, and SQLite outside local CLI tests. Hostinger environment injection is not verified.

Static schema checks found no `DROP`, `TRUNCATE`, broad `DELETE`, or `ALTER TABLE ... DROP` statement in the PHP schema/migration SQL. The full-install chain remains restricted to a fresh empty MariaDB database because there is no ledger/schema-drift check or existing-data migration.

## Verified local evidence

**Standalone PHP tests:** the current 16-file standalone suite passes on PHP 8.3.13 with PDO SQLite and ZIP extensions (the MariaDB harness is excluded). It covers authentication/token lifecycle, plan and API contracts, configuration validation, admin provisioning, customer/sales/subscription/inventory/settings validation, HTTP entrypoint/private-file protection, password recovery, auth-state cleanup, and the backup encryption/integrity/path-safety/authorization test.

**MariaDB integration:** `php hostinger-php-prototype/tests/MariaDbCompatibilityTest.php` last passed (exit 0) before this documentation update using explicit `AWIK_MARIADB_BASEDIR` pointing to an isolated MariaDB `10.5.29-MariaDB` runtime, unique generated loopback-only temporary datadir and database, random synthetic identities/credentials, and DML-only HTTP runtime account. The test now requires the explicit base-directory variable; it has no MariaDB 13 default. Its latest run covered recovery migration setup, recovery HTTP flow and concurrent single-use redemption together with the following:

- The ordered schema chain, all 18 expected tables, repeatable migration DDL, and MariaDB 10.5 enforcement of both product-stock and sale-item-quantity `CHECK` constraints.
- First ADMIN creation and repeat refusal, password hash, fixed role/status.
- ADMIN/STAFF access boundaries; customer CRUD/search; subscription create/renew/history/suspend/activate/cancel; inventory product/category/movements; sales, refunds and cancellations with expected stock effects.
- Auth/token lifecycle, DML-only HTTP permissions, lockout thresholds/reset/restart/expiry, spoofed-header handling, database outage behavior, and original failure/rollback invariants.
- Exact-row contention evidence for refund, cancellation and inventory movements via `SHOW ENGINE INNODB STATUS` record page/heap and UUID correlation to both waiters and the confirmed holder transaction/application connection; existing simultaneous-request and business invariants remain asserted.
- Recovery integration: hashed token storage, account-independent request response, successful reset/session revocation, invalid/reused token rejection, schema reapplication, and two concurrent redemption HTTP requests with exactly one successful winner.

**PHP lint:** `php -l` passed for all 27 PHP files — 10 runtime files (`private/`, `public/`, and the bridge) plus 17 test files. The suite and lints were run against the same current source/test state.

**Harness cleanup:** the completed harness's randomly named datadir root was removed and no MariaDB process from the isolated runtime remained. One older, pre-existing diagnostic directory under the temp folder was intentionally preserved; it is not a datadir from the successful current run. The reusable MariaDB 10.5 binaries are isolated under the user temp folder. No installed MariaDB service/data directory was used.

## Remaining blockers and release scope

- Hostinger PHP-FPM secure environment injection and supported CLI execution for first-admin provisioning are unverified.
- Hostinger LiteSpeed `.htaccess` rewrites, sibling `open_basedir` access, document root, PHP SAPI/extensions, MariaDB grants/version/collation/SQL mode/timezone, cron, TLS/headers, and browser/API acceptance remain unverified. The capabilities report is account-reported, not independent evidence.
- The PHP clean-install chain has no version ledger, drift detection, import conversion, or safe in-place upgrade path. The backup API is an operational snapshot tool, not a migration rollback plan. Never apply the chain to an existing/Hostinger/production database.
- No tests ran against Hostinger. Browser E2E, all route-role permutations, complete rollback/concurrency matrices beyond the preserved tested assertions, load/retention, and operational recovery remain open.
- Demo login/audit listing/financial overview, WhatsApp/subscription scheduler/email/upload, incremental/scheduled backups and HTTP restore, and full report JSON/projection parity remain incomplete. CSV/PDF/XLSX downloads have generated-file tests and isolated MariaDB coverage across all seven download queries; the auth-state cleanup command also has MariaDB coverage, but no Hostinger cron is installed or verified.
- Native PHP mail configuration is implemented but disabled by default. The local provider callback tests success/failure without sending email; Hostinger's mail transport, sender acceptance, and recipient delivery are unverified. The recovery/reset UI source was added, but the preserved `apps/web/out/` static export has not been rebuilt, so those pages are not established as present in the prior package.

The package status remains `NOT_READY`. See `DATABASE_READINESS.md` and `DEPLOYMENT_READINESS.md` for schema and host gates. Next safe action: review the new local candidate package and then confirm secure environment injection, CLI capability, PHP extensions, document-root/`open_basedir`, and database properties from Hostinger documentation/panel before requesting permission for isolated staging acceptance. No Hostinger-side action is authorized or implied.

## Latest locally verified maintenance candidate — 2026-10-14

`private/cron/cleanup-auth-state.php` is CLI-only and has a bounded transactional cleanup with a database-specific named lock. The standalone maintenance test and full MariaDB 10.5.29 harness verified argument/web boundaries, expired/unexpired token handling, stale/recent/locked login-attempt handling, overlapping-run skip, persistence and transaction behavior. It does not implement other Nest scheduled jobs and is not scheduled by the builder.

Fresh release candidate: `deployment/hostinger-premium-auth-cleanup-candidate-20261014.zip`, SHA-256 `5FB63531A7AA55791A485EFD7031AFA5EBC33A1E989ECB2D4AB98B46B376BD2F`. Its 246 archive entries match the generated package and preserved fresh extraction. Both hidden `.htaccess` files, sibling private API placement, three canonical migrations and cleanup job were checked; all eight packaged PHP files linted. The extracted bridge returned the expected JSON 404 using isolated in-memory SQLite. The redacted secret classification passed; manifest stays `NOT_READY`, with Hostinger acceptance false. Same-name builder invocation refused overwrite (expected exit 1), with file count and archive hash unchanged. Previous candidates, including `deployment/hostinger-premium-readiness-candidate-20261014-final.zip` (SHA-256 `EF6BBCEA5281BBB2C991FE43E82773CB41EDFE6CFF334206D17B57EEBB27E4D0`), remain preserved.

No Hostinger/production resource was accessed or changed. Hostinger secure PHP-FPM/CLI configuration, LiteSpeed, `open_basedir`, extensions, DB grants/build, cron, TLS/headers, no-cost staging and browser acceptance remain unverified release gates.

## Backup/restore candidate — 2026-10-14

`private/backup.php` implements PHP-native encrypted snapshots. The ADMIN-only HTTP routes are `GET /api/v1/backups` (list with `data` + `meta`), `POST /api/v1/backups/create`, `GET /api/v1/backups/integrity/{id}`, `GET /api/v1/backups/{id}/download`, and `POST /api/v1/backups/cleanup`. Snapshots are a gzip-compressed JSON document of ordered `CREATE TABLE`/`INSERT` statements, encrypted with AES-256-GCM (12-byte IV, 16-byte tag) and authenticated with HMAC-SHA256; the manifest records size, plaintext SHA-256, and HMAC. Storage is refused inside or under `DOCUMENT_ROOT`. Restore is deliberately not an HTTP route: `private/restore-backup.php <backup-id>` is CLI-only, requires `AWIK_BACKUP_RESTORE_ACTOR_ID`, and is intended only for an isolated database. Incremental backups, backup schedules, the HTTP restore/restore-token routes, and full NestJS pg_dump/psql restore parity are not implemented; incremental/scheduled backup cron jobs are not installed.

`BackupWorkflowTest.php` covers key derivation, gzip round-trip, AES-256-GCM encrypt/verify/decrypt, corruption rejection, public-root storage rejection, and ADMIN-only authorization. The create/list/integrity/download/cleanup routes were additionally smoke-tested at runtime (encrypted create, valid integrity, download headers/path, fresh-retention cleanup, and 404 for a missing id). The full standalone suite passes 16/16, and the isolated MariaDB 10.5.29 harness still passes (exit 0).

Fresh release candidate: `deployment/hostinger-premium-backup-candidate-20261014-2153.zip`, SHA-256 `F9B82C7BCDA5EA766965F8ACB867BA430F872FD4D781212EBC41DBF3D4ADEFFF` (261 archive entries). Its packaging README/manifest describe the backup API and CLI-only restore and remain `NOT_READY`. Backup encryption key injection, PHP `openssl` availability, and a supported CLI restore execution path on Hostinger remain unverified account-specific gates.

# AWIK NET PHP/MariaDB Prototype

This folder contains a partial PHP 8.3/MariaDB port alongside the original Next.js/NestJS/Prisma source. The PHP entrypoint currently has handlers for authentication and token lifecycle, ADMIN user administration/permissions, plans, company settings, customers, subscriptions/renewal/cancellation, inventory, sales/refunds/cancellations, dashboard, CSV/PDF/XLSX report downloads, PHP-only password recovery, and an ADMIN-only backup API (list/create/integrity/download/cleanup) with CLI-only isolated restore. The inspected NestJS auth API has no password-recovery or email-verification endpoints. XLSX generation requires PHP's ZIP extension and backup encryption requires PHP `openssl`; the host's extension availability is unverified. Implemented handlers are not equivalent to complete NestJS parity, and the package is **not ready for Hostinger deployment**.

## Local validation

Run the PHP contract/validation tests from the repository root. SQLite-backed tests require the bundled PDO SQLite extension:

```powershell
php -d extension=php_pdo_sqlite.dll hostinger-php-prototype/tests/AuthApiContractTest.php
php -d extension=php_pdo_sqlite.dll hostinger-php-prototype/tests/PlanApiContractTest.php
php -d extension=php_pdo_sqlite.dll hostinger-php-prototype/tests/HttpEntrypointTest.php
php hostinger-php-prototype/tests/ConfigurationValidationTest.php
php hostinger-php-prototype/tests/AdminProvisioningTest.php
php hostinger-php-prototype/tests/MaintenanceJobTest.php
php hostinger-php-prototype/tests/SchemaSetupTest.php
php hostinger-php-prototype/tests/CustomerValidationTest.php
php hostinger-php-prototype/tests/SubscriptionValidationTest.php
php hostinger-php-prototype/tests/InventoryValidationTest.php
php hostinger-php-prototype/tests/SalesValidationTest.php
php hostinger-php-prototype/tests/SettingsValidationTest.php
php hostinger-php-prototype/tests/UserValidationTest.php
php -d extension=php_zip.dll hostinger-php-prototype/tests/DashboardReportsValidationTest.php
php -d extension=php_pdo_sqlite.dll hostinger-php-prototype/tests/PasswordRecoveryTest.php
php -d extension=php_pdo_sqlite.dll hostinger-php-prototype/tests/BackupWorkflowTest.php
```

The database-backed test is separately destructive only to its own unique temporary datadir/database, binds MariaDB to loopback, and removes that harness root at completion. **Set `AWIK_MARIADB_BASEDIR` explicitly to a dedicated MariaDB 10.5 installation** before running it; there is no default server path. The test verifies `SELECT VERSION()` is MariaDB 10.5 before it proceeds:

```powershell
$env:AWIK_MARIADB_BASEDIR = 'C:\path\to\isolated\mariadb-10.5'
$env:AWIK_MARIADB_TARGET_VERSION = '10.5'
php hostinger-php-prototype/tests/MariaDbCompatibilityTest.php
```

Never point the harness at a production or installed service datadir. A successful local harness is not Hostinger acceptance.

## Fresh PHP schema and bootstrap

The package builder orders a new empty MariaDB database as:

1. `migrations/2026_10_11_auth_core.sql` (copied from `private/schema/auth-slice.sql`)
2. `migrations/2026_10_12_login_attempts.sql`
3. `migrations/2026_10_13_full_application.sql`
4. `migrations/2026_10_14_password_recovery.sql`

The standalone `2026_10_13_company_settings.sql` is only a legacy additive helper; do not include it in the clean-install chain because the baseline creates that table. No migration ledger or schema-drift validation exists. The ordered chain is not an upgrade path for any non-empty schema; the PostgreSQL Prisma migrations are not MariaDB migrations. Review every migration before using it, and never apply it to a Hostinger or production database as part of local validation.

## Password recovery boundary

`POST /api/v1/auth/forgot-password` and `POST /api/v1/auth/reset-password` implement PHP-only recovery. A 256-bit random token is sent in a URL fragment and only its SHA-256 hash is stored; it expires after 30 minutes, is consumed once transactionally, and a successful reset revokes active sessions. Responses do not disclose account existence. Per-email and per-IP throttles persist only SHA-256 scope hashes. The configurable transport uses native `mail()` only when `AWIK_RECOVERY_MAIL_PROVIDER=php-mail`, a valid `AWIK_RECOVERY_FROM_EMAIL`, and an HTTPS `AWIK_PUBLIC_APP_URL` are set. Provider failure does not leave an active token and is not reported as a delivered email. Native mail availability, sender acceptance, and recipient delivery have not been verified on Hostinger; no email-verification flow is implemented.

`private/provision-admin.php` is a CLI-only, one-time initial ADMIN tool. It accepts the initial identity/password only through process environment variables (`AWIK_INITIAL_ADMIN_EMAIL`, `AWIK_INITIAL_ADMIN_PHONE`, `AWIK_INITIAL_ADMIN_FIRST_NAME`, `AWIK_INITIAL_ADMIN_LAST_NAME`, `AWIK_INITIAL_ADMIN_PASSWORD`), obtains a MariaDB named lock, requires the entire `awik_users` table to be empty, assigns a fixed `ADMIN`/`ACTIVE` role/status, hashes the password, and refuses later provisioning. It has no HTTP route. Do not pass secrets on command lines or store them in source, the package, public files, or `.htaccess`. Hostinger has not been confirmed to provide a secure way to inject these variables or run the CLI tool, so first-admin setup remains blocked on this plan pending secure account-specific verification.

Runtime configuration uses `getenv()` for `AWIK_MIGRATION_DSN`, `AWIK_MIGRATION_DB_USER`, `AWIK_MIGRATION_DB_PASSWORD`, `AWIK_MIGRATION_JWT_SECRET`, and `AWIK_MIGRATION_JWT_REFRESH_SECRET`. MariaDB requires credentials; the JWT secrets must be distinct and at least 32 bytes. SQLite is accepted only for local CLI tests. No `.env` parser or public-file secret fallback is provided. Hostinger's secure PHP-FPM injection mechanism is unverified; do not improvise by putting secrets in downloadable/public files.

## Scheduled auth-state cleanup

`private/cron/cleanup-auth-state.php` is a CLI-only maintenance command. It transactionally deletes at most 5,000 expired access/refresh token records, 5,000 expired recovery tokens, 5,000 login-attempt records older than 30 days whose lock has expired or is absent, and 5,000 recovery throttle scopes older than one day. Active lockouts and unexpired tokens are preserved. A database advisory lock skips overlapping runs; database/configuration failures exit nonzero without exposing credentials. `MaintenanceJobTest.php` checks the command boundary, and the isolated MariaDB compatibility harness exercises retention, actual persistence, active-lock preservation, and concurrent-run skip behavior.

The package contains the command but does not install a cron entry. An hourly cadence is only a suggestion after Hostinger verifies CLI access, secure cron environment-variable injection, and DML grants. The reported no-shell limitation and CLI/PHP-FPM environment differences leave scheduling unverified; do not put secrets on the cron command line or in a public file.

## Backups and restore

`private/backup.php` implements an ADMIN-only backup API: `GET /api/v1/backups` (list), `POST /api/v1/backups/create`, `GET /api/v1/backups/integrity/{id}`, `GET /api/v1/backups/{id}/download`, and `POST /api/v1/backups/cleanup`. A snapshot is a gzip-compressed JSON document of ordered `CREATE TABLE`/`INSERT` statements, encrypted with AES-256-GCM and authenticated with HMAC-SHA256; the manifest stores size, plaintext SHA-256 and HMAC, and storage is refused inside or under the public document root. Backups require `AWIK_BACKUP_ENCRYPTION_KEY` (64 hex characters or a passphrase), plus PHP `openssl` and zlib; XLSX and snapshot compression both depend on extensions that remain unverified on Hostinger.

Restore is deliberately not an HTTP route. `private/restore-backup.php <backup-id>` is CLI-only, requires `AWIK_BACKUP_RESTORE_ACTOR_ID`, and must only ever target an isolated database. Incremental backups, backup schedules, the HTTP restore/restore-token routes, and full NestJS `pg_dump`/`psql` restore parity are not implemented, and no backup cron entry is installed. `BackupWorkflowTest.php` covers key derivation, gzip round-trip, AES-256-GCM encrypt/verify/decrypt, corruption rejection, public-root storage rejection and ADMIN-only authorization; create/list/integrity/download/cleanup are also smoke-tested. Hostinger secure key injection and a supported CLI restore execution path remain unverified.

## Release boundaries

The local MariaDB compatibility harness exercises fresh schema setup, auth and token lifecycle, role checks, customer CRUD/search, subscription creation/renewal/status/cancellation, inventory and sale/refund/cancellation flows, bounded auth-state cleanup, and the exact-row-lock concurrency assertions. Standalone contract tests validate input/route helpers. This does not establish full route-wide authorization coverage, every failure/rollback/race case, Hostinger web-server compatibility, secure environment injection, or production readiness.

The NestJS `/auth/demo` development route, audit listing, financial overview, full authorization/audit parity, WhatsApp Graph API delivery/webhooks/reminder execution, incremental/scheduled backups and HTTP restore, subscription-status scheduler, verified Hostinger email delivery, email verification, file uploads, complete report JSON/projection parity, and PostgreSQL-to-MariaDB data migration are absent or incomplete. PHP password recovery is implemented and locally tested, but it is not NestJS parity and provider delivery remains unverified. The PHP backup API (ADMIN list/create/integrity/download/cleanup with CLI-only isolated restore) is implemented and locally tested, but it is a partial port and Hostinger encryption-key/`openssl`/CLI execution remain unverified. CSV/PDF/XLSX downloads are generated from PHP report projections and tested against MariaDB routes; revenue, sales, and stock-movement downloads include every matching row, while customer/WhatsApp exports retain their Nest limits of 20/50. Large exports are buffered in memory, so representative Hostinger memory/runtime testing remains a release gate. Host ZIP extension support remains unverified. The package builder includes the tested auth-state cleanup script, but intentionally emits no cron entries for that or missing jobs.

Hostinger LiteSpeed/rewrite and sibling `open_basedir` behavior, PHP-FPM extensions, MariaDB 10.5 build/grants/collation, cron capability, secure configuration injection, HTTPS, backup encryption-key injection/`openssl`/CLI restore execution, and browser-to-API acceptance remain unverified. The Hostinger AI capabilities report is account-reported, not test evidence. No Hostinger or production action has been taken; retain the **NOT READY** decision until these gates are verified on isolated staging and explicitly approved.

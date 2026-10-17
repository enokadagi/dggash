# AWIK NET PHP Security Readiness Review

**Updated:** 2026-10-14  
**Scope:** PHP runtime configuration, auth/lockout, one-time first-admin provisioning, and package/runtime boundaries. This is local evidence only, not a production-readiness assessment.

## Login Policy

- Per normalized account identifier: five failed credentials in a fixed 15-minute window, anchored at the first failure. The fifth failed request returns the generic 401; the next request is blocked with 429 and `Retry-After` for 15 minutes from lockout creation.
- Per client IP: ten failed credentials in a fixed five-minute window, anchored at the first failure and aggregated across accounts. The tenth failed request returns the generic 401; the next request is blocked with 429 and `Retry-After` for five minutes.
- Email identifiers are trimmed and lowercased. Phone whitespace/punctuation is removed; `00` and `+` international prefixes resolve to the same canonical identifier while legacy phone candidates remain searchable.
- Database account-scope values are SHA-256 hashes of normalized identifiers. IP-scope values are SHA-256 hashes of the validated IP. Raw account identifiers and IPs are not stored in the lockout table.
- Successful login resets that account's counter only. It does not reset the shared IP counter. Expired windows are reset when checked; state is stored in MariaDB and survives independent PHP requests/processes.
- Unknown, inactive, and wrong-password accounts receive the same generic authentication response. A dummy bcrypt verification is used when the account is missing or inactive. This reduces, but does not prove elimination of, timing side channels.

## IP Trust And Database Failure

`public/index.php` supplies `$_SERVER['REMOTE_ADDR']` to the handler. `Forwarded`, `X-Forwarded-For`, and similar request headers are ignored. An invalid or missing `REMOTE_ADDR` maps to the shared `unknown` scope. This prevents clients from spoofing their rate-limit identity, but deployments behind a reverse proxy may group all users under the proxy IP. Trusted-proxy support is not implemented. Do not trust forwarded headers without an explicit proxy allowlist and source-peer validation.

Login fails closed with a generic 503 if the database connection, migration table, or attempt tracking operation is unavailable. The runtime handler does not create or alter tables. Apply the migration using a migration-capable account first; the application account needs only the DML privileges required by its normal routes.

## First Administrator Provisioning

`private/provision-admin.php` rejects non-CLI SAPI before loading the provisioning helper; no HTTP route references it. Identity/password are read only from named process environment variables, never command-line arguments or source defaults. The helper accepts no caller-controlled role/status, validates initial identity/password fields, serializes calls with a MariaDB advisory lock, checks that `awik_users` has zero rows (including soft-deleted users), creates only a fixed ADMIN/ACTIVE user with a bcrypt password hash, and refuses subsequent runs. The isolated MariaDB 10.5.29 harness verified creation and unchanged row count after a repeat attempt.

This does not establish a safe Hostinger execution path. The reported plan has no shell access, and secure PHP-FPM environment injection/CLI invocation has not been independently confirmed. Do not substitute a public bootstrap route, default credential, `.env` file, public configuration file, `.htaccess`, cron command containing secrets, or command-line password argument. Account-specific secure provisioning remains a deployment gate.

Runtime configuration now reads only the `AWIK_MIGRATION_*` variables via `getenv()`; the test-variable fallbacks were removed. It rejects missing database credentials, equal or shorter-than-32-byte JWT secrets, and non-MariaDB DSNs outside local CLI testing. This protects against accidental empty/default config but does not prove that Hostinger can inject secrets securely.

## Migration And Recovery

`database/migrations/2026_10_12_login_attempts.sql` is additive and repeatable through `CREATE TABLE IF NOT EXISTS`. It creates only `awik_login_attempts` with a composite primary key and indexes for lock expiry and failed-attempt lookup. `database/schema.sql` carries the same table for clean installs. The disposable MariaDB integration test applies the migration twice and verifies columns, index names, and the table set before and after.

There is no destructive down migration. For a failed or partial application, inspect `INFORMATION_SCHEMA.COLUMNS` and `SHOW INDEX FROM awik_login_attempts`, then rerun the migration. Rolling back application code does not require dropping the table. Only remove the table in a disposable database after confirming its target; do not use a production `DROP TABLE` as routine rollback.

## Verification

All 16 database-independent PHP tests passed (exit 0) on PHP 8.3.13; the SQLite-only contracts loaded the bundled PDO SQLite extension. `php -l` passed for all 27 PHP prototype/bridge/test files. The full `MariaDbCompatibilityTest.php` passed (exit 0) against explicit isolated MariaDB `10.5.29-MariaDB`, using a unique temporary loopback-only datadir/database and random synthetic credentials. It verified auth/token/lockout behavior, ordered 18-table clean schema, check enforcement, admin provisioning, customer/subscription/inventory/sales workflows, password recovery, and DML-only runtime grants.

For refund, cancellation and inventory contention, the harness preserves actual simultaneous requests and row-lock/business assertions. MariaDB 10.5's `SHOW ENGINE INNODB STATUS` fallback correlated the exact operation/table/UUID to each waiting transaction's PRIMARY record page/heap, plus the confirmed holder transaction and application connection. The harness also passed its post-contention stock/status/invariant assertions. This is a local MariaDB result, not Hostinger acceptance.

The web `.htaccess` route text and PHP built-in HTTP path are locally tested; actual LiteSpeed/Apache behavior is not. No automated security scanner result is claimed.

## Remaining Risks

- The test server was isolated MariaDB 10.5.29, not Hostinger's confirmed patch/build, collation, SQL mode, proxy topology, or LiteSpeed configuration. No deploy, upload, DNS, or hosting settings were changed.
- No scheduled cleanup exists for expired attempt rows. Hashed identifiers reduce exposure, but unique account/IP scopes can grow the table indefinitely.
- Timing equivalence is not statistically tested. Database/cache behavior and stored bcrypt cost can still differ.
- Real Apache rewrite behavior is untested; the test checks `.htaccess` directives and exercises the PHP public entrypoint using PHP's built-in server.
- Browser `sessionStorage` reduces persistence but remains JavaScript-readable and is not an HttpOnly-cookie design. It does not eliminate XSS token theft.
- Backup snapshots are AES-256-GCM + HMAC-SHA256 encrypted with a key read from `AWIK_BACKUP_ENCRYPTION_KEY`. Losing the key makes snapshots unrestorable; exposing it exposes the full snapshot. Storage under the public document root is refused, but Hostinger key injection and backup-directory permissions/retention are unverified. The CLI restore requires `AWIK_BACKUP_RESTORE_ACTOR_ID` and must only target an isolated database.
- The PHP prototype remains a partial migration and is not production-ready. WhatsApp/incremental-and-scheduled-backup/HTTP-restore/cron/email/upload/PDF/XLSX/data migration work is incomplete. The ADMIN-only backup API and CLI-only restore are implemented and locally tested, but Hostinger secure encryption-key injection, PHP `openssl` availability, and a supported CLI restore execution path are unverified. Confirm Hostinger compatibility and test the complete deployment path in isolated staging before any production-facing action.

## Next Safest Action

Keep the schema chain unapplied outside a fresh disposable database until it has been independently reviewed; it is not an upgrade path. Verify Hostinger's secure environment/CLI provisioning mechanism, database version/grants, document root and server path behavior before requesting isolated staging acceptance. Do not deploy this slice based solely on local tests.

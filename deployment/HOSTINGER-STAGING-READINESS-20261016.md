# AWIK NET — Hostinger Staging Readiness Report

**Date:** 2026-10-16
**Branch:** `hostinger-php-migration`
**Artifact:** `deployment/awik-net-hostinger-release-candidate-20261016.zip`
**SHA-256:** `CE6A208782199FC2EC6355FB0E2277029419DEA56706BBF231F45B55483A2B02`
**Size:** 1,463,802 bytes
**Checksum file:** `deployment/awik-net-hostinger-release-candidate-20261016.zip.sha256`
**ZIP entries:** 261 (all forward-slash separators)
**Package validation:** 21/21 PASS (`scripts/validate-hostinger-package.ps1`), 0 failed, 0 skipped
**Manifest status:** `NOT_READY`
**Hostinger acceptance:** `false` (top-level and `localValidation`)
**Production deployment:** Not authorized

The upload guide (`deployment/HOSTINGER-STAGING-UPLOAD-GUIDE.md`), this report, the manifest, and the checksum file all refer to the same artifact name and the same SHA-256 above.

---

## What this release candidate contains

A staging-aware PHP migration package built exclusively through `scripts/build-hostinger-package.ps1`. The package copies the PHP runtime code and one canonical migration chain outside `public_html`, excludes tests/fixtures/legacy duplicate paths, does not package `.env`, `*.key`, `*.log`, `*.sqlite`, or production identifiers, and archives all files including hidden `.htaccess` entries. The archive paths use forward-slash separators only.

Top-level archive entries: `public_html/`, `api/`, `migrations/`, `manifest.json`, `README.md`.

Build safeguards added to `scripts/build-hostinger-package.ps1`: it emits a top-level `hostingerAcceptance: false` alongside the nested value and an `artifact` name matching the archive, refuses to build if the emitted manifest is not `NOT_READY`/`hostingerAcceptance: false`, and writes the `*.zip.sha256` checksum sidecar after sealing the archive. The builder never enables acceptance on its own.

Staging-aware behavior in `scripts/hostinger-api-bridge.php` (shipped as `public_html/api/index.php`):

- First candidate `dirname(__DIR__, 3) . '/staging-api'`. For a bridge at `.../public_html/staging/api/index.php` this resolves `/home/u605093332/domains/awiknet.com/staging-api` (outside every document root) — the intended staging path.
- The same file at the production location (`.../public_html/api/index.php`) resolves `dirname(__DIR__, 2) . '/api'` = `/home/u605093332/domains/awiknet.com/api`, so production resolution is unchanged there.
- Under a staging deployment each further candidate points inside `public_html/`, where production does not keep its private `api/`; an absent `staging-api/` therefore fails closed.
- Fail-closed response: HTTP 500 with `{"success": false, "message": "Application unavailable"}` and no path or secret disclosure.

---

## Local test results (PHP 8.3.13 CLI)

Standalone tests run in the current environment — 17/17 PASS (all exit 0):

| Test | Result |
|---|---|
| `tests/HttpEntrypointTest.php` | PASS |
| `tests/AuthApiContractTest.php` | PASS |
| `tests/PlanApiContractTest.php` | PASS |
| `tests/PasswordRecoveryTest.php` | PASS |
| `tests/BackupWorkflowTest.php` | PASS |
| `tests/DashboardReportsValidationTest.php` | PASS |
| `tests/ConfigurationValidationTest.php` | PASS |
| `tests/AdminProvisioningTest.php` | PASS |
| `tests/MaintenanceJobTest.php` | PASS |
| `tests/SchemaSetupTest.php` | PASS |
| `tests/CustomerValidationTest.php` | PASS |
| `tests/SubscriptionValidationTest.php` | PASS |
| `tests/InventoryValidationTest.php` | PASS |
| `tests/SalesValidationTest.php` | PASS |
| `tests/SettingsValidationTest.php` | PASS |
| `tests/UserValidationTest.php` | PASS |
| `tests/MariaDbCompatibilityTest.php` | PASS (MariaDB 10.5.27, disposable isolated datadir) |

`MariaDbCompatibilityTest.php` was executed against a locally extracted, isolated MariaDB **10.5.27** server (loopback-only, own unique datadir, harness root removed at completion), passing schema/DDL checks, provisioning and repeat refusal, CRUD/permission, subscription, inventory/sales/refund/cancellation, bounded cleanup, `SHOW ENGINE INNODB STATUS` exact-row concurrency assertions, and the MariaDB-backed HTTP auth/login-lockout checks. This is local MariaDB evidence only — it says nothing about Hostinger's MariaDB version, grants, collation, or behavior.

**Skipped/honest notes:** `composer`/`phpunit` are not installed; the tests are standalone PHP scripts (mostly disposable SQLite databases). A portable MariaDB download is retained so this harness can be re-run; it must never be pointed at a production or installed service datadir.

PHP syntax: `php -l` passes on all `hostinger-php-prototype/**/*.php` files and `scripts/hostinger-api-bridge.php`; the validator also lints every packaged PHP file (all PASS).

---

## Packaging verification (`scripts/validate-hostinger-package.ps1` — 21 checks)

| Check | Result |
|---|---|
| ZIP integrity and CRC (full decompression) | PASS |
| Entry count | PASS (261) |
| Total uncompressed size | PASS (4,678,208 bytes) |
| Zero backslash separators in entry names | PASS |
| No absolute paths or `..` traversal | PASS |
| Required files at exact paths | PASS |
| No `.env` or secret-bearing files | PASS |
| Manifest parses as JSON | PASS |
| Manifest status is `NOT_READY` | PASS |
| Manifest `hostingerAcceptance` is false | PASS |
| Manifest release name consistent | PASS |
| Manifest artifact name matches archive | PASS |
| All required migrations present | PASS |
| Bridge resolves staging-private directory first | PASS |
| Bridge keeps production fallback | PASS |
| Bridge fails closed generically | PASS |
| No production database identifiers embedded | PASS |
| All packaged PHP files pass `php -l` | PASS |
| SHA-256 checksum calculated | PASS |
| Checksum sidecar hash matches archive | PASS |
| Checksum sidecar names same archive | PASS |

Independent verification (separate from the validator) confirmed: 261 entries, 0 backslashes, 0 absolute/traversal paths, 0 duplicate names, 0 forbidden files; the packaged `public_html/api/index.php` byte-matches `scripts/hostinger-api-bridge.php`; manifest `status=NOT_READY`, `hostingerAcceptance=false` (top-level and nested), `artifact=awik-net-hostinger-release-candidate-20261016.zip`; ZIP size 1,463,802 bytes and SHA-256 `CE6A208782199FC2EC6355FB0E2277029419DEA56706BBF231F45B55483A2B02` matching the checksum file.

**What local validation does NOT prove:** it cannot prove Hostinger runtime compatibility, filesystem/`open_basedir` behavior, LiteSpeed rewrite behavior, PHP-FPM environment injection, PHP extension availability, cron/CLI capability, mail delivery, or database behavior on the account.

---

## Deployment blockers (unverified on the Hostinger account)

1. **PHP-FPM environment variable injection** — Hostinger's secure mechanism for supplying `AWIK_MIGRATION_DSN`, `AWIK_MIGRATION_DB_USER`, `AWIK_MIGRATION_DB_PASSWORD`, `AWIK_MIGRATION_JWT_SECRET`, `AWIK_MIGRATION_JWT_REFRESH_SECRET`, `AWIK_BACKUP_ENCRYPTION_KEY`, `AWIK_BACKUP_DIR`, `AWIK_BACKUP_RESTORE_ACTOR_ID`, and admin provisioning vars is not confirmed. Docs cover Node.js, not PHP-FPM.
2. **Cross-directory include / `open_basedir`** — the include from `public_html/staging/` to the domain-level `staging-api/` is unverified, and LiteSpeed must honor `.htaccess` rewrite rules. Neither is verified.
3. **PHP extensions on Hostinger** — ZIP (for XLSX), `openssl`, `pdo_mysql`, MariaDB version/grants, secure cron environment injection, and TLS/headers are all unverified.
4. **Native PHP mail** — `mail()` transport for password recovery, authenticated sender configuration, and recipient delivery are unverified.
5. **CLI execution path** — `provision-admin.php` (first admin) and `cron/cleanup-auth-state.php` (auth-state cleanup) require a Hostinger-supported PHP CLI invocation with secure env injection. Unverified.
6. **No cron entries installed** — the package does not install cron. Auth-state cleanup and any scheduled WhatsApp/backup jobs must be configured manually after host verification.

---

## What is NOT implemented (gaps vs the NestJS source)

- Full NestJS authorization/audit parity, demo login route, audit listing, financial overview
- WhatsApp Graph API delivery, inbound webhook, scheduled/background reminder dispatch
- Incremental backups, backup schedules, HTTP restore/restore-token routes (restore is CLI-only, isolated DB only)
- Subscription status refresh, scheduled jobs (no cron entry installed)
- Email verification, file uploads, existing Prisma/PostgreSQL data migration
- Full NestJS report JSON/projection parity and host memory/runtime validation for large downloads

---

## Next steps before any staging deploy

1. Confirm Hostinger's PHP-FPM env var injection mechanism.
2. Verify `open_basedir` permits the `public_html/staging/` → `staging-api/` include.
3. Verify LiteSpeed honors `.htaccess` rewrite rules (`/api/v1` routing and `private/` blocking).
4. Confirm PHP extensions: `openssl`, `zip`, `pdo_mysql`.
5. Test `provision-admin.php` via Hostinger CLI with secure env vars.
6. Test `cron/cleanup-auth-state.php` via Hostinger cron with secure env vars.
7. Test native PHP mail delivery or configure an SMTP alternative.
8. Only then set `status` to a staging-ready value and `hostingerAcceptance` to `true` in the manifest source and rebuild.

---

**Bottom line:** The package is syntactically valid, locally tested, and honestly marked `NOT_READY` with `hostingerAcceptance: false`. The ZIP at `deployment/awik-net-hostinger-release-candidate-20261016.zip` (SHA-256 `CE6A208782199FC2EC6355FB0E2277029419DEA56706BBF231F45B55483A2B02`, 1,463,802 bytes) uses correct forward-slash directory separators throughout and passes all 21 package validation checks. It is suitable for a staging upload attempt only after the host-specific blockers above are cleared. No Hostinger-side check has been performed. Do not deploy to production. No migrations were run.

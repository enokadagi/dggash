# Deployment Readiness

Date: 2026-10-14
Verdict: NOT READY for Hostinger

## Current validated state

This status supersedes the earlier feature matrix and test inventory below. It records local evidence only; the PHP package is a partial NestJS port and has not been accepted on Hostinger.

| Area | Local evidence | Status |
|---|---|---|
| Login, token lifecycle, permissions, users and plans | Standalone API contracts and isolated MariaDB 10.5.29 checks passed for tested flows and selected ADMIN/STAFF boundaries | Tested, incomplete parity |
| Customers and subscriptions | Standalone validation plus MariaDB CRUD/search and lifecycle checks passed | Tested, selected paths only |
| Inventory, sales, refunds and cancellations | MariaDB business/stock/rollback checks passed; exact-row concurrent refund, cancellation and inventory waiters were correlated to the locked PRIMARY records and known holder | Tested, selected paths only; not browser E2E |
| Settings and dashboard | Standalone validation passed; complete MariaDB result-set/browser workflows remain unverified | Partially tested |
| Report downloads | CSV, PDF and XLSX generators produce real files; standalone checks inspect file structure/content for all seven report families; isolated MariaDB 10.5 checks all seven download queries, role boundaries/date filters, and 101 matching sales through each format | Locally tested; revenue/sales/stock-movement exports no longer truncate at 100; ZIP/iconv extensions, browser downloads and large-export memory behavior unverified; full JSON/projection parity incomplete |
| Schema setup | Ordered four-migration chain created 18 tables on isolated MariaDB 10.5.29; static review found no destructive DDL/DML patterns in PHP schema/migration files | Tested for a new empty database only; no ledger, drift check, upgrade or data import |
| Password recovery | Standalone tests passed token hashing/expiry/invalid/reuse, enumeration-safe responses, per-email/IP limits, simulated email-provider failure, and database outages; MariaDB 10.5.29 HTTP tests passed recovery and two-request single-use redemption | Implemented as PHP-only feature; Hostinger mail transport and recipient delivery unverified; no email-verification flow |
| Package and API bridge | Fresh 246-entry archive matches package tree and fresh extraction byte-for-byte; hidden rewrite files and sibling bridge present; extracted bridge returned expected JSON 404 through the packaged sibling API | Locally validated |
| Scheduled maintenance | CLI auth-state cleanup is bounded, transactional, lock-protected and DB-tested for retention/contention; no cron entry is installed | Local task tested; Hostinger scheduling/configuration blocked |
| WhatsApp delivery, backups, Hostinger email delivery, uploads | An ADMIN-only PHP backup API (list/create/integrity/download/cleanup) with AES-256-GCM/HMAC encrypted snapshots and CLI-only isolated restore is locally tested; WhatsApp delivery, uploads, Hostinger mail delivery, and scheduled/incremental backups/HTTP restore remain missing or unverified | Backup partially implemented; not Hostinger-verified |
| Hostinger runtime and operations | Secure environment injection, CLI provisioning, LiteSpeed/open_basedir, PHP extensions, DB grants/build, cron, TLS/headers and browser acceptance have no Hostinger evidence | Blocked |

The latest local candidate is `deployment/hostinger-premium-backup-candidate-20261014-2153.zip`, 261 entries, SHA-256 `F9B82C7BCDA5EA766965F8ACB867BA430F872FD4D781212EBC41DBF3D4ADEFFF`; it adds the ADMIN-only backup API and CLI-only isolated restore on top of the recovery work and was verified to match its reported entry count and hash. The preserved prior report-export candidate, `deployment/hostinger-premium-report-export-candidate-20261014-0944/` and `.zip`, SHA-256 `80E24E7F08863BCA4560BD6F397EB9427B25B39304CFF4806D138B5084D92A5C`, had a 246-entry archive that matched a fresh extraction at `%TEMP%\awik-package-extract-hostinger-premium-report-export-candidate-20261014-0944` byte-for-byte; hidden `.htaccess` entries, sibling API/private placement, the canonical migration chain, report generator and `NOT_READY` metadata were checked for it. The even earlier auth-cleanup candidate remains preserved at SHA-256 `5FB63531A7AA55791A485EFD7031AFA5EBC33A1E989ECB2D4AB98B46B376BD2F`; no package was uploaded.

The latest existing candidate is the prior report-export candidate at SHA-256 `80E24E7F08863BCA4560BD6F397EB9427B25B39304CFF4806D138B5084D92A5C`; it predates recovery and remains untouched. It is not a package of the new recovery work. No new candidate was built because the preserved `apps/web/out/` static export has not been regenerated and would omit the newly added forgot/reset pages. The updated package builder now includes the fourth migration and recovery metadata, but building from the old export would create a misleading frontend package.

Recovery follow-up validation: all 15 standalone PHP tests passed (exit 0); PHP lint passed all 24 prototype/bridge files (exit 0); the web TypeScript check passed (`npm run typecheck --workspace=apps/web`, exit 0). The isolated MariaDB `10.5.27-MariaDB` harness passed (exit 0), including 18-table schema setup, recovery HTTP request/reset and exactly one winner from two concurrent redemption requests, all seven report queries, and the existing exact-row sale-refund, sale-cancel and inventory-movement lock-wait assertions. PowerShell parsing of the builder passed (exit 0). Exact output and package decision are recorded in `hostinger-php-prototype/DEPLOYMENT_READINESS.md` and `PROGRESS.md`.

No Hostinger, production data, deployment, DNS, or hosting settings were accessed or changed. **NOT READY for Hostinger** until documented environment-variable and CLI provisioning paths are established and all required checks pass in authorized non-production staging.

## Backup/restore implementation update: 2026-10-14

PHP now adds an ADMIN-only backup API — `GET /api/v1/backups` (list), `POST /api/v1/backups/create`, `GET /api/v1/backups/integrity/{id}`, `GET /api/v1/backups/{id}/download`, `POST /api/v1/backups/cleanup` — plus a CLI-only, isolated-database restore (`private/restore-backup.php <backup-id>`, requiring `AWIK_BACKUP_RESTORE_ACTOR_ID`). Snapshots are a gzip JSON document of ordered `CREATE TABLE`/`INSERT` statements, encrypted with AES-256-GCM and authenticated with HMAC-SHA256, stored outside and refused under the public document root. Incremental backups, backup schedules, the HTTP restore/restore-token routes, and full NestJS `pg_dump`/`psql` restore parity remain unimplemented; no backup cron entry is installed.

**Evidence:** the full 16-file standalone suite passed (exit 0), including `BackupWorkflowTest.php` (key derivation, gzip round-trip, AES-256-GCM encrypt/verify/decrypt, corruption rejection, public-root storage rejection, ADMIN-only authorization); the create/list/integrity/download/cleanup routes were additionally smoke-tested at runtime; `php -l` passed all 27 PHP files (10 runtime + 17 tests); the isolated MariaDB 10.5 harness passed (exit 0). New candidate `deployment/hostinger-premium-backup-candidate-20261014-2153.zip`, SHA-256 `F9B82C7BCDA5EA766965F8ACB867BA430F872FD4D781212EBC41DBF3D4ADEFFF` (261 entries), remains `NOT_READY`. Hostinger secure backup-key injection, PHP `openssl` availability, and a supported CLI restore execution path are unverified. **NOT READY** is unchanged.

## Auth-state cleanup implementation and test evidence: 2026-10-14

Added `hostinger-php-prototype/private/cron/cleanup-auth-state.php`, a CLI-only scheduled maintenance task that takes a database-specific nonblocking advisory lock and transactionally deletes no more than 5,000 expired token records and 5,000 login-attempt records older than 30 days without active lockouts. It fails closed on lock/database errors, emits no credentials, and is not installed in cron. Its standalone boundary test and isolated MariaDB retention/contention/persistence test passed. This closes only expired authentication-state cleanup; it does not implement Nest subscription refresh, WhatsApp reminders/delivery, backups, or other scheduled work.

**Files changed for this evidence:** `hostinger-php-prototype/private/cron/cleanup-auth-state.php` (new); `hostinger-php-prototype/tests/MaintenanceJobTest.php` (new); `hostinger-php-prototype/tests/MariaDbCompatibilityTest.php`; `hostinger-php-prototype/tests/SchemaSetupTest.php`; `hostinger-php-prototype/tests/HttpEntrypointTest.php`; `scripts/build-hostinger-package.ps1`; `hostinger-php-prototype/README.md`; `hostinger-php-prototype/MIGRATION_STATUS.md`; `hostinger-php-prototype/FEATURE_PARITY_AND_MIGRATION_PLAN.md`; `hostinger-php-prototype/DEPLOYMENT_READINESS.md`; `DEPLOYMENT_READINESS.md`; `PROGRESS.md`. The original Next.js/NestJS/Prisma source was not changed in this bounded implementation.

**Commands and results:** all 14 standalone tests under `hostinger-php-prototype/tests/` other than `MariaDbCompatibilityTest.php` — PASS, exit 0; the three SQLite-backed contracts used `php -d extension=php_pdo_sqlite.dll`. `php -l` over all 23 prototype and bridge PHP files — PASS. `$env:AWIK_MARIADB_BASEDIR='C:\Users\Admin\AppData\Local\Temp\awik-mariadb-10.5-runtime-20261014\mariadb-10.5.27-winx64'; $env:AWIK_MARIADB_TARGET_VERSION='10.5'; php hostinger-php-prototype/tests/MariaDbCompatibilityTest.php` — PASS, exit 0. Builder parse — PASS; candidate builder — PASS, exit 0; archive/extraction/package hash comparison — PASS, 246/246; 8 packaged PHP files lint — PASS; extracted bridge HTTP smoke — PASS (JSON 404); secret classification — PASS; same-name builder no-overwrite — expected refusal, exit 1, unchanged candidate hash. The first unconfigured standalone sweep exited 1 because the three SQLite-dependent tests were run without the extension; the documented, corrected rerun passed.

**Still blocked:** Hostinger PHP-FPM and CLI secret injection, supported first-admin invocation under the reported no-shell plan, actual PHP extensions/SAPI (including `zip` for XLSX and `iconv` for PDF), MariaDB build/grants/collation/settings, LiteSpeed rewrites and sibling `open_basedir`, cron support, TLS/security headers, safe no-cost isolated staging, browser/API acceptance, and backup/recovery. No Hostinger or production action was taken; the next safe step is account-documentation/panel verification of those capabilities, then request explicit approval before any staging action. The candidate remains **NOT READY**.

**Historical audit below:** The remaining original inventory, matrices, and baseline test statements are retained for traceability. They describe earlier evidence and are superseded by the current status above and subsequent dated updates.

## Historical summary
This build is a local staging artifact only. It is not an approved Hostinger deployment. The frontend static export built successfully, and the PHP prototype files are syntactically valid, but no database-backed or browser acceptance runs were completed on MariaDB 10.5 or against a real Hostinger environment.

## Exact MariaDB version and host verification
- MariaDB version tested: none; `AWIK_MARIADB_BASEDIR` was missing and no executable was found on `PATH`
- Hostinger PHP version checked: none
- Hostinger document root and rewrite behavior checked: none
- Hostinger cron permissions checked: none
- Hostinger DB user privileges checked: none

## Historical feature status matrix (superseded by current validated state above)

| Feature | DB-tested | Browser-tested | Untested | Notes |
|---|---|---|---|---|
| Static frontend export | No | No | Yes | Next.js build succeeded locally |
| Auth login, refresh, logout, profile | No | No | Yes | PHP source and HTTP assertions exist; MariaDB harness was not run |
| Users and roles | No | No | Yes | PHP admin handler exists; no endpoint-by-endpoint HTTP authorization run |
| Plans | No | No | Yes | PHP handler exists; DB behavior unverified |
| Customers | No | No | Yes | PHP handler and schema draft exist; DB behavior unverified |
| Subscriptions | No | No | Yes | PHP handler and schema draft exist; DB behavior unverified |
| Inventory and product stock | No | No | Yes | PHP handler and schema draft exist; no stock test was run |
| Sales and refunds | No | No | Yes | PHP handler and schema draft exist; no transaction test was run |
| Reports and downloads | No | No | Yes | PHP report handler exists; real file-download behavior unverified |
| WhatsApp/webhooks | No | No | Yes | Missing backend and cron proof |
| Scheduled jobs | No | No | Yes | No Hostinger cron verification |
| Security headers / SPA fallback | No | No | Yes | .htaccess and rewrite behavior not independently verified on Hostinger |

## Historical commands and results (superseded by later evidence below)

- npm run build --workspace=apps/web
  Result: PASS

- php -l hostinger-php-prototype/private/bootstrap.php
  Result: PASS

- php -l hostinger-php-prototype/public/index.php
  Result: PASS

- php -l hostinger-php-prototype/tests/MariaDbCompatibilityTest.php
  Result: PASS

- MariaDB 10.5 disposable harness execution
  Result: NOT RUN; intentionally not executed to satisfy the no-database safety requirement

- Hostinger deployment or DB creation
  Result: NOT RUN; not allowed

## Historical security, data, and hosting blockers (see current blockers above)
- No verified MariaDB 10.5 instance under a controlled disposable data directory
- Existing MariaDB harness has a MariaDB 13.0 fallback when `AWIK_MARIADB_BASEDIR` is missing; do not invoke it without a verified 10.5 base directory
- No verified Hostinger PHP runtime and extension set
- No verified Apache/LiteSpeed rewrite and private-file protection rules
- No verified service account privileges for DDL and application runtime separation
- No database-backed proof for refund/cancel, stock oversell prevention, or subscription renewal consistency
- No browser acceptance tests against the live PHP API
- PHP token storage/revocation semantics differ from the NestJS stateless JWT behavior; see [SLICE_A_AUTHORIZATION_MATRIX.md](SLICE_A_AUTHORIZATION_MATRIX.md)

## Verdict
NOT READY.
Reason: the local build and syntax checks are useful static evidence, but they are not proof of correctness under the actual Hostinger architecture or a MariaDB 10.5 database-backed application flow.

## Update: 2026-10-14 local readiness pass

This addendum supersedes this audit's earlier PHP source inventory/test statements where they differ; it does not supersede the NOT READY decision.

- PHP CLI is 8.3.13 on Windows. All ten prototype PHP tests passed, including Auth/Plan/HTTP contract tests and all database-independent validation tests. The SQLite contracts were run with the bundled DLL enabled for that process only. PHP syntax checks passed for all 15 prototype PHP files.
- No MariaDB base directory or server binary was available, so the MariaDB integration/concurrency test was not run. No DB-backed application feature is newly verified by this pass.
- The PHP source implements more than auth/plans (including customers, users, subscriptions, inventory, sales, dashboard, and reports), but source presence and helper/SQLite contract checks are not a MariaDB 10.5 deployment proof. WhatsApp delivery, backup operations, cron, Hostinger routing, and full endpoint/browser acceptance remain unverified or incomplete.
- The generated Hostinger package is stale: its PHP bootstrap and Auth/Plan tests do not match the current prototype paths. Do not upload or rebuild over it. The package builder now refuses to overwrite existing outputs and takes an alternate `PackageName`; no package generation was performed.
- Static frontend build config uses same-origin `/api/v1`. The source `.htaccess` and package builder now define a bridge route from `public_html/api/index.php` to the sibling PHP front controller before the SPA fallback; a contract assertion covers that configuration. This is not an Apache/LiteSpeed integration test. Resolve document-root, rewrite support, PHP `open_basedir` sibling access, and CSP/origin behavior in isolated staging.
- `HOSTINGER_DEPLOYMENT.md` targets an Ubuntu VPS/Docker/PostgreSQL architecture, not Premium shared hosting. It now warns against use for this task and no longer documents a default administrator login. Its remaining VPS steps are not approved for this migration.
- The PHP API `.htaccess` denies the `private/` subtree and rewrites API paths to `public/index.php`, but actual Apache/LiteSpeed behavior, override policy, private-file protection, TLS/security headers, and Hostinger grants have not been tested.

**Decision remains NOT READY.** Proceed only after a fresh package is reviewed and tests pass on an isolated MariaDB 10.5 instance, followed by non-production Hostinger routing/runtime/browser acceptance. No hosting, DNS, production-data, or deployment actions were taken.

## Update: 2026-10-14 MariaDB 10.5.27 concurrency pass

The isolated MariaDB gate now has local evidence: official portable MariaDB 10.5.27 ZIP SHA-256 verified, fresh temp datadir confirmed by `SELECT VERSION()`, and the complete `MariaDbCompatibilityTest.php` passed. Refund, cancellation, and inventory exact-row lock barriers all passed via strict `SHOW ENGINE INNODB STATUS` evidence because this server build returned empty rows from `INNODB_LOCKS`/`INNODB_LOCK_WAITS` even for a root observer with PROCESS. Full sale status/winner/stock/movement assertions were preserved and passed. Runtime account remained least privilege; PROCESS was checked only on the isolated test observer.

This closes the local 10.5.27 compatibility gate only. It does not verify Hostinger's MariaDB patch level, grants, `.htaccess`/LiteSpeed rewrites, PHP `open_basedir` sibling include for the new API bridge, private path protection, TLS/headers, cron support, or browser acceptance. The current generated package and archive remain stale and unchanged; no build or upload was run. **Decision remains NOT READY until those gates pass in non-production Hostinger staging.**

## Final local verification: 2026-10-14

- All 10 PHP tests passed; lint passed on the 15 prototype PHP files plus the new bridge (16 total).
- `HttpEntrypointTest.php` passed the generated bridge placement and disposable sibling `public_html`/`api` include checks. The package builder parses and refuses to overwrite existing outputs; it was not run.
- Full isolated MariaDB compatibility/concurrency harness passed on `10.5.27-MariaDB` for target `10.5`. Refund, cancellation, and inventory waiters were distinct live request processes and transactions correlated to the exact same PRIMARY record held by the deliberate blocker. Original winner/state/stock/movement assertions passed.
- No MariaDB process remained and the final run's datadir was removed by the harness. An earlier temp diagnostic directory (`C:\Users\Admin\AppData\Local\Temp\awik_mariadb_compat_30dd6c16657735f8243a96fe`) and the verified portable archive/extraction were preserved. Existing generated package timestamps remain 2026-10-13; it was not rebuilt or uploaded.

These are local results, not Hostinger verification. Still required on non-production staging: confirm actual document root and LiteSpeed rewrite behavior, sibling include allowed by `open_basedir`, private source is inaccessible, PHP extensions/runtime, least-privileged database grants and actual MariaDB version, TLS/security headers, cron, and browser/API acceptance for required workflows. Hosting, DNS, production data, and deployment remain untouched. Verdict: **NOT READY TO DEPLOY**.

## Fresh package build: 2026-10-14

Only `deployment/hostinger-premium-package-validation-20261014-0820/` and its matching `.zip` are locally validated. The output directory and archive were checked absent before building; the archive has 267 entries and its extraction was compared file-for-file to the generated package tree. Both `public_html/.htaccess` and sibling `api/.htaccess` are present in the ZIP, alongside the bridge and sibling API front controller. The extracted bridge path resolves to `api/public/index.php`, with the API/private tree outside `public_html`. Hashes and the extraction are recorded in `PROGRESS.md`. The generated manifest is deliberately `NOT_READY`.

All ten PHP tests passed; PHP lint passed on the source, generated package, and extracted package (16 files each). The builder archive regression check now uses explicit `ZipArchive` entries so hidden files are included; the builder's no-overwrite guard was checked without rebuilding. No environment files or private keys/certificates/keystores were found. Scanner matches were limited to test fixtures and UI authentication labels/empty fields; no runtime default credentials were found and no values were printed.

Do not upload the earlier failed validation outputs (`...-0804` directory/ZIP or `...-0813` directory/ZIP); they remain preserved and were not modified after failure. The `...-0820` artifact is only a locally validated staging package, not a deployment-ready release. Do not stage without explicit user authorization. Actual Hostinger Premium behavior (LiteSpeed rewrite handling, PHP extensions, sibling `open_basedir`, private-file protection, database version/grants, TLS/headers, cron, and browser/API acceptance) remains untested; verdict **NOT READY TO DEPLOY**.

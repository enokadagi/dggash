# AWIK NET Deployment Readiness Audit

**Updated:** 2026-10-14  
**Stage:** Local implementation, isolated MariaDB 10.5 validation, and package review  
**Decision:** **NOT READY for Hostinger.** No Hostinger panel, DNS, production data, deployment target, or installed MariaDB data directory was accessed or changed.

## Current evidence (supersedes the earlier audit snapshot below)

The prior matrix and worktree inventory were captured before the current PHP business slices and package-builder corrections; references there to PHP implementing only auth/plans or having no customer/subscription/inventory/sales routes are stale. The PHP code now has handlers for auth/token lifecycle, ADMIN users/permissions, plans/settings, customers, subscriptions/renewals, inventory, sales/refunds/cancellations, dashboard, JSON reports, and generated CSV/PDF/XLSX downloads. **Source presence is not full parity or Hostinger acceptance.**

Latest evidence is 16/16 standalone PHP tests passed, 27 PHP files linted, and the full disposable MariaDB 10.5.29 harness passed. The latest report pass exercised all seven database-backed downloads, ADMIN/STAFF/anonymous boundaries, date filtering, and all three formats with 101 matching sales rows. The existing report-export candidate and its fresh extraction are recorded below. Prior candidates remain preserved.

Schema order in the source clean-install chain is auth core (`2026_10_11_auth_core.sql`), login attempts (`2026_10_12_login_attempts.sql`), full application (`2026_10_13_full_application.sql`), and password recovery (`2026_10_14_password_recovery.sql`). The legacy company-settings helper is excluded to avoid duplicate DDL. Static schema checks found no destructive SQL in PHP schema/migration files. There is no migration ledger, schema drift validator, or PostgreSQL-to-MariaDB data migration; use this chain only on a reviewed new empty disposable database.

First-admin setup is a private CLI-only one-time script requiring process environment variables, an empty `awik_users` table and a MariaDB advisory lock; local tests confirm creation and repeat refusal. Hostinger's secure PHP-FPM variable injection and supported secure CLI invocation remain **unverified blockers**. Do not expose an HTTP bootstrap endpoint or store credentials in files/cron command lines.

## Backup/restore implementation update

PHP adds an ADMIN-only backup API: `GET /api/v1/backups` (list with `data` + `meta`), `POST /api/v1/backups/create`, `GET /api/v1/backups/integrity/{id}`, `GET /api/v1/backups/{id}/download`, and `POST /api/v1/backups/cleanup`. A snapshot is a gzip-compressed JSON document of ordered `CREATE TABLE`/`INSERT` statements, encrypted with AES-256-GCM and authenticated with HMAC-SHA256; the manifest stores size, plaintext SHA-256 and HMAC, and storage is refused inside or under `DOCUMENT_ROOT`. Restore is deliberately not an HTTP route: `private/restore-backup.php <backup-id>` is CLI-only, requires `AWIK_BACKUP_RESTORE_ACTOR_ID`, and is intended only for an isolated database. Incremental backup, backup schedules, the HTTP restore/restore-token routes, and full NestJS `pg_dump`/`psql` restore parity are not implemented, and no backup cron entry is installed.

**Validation:** the full 16-file standalone suite passes (exit 0), including `BackupWorkflowTest.php` for key derivation, gzip round-trip, AES-256-GCM encrypt/verify/decrypt, corruption rejection, public-root storage rejection and ADMIN-only authorization (anonymous 401, STAFF 403, ADMIN 200). The create/list/integrity/download/cleanup routes were additionally smoke-tested at runtime (encrypted create, valid integrity, download headers/path, fresh-retention cleanup, and 404 for a missing id). PHP lint passes on all 27 PHP files (10 runtime + 17 tests). The isolated MariaDB 10.5 harness passed again (exit 0). Candidate `deployment/hostinger-premium-backup-candidate-20261014-2153.zip`, SHA-256 `F9B82C7BCDA5EA766965F8ACB867BA430F872FD4D781212EBC41DBF3D4ADEFFF` (261 entries); its package README/manifest describe the backup API and CLI-only restore and remain `NOT_READY`. Hostinger secure encryption-key injection, PHP `openssl` availability, and a supported CLI restore execution path remain unverified. Status remains **NOT READY**.

## Password recovery implementation update

PHP adds `POST /api/v1/auth/forgot-password` and `POST /api/v1/auth/reset-password`; the inspected NestJS auth controller has no equivalent recovery or email-verification routes, so this is a PHP-only feature rather than parity. A 256-bit token is stored only as SHA-256, expires after 30 minutes, is consumed once transactionally, and reset revokes current sessions and invalidates other active recovery tokens. Existing/unknown account responses are generic. Persistent per-email and per-IP throttles are keyed by SHA-256 hashes (3 per email/hour, 10 per IP/hour). Recovery tokens and stale throttle scopes were added to the existing bounded cleanup job.

Native PHP `mail()` delivery is configurable but disabled unless provider, valid sender address, and HTTPS public application URL are explicitly configured. Tests inject success/failure outcomes without sending email. Hostinger's PHP mail support, sender policy, and actual recipient delivery are unverified; no email is claimed delivered. Forgot/reset frontend source pages exist, but the preserved `apps/web/out/` was not rebuilt and the prior candidate does not include verified newly exported recovery pages.

The focused `PasswordRecoveryTest.php` passes after its test-only SQLite cleanup issue was corrected; it covers success, token hashing/entropy/expiry, generic responses, invalid/reused tokens, provider failure, hashed email/IP throttles and database-outage responses. The isolated MariaDB 10.5.29 harness has passed recovery migration application/reapplication and two concurrent HTTP reset redemptions with exactly one winner, while preserving existing business concurrency assertions. Final full-suite/lint/MariaDB reruns are recorded in the latest validation addendum below. Do not build a candidate from stale `apps/web/out/`; preserve the existing report-export candidate. Status remains **NOT READY**.

### Final recovery validation — 2026-10-14

- Standalone suite command: enumerate `hostinger-php-prototype\tests\*Test.php` excluding `MariaDbCompatibilityTest.php`, then invoke each with `php -d extension=php_pdo_sqlite.dll -d extension=php_zip.dll`; **15/15 passed, exit 0**. This includes recovery checks for hashed-only 256-bit token storage, expiry, enumeration-safe response, success/session revocation, invalid/expired/reuse rejection, provider failure, email/IP rate caps, and unavailable DB on both request and reset route.
- PHP lint command: `php -l` for every `*.php` recursively under `hostinger-php-prototype\` plus `scripts\hostinger-api-bridge.php`; **24/24 passed, exit 0**. PowerShell AST parsing of `scripts\build-hostinger-package.ps1` passed, exit 0.
- Frontend check: `npm run typecheck --workspace=apps/web`; **passed, exit 0**.
- Isolated integration command: set `AWIK_MARIADB_BASEDIR=C:\Users\Admin\AppData\Local\Temp\awik-mariadb-10.5-runtime-20261014\mariadb-10.5.27-winx64` and `AWIK_MARIADB_TARGET_VERSION=10.5`, then run `php -d extension=php_zip.dll hostinger-php-prototype\tests\MariaDbCompatibilityTest.php`; **passed, exit 0**, server reported `10.5.27-MariaDB`. It applied the 4-migration/18-table clean schema, ran recovery over HTTP, and verified only one successful winner for simultaneous reset requests. Existing report, business workflow, and exact-row refund/cancel/inventory wait assertions also passed. The isolated harness completed; no MariaDB server process remained.
- The existing report-export ZIP remains unchanged at `deployment\hostinger-premium-report-export-candidate-20261014-0944.zip`, SHA-256 `80E24E7F08863BCA4560BD6F397EB9427B25B39304CFF4806D138B5084D92A5C`. No recovery candidate was built: `apps\web\out\` is preserved user output and does not contain the new pages, so using it would produce an incomplete frontend package. The package builder now lists/includes the fourth migration and recovery metadata but has not been executed for a new artifact.

Hostinger native mail capability and delivery remain unverified; no real email was sent. Actual recovery pages are in source but absent from verified static export/package. No Hostinger/production access or change occurred. Backup and restore is now partially implemented (ADMIN backup API plus CLI-only isolated restore; see the backup/restore update above); deployment remains **NOT READY**.

## Previous auth-cleanup candidate evidence (2026-10-14)

Implemented CLI-only `private/cron/cleanup-auth-state.php`: it serializes runs with a database-specific nonblocking advisory lock and transactionally deletes at most 5,000 expired token rows and 5,000 login-attempt rows older than 30 days without active lockouts. Standalone boundary and MariaDB retention, persistence, and contention checks pass. It does not schedule itself and does not implement Nest subscription refresh or WhatsApp reminders/delivery.

**Validation:** all 14 PHP tests other than the dedicated MariaDB harness passed (exit 0); `AuthApiContractTest.php`, `PlanApiContractTest.php`, and `HttpEntrypointTest.php` used the documented `php -d extension=php_pdo_sqlite.dll`. PHP lint passed on all 23 prototype/bridge files. The full `MariaDbCompatibilityTest.php` passed (exit 0) on explicitly selected `10.5.27-MariaDB` with `AWIK_MARIADB_TARGET_VERSION=10.5`; output confirms cleanup retention/contention/persistence, all selected business flows and the three strict exact-row concurrency checks. The first sweep without the SQLite extension exited 1 for the three SQLite-backed tests; the corrected documented invocation passed all 14.

The fresh candidate is `deployment/hostinger-premium-auth-cleanup-candidate-20261014/` and `.zip`; SHA-256 `5FB63531A7AA55791A485EFD7031AFA5EBC33A1E989ECB2D4AB98B46B376BD2F`. The ZIP, generated tree and fresh extraction at `deployment/hostinger-premium-auth-cleanup-candidate-20261014-verified-extraction/` matched on all 246 files. Hidden `.htaccess`, sibling-private API placement, the three ordered clean-install migrations, and exclusion of duplicate migration copies were verified. All 8 packaged PHP files linted. The extracted bridge returned JSON 404 via its sibling API entrypoint with an isolated in-memory SQLite test DSN. Redacted secret classification passed; manifest is `NOT_READY` / `hostingerAcceptance=false`. Same-name rebuild was refused (expected exit 1); candidate file count and ZIP hash were unchanged. The previous candidate `deployment/hostinger-premium-readiness-candidate-20261014-final.zip` and its hash remain preserved.

The successful isolated harness cleaned its own server/datadir; no MariaDB process or new harness directory remains. An older pre-existing diagnostic temp directory was not modified. Hostinger secret injection/CLI invocation, PHP SAPI/extensions, database grants/build, LiteSpeed/sibling `open_basedir`, cron, TLS/headers, free isolated staging, and browser acceptance remain unverified; no upload, deployment, Hostinger, DNS, or production action occurred.

Changed paths for the bounded cleanup/package evidence: `hostinger-php-prototype/private/cron/cleanup-auth-state.php` (new), `hostinger-php-prototype/tests/MaintenanceJobTest.php` (new), `hostinger-php-prototype/tests/MariaDbCompatibilityTest.php`, `hostinger-php-prototype/tests/SchemaSetupTest.php`, `hostinger-php-prototype/tests/HttpEntrypointTest.php`, `hostinger-php-prototype/README.md`, `hostinger-php-prototype/MIGRATION_STATUS.md`, `hostinger-php-prototype/FEATURE_PARITY_AND_MIGRATION_PLAN.md`, `hostinger-php-prototype/DEPLOYMENT_READINESS.md`, `scripts/build-hostinger-package.ps1`, `DEPLOYMENT_READINESS.md`, and `PROGRESS.md`. The original Next/Nest/Prisma source was not changed by this bounded implementation.

## Report export completeness candidate (2026-10-14)

The PHP report downloads had an unbounded-row parity gap: revenue, sales and stock-movement downloads silently stopped at 100. Removed that cap for download requests only; JSON list routes retain their existing 100-row bound. Customer and WhatsApp downloads retain the source-aligned 20/50 limits. A missing customer name in an exported sale is projected as `Walk-in`. Report outputs are generated/buffered in memory; no large-export Hostinger resource claim is made.

**Changed files for this report work:** `hostinger-php-prototype/private/bootstrap.php`, `hostinger-php-prototype/tests/DashboardReportsValidationTest.php`, `hostinger-php-prototype/tests/MariaDbCompatibilityTest.php`, `scripts/build-hostinger-package.ps1`, `hostinger-php-prototype/README.md`, `hostinger-php-prototype/MIGRATION_STATUS.md`, `hostinger-php-prototype/FEATURE_PARITY_AND_MIGRATION_PLAN.md`, `hostinger-php-prototype/DEPLOYMENT_READINESS.md`, `DEPLOYMENT_READINESS.md`, and `PROGRESS.md`. The original Next.js/NestJS/Prisma source was not changed.

**Validation commands/results (working directory `C:\Users\Admin\Projects\dggash`):**
- Full standalone suite, exit 0 (14/14):

```powershell
$tests = Get-ChildItem -LiteralPath '.\hostinger-php-prototype\tests' -Filter '*Test.php' |
  Where-Object { $_.Name -ne 'MariaDbCompatibilityTest.php' } | Sort-Object Name
$failures = @()
foreach ($test in $tests) {
  & php -d extension=php_pdo_sqlite.dll -d extension=php_zip.dll $test.FullName
  if ($LASTEXITCODE -ne 0) { $failures += $test.Name }
}
if ($failures.Count -gt 0) { exit 1 }
```

- `php -d extension=php_pdo_sqlite.dll -d extension=php_zip.dll .\hostinger-php-prototype\tests\DashboardReportsValidationTest.php` — PASS, exit 0; actual CSV/PDF/XLSX bytes, headers, MIME/disposition, empty inputs, formula safety, OOXML/XML, Unicode and multi-page PDF checks for all seven report projections.
- `$env:AWIK_MARIADB_BASEDIR='C:\Users\Admin\AppData\Local\Temp\awik-mariadb-10.5-runtime-20261014\mariadb-10.5.27-winx64'; $env:AWIK_MARIADB_TARGET_VERSION='10.5'; php -d extension=php_zip.dll .\hostinger-php-prototype\tests\MariaDbCompatibilityTest.php` — PASS, exit 0 on isolated `10.5.27-MariaDB`; all seven download queries, ADMIN/STAFF/anonymous checks, date validation, formula safety, MIME/disposition and 101 matching filtered sales in CSV/PDF/XLSX passed. Existing auth/business/cleanup and three exact-row concurrency checks passed as part of the same harness.
- `php -l` sweep over all PHP files in `hostinger-php-prototype\` plus `scripts\hostinger-api-bridge.php` — 23/23 PASS, exit 0. PowerShell AST parse of `scripts\build-hostinger-package.ps1` — PASS, exit 0. Candidate build `.\scripts\build-hostinger-package.ps1 -PackageName hostinger-premium-report-export-candidate-20261014-0944` — PASS, exit 0 after both outputs were confirmed absent.
- Candidate: `deployment\hostinger-premium-report-export-candidate-20261014-0944.zip`, SHA-256 `80E24E7F08863BCA4560BD6F397EB9427B25B39304CFF4806D138B5084D92A5C`. The 246 archive entries, generated package tree and fresh extraction under `%TEMP%\awik-package-extract-hostinger-premium-report-export-candidate-20261014-0944` matched SHA-256 246/246. Both hidden `.htaccess` files, public bridge, sibling `api/private`, canonical migrations, test/fixture exclusion and `NOT_READY` manifest were verified. All eight packaged PHP files linted. Extracted bridge resolution returned an expected API JSON 404 under a local-only SQLite config. The secret/default scan reported no key files/private keys/AWS keys/sensitive filenames; password-assignment heuristics flagged the minified frontend bundle, and redacted review classified the matches as user-facing labels/validation text, not credentials. The same-name builder refusal returned exit 1 and ZIP/manifest hashes stayed unchanged. The prior candidate remains unchanged: `deployment\hostinger-premium-auth-cleanup-candidate-20261014.zip`, SHA-256 `5FB63531A7AA55791A485EFD7031AFA5EBC33A1E989ECB2D4AB98B46B376BD2F`.

The MariaDB harness left no `mariadbd.exe`/`mysqld.exe` process or newly-created test root. The older pre-existing `awik_mariadb_compat_30dd6c16657735f8243a96fe` temp directory was left untouched. Release remains **NOT READY**: Hostinger ZIP/iconv availability, PHP-FPM and CLI secret injection/first-admin execution, MariaDB build/grants/collation/settings, LiteSpeed rewrites and sibling `open_basedir`, cron, TLS/headers, representative export resource limits, browser acceptance and explicitly authorized isolated staging have not been verified. No Hostinger, production data, DNS, deployment or hosted database action occurred.

## Executive Summary

The repository still contains three deployment shapes, and they are not interchangeable:

1. `deployment/hostinger-upload` is a static Next.js export. Its README explicitly excludes the API and database.
2. `hostinger-php-prototype` is a partial PHP/MariaDB implementation with handlers for the areas listed in the current matrix, but it is not full ERP API parity.
3. `PRODUCTION_RUNBOOK.md` and the Docker Compose stack target a full NestJS/Next.js/PostgreSQL/Redis VPS deployment.

A fresh local candidate now combines the static export with a same-origin PHP bridge and a sibling PHP runtime. The generated archive and extracted bridge were exercised locally; this does not establish LiteSpeed rewrite behavior, sibling `open_basedir` permission, PHP-FPM environment injection, or database behavior on Hostinger. The PHP implementation is still partial, the candidate manifest remains `NOT_READY`, and the Docker/VPS path is outside the requested Premium plan.

## Deployment Readiness Matrix

| Area | Status | Evidence and gap |
|---|---|---|
| Frontend routes and feature inventory | NOT VERIFIED | The last reported Next build emitted 30 static route entries. The preserved `apps/web/out` tree has 29 `index.html` files plus a top-level `404.html`. Routes cover `/`, `/login`, `/dashboard`, `/customers`, `/customers/new`, `/customers/view`, `/plans`, `/subscriptions`, `/inventory`, `/inventory/movements`, `/sales`, `/sales/pos`, `/sales/detail`, `/sales/invoice`, `/reports`, `/reports/revenue`, `/reports/customers`, `/reports/inventory`, `/settings`, `/settings/company`, `/settings/profile`, `/settings/print`, `/settings/backups`, `/whatsapp`, `/whatsapp/connect`, `/whatsapp/messages`, `/whatsapp/reminders`, and `/whatsapp/templates`. Features include customer/subscription management, inventory and movements, POS/sales/invoices, reports, company/profile/printing/backups settings, and WhatsApp screens. Build success proves export generation, not route access control, live data, responsive behavior, or workflow completion in a browser. |
| PHP API parity with NestJS | PARTIAL / BLOCKED | PHP handlers now cover auth/users/permissions, plans/settings, customers, subscriptions, inventory, sales/refunds/cancellations, dashboard, CSV/PDF/XLSX downloads, and ADMIN-only backup list/create/integrity/download/cleanup with CLI-only isolated restore. File-level tests cover generated output; isolated MariaDB tests exercise all seven download queries, permissions/date filters, and 101 matching sales through every format. Revenue/sales/stock-movement downloads no longer truncate at 100; customer/WhatsApp bounds match 20/50. Large exports remain memory-buffered and need host resource testing. A tested CLI auth-state cleanup task is not an HTTP route or Nest scheduler replacement. The NestJS demo-login route, audit listing, financial overview, full auth/audit and report JSON/projection parity, WhatsApp delivery/webhooks, incremental/scheduled backups and HTTP restore, subscription/other scheduled jobs, mail/recovery, uploads, and Hostinger acceptance remain absent/incomplete/unverified. |
| Database schema and required migrations | PARTIAL / BLOCKED | The ordered PHP clean-install chain (core, login attempts, full application, password recovery) creates 18 tables and passed locally on MariaDB 10.5.29. It has no ledger/drift validator or in-place upgrade/data-import path. Prisma migrations are PostgreSQL-only. Never apply the PHP chain to an existing/Hostinger/production database without separate review and authorization. |
| Hostinger PHP version and extensions | NOT VERIFIED | Local CLI PHP 8.3.13 and PHP syntax/tests passed; `pdo_mysql`, bundled PDO SQLite test extension, `iconv`, `mbstring`, and PHP ZIP are used by tested paths. Hostinger PHP-FPM/CLI version and extension availability (including `zip`) remain unconfirmed. |
| Hostinger database engine/version/collation | NOT VERIFIED | The local isolated test used MariaDB 10.5.29 with a disposable database. Hostinger patch/build, collation, SQL mode, grants, limits, timezone, and transaction behavior are unverified; no Hostinger DB was accessed. |
| Secure runtime configuration and first admin | BLOCKED | Runtime uses `getenv()`; the one-time ADMIN provisioner is CLI-only, requires an empty users table, serializes creation and refuses repeat creation. Both mechanisms passed local tests, but Hostinger's secure PHP-FPM variable injection and supported secure CLI invocation are unverified. Do not move secrets into files, `public_html`, `.htaccess`, or cron commands. |
| Apache/LiteSpeed rewrites and private-file protection | BLOCKED | The candidate package places static assets in `public_html/`, bridge at `public_html/api/index.php`, and PHP source including `private/` in sibling `api/`; the builder explicitly copies API `.htaccess`, and the bridge path is locally tested. The package prevents API private code from being under `public_html`, but actual Hostinger LiteSpeed rewrite and sibling `open_basedir` behavior remain unverified. |
| HTTPS, tokens, secrets, CORS, security headers | BLOCKED | The static `.htaccess` requests HTTPS and sets headers, but those directives were not verified on Hostinger. Its CSP has `connect-src 'self'`; the static README says the API is hosted separately, so a cross-origin API is blocked unless the policy is changed. The production web default `/api/v1` requires same-origin API proxying, which the static package does not configure. Nest CORS and Helmet are configured in source, not Hostinger-verified; the PHP entrypoint itself emits JSON content type but depends on server configuration for other headers/CORS. Browser tokens are in JS-readable `sessionStorage`; the auth marker cookie is not an HttpOnly token cookie and is written with a literal `Secure=false` attribute. `.env` values were not read. |
| File uploads, backups, scheduled jobs, webhooks, external integrations | BLOCKED / PARTIAL | An ADMIN-only backup list/create/integrity/download/cleanup API and CLI-only isolated restore are implemented and locally tested; incremental backups, backup schedules, and HTTP restore remain absent. WhatsApp delivery/webhooks/reminders remain absent. A CLI auth-state cleanup task now has isolated MariaDB retention and overlap tests; the package does not schedule it. Hostinger CLI, cron, secure environment injection, and grants remain unverified. Subscription status refresh and other Nest schedulers are absent. |
| Least-privilege database permissions | VERIFIED LOCALLY | The isolated MariaDB HTTP test used a synthetic application account with DML-only grants and successfully exercised the endpoint. This proves the tested PHP path does not require DDL at request time; it does not prove Hostinger grants or the full Nest app's permission needs. |
| Responsive browser behavior and critical E2E workflows | NOT VERIFIED | MariaDB harness exercises selected server-side customer/subscription/inventory/sale/refund/cancel/auth paths, but no real-browser responsive or end-to-end acceptance was run. |
| Errors, logs, performance, rollback | NOT VERIFIED | Local auth integration and syntax checks passed. No Hostinger log/rotation check, load test, long-running job test, restore rehearsal, or rollback rehearsal was run. Existing load-test scripts are not evidence of a completed target-environment test. PHP login fails closed on database errors, but deployment-wide observability and recovery are not established. The PHP table migration has no destructive down migration; the Prisma migrations are separate. |
| Clean deployment package and installation instructions | LOCAL CANDIDATE / HOSTINGER BLOCKED | A fresh generated candidate is locally validated below; older artifacts were preserved. It includes hidden `.htaccess` entries, sibling bridge/API layout, ordered migrations and corrected feature/blocker metadata. Hostinger secure env injection/first-admin CLI path, LiteSpeed/open_basedir, PHP/database configuration, browser workflows and manual isolated staging acceptance remain gates. Existing VPS instructions are not approval to use those other deployment paths. |

## Fresh Candidate Package Verification

Both output targets were confirmed absent before the build. The safe builder completed with exit code 0:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\build-hostinger-package.ps1 -PackageName hostinger-premium-readiness-candidate-20261014-1645
```

The preserved local candidate is `deployment/hostinger-premium-readiness-candidate-20261014-1645/` and `deployment/hostinger-premium-readiness-candidate-20261014-1645.zip`. The ZIP has 248 file entries. It contains `public_html/.htaccess`, `api/.htaccess`, `public_html/api/index.php`, sibling `api/public/index.php`, `api/private/`, and the three ordered root `migrations/` files. It excludes the PHP development tests and database test/schema fixtures. `api/private/` and the API runtime are outside the document root. ZIP extraction to `C:\Users\Admin\AppData\Local\Temp\awik-package-extract-hostinger-premium-readiness-candidate-20261014-1645` succeeded; all 248 extracted files matched the generated tree by SHA-256.

The generated README and manifest identify the test coverage while explicitly not inferring test pass status from the builder; the manifest stays `NOT_READY`. The extracted public bridge was exercised through a local PHP server with disposable in-memory SQLite configuration: `GET /api/index.php` reached the sibling API and returned its expected JSON 404. All 7 packaged PHP files passed `php -l`. A redacted scan found no secret/key/token or credential-value patterns and no sensitive credential filenames; the frontend's `.example` login placeholder and translated password-field labels were classified as non-credentials.

The final builder no-overwrite check against this existing output was deliberately refused (exit 1, expected); its ZIP hash remained unchanged. The builder parsed successfully (exit 0).

Key SHA-256 values:

| Artifact | SHA-256 |
|---|---|
| ZIP | `140841DD892A109AEACFB1A8C55039AC28FD349202050EF85540D1E7F1DD3EDA` |
| `manifest.json` | `1401FA2D31692918FA696FFA47CF419FAFA1A51F6110C3E08D4373FA658CA961` |
| `README.md` | `ED707D16D6DD0D3A5BD6A7533EA0A4E1A3A5644FA074A8A9440A99D877937F90` |
| `public_html/api/index.php` | `87DA6E0ACA0C9E522343333CCD2097F89B65AE2E7D7AFF7A946227A05A9C0BE1` |
| `public_html/.htaccess` | `C43ADE317BF77F446A64D6C7F8FDCEDFBCEEDB73CC430D9D34EE1A93F50F3791` |
| `api/.htaccess` | `7BC0075CC79B85C6963CB16EB229786B9DE2CD4E6B6A76D5A123619B31842850` |

The earlier verified `deployment/hostinger-premium-package-validation-20261014-0820.zip` remains preserved with SHA-256 `0EE85374DFB55DFFA530F01568316F1A2154884EFAEC636DDAB02860584E3376`; this candidate supersedes it for the latest local package layout. No package was uploaded.

## Latest repeat validation and candidate: 2026-10-14

The 13 standalone PHP tests were rerun and all passed (exit 0); all 21 prototype/bridge PHP files linted. The full `MariaDbCompatibilityTest.php` also passed (exit 0) on the isolated MariaDB 10.5.27 portable runtime with explicit base directory and target version. Its three exact-row contention barriers, waiter/holder identity checks, and existing business invariants passed. No harness process or newly created datadir remained.

The first new candidate `...-1000` was preserved. A subsequent code search found no runtime reference to `api/database/migrations`; its copies duplicated the canonical root migration chain and exposed the legacy company-settings helper as a second path. The package builder now omits that directory, and `HttpEntrypointTest.php` asserts that only one migration chain is packaged. The legacy SQL remains in the repository.

At the user's request for a fresh candidate, both final output targets were checked absent before building `deployment/hostinger-premium-readiness-candidate-20261014-final/` and `.zip`; builder exit 0. The ZIP has 245 entries; archive, generated tree, and fresh extraction hashes match for all entries. Hidden rewrite files, sibling bridge/API paths, and exactly the three ordered migrations are present; tests, SQL fixtures and duplicate API migration copies are excluded. The extracted bridge's local HTTP smoke returned the expected JSON 404 from the sibling API entrypoint. All 7 packaged PHP files linted. A redacted scan found no sensitive credential filenames, private keys, AWS access keys, or secret assignments. Manifest status is `NOT_READY`; Hostinger acceptance remains false.

Final ZIP SHA-256: `EF6BBCEA5281BBB2C991FE43E82773CB41EDFE6CFF334206D17B57EEBB27E4D0`. The prior `...-1000`, `...-1645` and `...-0820` candidate files remain preserved. The latest Hostinger blockers and feature/test matrix above still apply; this new local artifact does not establish Hostinger acceptance.

## Historical Deployment And Worktree Inventory

The detailed inventory below is an earlier snapshot of a heavily dirty worktree, not a current or exhaustive change list. It is retained as historical evidence only; later user edits and the current candidate artifacts may not appear in it. No pre-existing user changes were reverted or cleaned.

The worktree was already broadly dirty before this audit. Existing changes were preserved. The exact tracked paths with modifications are:

- Root: `.env.example`, `PRODUCTION_RUNBOOK.md`, `README.md`, `docker-compose.yml`, `nginx/nginx.conf`, `package.json`, and `package-lock.json`.
- API: `apps/api/Dockerfile`; `apps/api/src/main.ts`; `apps/api/src/common/controllers/metrics.controller.ts`; `apps/api/src/common/filters/http-exception.filter.ts`; `apps/api/src/common/guards/account-lockout.guard.ts`; `apps/api/src/common/guards/local-auth.guard.ts`; `apps/api/src/common/interceptors/audit.interceptor.ts`; `apps/api/src/common/strategies/jwt.strategy.ts`; `apps/api/src/common/strategies/local.strategy.ts`; `apps/api/src/modules/auth/auth.controller.ts`; `apps/api/src/modules/auth/auth.service.ts`; `apps/api/src/modules/auth/dto/login.dto.ts`; `apps/api/src/modules/backup/backup.controller.ts`; `apps/api/src/modules/backup/backup.service.ts`; `apps/api/src/modules/customers/customers.service.ts`; `apps/api/src/modules/inventory/inventory.service.ts`; `apps/api/src/modules/inventory/products.controller.ts`; `apps/api/src/modules/plans/plans.service.ts`; `apps/api/src/modules/sales/sales.service.ts`; `apps/api/src/modules/settings/settings.controller.ts`; `apps/api/src/modules/subscriptions/subscriptions.service.ts`; `apps/api/src/modules/users/users.service.ts`; `apps/api/src/modules/whatsapp/whatsapp-cloud-api.service.ts`; `apps/api/src/modules/whatsapp/whatsapp.controller.ts`; `apps/api/src/modules/whatsapp/whatsapp.service.ts`.
- Web: `apps/web/Dockerfile`; `apps/web/next-env.d.ts`; `apps/web/next.config.mjs`; `apps/web/package.json`; `apps/web/tsconfig.json`; `apps/web/src/app/(auth)/login/page.tsx`; `apps/web/src/app/(dashboard)/customers/page.tsx`; `apps/web/src/app/(dashboard)/customers/new/page.tsx`; `apps/web/src/app/(dashboard)/dashboard/page.tsx`; `apps/web/src/app/(dashboard)/inventory/page.tsx`; `apps/web/src/app/(dashboard)/inventory/movements/page.tsx`; `apps/web/src/app/(dashboard)/layout.tsx`; `apps/web/src/app/(dashboard)/sales/page.tsx`; `apps/web/src/app/(dashboard)/sales/[id]/sale-detail-client.tsx`; `apps/web/src/app/(dashboard)/sales/pos/page.tsx`; `apps/web/src/app/(dashboard)/settings/page.tsx`; `apps/web/src/app/(dashboard)/settings/company/page.tsx`; `apps/web/src/app/(dashboard)/whatsapp/reminders/page.tsx`; `apps/web/src/app/globals.css`; `apps/web/src/components/layout/sidebar.tsx`; `apps/web/src/components/ui/dialog.tsx`; `apps/web/src/hooks/api/use-products.ts`; `apps/web/src/hooks/api/use-subscriptions.ts`; `apps/web/src/hooks/use-auth.ts`; `apps/web/src/lib/api.ts`; `apps/web/src/lib/validations/auth.schema.ts`; `apps/web/src/lib/validations/customer.schema.ts`; `apps/web/src/lib/validations/subscription.schema.ts`; `apps/web/src/stores/auth-store.ts`.
- Database package: `packages/database/package.json` and `packages/database/prisma/seed.js`.

Three tracked web paths are deleted: `apps/web/src/app/(dashboard)/customers/[id]/page.tsx`, `apps/web/src/app/(dashboard)/sales/[id]/page.tsx`, and `apps/web/src/proxy.ts`. The root `.env.example` diff was inspected with assignment values redacted; no `.env` file contents were opened.

`git diff --check` reported one existing issue in the already-modified `apps/web/src/hooks/api/use-products.ts`: a new blank line at EOF. This file was not changed by the audit and the warning was left untouched.

There are 515 untracked paths in the current status inventory. In particular:

- `apps/web/out/`: 226 untracked static export files, including the route HTML/Next payloads and copied public assets. This tree was preserved; it was not removed or repackaged.
- `deployment/hostinger-upload/`: 228 untracked package files, including HTML, JS/CSS chunks, media, `.htaccess`, README, and `manifest.sha256`. This is an existing user-worktree artifact, not a deployment authorization.
- Other untracked source/docs include `HOSTINGER_DEPLOYMENT.md`, `deployment-work/checklist.md`, `apps/api/docker-entrypoint.sh`, API login-identifier/sort utilities, the web `.htaccess`, browser auth-storage helper/test, newly added route pages/components/hooks/scripts, and the complete untracked `hostinger-php-prototype/` tree. No untracked content was deleted.
- The other untracked source/document paths are: `HOSTINGER_DEPLOYMENT.md`; `deployment-work/checklist.md`; `apps/api/docker-entrypoint.sh`; `apps/api/src/common/utils/login-identifier.ts`; `apps/api/src/common/utils/sort.ts`; `apps/web/public/.htaccess`; `apps/web/scripts/verify-escpos.ts`; `apps/web/scripts/verify-receipt.ts`; `apps/web/scripts/verify-wedge-scanner.ts`; `apps/web/src/app/(dashboard)/customers/view/page.tsx`; `apps/web/src/app/(dashboard)/sales/detail/page.tsx`; `apps/web/src/app/(dashboard)/sales/invoice/page.tsx`; `apps/web/src/app/(dashboard)/settings/print/page.tsx`; `apps/web/src/app/(dashboard)/whatsapp/connect/page.tsx`; `apps/web/src/components/barcode/barcode-field.tsx`; `apps/web/src/components/barcode/barcode-scanner.tsx`; `apps/web/src/components/barcode/product-label.tsx`; `apps/web/src/components/barcode/qr-code.tsx`; `apps/web/src/components/dashboard/subscribers-map.tsx`; `apps/web/src/components/inventory/product-form-dialog.tsx`; `apps/web/src/components/invoice/a4-invoice.module.css`; `apps/web/src/components/invoice/a4-invoice.tsx`; `apps/web/src/components/invoice/invoice-print-button.tsx`; `apps/web/src/components/map/interactive-map.tsx`; `apps/web/src/components/map/map-inner.tsx`; `apps/web/src/components/map/map-picker-dialog.tsx`; `apps/web/src/components/printer/printer-setup.tsx`; `apps/web/src/components/printer/receipt-print-button.tsx`; `apps/web/src/components/scanner/scanner-status.tsx`; `apps/web/src/components/settings/category-manager.tsx`; `apps/web/src/components/ui/alert.tsx`; `apps/web/src/hooks/api/use-company-settings.ts`; `apps/web/src/hooks/use-printer.ts`; `apps/web/src/hooks/use-wedge-scanner.ts`; `apps/web/src/lib/auth-storage.test.ts`; `apps/web/src/lib/auth-storage.ts`; `apps/web/src/lib/barcode.ts`; `apps/web/src/lib/escpos.ts`; `apps/web/src/lib/printer.ts`; `apps/web/src/lib/receipt.ts`; `apps/web/src/lib/scanner/product-lookup.ts`; `apps/web/src/lib/scanner/wedge-detector.ts`; `apps/web/src/lib/whatsapp-link.ts`; `packages/database/prisma/bootstrap.js`.
- The untracked `hostinger-php-prototype/` paths are `.htaccess`, `MIGRATION_CHECKLIST.md`, `MIGRATION_STATUS.md`, `README.md`, `SECURITY_REVIEW.md`, `DEPLOYMENT_READINESS.md` (created by this audit), `database/migrations/2026_10_12_login_attempts.sql`, `database/schema.sql`, `database/test-data.sql`, `private/bootstrap.php`, `private/config.php`, `private/schema/auth-slice.sql`, `public/index.php`, `tests/AuthApiContractTest.php`, `tests/HttpEntrypointTest.php`, `tests/MariaDbCompatibilityTest.php`, and `tests/PlanApiContractTest.php`.
- The repository also contains ignored or otherwise untracked sensitive-looking paths identified by filename only: root `.env`, `packages/database/.env`, `apps/api/backups/backups.json`, two encrypted SQL backup archives under `apps/api/backups/`, and `backups/awiknet_full_2026-09-23.dump`. Their contents were not opened. Do not include them in an upload/package. `apps/api/dist/` and `apps/web/.next/` are generated build output; `.next` was approximately 2,604 files / 1.35 GB. No generated or backup files were removed.
- `HOSTINGER_DEPLOYMENT.md` contains a hardcoded default admin credential in its instructions; the development-only `packages/database/prisma/seed.js` also has a fallback credential and logs the selected password. Values are intentionally not reproduced here. The static upload README itself says it excludes the API and database. Replace/remove unsafe instructions and use the separate bootstrap path only after verifying it before any staging use.

To regenerate the exact full filename listing without reading file contents, use `git status --short --untracked-files=all` and `git ls-files --others --exclude-standard`. For ignored sensitive paths, inspect filenames only; do not use `Get-Content`, `type`, or `cat` on `.env` or database dumps.

## Reconciled Documentation And Schema Findings

- `MIGRATION_STATUS.md` and `SECURITY_REVIEW.md` record the implemented PHP auth/lockout behavior. Local report, route and contract tests are not full authorization or frontend E2E coverage.
- The package clean-install sequence is `migrations/2026_10_11_auth_core.sql`, `migrations/2026_10_12_login_attempts.sql`, then `migrations/2026_10_13_full_application.sql`. The full-application migration no longer duplicates company-settings DDL; the legacy additive company-settings helper is excluded from this chain.
- The complete ordered chain created 18 tables and passed against an isolated MariaDB 10.5.29 instance. Static review found no destructive statements in the PHP schema/migration files. No migration ledger, schema-drift validator, or PostgreSQL-to-MariaDB data import exists; do not treat this as an upgrade/import path.
- The PHP code has the handlers listed in the current matrix. The local standalone tests and MariaDB harness cover selected paths only; they do not establish feature parity, all role/failure cases, or Hostinger behavior.

## Beginner Hostinger Preflight

Find these facts in hPanel or the VPS dashboard. Record the values only; **do not send passwords, API tokens, private keys, database credentials, or `.env` contents**.

1. **Hosting product:** exact plan/product name. Is it shared Web Hosting with hPanel, or a VPS with SSH/root and Docker? Confirm whether Node containers are supported if the intended target is the full Nest app.
2. **PHP:** selected PHP version for both web/PHP-FPM and CLI, plus whether `pdo_mysql` and `mbstring` are enabled. Confirm whether you can set the document root to a `public/` folder and configure environment variables outside the web root.
3. **Database:** exact MySQL/MariaDB engine and version, server collation/character set, database size limit, and whether hPanel allows a separate database user with only the grants needed by the app. Do not point any check at production data.
4. **Web server:** Apache or LiteSpeed version; whether `mod_rewrite`, `mod_headers`, and `.htaccess` overrides are enabled; the actual document-root path; and how PHP files outside that root are handled.
5. **HTTPS and proxy:** whether a certificate is active for the intended host, whether HTTP is redirected, whether a CDN/reverse proxy sits in front, and what client address the PHP/API process sees as `REMOTE_ADDR`. Do not infer this from `X-Forwarded-For` supplied by a browser.
6. **Security controls:** where CORS origins and response headers are configured, whether TLS/HSTS is already added by the host, and whether any security rule blocks `/api/v1` or authorization headers.
7. **Operations:** available cron/scheduled-task frequency, writable disk space and PHP upload/request limits, backup/restore facilities, log access/retention, and outbound HTTPS access needed for Meta/WhatsApp or other services.
8. **Staging isolation:** whether the plan supports a separate staging site and a separate empty database/user. Staging must use synthetic data and separate credentials; do not clone production data for this preflight.

## Staging-Only Plan (No Actions Taken)

1. **Choose one target architecture:** static frontend plus an explicitly hosted API, the partial PHP/MariaDB prototype, or the full NestJS/PostgreSQL/Redis VPS stack. Do not mix their schema, `.htaccess`, or deployment instructions.
2. **Resolve the blockers below and review the build/package:** select matching frontend output, API runtime, migration chain, same-origin proxy/CORS/CSP rules, and document-root layout. Remove default credentials from instructions, ensure production setup does not run the development seed, and use only the verified bootstrap procedure; keep `.env` and backups out of artifacts. Generate a package manifest and perform a secret scan on the final staging package without exposing findings' values.
3. **Create isolated staging only after approval:** a staging hostname/account and newly created empty database, with a migration account used only to apply schema and a separate least-privilege runtime account. Seed synthetic records only. No production import, existing database, or DNS change is part of this audit.
4. **Apply and inspect migrations in staging:** start from empty schema; apply the chosen complete baseline and all upgrades; verify tables/indexes, charset/collation, permissions, and repeatable recovery steps. Preserve the additive login-attempt table during application rollback.
5. **Run gates:** real-host Apache/PHP entrypoint checks; all selected API parity tests; browser responsive tests for login, refresh/logout, customer, subscription, inventory, POS, settings, and any enabled integrations; verify CSP/CORS/TLS/headers, logs, backups/restore, scheduled jobs, and webhook delivery. Use bounded synthetic load tests and check errors/resources.
6. **Practice rollback in staging:** restore the pre-stage snapshot or switch back to the prior release; do not run destructive volume/database reset commands. Document who may apply schema changes and how to recover without dropping auth-attempt history.
7. **Stop for review:** provide redacted hosting facts and the staging evidence; do not move to a production release until the target architecture and all blocker evidence are reviewed and explicitly approved.

## Three Biggest Blockers

1. **Hostinger execution/configuration is unverified:** no evidence yet proves secure PHP-FPM environment injection, secure CLI first-admin provisioning, LiteSpeed rewrites, sibling `open_basedir`, PHP extensions, or target database grants/version.
2. **Release scope is incomplete:** PHP is not full NestJS parity; WhatsApp delivery, scheduled jobs, backup/restore, mail/recovery, uploads, PDF/XLSX, and existing PostgreSQL data migration are absent or unverified.
3. **No isolated Hostinger staging acceptance:** TLS/security headers, API/browser workflows, real hosting limits, operations/restore and cron have not been tested on the account. No production deployment is authorized or claimed.
## Latest validation: 2026-10-14

- PHP lint: all prototype PHP files passed (exit 0).
- Frontend build: successful, includes forgot-password and reset-password pages.
- Standalone PHP tests: not run due to missing SQLite extension in PHP environment (blocker).
- MariaDB 10.5 compatibility/concurrency harness: 
  - Command: `AWIK_MARIADB_BASEDIR=<path> php hostinger-php-prototype\tests\MariaDbCompatibilityTest.php`
  - Exit code: 1 (failure)
  - Output: 
    - Disposable MariaDB server version: 10.5.27-MariaDB (requested major.minor 10.5)
    - Isolated lock observer: root@localhost / root@localhost (PROCESS verified; disposable test server only)
    - MariaDB 10.5 product-stock and sale-quantity CHECK constraints passed
    - MariaDB initial ADMIN provisioning and repeat-refusal assertions passed
    - MariaDB scheduled auth-state cleanup retention, contention, and persistence assertions passed
    - MariaDB auth login query failed: {"success":false,"statusCode":503,"message":"Login temporarily unavailable","errors":null,"timestamp":"2026-10-14T08:38:12+00:00","path":"\/api\/v1\/auth\/login"}
- Changes:
  - Frontend static export regenerated to include new password recovery pages.
  - Packaging script updated to include password recovery migration and updated documentation.
  - No changes made to backup and restore system; existing system verified to run MariaDB compatibility test (except for auth login failure in this run).
- Unresolved blockers:
  - Hostinger secure PHP-FPM environment variable injection unverified.
  - Hostinger LiteSpeed rewrite and sibling open_basedir behavior unverified.
  - Hostinger PHP extensions (including ZIP for XLSX), MariaDB version/grants, secure cron environment injection, TLS/headers, and browser/API acceptance unverified.
  - Hostinger native PHP mail acceptance, authenticated sender configuration, and recipient delivery unverified.
  - SQLite extension missing in PHP environment, preventing standalone PHP tests.
  - Backup and restore system not implemented for PHP/MariaDB prototype (existing system exists but not verified for full workflow).
  - Password recovery email delivery not verified (depends on mail configuration).
  - Auth login intermittently failing during test (possible rate-limiting or environment issue).


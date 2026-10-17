# AWIK NET Progress

Date: 2026-10-13

## Current stage
Session 2, Slice A (schema, authentication, sessions/tokens, users, roles): **BLOCKED at database preflight**. Source comparison and database-independent checks were completed. No Slice A database-backed behavior is claimed.

## Canonical documentation
The canonical readiness documents are at the repository root: `LAUNCH_GAP_AUDIT.md`, `DATABASE_READINESS.md`, `DEPLOYMENT_READINESS.md`, and `FEATURE_PARITY_AND_MIGRATION_PLAN.md`. Older copies exist under `hostinger-php-prototype/`; the generated `deployment/hostinger-premium-package/api/` also contains snapshots. Those duplicate copies were left untouched and may be stale. No duplicate readiness document was created.

## Git baseline preserved
Before edits, `git status --short --branch` showed branch `hostinger-php-migration` with an already dirty worktree. Existing tracked modifications/deletions included root environment/runbook/readme/package and compose/nginx files, numerous Nest API controllers/services/guards, Next config/pages/hooks/components/auth state, and database package files. Pre-existing untracked trees included the Hostinger deployment docs/package, `apps/web/out/`, web public/scripts/components, `hostinger-php-prototype/`, `deployment/`, and `deployment-work/`. No pre-existing path was reverted, deleted, staged, or committed. The detailed command was `git status --short --untracked-files=all | Select-Object -First 260`; that output was intentionally capped, so it is not represented here as a complete per-file manifest.

## Files changed this session
- Updated root `LAUNCH_GAP_AUDIT.md` with source coverage correction and current DB blocker.
- Updated root `DATABASE_READINESS.md` with exact local checks, MariaDB preflight result, and schema-source correction.
- Updated root `DEPLOYMENT_READINESS.md` and `FEATURE_PARITY_AND_MIGRATION_PLAN.md` with current source/test statuses.
- Added `SLICE_A_AUTHORIZATION_MATRIX.md` for the 12 Nest auth/user routes.
- Added this `PROGRESS.md`.
- No PHP application, test, migration, or harness file was modified.

## MariaDB preflight

- Exact version: **none**. `AWIK_MARIADB_BASEDIR` was missing. `Get-Command mariadbd,mysqld,mariadb,mysql` found no MariaDB executable on `PATH`.
- Rechecked after the user requested the next step: `AWIK_MARIADB_BASEDIR` is still missing; preflight exited with status 2 before inspecting binaries, initializing data, or starting a server.
- The existing harness was not invoked. No MariaDB installer/server was started, no port was reserved for a DB, no data directory or credentials were created, and no `SELECT VERSION()` was run.
- Harness safety finding from source review: when `AWIK_MARIADB_BASEDIR` is absent, `MariaDbCompatibilityTest.php` defaults to `C:\Program Files\MariaDB 13.0`; the version assertion runs after initialization/startup. This conflicts with the required preflight. It was not edited because the instruction requires a baseline harness run before changing the harness, and the required 10.5 environment was unavailable.
- Isolation finding: a separate MariaDB 10.5 installation can be selected without modifying MariaDB 13.0 by setting `AWIK_MARIADB_BASEDIR` to the 10.5 installation root. The harness invokes that root's `bin/mariadb-install-db.exe` and `bin/mariadbd.exe`, initializes only its generated temp data directory, passes `--no-defaults`, supplies the selected `--basedir`, and binds the server to `127.0.0.1`. The exact install path is not yet available or verified.
- Required configuration once a dedicated 10.5 install exists: `$env:AWIK_MARIADB_BASEDIR = '<MariaDB 10.5 installation root containing bin\\mariadbd.exe and bin\\mariadb-install-db.exe>'; $env:AWIK_MARIADB_TARGET_VERSION = '10.5'`. Do not leave the base-directory variable unset.

## Commands run and results

- `git status --short --branch; git status --short --untracked-files=all | Select-Object -First 260` — baseline captured before edits; pre-existing dirty state preserved.
- `$base = $env:AWIK_MARIADB_BASEDIR; if ([string]::IsNullOrWhiteSpace($base)) { 'AWIK_MARIADB_BASEDIR=MISSING' } else { "AWIK_MARIADB_BASEDIR_PRESENT=$base"; "BASEDIR_EXISTS=$(Test-Path -LiteralPath $base)"; if (Test-Path -LiteralPath $base) { Get-ChildItem -LiteralPath $base -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^(mariadbd|mysqld|mysql_install_db|mariadb-install-db)(\.exe)?$' } | Select-Object -ExpandProperty Name } }; Get-Command mariadbd,mysqld,mariadb,mysql -ErrorAction SilentlyContinue | Select-Object Name,Source` — BLOCKED: variable missing; no executable on `PATH` (no server action taken).
- Recheck command: `$base = $env:AWIK_MARIADB_BASEDIR; if ([string]::IsNullOrWhiteSpace($base)) { 'BLOCKED: AWIK_MARIADB_BASEDIR is missing'; exit 2 }; if (-not (Test-Path -LiteralPath $base -PathType Container)) { 'BLOCKED: AWIK_MARIADB_BASEDIR does not identify a directory'; exit 3 }; $server = Join-Path $base 'bin/mariadbd.exe'; $installer = Join-Path $base 'bin/mariadb-install-db.exe'; "BASEDIR=$base"; "SERVER_EXISTS=$(Test-Path -LiteralPath $server -PathType Leaf)"; "INSTALLER_EXISTS=$(Test-Path -LiteralPath $installer -PathType Leaf)"; if ((Test-Path -LiteralPath $server -PathType Leaf) -and (Test-Path -LiteralPath $installer -PathType Leaf)) { & $server --version; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } } else { 'BLOCKED: expected server and installer binaries are not both present'; exit 4 }` — BLOCKED, exit 2: `AWIK_MARIADB_BASEDIR` is missing.
- Relative-path attempt from the `apps/web` working directory: `php hostinger-php-prototype/tests/UserValidationTest.php` and three `php -l` commands — command-path failures (`Could not open input file`); these were not test failures.
- Corrected absolute-path command set:
  - `php c:/Users/Admin/Projects/dggash/hostinger-php-prototype/tests/UserValidationTest.php` — PASS.
  - `php hostinger-php-prototype/tests/CustomerValidationTest.php` — PASS (Session 2 continuation; database-independent).
  - `php hostinger-php-prototype/tests/SubscriptionValidationTest.php` — PASS (Session 2 continuation; database-independent).
  - `php -l c:/Users/Admin/Projects/dggash/hostinger-php-prototype/private/bootstrap.php` — PASS.
  - `php -l c:/Users/Admin/Projects/dggash/hostinger-php-prototype/public/index.php` — PASS.
  - `php -l c:/Users/Admin/Projects/dggash/hostinger-php-prototype/tests/MariaDbCompatibilityTest.php` — PASS.
- `php hostinger-php-prototype/tests/MariaDbCompatibilityTest.php` — NOT RUN; preflight blocked.

## Test counts and evidence categories

- Database-backed tests: 0 passed, 0 failed, 1 required baseline blocked/not run.
- Database-independent validation tests: 3 passed (`UserValidationTest.php`, `CustomerValidationTest.php`, `SubscriptionValidationTest.php`).
- Static syntax checks: 3 passed.
- HTTP integration tests executed: 0. Existing source contains HTTP assertions, but source inspection is not execution evidence.
- Browser end-to-end tests executed: 0.
- Hostinger-only checks: 0; no access or settings changes were made.

## Findings and unresolved issues

- The current PHP source has handlers for auth/users, customers, plans, subscriptions, inventory, sales, dashboard, and reports, plus a full-application DDL draft. These are source-level IMPLEMENTED-UNTESTED, not DB-TESTED.
- PHP lacks `/api/v1/auth/demo`; Nest demo behavior has a default-admin credential path that must not be copied into a production-compatible migration.
- PHP stores/rotates/revokes tokens; the Nest reference issues stateless JWTs and does not revoke them on logout/password change. This mismatch requires parity review.
- PHP refresh rotation has a concurrent-consumption race risk because the conditional token update does not check affected rows.
- PHP change-password hashing omits the explicit bcrypt cost 12 used by the Nest implementation; PHP profile update ignores unknown properties instead of Nest's strict DTO rejection.
- No endpoint-by-endpoint unauthenticated/ADMIN/STAFF HTTP tests have run. The user validation script tests helpers only.
- No MariaDB migration ledger execution, clean-install test, DB constraint test, HTTP DB outage test, or exact MariaDB 10.5 evidence exists.

## Readiness continuation

This continuation performed source inspection only; no tests were rerun because the database-independent validation/build/lint checks below were already recorded as passing and their sources have not changed.

Checks already confirmed:
- PHP validation: `UserValidationTest.php`, `CustomerValidationTest.php`, `SubscriptionValidationTest.php`, `InventoryValidationTest.php`, `SalesValidationTest.php`, `SettingsValidationTest.php`, and `DashboardReportsValidationTest.php` passed.
- Frontend production build and PHP syntax checks for the prototype were previously successful.
- The current continuation ran no test command. Database-dependent Auth/Plan/HTTP contracts and the MariaDB harness were not run.

Source-review findings, not verified failures:
- Nest routes with no PHP route handler: `/api/v1/audit`, `/api/v1/whatsapp/*`, and ADMIN-only `/api/v1/metrics`. (Superseded for backups: an ADMIN-only `/api/v1/backups` slice now exists — see Session 17.)
- Nest declares PDF, Excel, and CSV report downloads. The first CSV slice is implemented below; PDF and Excel remain unsupported, and the actual report route still lacks DB-backed HTTP verification.
- PHP dashboard KPI data sets `whatsapp.configured` to `true` unconditionally, while the PHP WhatsApp handlers are absent. This is misleading status data, not verified configuration.
- Auth parity/security findings remain: `/auth/demo` is missing; PHP's stateful token revocation differs from Nest's stateless JWT behavior; refresh consumption is vulnerable to a concurrent race because the affected-row count is not checked; profile validation ignores unknown properties; and password-change hashing omits the explicit bcrypt cost 12 used by Nest.

Files changed in the prior readiness-only continuation: `PROGRESS.md` only. No PHP source, tests, migrations, package files, or existing generated artifacts were changed in that continuation.

## Session 3: report download slice

Prioritized plan: (1) implement report file formats, starting with a dependency-free CSV response slice; (2) report WhatsApp as unsupported/unconfigured instead of hard-coded configured; (3) assess/port audit, backup, WhatsApp, and metrics only where shared-hosting dependencies are supportable; (4) document auth behavior/security decisions before lifecycle changes.

Implemented in this slice:
- CSV report attachment serialization with quoted fields, nested aggregate rows, and spreadsheet formula-prefix protection.
- `/api/v1/reports/:report/download?format=csv` now returns a raw `text/csv` response with a download filename.
- Unsupported `pdf` and `excel` requests fail explicitly with HTTP 400 instead of returning JSON disguised as a download. Non-download report routes retain their JSON response.

Tests run:
- `php "hostinger-php-prototype/tests/DashboardReportsValidationTest.php"` — PASS; checks empty output, nested arrays/objects, Unicode, comma/quote/CRLF fields, formula prefixes (including Unicode whitespace), attachment headers/body, JSON response preservation, and consistent unsupported PDF/Excel errors.
- `php -l "hostinger-php-prototype/private/bootstrap.php"` — PASS.
- `php -l "hostinger-php-prototype/public/index.php"` — PASS.
- `php -l "hostinger-php-prototype/tests/DashboardReportsValidationTest.php"` — PASS.
- No database, HTTP server, external service, or Hostinger test was run. The actual report route and database result mapping remain unverified.

Nest report-contract comparison (source review, not runtime proof):
- The seven report route names and ADMIN/STAFF role split match the Nest report controller. Both accept `dateFrom`, `dateTo`, and `format` query parameters; Nest's DTO describes `pdf`, `excel`, and `csv`, and defaults missing format to PDF. PHP preserves normal JSON responses, defaults download requests to PDF, returns CSV bytes with `Content-Type: text/csv` and an attachment filename for CSV, and emits a standard JSON 400 error for unsupported PDF/Excel formats.
- Nest export CSV uses report-specific column headings and projections. PHP CSV currently serializes the PHP report response generically; it is not report-projection parity.
- PHP's report SQL returns different data shapes and limits (including raw sales/customer/subscription/product/movement/message records and a maximum of 100 in several lists), while Nest returns summaries, groupings, selected relations, and varying limits. The PHP revenue result has `totalPayments`/empty `payments` rather than Nest's `totalSales`/`sales` projection.
- PHP applies supplied date filters to report queries that Nest does not date-filter (customers, subscriptions, inventory); PHP validates `YYYY-MM-DD` shape but does not prove calendar-valid dates. These mismatches remain unmodified.
- The `public/index.php` source sets response headers, chooses JSON content type only when none was supplied, and emits `body` raw before the JSON encoder. Unit tests verify response object headers/body and ordinary JSON preservation, but no HTTP entrypoint test ran, so wire behavior is not verified.
- Git status shows the four requested files are untracked in the repository; therefore `git diff` has no HEAD baseline for their prior session edits. Their current implementations were reviewed directly against Nest source and the recorded CSV changes.

Files changed in Session 3 (all were pre-existing untracked paths; none was staged):
- `hostinger-php-prototype/private/bootstrap.php`
- `hostinger-php-prototype/public/index.php`
- `hostinger-php-prototype/tests/DashboardReportsValidationTest.php`
- `PROGRESS.md`

Remaining report gaps: Nest's report-specific projections and summaries are not yet fully reproduced by the PHP queries; PDF and Excel formats are not implemented; actual content-disposition/download behavior has not been exercised through the real HTTP entrypoint against MariaDB. Do not claim report parity or completion.

## Recommended next step
Install or provide a separate MariaDB 10.5.x installation without altering MariaDB 13.0, then set `AWIK_MARIADB_BASEDIR` to that installation root (containing `bin\\mariadbd.exe` and `bin\\mariadb-install-db.exe`) and `AWIK_MARIADB_TARGET_VERSION=10.5`. Before startup, verify those executables and a newly created unique test data directory. Then run the existing harness exactly once as the baseline, capture `SELECT VERSION()`, and verify cleanup. After that baseline, add/fix the per-route auth/user HTTP matrix and conditional refresh-token consumption, then rerun DB-backed Slice A tests and update readiness docs only from observed results.

## Prioritized parity implementation plan

1. **Report downloads:** implement actual PDF, Excel, and CSV attachments matching Nest's report data projections and headers. First small slice is CSV serialization/HTTP transport with fixture coverage; PDF/XLSX remain incomplete until generators are available and independently tested.
2. **WhatsApp status:** remove the unconditional configured claim and report unsupported/unconfigured state; do not represent stored message data as an active integration.
3. **Audit, backups, WhatsApp, metrics:** inspect and port only contracts supportable on shared hosting. Audit list requires DB query/pagination and authorization. Backup create/restore requires MariaDB tooling, private writable storage, and Hostinger capability checks. WhatsApp requires credentials, outbound HTTPS, public signed webhook, idempotent cron jobs, and DB-backed behavior. Metrics requires a PHP request instrumentation contract; otherwise mark unsupported.
4. **Authentication:** preserve stateful token revocation unless a reviewed parity decision approves a change. Address refresh-token atomic consumption, DTO strictness, explicit password hash cost, and demo-login default-password conflict without weakening protections.

## Session 7: restoring report CSV support

The prototype source lacked the CSV/report helper implementation required by `DashboardReportsValidationTest.php`. `hostinger-php-prototype/private/bootstrap.php` now provides report query/date validation, report-specific date-filter and row-limit helpers, CSV projections for all seven report types, formula-safe CSV serialization, and raw CSV download responses. The report handler retains its existing authentication and role checks and JSON payload shapes, validates report query parameters, applies date filters only to revenue/sales/stock-movement/WhatsApp reports, and uses bounded detail lists or SQL aggregates for exports.

Checks run in this session:
- `DashboardReportsValidationTest.php` — PASS.
- Database-independent `UserValidationTest.php`, `CustomerValidationTest.php`, `SubscriptionValidationTest.php`, `InventoryValidationTest.php`, `SalesValidationTest.php`, and `SettingsValidationTest.php` — PASS.
- PHP syntax checks for `private/bootstrap.php`, `public/index.php`, `DashboardReportsValidationTest.php`, `AuthApiContractTest.php`, and `PlanApiContractTest.php` — PASS.
- This session's `AuthApiContractTest.php`, `PlanApiContractTest.php`, and `HttpEntrypointTest.php` executions could not run: this PHP CLI reports `could not find driver` for PDO SQLite. The coordinator separately reported those two contract tests and the HTTP entrypoint test passing in the parent session; that result is not reproduced by this CLI.
- MariaDB compatibility/concurrency harness — NOT RUN. No isolated MariaDB 10.5 base directory was confirmed.
- No Hostinger, production data, DNS, or deployment operation occurred.

Current blocker: the CSV helper/contract slice passes database-independent tests, but the actual download route, query execution, authorization matrix, and DB-backed report results remain unverified without PDO SQLite/MariaDB. PDF and Excel downloads remain unsupported; MariaDB 10.5 and Hostinger runtime/rewrite/cron behavior are not verified. Deployment remains NOT READY.

Do not claim completion of any item until its endpoint and persistence behavior are tested at the appropriate level; database-backed behavior still requires a verified disposable MariaDB 10.5 instance.

## Session 8: local release-readiness verification

The following entries supersede earlier notes in this file that SQLite contract/HTTP tests could not run in this CLI: the bundled PDO SQLite DLL was available and was loaded for each test process only (`php -d extension=php_pdo_sqlite.dll`). No PHP configuration or dependency manifest was changed.

Checks actually run:
- `AuthApiContractTest.php`, `PlanApiContractTest.php`, `HttpEntrypointTest.php`, `CustomerValidationTest.php`, `DashboardReportsValidationTest.php`, `InventoryValidationTest.php`, `SalesValidationTest.php`, `SettingsValidationTest.php`, `SubscriptionValidationTest.php`, and `UserValidationTest.php` — PASS (10/10), using disposable SQLite fixtures where applicable.
- PHP lint across all 15 `hostinger-php-prototype/**/*.php` files — PASS.
- Runtime: PHP 8.3.13 CLI on Windows, PDO MySQL available; PDO SQLite available only when explicitly loaded for the test command. Hostinger PHP runtime remains unverified.
- `MariaDbCompatibilityTest.php` — NOT RUN. `AWIK_MARIADB_BASEDIR` is unset and no MariaDB server binary was found; no MariaDB 10.5 compatibility or concurrency result is claimed.

Package/deployment review:
- The pre-existing generated package remains untouched. Current `hostinger-php-prototype/private/bootstrap.php` and current Auth/Plan contract tests differ from their generated `deployment/hostinger-premium-package/api/` copies, so the package is stale and must not be uploaded. The package builder previously removed its destination directory and archive; it now refuses existing destinations and accepts a new package name. It was not executed.
- The frontend is a static export configured to call same-origin `/api/v1`. Its `.htaccess` sends unmatched paths to `index.html`; the PHP API is a sibling `api/` directory in the package and no tested same-origin route maps `/api/v1` to PHP. The production API topology and CSP/API origin must be resolved before staging.
- The separate `HOSTINGER_DEPLOYMENT.md` is a VPS/Docker/PostgreSQL guide, not a Premium shared-hosting runbook. A warning was added and its default administrator login claim removed. It remains unverified and must not be followed for this task.
- Private PHP code is guarded by the API `.htaccess` only if the applicable webserver honors overrides; Hostinger/LiteSpeed access rules and actual document-root layout remain untested. No `.env` or backup contents were opened.

Current decision: NOT READY TO DEPLOY. Remaining gates include exact disposable MariaDB 10.5 migration + business/concurrency harness success, a reviewed same-origin PHP/API deployment layout (or intentionally configured alternate origin), real Hostinger PHP/extensions/rewrites/headers/database grants/cron validation, and browser acceptance for the required workflows. Do not upload the stale package or run a Hostinger/DNS/production operation.

## Session 9: deterministic same-origin package route

The canonical package layout uses `public_html/` as the static document root and keeps the PHP prototype in its sibling `api/` directory. The generated frontend defaults to same-origin `/api/v1`. The original static rewrite sent every nonexistent path to `index.html`, and the API `.htaccess` was outside the document root; therefore those package paths did not connect.

The source static `.htaccess` now routes `/api/v1` to `/api/index.php` before the SPA fallback. The package builder is configured to place a small bridge at `public_html/api/index.php`; it includes the existing sibling `api/public/index.php` without moving PHP private sources into the document root. `HttpEntrypointTest.php` now checks the static API rewrite order, bridge target, and package-builder wiring. The existing generated package and archive remain untouched; the builder was not run.

This is source-level routing configuration evidence, not Apache/LiteSpeed execution evidence. Before a release, verify on a non-production Hostinger staging path that `public_html` is the document root, mod_rewrite-equivalent rules are honored, and PHP `open_basedir` allows the bridge to include the sibling API path while private source remains unreachable over HTTP. If Hostinger disallows sibling includes, this package layout must be changed without exposing private PHP files.

## Session 10: isolated MariaDB 10.5.27 and concurrency verification

MariaDB 10.5.27 Windows x64 ZIP was downloaded from the official MariaDB archive into a unique OS temp directory and SHA-256 verified against that archive's published checksum. It was extracted there only; no global installation or repository/package write was made. A separate fresh temp datadir returned `SELECT VERSION() = 10.5.27-MariaDB` before the compatibility test ran. The full `MariaDbCompatibilityTest.php` passed against `AWIK_MARIADB_BASEDIR` set explicitly to this portable 10.5.27 directory and target `10.5`.

The test-only observer connected as `root@localhost` and its `SHOW GRANTS` confirmed `ALL PRIVILEGES` including `PROCESS` on the isolated server. Concurrent application HTTP requests continued to use the separate generated least-privilege runtime account. Despite PROCESS, unfiltered `INFORMATION_SCHEMA.INNODB_LOCK_WAITS`, `INNODB_LOCKS`, and waiting `INNODB_TRX` rows were empty while `SHOW ENGINE INNODB STATUS` showed the waiters; therefore the original information-schema-only observer was not reliable on this portable 10.5.27 build.

The harness now prefers the original exact-row information-schema assertion and falls back narrowly to `SHOW ENGINE INNODB STATUS`. The fallback requires the two live HTTP child processes, exactly two connections from the generated app account running the operation/table-specific `SELECT ... FOR UPDATE`, distinct InnoDB waiter transactions, `LOCK WAIT` + exclusive record lock on the same PRIMARY space/page/heap, and physical-record UUID prefix correlation. MariaDB 10.5.27 prints only the first 30 UUID bytes; the helper also queries the isolated table and fails unless that prefix resolves uniquely to the exact full row UUID. It confirms the deliberate holder is the only test-database transaction with a row lock and has exactly one, while the test code still holds the selected exact row. The original post-release assertions are unchanged.

Observed concurrency paths all passed: concurrent sale refund (one 200 and one 400; one stock return and one movement), concurrent cancellation (one 200 and one 400; one stock return and one movement), and concurrent inventory movement lock barrier/integrity assertions. Full harness also passed DDL/PDO auth-plan checks, MariaDB-backed HTTP authentication/login lockout, and public HTTP entrypoint checks. No assertions were skipped or weakened.

The compatibility harness removed its own generated randomized datadir and server on exit. No MariaDB server process remained. The verified portable archive/extraction remains in the unique OS temp directory for reruns. This is local MariaDB 10.5 evidence only; Hostinger Premium runtime, `.htaccess`/LiteSpeed behavior, `open_basedir`, routing, and browser acceptance are still unverified. Release decision remains NOT READY until those hosting-specific gates are confirmed in non-production staging.

## Session 4: Nest CSV projection alignment

Changed this session:
- `hostinger-php-prototype/private/bootstrap.php`: added per-report CSV row projections matching the Nest exporter headings/field choices; joined the required customer, product/category, and user labels for revenue, sales, inventory, and movement CSV rows.
- `hostinger-php-prototype/tests/DashboardReportsValidationTest.php`: replaced generic-flatten tests with fixtures for all seven report schemas and representative rows.
- `PROGRESS.md`: this source comparison and evidence.
- `hostinger-php-prototype/public/index.php` was reviewed and remains unchanged this session; its existing raw-body-before-JSON response path is still covered at response-object level, not actual HTTP.

Nest source comparison (verified from controllers, DTO, service, and exporter):
- Seven `GET /reports/{revenue,sales,customers,subscriptions,inventory,stock-movements,whatsapp}` routes and matching `/download` routes. The PHP role split matches: ADMIN-only revenue/subscriptions/WhatsApp; ADMIN and STAFF for sales/customers/inventory/stock movements.
- Accepted Nest query fields are `dateFrom`, `dateTo`, and `format`. PHP currently ignores unknown query keys, accepts only `YYYY-MM-DD` date strings without calendar validation, and accepts but ignores `format` on non-download JSON routes.
- Nest date filtering applies to revenue, sales, stock movements, and WhatsApp; customers, subscriptions, and inventory ignore date filters. PHP currently applies supplied dates across every PHP report query. For `dateTo`, PHP uses the end of the day while Nest converts the date string to midnight and uses an inclusive upper bound.
- Nest export row shapes: revenue sale details; sales detail rows; 20 recent customers; subscriptions grouped by status; inventory totals grouped by category; stock movements with product/user names; 50 latest WhatsApp messages. PHP now projects those same CSV headings and field semantics from its available records, including relation labels, but PHP query caps remain 100 for sales/revenue/customer/subscription/inventory/movements/WhatsApp in the current paths. Some exports can therefore omit rows or aggregate from a partial set; this remains a parity gap.
- Nest `format` defaults to PDF. PHP intentionally returns an explicit 400 for PDF and Excel until implemented; CSV file headers are source-reviewed and helper-tested, but not verified through a real HTTP request.

Tests run in this session:
- `php "hostinger-php-prototype/tests/DashboardReportsValidationTest.php"` — PASS; fixture assertions cover the expected headers and representative projections for all seven reports, including nested customer/product/user values, Unicode, embedded CSV delimiters/line breaks, empty data, and formula escaping.
- `php -l "hostinger-php-prototype/private/bootstrap.php"` — PASS.
- `php -l "hostinger-php-prototype/tests/DashboardReportsValidationTest.php"` — PASS.
- No database, HTTP server, package install, Hostinger check, or deployment action occurred. Database-backed route results are unverified.

Deployment remains NOT READY. The highest-impact remaining report gaps are date/query semantics and row completeness; PDF/XLSX and exact Nest JSON projection parity also remain incomplete.

## Session 5: report query/date/aggregation parity

Source-backed changes in this pass:
- Report query validation now permits only `dateFrom`, `dateTo`, and `format`, rejects unknown keys and non-string values, and rejects empty/invalid calendar dates.
- Date values are normalized to UTC instants at millisecond precision. Date-only values resolve to midnight UTC, matching Nest's `new Date('YYYY-MM-DD')`; an inclusive `dateTo` now means that instant, not end-of-day.
- Only revenue, sales, stock movements, and WhatsApp apply date predicates, matching `ReportsService`; customers, subscriptions, and inventory validate date inputs but ignore them.
- Customer query now returns the source limit of 20; WhatsApp query now returns the source limit of 50.
- Subscriptions uses DB-side all-row counts/grouping for summary/status/plan, avoiding materializing every subscription; inventory CSV uses DB-side full-table summary/category aggregation instead of aggregating a truncated product list.

Checks run in Session 5:
- `php "hostinger-php-prototype/tests/DashboardReportsValidationTest.php"` — PASS; covers UTC date-only and offset instants, midnight upper boundary, unknown/non-string query parameters, invalid date values, report-specific date-filter policy, and Nest-shaped subscription/inventory aggregate projections alongside the seven CSV projections.
- `php -l "hostinger-php-prototype/private/bootstrap.php"` — PASS.
- `php -l "hostinger-php-prototype/tests/DashboardReportsValidationTest.php"` — PASS.
- No DB, HTTP server, external service, package install, Hostinger check, or deployment action occurred.

Files changed in Session 5: `hostinger-php-prototype/private/bootstrap.php`, `hostinger-php-prototype/tests/DashboardReportsValidationTest.php`, and `PROGRESS.md`.

Remaining gaps, source-reviewed but not DB-verified:
- Nest does not cap revenue/sales/stock-movement `findMany`; PHP still caps exported detail rows at 100 to avoid unbounded memory. A streaming/chunked export design is needed before removing those caps.
- PHP date-only and explicit-offset filtering now matches JS `Date` instant semantics. A timezone-less datetime is interpreted as UTC in PHP; Node interprets it in process-local time, so exact parity requires confirming Nest's timezone or choosing a shared UTC rule.
- Customer/subscription/inventory JSON report payloads are not fully Nest-shaped; this pass prioritizes CSV export correctness and safe aggregate execution.
- No SQL aggregation/limit behavior has been run against MariaDB; all passing tests here are database-independent fixtures. Deployment remains NOT READY.

## Session 6: date, filter, aggregation, and bounds parity

Implemented in this pass:
- Report query whitelist/type checks for only `dateFrom`, `dateTo`, and `format`.
- Date-only and extended ISO date-time values normalize to UTC millisecond instants; `dateTo` is an inclusive comparison at the instant parsed by Nest (`YYYY-MM-DD` therefore means midnight at the start of that date).
- Date predicates now apply only to revenue, sales, stock movements, and WhatsApp; customers, subscriptions, and inventory ignore dates after validating any supplied value.
- Customer and WhatsApp result caps now match Nest's 20 and 50.
- Subscription summary/status/plan aggregation now uses aggregate SQL instead of fetching a capped subscription list.
- Inventory CSV export uses full-dataset summary and per-category SQL aggregates; it does not materialize the full product table.
- Local query limits are centralized and asserted: 100 rows remain for revenue, sales, and stock movement detail exports to avoid unbounded buffering.

Tests run in Session 6:
- `php "hostinger-php-prototype/tests/DashboardReportsValidationTest.php"` — PASS; covers date-only and offset-to-UTC boundaries, unknown/type-invalid query parameters, invalid dates, date-filter report policy, local row-bound policy, and subscription/inventory aggregate projections.
- `php -l "hostinger-php-prototype/private/bootstrap.php"` — PASS.
- `php -l "hostinger-php-prototype/tests/DashboardReportsValidationTest.php"` — PASS.
- No MariaDB, database, HTTP server, hosting, or deployment operation occurred.

Files changed in Session 6: `hostinger-php-prototype/private/bootstrap.php`, `hostinger-php-prototype/tests/DashboardReportsValidationTest.php`, and `PROGRESS.md`.

Remaining discrepancies and risk:
- Nest returns unbounded revenue/sales/stock-movement detail rows; PHP's 100-row cap is an intentional memory-safety divergence. Streaming/chunked DB reads and HTTP responses are needed before removing it.
- PHP supports the common extended ISO date/date-time forms exercised here; Nest's `IsDateString` may accept additional ISO-8601 representations not currently covered by PHP validation.
- Timestamp values without a timezone are interpreted as UTC by PHP. JavaScript `new Date()` interprets timezone-less date-times in the Node process timezone, so exact parity requires a confirmed Nest timezone or an explicit shared UTC rule.
- Inventory/subscription SQL aggregates and all date-filter SQL remain UNTESTED against a database. JSON response projections for customer and inventory reports still do not fully match Nest.
- PDF/XLSX remain unsupported. Deployment status remains NOT READY.

## Session 11: final bridge, suite, and harness verification

The PHP package route is wired in source: `scripts/build-hostinger-package.ps1` copies `scripts/hostinger-api-bridge.php` to generated `public_html/api/index.php`; the shim includes the sibling `api/public/index.php` via the package's `public_html`/`api` layout. `HttpEntrypointTest.php` passed its rewrite ordering, builder destination, and disposable sibling-layout execution checks. The builder parsed successfully and its no-overwrite source check passed. The builder was not run, so the pre-existing package directory and ZIP (last write times 2026-10-13 23:10:57 and 23:11:07 local time) remain unchanged.

Final verification after the concurrency matcher was tightened:
- All ten PHP tests passed: Auth API, Plan API, HTTP entrypoint, Customer, Dashboard/Reports, Inventory, Sales, Settings, Subscription, and User validation.
- PHP lint passed for all 15 prototype PHP files and `scripts/hostinger-api-bridge.php` (16 files total).
- The complete `MariaDbCompatibilityTest.php` passed on isolated `10.5.27-MariaDB`, requested target `10.5`. The exact-row refund, cancellation, and inventory barriers each reported two distinct live HTTP child PIDs and distinct waiter transaction IDs, correlated to one PRIMARY page/heap and the exact test row; the intentional blocker was distinct from both waiters. Existing one-winner, stock restoration, sale status, and movement-count assertions passed unchanged.
- During the harness, `INNODB_LOCK_WAITS` and `INNODB_LOCKS` returned no rows even for the isolated `root@localhost` observer with PROCESS. The strict `SHOW ENGINE INNODB STATUS` fallback supplied the row/record evidence. Application requests used the separate generated least-privileged test account.
- No MariaDB server process remained after the run, and the final harness datadir (`awik_mariadb_compat_2951c4a558ca93fd`) was absent. An earlier separately named temp diagnostic directory, `C:\Users\Admin\AppData\Local\Temp\awik_mariadb_compat_30dd6c16657735f8243a96fe`, still exists from before this final run and was preserved; it was not deleted or altered. The verified portable archive/extraction also remains available for reruns.

Release status remains **NOT READY TO DEPLOY**. Local tests do not establish behavior on Hostinger LiteSpeed or prove the actual account's PHP extensions, sibling-path `open_basedir`, rewrite semantics, private-file protection, TLS/headers, database grants/version, cron execution, or browser/API acceptance. The remaining safe path is to refresh and review the package under a new output name, then validate it only in non-production Hostinger staging against the existing Premium plan; production data, DNS, hosting, and deployment were not touched.

## Session 12: fresh package archive and hidden-file verification

The package builder's original `Compress-Archive -Path <packageDir>\*` excluded hidden `.htaccess` files. Replacing it with `ZipFile.CreateFromDirectory` also failed the required-entry assertion on this Windows runtime. The builder now explicitly adds every file found by recursive `Get-ChildItem -Force` to a `ZipArchive`, normalizes entry separators, opens the completed archive, and fails if either `public_html/.htaccess` or `api/.htaccess` is absent. `HttpEntrypointTest.php` checks this builder/archive contract.

The successful, fresh local-only artifact is `deployment/hostinger-premium-package-validation-20261014-0820/` and `deployment/hostinger-premium-package-validation-20261014-0820.zip` (1,484,408 bytes). Both output targets were confirmed absent before invoking the builder. The ZIP contains 267 file entries, including `public_html/.htaccess`, `api/.htaccess`, `public_html/api/index.php`, and `api/public/index.php`. It was extracted to `C:\Users\Admin\.copilot\session-state\f4e58bf8-bfc7-48b4-a26a-74c63ba8da3f\files\hostinger-premium-package-validation-20261014-0820-extracted`; all 267 extracted files were compared with the package tree, and selected hashes matched. The extracted bridge's `dirname(__DIR__, 2)/api/public/index.php` resolves to the sibling front controller; `api/` and `api/private/` are outside `public_html/`. The package manifest intentionally remains `NOT_READY`.

SHA-256:
- ZIP: `0EE85374DFB55DFFA530F01568316F1A2154884EFAEC636DDAB02860584E3376`
- `public_html/.htaccess`: `C43ADE317BF77F446A64D6C7F8FDCEDFBCEEDB73CC430D9D34EE1A93F50F3791`
- `api/.htaccess`: `7BC0075CC79B85C6963CB16EB229786B9DE2CD4E6B6A76D5A123619B31842850`
- `public_html/api/index.php`: `87DA6E0ACA0C9E522343333CCD2097F89B65AE2E7D7AFF7A946227A05A9C0BE1`

All 10 PHP tests passed. Lint passed for the 16 PHP source/bridge files, 16 generated-package PHP files, and 16 extracted-package PHP files. The generated artifact scan found no `.env`, private key, certificate, or keystore files; credential-like matches were test-only fixtures outside the document root or frontend authentication labels/empty form fields, not runtime default credentials. No matched values were printed. The builder's no-overwrite guard was source-checked to fail before creating either target; that final check did not invoke a build.

Earlier failed outputs were preserved and must not be uploaded: the `...-0804` directory and its incomplete ZIP (initial compression lock failure, followed by an archive that omitted hidden `.htaccess`), and the `...-0813` directory/ZIP rejected by its hidden-entry check. Only the `...-0820` directory and ZIP passed local packaging verification. None were uploaded. Hostinger staging remains gated by explicit user permission; the release verdict remains **NOT READY TO DEPLOY** pending actual non-production Hostinger acceptance.

## Session 13: current migration evidence and package candidate

Reconciled the PHP deployment-readiness matrix with the actual handlers and clean-install migration chain. The PHP implementation has handlers for auth/token lifecycle, ADMIN users/permissions, plans/settings, customers, subscriptions/renewals, inventory, sales/refunds/cancellations, dashboard, and JSON/CSV reports. This is source presence and selected local test evidence, not complete NestJS parity. The ordered empty-database chain is auth core, login attempts, then full application; the legacy company-settings migration is excluded from that chain to prevent duplicate DDL. No ledger, drift checker, or PostgreSQL-to-MariaDB data import exists.

The package builder now copies only the PHP runtime (`private/`, `public/`, and legacy migration helpers) instead of including development tests and SQL fixtures. Its final fresh, unique output `deployment/hostinger-premium-readiness-candidate-20261014-1645/` and ZIP were absent before build; builder exit code was 0. All previous package outputs were preserved. The manifest and generated README now list covered tests and current parity gaps without asserting execution status at build time. The archive has 248 entries, including hidden `public_html/.htaccess` and `api/.htaccess`, `public_html/api/index.php`, the sibling `api/public/index.php`, and the three ordered install migrations. It excludes `api/tests/`, `database/schema.sql`, and `database/test-data.sql`. Extracted to `C:\Users\Admin\AppData\Local\Temp\awik-package-extract-hostinger-premium-readiness-candidate-20261014-1645`; all 248 package files matched the extracted files by SHA-256.

Final local test evidence:
- All 13 standalone PHP tests passed (exit 0): Auth API, Plan API, HTTP entrypoint, configuration, initial-admin provisioning, schema setup, customers, subscriptions, inventory, sales, settings, users, and dashboard/reports.
- `php -l` passed on all 21 PHP prototype and bridge files.
- Full `MariaDbCompatibilityTest.php` passed on explicitly isolated MariaDB `10.5.27-MariaDB` with target `10.5`. The exact-row refund, cancellation, and inventory contention checks observed distinct HTTP processes and waiter transactions on the same PRIMARY record/page/heap, with the confirmed blocker transaction distinct from both. Existing one-winner and stock/sale/movement invariants passed. `INNODB_LOCKS`/`INNODB_LOCK_WAITS` were empty on this build even for the PROCESS-privileged observer; the strict operation/table-specific `SHOW ENGINE INNODB STATUS` fallback supplied exact row evidence.
- The generated archive was opened and extracted; both hidden `.htaccess` entries were present and all file hashes matched the output tree. The extracted public bridge was run through a local PHP server with in-memory SQLite and returned the API dispatcher's JSON 404, confirming its sibling include path. All 7 packaged PHP files passed lint.
- The builder parsed successfully and, when invoked again with the existing final output name, refused overwrite with exit 1 as expected; the ZIP SHA-256 remained unchanged.
- A redacted package scan found no private keys, credential tokens, default credential values, `.env` files, or credential-bearing filenames. The `admin@...example` login placeholder and frontend password labels are non-credentials; package unit tests and SQL fixtures were excluded. No matched values were emitted.
- Candidate ZIP SHA-256: `140841DD892A109AEACFB1A8C55039AC28FD349202050EF85540D1E7F1DD3EDA`. Prior validated `deployment/hostinger-premium-package-validation-20261014-0820.zip` remains unchanged at SHA-256 `0EE85374DFB55DFFA530F01568316F1A2154884EFAEC636DDAB02860584E3376`. Existing failed and intermediate package outputs remain preserved.

Release decision stays **NOT READY for Hostinger**. The secure Hostinger PHP-FPM environment-variable mechanism and supported CLI first-admin path are unverified. LiteSpeed rewrites, sibling `open_basedir`, PHP-FPM extensions, account MariaDB build/grants, TLS/headers, cron and real browser/API acceptance also remain unverified. No Hostinger/production access, data migration, deployment, DNS/hosting change, or production database action was performed.

## Session 15: bounded auth-state cleanup and current release candidate

Added a CLI-only auth-state cleanup command that takes a database-specific nonblocking advisory lock and transactionally deletes up to 5,000 expired tokens and up to 5,000 login-attempt records older than 30 days that do not have an active lockout. It refuses web invocation and arguments, fails closed on DB/lock errors, and does not reveal credentials. The package includes the command but does not install a cron entry. No subscription refresh, WhatsApp reminder, delivery, or backup job is implied.

Validation from the actual `C:\Users\Admin\Projects\dggash` workspace on `hostinger-php-migration`:
- All 14 standalone PHP tests passed (exit 0). The Auth API, Plan API, and HTTP entrypoint tests used the documented `php -d extension=php_pdo_sqlite.dll` invocation. The initial sweep without the SQLite extension exited 1 for those three SQLite-backed tests; the corrected rerun passed all 14.
- `php -l` passed for all 23 PHP files under `hostinger-php-prototype/` and `scripts/hostinger-api-bridge.php`.
- With `AWIK_MARIADB_BASEDIR=C:\Users\Admin\AppData\Local\Temp\awik-mariadb-10.5-runtime-20261014\mariadb-10.5.27-winx64` and `AWIK_MARIADB_TARGET_VERSION=10.5`, `php hostinger-php-prototype/tests/MariaDbCompatibilityTest.php` passed (exit 0) on `10.5.27-MariaDB`. Output confirmed cleanup retention/contention/persistence, existing selected business flows, and all three strict exact-row refund/cancel/inventory concurrency assertions. Its own server and new datadir were cleaned. One older pre-existing diagnostic temp directory was left untouched; no MariaDB process remained.
- PowerShell builder parse passed. A fresh candidate was built after both targets were confirmed absent: `deployment/hostinger-premium-auth-cleanup-candidate-20261014/` and `.zip`. ZIP SHA-256 is `5FB63531A7AA55791A485EFD7031AFA5EBC33A1E989ECB2D4AB98B46B376BD2F`. ZIP, generated tree and preserved extraction `deployment/hostinger-premium-auth-cleanup-candidate-20261014-verified-extraction/` match across 246 entries. Both hidden `.htaccess` entries, sibling private API placement, the three canonical migrations, cleanup script and test/fixture exclusion were verified; all 8 packaged PHP files linted. Secret classification passed without emitting values. Manifest status is `NOT_READY` and Hostinger acceptance false.
- Extracted bridge smoke returned the API's expected JSON 404 when run with isolated in-memory SQLite; no MariaDB/Hostinger connection was configured. A no-database first attempt returned generic JSON 500 and was not treated as a bridge pass. Same-name builder invocation refused overwrite (expected exit 1); candidate files and archive SHA-256 remained unchanged.

Current change set for this bounded implementation: new `hostinger-php-prototype/private/cron/cleanup-auth-state.php` and `hostinger-php-prototype/tests/MaintenanceJobTest.php`; modified `hostinger-php-prototype/tests/MariaDbCompatibilityTest.php`, `hostinger-php-prototype/tests/SchemaSetupTest.php`, `hostinger-php-prototype/tests/HttpEntrypointTest.php`, `scripts/build-hostinger-package.ps1`, `hostinger-php-prototype/README.md`, `hostinger-php-prototype/MIGRATION_STATUS.md`, `hostinger-php-prototype/FEATURE_PARITY_AND_MIGRATION_PLAN.md`, `hostinger-php-prototype/DEPLOYMENT_READINESS.md`, `DEPLOYMENT_READINESS.md`, and `PROGRESS.md`. The original Next.js/NestJS/Prisma code was not modified by this cleanup/package change. Pre-existing tracked changes/deletions/untracked files and prior candidates were preserved.

Remaining blockers: WhatsApp integration/webhook/reminders, backup/restore, subscription scheduler, email/recovery, uploads, PDF/XLSX and full Nest parity; account-specific Hostinger environment injection/first-admin CLI access, extensions, MariaDB grants/build, LiteSpeed/sibling `open_basedir`, cron, TLS/headers, cost-free staging availability and browser/API acceptance are unverified. No upload, deployment, production database, DNS, or hosting action occurred. Candidate remains **NOT READY**.

## Session 16: report download completeness and new candidate

Removed the silent 100-row truncation from MariaDB-backed **download** queries for revenue, sales, and stock movements; JSON list endpoints retain their existing 100-row response bounds. Customer and WhatsApp report caps remain 20 and 50, matching the Nest service. Exported sales with no customer now display `Walk-in`. Report files are still buffered/generated in memory, so no large-export Hostinger resource claim is made.

**Changed files:** `hostinger-php-prototype/private/bootstrap.php`; `hostinger-php-prototype/tests/DashboardReportsValidationTest.php`; `hostinger-php-prototype/tests/MariaDbCompatibilityTest.php`; `scripts/build-hostinger-package.ps1`; `hostinger-php-prototype/README.md`; `hostinger-php-prototype/MIGRATION_STATUS.md`; `hostinger-php-prototype/FEATURE_PARITY_AND_MIGRATION_PLAN.md`; `hostinger-php-prototype/DEPLOYMENT_READINESS.md`; `DEPLOYMENT_READINESS.md`; `PROGRESS.md`. Original Next.js/NestJS/Prisma source was not changed. Existing user changes and previous candidate artifacts were preserved.

**Test evidence:** all 14 standalone PHP test scripts (all `*Test.php` except `MariaDbCompatibilityTest.php`) passed, exit 0. `DashboardReportsValidationTest.php` passed actual CSV/PDF/XLSX generation checks for all seven report projections, empty datasets, MIME/disposition, formula handling, XML package integrity, Unicode and PDF xref/pagination. The complete MariaDB harness passed, exit 0, using explicit `AWIK_MARIADB_BASEDIR=C:\Users\Admin\AppData\Local\Temp\awik-mariadb-10.5-runtime-20261014\mariadb-10.5.27-winx64` and `AWIK_MARIADB_TARGET_VERSION=10.5`; confirmed server `10.5.27-MariaDB`. It passed all seven DB-backed downloads, anonymous and STAFF restrictions (including ADMIN-only reports), date filters, formula safety, response MIME/disposition and filtered sales exports with 101 matching rows in CSV/PDF/XLSX. Existing customer/subscription/inventory/sale/refund/cancellation/cleanup/auth and three exact-row concurrency assertions passed too. `php -l` passed all 23 prototype and bridge PHP files. No MariaDB server or new harness directory remained; the older pre-existing `awik_mariadb_compat_30dd6c16657735f8243a96fe` temp directory was preserved.

**Release candidate:** `deployment/hostinger-premium-report-export-candidate-20261014-0944/` and `deployment/hostinger-premium-report-export-candidate-20261014-0944.zip`; ZIP SHA-256 `80E24E7F08863BCA4560BD6F397EB9427B25B39304CFF4806D138B5084D92A5C`. The fresh extraction is preserved under `%TEMP%\awik-package-extract-hostinger-premium-report-export-candidate-20261014-0944`; all 246 archive/tree/extraction hashes matched. Both hidden `.htaccess` files, public bridge to sibling API, private API outside `public_html`, canonical migrations, test/fixture exclusion and `NOT_READY` manifest were verified; all 8 packaged PHP files linted. The bridge returned the expected JSON 404 in a local-only SQLite smoke test. Secret scanning found no credential-bearing filenames, private/AWS keys; password-assignment heuristics flagged the minified frontend JS and redacted review classified the matches as form labels/validation text, not credentials. Builder refused same-name overwrite with exit 1, and ZIP/manifest hashes remained unchanged. The prior candidate `deployment/hostinger-premium-auth-cleanup-candidate-20261014.zip` remains unchanged at SHA-256 `5FB63531A7AA55791A485EFD7031AFA5EBC33A1E989ECB2D4AB98B46B376BD2F`.

Hostinger remains **NOT READY** pending verified PHP ZIP/iconv and SAPI, secure environment injection and CLI first-admin invocation, MariaDB build/grants/settings, LiteSpeed/sibling `open_basedir`, cron, TLS/headers, large-export resource behavior, browser acceptance and explicitly authorized isolated staging. No Hostinger/production/DNS/hosting/database action occurred.

## Session 14: repeat test run and fresh release candidate

Current checkout was confirmed as `C:\Users\Admin\Projects\dggash` on `hostinger-php-migration`. Existing tracked modifications, deleted user files, untracked implementation/debug artifacts, earlier packages, and the prior diagnostic directory were preserved; no cleanup of user files was justified.

Fresh validation against the current source:
- The 13 existing standalone PHP tests all passed (exit 0): Auth API contract, Plan API contract, HTTP entrypoint, configuration, initial-admin provisioning, schema setup, customers, subscriptions, inventory, sales, settings, users, and dashboard/reports.
- PHP lint passed for all 21 prototype/bridge PHP files; PowerShell builder parse passed; the static destructive-SQL pattern review covered 4 PHP schema/migration SQL files and found 0 hits.
- `MariaDbCompatibilityTest.php` passed (exit 0) against explicit isolated MariaDB `10.5.27-MariaDB`, requested target `10.5`. Migration, provisioning, selected permissions/workflows and all three exact-row contention barriers passed; each waiter pair was correlated to the same PRIMARY record and distinct from the confirmed blocker. No isolated server process or newly created test datadir remained.

The first fresh candidate `...-1000` was preserved. A final package-risk check found that no runtime code or deployment instruction uses `api/database/migrations`; that copied folder exposed a second location containing the legacy helper and the already-canonical login migration. Updated `scripts/build-hostinger-package.ps1` and `HttpEntrypointTest.php` so the source helper stays preserved but is excluded from deployment output; the package now contains a single canonical migration chain. The full 13-test PHP suite passed again, all 21 PHP files linted, PowerShell parsing passed, and the four-file schema SQL pattern review found zero destructive-statement matches.

Built `deployment/hostinger-premium-readiness-candidate-20261014-final/` and `.zip` after confirming both targets absent; builder exit 0. The ZIP contains 245 entries, including hidden `public_html/.htaccess` and `api/.htaccess`, generated `public_html/api/index.php`, sibling `api/public/index.php`, and exactly the three ordered migration files; development tests, SQL fixtures, and duplicate `api/database/` migrations are excluded. A fresh extraction matched all 245 archive/tree/extracted file hashes. The extracted bridge returned the expected JSON 404 through local PHP HTTP; all 7 packaged PHP files linted. Redacted secret classification found zero sensitive filenames, private-key/AWS-key/secret-assignment matches; manifest status is `NOT_READY` and Hostinger acceptance is false.

Final candidate ZIP SHA-256: `EF6BBCEA5281BBB2C991FE43E82773CB41EDFE6CFF334206D17B57EEBB27E4D0`. Builder no-overwrite check against this final candidate refused with exit 1 as expected, and ZIP/manifest hashes were unchanged. Earlier `...-1000`, `...-1645`, and `...-0820` artifacts remain intact. The full MariaDB 10.5.27 harness passed on unchanged PHP runtime/schema code before the package-only builder/test change; its random datadir/server were cleaned, and no additional rerun was needed for this packaging-only update. Hostinger secure environment injection/CLI provisioning, LiteSpeed/open_basedir, PHP extensions, DB properties/grants, TLS/headers, cron, and browser/API acceptance remain unverified. No Hostinger, production data, deployment, DNS or hosting settings were accessed or modified.

## Password recovery — 2026-10-14

Implemented PHP-only `POST /api/v1/auth/forgot-password` and `POST /api/v1/auth/reset-password`; inspected NestJS auth routes do not provide recovery or email-verification endpoints. New clean-install migration `2026_10_14_password_recovery.sql` adds token-hash and rate-limit storage. Recovery uses 256-bit random tokens, SHA-256-only persistence, 30-minute expiry, generic responses, per-email/per-IP throttles (3/hour and 10/hour), transactional single-use redemption, revocation of existing sessions, and invalidation of other active tokens. The cleanup job now also removes bounded expired recovery tokens and stale hashed throttle scopes. Native PHP `mail()` is opt-in and requires explicit provider/from/HTTPS URL config; test callbacks simulate provider outcomes. No Hostinger email was sent or verified.

Added forgot/reset frontend source pages and a login link. The preserved `apps/web/out/` was not rebuilt, so those pages are not included in the existing candidate and a new package was not built from stale assets. No prior candidate was modified.

Final checks: all 15 standalone PHP tests passed (exit 0) using `php -d extension=php_pdo_sqlite.dll -d extension=php_zip.dll`; lint passed all 24 prototype/bridge PHP files (exit 0); `npm run typecheck --workspace=apps/web` passed (exit 0); PowerShell package-builder parser passed (exit 0). The isolated `MariaDbCompatibilityTest.php` passed (exit 0) against `10.5.27-MariaDB`, validating 18-table/four-migration setup, recovery request/reset over HTTP, concurrent single-use redemption with one winner, all existing report/business behaviors, and the exact-row refund/cancel/inventory concurrency assertions. The test harness server/datadir were cleaned. Recovery docs/parity and builder metadata were updated; no candidate archive was generated because the preserved static export lacks the new pages. The report-export candidate remains at SHA-256 `80E24E7F08863BCA4560BD6F397EB9427B25B39304CFF4806D138B5084D92A5C`.

Remaining gates: native mail delivery and secure environment setup on Hostinger, recovery UI export, Hostinger runtime/staging acceptance, and all other existing release blockers. Backup/restore has since been partially implemented (see Session 17). Verdict remains **NOT READY**; no deployment, upload, production, DNS, or hosting changes were made.

## Session 17: backup/restore implementation and candidate — 2026-10-14

Implemented an ADMIN-only PHP backup API in `hostinger-php-prototype/private/backup.php` and wired `awikHandleBackupRequest()` in `private/bootstrap.php`: `GET /api/v1/backups` (list with `data` + `meta`), `POST /api/v1/backups/create`, `GET /api/v1/backups/integrity/{id}`, `GET /api/v1/backups/{id}/download`, and `POST /api/v1/backups/cleanup`. Snapshots are a gzip-compressed JSON document of ordered `CREATE TABLE`/`INSERT` statements, encrypted with AES-256-GCM (12-byte IV, 16-byte tag) and authenticated with HMAC-SHA256; the manifest records size, plaintext SHA-256 and HMAC, and storage is refused inside or under `DOCUMENT_ROOT`. Restore is deliberately not an HTTP route: CLI-only `private/restore-backup.php <backup-id>` requires `AWIK_BACKUP_RESTORE_ACTOR_ID` and is intended only for an isolated database. Incremental backups, backup schedules, the HTTP restore/restore-token routes, and full NestJS `pg_dump`/`psql` restore parity are not implemented; no backup cron entry is installed. Package README/manifest and all source status docs were updated to describe the new capability and remaining gates.

**Evidence:** the full 16-file standalone suite passed (exit 0), including `BackupWorkflowTest.php` (key derivation, gzip round-trip, AES-256-GCM encrypt/verify/decrypt, corruption rejection, public-root storage rejection, and ADMIN-only authorization: anonymous 401, STAFF 403, ADMIN 200). The create/list/integrity/download/cleanup routes — not covered by the test — were additionally smoke-tested at runtime (encrypted create, valid integrity, download headers/path, fresh-retention cleanup, 404 for a missing id) with a temporary script that was removed afterward. `php -l` passed all 27 PHP files (10 runtime + 17 tests). The isolated MariaDB 10.5.29 harness passed (exit 0) with no regressions. A stray untracked, syntactically broken `hostinger-php-prototype/test_login.php` scratch file (not part of the package) was moved out of the source tree to the temp workspace.

**Candidate:** `deployment/hostinger-premium-backup-candidate-20261014-2153.zip`, SHA-256 `F9B82C7BCDA5EA766965F8ACB867BA430F872FD4D781212EBC41DBF3D4ADEFFF`, 261 entries; it includes `api/private/backup.php` and `api/private/restore-backup.php` and its manifest stays `NOT_READY`. Hostinger secure backup-key injection, PHP `openssl` availability, and a supported CLI restore execution path remain unverified. No Hostinger/production/DNS/hosting/database action occurred.

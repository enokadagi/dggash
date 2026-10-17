# Database Readiness

Date: 2026-10-14
Verdict: not ready for release

The initial inventory and baseline test statements below are historical and are superseded by the dated updates at the end of this document. The current local MariaDB result, latest standalone-test run, and release-candidate evidence are in the final update.

## What was actually tested
Database-independent checks run during Session 2:

- `php "c:/Users/Admin/Projects/dggash/hostinger-php-prototype/tests/UserValidationTest.php"` — PASS
- `php -l "c:/Users/Admin/Projects/dggash/hostinger-php-prototype/private/bootstrap.php"` — PASS
- `php -l "c:/Users/Admin/Projects/dggash/hostinger-php-prototype/public/index.php"` — PASS
- `php -l "c:/Users/Admin/Projects/dggash/hostinger-php-prototype/tests/MariaDbCompatibilityTest.php"` — PASS

An earlier invocation used paths relative to `apps/web` and failed because that was the terminal working directory. The corrected absolute-path invocation passed; no application test failed.

The database-backed baseline did not run: `AWIK_MARIADB_BASEDIR` was missing, no MariaDB binary was found on `PATH`, and the harness was not invoked. No version probe, server start, migration, or Hostinger database action occurred.

## Exact MariaDB version tested
None. The requested base-directory variable was absent. The harness source currently falls back to a MariaDB 13.0 installation path when that variable is absent, while checking the requested 10.5 version only after initializing and starting a server. It was deliberately not run. There is no valid MariaDB 10.5 compatibility proof.

## Source inventory correction
The current PHP tree contains `private/schema/auth-slice.sql`, a draft `database/migrations/2026_10_13_full_application.sql`, the login-attempt migration, and handlers for auth/users, customers, plans, subscriptions, inventory, sales, dashboard, and reports. This revises older audit statements that called these model/routes missing. DDL and handler presence remain IMPLEMENTED-UNTESTED; no clean-install or migration command was executed. The test harness source includes real HTTP and persisted-state assertions, but source assertions are not test results.

## Database safety constraints followed
- No production database was touched.
- No Hostinger credential or .env value was read.
- No existing data directory was reused.
- All database-related work remains in the category of design, documentation, and static validation only.

## Current blockers
- The PHP draft DDL and handlers have not been validated as a clean install on MariaDB 10.5.
- No migration ledger or migration repeat test was run in this session.
- Auth refresh rotation uses persistent token rows, unlike the Nest stateless refresh behavior; concurrent token consumption and full role authorization remain untested.
- No DB-backed proof exists for stock, refunds, subscriptions, reports, webhooks, or cron behavior.

## Conclusion
The database readiness level is not verified. The package is a staging artifact only and must be treated as not launch-ready until a disposable MariaDB 10.5 test instance proves the complete migration and business invariants.

## Update: 2026-10-14 test recheck

- PHP 8.3.13 CLI includes PDO MySQL. Its bundled PDO SQLite driver loaded successfully using `php -d extension=php_pdo_sqlite.dll`; no system or `php.ini` change was made.
- All ten PHP prototype tests passed with SQLite enabled for the test process. This verifies the SQLite contract/helper coverage only; it is not MariaDB compatibility proof.
- The MariaDB test base directory is unset and no MariaDB executable is available. `MariaDbCompatibilityTest.php` was not run. Exact MariaDB version tested in this pass: none.
- The PHP source includes business handlers and a draft full-application DDL, but neither a clean install nor business/concurrency invariants have been verified on MariaDB 10.5. No DB-backed release claim is made.

Verdict remains **NOT READY** pending a confirmed isolated MariaDB 10.5 installation, successful full migration/concurrency run, and Hostinger staging verification.

## Update: 2026-10-14 isolated MariaDB 10.5.27 run

- Official MariaDB archive Windows x64 ZIP, version 10.5.27, was downloaded to a unique OS temp directory and matched the archive's published SHA-256. It was extracted without installation; the project tree and existing package/archive were not used as outputs.
- A fresh isolated temporary datadir was started and `SELECT VERSION()` returned `10.5.27-MariaDB` before the full harness run. The harness used explicit `AWIK_MARIADB_BASEDIR` and target `10.5`; no production credentials, endpoints or data were used.
- `MariaDbCompatibilityTest.php` PASS. It verified DDL/PDO auth and plan behavior, HTTP entrypoint behavior, MariaDB-backed login/lockout behavior, and exact-row concurrency plus post-release business invariants for refund, cancellation, and inventory movement. Each competing pair was proven to be two distinct app-account transactions waiting on the same primary record held by the test's explicit blocker. The single-winner and stock/movement assertions remained unchanged and passed.
- On this 10.5.27 portable build, unfiltered `INNODB_LOCK_WAITS`/`INNODB_LOCKS` queries returned no rows even with the isolated observer verified as `root@localhost` with PROCESS. `SHOW ENGINE INNODB STATUS` did show both waiters and the shared primary page/heap/UUID prefix. The harness retains the information-schema path but now uses a strict operation-specific `SHOW ENGINE` fallback; it requires both expected app threads, same table/index/page/heap, unique UUID-prefix-to-full-row mapping, and the known active blocker as the only one-row-lock holder in the test DB.
- The harness server and its randomized temporary datadir were cleaned on exit. The verified MariaDB archive/extraction is retained in its unique OS temp path for repeat runs. This does not establish MariaDB behavior on Hostinger's server build or account privileges.

Database-level migration evidence is now available for this isolated 10.5.27 run; production and Hostinger acceptance remain unverified. Verdict remains **NOT READY** pending staging/runtime grants and deployment-routing/security verification.

## Final rerun: 2026-10-14

After strengthening the waiter identity checks, the full compatibility harness passed again on isolated `10.5.27-MariaDB` with target `10.5`. Refund, cancellation, and inventory each observed distinct HTTP child processes and distinct application waiter transaction IDs on the same exact PRIMARY record/page/heap, with the deliberate holder transaction separately identified. The existing business-result assertions passed. The isolated observer was `root@localhost` with PROCESS; the app connections remained on the separate generated test account. No MariaDB server process remained, and the exact final-run datadir was absent. A pre-existing uniquely named temp diagnostic directory was preserved rather than cleaned.

All 10 PHP test scripts also passed in the final suite, and PHP lint passed for the 15 prototype PHP files plus the bridge. This proves the local portable 10.5.27 harness and listed tests only; Hostinger's database build/grants, PHP runtime, LiteSpeed routing, sibling-path access, cron, security configuration, and browser acceptance remain unverified. No production data or hosting operation occurred; database/release verdict remains **NOT READY**.

## Update: latest local package and PHP validation

- All 13 standalone PHP tests passed (exit 0), including config validation, first-admin provisioning, schema order, HTTP/routing, customer, subscription, inventory, sales/refunds/cancellations, settings/users, and reports.
- PHP lint passed for all 21 prototype and bridge PHP files. The MariaDB harness had already passed on the explicitly isolated 10.5.27 installation after the distinct HTTP-process/waiter/holder checks were added; the real refund/cancellation/inventory lock barriers and their existing business invariants passed.
- A fresh package candidate was built without replacing any earlier output: `deployment/hostinger-premium-readiness-candidate-20261014-1645/` and `.zip`. Its manifest and README accurately list implemented coverage and known parity gaps without claiming test execution was performed by the builder. It has 248 ZIP entries, both hidden `.htaccess` files, the sibling bridge/API layout and ordered migration chain; it excludes unit tests and SQL test fixtures. All extracted files matched the generated tree by SHA-256.
- The extracted bridge returned the PHP API dispatcher's JSON 404 over a local test server with in-memory SQLite. All 7 packaged PHP files linted. The redacted credential scan reported no secret/key/token/default credential patterns; no credential values were printed.
- Candidate ZIP SHA-256: `140841DD892A109AEACFB1A8C55039AC28FD349202050EF85540D1E7F1DD3EDA`. The earlier verified `...-0820.zip` remains preserved with its previously recorded SHA-256.

No Hostinger or production access, migration, deployment, DNS change, or hosting setting change occurred. Hostinger secure env injection/CLI provisioning, PHP-FPM extensions, LiteSpeed/open_basedir, database grants/build, TLS/security headers, cron, and browser/API acceptance remain unverified. Verdict remains **NOT READY**.

## Fresh local candidate and repeat verification: 2026-10-14

- Re-ran all 13 standalone PHP tests; each passed (exit 0). Lint passed for all 21 PHP prototype/bridge files.
- Re-ran `php hostinger-php-prototype/tests/MariaDbCompatibilityTest.php` with `AWIK_MARIADB_BASEDIR` explicitly set to the isolated MariaDB 10.5.27 portable runtime and `AWIK_MARIADB_TARGET_VERSION=10.5`; exit 0. The ordered migrations, first-admin repeat refusal, tested permissions and business workflows passed. Refund, cancellation, and inventory contention each retained exact-row, PRIMARY page/heap, distinct waiter, UUID, HTTP-process, and known-holder evidence. Existing single-winner, stock, sale and movement assertions passed.
- Verified no process from the isolated runtime and no new compatibility-test datadir remained after the harness; the older diagnostic directory and all prior candidate artifacts were preserved.
- Built fresh candidates only after confirming their outputs absent; builder exit 0. The latest is `deployment/hostinger-premium-readiness-candidate-20261014-final/` and `.zip`. A migration-risk review confirmed there are no runtime references to `api/database/migrations`; the builder and HTTP packaging test now exclude that duplicate location and ship the legacy company-settings helper only in the source repository. The final archive has 245 entries with both hidden `.htaccess` files, public bridge, sibling API, and the ordered three-file migration chain. Tests/SQL fixtures are excluded. ZIP, generated tree, and fresh extraction matched by SHA-256 for all 245 files. Earlier `...-1000`, `...-1645`, and `...-0820` candidate artifacts remain preserved.
- The extracted bridge returned the API dispatcher's expected JSON 404 through a local PHP HTTP server, confirming the packaged sibling include. All 7 packaged PHP files passed lint. A redacted high-confidence scan found no sensitive credential filenames, private keys, AWS access keys, or secret assignments; no secret values were printed. The manifest remains `NOT_READY`, with Hostinger acceptance false.
- The previous candidate's no-overwrite check refused the existing path (exit 1 as expected) without changing its ZIP or manifest. Builder syntax parsing passed.

Candidate ZIP SHA-256: `EF6BBCEA5281BBB2C991FE43E82773CB41EDFE6CFF334206D17B57EEBB27E4D0`. The final extracted bridge returned the expected JSON 404 over a local PHP HTTP server, all 7 packaged PHP files linted, the redacted secret scan had zero high-confidence matches, and the manifest remains `NOT_READY` with Hostinger acceptance false. The prior `...-1000`, `...-1645`, and `...-0820.zip` artifacts remain preserved. These are local-only results; Hostinger runtime, routing, grants, secure configuration, and browser acceptance remain blockers. No Hostinger or production action occurred.

# Feature Parity and Migration Plan

Date: 2026-10-13
Verdict: not ready for production; staging build only

## Target
Hostinger Premium shared hosting, PHP 8.3 compatible runtime, MariaDB 10.5, static frontend served from public_html, PHP API served from the same host, without Node.js, Docker, or PostgreSQL.

## Current reality
- Frontend static export works locally: Next.js production build succeeded.
- PHP source now includes auth/user, customer, plan, subscription, inventory, sales, dashboard, and report handlers, plus a draft full-application MariaDB schema. These are IMPLEMENTED-UNTESTED in this session; older audit copies under the prototype and generated package are stale.
- The full NestJS + Prisma/PostgreSQL app remains the reference implementation.
- `AWIK_MARIADB_BASEDIR` is missing, so no MariaDB version was established and the harness was not run. No Slice A database-backed result is claimed.

## Priority slice plan

1. Authentication and authorization baseline
   - Status: BLOCKED
   - Source routes exist except `/auth/demo`; user routes are present, but full HTTP authorization coverage and DB-backed tests have not run.
   - PHP token persistence/rotation/revocation differs from the Nest stateless JWT implementation; concurrent refresh consumption also needs DB-backed proof.

2. Customers and history
   - Status: IMPLEMENTED-UNTESTED
   - PHP customer handler/schema source exists; detail/history behavior still needs DB-backed verification.

3. Plans, subscriptions, and renewals
   - Status: IMPLEMENTED-UNTESTED
   - PHP plan/subscription handlers and renewal schema source exist; requires real DB-backed lifecycle tests.

4. Inventory, stock movements, and low stock
   - Status: IMPLEMENTED-UNTESTED
   - PHP handler/schema source exists; must prove stock never goes negative and refunds/cancellations are single-winner.

5. Sales, refund, and cancellation
   - Status: IMPLEMENTED-UNTESTED
   - PHP handler/schema source exists; must prove transaction rollback and concurrency safety.

6. Dashboard, reports, and file downloads
   - Status: IMPLEMENTED-UNTESTED
   - PHP dashboard/report handlers exist; must verify route and file generation against real data.

7. Settings, audit, and access control
   - Status: PARTIAL
   - Must validate server-side authorization on every protected endpoint.

8. Webhooks, reminders, and scheduler jobs
   - Status: MISSING
   - Must prove cron-safe and idempotent behavior without external services.

## Migration handling rule
Do not allow the PHP prototype to claim parity with the NestJS/Product schema based only on route names or static linting. Any feature is considered complete only after a database-backed test on a disposable MariaDB instance proves the state transitions and access controls.

## Risk list
- No confirmed local MariaDB 10.5 installation: `AWIK_MARIADB_BASEDIR` is absent and the harness has an unsafe 13.0 fallback if invoked without it
- No confirmed Hostinger PHP or MariaDB 10.5 version evidence
- No DB-backed proof for sales refund/cancel concurrency
- No complete app schema translation from Prisma/PostgreSQL to MariaDB 10.5
- No verified production API path with Apache/LiteSpeed rewrite behavior
- No browser acceptance coverage for the live PHP API

## Safe checkpoint rule
If a slice cannot be tested in a disposable database, the project must stop at that slice and record the blocker. It must not claim success or continue onto later slices based on static checks alone.

## Session 2 status
Slice A is BLOCKED, not complete. The required disposable MariaDB 10.5 instance could not be located safely, so the baseline harness and all database-backed authorization/authentication tests were not run. Database-independent user validation and three PHP lint checks passed. The route-by-route source comparison is documented in [SLICE_A_AUTHORIZATION_MATRIX.md](SLICE_A_AUTHORIZATION_MATRIX.md); exact command and baseline notes are in [PROGRESS.md](PROGRESS.md).

# AWIK NET Database Readiness Audit

**Updated:** 2026-10-14  
**Mode:** Local source, test, and packaging readiness only. No Hostinger/prod system or database was accessed or changed.

## Executive Status

**BLOCKED for deployment and full parity.** The original schema is PostgreSQL Prisma with 14 models; its four migrations remain PostgreSQL DDL and were not changed. The PHP port now has a proposed 18-table MariaDB fresh-install chain and handlers for authentication/user permissions, plans/settings, customers, subscriptions/renewals, inventory, sales/refunds/cancellations, dashboard, and JSON/CSV reports. Local contract tests and the isolated MariaDB 10.5.29 harness are evidence only for the tested paths, not proof of full parity or Hostinger acceptance.

The hosting facts are **account-reported by Hostinger AI and not independently verified**. No Hostinger database was created or contacted. The original Next.js/NestJS/Prisma PostgreSQL source remains intact and is the compatibility reference; the PHP chain is not a Prisma migration or a production data migration.

## Source Inventory And Migration Chain

The canonical source is `packages/database/prisma/schema.prisma`, with `datasource db { provider = "postgresql" }`. The migration lock also says `postgresql`. The four ordered migration files are:

1. `20260915035507_init/migration.sql`: creates the initial tables, five PostgreSQL enum types, indexes, uniqueness, and foreign keys.
2. `20260915040000_inventory_safety_constraints/migration.sql`: adds nonnegative product stock and positive sale-item quantity `CHECK` constraints.
3. `20260923045048_add_correction_movement_type/migration.sql`: adds `CORRECTION` to PostgreSQL enum `StockMovementType` using `ALTER TYPE`.
4. `20260923050000_customer_location_and_subscription_renewals/migration.sql`: adds customer email/location/latitude/longitude and creates/indexes `subscription_renewals`, with a cascading FK to subscriptions.

The final Prisma schema reflects the result of those migrations. These SQL files are not MariaDB migrations: they use PostgreSQL `CREATE TYPE ... AS ENUM`, PostgreSQL enum alteration, quoted identifiers, PostgreSQL-oriented types/provider assumptions, and Prisma's `_prisma_migrations` history. Do not execute them on MariaDB.

PHP schema artifacts have different purposes:

- The clean-install package chain is ordered as `private/schema/auth-slice.sql` (five core tables), `database/migrations/2026_10_12_login_attempts.sql` (login state), `database/migrations/2026_10_13_full_application.sql` (ten business tables), and `database/migrations/2026_10_14_password_recovery.sql` (two recovery tables).
- `database/migrations/2026_10_13_company_settings.sql` remains a legacy additive helper, excluded from the clean chain because the baseline already creates `awik_company_settings`. Duplicate company-settings DDL was removed from the full-application migration.
- `database/schema.sql` is a test fixture: it creates `hostinger_migration_test_users`, `hostinger_migration_test_user_tokens`, and `hostinger_migration_test_plans`, plus the login-attempt table. It is not the production PHP schema.
- `database/test-data.sql` contains synthetic test rows and must not be used as production seed data.

The chain has no migration ledger or schema-drift check; `IF NOT EXISTS` can conceal structural drift. Treat it as a fresh-empty-database proposal only. It is not an upgrade path, PostgreSQL-to-MariaDB conversion, or production-data import procedure. Static SQL review and `SchemaSetupTest.php` check ordering, FK prerequisites, duplicate clean-chain tables, and destructive statements; the MariaDB harness applies the chain only to its unique local disposable instance.

## Complete Model-Parity Matrix

“Original fields” below are from the final Prisma schema after all four migrations. PHP schema names are listed as found; a similarly named test-fixture table does not count as an application implementation.

| Prisma model and original fields | PHP/MariaDB equivalent | Missing constraints, relations, indexes, migration and MariaDB 10.5 risks |
|---|---|---|
| **User**: `id String @id @default(uuid())`; nullable unique `email String?`; unique `phone String`; `firstName`, `lastName`, `passwordHash String`; `role UserRole @default(STAFF)`; `status UserStatus @default(ACTIVE)`; nullable `lastLoginAt`, `deletedAt`; `createdAt @default(now())`; `updatedAt @updatedAt`. Relations: audit logs, stock movements, sales. Indexes: phone, role, status. | `awik_users` in `private/schema/auth-slice.sql`; fields are present with UUID-shaped `CHAR(36)`, email `VARCHAR(255)`, phone `VARCHAR(30)`, names `VARCHAR(100)`, hash `VARCHAR(255)`, MariaDB `ENUM` role/status and `DATETIME(3)` timestamps. Token table `awik_user_tokens` is an additional PHP-only model. | Present for the PHP auth slice, not proof of complete identity/admin API parity. PHP adds composite role/status and deleted/status indexes; unique phone already indexes phone. It narrows Prisma `TEXT` to fixed lengths. Default `utf8mb4_unicode_ci` makes unique email case/accent-insensitive, unlike PostgreSQL's ordinary unique index; collisions must be identified before import. Token table has no Prisma model counterpart. User-to-audit relation exists in PHP DDL; stock/sales tables do not. |
| **Customer**: core fields as above, including unique phone, nullable profile/location fields and soft deletion. | `awik_customers` in the full-application migration. PHP routes implement create/list/search/detail/update/soft-delete; MariaDB tests exercise create/list/detail/update. | Customer relation to subscriptions and sales is present in the PHP DDL. Reminder/message tables exist, but no PHP sender/scheduler connects them. Geolocation bounds and phone uniqueness are validated; collation and import collisions remain migration risks. |
| **Plan**: `id`; `name`; nullable `description`; `speed`; `durationDays Int`; `price Decimal(65,30)`; `currency`; `isActive`; timestamps/soft delete. | `awik_plans`; plan list/search/detail/create/update/soft-delete handlers and MariaDB contract checks exist. | PHP plans are linked to subscriptions by a MariaDB FK. Duplicate checking is application-side and can race under concurrent create. Decimal/SQL-mode boundaries and cross-engine uniqueness semantics remain unverified for Hostinger. |
| **Subscription**: customer/plan, dates, status/payment, notes/renewal fields and timestamps. | `awik_subscriptions`; handlers cover create/list/detail/update/renew/suspend/activate/cancel. MariaDB tests exercise create, renewal history, state changes, and cancellation visibility. | Customer cascade and plan restrict relations and supporting indexes exist. Renewal and sale race coverage is not complete; scheduled reminder generation/status refresh is not implemented as an operational job. |
| **SubscriptionRenewal**: subscription history with prior/new plans and dates. | `awik_subscription_renewals`; renewal handler inserts history inside its transaction and a MariaDB test verifies one history row. | User and plan IDs intentionally have no FK in the current DDL, matching the source behavior. More rollback/failure and concurrent renewal cases remain open. |
| **WhatsAppReminder**: reminder schedule/state and unique subscription/type. | `awik_whatsapp_reminders` is present in the schema. | No PHP reminder generation, send, retry, or scheduler handler exists; rows are not evidence of delivery support. |
| **WhatsAppMessage**: delivery/retry/status fields and customer relation. | `awik_whatsapp_messages` is present in the schema. | No PHP Graph API, webhook, retry, or delivery operation exists; do not seed or imply operational messaging. |
| **InventoryCategory**: unique name and product relation. | `awik_inventory_categories`; route exists; MariaDB test exercises ADMIN-only creation and STAFF denial. | Binary collation preserves exact-name uniqueness, differing from common case-insensitive collations. |
| **Product**: SKU/barcode, category, prices, stock, active/soft-delete fields and constraints. | `awik_products`; create/list/detail/update/delete, stock lookup and low-stock routes exist. The database harness exercises product creation and inventory changes via purchase/sale/refund/cancel. | Category restriction, SKU/barcode unique indexes, and nonnegative stock check exist. Full collation/decimal boundaries, all rollback injections and races remain incomplete. |
| **StockMovement**: product/user, type, quantity/before/after, reference/notes. | `awik_stock_movements`; initial stock and adjustments are transactionally recorded. Integration tests verify initial stock and sale/refund/cancel effects. | Product/user FK actions and indexes exist. Not every movement type, rollback branch, or simultaneous stock mutation is covered. |
| **Sale**: unique sale number, optional customer/user, amount/method/status and timestamps. | `awik_sales`; create/list/detail/refund/cancel handlers exist. MariaDB tests cover API sale creation, refund, cancellation, restored stock and concurrent refund/cancellation barriers. | Status claim and stock restoration use transactions/row locks. Full money boundary and every constraint/failure branch remain open; Hostinger contention not verified. |
| **SaleItem**: sale/product, positive quantity, unit/line totals. | `awik_sale_items`; transactionally created by the sales handler. | Sale cascade/product restrict and positive quantity check exist. Monetary rounding still needs broader acceptance. |
| **CompanySetting**: unique key/value and timestamps. | `awik_company_settings` exists in core baseline; API list/update handlers are present. | `key` is quoted consistently in this source. Clean-chain duplicate was removed; the legacy helper is excluded from fresh package installs. Seed behavior remains separate. |
| **AuditLog**: nullable user, action/entity, snapshots and request metadata. | `awik_audit_logs`; selected user/plan/customer/subscription write paths exist. | There is no audit-list API or demonstrated complete cross-domain audit coverage. Snapshots are `LONGTEXT`; `entityId` is UUID-width `CHAR(36)`. |

**PHP enum coverage:** User role/status, subscription status, stock-movement type (including `CORRECTION`), and reminder type are represented by MariaDB enums in the PHP baseline/full-application schema. Schema presence does not imply WhatsApp behavior or parity with Prisma. Do not execute the PostgreSQL enum migrations on MariaDB.

## Application Operation Coverage

| Operation | PHP/MariaDB implementation and actual coverage |
|---|---|
| Authentication and tokens | Login/profile/update/password/refresh/logout plus persistent lockout. MariaDB HTTP harness covers token lifecycle, lockout thresholds/restarts, concurrent counter invariants and database outage. The stateful PHP token table is PHP-specific. |
| User administration and permissions | ADMIN user handlers exist; local MariaDB tests verify anonymous rejection and STAFF denial on user administration, and STAFF denial/ADMIN access on protected writes. Not every endpoint/role matrix has contract coverage. First-admin provisioning is separate CLI-only and locally exercised on MariaDB. |
| Customers | Customer CRUD/search and role checks exist. MariaDB tests cover create/list/search/detail/update. Full filter/soft-delete/failure matrix and import semantics remain open. |
| Plans and settings | Plan CRUD/search/soft-delete and settings list/update handlers exist. MariaDB plan tests verify ADMIN writes, STAFF denial, validation, duplicate, audit behavior, soft delete and DML-only runtime access. |
| Subscriptions | Create/update/renew/suspend/activate/cancel/list/detail exist. MariaDB harness tests create, renewal history, suspend/activate, cancellation, and hidden cancelled detail. Parallel renewals, rollback injection, expiry boundaries and full relation behavior remain incomplete. |
| Inventory | Category/product/movement routes and transactional initial stock exist. Harness tests ADMIN-only category create, STAFF denial, product create, initial movement and stock purchase. It also verifies sale/refund/cancel restore stock. Not all movement/rollback/race branches are covered. |
| Sales/refunds/cancellations | Sales, sale items, stock decrements, refund/cancel restoration and status locking exist. MariaDB tests cover API sale creation, refund, cancellation, exact-row concurrency waiters for duplicate refund/cancellation/inventory, and rollback/stock invariants. This is not browser E2E coverage. |
| Dashboard/reports | Dashboard and JSON/CSV report handlers exist; database-free validation covers supported report types and CSV projection. No end-to-end dashboard/report result set was verified on MariaDB. |
| Audit | Selected write paths exist; no audit-list API or complete cross-domain audit matrix is claimed. |
| WhatsApp, backups and scheduled operations | Reminder/message tables exist only. An ADMIN-only backup list/create/integrity/download/cleanup API and CLI-only isolated restore are implemented and locally tested; the backup manifest is a filesystem JSON file, not a database table. WhatsApp Graph API/webhooks/reminder processing, incremental/scheduled backups, HTTP restore, and PHP cron jobs remain absent; no delivery or scheduled job is claimed. Nest services remain PostgreSQL/VPS-specific and are not made Hostinger-compatible by these tables. |

## MariaDB 10.5 Compatibility Findings

1. **The existing Prisma client is PostgreSQL-only.** `schema.prisma` and `migration_lock.toml` specify PostgreSQL; `DATABASE_URL` and Nest setup expect PostgreSQL. MariaDB 10.5 requires a MySQL/MariaDB Prisma provider/client configuration and a separately generated/tested migration chain. Changing the URL alone is not a supported migration.
2. **The migration DDL is not executable on MariaDB as-is.** `CREATE TYPE ... AS ENUM` and `ALTER TYPE ... ADD VALUE` are PostgreSQL operations. The SQL uses double-quoted PostgreSQL identifiers; on MariaDB's usual SQL mode double quotes delimit strings, not identifiers. Translation must use validated MariaDB syntax/quoting and a new migration ledger.
3. **Enum alteration strategy must be designed.** MariaDB `ENUM` values are column definitions, not standalone PostgreSQL enum types. Adding `CORRECTION` requires changing the relevant column definition or choosing a portable string/check approach, with data and deployment ordering tested.
4. **Time semantics differ.** PostgreSQL migration fields are `TIMESTAMP(3)`; PHP uses `DATETIME(3)` and sets its MariaDB session timezone to UTC. `TIMESTAMP` conversion/session behavior is not identical to `DATETIME`; choose one representation, set UTC consistently, and test expiry/scheduling around timezone and daylight transitions. Hostinger timezone/session configuration is unconfirmed.
5. **Decimal precision is plausible but unverified on 10.5.** Prisma emits `DECIMAL(65,30)` for Decimal fields; the PHP plan baseline also declares it. MariaDB's maximum precision is 65, but monetary scale, rounding, bounds, and PHP string conversion require boundary tests under the host SQL mode.
6. **Boolean/integer and enum types need explicit mappings.** PostgreSQL `BOOLEAN`, integer types, and native enums do not have identical storage/driver behavior in MariaDB (`BOOLEAN` is a `TINYINT(1)` alias). Validate Prisma/PDO serialization and comparisons if the ORM provider is ever changed.
7. **`CHECK` constraints are included and locally verified.** The PHP schema includes nonnegative product stock and positive sale-item quantity checks. The MariaDB 10.5.29 harness verified both reject invalid writes in a rolled-back synthetic transaction. Hostinger's exact SQL mode/engine still needs confirmation.
8. **Foreign keys are present in the PHP schema but not complete Prisma parity.** The MariaDB harness successfully applied 10.5-compatible DDL and checked prerequisites. The PHP customer/subscription/product/sales relation delete rules exist in the chain; data import behavior, every FK action, and Hostinger InnoDB settings remain unverified.
9. **Collation changes actual uniqueness and search.** PHP DDL uses `utf8mb4_unicode_ci` for most tables and binary collation for selected plan/category/SKU/barcode/sale keys. Email, phone and other cross-engine uniqueness can differ from PostgreSQL. Existing data collision analysis has not been performed, and this chain must not be used for import without that work.
10. **Index sizing is not an immediate blocker for the present lockout table.** On `utf8mb4`, its composite primary key (`scopeType VARCHAR(16)`, `scopeKey VARCHAR(255)`) is approximately 1,084 bytes, below InnoDB's common 3,072-byte index limit; confirm actual row format/version and target settings. Future unique indexes over unrestricted Prisma `TEXT` require bounded column lengths or prefix/index redesign.
11. **Transaction semantics have meaningful local, limited evidence.** The MariaDB 10.5.29 harness exercised customer/subscription/inventory/sales/refund/cancel flows, failure/rollback behavior, and preserved exact-row lock wait assertions for concurrent refund, cancellation and inventory mutations. It does not establish all route races, parallel renewal/refresh safety, resource limits, or Hostinger contention.
12. **Identifier and reserved-word review is incomplete for a full schema.** Most table/column names are conventional snake/lower camel names, but `CompanySetting.key` should be quoted in all MariaDB DDL/query contexts. PostgreSQL quoted identifiers do not automatically map to case-preserving MariaDB behavior.
13. **JSON has no existing PostgreSQL JSONB model requirement in the final Prisma schema.** Audit `oldValues/newValues` are Prisma strings containing JSON text, and PHP stores encoded snapshots as `LONGTEXT`. Do not infer JSONB compatibility or add JSON conversion without deciding validation/query/index requirements.
14. **MariaDB 10.5 evidence is limited to the PHP proposal.** The full local compatibility harness passed against explicit 10.5.29 on a unique disposable datadir/database, including the current 18-table package chain and workflows below. This does not validate all 14 Prisma models/data parity, full Nest behavior, account-specific Hostinger configuration, or production readiness.

## Test Evidence And Gaps

**Current local run:** all 16 standalone PHP tests passed (exit 0), PHP syntax lint passed for all 27 PHP files (10 runtime + 17 tests), and `MariaDbCompatibilityTest.php` passed (exit 0) on the isolated MariaDB 10.5 runtime (10.5.29 build in the current run) after requiring an explicit `AWIK_MARIADB_BASEDIR`. It applied the proposed clean chain in order, verified 18 tables and the two CHECK constraints, tested first-admin creation/repeat refusal, role checks, customer CRUD/search, subscription lifecycle/history, inventory/product/movement, sales/refunds/cancellations, and retained the existing auth/token/lockout, rollback and exact-row concurrency assertions. The backup test additionally covers encrypted snapshot round-trip, integrity/corruption rejection, public-root storage rejection and ADMIN-only authorization. See `MIGRATION_STATUS.md` for the command/results and tested boundaries.

The harness creates a unique random temp datadir/database, binds loopback only, and removes only its own test root. The successful run left no server or run-specific datadir. One older diagnostic directory under the temp folder was preserved untouched; it is not from the successful run. No Hostinger/production database or installed MariaDB datadir was accessed.

These checks are not all-model Prisma parity, data import, complete route-role coverage, every rollback/race case, browser E2E, Hostinger LiteSpeed/PHP-FPM, secure environment injection, or an operational backup/restore rehearsal. `database/test-data.sql` remains synthetic fixture data and is not a production seed.

`database/test-data.sql` inserts synthetic records into `hostinger_migration_test_*` fixtures. It includes a placeholder token string and precomputed synthetic bcrypt hashes. It is not a production seed or evidence of application-schema parity.

## Remaining Risks And Hosting Questions

Reported, still requiring verification in hPanel or a documented staging test:

- MariaDB 10.5 exact patch/build, server character set, database/table/column default charset and collation.
- SQL mode (including strict mode and `ANSI_QUOTES`), timezone, InnoDB availability/configuration, row format, max index length, and foreign-key checks.
- Database maximum size, simultaneous connections, per-user connection limits, query/time limits, and import/upload limits through phpMyAdmin or other supported tools.
- Whether PHP 8.3.35 is enabled for both web/FPM and CLI; PDO, `pdo_mysql`, and `mbstring` availability. `mbstring` is required because PHP code calls `mb_strlen`; JSON, Hash/HMAC, PCRE, date/time, and password hashing functions are also used and should be verified as available in the actual PHP SAPI. OpenSSL is required by the backup API (AES-256-GCM); its availability and TLS support for database/network connections must be confirmed. zlib/gzip is required for backups, and PHP ZIP for XLSX.
- Database privileges available to separate migration and runtime users, and whether the host supports required DDL operations on the target account.
- Actual user/data migration policy from PostgreSQL, including UUID format, email case collisions, length restrictions, enum conversion, timestamps/timezones, and deleted-row handling.
- Whether MariaDB table names/collations and PHP document-root/private-file layout can be secured under the shared-hosting Apache/LiteSpeed stack.

Other unresolved application risks: no PHP table cleanup/retention plan for login attempts; no customer data migration; no full-schema backup/restore/rollback rehearsal; no proof of host resource limits against transaction contention; and no complete implementation of operations listed above.

## Remaining Validation Gates

1. Design and implement a MariaDB-specific migration ledger/schema-drift check before any existing database upgrade; keep this current chain fresh-empty-only.
2. Finish review of collation, lengths, decimals, timezone semantics and foreign-key/delete rules against Prisma before any data-import design. Never apply the PostgreSQL migrations to MariaDB.
3. Independently verify Hostinger PHP-FPM and CLI versions/extensions, secure env-variable injection, safe CLI provisioning, LiteSpeed rewrites, sibling `open_basedir`, MariaDB build/grants/SQL mode/collation/timezone, cron and limits. The account AI report is not independent validation.
4. Keep WhatsApp, scheduled/incremental backups, HTTP restore, jobs, mail, uploads and exports marked incomplete until handlers/integrations and tests exist. Do not schedule missing scripts.
5. Only after explicit approval, use isolated Hostinger staging with a new empty database and synthetic values; never use production for these checks.

**Next safe action:** review the local candidate package, then seek authoritative Hostinger documentation/panel evidence for the secure configuration and CLI execution gates. No Hostinger-side action is authorized or implied.

# AWIK NET Feature Parity And Migration Plan

## Current PHP API Route/Feature Parity (2026-10-14)

This current table supersedes the historical PHP status labels below. All HTTP paths include Nest's global `/api/v1` prefix. PHP-equivalent means a handler exists, not full Nest DTO, authorization, error, or audit parity. Database-backed status refers only to selected operations exercised on isolated MariaDB 10.5.29; standalone validation is called out separately.

| Nest controller routes | PHP counterpart | Current status and test evidence |
|---|---|---|
| Auth: `POST /auth/login`, `/refresh`, `/logout`, `/change-password`; `GET /auth/profile`; `PATCH /auth/profile`; `POST /auth/demo` | Login, refresh, logout, password change and profile GET/PATCH exist; demo does not | Login/refresh/logout/profile and lockout have MariaDB HTTP coverage; profile/change-password contracts have standalone tests. PHP token persistence/revocation differs from Nest stateless JWT; demo is 404. |
| Password recovery / email verification | Nest has no recovery or verification route in the inspected auth controller; PHP adds `POST /auth/forgot-password` and `/auth/reset-password` | Recovery standalone tests cover token secrecy, 30-minute expiry, generic responses, failed provider behavior, hashed email/IP throttles, password/session changes, invalid/expired/reused tokens and DB outage. MariaDB 10.5.29 HTTP tests cover request/reset and concurrent single-use redemption. No email-verification flow exists. Native PHP mail requires host configuration; actual Hostinger acceptance and recipient delivery are unverified. |
| Users: `GET/POST /users`, `PATCH/DELETE /users/:id`, `POST /users/:id/password` | All listed routes exist | MariaDB checks selected ADMIN/STAFF boundaries and persistence; standalone validation exists. Not every route/role/error permutation is covered. |
| Plans: `GET /plans`, `/plans/active`, `/plans/:id`; `POST /plans`; `PATCH/DELETE /plans/:id` | All six routes exist | Auth/API and plan contract tests plus MariaDB CRUD/access checks; not full Nest DTO/error parity. |
| Customers: `GET /customers/search`, `GET/POST /customers`, `GET/PATCH/DELETE /customers/:id` | All six routes exist | MariaDB create/list/search/detail/update and role checks; standalone validation. Deletion/filter/error cases are not exhaustive. |
| Subscriptions: `GET /subscriptions`, `/subscriptions/stats/refresh`, `/subscriptions/:id`; `POST /subscriptions`, `PATCH /subscriptions/:id`; `POST /subscriptions/:id/{renew,suspend,activate,cancel}` | All listed routes exist | MariaDB create, renew/history, suspend/activate/cancel checks plus standalone validation. Parallel renewal, all expiry boundaries and full failure/role matrix remain unverified. |
| Inventory aliases: `GET /inventory/{stats,categories,summary,movements}`, `POST /inventory/categories`, `PATCH/DELETE /inventory/categories/:id`; products: `GET /products/{lookup,low-stock,movements,:id,:id/movements}`, `GET/POST /products`, `PATCH/DELETE /products/:id`, `POST /products/:id/movements` | PHP exposes lifecycle routes under `/inventory` and products under `/products`; Nest's `/inventory-lifecycle` alias is not claimed | MariaDB product/category/movement and stock workflows, permission checks, constraints and concurrency; standalone validation. Alias equivalence and all role combinations remain gaps. |
| Sales: `GET /sales`, `/sales/:id`; `POST /sales`, `/sales/:id/{refund,cancel}` | All five routes exist | MariaDB transaction, stock restoration, rollback and exact-row refund/cancel concurrency checks; standalone sales validation. Not browser E2E. |
| Settings: `GET /settings`, `PATCH /settings/:key` | Both routes exist | Standalone settings validation and selected MariaDB role checks; not full route/error coverage. |
| Dashboard: `GET /dashboard/{kpis,revenue-chart,recent-activity,alerts}` | All four routes exist | Handler and validation source exist; complete MariaDB result-set and UI workflows are not established. |
| Reports: `GET /reports/{revenue,sales,customers,subscriptions,inventory,stock-movements,whatsapp}` and matching `/download` routes | All route families exist; CSV, generated PDF and XLSX downloads supported | Standalone tests exercise real CSV/PDF/XLSX bytes for all report projections, empty datasets, MIME/disposition, Unicode, formula-safe cells, and multi-page PDF xref integrity. MariaDB 10.5 tests exercise all seven report download queries, ADMIN/STAFF/anonymous authorization, date filters and live sales data in all formats; sales export asserts all 101 matching rows appear in CSV/PDF/XLSX. Revenue, sales and stock-movement downloads no longer silently cap rows; customer/WhatsApp bounds remain 20/50. Host ZIP extension, browser download, complete JSON/projection parity and large-export memory behavior remain unverified. |
| Audit: `GET /audit` | No PHP route | Selected audit writes exist, but audit listing/search and event parity are absent. |
| Financial: `GET /financial/overview` | No PHP route | Financial overview is absent. |
| WhatsApp: status, test connection, text/template/bulk send, templates, message/status/retry/stats, reminders/list/due/trigger, public GET/POST webhook | No PHP WhatsApp API routes | PHP dashboard reports stored pending-count and `configured=false`. No Graph API send, webhook signature, delivery status or reminder processing exists; no successful delivery is faked. Credentials, outbound HTTPS and signed-webhook configuration are prerequisites. |
| Backups: list/create/incremental/restore-token/restore/cleanup/integrity/download/schedule CRUD | PHP implements `GET /backups`, `POST /backups/create`, `GET /backups/integrity/:id`, `GET /backups/:id/download`, `POST /backups/cleanup`; no incremental, restore-token, restore or schedule CRUD route | Nest implementation is PostgreSQL/`pg_dump`-specific. PHP snapshots are AES-256-GCM + HMAC-SHA256 encrypted gzip JSON of ordered DDL/DML, stored outside and refused under the public root; restore is a CLI-only isolated-database workflow. Standalone backup tests plus create/list/integrity/download/cleanup smoke tests pass. Incremental/scheduled backups, schedule CRUD and HTTP restore remain absent, and Hostinger key injection/`openssl`/CLI restore remain unverified. |
| Scheduled work (not HTTP routes): Nest subscription-status refresh; WhatsApp queue/retry and reminder generation | `private/cron/cleanup-auth-state.php` only | Isolated MariaDB test verifies bounded cleanup of expired tokens/stale unlocked attempts, preservation of active locks/recent records, transaction and overlapping-run skip. No Nest scheduler parity or Hostinger cron execution is claimed. |
| Upload routes | No upload endpoint found in scanned Nest controllers or PHP | No backend upload contract found in scanned Nest API routes; frontend image/logo fields do not establish secure upload/storage. |

The detailed Nest controller route crosswalk and DTO/service descriptions below are historical source inventory. Their route definitions remain useful, but the old PHP parity labels and test counts are superseded by this current section.

**Date:** 2026-10-12  
**Scope:** Read-only Stage 2A planning. No database was created or contacted; no SQL/migration was run; no application code, DNS, environment, or hosting setting was changed.  
**Reference of truth:** `apps/web`, `apps/api` (NestJS), `packages/database/prisma/schema.prisma`, and its PostgreSQL migrations. The PHP prototype is incomplete.

> **Historical baseline, not current PHP status:** All PHP “Missing” labels and statements below describe the repository snapshot on 2026-10-12 and are superseded by the current route table above and evidence in `MIGRATION_STATUS.md`, `DATABASE_READINESS.md`, and `DEPLOYMENT_READINESS.md`. The PHP migration includes auth/token lifecycle, ADMIN users/permissions, plans/settings, customers, subscriptions, inventory, sales/refunds/cancellations, dashboard, JSON/CSV/PDF/XLSX report downloads, CLI auth-state cleanup, PHP-only password recovery, and an ADMIN-only backup API (list/create/integrity/download/cleanup) with CLI-only isolated restore. Password recovery and backups are not full Nest parity. The current gaps include `/auth/demo`, audit listing, financial overview, full NestJS authorization/audit parity, verified email delivery, WhatsApp delivery/webhooks/reminders, incremental/scheduled backups and HTTP restore, subscription and other scheduled jobs, uploads, existing PostgreSQL data migration, and unverified Hostinger behavior. This note does not claim full parity or deployment readiness.

## Historical Executive Summary (superseded by the current route table above)

The agreed target is Hostinger Premium shared hosting, PHP 8.3-compatible code, and MariaDB 10.5. The Hostinger facts were supplied as account-check output and are not compatibility evidence. The current PHP prototype implements auth and plan slices only. It does not implement the data model or routes for customers, subscriptions, inventory, POS/sales, reports, settings, users, audit listing, backups, WhatsApp, webhooks, or scheduled work.

NestJS has 104 controller method declarations across 15 controllers. The inventory controller is mounted at two prefixes, so those seven handlers expose an additional seven alias paths. PHP currently has 12 corresponding paths: six auth paths and six plan paths. It has no equivalent for the other Nest routes. The PHP routes are similar in name and some contracts, but differences exist in token rotation/revocation, validation, audit behavior, and failure behavior; matching route names alone is not parity.

The Prisma source uses PostgreSQL and the four migration files contain PostgreSQL DDL. MariaDB 10.5 needs a designed and independently tested schema/migration implementation. The previous PHP report records a local MariaDB 13.0.2 auth/plan run; this Stage 2A task ran no tests. Neither report demonstrates Hostinger/MariaDB 10.5 compatibility or complete application parity.

## Status Definitions

- **Implemented and evidenced:** source implementation exists and repository documentation records relevant local evidence; this does not imply Hostinger or MariaDB 10.5 validation.
- **Partially implemented:** a subset exists, or matching source exists but meaningful parity/coverage is missing.
- **Missing:** no PHP implementation/equivalent was found.
- **Not verified:** evidence is insufficient to decide compatibility or operational behavior.

## Frontend Pages And Workflows

Current source page inventory (route groups are omitted from public URLs):

| Frontend route | User workflow represented | API/data dependency observed or implied |
|---|---|---|
| `/` | Entry/redirect according to client auth state | Auth store |
| `/login` | Phone/email login, password, optional demo login | `auth/login`, `auth/demo` |
| `/dashboard` | KPIs, sales/inventory summaries, low-stock indicators | Dashboard, sales, inventory, products |
| `/customers` | Search/list customers and delete | Customer search/list/delete |
| `/customers/new` | Create customer, collect map/GPS location, choose plan and create subscription | Customer create, plan list, subscription create |
| `/customers/view` | View/edit customer, related sales/subscription; create/assign/renew/suspend/reactivate subscription | Customer detail/update, sales, plans, subscriptions |
| `/plans` | List, create/edit, activate/deactivate plans | Plan list/create/update |
| `/subscriptions` | Search/list; edit, renew, suspend, reactivate, cancel | Subscription list/detail/update/renew/state operations |
| `/inventory` | Product/category management, low-stock and restock/movement actions, camera/USB barcode workflows | Inventory, products, categories, lookup, movements |
| `/inventory/movements` | Search/filter/paginate stock ledger | Product/inventory movement reads |
| `/sales` | Search/list sales and cancel | Sales list/cancel |
| `/sales/detail` | Sale detail and refund/cancel flow using query identity | Sale detail/refund/cancel |
| `/sales/invoice` | View/print invoice by query identity | Sale detail and company settings |
| `/sales/pos` | Product search/scanning, cart, optional customer, payment method, checkout and receipt | Product lookup/list, customer search, sale create |
| `/reports` | Report navigation | Reports |
| `/reports/revenue` | Revenue analysis | Revenue report |
| `/reports/customers` | Customer and financial overview | Customer report, financial overview |
| `/reports/inventory` | Inventory/asset report | Inventory report, lifecycle stats |
| `/settings` | Settings navigation | Settings |
| `/settings/backups` | Backup listing, create/restore/cleanup actions | Backups API, admin role |
| `/settings/company` | Company profile/settings edit | Settings read/update |
| `/settings/profile` | Profile and password change | Auth profile/update/change-password |
| `/settings/print` | Receipt/print configuration | Settings plus browser printer preferences |
| `/whatsapp` | Message/status overview | WhatsApp messages/stats |
| `/whatsapp/connect` | Configure/test WhatsApp, test send, inspect/trigger reminders | WhatsApp status/test/send/reminders and settings |
| `/whatsapp/messages` | Compose/send/search message history | WhatsApp send/messages |
| `/whatsapp/reminders` | Filter reminders and trigger due reminders | WhatsApp reminders/due/trigger |
| `/whatsapp/templates` | Browse/search/create templates | WhatsApp templates/settings |

No responsive-browser or complete UI end-to-end suite was run for this audit. The source inventory contains 28 pages. The current UI calls APIs that do not exist in the PHP prototype.

## Feature-Parity Matrix

| Feature | Status | Evidence and gap |
|---|---|---|
| Authentication | Partially implemented | PHP has login/profile/profile update/password change/refresh/logout and lockout code. `demo` is missing. Nest uses stateless JWT generation and audit events; PHP persists token hashes, rotates/revokes refresh tokens, revokes all tokens on logout/password change, and does not emit equivalent auth audit records. These are behavioral differences. |
| Roles and permissions | Partially implemented | PHP plan reads allow ADMIN/STAFF and plan writes require ADMIN. No PHP user administration, complete route guard matrix, or all feature RBAC exists. |
| Customers | Missing | No PHP customer table or routes. |
| Plans | Implemented and evidenced | PHP has all six plan paths and the source/previous migration report records auth/plan tests. Evidence is limited to the PHP slice and local MariaDB 13.0.2, not MariaDB 10.5; no subscription FK exists. |
| Subscriptions | Missing | No PHP table/routes/status lifecycle. |
| Renewals | Missing | No `subscription_renewals`, history writes, or reminder reset. |
| POS sales | Missing | No sales/product data layer in PHP. |
| Sale items | Missing | No item rows or transactional sale creation in PHP. |
| Refunds and cancellations | Missing | No PHP sale status transitions or stock restoration. |
| Inventory | Missing | No PHP categories/products schema/routes. |
| Stock movements | Missing | No PHP movement ledger or stock transaction implementation. |
| Reports and exports | Missing | No PHP report/CSV/PDF/Excel implementation. |
| Company settings | Missing | No `company_settings` PHP table/routes. |
| Audit logs | Partially implemented | PHP has an audit table and plan-related write paths only. No audit listing and no complete user/customer/sales/inventory/subscription/auth event parity. |
| Backups | Missing | PHP has no backup API. Nest backup service is PostgreSQL-specific. |
| Webhooks | Missing | PHP has no WhatsApp webhook verification/signature handler or message-status updates. |
| WhatsApp functionality | Missing | PHP has no WhatsApp persistence, Graph API integration, templates, retries or reminder routes. |
| Scheduled jobs | Missing | PHP has no scheduler. Nest has subscription status refresh and WhatsApp jobs. Backup schedule endpoints persist JSON metadata but no backup scheduler execution was found. |
| File uploads | Not verified | No Nest `FileInterceptor`/`UploadedFile` route was found in the scanned controllers. Frontend image/logo fields exist; no PHP upload/storage contract or limits are implemented. |
| External integrations | Missing in PHP | Nest WhatsApp Cloud API uses outbound Graph API calls; PHP has no equivalent. No PHP mail integration was found. |

## NestJS API Route Crosswalk

All paths below include the global `/api/v1` prefix. Input DTOs are subject to the Nest global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, transform) and `SanitizePipe`; errors are mapped by `HttpExceptionFilter`. Auth is enforced globally except `@Public` routes. The global `TransformInterceptor` wraps successful values in `{ success: true, data }` (or preserves paginated metadata). Missing PHP routes fall through to its generic 404 path; they do not gain the Nest DTO validation or feature authorization checks.

**PHP-equivalent routes**

| Nest route | Nest validation/access and data behavior | PHP equivalent and actual behavior | PHP tests/evidence |
|---|---|---|---|
| `POST /auth/login` | Public; account-lockout and local-auth guards; 10 requests/minute throttler; `LoginDto` requires string identifier max 254 and password 6–128; supports legacy `phone`/`email`; resolves user, updates lastLoginAt, generates tokens and logs LOGIN audit. | `POST /api/v1/auth/login`. Manually accepts identifier/emailOrPhone/phone/email plus password, checks required/length bounds, normalizes, enforces account/IP throttles, parameterized user lookup, verifies password and emits tokens. Uses a PHP-only token table and generic errors. It does not exactly mirror Nest's `emailOrPhone` acceptance, audit writes, or stateless token semantics. | Auth/HTTP/MariaDB test files exist; `MIGRATION_STATUS.md` reports previous SQLite/MariaDB 13.0.2 runs. Not run in this task. |
| `POST /auth/refresh` | Public; `RefreshTokenDto` requires nonempty string; JWT verification, active user lookup and new token generation. Nest does not persist/revoke refresh tokens in this service. | `POST /api/v1/auth/refresh`. Requires token, verifies JWT type/signature and matching persisted unrevoked hash, then transactionally revokes old refresh row and persists new tokens. This is stateful one-time rotation unlike Nest's current stateless refresh behavior; concurrent replay behavior needs separate test. | Auth/MariaDB test files exist; prior status reports rotation/replay checks. Not run here. |
| `POST /auth/demo` | Public; no body DTO; `AuthService.demoLogin` permits dev or explicitly enabled demo mode, records login audit. | No equivalent PHP route; unknown route returns 404. | No PHP demo route/test. |
| `POST /auth/logout` | Authenticated; current user; logs LOGOUT but does not revoke previously issued stateless JWTs in this service. | `POST /api/v1/auth/logout`; requires a valid persisted bearer token and revokes every active token for that user. Stronger/different semantics than Nest. | Auth/MariaDB test files exist; prior status reports logout revocation check. Not run here. |
| `GET /auth/profile` | Authenticated; sanitized profile projection. | `GET /api/v1/auth/profile`; requires bearer JWT plus unrevoked token hash and active user, returns profile projection. | Auth/HTTP/MariaDB test sources; prior run reported, not re-run. |
| `PATCH /auth/profile` | Authenticated; `UpdateProfileDto`; global whitelist rejects unknown fields; optional names/email with type/length/email constraints; lowercases/conflict-checks email. | `PATCH /api/v1/auth/profile`; manual validation for names/email and conflict check; unknown fields are ignored rather than rejected. Returns a projection. | Auth contract test source; prior report says profile update checked. Not re-run. |
| `POST /auth/change-password` | Authenticated; `ChangePasswordDto`; current/new/confirm strings, new password min 8; verifies current password, updates hash, emits audit. | `POST /api/v1/auth/change-password`; checks current password, new min 8 and confirmation; updates hash and revokes all PHP tokens. No equivalent audit event. | Auth contract test source; previous status says password-change/revocation checked. Not re-run. |
| `GET /plans/active` | ADMIN/STAFF; no DTO; active, nondeleted plans sorted by price. | `GET /api/v1/plans/active`; bearer auth and ADMIN/STAFF check; active/nondeleted query; success wrapper. | Plan/MariaDB test sources; prior report says plan paths tested on SQLite/MariaDB 13.0.2. Not run here. |
| `GET /plans` | ADMIN/STAFF; `QueryPlanDto`; list/search/activity filter/sort/pagination. | `GET /api/v1/plans`; hand validation, search/filter/sort/pagination and bounded limit. Some invalid `isActive` strings become false rather than validation errors; response shape must be compared by contract. | Plan/MariaDB tests present; prior status reports list/search/pagination/sort checks. Not run. |
| `GET /plans/:id` | ADMIN/STAFF; path id is a string; active plan lookup or 404. | `GET /api/v1/plans/:id`; same broad lookup/404 behavior and role check. | Plan tests present; not run now. |
| `POST /plans` | ADMIN only; `CreatePlanDto` requires name/speed, numeric duration >=1 and price >=0, optional description/currency/boolean. Writes Plan and audit. | `POST /api/v1/plans`; manual whitelist/type/minimum checks, duplicate lookup, insert, best-effort plan audit. Fractional duration can reach a runtime/storage error and return 500, while Nest DTO accepts numeric fractions before ORM persistence. | Plan tests present; prior status says CRUD/validation/audit tested. Not run now. |
| `PATCH /plans/:id` | ADMIN only; `UpdatePlanDto`; partial validation; update/audit. | `PATCH /api/v1/plans/:id`; manual validation/allowed fields, duplicate lookup, update and best-effort audit. | Plan tests present; not run now. |
| `DELETE /plans/:id` | ADMIN only; soft-delete in service, audit. | `DELETE /api/v1/plans/:id`; sets deletedAt and inactive, audit. | Plan tests present; not run now. |

**Missing PHP route families.** Each listed Nest path has no corresponding PHP handler, feature-specific PHP validation, feature authorization, database operation, or PHP route test. The PHP fallback is 404 when PDO connects; `awikHandleRequest` opens the database before route dispatch, so a database outage can instead produce its generic 500 for an unmatched route. DTOs/roles shown identify the Nest source contract; successful Nest responses pass through the transform interceptor, while Nest errors use the common error filter.

| Controller / Nest routes | Nest validation and access | Nest service/data operations and PHP result |
|---|---|---|
| `GET /audit` | ADMIN; `QueryAuditDto`. | AuditService paginated filter/search and user join; PHP audit table only has plan write usage. |
| `GET /backups`; `POST /backups/create`; `POST /backups/incremental`; `POST /backups/restore-token`; `POST /backups/restore/:id`; `POST /backups/cleanup`; `GET /backups/integrity/:id`; `GET /backups/:id/download`; `GET /backups/schedule`; `POST /backups/schedule`; `DELETE /backups/schedule/:id` | All ADMIN. Uses QueryBackupDto, RestoreBackupDto, CleanupBackupDto, CreateScheduleDto or plain description; restore additionally requires confirmation and time-limited token. | Filesystem manifest/list/checksum/encrypt/decrypt/restore/cleanup and schedule JSON. Backup service reads PostgreSQL DATABASE_URL and uses `pg_dump`/`psql`; no PHP implementation. |
| `GET /customers/search`; `GET /customers`; `GET /customers/:id`; `POST /customers`; `PATCH /customers/:id`; `DELETE /customers/:id` | ADMIN/STAFF. QueryCustomerDto, CreateCustomerDto, UpdateCustomerDto; phone/WhatsApp E.164, email, optional profile/location fields. | Customer search/list/detail/create/update/soft-delete and subscription/sales/reminder relations; PHP missing. |
| `GET /dashboard/kpis`; `GET /dashboard/revenue-chart`; `GET /dashboard/recent-activity`; `GET /dashboard/alerts` | ADMIN/STAFF. Revenue chart accepts period; others mostly no body DTO. | Aggregates users/customers/subscriptions/sales/products/movements/WhatsApp and alert counters; PHP missing. |
| Both prefixes `/inventory` and `/inventory-lifecycle`: `GET /stats`; `GET /categories`; `POST /categories`; `PATCH /categories/:id`; `DELETE /categories/:id`; `GET /summary`; `GET /movements` | Read ADMIN/STAFF; category writes ADMIN. CreateCategoryDto, UpdateCategoryDto, QueryStockMovementDto. | Lifecycle metrics/category CRUD/summary/stock-movement query; PHP missing. The controller is mounted under both prefixes, exposing alias URLs. |
| `GET /products/lookup`; `GET /products/low-stock`; `GET /products`; `GET /products/movements`; `GET /products/:id/movements`; `GET /products/:id`; `POST /products`; `PATCH /products/:id`; `DELETE /products/:id`; `POST /products/:id/movements` | Base ADMIN/STAFF. Product writes/create are ADMIN/STAFF; delete ADMIN. QueryProductDto, QueryStockMovementDto, CreateProductDto, UpdateProductDto, CreateStockMovementDto (including SKU, numeric and movement constraints). | Product/category lookups, CRUD/soft delete, low stock, summary, movements, stock adjustments and audit. PHP missing. |
| `GET /users`; `POST /users`; `PATCH /users/:id`; `POST /users/:id/password`; `DELETE /users/:id` | ADMIN only. QueryUserDto, CreateUserDto, UpdateUserDto, ChangeUserPasswordDto. | User administration, uniqueness, password update and audit; PHP has auth identity storage but no administrative User routes. |
| `GET /financial/overview` | ADMIN/STAFF; no body DTO. | Financial aggregate over sales/customer/subscriptions; PHP missing. |
| `GET /reports/revenue`; `/reports/sales`; `/reports/customers`; `/reports/subscriptions`; `/reports/inventory`; `/reports/stock-movements`; `/reports/whatsapp`; matching seven `/download` paths | ADMIN for revenue/subscriptions/WhatsApp; ADMIN/STAFF for sales/customers/inventory/stock-movements. QueryReportDto; downloads accept `format=pdf|excel|csv` and date filters. | Report queries use all domain models; export service generates PDF/XLSX/CSV. PHP missing. |
| `GET /sales`; `GET /sales/:id`; `POST /sales`; `POST /sales/:id/refund`; `POST /sales/:id/cancel` | ADMIN/STAFF. QuerySaleDto, CreateSaleDto with nested CreateSaleItemDto (positive integer quantities, payment-method allowlist); refund/cancel accept reason. | Sale/items list/detail/create/refund/cancel, stock updates, movements, audit; PHP missing. |
| `GET /settings`; `PATCH /settings/:key` | GET ADMIN/STAFF, PATCH ADMIN. UpdateSettingDto. | CompanySetting read/upsert; PHP missing. |
| `GET /subscriptions`; `GET /subscriptions/stats/refresh`; `GET /subscriptions/:id`; `POST /subscriptions`; `PATCH /subscriptions/:id`; `POST /subscriptions/:id/renew`; `POST /subscriptions/:id/suspend`; `POST /subscriptions/:id/activate`; `POST /subscriptions/:id/cancel` | Base ADMIN/STAFF; refresh ADMIN. QuerySubscriptionDto, CreateSubscriptionDto, UpdateSubscriptionDto, RenewSubscriptionDto; state actions have no body DTO. | List/detail/status recompute/create/update/renew/suspend/activate/cancel, customer/plan relations and renewal history; PHP missing. |
| `GET /whatsapp/status`; `POST /whatsapp/test-connection`; `POST /whatsapp/send`; `POST /whatsapp/send-template`; `POST /whatsapp/bulk-send`; `GET /whatsapp/templates`; `POST /whatsapp/templates`; `GET /whatsapp/messages`; `GET /whatsapp/messages/:id/status`; `POST /whatsapp/retry/:id`; `GET /whatsapp/stats`; `GET /whatsapp/reminders`; `GET /whatsapp/reminders/due`; `POST /whatsapp/reminders/trigger`; `GET /whatsapp/webhook`; `POST /whatsapp/webhook` | Base ADMIN/STAFF; connection test and template write ADMIN; webhook verification/POST public. DTOs include SendMessageDto, SendTemplateDto, BulkSendMessageDto, QueryWhatsAppDto, SaveWhatsAppTemplateDto; POST webhook verifies HMAC signature and GET verifies challenge/token. | Settings/message/reminder persistence, Graph API send/retry, signed status webhook, template management. PHP missing. |

Nest's common guards validate JWT and roles; route-specific `@Public` bypasses JWT. The common validation pipe rejects unknown DTO properties. The common error filter logs unexpected errors server-side and returns a sanitized `{success:false,statusCode,message,errors,timestamp,path}` response. No PHP equivalent exists for these 92 controller methods.

## Service Operations, Integrations, And Scheduled Work

Public service operations in Nest (in addition to the route crosswalk):

- **Auth:** login, refresh, demo login, logout, profile read/update, change password, token generation.
- **Users:** list/create/update/change another user's password/delete.
- **Customers:** list/search/detail/create/update/soft-delete.
- **Plans:** list/active/detail/create/update/soft-delete.
- **Subscriptions:** scheduled status refresh; list/detail/create/update/renew/suspend/activate/cancel/manual refresh; expiry-warning calculation.
- **Inventory:** lifecycle/category operations; product list/lookup/low-stock/summary/detail/create/update/soft-delete; movement query/create/product history.
- **Sales:** list/detail/create/refund/cancel.
- **Dashboard:** KPI/revenue chart/recent activity/alerts and stock-value helpers.
- **Reports:** revenue/sales/customers/subscriptions/inventory/stock-movement/WhatsApp reports and PDF/XLSX/CSV exports; financial overview.
- **Settings and audit:** settings read/category/update; audit log, login audit, filtered audit list.
- **Backups:** full/incremental backup, restore tokens/restore, list, retention cleanup, schedule metadata CRUD, integrity/checksum, encrypt/decrypt.
- **WhatsApp:** status/config reload/test, text/template/bulk/media send, templates, messages/status/stats, due reminders, retry, webhook status update.

Scheduled work found:

- `SubscriptionsService.refreshStatusesOnSchedule`: hourly (`0 * * * *`).
- `WhatsAppSchedulerService.processPendingMessages`: every five minutes (`*/5 * * * *`).
- `WhatsAppSchedulerService.generateAndSendReminders`: hourly (`0 * * * *`).
- Nest cache cleanup uses an in-process 30-second interval.
- Backup schedule endpoints persist schedule metadata in a JSON file; a worker that executes those stored backup schedules was not found. Do not treat the API's schedule CRUD as a working scheduler.

External integration: WhatsApp Cloud API outbound Graph requests plus inbound GET challenge and signed POST status webhook. PHP has none of these. No file-upload interceptor was found in API controllers; image URL fields do not by themselves implement secure file uploads.

Browser/device integrations are separate from backend routes: the frontend uses browser geolocation, camera/barcode scanning, local printing/scanner devices, and map tiles. These require browser permissions/secure-origin policy and external map asset availability; no PHP backend implementation substitutes for them.

## MariaDB 10.5 Schema Migration Plan

This is a design plan only. No SQL was written or executed. Translate the final Prisma schema, not only the initial migration, and preserve Nest/PostgreSQL as the source of truth.

### Type And DDL Rules To Approve

- Use InnoDB for all relational tables. Map UUID strings to one consistent exact representation (candidate `CHAR(36)` with consistent ASCII/binary collation) only after confirming all source IDs are canonical UUID text; do not silently rewrite IDs.
- Map PostgreSQL `String` to MariaDB `TEXT` by default. Any full unique/indexed string needs a deliberate bounded `VARCHAR` length based on validated source maxima; prefix indexes are not equivalent uniqueness. This applies to user/customer phone/email, SKU/barcode, category name, sale number, settings key, and other unique strings.
- Map `Float` to `DOUBLE`; `Int` to `INT`; `Boolean` to `TINYINT(1)`; Prisma Decimal to `DECIMAL(65,30)` unless the business approves a smaller monetary precision. Validate all scales/ranges and rounding.
- Store application timestamps as UTC `DATETIME(3)` consistently, write `createdAt` defaults at millisecond precision, implement `updatedAt` semantics explicitly, set DB session timezone to UTC, and serialize API dates as ISO-8601 UTC. PostgreSQL `TIMESTAMP(3)` behavior is not interchangeable with MariaDB `TIMESTAMP` session conversion.
- Map all five enums with the exact values. If using MariaDB `ENUM`, design forward changes such as `CORRECTION` as explicit column-alter migrations. Alternatively use bounded `VARCHAR` plus enforced checks; choose one consistently and test constraints.
- Set charset/collation per table and critical indexed text column deliberately. Reproduce intended case sensitivity and audit collisions before import. `utf8mb4_unicode_ci` is not equivalent to PostgreSQL's default text uniqueness.
- Use backticks for MariaDB identifiers, especially keyword-like `key`; do not run double-quoted PostgreSQL migration SQL under unknown SQL mode.
- Preserve defaults, nullability, soft-delete behavior, FKs, and exact `ON DELETE` actions. Do not add a relation where Prisma has none (for example renewal user/plan history IDs) without a separately approved behavior change.

### Model DDL Target Map

| Model | MariaDB 10.5 target fields/type families | Unique/check/index/foreign-key requirements |
|---|---|---|
| User | All Prisma User fields; canonical UUID id; bounded indexed email/phone after source-data length review; text names/hash or validated bounded fields; role/status enum; UTC `DATETIME(3)`. | Unique nullable email and unique phone; indexes phone/role/status; preserve audit/stock-movement/sale relationships and user deletion action (`SET NULL` for nullable relations). |
| Customer | All final fields including email, WhatsApp number, address/area/city/location/notes, latitude/longitude, status, timestamps/deletedAt. | Unique phone; indexes phone/status/city; FKs to subscriptions/sales/reminders/messages with specified delete rules. |
| Plan | All fields; `durationDays INT`; `price DECIMAL(65,30)`; active flag and timestamps. | `isActive` index; Subscription FK `RESTRICT`; no DB unique name constraint in Prisma. Keep app duplicate-check semantics but resolve concurrency behavior. |
| Subscription | Customer/plan IDs, dates, status enum, payment status, notes, last renewal date, timestamps/deletedAt. | Index customer/status/expiry; Customer FK `CASCADE`; Plan FK `RESTRICT`; relationships to reminder and renewal history. |
| SubscriptionRenewal | All history fields and UTC `DATETIME(3)` values. | Index subscriptionId/createdAt; Subscription FK `CASCADE`; no FK on userId or previousPlanId/newPlanId in Prisma. |
| WhatsAppReminder | IDs, reminder enum, scheduled/sent datetimes, status/error/createdAt. | Unique `(subscriptionId, reminderType)`; customer/status/scheduled indexes; Subscription and Customer FKs `CASCADE`. |
| WhatsAppMessage | Recipient, optional Customer ID, body/status/external ID/errors/retries/sent-delivered-read/scheduled/reference/template/created fields. | Index recipientPhone/status/sentAt; Customer FK `SET NULL`; choose text capacities and delivery idempotence rules. |
| InventoryCategory | ID/name/description/createdAt. | Unique name; ensure collation reflects source semantics; Product FK `RESTRICT`. |
| Product | All fields including SKU/barcode, category, image URL, purchase/sale decimals, stock/min stock/unit/active/timestamps/deletedAt. | Unique SKU and nullable unique barcode; indexes SKU/barcode/category/active; category FK `RESTRICT`; enforced `currentStock >= 0` check. |
| StockMovement | Product/user IDs, movement enum, quantity/before/after, reference/notes/time. | Product/movementType/createdAt indexes; Product FK `CASCADE`; User FK `SET NULL`; preserve correction enum and signed adjustment semantics. |
| Sale | Sale number, optional customer/user, total decimal, currency/payment/status/notes/timestamps. | Unique saleNumber; customer/createdAt indexes; Customer/User FKs `SET NULL`. |
| SaleItem | Sale/product IDs, quantity, unit/total decimals, createdAt. | saleId/productId indexes; Sale FK `CASCADE`; Product FK `RESTRICT`; enforced `quantity > 0`. |
| CompanySetting | ID, key, value, description, created/updated timestamps. | Unique quoted key; select key length/collation and support atomic upsert semantics. |
| AuditLog | ID/user/action/entity/entityId/old/new/IP/agent/created. JSON snapshots remain encoded text unless a queryable JSON design is approved. | user/action/entity/created indexes; User FK `SET NULL`; decide storage lengths without truncation. |

### Ordered MariaDB Migration Sequence

1. **Architecture contract and data dictionary:** approve field lengths, identifier representation, timezone policy, collations, enum strategy, SQL mode assumptions, audit guarantee, and all delete behaviors. Keep a crosswalk back to each Prisma model/field.
2. **MariaDB baseline migration:** create all 14 model tables and 5 enum equivalents in FK-safe order, with defaults/indexes/unique constraints and InnoDB. Include nullable/relation behavior exactly.
3. **Safety-constraint migration:** add/enforce nonnegative stock and positive sale-item quantity checks; prove invalid writes fail.
4. **Enum expansion migration:** add `CORRECTION` to StockMovementType using the chosen MariaDB enum strategy without reusing PostgreSQL `ALTER TYPE`.
5. **Customer location and renewal migration:** add email/location/latitude/longitude and create SubscriptionRenewal with its indexes/FK.
6. **PHP auth-hardening migration:** add `awik_login_attempts` only after the complete baseline; keep its existing table/index semantics and account/IP reset behavior.
7. **Data conversion, if ever approved:** analyze/resolve text lengths and collation collisions before loading synthetic/approved source data; do not include source data in schema-parity testing.
8. **Ledger and rollback model:** keep MariaDB migrations in their own ordered ledger. Back up before each forward migration. Use a validated restore to a separate disposable DB as rollback; do not assume PostgreSQL down migrations or destructive table drops are safe.

## Critical Invariants And Concurrency Requirements

1. **Sale creation:** within one InnoDB transaction, conditionally decrement every product only when `currentStock >= quantity`, create Sale and SaleItems, and insert corresponding SALE StockMovements. If any step fails, none commit. Re-read resulting stock in the transaction. Two concurrent checkouts must never oversell or lose a movement.
2. **Refund/cancel:** transactionally claim the sale only if status is still COMPLETED, transition exactly once, increment stock for every line, and insert RETURN movements. Parallel refund/cancel attempts must have one winner; losing request must not alter stock.
3. **Manual stock movement:** update stock and ledger row in one transaction with an atomic increment/decrement/conditional nonnegative check. Current Nest code reads stock before its transaction and later writes an absolute value; concurrent manual movements can race. Preserve the external contract while fixing/proving this invariant in the PHP implementation.
4. **Customer plus initial subscription:** the current frontend creates the customer, then makes a separate request to create its selected subscription. If the second request fails, the customer remains without the subscription the form promised. Acceptance requires an atomic backend operation or an explicitly tested idempotent/compensation flow; do not treat the UI sequence as transactional.
5. **Subscription renewal:** transactionally update plan/dates/status, create immutable SubscriptionRenewal history, and clear or regenerate reminders. Concurrent renewals need a row lock or conditional update so history matches the final subscription state. Current Nest read occurs before transaction; test the race rather than copying it blindly.
6. **Audit consistency:** Nest `AuditService.log` and `AuditInterceptor` are deliberately best-effort and outside business transactions. Decide whether PHP must preserve this availability-first behavior or provide stronger guarantees (transactional audit row/outbox). At minimum, never record a committed financial mutation as rolled back or lose audit rows silently without an explicit policy; test audit-store outage behavior.
7. **Unique/foreign-key invariants:** enforce unique phones/emails/SKUs/barcodes/sale numbers/settings keys and FKs at the database layer, not only preflight application SELECTs. Test concurrent duplicate inserts and all cascade/restrict/set-null paths.
8. **Idempotency and external effects:** WhatsApp sends/webhook status changes must tolerate duplicate/reordered callbacks and retries without double side effects; do not hold DB locks while waiting for external Graph API responses.
9. **Refresh-token rotation:** PHP token rows are stateful; conditionally consume exactly one refresh record inside the transaction and check affected-row count to prevent parallel replay. Nest's current refresh is stateless, so parity/security behavior needs an explicit decision.

## Input Validation, Authorization, Response, And Test Acceptance

### Cross-Cutting API Contract

- Mirror Nest global validation: DTO whitelist, unknown-property rejection, type conversion rules and sanitizer behavior. Keep route-specific constraints (E.164 phone, enum values, numeric ranges, date strings, nested sale items, pagination bounds) and response projections.
- Mirror global JWT/role rules per route, public exceptions only where explicitly intended (login/refresh/demo and signed webhook endpoints), and actor ID attribution.
- Match success wrapping and HTTP status codes through `TransformInterceptor`; match error envelope/status and validation errors through `HttpExceptionFilter`. Do not expose SQL/PDO internals.
- Add a per-route PHP test asserting valid input, invalid/missing/unknown input, anonymous access, ADMIN/STAFF access, not-found/conflict behavior, response shape and persistence side effects.

### Functional And Data Acceptance

- All 104 Nest controller methods (111 URL paths including inventory aliases) have documented PHP route equivalents and contract tests. All current frontend workflows complete against PHP with no mock-only pages or missing endpoints.
- Role/permission tests cover every endpoint and role, including user administration, ADMIN-only reports/settings/backups and ADMIN/STAFF workflows.
- Fresh MariaDB 10.5 schema tests assert all 14 tables, five enum domains, fields/nullability/defaults,  indexes/uniques/checks/FKs/actions and migration ledger order.
- CRUD tests cover each model, soft-delete/restore semantics, decimal boundary values, timestamps, field lengths, collation collisions, and unique key races.
- Transaction tests inject failure at each step of sale, refund, cancel, manual movement, product initial stock, and renewal. Assert all-or-nothing writes and exact stock/history/audit state after rollback.
- Parallel tests prove no oversell, duplicate refund, lost stock update, duplicate renewal history, or replayed refresh rotation.
- Integration tests exercise Graph API behavior through a mock, webhook signature/duplicate/out-of-order status events, retry/backoff and scheduler restarts without real customer messaging.
- Backup acceptance includes encrypted backup, checksum verification, restore into a new isolated DB, row/constraint comparison, agreed RPO/RTO, and tested recovery from interrupted migration. Never use production data in these tests.
- Performance/load criteria must be set after Hostinger database-size/connection/request limits are confirmed. Test representative read/write concurrency and scheduler load against those limits; do not invent a passing threshold.

### Test Evidence Status

No tests were run in this task. Four PHP test files exist (`AuthApiContractTest.php`, `HttpEntrypointTest.php`, `PlanApiContractTest.php`, `MariaDbCompatibilityTest.php`); prior migration documentation reports them or their MariaDB runner passing for limited auth/plan behavior on SQLite/MariaDB 13.0.2. Those historical claims are not MariaDB 10.5 or complete-feature evidence. The API source contains only two `.spec.ts` files found by inventory (dashboard service and cache service), no route-wide Nest e2e suite was found, and the frontend has an auth-storage test but no comprehensive browser flow suite.

## Dependency-Ordered Implementation Roadmap

1. **Architecture and schema design:** approve the service topology and route contract; finish the Prisma-to-MariaDB field/constraint/collation/enum crosswalk; document data conversion and audit/token semantics; confirm Hostinger limits. Do not change source schema.
2. **Database migration implementation:** write a MariaDB-specific baseline and ordered forward migrations for all models. Validate them first in an isolated local MariaDB 10.5-compatible instance after explicit approval. Add a migration ledger, least-privilege roles, backup-before-migration and restore rollback procedures.
3. **PHP business-logic port:** implement data-access/repositories and routes in dependency order: users/auth/permissions; customers/plans; subscriptions/renewals; inventory/categories/products/movements; sales/items/refunds/cancellations; settings/audit; reports/exports; backups; WhatsApp/webhooks/jobs. Keep critical mutations transactional.
4. **Frontend/API integration:** replace/resolve API contracts without removing the Nest/PostgreSQL source of truth; route all UI workflows to the selected PHP API; resolve demo login, response shape, error display and auth refresh semantics; remove stale export assumptions only after review.
5. **Automated testing:** route/DTO/role contract suite; full schema/migration tests; transaction/race tests; integration mocks for external calls; responsive browser tests; PHP lint/type checks. No test is “passed” until run with captured result.
6. **Isolated staging validation:** after schema gaps close, use a new MariaDB 10.5-compatible staging DB and synthetic data, migration account for DDL, DML-only runtime account, configured HTTPS/proxy, and isolated webhook/integration credentials. No production import or DNS change is implied.
7. **Release and rollback preparation:** clean allowlisted package, secret scan, checksum/manifest, reviewed installation instructions, backup/restore rehearsal, upgrade/rollback runbook, known-good artifact, monitoring/log retention and explicit release approval.

## Human Decisions And Hostinger Confirmations

**Human decisions:** whether the full PHP port is required versus using the existing Nest/PostgreSQL backend; whether login/refresh/logout token semantics should stay PHP-stateful or match Nest stateless behavior; whether audit logging is best-effort or transactionally guaranteed; canonical ID format; maximum source field lengths; case/accent-sensitive uniqueness policy; enum encoding strategy; migration/data-import ownership; RPO/RTO and performance targets; which UI features are in first release; webhook/WhatsApp test-mode policy.

**Hostinger facts still to confirm (reported facts are not proof):** exact MariaDB 10.5 patch/build; server/database/table charset and collation; SQL mode (including ANSI_QUOTES/strict behavior); timezone and InnoDB/foreign-key support; database-size and simultaneous/per-user connection limits; phpMyAdmin/import size and execution-time limits; PHP-FPM and CLI PHP versions; `mbstring` and other required extensions; cron frequency/reliability; writable disk and backup quotas; outbound HTTPS/inbound webhook reachability; document-root and `.htaccess`/rewrite/header behavior; shared-hosting resource and request limits.

## Next Smallest Safe Implementation Step

After reviewing this plan, approve the MariaDB schema contract decisions (identifier representation, field bounds, collations, enum strategy, UTC date handling, relation delete rules and audit guarantee). Then prepare a **DDL design-only baseline for User, Customer, Plan, Subscription and SubscriptionRenewal**, with a field-by-field crosswalk back to Prisma. Do not create a database or execute that DDL until the contract is reviewed and the disposable MariaDB 10.5 test plan is separately authorized.

# Launch Gap Audit

Date: 2026-10-13 (updated 2026-10-14 for the PHP backup API)
Status: staged audit only; Slice A database validation blocked

## Scope and constraint
This inventory is a source-only read-through of the current repository state. It does not claim Hostinger deployment success, MariaDB 10.5 compatibility, or production readiness. The original NestJS + Prisma/PostgreSQL implementation remains the behavioral reference, while the PHP prototype is a partial migration artifact only.

The canonical readiness documents are the copies at the repository root. Older audit copies exist under `hostinger-php-prototype/`; the generated package also contains snapshots of those documents. Those copies are not canonical and were left untouched. This session found additional PHP handlers and a full-application schema draft that the older copies do not describe; source presence is not database evidence.

## Frontend route inventory

| Route | Status | Notes |
|---|---|---|
| / | IMPLEMENTED-UNTESTED | Static export generated; not browser-validated against PHP API |
| /login | PARTIAL | Auth route exists; refresh and logout flow need end-to-end verification |
| /dashboard | PARTIAL | KPI pages are present but no database-backed validation from the Hostinger target |
| /customers | IMPLEMENTED-UNTESTED | PHP customer handler exists; no MariaDB or browser proof |
| /customers/new | IMPLEMENTED-UNTESTED | Customer creation handler exists; customer-plus-subscription end-to-end flow untested |
| /customers/view | IMPLEMENTED-UNTESTED | Customer detail/update handler exists; related workflows untested |
| /plans | IMPLEMENTED-UNTESTED | PHP plan API exists; no full subscription plan lifecycle proof |
| /subscriptions | IMPLEMENTED-UNTESTED | PHP subscription and renewal handlers/schema exist; no DB proof |
| /inventory | IMPLEMENTED-UNTESTED | PHP inventory/category/product stock handlers and schema draft exist |
| /inventory/movements | IMPLEMENTED-UNTESTED | Stock movement handler/schema exist; concurrency not verified |
| /sales | IMPLEMENTED-UNTESTED | PHP sale and refund/cancel handlers exist; no MariaDB proof |
| /sales/detail | IMPLEMENTED-UNTESTED | Sale detail/refund handler exists; not DB-tested |
| /sales/invoice | PARTIAL | Static route exists, but no DB-backed invoice generation was verified |
| /sales/pos | IMPLEMENTED-UNTESTED | Sale creation handler exists; stock transaction proof not run |
| /reports | IMPLEMENTED-UNTESTED | PHP report handler exists; exports unverified |
| /reports/revenue | IMPLEMENTED-UNTESTED | PHP report handler exists; no DB-backed result |
| /reports/customers | IMPLEMENTED-UNTESTED | PHP report handler exists; no DB-backed result |
| /reports/inventory | IMPLEMENTED-UNTESTED | PHP report handler exists; no DB-backed result |
| /settings | PARTIAL | PHP auth/profile, company settings and an ADMIN-only backup API (list/create/integrity/download/cleanup) with CLI-only isolated restore exist; broader settings/backup parity unverified |
| /settings/company | IMPLEMENTED-UNTESTED | Company-setting schema and settings routes exist; browser/API flow untested |
| /settings/profile | PARTIAL | Auth profile update exists; broader settings matrix not verified |
| /settings/print | PARTIAL | Frontend is present; print/backend integration not verified |
| /whatsapp | MISSING | No PHP WhatsApp integration or webhook backend |
| /whatsapp/connect | MISSING | Connection and configuration flow not implemented in PHP |
| /whatsapp/messages | MISSING | No PHP outbound/inbound message storage |
| /whatsapp/reminders | MISSING | No reminder job or persistence in PHP |
| /whatsapp/templates | MISSING | No template persistence in PHP |

## NestJS API endpoint inventory

These are the major route families from the NestJS application and their current state against the PHP prototype.

| Area | Status | Notes |
|---|---|---|
| /api/v1/auth | PARTIAL | PHP login, refresh, logout, profile, and password handlers exist; `/auth/demo` is missing; no MariaDB 10.5 or endpoint-matrix test was run |
| /api/v1/plans | IMPLEMENTED-UNTESTED | PHP plan handlers exist; database behavior is unverified in this session |
| /api/v1/customers | IMPLEMENTED-UNTESTED | PHP customer handler and DDL are present; no DB-backed verification |
| /api/v1/subscriptions | IMPLEMENTED-UNTESTED | PHP lifecycle handler and renewal schema are present; no DB-backed verification |
| /api/v1/inventory | IMPLEMENTED-UNTESTED | PHP inventory handler and product/movement schema are present; no DB-backed verification |
| /api/v1/sales | IMPLEMENTED-UNTESTED | PHP sale/refund/cancel handler and schema are present; no DB-backed verification |
| /api/v1/reports | IMPLEMENTED-UNTESTED | PHP report handler exists; download behavior remains unverified |
| /api/v1/dashboard | IMPLEMENTED-UNTESTED | PHP dashboard handler exists; no DB-backed verification |
| /api/v1/settings | PARTIAL | Settings handlers exist; broader Nest response/permission parity is unverified |
| /api/v1/users | IMPLEMENTED-UNTESTED | PHP admin user-management handler exists; no HTTP/database role matrix was run |
| /api/v1/whatsapp | MISSING | No outbound/inbound message, template, reminder, or webhook service |
| /api/v1/backups | PARTIAL / BLOCKED-BY-HOSTING | PHP implements list/create/integrity/download/cleanup with encrypted snapshots and CLI-only isolated restore; incremental/schedule/HTTP restore routes are unimplemented and Hostinger filesystem/key behavior is not verified locally |
| /api/v1/audit | PARTIAL | Audit table exists in PHP, but full audit parity is not implemented |

## Prisma model and enum inventory

| Model or enum | Status | Notes |
|---|---|---|
| User, UserRole, UserStatus | IMPLEMENTED-UNTESTED | Auth schema and session/token tables exist; role behavior has not been exercised over DB-backed HTTP |
| Customer | IMPLEMENTED-UNTESTED | DDL and handler exist |
| Plan | IMPLEMENTED-UNTESTED | DDL and handler exist |
| Subscription, SubscriptionRenewal, SubscriptionStatus | IMPLEMENTED-UNTESTED | DDL and handler exist |
| WhatsAppReminder, WhatsAppReminderType | IMPLEMENTED-UNTESTED | DDL exists; webhook/scheduler functionality remains missing |
| WhatsAppMessage | IMPLEMENTED-UNTESTED | DDL exists; PHP integration/handler parity remains missing |
| InventoryCategory, Product, StockMovement, StockMovementType | IMPLEMENTED-UNTESTED | DDL and inventory handler exist |
| Sale, SaleItem | IMPLEMENTED-UNTESTED | DDL and sale handler exist |
| CompanySetting | IMPLEMENTED-UNTESTED | DDL and settings handler exist |
| AuditLog | IMPLEMENTED-UNTESTED | DDL and write paths exist; full audit parity unverified |

## Infrastructure and hosting blockers

| Item | Status | Notes |
|---|---|---|
| Hostinger Premium environment fact-check | BLOCKED-BY-HOSTING | Exact PHP version, MariaDB 10.5 patch, document root, rewrite, and cron capability were not verified on Hostinger |
| MariaDB 10.5 compatibility | BLOCKED-BY-HOSTING | No live MariaDB 10.5 instance was started or connected |
| Static frontend deploy | IMPLEMENTED-UNTESTED | Production export compiled successfully locally |
| PHP API deploy | PARTIAL | Prototype syntax checks pass; DB-backed behavior unverified |
| Cron/webhook automation | BLOCKED-BY-HOSTING | No Hostinger cron or webhook verification was performed |
| Security and CORS verification | BLOCKED-BY-HOSTING | Apache/LiteSpeed security headers and same-origin/API rules remain unverified |

## Final assessment
The application is not ready for direct Hostinger Premium launch from the current repository state. The static frontend export and PHP source checks pass, but the MariaDB schema draft is unvalidated and parity remains incomplete. Missing database-backed validation is the deciding gap.

## Session 2 evidence update
- `AWIK_MARIADB_BASEDIR` was missing and no MariaDB executable was found on `PATH`; no MariaDB server was started and the existing harness was not invoked.
- PHP user validation passed and PHP syntax checks passed; these are not database-backed evidence.
- The current auth/user endpoint matrix and parity notes are in [SLICE_A_AUTHORIZATION_MATRIX.md](SLICE_A_AUTHORIZATION_MATRIX.md).
- Slice A remains BLOCKED pending a safely isolated MariaDB 10.5.x installation and DB-backed HTTP tests.

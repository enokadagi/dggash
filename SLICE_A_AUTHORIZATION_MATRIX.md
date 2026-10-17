# Slice A Authentication and Authorization Matrix

Date: 2026-10-13
Status: source comparison complete; HTTP/database authorization proof BLOCKED

This matrix covers all 12 auth and user-management routes declared by the NestJS controllers. The PHP route handlers are present for all except `/auth/demo`. The results below are expected behavior from source, not test results. No MariaDB-backed harness or HTTP test ran in this session.

| Method and path | Access in NestJS | Unauthenticated result | ADMIN result | STAFF result | PHP vs Nest source behavior | Test evidence |
|---|---|---|---|---|---|---|
| `POST /api/v1/auth/login` | Public; local-auth + account-lockout guards | Credentials decide: 200, 401, or 429 | Same as public | Same as public | Partial match. PHP performs password verification, generic failures, persisted account/IP throttles and returns a user plus access/refresh tokens. Nest also has a global request throttle and records auth audit events; PHP does not fully match those details. | `MariaDbCompatibilityTest.php` contains real HTTP login success/failure and lockout scenarios; not run. `AuthApiContractTest.php` invokes request helpers; not run. |
| `POST /api/v1/auth/refresh` | Public | Valid refresh token returns 200; invalid/expired token returns 401 | Same as public | Same as public | Does not match token lifecycle. Nest verifies a JWT and issues new tokens without storing/consuming the old one. PHP requires a persisted token row and rotates/revokes it, rejecting replay. | Harness source contains real HTTP refresh and replay checks; not run. |
| `POST /api/v1/auth/demo` | Public; service may return 403 in production or demo login in dev/enabled mode | Nest result depends on environment/flag | N/A | N/A | Missing in PHP: current PHP route falls through to 404. Nest demo service may create a default admin with a source-coded password when none exists; implementing that behavior conflicts with the no-default-password safety rule and is BLOCKED pending a safe source-compatible policy. | No PHP test. |
| `POST /api/v1/auth/logout` | Authenticated; ADMIN/STAFF | 401 | 200 | 200 | Does not match session behavior. Nest logs logout but does not revoke stateless JWTs. PHP revokes all persisted tokens for the user. | Harness source contains real HTTP logout and post-logout profile denial; not run. |
| `GET /api/v1/auth/profile` | Authenticated; ADMIN/STAFF | 401 | 200 | 200 | Broadly matches profile access and projection. PHP validates token persistence, active status, and soft-delete state on each request. | HTTP test source covers anonymous 401 and authenticated profile 200; not run. |
| `PATCH /api/v1/auth/profile` | Authenticated; ADMIN/STAFF | 401 | 200 for valid input | 200 for valid input | Partial validation mismatch: Nest rejects unknown DTO properties; PHP currently ignores unknown profile fields. | Contract-test source calls the helper path; no per-role real HTTP assertion. Not run. |
| `POST /api/v1/auth/change-password` | Authenticated; ADMIN/STAFF | 401 | 200 for valid current/new/confirmation | 200 for valid current/new/confirmation | Password update works in source, but PHP revokes every token while Nest does not. PHP uses default bcrypt cost on this path; Nest explicitly hashes at cost 12. Unknown request fields are not explicitly rejected in the PHP branch. | Harness source contains real HTTP successful password change and token invalidation; contract-test source covers invalid/current-password cases. Not run. |
| `GET /api/v1/users` | ADMIN only | 401 | 200 | 403 | PHP handler explicitly requires authenticated ADMIN; source behavior matches Nest guard intent. | No route-level test found in the existing auth/user tests or MariaDB harness. `UserValidationTest.php` tests validation helpers only and passed. |
| `POST /api/v1/users` | ADMIN only | 401 | 201 for valid input | 403 | PHP handler explicitly requires authenticated ADMIN, validates input, and hashes new passwords at bcrypt cost 12. | No route-level test found; no DB/HTTP proof. |
| `PATCH /api/v1/users/:id` | ADMIN only | 401 | 200 for valid update | 403 | PHP handler explicitly requires authenticated ADMIN and handles soft-deleted/missing users. Contract details are unverified against actual HTTP responses. | No route-level test found; no DB/HTTP proof. |
| `POST /api/v1/users/:id/password` | ADMIN only | 401 | 200 for valid new password | 403 | PHP handler explicitly requires authenticated ADMIN, hashes at cost 12, and matches the Nest route's stated role. Password/session invalidation parity remains unverified; Nest service does not revoke tokens. | No route-level test found; no DB/HTTP proof. |
| `DELETE /api/v1/users/:id` | ADMIN only | 401 | 200 for another user; 400 for self-deactivation | 403 | PHP handler explicitly requires authenticated ADMIN and mirrors soft-delete/status behavior and self-deactivation guard. | No route-level test found; no DB/HTTP proof. |

## Source-level security and parity findings

- The PHP access-token guard validates JWT signature, expiry, token type, stored token hash/expiry/revocation, active user status, and `deletedAt IS NULL`.
- `awikHandleUserRequest()` checks authentication and ADMIN role before dispatching user operations. Staff authorization is enforced server-side in source, but not proven by HTTP tests.
- The refresh handler selects an unrevoked token before beginning a transaction, then updates it with a conditional `revokedAt IS NULL` predicate without checking affected rows. Two concurrent refresh requests can race to mint tokens; this must be fixed and proven with persisted-state assertions before Slice A can pass.
- Nest auth uses stateless JWT refresh/logout/password-change semantics; PHP uses stateful refresh rotation and session revocation. This is a behavioral difference, not a claim that either implementation has been DB-validated here.
- PHP's change-password path calls `password_hash()` without the explicit cost 12 used by Nest and PHP user create/admin reset paths.
- PHP profile update ignores unknown properties instead of following Nest's global `whitelist` + `forbidNonWhitelisted` behavior. Login and password-change request branches also need endpoint-specific unknown-property checks compared with the DTOs.
- The PHP token table is an additional PHP-only schema, not a Prisma model. The PHP migration chain has no execution ledger in the current prototype.

## Test coverage status

- Database-backed HTTP authorization tests executed: 0
- Database-independent validation tests executed: 1 passed (`UserValidationTest.php`)
- PHP syntax checks executed: 3 passed
- MariaDB version established: none

All protected-route ADMIN/STAFF/anonymous outcomes above remain IMPLEMENTED-UNTESTED or BLOCKED. Do not mark Slice A DB-TESTED until every protected endpoint has live HTTP coverage on an isolated MariaDB 10.5.x instance and token lifecycle/authorization state has been asserted in the database.

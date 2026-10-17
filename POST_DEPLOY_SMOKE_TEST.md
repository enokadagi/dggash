# Post-Deploy Smoke Test

This file is a required smoke-test plan for a verified Hostinger staging deployment. It was not executed in this local session.

## Smoke-test script
1. Log in using a valid seeded admin user.
2. Confirm the user is redirected to /dashboard after a successful login.
3. Create a non-production customer record.
4. Create or select a plan and create a subscription.
5. Create a product with numeric stock and verify stock movement entries.
6. Complete a sale and confirm the resulting stock is reduced.
7. Trigger a refund or cancellation and confirm the inventory is restored correctly.
8. Confirm a failed sale does not leave partial stock or ledger changes.
9. Attempt a protected route as a non-admin user and confirm a server-side denial.
10. Download a report or invoice file and verify the file is generated.
11. Confirm empty, loading, and error states in the UI do not expose internal details.
12. Confirm the SPA deep-link and 404 behavior does not swallow the /api path.

## Expected results
- No negative stock values
- No duplicate refund winner under concurrency
- No unauthorized access to protected endpoints
- All report files generate successfully with generated data
- Authentication/session expiry behavior remains correct

## Safety notes
- The smoke test must use disposable synthetic data only.
- No production fixtures, backups, or real customer records may be used.
- If the Hostinger environment cannot support any step, stop and record the blocker instead of claiming success.

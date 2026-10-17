# Deploy Steps for Hostinger Premium (staging only)

This file is a deployment checklist only. It does not imply that the project is ready to deploy. The Hostinger target must still be verified before any release.

## 1. Confirm the target environment
- Confirm the site is a Hostinger Premium shared hosting plan, not a VPS or Docker-based environment.
- Confirm the PHP version and enabled extensions in hPanel.
- Confirm the MariaDB version and database size/privilege model.
- Confirm whether Apache or LiteSpeed is active and whether .htaccess is enabled.

## 2. Prepare a disposable staging site
- Create a fresh staging domain or subdomain only if the host allows it.
- Create a disposable database user and a new empty database.
- Do not use production data, credentials, or any existing data directory.

## 3. Upload the staging package
- Upload the generated Hostinger package content to the document root or the chosen staging document root.
- Keep the frontend static export in public_html.
- Keep the PHP API bundle outside the publicly served web root if possible.
- Ensure the .htaccess rules are reviewed before enabling them.

## 4. Configure PHP and runtime settings
- Set PHP 8.3 for the site where applicable.
- Confirm pdo_mysql and mbstring are available.
- Configure max execution time, memory limit, and upload limits in line with Hostinger defaults.

## 5. Import schema and seed only synthetic data
- Apply only the approved MariaDB 10.5 migration chain against the disposable database.
- Create the first admin only with a user-chosen password, not a default password.
- Do not use the production data or a dump file.

## 6. Configure environment variables
- Store names only; no values are included in this repository.
- Keep config outside the public web root where the host supports it.

## 7. Configure cron jobs
- Add only the approved cron-safe cleanup/reminder jobs.
- Keep them idempotent and safe to run more than once.

## 8. Verify the public endpoints
- Confirm login page loads.
- Confirm SPA deep links resolve correctly.
- Verify API endpoints are not served from a public directory that exposes private logic.

## 9. Run the smoke tests
See POST_DEPLOY_SMOKE_TEST.md for exact smoke-test steps.

## 10. Stop at a safe checkpoint
If any of the above steps fail or cannot be verified on Hostinger, do not continue to production. Record the blocker and revert or pause the staging deployment.

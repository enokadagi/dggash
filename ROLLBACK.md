# Rollback Plan

This is a staging-only rollback plan for the Hostinger package. It is not a production deployment mandate and is not executed here.

## Before any deployment
- Keep the source repository copy unchanged.
- Keep the generated staging artifact in a checksum-recorded folder.
- Keep the original static export and PHP prototype bundle in a separate archive.

## If a staging deployment fails
1. Remove or disable the uploaded staging content.
2. Restore the previous static HTML document root or previous staging site content.
3. Revert config file changes in the host control panel.
4. Recreate the disposable database or restore the snapshot from the staging environment.
5. Re-run the smoke test only after the database and route configuration are corrected.

## If a migration fails
- Stop the rollout immediately.
- Keep the database in a disposable staging instance only.
- Restore from the last known-good schema snapshot rather than using destructive SQL.
- Re-run the migration in smaller additive slices.

## Final rule
Never continue to production or label the package ready if rollback cannot be validated in staging.

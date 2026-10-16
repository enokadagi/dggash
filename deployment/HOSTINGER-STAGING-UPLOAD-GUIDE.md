# AWIK NET — Hostinger Staging Upload Guide

**Target artifact:** `deployment/awik-net-hostinger-release-candidate-20261016.zip`
**SHA-256:** `CE6A208782199FC2EC6355FB0E2277029419DEA56706BBF231F45B55483A2B02`
**Size:** 1,463,802 bytes
**ZIP entries:** 261 (all forward-slash separators)
**Manifest status:** `NOT_READY`
**Hostinger acceptance:** `false`
**Target:** Hostinger staging only. Production is not authorized and must not be touched.

The checksum is also recorded in `deployment/awik-net-hostinger-release-candidate-20261016.zip.sha256`, which the build script writes after the archive is sealed. All three of the guide, the readiness report (`deployment/HOSTINGER-STAGING-READINESS-20261016.md`), and the checksum file refer to this same artifact name and SHA-256.

---

## Archive layout (what the ZIP contains)

The ZIP built by `scripts/build-hostinger-package.ps1` has these top-level entries:

- `public_html/` — public website document-root files
- `api/` — private PHP application code (must stay outside every document root)
- `migrations/` — MariaDB SQL for the staging database (do not run during upload)
- `manifest.json` — package metadata
- `README.md` — package notes

**Do not extract the entire ZIP directly into `public_html/staging/`.** Doing so would nest a `public_html/` folder inside staging and would leave the private `api/` code publicly reachable. Instead, place each archive directory where it belongs, using Steps 3–5.

The two intended destinations are:

| Archive directory | Put its **contents** here | Public? |
|---|---|---|
| `public_html/` | `/home/u605093332/domains/awiknet.com/public_html/staging/` | Yes (staging document root) |
| `api/` | `/home/u605093332/domains/awiknet.com/staging-api/` | No (outside every document root) |
| `migrations/` | A private, non-public location you choose (keep off the public root) | No |

After upload, the bridge must end up at:

```
/home/u605093332/domains/awiknet.com/public_html/staging/api/index.php
```

---

## Step 1 — Verify the artifact before upload (do this locally)

```powershell
Get-FileHash -LiteralPath "deployment\awik-net-hostinger-release-candidate-20261016.zip" -Algorithm SHA256
```

Expected:

```
CE6A208782199FC2EC6355FB0E2277029419DEA56706BBF231F45B55483A2B02
```

Also confirm the size is **1,463,802 bytes**. If either value differs, do not upload.

---

## Step 2 — Create the staging document root (Hostinger File Manager)

1. Log in to Hostinger and open **File Manager** (or connect via FTP/SFTP).
2. Navigate to `/home/u605093332/domains/awiknet.com/`.
3. Open `public_html/`. This is the **production** folder — do not change anything in it except the `staging/` subfolder created below.
4. Inside `public_html/`, create a folder named exactly `staging` if it does not already exist.
5. Open `public_html/staging/`. If it is not empty from an earlier attempt, clear it first (see Step 10 rollback), then continue.

**Verify before proceeding:** the address bar / path shows `/home/u605093332/domains/awiknet.com/public_html/staging`.

---

## Step 3 — Upload the public website files

1. On your PC, open the downloaded ZIP with your normal archive tool and go **inside** the `public_html/` folder. Do not extract from the ZIP root.
2. Select the **contents** of that `public_html/` folder (all files and folders, including the hidden `.htaccess`).
3. Upload/copy them into `/home/u605093332/domains/awiknet.com/public_html/staging/`.
4. Do **not** create a nested `public_html/` folder inside staging. The files must sit directly in `public_html/staging/`.

**Verify before proceeding** — these paths must exist in `public_html/staging/`:

- `public_html/staging/api/index.php` — the public bridge front controller
- `public_html/staging/.htaccess` — rewrite rules (hidden file; enable "show hidden files")
- `public_html/staging/index.html` — the exported site
- `public_html/staging/_next/` — Next.js static assets (if present)

If `public_html/staging/public_html/` exists, you extracted one level too high: delete that nested folder and repeat Step 3.

---

## Step 4 — Upload the private PHP application OUTSIDE the document root

1. In the ZIP, go **inside** the `api/` folder.
2. Select its **contents** — the `private/` folder, the `public/` folder, and the hidden `.htaccess` — and upload them into:

```
/home/u605093332/domains/awiknet.com/staging-api/
```

   This location is at account level, **outside** `public_html/`. Do **not** place the `api/` contents inside `public_html/` or `public_html/staging/`.

**Verify before proceeding** — these paths must exist:

- `staging-api/private/config.php`
- `staging-api/private/bootstrap.php`
- `staging-api/private/provision-admin.php`
- `staging-api/private/backup.php`
- `staging-api/private/restore-backup.php`
- `staging-api/private/cron/cleanup-auth-state.php`
- `staging-api/public/index.php`
- `staging-api/.htaccess`

If instead you see `staging-api/api/private/...`, you extracted one level too high: remove the extra `api/` folder and move its contents up one level.

---

## Step 5 — Keep migrations separate (do not run during upload)

The archive's `migrations/` directory contains MariaDB SQL for the separate staging database `u605093332_staging_db`:

- `migrations/2026_10_11_auth_core.sql`
- `migrations/2026_10_12_login_attempts.sql`
- `migrations/2026_10_13_full_application.sql`
- `migrations/2026_10_14_password_recovery.sql`

**Do not upload migrations into `public_html/staging/` or `staging-api/`.** Keep them in a private location that is not web-reachable (for example, on your own machine, or a private account-level folder outside any document root).

**Do not run any migration as part of upload or extraction.** Migrations are a separate, later, explicitly approved step. They apply only to a brand-new, empty staging database and only in the listed order. Running them against a non-empty or production database can corrupt data. This package does not run migrations automatically, and this upload step does not run them at all.

---

## Step 6 — How the bridge finds the private code (verified against the real code)

The bridge file `scripts/hostinger-api-bridge.php` (shipped as `public_html/api/index.php`) does **not** assume a fixed path. It checks candidate private roots in order and loads the first one that actually contains `public/index.php`; if none matches, it fails closed.

For the staging layout in this guide, the bridge is at:

```
/home/u605093332/domains/awiknet.com/public_html/staging/api/index.php
```

So `__DIR__` is `.../public_html/staging/api`, and:

- `dirname(__DIR__, 1)` = `.../public_html/staging`
- `dirname(__DIR__, 2)` = `.../public_html`
- `dirname(__DIR__, 3)` = `.../domains/awiknet.com`

The first candidate is `dirname(__DIR__, 3) . '/staging-api'`:

```
/home/u605093332/domains/awiknet.com/staging-api
```

That matches the Step 4 destination exactly. The bridge then loads `staging-api/public/index.php`.

The other candidate only resolves to the real production private directory when the same file is deployed at the production location `.../public_html/api/index.php` (`dirname(__DIR__, 2) . '/api'` = `.../domains/awiknet.com/api`). Under a staging deployment that candidate points inside `public_html/`, where production does not keep its private `api/`, so an absent `staging-api/` results in a fail-closed response rather than silently loading different code.

**Fail-closed behavior (verified in the packaged code).** If no candidate directory contains `public/index.php`, the bridge returns:

```json
{"success": false, "message": "Application unavailable"}
```

with HTTP 500 and **no** filesystem path, configuration value, or secret disclosure.

**Unverified on Hostinger.** PHP `open_basedir` restrictions may block the include from `public_html/staging/` to the domain-level `staging-api/`. This cross-directory include is **not verified** on the Hostinger account and must be tested there (Step 7). Do not assume it works.

---

## Step 7 — Configure environment variables (Hostinger) — unverified mechanism

Hostinger supplies secrets through its secure environment-variable injection for PHP-FPM. Confirm with Hostinger support how to set these for the staging PHP-FPM pool, then set:

- `AWIK_MIGRATION_DSN`
- `AWIK_MIGRATION_DB_USER`
- `AWIK_MIGRATION_DB_PASSWORD`
- `AWIK_MIGRATION_JWT_SECRET`
- `AWIK_MIGRATION_JWT_REFRESH_SECRET`
- `AWIK_BACKUP_ENCRYPTION_KEY`
- `AWIK_BACKUP_DIR` (must be outside every document root)
- `AWIK_BACKUP_RESTORE_ACTOR_ID`
- Admin provisioning variables (first-admin credentials), when provisioning

Do **not** place an `.env` file in the upload — none is included in the package, and secrets must never sit in public files. The exact secure-injection mechanism is **unverified**; this is a release blocker.

---

## Step 8 — Verify server constraints on Hostinger (unverified)

1. **Cross-directory include / `open_basedir`** — confirm the bridge (`public_html/staging/api/index.php`) may include `staging-api/public/index.php`. **Unverified until tested on Hostinger.**
2. **LiteSpeed rewrite** — confirm `.htaccess` rules are honored, especially:
   - `/api/v1` routing to the PHP bridge;
   - the `private/` directory block (`RewriteRule ^private(?:/|$) - [F,L]`).
3. **PHP extensions** — create a temporary `phpinfo()` probe (then delete it) to confirm `openssl`, `zip`, and `pdo_mysql` are loaded.

None of these are confirmed by local testing; local validation cannot prove Hostinger runtime compatibility.

---

## Step 9 — Smoke test the staging endpoint (only after Steps 7–8)

```
GET https://staging.awiknet.com/api/v1/auth/login
```

Expected: JSON envelope `{"success": true, ...}` with valid credentials, or the standard `{"success": false, ...}` error shape. Never a raw PHP error page.

Blocked-path check:

```
GET https://staging.awiknet.com/api/private/config.php
```

Expected: **403 Forbidden**.

---

## Step 10 — Rollback (staging only)

If anything goes wrong:

1. In File Manager, delete `/home/u605093332/domains/awiknet.com/public_html/staging/` entirely.
2. Delete `/home/u605093332/domains/awiknet.com/staging-api/` entirely.
3. Do **not** touch `/home/u605093332/domains/awiknet.com/public_html/` (production) or any production database. Production files are not overwritten by this guide.
4. Re-extract from the verified ZIP using Steps 3–5.

---

## Step 11 — Mark readiness (only after verified on the host)

The package is deliberately `NOT_READY` with `hostingerAcceptance: false`. Only after **every** blocker in `deployment/HOSTINGER-STAGING-READINESS-20261016.md` is cleared with real host evidence:

1. Set `status` to a staging-ready value and `hostingerAcceptance: true` (both the top-level and `localValidation` fields) in the manifest source inside `scripts/build-hostinger-package.ps1`.
2. Rebuild with `scripts/build-hostinger-package.ps1`.
3. Re-run `scripts/validate-hostinger-package.ps1` (all checks must PASS).
4. Re-upload the rebuilt artifact and repeat Steps 3–10.

The builder refuses to emit a ready artifact on its own: it fails the build unless the emitted manifest is `NOT_READY` with `hostingerAcceptance: false`. Marking an unaccepted release ready is a deliberate, evidenced change, not a side effect of building.

---

## What NOT to do

- **Do not deploy to production.** Production deployment is not authorized (`hostingerAcceptance: false`).
- **Do not** extract the whole ZIP into `public_html/staging/` — that nests `public_html/` inside staging and exposes private code.
- **Do not** place the `api/` contents inside `public_html/` or `public_html/staging/` — private PHP code must stay outside the document root.
- **Do not** run migrations during upload or extraction.
- **Do not** include `.env`, `*.key`, `*.log`, `*.sqlite`, or production identifiers in the upload.
- **Do not** use `Compress-Archive` to rebuild the ZIP on Windows — it can preserve backslash separators. Always use `scripts/build-hostinger-package.ps1`.

<?php

declare(strict_types=1);

$root = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'awik_backup_test_' . bin2hex(random_bytes(12));
$backupDirectory = $root . DIRECTORY_SEPARATOR . 'private-backups';
$gzipPath = $root . DIRECTORY_SEPARATOR . 'snapshot.gz';
$encryptedPath = $root . DIRECTORY_SEPARATOR . 'snapshot.awikbak';
$restoredPath = $root . DIRECTORY_SEPARATOR . 'restored.gz';
mkdir($root, 0700);
putenv('AWIK_BACKUP_ENCRYPTION_KEY=' . bin2hex(random_bytes(32)));
putenv('AWIK_BACKUP_DIR=' . $backupDirectory);
putenv('AWIK_MIGRATION_DSN=sqlite:' . $root . DIRECTORY_SEPARATOR . 'auth.sqlite');
putenv('AWIK_MIGRATION_DB_USER=');
putenv('AWIK_MIGRATION_DB_PASSWORD=');
putenv('AWIK_MIGRATION_JWT_SECRET=local-backup-access-secret-for-tests-only-32');
putenv('AWIK_MIGRATION_JWT_REFRESH_SECRET=local-backup-refresh-secret-for-tests-only-32');

require_once __DIR__ . '/../private/bootstrap.php';

function awikBackupTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function awikBackupTestRemove(string $path): void
{
    if (!is_dir($path)) {
        return;
    }
    $entries = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($entries as $entry) {
        if ($entry->isDir() && !$entry->isLink()) {
            rmdir($entry->getPathname());
        } else {
            unlink($entry->getPathname());
        }
    }
    rmdir($path);
}

try {
    $key = awikBackupKey();
    $gz = gzopen($gzipPath, 'wb9');
    awikBackupTestAssert($gz !== false, 'Could not create backup test snapshot');
    awikBackupWriteGzip($gz, str_repeat("backup-payload\n", 1000));
    gzclose($gz);
    $metadata = awikBackupEncryptGzip($gzipPath, $encryptedPath, $key);
    $record = [
        'size' => $metadata['size'],
        'sha256' => $metadata['sha256'],
        'hmac' => $metadata['hmac'],
    ];
    awikBackupTestAssert(awikBackupVerifyFile($encryptedPath, $record, $key), 'Fresh encrypted backup failed integrity verification');
    awikBackupDecryptToGzip($encryptedPath, $restoredPath, $key);
    awikBackupTestAssert(hash_file('sha256', $gzipPath) === hash_file('sha256', $restoredPath), 'Backup decrypt did not reproduce the source snapshot');

    $corruptedPath = $root . DIRECTORY_SEPARATOR . 'corrupted.awikbak';
    $bytes = file_get_contents($encryptedPath);
    awikBackupTestAssert(is_string($bytes) && strlen($bytes) > 32, 'Encrypted archive fixture is unexpectedly short');
    $bytes[strlen($bytes) - 1] = chr(ord($bytes[strlen($bytes) - 1]) ^ 1);
    file_put_contents($corruptedPath, $bytes);
    awikBackupTestAssert(!awikBackupVerifyFile($corruptedPath, $record, $key), 'Corrupted backup passed integrity verification');
    $corruptRejected = false;
    try {
        awikBackupDecryptToGzip($corruptedPath, $root . DIRECTORY_SEPARATOR . 'corrupted.gz', $key);
    } catch (RuntimeException) {
        $corruptRejected = true;
    }
    awikBackupTestAssert($corruptRejected, 'Corrupted backup decrypted successfully');

    $publicRoot = $root . DIRECTORY_SEPARATOR . 'public_html';
    mkdir($publicRoot, 0700);
    $_SERVER['DOCUMENT_ROOT'] = $publicRoot;
    putenv('AWIK_BACKUP_DIR=' . $publicRoot . DIRECTORY_SEPARATOR . 'leaked-backups');
    $publicPathRejected = false;
    try {
        awikBackupDirectory();
    } catch (RuntimeException) {
        $publicPathRejected = true;
    }
    awikBackupTestAssert($publicPathRejected, 'Backup storage under the public document root was accepted');
    awikBackupTestAssert(!file_exists($publicRoot . DIRECTORY_SEPARATOR . 'leaked-backups'), 'Public backup directory was created before rejection');
    unset($_SERVER['DOCUMENT_ROOT']);
    putenv('AWIK_BACKUP_DIR=' . $backupDirectory);

    $db = awikDatabase();
    $db->exec('CREATE TABLE awik_users (
        id TEXT PRIMARY KEY, email TEXT, phone TEXT NOT NULL, firstName TEXT NOT NULL, lastName TEXT NOT NULL,
        passwordHash TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, deletedAt TEXT NULL
    )');
    $db->exec('CREATE TABLE awik_user_tokens (
        id TEXT PRIMARY KEY, userId TEXT NOT NULL, tokenHash TEXT NOT NULL, tokenType TEXT NOT NULL,
        expiresAt TEXT NOT NULL, revokedAt TEXT NULL
    )');
    $adminId = awikUuidV4();
    $staffId = awikUuidV4();
    foreach ([[$adminId, 'ADMIN'], [$staffId, 'STAFF']] as [$userId, $role]) {
        $db->prepare(
            'INSERT INTO awik_users (id,email,phone,firstName,lastName,passwordHash,role,status) VALUES (?,?,?,?,?,?,?,?)'
        )->execute([$userId, null, $userId, 'Backup', 'Test', 'not-used', $role, 'ACTIVE']);
    }
    $accessSecret = getenv('AWIK_MIGRATION_JWT_SECRET');
    $tokens = [];
    foreach ([[$adminId, 'ADMIN'], [$staffId, 'STAFF']] as [$userId, $role]) {
        $token = awikSignJwt([
            'sub' => $userId,
            'role' => $role,
            'jti' => awikUuidV4(),
            'type' => 'access',
            'exp' => time() + 3600,
        ], $accessSecret);
        $db->prepare(
            'INSERT INTO awik_user_tokens (id,userId,tokenHash,tokenType,expiresAt) VALUES (?,?,?,?,?)'
        )->execute([awikUuidV4(), $userId, hash('sha256', $token), 'access', gmdate('Y-m-d H:i:s', time() + 3600)]);
        $tokens[$role] = $token;
    }

    $anonymous = awikHandleRequest(['method' => 'GET', 'uri' => '/api/v1/backups']);
    $staff = awikHandleRequest([
        'method' => 'GET',
        'uri' => '/api/v1/backups',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['STAFF']],
    ]);
    $admin = awikHandleRequest([
        'method' => 'GET',
        'uri' => '/api/v1/backups',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['ADMIN']],
    ]);
    awikBackupTestAssert($anonymous['statusCode'] === 401, 'Anonymous backup listing was not rejected');
    awikBackupTestAssert($staff['statusCode'] === 403, 'Staff backup listing was not rejected');
    awikBackupTestAssert($admin['statusCode'] === 200 && $admin['payload']['data'] === [], 'Admin backup listing failed');
    $db = null;

    echo "AWIK backup encryption, integrity, public-root rejection, and authorization tests passed\n";
} finally {
    $db = null;
    gc_collect_cycles();
    awikBackupTestRemove($root);
}

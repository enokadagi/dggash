<?php

declare(strict_types=1);

/**
 * PHP-native encrypted database backup/restore for the AWIK NET Hostinger port.
 *
 * A snapshot is a gzip-compressed JSON document holding an ordered list of SQL
 * statements (CREATE TABLE + INSERT). The gzip is encrypted with AES-256-GCM and
 * authenticated with an HMAC-SHA256. Storage lives outside the public document
 * root; restore is intended only for an isolated database via the protected CLI
 * workflow.
 */

function awikBackupKey(): string
{
    $secret = awikMigrationEnv('AWIK_BACKUP_ENCRYPTION_KEY');
    if (!is_string($secret) || trim($secret) === '') {
        throw new RuntimeException('Backup encryption key is not configured');
    }

    $trimmed = trim($secret);
    if (preg_match('/^[0-9a-fA-F]{64}$/', $trimmed) === 1) {
        $raw = hex2bin($trimmed);
        if (is_string($raw) && strlen($raw) === 32) {
            return $raw;
        }
    }

    return hash('sha256', $trimmed, true);
}

function awikBackupAbsolutePath(string $path): string
{
    $path = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $path);
    if (!preg_match('#^([A-Za-z]:)?[\\\\/]#', $path)) {
        $cwd = getcwd();
        if ($cwd !== false) {
            $path = $cwd . DIRECTORY_SEPARATOR . $path;
        }
    }

    $real = realpath($path);
    if ($real !== false) {
        return $real;
    }

    $prefix = '';
    if (DIRECTORY_SEPARATOR === '\\' && preg_match('/^([A-Za-z]:)/', $path, $matches) === 1) {
        $prefix = strtoupper($matches[1]);
        $path = substr($path, 2);
    }

    $parts = preg_split('#[\\\\/]+#', $path) ?: [];
    $normalized = [];
    foreach ($parts as $part) {
        if ($part === '' || $part === '.') {
            continue;
        }
        if ($part === '..') {
            array_pop($normalized);
            continue;
        }
        $normalized[] = $part;
    }

    return $prefix . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $normalized);
}

function awikBackupPathWithin(string $candidate, string $root): bool
{
    $candidate = rtrim($candidate, "/\\");
    $root = rtrim($root, "/\\");
    if ($candidate === '' || $root === '') {
        return false;
    }

    if (DIRECTORY_SEPARATOR === '\\') {
        $candidate = strtolower($candidate);
        $root = strtolower($root);
    }

    return $candidate === $root
        || str_starts_with($candidate . DIRECTORY_SEPARATOR, $root . DIRECTORY_SEPARATOR);
}

function awikBackupDirectory(): string
{
    $configured = awikMigrationEnv('AWIK_BACKUP_DIR');
    if (!is_string($configured) || trim($configured) === '') {
        $configured = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'backups';
    }

    $directory = rtrim($configured, "/\\");
    if ($directory === '') {
        throw new RuntimeException('Backup directory is not configured');
    }

    $documentRoot = $_SERVER['DOCUMENT_ROOT'] ?? '';
    if (is_string($documentRoot) && trim($documentRoot) !== '') {
        $rootAbsolute = awikBackupAbsolutePath($documentRoot);
        $directoryAbsolute = awikBackupAbsolutePath($directory);
        if (awikBackupPathWithin($directoryAbsolute, $rootAbsolute)) {
            throw new RuntimeException('Backup storage must not be inside the public document root');
        }
    }

    if (!is_dir($directory)) {
        if (!@mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new RuntimeException('Unable to create the backup directory');
        }
    }

    return $directory;
}

function awikBackupWriteGzip($handle, string $data): void
{
    if (!is_resource($handle)) {
        throw new RuntimeException('Invalid backup gzip handle');
    }

    $written = gzwrite($handle, $data);
    if ($written === false || $written !== strlen($data)) {
        throw new RuntimeException('Unable to write the backup payload');
    }
}

function awikBackupParsePayload(string $payload, string $key): string
{
    $magic = 'AWIKBAK1';
    if (!str_starts_with($payload, $magic)) {
        throw new RuntimeException('Unrecognized backup format');
    }

    $body = substr($payload, strlen($magic));
    if (strlen($body) < 28) {
        throw new RuntimeException('Backup payload is truncated');
    }

    $iv = substr($body, 0, 12);
    $tag = substr($body, 12, 16);
    $ciphertext = substr($body, 28);

    $plaintext = openssl_decrypt($ciphertext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($plaintext === false) {
        throw new RuntimeException('Backup integrity verification failed');
    }

    return $plaintext;
}

function awikBackupEncryptGzip(string $gzipPath, string $encryptedPath, string $key): array
{
    $plaintext = @file_get_contents($gzipPath);
    if (!is_string($plaintext) || $plaintext === '') {
        throw new RuntimeException('Backup snapshot is unavailable');
    }

    if (strlen($key) !== 32) {
        $key = hash('sha256', $key, true);
    }

    $iv = random_bytes(12);
    $tag = '';
    $ciphertext = openssl_encrypt($plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
    if ($ciphertext === false) {
        throw new RuntimeException('Backup encryption failed');
    }

    $payload = 'AWIKBAK1' . $iv . $tag . $ciphertext;
    if (@file_put_contents($encryptedPath, $payload) !== strlen($payload)) {
        throw new RuntimeException('Unable to store the encrypted backup');
    }

    return [
        'size' => strlen($payload),
        'sha256' => hash('sha256', $plaintext),
        'hmac' => hash_hmac('sha256', $payload, $key),
    ];
}

function awikBackupVerifyFile(string $path, array $record, string $key): bool
{
    try {
        if (!is_file($path)) {
            return false;
        }

        $payload = file_get_contents($path);
        if (!is_string($payload)) {
            return false;
        }

        $size = $record['size'] ?? null;
        if (!is_int($size) || strlen($payload) !== $size) {
            return false;
        }

        $hmac = $record['hmac'] ?? null;
        if (!is_string($hmac) || !hash_equals(hash_hmac('sha256', $payload, $key), $hmac)) {
            return false;
        }

        $plaintext = awikBackupParsePayload($payload, $key);
        $checksum = $record['sha256'] ?? null;
        if (is_string($checksum) && !hash_equals(hash('sha256', $plaintext), $checksum)) {
            return false;
        }

        return true;
    } catch (Throwable) {
        return false;
    }
}

function awikBackupDecryptToGzip(string $encryptedPath, string $outputPath, string $key): void
{
    $payload = @file_get_contents($encryptedPath);
    if (!is_string($payload)) {
        throw new RuntimeException('Encrypted backup is unavailable');
    }

    $plaintext = awikBackupParsePayload($payload, $key);
    if (@file_put_contents($outputPath, $plaintext) !== strlen($plaintext)) {
        throw new RuntimeException('Unable to write the restored snapshot');
    }
}

function awikBackupManifestPath(): string
{
    return awikBackupDirectory() . DIRECTORY_SEPARATOR . 'backups.json';
}

function awikBackupReadManifest(): array
{
    $path = awikBackupManifestPath();
    if (!is_file($path)) {
        return [];
    }

    $raw = @file_get_contents($path);
    if (!is_string($raw) || $raw === '') {
        return [];
    }

    try {
        $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (Throwable) {
        return [];
    }

    if (!is_array($decoded)) {
        return [];
    }

    return array_values(array_filter($decoded, static fn ($entry): bool => is_array($entry)));
}

function awikBackupWriteManifest(array $records): void
{
    $path = awikBackupManifestPath();
    $encoded = json_encode(array_values($records), JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    if (@file_put_contents($path, $encoded, LOCK_EX) === false) {
        throw new RuntimeException('Unable to update the backup manifest');
    }
}

function awikFindBackupRecord(string $id): ?array
{
    if ($id === '') {
        return null;
    }

    foreach (awikBackupReadManifest() as $record) {
        if (($record['id'] ?? null) === $id) {
            return $record;
        }
    }

    return null;
}

function awikNormalizeBackupRecord(array $record): array
{
    return [
        'id' => $record['id'] ?? null,
        'filename' => $record['filename'] ?? null,
        'type' => $record['type'] ?? 'FULL',
        'size' => (int) ($record['size'] ?? 0),
        'status' => $record['status'] ?? 'COMPLETED',
        'description' => $record['description'] ?? null,
        'createdAt' => $record['createdAt'] ?? null,
    ];
}

function awikBackupSqlLiteral(PDO $db, $value): string
{
    if ($value === null) {
        return 'NULL';
    }
    if (is_int($value) || is_float($value)) {
        return (string) $value;
    }
    if (is_bool($value)) {
        return $value ? '1' : '0';
    }

    return $db->quote((string) $value);
}

function awikBackupQualifiedIdentifier(string $identifier): string
{
    return '`' . str_replace('`', '``', $identifier) . '`';
}

function awikBackupBuildSnapshot(PDO $db): array
{
    $driver = (string) $db->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'mysql') {
        $tables = $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    } elseif ($driver === 'sqlite') {
        $tables = $db->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            ->fetchAll(PDO::FETCH_COLUMN);
    } else {
        throw new RuntimeException('Backups are not supported for this database driver');
    }

    $statements = [];
    $tableCount = 0;
    $rowCount = 0;

    foreach ($tables as $table) {
        $table = (string) $table;
        if ($table === '') {
            continue;
        }

        if ($driver === 'mysql') {
            $create = $db->query('SHOW CREATE TABLE ' . awikBackupQualifiedIdentifier($table))->fetch(PDO::FETCH_ASSOC);
            $ddl = is_array($create) ? ($create['Create Table'] ?? null) : null;
        } else {
            $statement = $db->prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?");
            $statement->execute([$table]);
            $ddl = $statement->fetchColumn();
        }

        if (!is_string($ddl) || trim($ddl) === '') {
            continue;
        }

        $statements[] = $ddl;
        $tableCount++;

        $rows = $db->query('SELECT * FROM ' . awikBackupQualifiedIdentifier($table))->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            $columns = array_keys($row);
            $columnSql = implode(', ', array_map(static fn ($column): string => awikBackupQualifiedIdentifier((string) $column), $columns));
            $valueSql = implode(', ', array_map(static fn ($value): string => awikBackupSqlLiteral($db, $value), array_values($row)));
            $statements[] = 'INSERT INTO ' . awikBackupQualifiedIdentifier($table) . ' (' . $columnSql . ') VALUES (' . $valueSql . ')';
            $rowCount++;
        }
    }

    return [
        'format' => 'awik-backup-1',
        'driver' => $driver,
        'tables' => $tableCount,
        'rows' => $rowCount,
        'statements' => $statements,
    ];
}

function awikCreateDatabaseBackup(PDO $db, ?string $description = null): array
{
    $directory = awikBackupDirectory();
    $snapshot = awikBackupBuildSnapshot($db);
    $json = json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

    $recordId = awikUuidV4();
    $gzipPath = $directory . DIRECTORY_SEPARATOR . $recordId . '.snapshot.json.gz';
    $handle = gzopen($gzipPath, 'wb9');
    if ($handle === false) {
        throw new RuntimeException('Unable to create the backup snapshot');
    }
    try {
        awikBackupWriteGzip($handle, $json);
    } finally {
        gzclose($handle);
    }

    $filename = 'awik-backup-' . $recordId . '.awikbak';
    $encryptedPath = $directory . DIRECTORY_SEPARATOR . $filename;
    try {
        $metadata = awikBackupEncryptGzip($gzipPath, $encryptedPath, awikBackupKey());
    } finally {
        @unlink($gzipPath);
    }

    $record = [
        'id' => $recordId,
        'filename' => $filename,
        'size' => $metadata['size'],
        'storagePath' => $filename,
        'type' => 'FULL',
        'status' => 'COMPLETED',
        'description' => $description,
        'checksum' => $metadata['sha256'],
        'hmac' => $metadata['hmac'],
        'createdAt' => gmdate('Y-m-d\TH:i:s.v\Z'),
    ];

    $manifest = awikBackupReadManifest();
    $manifest[] = $record;
    awikBackupWriteManifest($manifest);

    return $record;
}

function awikRestoreDatabaseBackup(PDO $db, string $backupId, string $actorId): array
{
    $record = awikFindBackupRecord($backupId);
    if ($record === null) {
        throw new RuntimeException('Backup not found');
    }
    if (($record['status'] ?? '') !== 'COMPLETED') {
        throw new RuntimeException('Backup did not complete successfully');
    }

    $directory = awikBackupDirectory();
    $storageName = basename((string) ($record['storagePath'] ?? ''));
    $encryptedPath = $directory . DIRECTORY_SEPARATOR . $storageName;
    if ($storageName === '' || !is_file($encryptedPath)) {
        throw new RuntimeException('Backup file is unavailable');
    }

    $gzipPath = $encryptedPath . '.restore.gz';
    awikBackupDecryptToGzip($encryptedPath, $gzipPath, awikBackupKey());
    try {
        $json = gzdecode((string) file_get_contents($gzipPath));
    } finally {
        @unlink($gzipPath);
    }
    if (!is_string($json)) {
        throw new RuntimeException('Backup snapshot is corrupted');
    }

    $snapshot = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    $statements = is_array($snapshot) ? ($snapshot['statements'] ?? null) : null;
    if (!is_array($statements)) {
        throw new RuntimeException('Backup snapshot format is invalid');
    }

    $tableCount = 0;
    $rowCount = 0;
    $db->beginTransaction();
    try {
        foreach ($statements as $statement) {
            if (!is_string($statement) || trim($statement) === '') {
                continue;
            }
            $db->exec($statement);
            $upper = strtoupper(ltrim($statement));
            if (str_starts_with($upper, 'CREATE TABLE')) {
                $tableCount++;
            } elseif (str_starts_with($upper, 'INSERT INTO')) {
                $rowCount++;
            }
        }
        $db->commit();
    } catch (Throwable $exception) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $exception;
    }

    return [
        'tableCount' => $tableCount,
        'rowCount' => $rowCount,
        'actorId' => $actorId,
    ];
}

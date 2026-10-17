<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli' || $argc !== 2) {
    fwrite(STDERR, 'Usage: php restore-backup.php <backup-id>' . PHP_EOL);
    exit(2);
}

require_once __DIR__ . '/bootstrap.php';

$backupId = (string) $argv[1];
$actorId = awikMigrationEnv('AWIK_BACKUP_RESTORE_ACTOR_ID');
if (!is_string($actorId) || $actorId === '') {
    fwrite(STDERR, 'Restore blocked: an administrator audit actor must be configured.' . PHP_EOL);
    exit(2);
}

try {
    $result = awikRestoreDatabaseBackup(awikDatabase(), $backupId, $actorId);
    fwrite(
        STDOUT,
        'Isolated database restore verified: tables=' . $result['tableCount']
            . ', rows=' . $result['rowCount'] . PHP_EOL
    );
} catch (Throwable) {
    fwrite(STDERR, 'Restore failed closed; inspect the protected server error log.' . PHP_EOL);
    exit(1);
}

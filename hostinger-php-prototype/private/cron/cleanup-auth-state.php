<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}

if ($argc !== 1) {
    fwrite(STDERR, 'This maintenance command does not accept arguments.' . PHP_EOL);
    exit(2);
}

require_once __DIR__ . '/../bootstrap.php';

$db = null;
$lockName = null;
$lockAcquired = false;
$exitCode = 0;

try {
    $db = awikDatabase();
    if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'mysql') {
        throw new RuntimeException('MariaDB is required for scheduled cleanup');
    }

    $databaseName = (string) $db->query('SELECT DATABASE()')->fetchColumn();
    if ($databaseName === '') {
        throw new RuntimeException('A selected database is required for scheduled cleanup');
    }
    $lockName = 'awik_auth_cleanup_' . substr(hash('sha256', $databaseName), 0, 40);
    $lockStatement = $db->prepare('SELECT GET_LOCK(?, 0)');
    $lockStatement->execute([$lockName]);
    $lockResult = $lockStatement->fetchColumn();
    if ($lockResult === null || $lockResult === false) {
        throw new RuntimeException('Could not acquire scheduled cleanup lock');
    }
    $lockAcquired = (int) $lockResult === 1;

    if (!$lockAcquired) {
        fwrite(STDOUT, 'Cleanup skipped because another run holds the maintenance lock.' . PHP_EOL);
    } else {
        $db->beginTransaction();
        try {
            $expiredTokens = $db->exec(
                'DELETE FROM awik_user_tokens WHERE expiresAt <= UTC_TIMESTAMP(3) ORDER BY expiresAt LIMIT 5000'
            );
            $expiredRecoveryTokens = $db->exec(
                'DELETE FROM awik_password_recovery_tokens WHERE expiresAt <= UTC_TIMESTAMP(3) ORDER BY expiresAt LIMIT 5000'
            );
            $staleLoginAttempts = $db->exec(
                'DELETE FROM awik_login_attempts '
                . 'WHERE updatedAt < UTC_TIMESTAMP(3) - INTERVAL 30 DAY '
                . 'AND (lockedUntil IS NULL OR lockedUntil <= UTC_TIMESTAMP(3)) '
                . 'ORDER BY updatedAt LIMIT 5000'
            );
            $staleRecoveryLimits = $db->exec(
                'DELETE FROM awik_password_recovery_limits '
                . 'WHERE updatedAt < UTC_TIMESTAMP(3) - INTERVAL 1 DAY '
                . 'ORDER BY updatedAt LIMIT 5000'
            );
            $db->commit();
            fwrite(
                STDOUT,
                'Cleanup completed: expired tokens=' . (int) $expiredTokens
                    . ', expired recovery tokens=' . (int) $expiredRecoveryTokens
                    . ', stale login-attempt records=' . (int) $staleLoginAttempts
                    . ', stale recovery limit scopes=' . (int) $staleRecoveryLimits . PHP_EOL
            );
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
    }
} catch (Throwable) {
    fwrite(STDERR, 'Scheduled auth-state cleanup failed; inspect the protected PHP error log.' . PHP_EOL);
    $exitCode = 1;
} finally {
    if ($lockAcquired && $db instanceof PDO && is_string($lockName)) {
        try {
            $releaseStatement = $db->prepare('SELECT RELEASE_LOCK(?)');
            $releaseStatement->execute([$lockName]);
            if ((int) $releaseStatement->fetchColumn() !== 1) {
                fwrite(STDERR, 'Scheduled auth-state cleanup could not release its maintenance lock.' . PHP_EOL);
                $exitCode = 1;
            }
        } catch (Throwable) {
            fwrite(STDERR, 'Scheduled auth-state cleanup could not release its maintenance lock.' . PHP_EOL);
            $exitCode = 1;
        }
    }
}

exit($exitCode);

<?php

declare(strict_types=1);

function awikMaintenanceTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$prototypeRoot = dirname(__DIR__);
$jobPath = $prototypeRoot . DIRECTORY_SEPARATOR . 'private' . DIRECTORY_SEPARATOR . 'cron'
    . DIRECTORY_SEPARATOR . 'cleanup-auth-state.php';
$job = file_get_contents($jobPath);
awikMaintenanceTestAssert(is_string($job), 'Scheduled cleanup CLI entrypoint is missing');
$cliGuard = strpos($job, "if (PHP_SAPI !== 'cli')");
$bootstrapInclude = strpos($job, "require_once __DIR__ . '/../bootstrap.php'");
awikMaintenanceTestAssert(
    $cliGuard !== false && $bootstrapInclude !== false && $cliGuard < $bootstrapInclude,
    'Scheduled cleanup must reject web requests before loading application configuration'
);
awikMaintenanceTestAssert(
    str_contains($job, "if (\$argc !== 1)")
        && str_contains($job, 'GET_LOCK(?, 0)')
        && str_contains($job, 'RELEASE_LOCK(?)')
        && str_contains($job, "if (\$lockResult === null || \$lockResult === false)"),
    'Scheduled cleanup must reject arguments and serialize concurrent runs'
);
awikMaintenanceTestAssert(
    str_contains($job, 'expiresAt <= UTC_TIMESTAMP(3) ORDER BY expiresAt LIMIT 5000')
        && str_contains($job, 'awik_password_recovery_tokens WHERE expiresAt <= UTC_TIMESTAMP(3) ORDER BY expiresAt LIMIT 5000')
        && str_contains($job, 'updatedAt < UTC_TIMESTAMP(3) - INTERVAL 30 DAY')
        && str_contains($job, '(lockedUntil IS NULL OR lockedUntil <= UTC_TIMESTAMP(3))')
        && str_contains($job, 'awik_password_recovery_limits')
        && str_contains($job, 'INTERVAL 1 DAY')
        && str_contains($job, 'ORDER BY updatedAt LIMIT 5000'),
    'Cleanup must be bounded across auth/recovery records, retain recent limits/attempts, and preserve active lockouts'
);
awikMaintenanceTestAssert(
    str_contains($job, 'beginTransaction()')
        && str_contains($job, 'commit()')
        && str_contains($job, 'rollBack()')
        && !str_contains($job, 'AWIK_INITIAL_ADMIN_PASSWORD'),
    'Cleanup must be transactional and must not consume bootstrap credentials'
);

echo "AWIK scheduled maintenance boundary tests passed\n";

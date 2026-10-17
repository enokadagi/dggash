<?php

declare(strict_types=1);

require_once __DIR__ . '/../private/config.php';

function awikConfigTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function awikConfigTestReject(array $config, string $message): void
{
    try {
        awikValidateMigrationConfig($config);
    } catch (RuntimeException) {
        return;
    }

    throw new RuntimeException($message);
}

$validConfig = [
    'dsn' => 'mysql:host=127.0.0.1;dbname=awik_test',
    'dbUser' => 'awik_test',
    'dbPassword' => 'local-test-database-password',
    'jwtSecret' => str_repeat('a', 64),
    'jwtRefreshSecret' => str_repeat('b', 64),
];

awikValidateMigrationConfig($validConfig);
awikConfigTestReject(array_merge($validConfig, ['dsn' => '']), 'Missing DSN must be rejected');
awikConfigTestReject(array_merge($validConfig, ['dbUser' => '']), 'Missing MariaDB username must be rejected');
awikConfigTestReject(array_merge($validConfig, ['dbPassword' => '']), 'Missing MariaDB password must be rejected');
awikConfigTestReject(array_merge($validConfig, ['jwtSecret' => str_repeat('a', 31)]), 'Short access secret must be rejected');
awikConfigTestReject(array_merge($validConfig, ['jwtRefreshSecret' => str_repeat('b', 31)]), 'Short refresh secret must be rejected');
awikConfigTestReject(array_merge($validConfig, ['jwtRefreshSecret' => str_repeat('a', 64)]), 'Reused JWT secrets must be rejected');
awikConfigTestReject(array_merge($validConfig, ['dsn' => 'postgres:host=localhost']), 'Unsupported database driver must be rejected');

$previousTestDsn = getenv('MIGRATION_TEST_DSN');
putenv('AWIK_MIGRATION_DSN=');
putenv('MIGRATION_TEST_DSN=sqlite:/tmp/should-not-be-used.sqlite');
awikConfigTestAssert(awikMigrationConfig()['dsn'] === '', 'Legacy test fallback must not supply a runtime DSN');
if ($previousTestDsn === false) {
    putenv('MIGRATION_TEST_DSN');
} else {
    putenv('MIGRATION_TEST_DSN=' . $previousTestDsn);
}

echo "AWIK runtime configuration validation tests passed\n";

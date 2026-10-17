<?php

declare(strict_types=1);

function awikMigrationEnv(string $name, string $fallback = ''): string
{
    $value = getenv($name);
    if ($value === false || trim((string) $value) === '') {
        return $fallback;
    }

    return (string) $value;
}

function awikMigrationConfig(): array
{
    return [
        'dsn' => awikMigrationEnv('AWIK_MIGRATION_DSN'),
        'dbUser' => awikMigrationEnv('AWIK_MIGRATION_DB_USER'),
        'dbPassword' => awikMigrationEnv('AWIK_MIGRATION_DB_PASSWORD'),
        'jwtSecret' => awikMigrationEnv('AWIK_MIGRATION_JWT_SECRET'),
        'jwtRefreshSecret' => awikMigrationEnv('AWIK_MIGRATION_JWT_REFRESH_SECRET'),
        'appName' => awikMigrationEnv('AWIK_APP_NAME', 'AWIK NET'),
    ];
}

function awikLoadLocalEnv(): void
{
    if ((string) getenv('AWIK_LOAD_LOCAL_ENV') !== 'true') {
        return;
    }

    $envFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env';
    if (!is_file($envFile)) {
        return;
    }

    $raw = @file_get_contents($envFile);
    if (!is_string($raw) || trim($raw) === '') {
        return;
    }

    foreach (explode("\n", $raw) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        $eq = strpos($line, '=');
        if ($eq === false) {
            continue;
        }
        $name = trim(substr($line, 0, $eq));
        $value = trim(substr($line, $eq + 1));
        if ($name === '' || getenv($name) !== false) {
            continue;
        }
        if (($first = substr($value, 0, 1)) === '"' && substr($value, -1) === '"') {
            $value = substr($value, 1, -1);
        }
        putenv($name . '=' . $value);
    }
}

awikLoadLocalEnv();

function awikValidateMigrationConfig(array $config): void
{
    if (!isset($config['dsn']) || !is_string($config['dsn']) || $config['dsn'] === '') {
        throw new RuntimeException('Database DSN is not configured');
    }

    foreach (['jwtSecret', 'jwtRefreshSecret'] as $secretName) {
        $secret = $config[$secretName] ?? null;
        if (!is_string($secret) || strlen($secret) < 32) {
            throw new RuntimeException('JWT signing secrets must each contain at least 32 bytes');
        }
    }
    if (hash_equals($config['jwtSecret'], $config['jwtRefreshSecret'])) {
        throw new RuntimeException('Access and refresh signing secrets must be different');
    }

    if (str_starts_with($config['dsn'], 'mysql:')) {
        if (($config['dbUser'] ?? '') === '' || ($config['dbPassword'] ?? '') === '') {
            throw new RuntimeException('MariaDB username and password must be configured');
        }
        return;
    }

    if (str_starts_with($config['dsn'], 'sqlite:') && in_array(PHP_SAPI, ['cli', 'cli-server'], true)) {
        return;
    }

    throw new RuntimeException('Only MariaDB is supported outside local CLI tests');
}

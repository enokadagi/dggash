<?php

declare(strict_types=1);

function awikSchemaTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$prototypeRoot = dirname(__DIR__);
$path = static fn (string ...$segments): string => implode(DIRECTORY_SEPARATOR, $segments);
$authBaselinePath = $path($prototypeRoot, 'private', 'schema', 'auth-slice.sql');
$loginMigrationPath = $path($prototypeRoot, 'database', 'migrations', '2026_10_12_login_attempts.sql');
$companySettingsMigrationPath = $path($prototypeRoot, 'database', 'migrations', '2026_10_13_company_settings.sql');
$applicationMigrationPath = $path($prototypeRoot, 'database', 'migrations', '2026_10_13_full_application.sql');
$recoveryMigrationPath = $path($prototypeRoot, 'database', 'migrations', '2026_10_14_password_recovery.sql');
$builderPath = $path(dirname($prototypeRoot), 'scripts', 'build-hostinger-package.ps1');
$authBaseline = file_get_contents($authBaselinePath);
$loginMigration = file_get_contents($loginMigrationPath);
$companySettingsMigration = file_get_contents($companySettingsMigrationPath);
$applicationMigration = file_get_contents($applicationMigrationPath);
$recoveryMigration = file_get_contents($recoveryMigrationPath);
$builder = file_get_contents($builderPath);
foreach ([$authBaseline, $loginMigration, $companySettingsMigration, $applicationMigration, $recoveryMigration, $builder] as $source) {
    awikSchemaTestAssert(is_string($source), 'A required schema setup source is missing');
}

$cleanInstallChain = [
    '2026_10_11_auth_core.sql' => $authBaseline,
    '2026_10_12_login_attempts.sql' => $loginMigration,
    '2026_10_13_full_application.sql' => $applicationMigration,
    '2026_10_14_password_recovery.sql' => $recoveryMigration,
];
$createdTables = [];
$availableTables = [];
foreach ($cleanInstallChain as $migrationName => $sql) {
    foreach (preg_split('/;\s*(?:\r?\n|$)/', $sql) ?: [] as $statement) {
        if (preg_match('/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+`([^`]+)`/i', $statement, $tableMatch) !== 1) {
            continue;
        }
        $tableName = $tableMatch[1];
        awikSchemaTestAssert(!in_array($tableName, $createdTables, true), 'Duplicate clean-install DDL for ' . $tableName);
        preg_match_all('/REFERENCES\s+`([^`]+)`/i', $statement, $referenceMatches);
        foreach ($referenceMatches[1] as $referencedTable) {
            awikSchemaTestAssert(
                in_array($referencedTable, $availableTables, true) || $referencedTable === $tableName,
                $migrationName . ' references table before its prerequisite exists: ' . $referencedTable
            );
        }
        $createdTables[] = $tableName;
        $availableTables[] = $tableName;
    }
    $withoutComments = preg_replace('/^\s*--.*$/m', '', $sql);
    awikSchemaTestAssert(
        preg_match('/\b(DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\s+TABLE|DELETE\s+FROM|ALTER\s+TABLE\b[^;]*\bDROP\b)\b/i', (string) $withoutComments) !== 1,
        'Clean-install migration contains destructive DDL or DML: ' . $migrationName
    );
}

$schemaSqlPaths = array_merge(
    glob($path($prototypeRoot, 'private', 'schema', '*.sql')) ?: [],
    glob($path($prototypeRoot, 'database', 'migrations', '*.sql')) ?: []
);
awikSchemaTestAssert($schemaSqlPaths !== [], 'No PHP schema or migration SQL files were found');
foreach ($schemaSqlPaths as $schemaSqlPath) {
    $sql = file_get_contents($schemaSqlPath);
    awikSchemaTestAssert(is_string($sql), 'Could not read schema SQL: ' . basename($schemaSqlPath));
    $withoutComments = preg_replace('/^\s*--.*$/m', '', $sql);
    awikSchemaTestAssert(
        preg_match('/\b(DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\s+TABLE|DELETE\s+FROM|ALTER\s+TABLE\b[^;]*\bDROP\b)\b/i', (string) $withoutComments) !== 1,
        'Schema or migration contains destructive DDL or DML: ' . basename($schemaSqlPath)
    );
}

awikSchemaTestAssert(
    count(array_filter($createdTables, static fn (string $table): bool => $table === 'awik_company_settings')) === 1,
    'Clean-install chain must create company settings exactly once'
);
awikSchemaTestAssert(!str_contains($applicationMigration, 'CREATE TABLE IF NOT EXISTS `awik_company_settings`'), 'Full-application migration must not duplicate company settings DDL');
awikSchemaTestAssert(
    !str_contains($builder, "'2026_10_13_company_settings.sql'")
        && str_contains($builder, "'2026_10_11_auth_core.sql'"),
    'Builder must package the baseline and exclude the legacy duplicate company-settings migration'
);

$authIndex = strpos($builder, "'2026_10_11_auth_core.sql'");
$loginIndex = strpos($builder, "'2026_10_12_login_attempts.sql'");
$applicationIndex = strpos($builder, "'2026_10_13_full_application.sql'");
$recoveryIndex = strpos($builder, "'2026_10_14_password_recovery.sql'");
awikSchemaTestAssert(
    $authIndex !== false && $loginIndex !== false && $applicationIndex !== false && $recoveryIndex !== false
        && $authIndex < $loginIndex && $loginIndex < $applicationIndex && $applicationIndex < $recoveryIndex,
    'Package clean-install migration order must be core, login attempts, business schema, then password recovery'
);
awikSchemaTestAssert(
    str_contains($builder, 'new, empty MariaDB database only')
        && str_contains($builder, 'cleanup-auth-state.php')
        && str_contains($builder, 'No cron entry is installed by this package'),
    'Generated package documentation must state migration and scheduled-job boundaries'
);
awikSchemaTestAssert(count($createdTables) === 18, 'Unexpected number of clean-install PHP schema tables');
awikSchemaTestAssert(
    str_contains($recoveryMigration, '`tokenHash` CHAR(64) NOT NULL')
        && str_contains($recoveryMigration, 'FOREIGN KEY (`userId`) REFERENCES `awik_users` (`id`)')
        && str_contains($recoveryMigration, '`scopeHash` CHAR(64) NOT NULL'),
    'Password recovery schema must store hashed tokens and hashed throttle scopes with a user FK'
);

echo "AWIK schema setup and migration-order tests passed\n";

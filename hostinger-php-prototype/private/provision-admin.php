<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/admin-provisioner.php';

$input = [
    'email' => awikMigrationEnv('AWIK_INITIAL_ADMIN_EMAIL') ?: '',
    'phone' => awikMigrationEnv('AWIK_INITIAL_ADMIN_PHONE') ?: '',
    'firstName' => awikMigrationEnv('AWIK_INITIAL_ADMIN_FIRST_NAME') ?: '',
    'lastName' => awikMigrationEnv('AWIK_INITIAL_ADMIN_LAST_NAME') ?: '',
    'password' => awikMigrationEnv('AWIK_INITIAL_ADMIN_PASSWORD') ?: '',
];

try {
    awikProvisionInitialAdmin(awikDatabase(), $input);
    fwrite(STDOUT, 'Initial ADMIN created. This command will refuse to run again on a non-empty installation.' . PHP_EOL);
} catch (Throwable) {
    fwrite(STDERR, 'Initial ADMIN provisioning failed. No credentials or database details were emitted.' . PHP_EOL);
    exit(1);
}

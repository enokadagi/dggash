<?php

declare(strict_types=1);

require_once __DIR__ . '/../private/admin-provisioner.php';

function awikAdminProvisionTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function awikAdminProvisionTestReject(array $input, string $message): void
{
    try {
        awikValidateInitialAdminInput($input);
    } catch (RuntimeException) {
        return;
    }

    throw new RuntimeException($message);
}

$validInput = [
    'email' => 'first-admin@example.invalid',
    'phone' => '+15550000991',
    'firstName' => 'Initial',
    'lastName' => 'Admin',
    'password' => 'local-only-initial-admin-password',
];
$normalized = awikValidateInitialAdminInput($validInput);
awikAdminProvisionTestAssert(!array_key_exists('role', $normalized), 'Provisioning input must not choose its role');
awikAdminProvisionTestAssert($normalized['email'] === $validInput['email'], 'Valid email was not retained');

awikAdminProvisionTestReject(array_merge($validInput, ['role' => 'ADMIN']), 'Caller-supplied role must be rejected');
awikAdminProvisionTestReject(array_merge($validInput, ['password' => 'short']), 'Weak initial password must be rejected');
awikAdminProvisionTestReject(array_merge($validInput, ['email' => 'not-an-email']), 'Invalid email must be rejected');
awikAdminProvisionTestReject(array_merge($validInput, ['phone' => str_repeat('1', 31)]), 'Overlong phone must be rejected');

$entrypoint = file_get_contents(__DIR__ . '/../private/provision-admin.php');
$publicEntrypoint = file_get_contents(__DIR__ . '/../public/index.php');
awikAdminProvisionTestAssert(
    is_string($entrypoint) && str_contains($entrypoint, "PHP_SAPI !== 'cli'"),
    'Provisioner must reject non-CLI execution'
);
awikAdminProvisionTestAssert(
    is_string($publicEntrypoint) && !str_contains($publicEntrypoint, 'provision-admin'),
    'Initial administrator provisioning must not be wired to an HTTP route'
);
awikAdminProvisionTestAssert(
    str_contains($entrypoint, 'AWIK_INITIAL_ADMIN_PASSWORD')
        && !str_contains($entrypoint, 'password='),
    'Initial password must be supplied through process environment, not a command-line option'
);

echo "AWIK initial administrator provisioning tests passed\n";

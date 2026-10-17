<?php

declare(strict_types=1);

require_once __DIR__ . '/../private/bootstrap.php';

function awikUserTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }
}

function awikUserTestExpectStatus(callable $callback, int $status, string $message): AwikApiException
{
    try {
        $callback();
    } catch (AwikApiException $exception) {
        awikUserTestAssert($exception->statusCode === $status, $message . ': wrong status');
        return $exception;
    }

    awikUserTestAssert(false, $message . ': expected exception');
    throw new RuntimeException('Unreachable');
}

awikRequireAdminUser(['role' => 'ADMIN']);
awikUserTestExpectStatus(static fn () => awikRequireAdminUser(['role' => 'STAFF']), 403, 'staff user administration access');

$created = awikValidateManagedUserInput([
    'phone' => '+96170123456',
    'firstName' => 'Staff',
    'lastName' => 'Member',
    'password' => 'long-enough-password',
], true);
awikUserTestAssert($created['email'] === null, 'missing email must default to null');
awikUserTestAssert($created['role'] === 'STAFF' && $created['status'] === 'ACTIVE', 'create user defaults mismatch');
awikUserTestAssert($created['password'] === 'long-enough-password', 'password value was changed before hashing');

awikUserTestExpectStatus(
    static fn () => awikValidateManagedUserInput([
        'phone' => '+96170123456', 'firstName' => 'A', 'lastName' => 'B', 'password' => 'short',
    ], true),
    400,
    'short create password'
);
awikUserTestExpectStatus(
    static fn () => awikValidateManagedUserInput([
        'phone' => '+96170123456', 'firstName' => 'A', 'lastName' => 'B', 'password' => 'long-enough-password', 'role' => 'ROOT',
    ], true),
    400,
    'invalid create role'
);
awikUserTestExpectStatus(
    static fn () => awikValidateManagedUserInput([
        'phone' => '+96170123456', 'firstName' => 'A', 'lastName' => 'B', 'password' => 'long-enough-password', 'unexpected' => true,
    ], true),
    400,
    'unknown create field'
);
awikUserTestExpectStatus(
    static fn () => awikValidateManagedUserInput(['phone' => '+96170123456'], false),
    400,
    'phone must not be accepted by update DTO'
);
awikUserTestExpectStatus(
    static fn () => awikValidateManagedUserInput(['password' => 'long-enough-password'], false),
    400,
    'password must use the dedicated password route'
);
awikUserTestExpectStatus(
    static fn () => awikValidateUserQuery(['limit' => '101']),
    400,
    'user query limit maximum'
);
awikUserTestExpectStatus(
    static fn () => awikValidateUserQuery(['role' => 'ROOT']),
    400,
    'user query role enum'
);

$normalized = awikNormalizeManagedUser([
    'id' => '00000000-0000-4000-8000-000000000001',
    'phone' => '+96170123456',
    'email' => null,
    'firstName' => 'Staff',
    'lastName' => 'Member',
    'role' => 'STAFF',
    'status' => 'ACTIVE',
    'lastLoginAt' => null,
    'createdAt' => '2026-10-12 12:00:00.123',
    'updatedAt' => '2026-10-12 12:30:00.456',
]);
awikUserTestAssert(!array_key_exists('passwordHash', $normalized), 'user projections must not expose password hashes');
awikUserTestAssert($normalized['createdAt'] === '2026-10-12T12:00:00.123Z', 'user timestamp projection mismatch');

echo "AWIK user validation tests passed\n";

<?php

declare(strict_types=1);

require_once __DIR__ . '/../private/bootstrap.php';

foreach ([
    'awikHandleCustomerRequest',
    'awikWriteCustomerAudit',
    'awikWriteCustomerHttpAudit',
    'awikHandleUserRequest',
    'awikWriteSettingsHttpAudit',
] as $requiredFunction) {
    if (!function_exists($requiredFunction)) {
        fwrite(STDERR, 'Required handler function is not globally available: ' . $requiredFunction . PHP_EOL);
        exit(1);
    }
}

function awikCustomerTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }
}

function awikCustomerTestExpectStatus(callable $callback, int $status, string $message): AwikApiException
{
    try {
        $callback();
    } catch (AwikApiException $exception) {
        awikCustomerTestAssert($exception->statusCode === $status, $message . ': wrong status');
        return $exception;
    }

    awikCustomerTestAssert(false, $message . ': expected exception');
    throw new RuntimeException('Unreachable');
}

$created = awikValidateCustomerInput([
    'phone' => '+96170123456',
    'email' => 'customer@example.com',
    'whatsappNumber' => '+96170123456',
    'firstName' => 'Sam',
    'lastName' => 'Customer',
    'latitude' => 90,
    'longitude' => -180,
], true);
awikCustomerTestAssert($created['phone'] === '+96170123456', 'valid E.164 phone was changed');
awikCustomerTestAssert($created['status'] === 'active', 'create default status mismatch');
awikCustomerTestAssert($created['email'] === 'customer@example.com', 'email was changed');
awikCustomerTestAssert($created['latitude'] === 90.0 && $created['longitude'] === -180.0, 'coordinate boundary conversion mismatch');
awikCustomerTestAssert($created['address'] === null && $created['location'] === null, 'omitted optional fields must be null');

awikCustomerTestExpectStatus(
    static fn () => awikValidateCustomerInput(['firstName' => 'Sam', 'lastName' => 'Customer'], true),
    400,
    'missing required phone'
);
awikCustomerTestExpectStatus(
    static fn () => awikValidateCustomerInput([
        'phone' => '96170123456', 'firstName' => 'Sam', 'lastName' => 'Customer',
    ], true),
    400,
    'non-E.164 phone'
);
awikCustomerTestExpectStatus(
    static fn () => awikValidateCustomerInput([
        'phone' => '+96170123456', 'whatsappNumber' => 'bad',
        'firstName' => 'Sam', 'lastName' => 'Customer',
    ], true),
    400,
    'invalid WhatsApp number'
);
awikCustomerTestExpectStatus(
    static fn () => awikValidateCustomerInput([
        'phone' => '+96170123456', 'email' => 'not-an-email',
        'firstName' => 'Sam', 'lastName' => 'Customer',
    ], true),
    400,
    'invalid email'
);
awikCustomerTestExpectStatus(
    static fn () => awikValidateCustomerInput([
        'phone' => '+96170123456', 'firstName' => 'Sam', 'lastName' => 'Customer', 'latitude' => 90.01,
    ], true),
    400,
    'latitude upper bound'
);
awikCustomerTestExpectStatus(
    static fn () => awikValidateCustomerInput([
        'phone' => '+96170123456', 'firstName' => 'Sam', 'lastName' => 'Customer', 'longitude' => -180.01,
    ], true),
    400,
    'longitude lower bound'
);
$unknownProperty = awikCustomerTestExpectStatus(
    static fn () => awikValidateCustomerInput([
        'phone' => '+96170123456', 'firstName' => 'Sam', 'lastName' => 'Customer', 'admin' => true,
    ], true),
    400,
    'unknown property'
);
awikCustomerTestAssert(
    in_array('property admin should not exist', $unknownProperty->errors, true),
    'unknown-property error mismatch'
);
awikRequireCustomerRole(['role' => 'ADMIN']);
awikRequireCustomerRole(['role' => 'STAFF']);
awikCustomerTestExpectStatus(
    static fn () => awikRequireCustomerRole(['role' => 'UNKNOWN']),
    403,
    'customer role authorization'
);

$patch = awikValidateCustomerInput(['email' => null, 'notes' => null, 'firstName' => ''], false);
awikCustomerTestAssert(array_key_exists('email', $patch) && $patch['email'] === null, 'nullable optional fields must be preserved');
awikCustomerTestAssert($patch['firstName'] === '', 'update DTO permits empty optional name strings');

$clearedOptionals = awikValidateCustomerInput([
    'phone' => '+96170123456', 'email' => '', 'whatsappNumber' => '',
    'firstName' => 'Sam', 'lastName' => 'Customer',
], true);
awikCustomerTestAssert($clearedOptionals['email'] === '' && $clearedOptionals['whatsappNumber'] === '', 'empty optional email/whatsapp must be accepted on create');

$clearedPatch = awikValidateCustomerInput(['email' => '', 'whatsappNumber' => ''], false);
awikCustomerTestAssert($clearedPatch['email'] === '' && $clearedPatch['whatsappNumber'] === '', 'clearing email/whatsapp on update must be accepted');

$clearedUser = awikValidateManagedUserInput(['email' => ''], false);
awikCustomerTestAssert($clearedUser['email'] === '', 'clearing a managed user email on update must be accepted');

$defaults = awikValidateCustomerQuery([]);
awikCustomerTestAssert($defaults['page'] === 1 && $defaults['limit'] === 20, 'pagination defaults mismatch');
awikCustomerTestAssert($defaults['sortBy'] === 'createdAt' && $defaults['sortOrder'] === 'desc', 'sort defaults mismatch');
$sortFallback = awikValidateCustomerQuery(['sortBy' => 'notAColumn', 'sortOrder' => 'asc']);
awikCustomerTestAssert($sortFallback['sortBy'] === 'createdAt' && $sortFallback['sortOrder'] === 'asc', 'sort fallback mismatch');
awikCustomerTestExpectStatus(
    static fn () => awikValidateCustomerQuery(['limit' => '101']),
    400,
    'limit maximum'
);
awikCustomerTestExpectStatus(
    static fn () => awikValidateCustomerQuery(['status' => 'unknown']),
    400,
    'status enum'
);

$normalized = awikNormalizeCustomer([
    'id' => '00000000-0000-4000-8000-000000000001',
    'phone' => '+96170123456',
    'latitude' => '33.9',
    'longitude' => '35.5',
    'createdAt' => '2026-10-12 12:00:00.123',
    'updatedAt' => '2026-10-12 12:30:00.456',
]);
awikCustomerTestAssert($normalized['latitude'] === 33.9 && $normalized['longitude'] === 35.5, 'customer coordinate projection mismatch');
awikCustomerTestAssert($normalized['createdAt'] === '2026-10-12T12:00:00.123Z', 'customer timestamp projection mismatch');

echo "AWIK customer validation tests passed\n";

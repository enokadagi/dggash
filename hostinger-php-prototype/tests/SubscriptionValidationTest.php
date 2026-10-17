<?php

declare(strict_types=1);

require_once __DIR__ . '/../private/bootstrap.php';

function awikSubscriptionTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }
}

function awikSubscriptionTestExpectStatus(callable $callback, int $status, string $message): AwikApiException
{
    try {
        $callback();
    } catch (AwikApiException $exception) {
        awikSubscriptionTestAssert($exception->statusCode === $status, $message . ': wrong status');
        return $exception;
    }
    awikSubscriptionTestAssert(false, $message . ': expected exception');
    throw new RuntimeException('Unreachable');
}

$created = awikValidateSubscriptionInput([
    'customerId' => 'customer-id',
    'planId' => 'plan-id',
    'durationDays' => 30,
    'paymentStatus' => 'pending',
], 'create');
awikSubscriptionTestAssert($created['durationDays'] === 30, 'create duration conversion mismatch');
awikSubscriptionTestAssert($created['paymentStatus'] === 'pending', 'payment status validation mismatch');

awikSubscriptionTestExpectStatus(
    static fn () => awikValidateSubscriptionInput(['customerId' => 'customer-id'], 'create'),
    400,
    'required create fields'
);
awikSubscriptionTestExpectStatus(
    static fn () => awikValidateSubscriptionInput(['customerId' => 'customer-id', 'planId' => 'plan-id', 'durationDays' => 1.5], 'create'),
    400,
    'fractional duration'
);
awikSubscriptionTestExpectStatus(
    static fn () => awikValidateSubscriptionInput(['customerId' => 'customer-id', 'planId' => 'plan-id', 'durationDays' => 0], 'create'),
    400,
    'zero duration'
);
awikSubscriptionTestExpectStatus(
    static fn () => awikValidateSubscriptionInput(['customerId' => 'customer-id', 'planId' => 'plan-id', 'paymentStatus' => 'unpaid'], 'create'),
    400,
    'payment status enum'
);
awikSubscriptionTestExpectStatus(
    static fn () => awikValidateSubscriptionInput(['customerId' => 'customer-id', 'planId' => 'plan-id', 'extra' => true], 'create'),
    400,
    'unknown property'
);
awikSubscriptionTestExpectStatus(
    static fn () => awikValidateSubscriptionInput(['startDate' => 'not-a-date'], 'update'),
    400,
    'invalid date'
);

$now = new DateTimeImmutable('2026-10-12T12:00:00Z');
awikSubscriptionTestAssert(
    awikComputeSubscriptionStatus(new DateTimeImmutable('2026-10-11T12:00:00Z'), 7, $now) === 'EXPIRED',
    'expired status mismatch'
);
awikSubscriptionTestAssert(
    awikComputeSubscriptionStatus(new DateTimeImmutable('2026-10-15T12:00:00Z'), 7, $now) === 'EXPIRING_SOON',
    'expiring-soon status mismatch'
);
awikSubscriptionTestAssert(
    awikComputeSubscriptionStatus(new DateTimeImmutable('2026-10-20T12:00:01Z'), 7, $now) === 'ACTIVE',
    'active status mismatch'
);

awikSubscriptionTestAssert(
    awikParseUtcDate('2026-10-12T15:00:00+03:00')->format('Y-m-d H:i:s') === '2026-10-12 12:00:00',
    'offset date must normalize to UTC'
);

$normalized = awikNormalizeSubscription([
    'id' => 'subscription-id',
    'customerId' => 'customer-id',
    'planId' => 'plan-id',
    'startDate' => '2026-10-12 12:00:00.000',
    'expiryDate' => '2026-11-11 12:00:00.000',
    'status' => 'ACTIVE',
    'paymentStatus' => 'paid',
    'createdAt' => '2026-10-12 12:00:00.000',
    'updatedAt' => '2026-10-12 12:00:00.000',
]);
awikSubscriptionTestAssert($normalized['startDate'] === '2026-10-12T12:00:00.000Z', 'subscription timestamp projection mismatch');
awikSubscriptionTestAssert(!array_key_exists('reminders', $normalized), 'list/create projection should not include reminders');

$detail = awikNormalizeSubscription([
    'id' => 'subscription-id', 'customerId' => 'customer-id', 'planId' => 'plan-id', 'status' => 'ACTIVE',
], null, null, [], true);
awikSubscriptionTestAssert(array_key_exists('reminders', $detail), 'detail projection must include reminders');

echo "AWIK subscription validation tests passed\n";

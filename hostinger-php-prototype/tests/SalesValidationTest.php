<?php

declare(strict_types=1);

require_once __DIR__ . '/../private/bootstrap.php';

function awikSalesTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }
}

function awikSalesTestExpectStatus(callable $callback, int $status, string $message): void
{
    try {
        $callback();
    } catch (AwikApiException $exception) {
        awikSalesTestAssert($exception->statusCode === $status, $message . ': wrong status');
        return;
    }
    awikSalesTestAssert(false, $message . ': expected exception');
}

awikSalesTestAssert(function_exists('awikValidateSaleInput'), 'sale validation function must exist');
awikSalesTestAssert(function_exists('awikGenerateSaleNumber'), 'sale number generator must exist');
awikSalesTestAssert(function_exists('awikHandleSaleRequest'), 'sale route handler must exist');
awikSalesTestAssert(function_exists('awikSaleRouteMatches'), 'sale route matcher must exist');

$route = awikSaleRouteMatches('POST', '/api/v1/sales');
awikSalesTestAssert($route !== null && ($route['kind'] ?? null) === 'sale-create', 'sale create route mismatch');

$route = awikSaleRouteMatches('POST', '/api/v1/sales/abc/refund');
awikSalesTestAssert($route !== null && ($route['kind'] ?? null) === 'sale-action' && ($route['action'] ?? null) === 'refund', 'sale refund route mismatch');

$valid = awikValidateSaleInput([
    'items' => [
        ['productId' => 'p-1', 'quantity' => 2],
        ['productId' => 'p-1', 'quantity' => 1],
    ],
    'customerId' => 'c-1',
    'paymentMethod' => 'cash',
    'currency' => 'USD',
    'notes' => 'Play test',
]);
awikSalesTestAssert($valid['paymentMethod'] === 'cash', 'sale payment method mismatch');
awikSalesTestAssert($valid['items'][0]['quantity'] === 2, 'sale item quantity mismatch');

awikSalesTestExpectStatus(
    static fn () => awikValidateSaleInput(['items' => [['productId' => 'p-1', 'quantity' => 0]], 'paymentMethod' => 'cash']),
    400,
    'invalid sale quantity'
);

awikSalesTestExpectStatus(
    static fn () => awikValidateSaleInput(['items' => [['productId' => 'p-1', 'quantity' => 2]], 'paymentMethod' => 'paypal']),
    400,
    'invalid payment method'
);

$number = awikGenerateSaleNumber();
awikSalesTestAssert(str_starts_with($number, 'S-'), 'sale number prefix mismatch');

echo "AWIK sales validation tests passed\n";

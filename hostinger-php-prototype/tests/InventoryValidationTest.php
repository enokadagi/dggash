<?php

declare(strict_types=1);

require_once __DIR__ . '/../private/bootstrap.php';

function awikInventoryTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }
}

function awikInventoryTestExpectStatus(callable $callback, int $status, string $message): void
{
    try {
        $callback();
    } catch (AwikApiException $exception) {
        awikInventoryTestAssert($exception->statusCode === $status, $message . ': wrong status');
        return;
    }
    awikInventoryTestAssert(false, $message . ': expected exception');
}

awikInventoryTestAssert(function_exists('awikHandleInventoryRequest'), 'inventory route handler must exist');
awikInventoryTestAssert(function_exists('awikValidateProductInput'), 'product validation function must exist');
awikInventoryTestAssert(function_exists('awikValidateInventoryCategoryInput'), 'inventory category validation function must exist');
awikInventoryTestAssert(function_exists('awikValidateStockMovementInput'), 'stock movement validation function must exist');
awikInventoryTestAssert(function_exists('awikInventoryRouteMatches'), 'inventory route matcher must exist');

$route = awikInventoryRouteMatches('GET', '/api/v1/products');
awikInventoryTestAssert($route !== null && ($route['kind'] ?? null) === 'product-list', 'product list route mismatch');

$route = awikInventoryRouteMatches('POST', '/api/v1/products/abc123/movements');
awikInventoryTestAssert($route !== null && ($route['kind'] ?? null) === 'product-movement-create', 'product movement route mismatch');

$route = awikInventoryRouteMatches('PATCH', '/api/v1/inventory/categories/abc');
awikInventoryTestAssert($route !== null && ($route['kind'] ?? null) === 'category-update', 'category update route mismatch');

$category = awikValidateInventoryCategoryInput(['name' => 'Switches', 'description' => 'Network'], true);
awikInventoryTestAssert($category['name'] === 'Switches', 'category name validation mismatch');
awikInventoryTestAssert($category['description'] === 'Network', 'category description validation mismatch');

awikInventoryTestExpectStatus(
    static fn () => awikValidateInventoryCategoryInput(['description' => 'bad'], true),
    400,
    'category required name'
);

$product = awikValidateProductInput([
    'name' => 'Router',
    'sku' => 'ROUTER-01',
    'categoryId' => 'cat-1',
    'purchasePrice' => 45,
    'sellingPrice' => 65,
    'initialStock' => 8,
    'minStock' => 2,
    'currency' => 'USD',
    'isActive' => true,
], true);
awikInventoryTestAssert($product['sku'] === 'ROUTER-01', 'product sku validation mismatch');
awikInventoryTestAssert((int) $product['initialStock'] === 8, 'product initial stock mismatch');

awikInventoryTestExpectStatus(
    static fn () => awikValidateProductInput(['name' => 'Router', 'sku' => 'bad sku', 'categoryId' => 'cat-1'], true),
    400,
    'invalid sku format'
);

$movement = awikValidateStockMovementInput(['movementType' => 'PURCHASE', 'quantity' => 5, 'reference' => 'PO-1']);
awikInventoryTestAssert($movement['quantity'] === 5.0, 'movement quantity normalization mismatch');

awikInventoryTestExpectStatus(
    static fn () => awikValidateStockMovementInput(['movementType' => 'ADJUSTMENT', 'quantity' => 0]),
    400,
    'adjustment zero quantity'
);

awikInventoryTestAssert(awikMovementDelta('PURCHASE', 3) === 3, 'purchase delta mismatch');
awikInventoryTestAssert(awikMovementDelta('DAMAGED', 4) === -4, 'damaged delta mismatch');
awikInventoryTestAssert(awikMovementDelta('CORRECTION', -2) === -2, 'correction delta mismatch');

echo "AWIK inventory validation tests passed\n";

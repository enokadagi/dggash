<?php

declare(strict_types=1);

$databasePath = sys_get_temp_dir() . '/awik_php_plans_' . bin2hex(random_bytes(12)) . '.sqlite';
putenv('AWIK_MIGRATION_DSN=sqlite:' . $databasePath);
putenv('AWIK_MIGRATION_DB_USER=');
putenv('AWIK_MIGRATION_DB_PASSWORD=');
putenv('AWIK_MIGRATION_JWT_SECRET=local-plan-access-secret-for-tests-only-32');
putenv('AWIK_MIGRATION_JWT_REFRESH_SECRET=local-plan-refresh-secret-for-tests-only-32');

register_shutdown_function(static function () use ($databasePath): void {
    unset($GLOBALS['insertUser'], $GLOBALS['db']);
    gc_collect_cycles();
    if (is_file($databasePath)) {
        unlink($databasePath);
    }
});

require_once __DIR__ . '/../private/bootstrap.php';

function awikPlanTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }
}

function awikPlanTestRequest(string $method, string $uri, array $body = [], array $headers = []): array
{
    return awikHandleRequest([
        'method' => $method,
        'uri' => $uri,
        'headers' => $headers,
        'body' => $body,
        'ipAddress' => '127.0.0.1',
    ]);
}

function awikPlanTestSuccess(array $response, int $status, string $message): array
{
    awikPlanTestAssert(($response['statusCode'] ?? null) === $status, $message . ': unexpected HTTP status');
    $payload = $response['payload'] ?? [];
    awikPlanTestAssert(($payload['success'] ?? false) === true, $message . ': missing success envelope');
    awikPlanTestAssert(array_keys($payload) === ['success', 'data'], $message . ': success envelope differs from NestJS');

    return $payload['data'];
}

function awikPlanTestFailure(array $response, int $status, string $path, string $message): void
{
    awikPlanTestAssert(($response['statusCode'] ?? null) === $status, $message . ': unexpected HTTP status');
    $payload = $response['payload'] ?? [];
    awikPlanTestAssert(($payload['success'] ?? true) === false, $message . ': expected failure envelope');
    awikPlanTestAssert(($payload['statusCode'] ?? null) === $status, $message . ': statusCode mismatch');
    awikPlanTestAssert(($payload['path'] ?? null) === $path, $message . ': path mismatch');
}

$db = awikDatabase();
$db->exec('CREATE TABLE awik_users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    phone TEXT NOT NULL UNIQUE,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    lastLoginAt TEXT NULL,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deletedAt TEXT NULL
)');
$db->exec('CREATE TABLE awik_user_tokens (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    tokenHash TEXT NOT NULL,
    tokenType TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    revokedAt TEXT NULL,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lastUsedAt TEXT NULL
)');
$db->exec('CREATE TABLE awik_login_attempts (
    scopeType TEXT NOT NULL,
    scopeKey TEXT NOT NULL,
    failedCount INTEGER NOT NULL DEFAULT 0,
    windowStartedAt TEXT NOT NULL,
    lastFailedAt TEXT NULL,
    lockedUntil TEXT NULL,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (scopeType, scopeKey)
)');
$db->exec('CREATE INDEX idx_awik_login_attempts_locked_until ON awik_login_attempts(lockedUntil)');
$db->exec('CREATE INDEX idx_awik_login_attempts_last_failed_at ON awik_login_attempts(scopeType, lastFailedAt)');
$db->exec('CREATE TABLE awik_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE BINARY,
    description TEXT NULL,
    speed TEXT NOT NULL,
    durationDays INTEGER NOT NULL,
    price TEXT NOT NULL,
    currency TEXT NOT NULL,
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deletedAt TEXT NULL
)');
$db->exec('CREATE TABLE awik_audit_logs (
    id TEXT PRIMARY KEY,
    userId TEXT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entityId TEXT NULL,
    oldValues TEXT NULL,
    newValues TEXT NULL,
    ipAddress TEXT NULL,
    userAgent TEXT NULL,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)');

$staffPassword = bin2hex(random_bytes(12));
$adminPassword = bin2hex(random_bytes(12));
$staffId = '00000000-0000-4000-8000-000000000411';
$adminId = '00000000-0000-4000-8000-000000000412';
$insertUser = $db->prepare('INSERT INTO awik_users (id, email, phone, firstName, lastName, passwordHash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
$insertUser->execute([$staffId, 'plans-staff@example.invalid', '+15550000411', 'Plan', 'Staff', password_hash($staffPassword, PASSWORD_BCRYPT), 'STAFF', 'ACTIVE']);
$insertUser->execute([$adminId, 'plans-admin@example.invalid', '+15550000412', 'Plan', 'Admin', password_hash($adminPassword, PASSWORD_BCRYPT), 'ADMIN', 'ACTIVE']);
$db->prepare('INSERT INTO awik_plans (id, name, description, speed, durationDays, price, currency, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    ->execute(['00000000-0000-4000-8000-000000000421', 'Base Fiber', 'Initial fixture', '25 Mbps', 30, '9.50', 'USD', 1]);
$db->prepare('INSERT INTO awik_plans (id, name, description, speed, durationDays, price, currency, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    ->execute(['00000000-0000-4000-8000-000000000422', 'Archive Plan', null, '5 Mbps', 14, '4.00', 'USD', 0]);

$staffLogin = awikPlanTestRequest('POST', '/api/v1/auth/login', ['identifier' => 'plans-staff@example.invalid', 'password' => $staffPassword]);
$adminLogin = awikPlanTestRequest('POST', '/api/v1/auth/login', ['identifier' => 'plans-admin@example.invalid', 'password' => $adminPassword]);
awikPlanTestAssert($staffLogin['statusCode'] === 200 && $adminLogin['statusCode'] === 200, 'Synthetic roles could not authenticate');
$staffHeaders = ['Authorization' => 'Bearer ' . $staffLogin['payload']['data']['accessToken']];
$adminHeaders = ['Authorization' => 'Bearer ' . $adminLogin['payload']['data']['accessToken']];

awikPlanTestFailure(awikPlanTestRequest('GET', '/api/v1/plans'), 401, '/api/v1/plans', 'unauthorized list');
$staffList = awikPlanTestSuccess(awikPlanTestRequest('GET', '/api/v1/plans', [], $staffHeaders), 200, 'staff list');
awikPlanTestAssert($staffList['total'] === 2 && $staffList['page'] === 1 && $staffList['limit'] === 20, 'default pagination mismatch');
$staffActive = awikPlanTestSuccess(awikPlanTestRequest('GET', '/api/v1/plans/active', [], $staffHeaders), 200, 'staff active plans');
awikPlanTestAssert(count($staffActive) === 1 && $staffActive[0]['isActive'] === true, 'active plan filtering mismatch');
$staffPlan = awikPlanTestSuccess(awikPlanTestRequest('GET', '/api/v1/plans/00000000-0000-4000-8000-000000000421', [], $staffHeaders), 200, 'staff plan detail');
awikPlanTestAssert($staffPlan['name'] === 'Base Fiber' && $staffPlan['price'] === '9.5', 'plan detail projection mismatch');

$validCreate = [
    'name' => 'Premium Fiber',
    'description' => '<script>alert("bad")</script>Fiber plan',
    'speed' => '100 Mbps',
    'durationDays' => 60,
    'price' => 12.75,
];
awikPlanTestFailure(awikPlanTestRequest('POST', '/api/v1/plans', $validCreate), 401, '/api/v1/plans', 'unauthorized create');
awikPlanTestFailure(awikPlanTestRequest('POST', '/api/v1/plans', $validCreate, $staffHeaders), 403, '/api/v1/plans', 'staff create');
awikPlanTestFailure(awikPlanTestRequest('PATCH', '/api/v1/plans/00000000-0000-4000-8000-000000000421', ['name' => 'Changed'], $staffHeaders), 403, '/api/v1/plans/00000000-0000-4000-8000-000000000421', 'staff update');
awikPlanTestFailure(awikPlanTestRequest('DELETE', '/api/v1/plans/00000000-0000-4000-8000-000000000421', [], $staffHeaders), 403, '/api/v1/plans/00000000-0000-4000-8000-000000000421', 'staff delete');

$invalidCreate = awikPlanTestRequest('POST', '/api/v1/plans', [
    'name' => '',
    'speed' => '10 Mbps',
    'durationDays' => 0,
    'price' => -1,
], $adminHeaders);
awikPlanTestFailure($invalidCreate, 400, '/api/v1/plans', 'invalid create');
awikPlanTestAssert(($invalidCreate['payload']['message'] ?? null) === 'Validation failed', 'validation message mismatch');
$unknownProperty = awikPlanTestRequest('POST', '/api/v1/plans', $validCreate + ['unexpected' => true], $adminHeaders);
awikPlanTestFailure($unknownProperty, 400, '/api/v1/plans', 'unknown create property');
$invalidQuery = awikPlanTestRequest('GET', '/api/v1/plans?limit=101', [], $adminHeaders);
awikPlanTestFailure($invalidQuery, 400, '/api/v1/plans?limit=101', 'invalid pagination');
$fractionalDuration = awikPlanTestRequest('POST', '/api/v1/plans', [
    'name' => 'Fractional Duration',
    'speed' => '10 Mbps',
    'durationDays' => 1.5,
    'price' => 1,
], $adminHeaders);
awikPlanTestFailure($fractionalDuration, 500, '/api/v1/plans', 'fractional duration storage failure');

$created = awikPlanTestSuccess(awikPlanTestRequest('POST', '/api/v1/plans', $validCreate, $adminHeaders + ['User-Agent' => 'plan-contract-test']), 201, 'admin create');
awikPlanTestAssert($created['currency'] === 'USD' && $created['isActive'] === true, 'create defaults mismatch');
awikPlanTestAssert($created['description'] === 'Fiber plan', 'plan text was not sanitized');
awikPlanTestAssert($created['price'] === '12.75' && $created['durationDays'] === 60, 'created plan values mismatch');
$planId = $created['id'];

$duplicateCreate = awikPlanTestRequest('POST', '/api/v1/plans', $validCreate, $adminHeaders);
awikPlanTestFailure($duplicateCreate, 409, '/api/v1/plans', 'duplicate name');
awikPlanTestAssert(($duplicateCreate['payload']['message'] ?? null) === 'A plan with this name already exists', 'duplicate name message mismatch');
$filtered = awikPlanTestSuccess(awikPlanTestRequest(
    'GET',
    '/api/v1/plans?search=base&isActive=true&page=1&limit=1&sortBy=price&sortOrder=asc',
    [],
    $staffHeaders
), 200, 'filtered list');
awikPlanTestAssert($filtered['total'] === 1 && count($filtered['data']) === 1 && $filtered['limit'] === 1, 'search/filter/pagination mismatch');

$detail = awikPlanTestSuccess(awikPlanTestRequest('GET', '/api/v1/plans/' . $planId, [], $staffHeaders), 200, 'created plan detail');
awikPlanTestAssert($detail['name'] === 'Premium Fiber', 'created plan not found');
$missingId = '00000000-0000-4000-8000-000000000499';
awikPlanTestFailure(awikPlanTestRequest('GET', '/api/v1/plans/' . $missingId, [], $staffHeaders), 404, '/api/v1/plans/' . $missingId, 'missing plan detail');

$duplicateUpdate = awikPlanTestRequest('PATCH', '/api/v1/plans/' . $planId, ['name' => 'Base Fiber'], $adminHeaders);
awikPlanTestFailure($duplicateUpdate, 409, '/api/v1/plans/' . $planId, 'duplicate update name');
$invalidPatch = awikPlanTestRequest('PATCH', '/api/v1/plans/' . $planId, ['price' => -0.01], $adminHeaders);
awikPlanTestFailure($invalidPatch, 400, '/api/v1/plans/' . $planId, 'invalid plan update');
$updated = awikPlanTestSuccess(awikPlanTestRequest('PATCH', '/api/v1/plans/' . $planId, [
    'name' => 'Premium Fiber Plus',
    'price' => 15.25,
    'description' => 'Updated feature fixture',
    'isActive' => false,
], $adminHeaders), 200, 'admin update');
awikPlanTestAssert($updated['name'] === 'Premium Fiber Plus' && $updated['price'] === '15.25' && $updated['isActive'] === false, 'updated plan values mismatch');
awikPlanTestFailure(awikPlanTestRequest('PATCH', '/api/v1/plans/' . $missingId, ['name' => 'Missing'], $adminHeaders), 404, '/api/v1/plans/' . $missingId, 'missing plan update');
$inactivePlans = awikPlanTestSuccess(awikPlanTestRequest('GET', '/api/v1/plans?isActive=false', [], $staffHeaders), 200, 'inactive filter');
awikPlanTestAssert($inactivePlans['total'] === 2, 'inactive plans filter mismatch');

$deleted = awikPlanTestSuccess(awikPlanTestRequest('DELETE', '/api/v1/plans/' . $planId, [], $adminHeaders), 200, 'admin delete');
awikPlanTestAssert(($deleted['message'] ?? null) === 'Plan deleted successfully', 'delete response mismatch');
awikPlanTestFailure(awikPlanTestRequest('GET', '/api/v1/plans/' . $planId, [], $staffHeaders), 404, '/api/v1/plans/' . $planId, 'deleted plan hidden');
awikPlanTestFailure(awikPlanTestRequest('DELETE', '/api/v1/plans/' . $missingId, [], $adminHeaders), 404, '/api/v1/plans/' . $missingId, 'missing plan delete');
$auditCount = (int) $db->query("SELECT COUNT(*) FROM awik_audit_logs WHERE entity = 'Plan'")->fetchColumn();
awikPlanTestAssert($auditCount === 3, 'expected create/update/delete audit entries');
$requestAudit = $db->query("SELECT * FROM awik_audit_logs WHERE entity = 'Plans' AND action = 'CREATE' LIMIT 1")->fetch();
awikPlanTestAssert(($requestAudit['ipAddress'] ?? null) === '127.0.0.1' && ($requestAudit['userAgent'] ?? null) === 'plan-contract-test', 'global plan audit request metadata missing');
$db->exec('DROP TABLE awik_audit_logs');
$bestEffortUpdate = awikPlanTestRequest('PATCH', '/api/v1/plans/00000000-0000-4000-8000-000000000421', ['description' => 'Audit unavailable'], $adminHeaders);
awikPlanTestSuccess($bestEffortUpdate, 200, 'audit failure is best effort');

$missingDirectory = sys_get_temp_dir() . '/awik_plan_missing_' . bin2hex(random_bytes(8));
awikPlanTestAssert(!file_exists($missingDirectory), 'Generated failure path already exists');
$originalDsn = 'sqlite:' . $databasePath;
putenv('AWIK_MIGRATION_DSN=sqlite:' . $missingDirectory . '/unavailable.sqlite');
try {
    awikPlanTestFailure(awikPlanTestRequest('GET', '/api/v1/plans', [], $adminHeaders), 500, '/api/v1/plans', 'plans database connection failure');
} finally {
    putenv('AWIK_MIGRATION_DSN=' . $originalDsn);
}

unset($insertUser, $db);
gc_collect_cycles();
if (is_file($databasePath)) {
    unlink($databasePath);
}

echo "AWIK PHP plan API contract tests passed\n";
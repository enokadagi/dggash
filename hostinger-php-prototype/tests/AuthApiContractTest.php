<?php

declare(strict_types=1);

$databasePath = sys_get_temp_dir() . '/awik_php_auth_' . bin2hex(random_bytes(12)) . '.sqlite';
putenv('AWIK_MIGRATION_DSN=sqlite:' . $databasePath);
putenv('AWIK_MIGRATION_DB_USER=');
putenv('AWIK_MIGRATION_DB_PASSWORD=');
putenv('AWIK_MIGRATION_JWT_SECRET=local-auth-access-secret-for-tests-only-32');
putenv('AWIK_MIGRATION_JWT_REFRESH_SECRET=local-auth-refresh-secret-for-tests-only-32');

register_shutdown_function(static function () use ($databasePath): void {
    if (is_file($databasePath)) {
        unlink($databasePath);
    }
});

require_once __DIR__ . '/../private/bootstrap.php';

function awikTestCreateSchema(PDO $db): void
{
    $db->exec("DROP TABLE IF EXISTS awik_user_tokens");
    $db->exec("DROP TABLE IF EXISTS awik_plans");
    $db->exec("DROP TABLE IF EXISTS awik_users");

    $db->exec(
        "CREATE TABLE awik_users (
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
        )"
    );

    $db->exec(
        "CREATE TABLE awik_user_tokens (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            tokenHash TEXT NOT NULL,
            tokenType TEXT NOT NULL,
            expiresAt TEXT NOT NULL,
            revokedAt TEXT NULL,
            createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            lastUsedAt TEXT NULL
        )"
    );

    $db->exec(
        "CREATE TABLE awik_login_attempts (
            scopeType TEXT NOT NULL,
            scopeKey TEXT NOT NULL,
            failedCount INTEGER NOT NULL DEFAULT 0,
            windowStartedAt TEXT NOT NULL,
            lastFailedAt TEXT NULL,
            lockedUntil TEXT NULL,
            createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (scopeType, scopeKey)
        )"
    );

    $db->exec(
        "CREATE TABLE awik_plans (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NULL,
            speed TEXT NOT NULL,
            durationDays INTEGER NOT NULL,
            price TEXT NOT NULL,
            currency TEXT NOT NULL DEFAULT 'USD',
            isActive INTEGER NOT NULL DEFAULT 1,
            createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deletedAt TEXT NULL
        )"
    );

    $db->exec("CREATE INDEX idx_awik_users_role_status ON awik_users(role, status)");
    $db->exec("CREATE INDEX idx_awik_user_tokens_user_type ON awik_user_tokens(userId, tokenType)");
    $db->exec("CREATE INDEX idx_awik_user_tokens_hash ON awik_user_tokens(tokenHash)");
    $db->exec("CREATE INDEX idx_awik_login_attempts_locked_until ON awik_login_attempts(lockedUntil)");
    $db->exec("CREATE INDEX idx_awik_login_attempts_last_failed_at ON awik_login_attempts(scopeType, lastFailedAt)");
    $db->exec("CREATE INDEX idx_awik_plans_active_price ON awik_plans(isActive, price)");
}

function awikSeedTestData(PDO $db, string $testPassword): void
{
    $passwordHash = password_hash($testPassword, PASSWORD_BCRYPT);
    $userId = '00000000-0000-4000-8000-000000000101';

    $db->prepare(
        "INSERT INTO awik_users (id, email, phone, firstName, lastName, passwordHash, role, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    )->execute([
        $userId,
        'auth-test@example.invalid',
        '+15550000001',
        'Test',
        'User',
        $passwordHash,
        'STAFF',
        'ACTIVE',
    ]);

    $db->prepare(
        "INSERT INTO awik_plans (id, name, description, speed, durationDays, price, currency, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    )->execute([
        '00000000-0000-4000-8000-000000000001',
        'Test plan 10 Mbps',
        'Synthetic migration fixture',
        '10 Mbps',
        30,
        '12.50',
        'USD',
        1,
    ]);
}

function awikTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }
}

function awikTestRequest(string $method, string $uri, array $body = [], array $headers = []): array
{
    return awikHandleRequest([
        'method' => $method,
        'uri' => $uri,
        'headers' => $headers,
        'body' => $body,
    ]);
}

function awikTestSuccess(array $response, string $message): array
{
    awikTestAssert(($response['statusCode'] ?? null) === 200, $message . ': expected HTTP 200');
    $payload = $response['payload'] ?? [];
    awikTestAssert(($payload['success'] ?? false) === true, $message . ': missing success envelope');
    awikTestAssert(array_key_exists('data', $payload), $message . ': missing data envelope');
    awikTestAssert(array_keys($payload) === ['success', 'data'], $message . ': response envelope differs from NestJS');

    return $payload['data'];
}

function awikTestFailure(array $response, int $statusCode, string $path, string $message): void
{
    awikTestAssert(($response['statusCode'] ?? null) === $statusCode, $message . ': wrong HTTP status');
    $payload = $response['payload'] ?? [];
    awikTestAssert(($payload['success'] ?? true) === false, $message . ': expected failure envelope');
    awikTestAssert(($payload['statusCode'] ?? null) === $statusCode, $message . ': missing statusCode');
    awikTestAssert(($payload['path'] ?? null) === $path, $message . ': wrong error path');
    awikTestAssert(isset($payload['timestamp']) && strtotime((string) $payload['timestamp']) !== false, $message . ': missing timestamp');
}

function awikTestRequestWithIp(string $method, string $uri, array $body = [], array $headers = [], ?string $ipAddress = null): array
{
    $request = [
        'method' => $method,
        'uri' => $uri,
        'headers' => $headers,
        'body' => $body,
    ];
    if ($ipAddress !== null) {
        $request['ipAddress'] = $ipAddress;
    }

    return awikHandleRequest($request);
}

$db = awikDatabase();
awikTestCreateSchema($db);
$userId = '00000000-0000-4000-8000-000000000101';
$testPassword = bin2hex(random_bytes(12));
awikSeedTestData($db, $testPassword);

$login = awikTestSuccess(awikTestRequest('POST', '/api/v1/auth/login', [
    'identifier' => 'AUTH-TEST@example.invalid',
    'password' => $testPassword,
]), 'email login');
awikTestAssert(($login['user']['id'] ?? null) === $userId, 'login user mismatch');
awikTestAssert(($login['user']['role'] ?? null) === 'STAFF', 'login role mismatch');
awikTestAssert(($login['user']['lastLoginAt'] ?? null) !== null, 'lastLoginAt should be updated on login');
awikTestAssert(str_ends_with((string) $login['user']['createdAt'], 'Z'), 'createdAt should be ISO UTC');
awikTestAssert(array_keys($login) === ['user', 'accessToken', 'refreshToken'], 'login data differs from NestJS');
awikTestAssert(awikVerifyJwt($login['accessToken'], 'local-auth-access-secret-for-tests-only-32', 'access')['sub'] === $userId, 'access token secret/claims mismatch');
awikTestAssert(awikVerifyJwt($login['refreshToken'], 'local-auth-refresh-secret-for-tests-only-32', 'refresh')['sub'] === $userId, 'refresh token secret/claims mismatch');

$badPassword = awikTestRequest('POST', '/api/v1/auth/login', ['identifier' => 'auth-test@example.invalid', 'password' => 'incorrect-password']);
awikTestFailure($badPassword, 401, '/api/v1/auth/login', 'bad password');
awikTestAssert(($badPassword['payload']['message'] ?? null) === 'Invalid credentials', 'bad password message mismatch');
$injectionLogin = awikTestRequest('POST', '/api/v1/auth/login', ['identifier' => "' OR 1=1 --", 'password' => $testPassword]);
awikTestFailure($injectionLogin, 401, '/api/v1/auth/login', 'SQL-like identifier');

$unauthorized = awikTestRequest('GET', '/api/v1/auth/profile');
awikTestFailure($unauthorized, 401, '/api/v1/auth/profile', 'unauthorized profile');
$profile = awikTestSuccess(awikTestRequest('GET', '/api/v1/auth/profile', [], [
    'Authorization' => 'Bearer ' . $login['accessToken'],
]), 'profile access');
awikTestAssert(($profile['email'] ?? null) === 'auth-test@example.invalid', 'profile email mismatch');
awikTestAssert(isset($profile['lastLoginAt'], $profile['createdAt']), 'profile timestamps are missing');

$updatedProfile = awikTestSuccess(awikTestRequest('PATCH', '/api/v1/auth/profile', [
    'firstName' => 'Updated',
    'lastName' => 'Account',
    'email' => 'AUTH-TEST@example.invalid',
], ['Authorization' => 'Bearer ' . $login['accessToken']]), 'profile update');
awikTestAssert($updatedProfile === [
    'id' => $userId,
    'firstName' => 'Updated',
    'lastName' => 'Account',
    'email' => 'auth-test@example.invalid',
], 'profile update response must match the NestJS projection');

$activePlans = awikTestSuccess(awikTestRequest('GET', '/api/v1/plans/active', [], [
    'Authorization' => 'Bearer ' . $login['accessToken'],
]), 'active plans');
awikTestAssert(count($activePlans) === 1, 'active plan query mismatch');

$accessAsRefresh = awikTestRequest('POST', '/api/v1/auth/refresh', ['refreshToken' => $login['accessToken']]);
awikTestFailure($accessAsRefresh, 401, '/api/v1/auth/refresh', 'access token presented as refresh token');
$refreshed = awikTestSuccess(awikTestRequest('POST', '/api/v1/auth/refresh', [
    'refreshToken' => $login['refreshToken'],
]), 'token refresh');
awikTestAssert(array_keys($refreshed) === ['user', 'accessToken', 'refreshToken'], 'refreshed data differs from NestJS');
awikTestAssert(awikVerifyJwt($refreshed['refreshToken'], 'local-auth-refresh-secret-for-tests-only-32', 'refresh')['sub'] === $userId, 'refreshed token secret/claims mismatch');
$replayedRefresh = awikTestRequest('POST', '/api/v1/auth/refresh', ['refreshToken' => $login['refreshToken']]);
awikTestFailure($replayedRefresh, 401, '/api/v1/auth/refresh', 'replayed refresh token');

$badCurrentPassword = awikTestRequest('POST', '/api/v1/auth/change-password', [
    'currentPassword' => 'wrong-current-password',
    'newPassword' => 'new-password-test-123',
    'confirmPassword' => 'different-password-test-456',
], ['Authorization' => 'Bearer ' . $refreshed['accessToken']]);
awikTestFailure($badCurrentPassword, 400, '/api/v1/auth/change-password', 'wrong current password');

$newPassword = bin2hex(random_bytes(12));
$changedPassword = awikTestSuccess(awikTestRequest('POST', '/api/v1/auth/change-password', [
    'currentPassword' => $testPassword,
    'newPassword' => $newPassword,
    'confirmPassword' => $newPassword,
], ['Authorization' => 'Bearer ' . $refreshed['accessToken']]), 'password change');
awikTestAssert(($changedPassword['message'] ?? null) === 'Password changed successfully', 'password change result mismatch');
$revokedAfterPasswordChange = awikTestRequest('GET', '/api/v1/auth/profile', [], [
    'Authorization' => 'Bearer ' . $refreshed['accessToken'],
]);
awikTestFailure($revokedAfterPasswordChange, 401, '/api/v1/auth/profile', 'access after password change');
$oldPasswordLogin = awikTestRequest('POST', '/api/v1/auth/login', ['identifier' => '+15550000001', 'password' => $testPassword]);
awikTestFailure($oldPasswordLogin, 401, '/api/v1/auth/login', 'old password after change');

$newLogin = awikTestSuccess(awikTestRequest('POST', '/api/v1/auth/login', [
    'identifier' => '+15550000001',
    'password' => $newPassword,
]), 'phone login after password change');
$logout = awikTestSuccess(awikTestRequest('POST', '/api/v1/auth/logout', [], [
    'Authorization' => 'Bearer ' . $newLogin['accessToken'],
]), 'logout');
awikTestAssert(($logout['message'] ?? null) === 'Logged out successfully', 'logout result mismatch');
$revokedAfterLogout = awikTestRequest('GET', '/api/v1/auth/profile', [], [
    'Authorization' => 'Bearer ' . $newLogin['accessToken'],
]);
awikTestFailure($revokedAfterLogout, 401, '/api/v1/auth/profile', 'access after logout');

$notFound = awikTestRequest('GET', '/api/v1/auth/unknown');
awikTestFailure($notFound, 404, '/api/v1/auth/unknown', 'not found response');
awikTestAssert(($notFound['payload']['message'] ?? null) === 'Not Found', 'not found message mismatch');

$lockoutUserId = '00000000-0000-4000-8000-000000000102';
$lockoutUserPassword = bin2hex(random_bytes(10));
$db->prepare(
    "INSERT INTO awik_users (id, email, phone, firstName, lastName, passwordHash, role, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
)->execute([
    $lockoutUserId,
    'lockout-user@example.invalid',
    '+15550000002',
    'Lockout',
    'User',
    password_hash($lockoutUserPassword, PASSWORD_BCRYPT),
    'STAFF',
    'ACTIVE',
]);

for ($attempt = 0; $attempt < 5; $attempt++) {
    $lockedAttempt = awikTestRequestWithIp('POST', '/api/v1/auth/login', [
        'identifier' => 'lockout-user@example.invalid',
        'password' => 'wrong-password',
    ], [], '203.0.113.11');
    awikTestFailure($lockedAttempt, 401, '/api/v1/auth/login', 'lockout threshold should start with 401s before block');
}

$lockoutResponse = awikTestRequestWithIp('POST', '/api/v1/auth/login', [
    'identifier' => 'lockout-user@example.invalid',
    'password' => 'wrong-password',
], [], '203.0.113.11');
awikTestAssert(($lockoutResponse['statusCode'] ?? null) === 429, 'lockout should block after threshold with 429');
awikTestAssert(($lockoutResponse['payload']['message'] ?? null) === 'Too many login attempts. Please try again later.', 'lockout message mismatch');
awikTestAssert((int) ($lockoutResponse['headers']['Retry-After'] ?? 0) > 0, 'lockout Retry-After header missing');

$stillLockedAfterRestart = awikTestRequestWithIp('POST', '/api/v1/auth/login', [
    'identifier' => 'lockout-user@example.invalid',
    'password' => $lockoutUserPassword,
], [], '203.0.113.11');
awikTestAssert(($stillLockedAfterRestart['statusCode'] ?? null) === 429, 'lockout must survive across requests');

$ipThrottleIdentifiers = [];
$insertIpThrottleUser = $db->prepare(
    "INSERT INTO awik_users (id, email, phone, firstName, lastName, passwordHash, role, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
);
for ($attempt = 0; $attempt < 10; $attempt++) {
    $identifier = 'ip-throttle-' . $attempt . '@example.invalid';
    $ipThrottleIdentifiers[] = $identifier;
    $insertIpThrottleUser->execute([
        sprintf('00000000-0000-4000-8000-%012d', 104 + $attempt),
        $identifier,
        sprintf('+15550001%04d', $attempt),
        'IP',
        'Throttle ' . $attempt,
        password_hash($lockoutUserPassword, PASSWORD_BCRYPT),
        'STAFF',
        'ACTIVE',
    ]);
}

for ($attempt = 0; $attempt < 10; $attempt++) {
    $ipBlockedAttempt = awikTestRequestWithIp('POST', '/api/v1/auth/login', [
        'identifier' => $ipThrottleIdentifiers[$attempt],
        'password' => 'wrong-password',
    ], [], '203.0.113.12');
    awikTestFailure($ipBlockedAttempt, 401, '/api/v1/auth/login', 'IP throttling should only reject after the threshold');
}

$ipRateLimited = awikTestRequestWithIp('POST', '/api/v1/auth/login', [
    'identifier' => $ipThrottleIdentifiers[0],
    'password' => 'wrong-password',
], [], '203.0.113.12');
awikTestAssert(($ipRateLimited['statusCode'] ?? null) === 429, 'IP throttle should reject with 429');
awikTestAssert(($ipRateLimited['payload']['message'] ?? null) === 'Too many login attempts. Please try again later.', 'IP throttle message mismatch');

$db->prepare('UPDATE awik_login_attempts SET lockedUntil = datetime("now", "-1 hour"), failedCount = 0 WHERE scopeType = ? AND scopeKey = ?')
    ->execute(['identifier', 'account:' . hash('sha256', 'email:lockout-user@example.invalid')]);
$recoveredLogin = awikTestRequestWithIp('POST', '/api/v1/auth/login', [
    'identifier' => 'lockout-user@example.invalid',
    'password' => $lockoutUserPassword,
], [], '203.0.113.11');
awikTestAssert(($recoveredLogin['statusCode'] ?? null) === 200, 'lockout recovery should allow a successful login after expiry');

$successReset = awikTestRequestWithIp('POST', '/api/v1/auth/login', [
    'identifier' => '+15550000001',
    'password' => $newPassword,
], [], '203.0.113.13');
awikTestAssert(($successReset['statusCode'] ?? null) === 200, 'login recovery should remain valid after reset');

unset($insertIpThrottleUser);
unset($db);
if (is_file($databasePath)) {
    unlink($databasePath);
}

echo "AWIK PHP auth contract tests passed\n";

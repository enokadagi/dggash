<?php

declare(strict_types=1);

$databasePath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'awik_recovery_' . bin2hex(random_bytes(12)) . '.sqlite';
putenv('AWIK_MIGRATION_DSN=sqlite:' . $databasePath);
putenv('AWIK_MIGRATION_DB_USER=');
putenv('AWIK_MIGRATION_DB_PASSWORD=');
putenv('AWIK_MIGRATION_JWT_SECRET=local-recovery-access-secret-for-tests-only-32');
putenv('AWIK_MIGRATION_JWT_REFRESH_SECRET=local-recovery-refresh-secret-for-tests-only-32');
putenv('AWIK_PUBLIC_APP_URL=https://recovery.example.invalid');

register_shutdown_function(static function () use ($databasePath): void {
    if (is_file($databasePath)) {
        unlink($databasePath);
    }
});

require_once __DIR__ . '/../private/bootstrap.php';

function awikRecoveryTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$db = awikDatabase();
$db->exec('CREATE TABLE awik_users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE, phone TEXT NOT NULL UNIQUE, firstName TEXT NOT NULL, lastName TEXT NOT NULL,
    passwordHash TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, lastLoginAt TEXT NULL,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deletedAt TEXT NULL
)');
$db->exec('CREATE TABLE awik_user_tokens (
    id TEXT PRIMARY KEY, userId TEXT NOT NULL, tokenHash TEXT NOT NULL, tokenType TEXT NOT NULL,
    expiresAt TEXT NOT NULL, revokedAt TEXT NULL, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, lastUsedAt TEXT NULL
)');
$db->exec('CREATE TABLE awik_password_recovery_tokens (
    tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL, expiresAt TEXT NOT NULL, consumedAt TEXT NULL,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)');
$db->exec('CREATE TABLE awik_password_recovery_limits (
    scopeType TEXT NOT NULL, scopeHash TEXT NOT NULL, requestCount INTEGER NOT NULL DEFAULT 0,
    windowStartedAt TEXT NOT NULL, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (scopeType, scopeHash)
)');

$userId = awikUuidV4();
$oldPassword = 'old-recovery-password';
$db->prepare(
    'INSERT INTO awik_users (id, email, phone, firstName, lastName, passwordHash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
)->execute([$userId, 'recover@example.invalid', '+15551234567', 'Recovery', 'Test', password_hash($oldPassword, PASSWORD_DEFAULT), 'STAFF', 'ACTIVE']);
$db->prepare(
    'INSERT INTO awik_user_tokens (id, userId, tokenHash, tokenType, expiresAt) VALUES (?, ?, ?, ?, ?)'
)->execute([awikUuidV4(), $userId, hash('sha256', 'active-access-token'), 'access', gmdate('Y-m-d H:i:s', time() + 3600)]);

$capturedLink = '';
$request = awikRequestPasswordRecovery($db, 'RECOVER@example.invalid', '203.0.113.10', static function (string $email, string $link) use (&$capturedLink): bool {
    awikRecoveryTestAssert($email === 'recover@example.invalid', 'Recovery email was not normalized');
    $capturedLink = $link;
    return true;
});
awikRecoveryTestAssert($request['statusCode'] === 200, 'Existing account recovery request failed');
awikRecoveryTestAssert(
    $request['payload']['data']['message'] === 'If the account is eligible, recovery instructions will be sent.',
    'Recovery response leaks account existence'
);
parse_str(ltrim((string) parse_url($capturedLink, PHP_URL_FRAGMENT), '#'), $linkQuery);
$token = (string) ($linkQuery['token'] ?? '');
awikRecoveryTestAssert(strlen($token) === 43, 'Recovery token must contain 256 bits of URL-safe entropy');
awikRecoveryTestAssert(str_starts_with($capturedLink, 'https://recovery.example.invalid/reset-password/#token='), 'Recovery link origin/path mismatch');
$recoveryRow = $db->query('SELECT tokenHash, expiresAt FROM awik_password_recovery_tokens')->fetch(PDO::FETCH_ASSOC);
awikRecoveryTestAssert(is_array($recoveryRow), 'Recovery token hash was not persisted');
awikRecoveryTestAssert($recoveryRow['tokenHash'] === hash('sha256', $token), 'Raw token was not reduced to its SHA-256 hash in storage');
awikRecoveryTestAssert(!hash_equals($recoveryRow['tokenHash'], $token), 'Raw token was stored');
awikRecoveryTestAssert(strtotime($recoveryRow['expiresAt'] . ' UTC') > time() + 1700, 'Recovery token expiry is not approximately 30 minutes');

$unknownResponse = awikRequestPasswordRecovery($db, 'unknown@example.invalid', '203.0.113.11', static fn (): bool => true);
awikRecoveryTestAssert($unknownResponse['statusCode'] === $request['statusCode'], 'Unknown-account request status differs');
awikRecoveryTestAssert($unknownResponse['payload'] === $request['payload'], 'Unknown-account response differs from existing-account response');

$newPassword = 'new-recovery-password';
$reset = awikRedeemPasswordRecovery($db, $token, $newPassword, $newPassword);
awikRecoveryTestAssert($reset['message'] === 'Password reset successfully. Sign in with your new password.', 'Password reset success response mismatch');
$freshUser = $db->prepare('SELECT passwordHash FROM awik_users WHERE id = ?');
$freshUser->execute([$userId]);
awikRecoveryTestAssert(password_verify($newPassword, (string) $freshUser->fetchColumn()), 'Password reset did not persist a valid password hash');
$revoked = $db->query('SELECT revokedAt FROM awik_user_tokens')->fetchColumn();
awikRecoveryTestAssert($revoked !== false && $revoked !== null, 'Password reset did not revoke existing sessions');

$reuseRejected = false;
try {
    awikRedeemPasswordRecovery($db, $token, 'another-recovery-password', 'another-recovery-password');
} catch (AwikApiException $exception) {
    $reuseRejected = $exception->statusCode === 400;
}
awikRecoveryTestAssert($reuseRejected, 'Consumed recovery token was reusable');

$expiredToken = awikBase64UrlEncode(random_bytes(32));
$db->prepare(
    'INSERT INTO awik_password_recovery_tokens (tokenHash, userId, expiresAt, consumedAt) VALUES (?, ?, ?, NULL)'
)->execute([hash('sha256', $expiredToken), $userId, gmdate('Y-m-d H:i:s', time() - 60)]);
$expiredRejected = false;
try {
    awikRedeemPasswordRecovery($db, $expiredToken, 'expired-recovery-password', 'expired-recovery-password');
} catch (AwikApiException $exception) {
    $expiredRejected = $exception->statusCode === 400;
}
awikRecoveryTestAssert($expiredRejected, 'Expired recovery token was accepted');

$invalidRejected = false;
try {
    awikRedeemPasswordRecovery($db, 'not-a-token', 'invalid-recovery-password', 'invalid-recovery-password');
} catch (AwikApiException $exception) {
    $invalidRejected = $exception->statusCode === 400;
}
awikRecoveryTestAssert($invalidRejected, 'Malformed recovery token was accepted');

$mismatchRejected = false;
try {
    awikRedeemPasswordRecovery($db, awikBase64UrlEncode(random_bytes(32)), 'password-one', 'password-two');
} catch (AwikApiException $exception) {
    $mismatchRejected = $exception->statusCode === 400;
}
awikRecoveryTestAssert($mismatchRejected, 'Mismatched password confirmation was accepted');

$failedDelivery = awikRequestPasswordRecovery($db, 'recover@example.invalid', '203.0.113.12', static fn (): bool => false);
awikRecoveryTestAssert($failedDelivery['payload'] === $request['payload'], 'Mail-provider failure changed the enumeration-safe response');
$activeTokens = $db->prepare('SELECT COUNT(*) FROM awik_password_recovery_tokens WHERE userId = ? AND consumedAt IS NULL AND expiresAt > CURRENT_TIMESTAMP');
$activeTokens->execute([$userId]);
awikRecoveryTestAssert((int) $activeTokens->fetchColumn() === 0, 'Failed email delivery left an active recovery token');
awikRecoveryTestAssert(!awikDeliverPasswordRecoveryEmail('recover@example.invalid', $capturedLink, 'Recovery Test'), 'Email delivery succeeded without explicit provider/from/HTTPS configuration');

$throttleEmail = 'throttle@example.invalid';
for ($attempt = 0; $attempt < 3; $attempt++) {
    awikRequestPasswordRecovery($db, $throttleEmail, '203.0.113.' . (20 + $attempt), static fn (): bool => true);
}
$throttleRejected = false;
try {
    awikRequestPasswordRecovery($db, $throttleEmail, '203.0.113.23', static fn (): bool => true);
} catch (AwikApiException $exception) {
    $throttleRejected = $exception->statusCode === 429
        && ($exception->headers['Retry-After'] ?? null) === '3600';
}
awikRecoveryTestAssert($throttleRejected, 'Per-email recovery request limit was not enforced');

$ipThrottleRejected = false;
for ($attempt = 0; $attempt < 11; $attempt++) {
    try {
        awikRequestPasswordRecovery(
            $db,
            'ip-throttle-' . $attempt . '@example.invalid',
            '203.0.113.99',
            static fn (): bool => true
        );
    } catch (AwikApiException $exception) {
        $ipThrottleRejected = $attempt === 10
            && $exception->statusCode === 429
            && ($exception->headers['Retry-After'] ?? null) === '3600';
    }
}
awikRecoveryTestAssert($ipThrottleRejected, 'Per-IP recovery request limit was not enforced');

$rateCounts = $db->query('SELECT scopeType, COUNT(*) AS scopes FROM awik_password_recovery_limits GROUP BY scopeType')->fetchAll(PDO::FETCH_KEY_PAIR);
awikRecoveryTestAssert(isset($rateCounts['email'], $rateCounts['ip']), 'Recovery rate limits did not persist hashed account and IP scopes');
awikRecoveryTestAssert((int) $db->query('SELECT COUNT(*) FROM awik_password_recovery_limits WHERE LENGTH(scopeHash) <> 64')->fetchColumn() === 0, 'Recovery limits stored unhashed identifiers');

$dbFailurePath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'awik_recovery_failure_' . bin2hex(random_bytes(10)) . '.sqlite';
$missingDbDirectory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'awik_missing_' . bin2hex(random_bytes(10));
putenv('AWIK_MIGRATION_DSN=sqlite:' . $dbFailurePath);
try {
    $databaseFailure = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/auth/forgot-password',
        'headers' => [],
        'body' => ['email' => 'recover@example.invalid'],
        'ipAddress' => '203.0.113.200',
    ]);
    awikRecoveryTestAssert($databaseFailure['statusCode'] === 503, 'Recovery database failure was not reported as unavailable');
    awikRecoveryTestAssert(!str_contains(json_encode($databaseFailure, JSON_THROW_ON_ERROR), 'recover@example.invalid'), 'Database error response exposed account details');

    putenv('AWIK_MIGRATION_DSN=sqlite:' . $missingDbDirectory . DIRECTORY_SEPARATOR . 'unavailable.sqlite');
    $resetDatabaseFailure = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/auth/reset-password',
        'headers' => [],
        'body' => ['token' => 'z' . str_repeat('a', 42), 'password' => 'valid-password', 'confirmPassword' => 'valid-password'],
        'ipAddress' => '203.0.113.201',
    ]);
    awikRecoveryTestAssert($resetDatabaseFailure['statusCode'] === 503, 'Reset database failure was not reported as unavailable');
    awikRecoveryTestAssert(!str_contains(json_encode($resetDatabaseFailure, JSON_THROW_ON_ERROR), 'zaaaaa'), 'Database failure response exposed recovery token data');
} finally {
    putenv('AWIK_MIGRATION_DSN=sqlite:' . $databasePath);
    if (is_file($dbFailurePath)) {
        unlink($dbFailurePath);
    }
}

unset($freshUser, $activeTokens);
$db = null;
gc_collect_cycles();
if (is_file($databasePath) && !unlink($databasePath)) {
    throw new RuntimeException('Could not remove the recovery test database');
}
echo "AWIK password recovery token, rate-limit, delivery-failure, and reset tests passed\n";

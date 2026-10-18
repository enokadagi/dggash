<?php

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/backup.php';

final class AwikApiException extends RuntimeException
{
    public int $statusCode;
    public array $errors;
    public array $headers;

    public function __construct(
        int $statusCode,
        string $message,
        array $errors = [],
        array $headers = []
    ) {
        $this->statusCode = $statusCode;
        $this->errors = $errors;
        $this->headers = $headers;
        parent::__construct($message);
    }
}

function awikResponse(int $statusCode, array $payload, array $headers = []): array
{
    return [
        'statusCode' => $statusCode,
        'payload' => $payload,
        'headers' => $headers,
    ];
}

function awikJsonError(int $statusCode, string $message, ?array $errors = null, string $path = '', array $headers = []): array
{
    return awikResponse($statusCode, [
        'success' => false,
        'statusCode' => $statusCode,
        'message' => $message,
        'errors' => $errors,
        'timestamp' => gmdate('c'),
        'path' => $path,
    ], $headers);
}

function awikUuidV4(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0F) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3F) | 0x80);

    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function awikBase64UrlEncode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function awikBase64UrlDecode(string $value): string|false
{
    $padding = strlen($value) % 4;
    if ($padding !== 0) {
        $value .= str_repeat('=', 4 - $padding);
    }

    return base64_decode(strtr($value, '-_', '+/'), true);
}

function awikSignJwt(array $payload, string $secret): string
{
    $header = awikBase64UrlEncode((string) json_encode(['alg' => 'HS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR));
    $body = awikBase64UrlEncode((string) json_encode($payload, JSON_THROW_ON_ERROR));
    $signature = hash_hmac('sha256', $header . '.' . $body, $secret, true);

    return $header . '.' . $body . '.' . awikBase64UrlEncode($signature);
}

function awikVerifyJwt(string $token, string $secret, ?string $expectedType = null): array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        throw new AwikApiException(401, 'Unauthorized');
    }

    [$headerSegment, $payloadSegment, $signatureSegment] = $parts;
    $decodedHeader = awikBase64UrlDecode($headerSegment);
    $decodedPayload = awikBase64UrlDecode($payloadSegment);
    $decodedSignature = awikBase64UrlDecode($signatureSegment);

    if ($decodedHeader === false || $decodedPayload === false || $decodedSignature === false) {
        throw new AwikApiException(401, 'Unauthorized');
    }

    $expectedSignature = hash_hmac('sha256', $headerSegment . '.' . $payloadSegment, $secret, true);
    if (!hash_equals($expectedSignature, $decodedSignature)) {
        throw new AwikApiException(401, 'Unauthorized');
    }

    try {
        $header = json_decode($decodedHeader, true, 512, JSON_THROW_ON_ERROR);
        $payload = json_decode($decodedPayload, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        throw new AwikApiException(401, 'Unauthorized');
    }

    if (!is_array($header) || !isset($header['alg']) || $header['alg'] !== 'HS256') {
        throw new AwikApiException(401, 'Unauthorized');
    }

    if (!is_array($payload) || !isset($payload['sub'], $payload['exp']) || !is_numeric($payload['exp'])) {
        throw new AwikApiException(401, 'Unauthorized');
    }

    if ((int) $payload['exp'] <= time()) {
        throw new AwikApiException(401, 'Unauthorized');
    }

    if ($expectedType !== null && (($payload['type'] ?? null) !== $expectedType)) {
        throw new AwikApiException(401, 'Unauthorized');
    }

    return $payload;
}

function awikReadJsonBody(array $provided = []): array
{
    if ($provided !== []) {
        return $provided;
    }

    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    return awikDecodeJsonBody($raw);
}

function awikDecodeJsonBody(string $raw): array
{
    if (trim($raw) === '') {
        return [];
    }

    try {
        $decoded = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        if ($decoded instanceof stdClass) {
            return get_object_vars($decoded);
        }
        return is_array($decoded) ? $decoded : [];
    } catch (JsonException) {
        return [];
    }
}

function awikHeaderValue(array $headers, string $name): string
{
    $lookup = strtolower($name);
    foreach ($headers as $key => $value) {
        if (strtolower((string) $key) === $lookup) {
            return (string) $value;
        }
    }

    return '';
}

function awikDatabase(): PDO
{
    $config = awikMigrationConfig();
    awikValidateMigrationConfig($config);
    $dsn = $config['dsn'];

    $pdo = new PDO($dsn, $config['dbUser'], $config['dbPassword'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
        $pdo->exec("SET time_zone = '+00:00'");
    }

    return $pdo;
}

function awikCurrentTimestampSql(PDO $db): string
{
    return $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'
        ? 'CURRENT_TIMESTAMP(3)'
        : 'CURRENT_TIMESTAMP';
}

function awikNormalizeClientIp(?string $value): string
{
    $ip = trim((string) ($value ?? ''));
    return filter_var($ip, FILTER_VALIDATE_IP) !== false ? $ip : 'unknown';
}

function awikLooksLikeEmail(string $value): bool
{
    return (bool) preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i', trim($value));
}

function awikPhoneCandidates(string $raw): array
{
    $stripped = preg_replace('/[\s\-().]/', '', trim($raw));
    if ($stripped === null || $stripped === '') {
        return [];
    }

    $add = static function (string $value, array &$bucket): void {
        if ($value !== '' && !in_array($value, $bucket, true)) {
            $bucket[] = $value;
        }
    };

    $digits = ltrim($stripped, '+');
    $out = [];

    if (preg_match('/^\d+$/', $digits)) {
        $legacyInternationalDigits = null;
        if (str_starts_with($digits, '00') && strlen($digits) > 2) {
            $legacyInternationalDigits = $digits;
            $digits = substr($digits, 2);
        }
        $add('+' . $digits, $out);
        $add($digits, $out);
        if ($legacyInternationalDigits !== null) {
            $add('+' . $legacyInternationalDigits, $out);
            $add($legacyInternationalDigits, $out);
        }
    } else {
        $add($stripped, $out);
    }

    return $out;
}

function awikResolveLoginIdentifier(?string $value): ?array
{
    if ($value === null) {
        return null;
    }

    $trimmed = trim($value);
    if ($trimmed === '') {
        return null;
    }

    if (awikLooksLikeEmail($trimmed)) {
        $email = strtolower($trimmed);
        return ['kind' => 'email', 'key' => 'email:' . $email, 'candidates' => [$email]];
    }

    $candidates = awikPhoneCandidates($trimmed);
    if ($candidates === []) {
        return null;
    }

    return ['kind' => 'phone', 'key' => 'phone:' . $candidates[0], 'candidates' => $candidates];
}

function awikLoginIdentifierScopeKey(?array $normalizedIdentifier, string $identifier): string
{
    $canonicalValue = $normalizedIdentifier['key'] ?? 'raw:' . strtolower(trim($identifier));
    return 'account:' . hash('sha256', $canonicalValue);
}

function awikRecordLoginFailure(PDO $db, string $scopeType, string $scopeKey, int $maxAttempts, int $lockoutSeconds, int $windowSeconds): array
{
    $now = time();
    $nowSql = gmdate('Y-m-d H:i:s', $now);

    $db->beginTransaction();
    try {
        if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
            $windowCutoff = gmdate('Y-m-d H:i:s', $now - $windowSeconds);
            $db->prepare(
                'INSERT INTO awik_login_attempts (scopeType, scopeKey, failedCount, windowStartedAt, lastFailedAt, lockedUntil, createdAt, updatedAt) '
                . 'VALUES (?, ?, 1, ?, ?, NULL, ?, ?) '
                . 'ON DUPLICATE KEY UPDATE '
                . 'failedCount = CASE WHEN windowStartedAt < ? THEN 1 ELSE failedCount + 1 END, '
                . 'windowStartedAt = CASE WHEN windowStartedAt < ? THEN VALUES(windowStartedAt) ELSE windowStartedAt END, '
                . 'lastFailedAt = VALUES(lastFailedAt), updatedAt = VALUES(updatedAt)'
            )->execute([$scopeType, $scopeKey, $nowSql, $nowSql, $nowSql, $nowSql, $windowCutoff, $windowCutoff]);

            $countStatement = $db->prepare('SELECT failedCount FROM awik_login_attempts WHERE scopeType = ? AND scopeKey = ? FOR UPDATE');
            $countStatement->execute([$scopeType, $scopeKey]);
            $failedCount = (int) $countStatement->fetchColumn();
            $lockedUntil = $failedCount >= $maxAttempts ? gmdate('Y-m-d H:i:s', $now + $lockoutSeconds) : null;
            $db->prepare('UPDATE awik_login_attempts SET lockedUntil = ?, updatedAt = ? WHERE scopeType = ? AND scopeKey = ?')
                ->execute([$lockedUntil, $nowSql, $scopeType, $scopeKey]);
            $db->commit();

            return [
                'blocked' => $failedCount >= $maxAttempts,
                'retryAfter' => $failedCount >= $maxAttempts ? $lockoutSeconds : 0,
                'count' => $failedCount,
            ];
        }

        $existing = $db->prepare('SELECT * FROM awik_login_attempts WHERE scopeType = ? AND scopeKey = ? LIMIT 1');
        $existing->execute([$scopeType, $scopeKey]);
        $row = $existing->fetch();

        if (!$row) {
            $db->prepare(
                'INSERT INTO awik_login_attempts (scopeType, scopeKey, failedCount, windowStartedAt, lastFailedAt, lockedUntil, createdAt, updatedAt) VALUES (?, ?, 1, ?, ?, NULL, ?, ?)'
            )->execute([$scopeType, $scopeKey, $nowSql, $nowSql, $nowSql, $nowSql]);
            $db->commit();
            return ['blocked' => false, 'retryAfter' => 0, 'count' => 1];
        }

        $windowStarted = strtotime((string) ($row['windowStartedAt'] ?? $nowSql));
        if ($windowStarted === false || ($now - $windowStarted) > $windowSeconds) {
            $failedCount = 1;
            $windowStartedAt = $nowSql;
        } else {
            $failedCount = (int) ($row['failedCount'] ?? 0) + 1;
            $windowStartedAt = (string) ($row['windowStartedAt'] ?? $nowSql);
        }

        $lockedUntil = null;
        if ($failedCount >= $maxAttempts) {
            $lockedUntil = gmdate('Y-m-d H:i:s', $now + $lockoutSeconds);
        }

        $db->prepare(
            'UPDATE awik_login_attempts SET failedCount = ?, windowStartedAt = ?, lastFailedAt = ?, lockedUntil = ?, updatedAt = ? WHERE scopeType = ? AND scopeKey = ?'
        )->execute([$failedCount, $windowStartedAt, $nowSql, $lockedUntil, $nowSql, $scopeType, $scopeKey]);
        $db->commit();

        return [
            'blocked' => $failedCount >= $maxAttempts,
            'retryAfter' => $failedCount >= $maxAttempts ? $lockoutSeconds : 0,
            'count' => $failedCount,
        ];
    } catch (Throwable) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw new AwikApiException(503, 'Login temporarily unavailable');
    }
}

function awikResetLoginAttemptState(PDO $db, string $scopeType, string $scopeKey): void
{
    $nowSql = gmdate('Y-m-d H:i:s', time());
    $db->prepare(
        'UPDATE awik_login_attempts SET failedCount = 0, windowStartedAt = ?, lastFailedAt = NULL, lockedUntil = NULL, updatedAt = ? WHERE scopeType = ? AND scopeKey = ?'
    )->execute([$nowSql, $nowSql, $scopeType, $scopeKey]);
}

function awikCheckLoginAttemptBlocked(PDO $db, string $scopeType, string $scopeKey, int $maxAttempts, int $lockoutSeconds, int $windowSeconds): array
{
    try {
        $row = $db->prepare('SELECT * FROM awik_login_attempts WHERE scopeType = ? AND scopeKey = ? LIMIT 1');
        $row->execute([$scopeType, $scopeKey]);
        $record = $row->fetch();
        if (!$record) {
            return ['blocked' => false, 'retryAfter' => 0];
        }

        $lockedUntil = $record['lockedUntil'] ?? null;
        if (is_string($lockedUntil) && $lockedUntil !== '' && strtotime($lockedUntil) > time()) {
            return ['blocked' => true, 'retryAfter' => max(1, (int) ceil(strtotime($lockedUntil) - time()))];
        }

        $windowStarted = strtotime((string) ($record['windowStartedAt'] ?? 'now'));
        if ($windowStarted !== false && (time() - $windowStarted) > $windowSeconds) {
            awikResetLoginAttemptState($db, $scopeType, $scopeKey);
            return ['blocked' => false, 'retryAfter' => 0];
        }

        return ['blocked' => (int) ($record['failedCount'] ?? 0) >= $maxAttempts, 'retryAfter' => (int) ($record['failedCount'] ?? 0) >= $maxAttempts ? $lockoutSeconds : 0];
    } catch (Throwable) {
        throw new AwikApiException(503, 'Login temporarily unavailable');
    }
}

function awikRequireGenericLoginGuard(PDO $db, string $identifierKey, ?string $clientIp): void
{
    $accountBlocked = awikCheckLoginAttemptBlocked($db, 'identifier', $identifierKey, 5, 900, 900);
    if ($accountBlocked['blocked']) {
        throw new AwikApiException(429, 'Too many login attempts. Please try again later.', [], ['Retry-After' => (string) $accountBlocked['retryAfter']]);
    }

    $ipKey = 'ip:' . hash('sha256', awikNormalizeClientIp($clientIp));
    $ipBlocked = awikCheckLoginAttemptBlocked($db, 'ip', $ipKey, 10, 300, 300);
    if ($ipBlocked['blocked']) {
        throw new AwikApiException(429, 'Too many login attempts. Please try again later.', [], ['Retry-After' => (string) $ipBlocked['retryAfter']]);
    }
}

function awikNormalizeUser(array $user): array
{
    $toIsoDate = static function (?string $value): ?string {
        if ($value === null || $value === '') {
            return null;
        }

        return (new DateTimeImmutable($value, new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone('UTC'))
            ->format('Y-m-d\TH:i:s.v\Z');
    };

    return [
        'id' => $user['id'] ?? null,
        'email' => $user['email'] ?? null,
        'phone' => $user['phone'] ?? null,
        'firstName' => $user['firstName'] ?? null,
        'lastName' => $user['lastName'] ?? null,
        'role' => $user['role'] ?? null,
        'status' => $user['status'] ?? null,
        'lastLoginAt' => $toIsoDate($user['lastLoginAt'] ?? null),
        'createdAt' => $toIsoDate($user['createdAt'] ?? null),
    ];
}

function awikPersistToken(PDO $db, string $userId, string $token, string $tokenType, int $expiresAt): void
{
    $hash = hash('sha256', $token);
    $now = awikCurrentTimestampSql($db);
    $db->prepare(
        'INSERT INTO awik_user_tokens (id, userId, tokenHash, tokenType, expiresAt, revokedAt, createdAt, lastUsedAt) VALUES (?, ?, ?, ?, ?, NULL, ' . $now . ', ' . $now . ')'
    )->execute([
        awikUuidV4(),
        $userId,
        $hash,
        $tokenType,
        gmdate('Y-m-d H:i:s', $expiresAt),
    ]);
}

function awikRevokeUserTokens(PDO $db, string $userId): void
{
    $now = awikCurrentTimestampSql($db);
    $db->prepare(
        'UPDATE awik_user_tokens SET revokedAt = ' . $now . ' WHERE userId = ? AND revokedAt IS NULL'
    )->execute([$userId]);
}

function awikPasswordRecoveryResponse(): array
{
    return [
        'statusCode' => 200,
        'payload' => [
            'success' => true,
            'data' => ['message' => 'If the account is eligible, recovery instructions will be sent.'],
        ],
    ];
}

function awikPasswordRecoveryLimit(PDO $db, string $scopeType, string $scopeHash): int
{
    if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
        $now = 'UTC_TIMESTAMP(3)';
        $expiredWindow = 'windowStartedAt <= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR)';
        $upsert = 'INSERT INTO awik_password_recovery_limits '
            . '(scopeType, scopeHash, requestCount, windowStartedAt, updatedAt) '
            . 'VALUES (?, ?, 1, ' . $now . ', ' . $now . ') '
            . 'ON DUPLICATE KEY UPDATE '
            . 'requestCount = IF(' . $expiredWindow . ', 1, requestCount + 1), '
            . 'windowStartedAt = IF(' . $expiredWindow . ', ' . $now . ', windowStartedAt), '
            . 'updatedAt = ' . $now;
    } else {
        $now = "strftime('%Y-%m-%d %H:%M:%f', 'now')";
        $expiredWindow = "datetime(windowStartedAt) <= datetime('now', '-1 hour')";
        $upsert = 'INSERT INTO awik_password_recovery_limits '
            . '(scopeType, scopeHash, requestCount, windowStartedAt, updatedAt) '
            . 'VALUES (?, ?, 1, ' . $now . ', ' . $now . ') '
            . 'ON CONFLICT(scopeType, scopeHash) DO UPDATE SET '
            . 'requestCount = CASE WHEN ' . $expiredWindow . ' THEN 1 ELSE requestCount + 1 END, '
            . 'windowStartedAt = CASE WHEN ' . $expiredWindow . ' THEN ' . $now . ' ELSE windowStartedAt END, '
            . 'updatedAt = ' . $now;
    }

    $db->prepare($upsert)->execute([$scopeType, $scopeHash]);
    $count = $db->prepare('SELECT requestCount FROM awik_password_recovery_limits WHERE scopeType = ? AND scopeHash = ?');
    $count->execute([$scopeType, $scopeHash]);
    return (int) $count->fetchColumn();
}

function awikDeliverPasswordRecoveryEmail(string $email, string $link, string $displayName): bool
{
    if (awikMigrationEnv('AWIK_RECOVERY_MAIL_PROVIDER') !== 'php-mail' || !function_exists('mail')) {
        return false;
    }

    $from = trim((string) (awikMigrationEnv('AWIK_RECOVERY_FROM_EMAIL') ?: ''));
    $applicationUrl = trim((string) (awikMigrationEnv('AWIK_PUBLIC_APP_URL') ?: ''));
    $urlParts = parse_url($applicationUrl);
    if (
        filter_var($from, FILTER_VALIDATE_EMAIL) === false
        || !is_array($urlParts)
        || strtolower((string) ($urlParts['scheme'] ?? '')) !== 'https'
        || empty($urlParts['host'])
        || isset($urlParts['user'])
        || isset($urlParts['pass'])
        || isset($urlParts['query'])
        || isset($urlParts['fragment'])
    ) {
        return false;
    }

    $safeName = trim(preg_replace('/[\r\n\x00-\x1f\x7f]/', ' ', $displayName) ?? '');
    $greeting = $safeName === '' ? 'Hello,' : 'Hello ' . $safeName . ',';
    $subject = 'AWIK NET password recovery';
    $message = $greeting . "\n\nUse the following single-use link to reset your password. It expires in 30 minutes:\n\n"
        . $link . "\n\nIf you did not request this, you can ignore this message.\n";
    $headers = "From: AWIK NET <{$from}>\r\n"
        . "MIME-Version: 1.0\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n"
        . "Content-Transfer-Encoding: 8bit";

    try {
        return @mail($email, $subject, $message, $headers);
    } catch (Throwable) {
        return false;
    }
}

function awikRequestPasswordRecovery(
    PDO $db,
    string $emailInput,
    ?string $ipAddress = null,
    ?callable $mailer = null
): array {
    $email = strtolower(trim($emailInput));
    $validEmail = strlen($email) <= 254 && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    $emailScope = hash('sha256', $validEmail ? 'email:' . $email : 'invalid:' . hash('sha256', $email));
    $ipScope = hash('sha256', awikNormalizeClientIp($ipAddress));
    $emailCount = awikPasswordRecoveryLimit($db, 'email', $emailScope);
    $ipCount = awikPasswordRecoveryLimit($db, 'ip', $ipScope);
    if ($emailCount > 3 || $ipCount > 10) {
        throw new AwikApiException(429, 'Too many recovery requests. Try again later.', [], ['Retry-After' => '3600']);
    }

    if (!$validEmail) {
        return awikPasswordRecoveryResponse();
    }

    $find = $db->prepare(
        'SELECT id, email, firstName, lastName FROM awik_users '
        . 'WHERE LOWER(email) = LOWER(?) AND status = ? AND deletedAt IS NULL LIMIT 1'
    );
    $find->execute([$email, 'ACTIVE']);
    $user = $find->fetch();
    if (!is_array($user) || !is_string($user['email'] ?? null) || $user['email'] === '') {
        return awikPasswordRecoveryResponse();
    }

    $token = awikBase64UrlEncode(random_bytes(32));
    $tokenHash = hash('sha256', $token);
    $link = rtrim((string) (awikMigrationEnv('AWIK_PUBLIC_APP_URL') ?: ''), '/')
        . '/reset-password/#token=' . rawurlencode($token);
    $mailer ??= 'awikDeliverPasswordRecoveryEmail';

    try {
        $db->beginTransaction();
        if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
            $lockUser = $db->prepare('SELECT id FROM awik_users WHERE id = ? AND status = ? AND deletedAt IS NULL FOR UPDATE');
        } else {
            $lockUser = $db->prepare('SELECT id FROM awik_users WHERE id = ? AND status = ? AND deletedAt IS NULL');
        }
        $lockUser->execute([$user['id'], 'ACTIVE']);
        if ($lockUser->fetchColumn() === false) {
            $db->commit();
            return awikPasswordRecoveryResponse();
        }
        $db->prepare('DELETE FROM awik_password_recovery_tokens WHERE userId = ? AND consumedAt IS NULL')
            ->execute([$user['id']]);
        $db->prepare(
            'INSERT INTO awik_password_recovery_tokens (tokenHash, userId, expiresAt, consumedAt, createdAt) '
            . 'VALUES (?, ?, ?, NULL, ' . awikCurrentTimestampSql($db) . ')'
        )->execute([$tokenHash, $user['id'], gmdate('Y-m-d H:i:s', time() + 1800)]);
        $db->commit();
    } catch (Throwable $exception) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $exception;
    }

    $delivered = false;
    try {
        $delivered = (bool) $mailer((string) $user['email'], $link, trim((string) $user['firstName'] . ' ' . (string) $user['lastName']));
    } catch (Throwable) {
        $delivered = false;
    }
    if (!$delivered) {
        $db->prepare('DELETE FROM awik_password_recovery_tokens WHERE tokenHash = ? AND consumedAt IS NULL')
            ->execute([$tokenHash]);
    }

    return awikPasswordRecoveryResponse();
}

function awikRedeemPasswordRecovery(PDO $db, string $token, string $newPassword, string $confirmPassword): array
{
    if (
        strlen($token) !== 43
        || preg_match('/^[A-Za-z0-9_-]{43}$/D', $token) !== 1
        || mb_strlen($newPassword) < 8
        || mb_strlen($newPassword) > 128
        || $newPassword !== $confirmPassword
    ) {
        throw new AwikApiException(400, 'Invalid or expired password recovery token');
    }

    $tokenHash = hash('sha256', $token);
    $db->beginTransaction();
    try {
        $forUpdate = $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
        $find = $db->prepare(
            'SELECT tokenHash, userId FROM awik_password_recovery_tokens '
            . 'WHERE tokenHash = ? AND consumedAt IS NULL AND expiresAt > ' . awikCurrentTimestampSql($db)
            . $forUpdate
        );
        $find->execute([$tokenHash]);
        $recovery = $find->fetch();
        if (!is_array($recovery)) {
            throw new AwikApiException(400, 'Invalid or expired password recovery token');
        }

        $user = $db->prepare('SELECT id FROM awik_users WHERE id = ? AND status = ? AND deletedAt IS NULL' . $forUpdate);
        $user->execute([$recovery['userId'], 'ACTIVE']);
        if ($user->fetchColumn() === false) {
            throw new AwikApiException(400, 'Invalid or expired password recovery token');
        }

        $consumed = $db->prepare(
            'UPDATE awik_password_recovery_tokens SET consumedAt = ' . awikCurrentTimestampSql($db)
            . ' WHERE tokenHash = ? AND consumedAt IS NULL AND expiresAt > ' . awikCurrentTimestampSql($db)
        );
        $consumed->execute([$tokenHash]);
        if ($consumed->rowCount() !== 1) {
            throw new AwikApiException(400, 'Invalid or expired password recovery token');
        }
        $db->prepare('UPDATE awik_users SET passwordHash = ?, updatedAt = ' . awikCurrentTimestampSql($db) . ' WHERE id = ?')
            ->execute([password_hash($newPassword, PASSWORD_DEFAULT), $recovery['userId']]);
        awikRevokeUserTokens($db, (string) $recovery['userId']);
        $db->prepare(
            'DELETE FROM awik_password_recovery_tokens WHERE userId = ? AND tokenHash <> ? AND consumedAt IS NULL'
        )->execute([$recovery['userId'], $tokenHash]);
        $db->commit();
    } catch (Throwable $exception) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $exception;
    }

    return ['message' => 'Password reset successfully. Sign in with your new password.'];
}

function awikRequireAuthenticatedUser(PDO $db, array $headers): array
{
    $authorization = trim(awikHeaderValue($headers, 'Authorization'));
    if (!preg_match('/^Bearer\s+(\S+)$/i', $authorization, $matches)) {
        throw new AwikApiException(401, 'Unauthorized');
    }

    $token = $matches[1];
    $config = awikMigrationConfig();
    $payload = awikVerifyJwt($token, (string) $config['jwtSecret'], 'access');
    $userId = (string) ($payload['sub'] ?? '');
    if ($userId === '') {
        throw new AwikApiException(401, 'Unauthorized');
    }

    $tokenStatement = $db->prepare(
        'SELECT id FROM awik_user_tokens WHERE tokenHash = ? AND userId = ? AND tokenType = ? AND revokedAt IS NULL AND expiresAt > ' . awikCurrentTimestampSql($db) . ' LIMIT 1'
    );
    $tokenStatement->execute([hash('sha256', $token), $userId, 'access']);
    if (!$tokenStatement->fetch()) {
        throw new AwikApiException(401, 'Unauthorized');
    }

    $statement = $db->prepare('SELECT * FROM awik_users WHERE id = ? LIMIT 1');
    $statement->execute([$userId]);
    $user = $statement->fetch();

    if (!$user || ($user['status'] ?? null) !== 'ACTIVE' || ($user['deletedAt'] ?? null) !== null) {
        throw new AwikApiException(401, 'Unauthorized');
    }

    return $user;
}

function awikRequireSettingsRole(array $user, string $method): void
{
    $role = $user['role'] ?? null;
    if (!in_array($role, ['ADMIN', 'STAFF'], true)) {
        throw new AwikApiException(403, 'Forbidden');
    }
    if ($method === 'PATCH' && $role !== 'ADMIN') {
        throw new AwikApiException(403, 'Forbidden');
    }
}

function awikValidateSettingUpdateBody(array $body): array
{
    $allowed = ['value', 'category', 'description'];
    $errors = [];
    foreach (array_keys($body) as $field) {
        if (!in_array($field, $allowed, true)) {
            $errors[] = 'property ' . (string) $field . ' should not exist';
        }
    }

    // An empty string is a legitimate setting value (clearing an optional
    // company field, e.g. logo/tagline). Only a missing or null value is
    // invalid, so administrators can always save a form that has blank fields.
    if (!array_key_exists('value', $body) || $body['value'] === null) {
        $errors[] = 'value is required';
    }
    foreach (['category', 'description'] as $field) {
        if (array_key_exists($field, $body)
            && $body[$field] !== null
            && !is_string($body[$field])) {
            $errors[] = $field . ' must be a string';
        }
    }

    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }

    $value = is_string($body['value'])
        ? $body['value']
        : json_encode($body['value'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

    return [
        'value' => $value,
        'descriptionProvided' => array_key_exists('description', $body),
        'description' => $body['description'] ?? null,
    ];
}

function awikNormalizeCompanySetting(array $setting): array
{
    $toIsoDate = static function (?string $value): ?string {
        if ($value === null || $value === '') {
            return null;
        }

        return (new DateTimeImmutable($value, new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone('UTC'))
            ->format('Y-m-d\TH:i:s.v\Z');
    };

    return [
        'id' => $setting['id'] ?? null,
        'key' => $setting['key'] ?? null,
        'value' => (string) ($setting['value'] ?? ''),
        'description' => $setting['description'] ?? null,
        'createdAt' => $toIsoDate($setting['createdAt'] ?? null),
        'updatedAt' => $toIsoDate($setting['updatedAt'] ?? null),
    ];
}

function awikValidateCustomerInput(array $body, bool $create): array
{
    $allowed = [
        'phone', 'email', 'whatsappNumber', 'firstName', 'lastName', 'address',
        'area', 'location', 'latitude', 'longitude', 'city', 'notes', 'status',
    ];
    $errors = [];
    foreach (array_keys($body) as $field) {
        if (!in_array($field, $allowed, true)) {
            $errors[] = 'property ' . (string) $field . ' should not exist';
        }
    }

    foreach (['phone', 'firstName', 'lastName'] as $field) {
        if ($create && !array_key_exists($field, $body)) {
            $errors[] = $field . ' should not be empty';
            continue;
        }
        if (!array_key_exists($field, $body) || ($body[$field] === null && !$create)) {
            continue;
        }
        if (!is_string($body[$field])) {
            $errors[] = $field . ' must be a string';
            continue;
        }
        if ($create && $body[$field] === '') {
            $errors[] = $field . ' should not be empty';
        }
    }

    foreach (['phone', 'whatsappNumber'] as $field) {
        if (!array_key_exists($field, $body) || $body[$field] === null || $body[$field] === '') {
            continue;
        }
        if (!is_string($body[$field])) {
            continue;
        }
        if (!preg_match('/^\+[1-9]\d{1,14}$/', $body[$field])) {
            $errors[] = $field === 'phone'
                ? 'Phone must be in E.164 format'
                : 'WhatsApp number must be in E.164 format';
        }
    }

    if (array_key_exists('email', $body) && $body['email'] !== null && $body['email'] !== ''
        && (!is_string($body['email']) || filter_var($body['email'], FILTER_VALIDATE_EMAIL) === false)) {
        $errors[] = 'email must be an email';
    }

    foreach (['whatsappNumber', 'address', 'area', 'location', 'city', 'notes', 'status'] as $field) {
        if (array_key_exists($field, $body) && $body[$field] !== null && !is_string($body[$field])) {
            $errors[] = $field . ' must be a string';
        }
    }

    if (isset($body['status']) && !in_array($body['status'], ['active', 'inactive', 'suspended'], true)) {
        $errors[] = 'status must be one of the following values: active, inactive, suspended';
    }

    foreach (['latitude' => [-90, 90], 'longitude' => [-180, 180]] as $field => [$minimum, $maximum]) {
        if (!array_key_exists($field, $body) || $body[$field] === null) {
            continue;
        }
        if (!is_int($body[$field]) && !is_float($body[$field]) && !is_numeric($body[$field])) {
            $errors[] = $field . ' must be a number conforming to the specified constraints';
            continue;
        }
        $coordinate = (float) $body[$field];
        if ($coordinate < $minimum) {
            $errors[] = $field . ' must not be less than ' . $minimum;
        } elseif ($coordinate > $maximum) {
            $errors[] = $field . ' must not be greater than ' . $maximum;
        }
    }

    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }

    $fields = [
        'phone', 'email', 'whatsappNumber', 'firstName', 'lastName', 'address',
        'area', 'location', 'latitude', 'longitude', 'city', 'notes', 'status',
    ];
    $result = [];
    foreach ($fields as $field) {
        if (array_key_exists($field, $body)) {
            $value = $body[$field];
            if (is_string($value)) {
                $value = awikSanitizePlanString($value);
            } elseif (in_array($field, ['latitude', 'longitude'], true) && $value !== null) {
                $value = (float) $value;
            }
            $result[$field] = $value;
        } elseif ($create) {
            $result[$field] = null;
        }
    }
    if ($create && ($result['status'] ?? null) === null) {
        $result['status'] = 'active';
    }

    return $result;
}

function awikValidateCustomerQuery(array $query): array
{
    $allowed = ['page', 'limit', 'search', 'sortBy', 'sortOrder', 'status', 'city', 'area'];
    $errors = [];
    foreach (array_keys($query) as $field) {
        if (!in_array($field, $allowed, true)) {
            $errors[] = 'property ' . (string) $field . ' should not exist';
        }
    }

    $page = $query['page'] ?? '1';
    $limit = $query['limit'] ?? '20';
    foreach (['page' => $page, 'limit' => $limit] as $field => $value) {
        if (!is_scalar($value) || filter_var((string) $value, FILTER_VALIDATE_INT) === false) {
            $errors[] = $field . ' must be an integer number';
            continue;
        }
        if ((int) $value < 1) {
            $errors[] = $field . ' must not be less than 1';
        }
        if ($field === 'limit' && (int) $value > 100) {
            $errors[] = 'limit must not be greater than 100';
        }
    }

    foreach (['search', 'sortBy', 'sortOrder', 'status', 'city', 'area'] as $field) {
        if (isset($query[$field]) && !is_string($query[$field])) {
            $errors[] = $field . ' must be a string';
        }
    }
    if (isset($query['status']) && !in_array($query['status'], ['active', 'inactive', 'suspended'], true)) {
        $errors[] = 'status must be one of the following values: active, inactive, suspended';
    }
    $sortOrder = $query['sortOrder'] ?? 'desc';
    if (!in_array($sortOrder, ['asc', 'desc'], true)) {
        $errors[] = 'sortOrder must be one of the following values: asc, desc';
    }
    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }

    $sortFields = ['firstName', 'lastName', 'phone', 'email', 'status', 'createdAt', 'updatedAt'];
    $requestedSort = $query['sortBy'] ?? 'createdAt';
    return [
        'page' => (int) $page,
        'limit' => (int) $limit,
        'search' => isset($query['search']) ? awikSanitizePlanString($query['search']) : null,
        'status' => $query['status'] ?? null,
        'city' => isset($query['city']) ? awikSanitizePlanString($query['city']) : null,
        'area' => isset($query['area']) ? awikSanitizePlanString($query['area']) : null,
        'sortBy' => in_array($requestedSort, $sortFields, true) ? $requestedSort : 'createdAt',
        'sortOrder' => $sortOrder,
    ];
}

function awikRequireCustomerRole(array $user): void
{
    if (!in_array($user['role'] ?? null, ['ADMIN', 'STAFF'], true)) {
        throw new AwikApiException(403, 'Forbidden');
    }
}

function awikNormalizeCustomer(array $customer): array
{
    $toIsoDate = static function (?string $value): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        return (new DateTimeImmutable($value, new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone('UTC'))
            ->format('Y-m-d\TH:i:s.v\Z');
    };

    return [
        'id' => $customer['id'] ?? null,
        'phone' => $customer['phone'] ?? null,
        'email' => $customer['email'] ?? null,
        'whatsappNumber' => $customer['whatsappNumber'] ?? null,
        'firstName' => $customer['firstName'] ?? null,
        'lastName' => $customer['lastName'] ?? null,
        'address' => $customer['address'] ?? null,
        'area' => $customer['area'] ?? null,
        'city' => $customer['city'] ?? null,
        'location' => $customer['location'] ?? null,
        'latitude' => ($customer['latitude'] ?? null) === null ? null : (float) $customer['latitude'],
        'longitude' => ($customer['longitude'] ?? null) === null ? null : (float) $customer['longitude'],
        'notes' => $customer['notes'] ?? null,
        'status' => $customer['status'] ?? null,
        'createdAt' => $toIsoDate($customer['createdAt'] ?? null),
        'updatedAt' => $toIsoDate($customer['updatedAt'] ?? null),
        'deletedAt' => $toIsoDate($customer['deletedAt'] ?? null),
    ];
}

function awikNormalizeCustomerSubscription(array $subscription, ?array $plan = null, bool $listProjection = false): array
{
    $toIsoDate = static function (?string $value): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        return (new DateTimeImmutable($value, new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone('UTC'))
            ->format('Y-m-d\TH:i:s.v\Z');
    };

    if ($listProjection) {
        return [
            'id' => $subscription['id'],
            'planId' => $subscription['planId'],
            'startDate' => $toIsoDate($subscription['startDate'] ?? null),
            'expiryDate' => $toIsoDate($subscription['expiryDate'] ?? null),
            'status' => $subscription['status'],
            'paymentStatus' => $subscription['paymentStatus'],
            'plan' => $plan === null ? null : ['id' => $plan['id'], 'name' => $plan['name']],
        ];
    }

    return [
        'id' => $subscription['id'],
        'customerId' => $subscription['customerId'],
        'planId' => $subscription['planId'],
        'startDate' => $toIsoDate($subscription['startDate'] ?? null),
        'expiryDate' => $toIsoDate($subscription['expiryDate'] ?? null),
        'status' => $subscription['status'],
        'paymentStatus' => $subscription['paymentStatus'],
        'notes' => $subscription['notes'],
        'lastRenewalDate' => $toIsoDate($subscription['lastRenewalDate'] ?? null),
        'createdAt' => $toIsoDate($subscription['createdAt'] ?? null),
        'updatedAt' => $toIsoDate($subscription['updatedAt'] ?? null),
        'deletedAt' => $toIsoDate($subscription['deletedAt'] ?? null),
        'plan' => $plan === null ? null : awikNormalizePlan($plan),
    ];
}

function awikRequireAdminUser(array $user): void
{
    if (($user['role'] ?? null) !== 'ADMIN') {
        throw new AwikApiException(403, 'Forbidden');
    }
}

function awikValidateManagedUserInput(array $body, bool $create): array
{
    $allowed = $create
        ? ['phone', 'email', 'firstName', 'lastName', 'password', 'role', 'status']
        : ['email', 'firstName', 'lastName', 'role', 'status'];
    $errors = [];
    foreach (array_keys($body) as $field) {
        if (!in_array($field, $allowed, true)) {
            $errors[] = 'property ' . (string) $field . ' should not exist';
        }
    }

    $required = $create ? ['phone', 'firstName', 'lastName', 'password'] : [];
    foreach ($required as $field) {
        if (!array_key_exists($field, $body)) {
            $errors[] = $field . ' should not be empty';
        }
    }
    foreach (['phone', 'firstName', 'lastName', 'password'] as $field) {
        if (!array_key_exists($field, $body) || ($body[$field] === null && !$create)) {
            continue;
        }
        if (!is_string($body[$field])) {
            $errors[] = $field . ' must be a string';
            continue;
        }
        if ($create && $body[$field] === '') {
            $errors[] = $field . ' should not be empty';
        }
    }
    if (isset($body['password']) && is_string($body['password']) && mb_strlen($body['password']) < 8) {
        $errors[] = 'password must be longer than or equal to 8 characters';
    }
    if (array_key_exists('email', $body) && $body['email'] !== null && $body['email'] !== ''
        && (!is_string($body['email']) || filter_var($body['email'], FILTER_VALIDATE_EMAIL) === false)) {
        $errors[] = 'email must be an email';
    }
    if (isset($body['role']) && !in_array($body['role'], ['ADMIN', 'STAFF'], true)) {
        $errors[] = 'role must be a valid enum value';
    }
    if (isset($body['status']) && !in_array($body['status'], ['ACTIVE', 'INACTIVE', 'SUSPENDED'], true)) {
        $errors[] = 'status must be a valid enum value';
    }

    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }

    $result = [];
    foreach ($allowed as $field) {
        if (array_key_exists($field, $body)) {
            $result[$field] = is_string($body[$field]) ? awikSanitizePlanString($body[$field]) : $body[$field];
        }
    }
    if ($create) {
        $result['role'] = $result['role'] ?? 'STAFF';
        $result['status'] = $result['status'] ?? 'ACTIVE';
        $result['email'] = ($result['email'] ?? null) ?: null;
    }

    return $result;
}

function awikValidateUserQuery(array $query): array
{
    $allowed = ['page', 'limit', 'search', 'sortBy', 'sortOrder', 'role', 'status'];
    $errors = [];
    foreach (array_keys($query) as $field) {
        if (!in_array($field, $allowed, true)) {
            $errors[] = 'property ' . (string) $field . ' should not exist';
        }
    }

    $page = $query['page'] ?? '1';
    $limit = $query['limit'] ?? '20';
    foreach (['page' => $page, 'limit' => $limit] as $field => $value) {
        if (!is_scalar($value) || filter_var((string) $value, FILTER_VALIDATE_INT) === false) {
            $errors[] = $field . ' must be an integer number';
            continue;
        }
        if ((int) $value < 1) {
            $errors[] = $field . ' must not be less than 1';
        }
        if ($field === 'limit' && (int) $value > 100) {
            $errors[] = 'limit must not be greater than 100';
        }
    }
    foreach (['search', 'sortBy', 'sortOrder', 'role', 'status'] as $field) {
        if (isset($query[$field]) && !is_string($query[$field])) {
            $errors[] = $field . ' must be a string';
        }
    }
    if (isset($query['role']) && !in_array($query['role'], ['ADMIN', 'STAFF'], true)) {
        $errors[] = 'role must be a valid enum value';
    }
    if (isset($query['status']) && !in_array($query['status'], ['ACTIVE', 'INACTIVE', 'SUSPENDED'], true)) {
        $errors[] = 'status must be a valid enum value';
    }
    if (!in_array($query['sortOrder'] ?? 'desc', ['asc', 'desc'], true)) {
        $errors[] = 'sortOrder must be one of the following values: asc, desc';
    }
    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }

    $sortFields = ['firstName', 'lastName', 'phone', 'email', 'role', 'status', 'createdAt', 'updatedAt'];
    $sortBy = $query['sortBy'] ?? 'createdAt';
    return [
        'page' => (int) $page,
        'limit' => (int) $limit,
        'search' => isset($query['search']) ? awikSanitizePlanString($query['search']) : null,
        'role' => $query['role'] ?? null,
        'status' => $query['status'] ?? null,
        'sortBy' => in_array($sortBy, $sortFields, true) ? $sortBy : 'createdAt',
        'sortOrder' => $query['sortOrder'] ?? 'desc',
    ];
}

function awikNormalizeManagedUser(array $user, bool $created = false, bool $updated = false): array
{
    $toIsoDate = static function (?string $value): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        return (new DateTimeImmutable($value, new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone('UTC'))
            ->format('Y-m-d\TH:i:s.v\Z');
    };

    $result = [
        'id' => $user['id'] ?? null,
        'phone' => $user['phone'] ?? null,
        'email' => $user['email'] ?? null,
        'firstName' => $user['firstName'] ?? null,
        'lastName' => $user['lastName'] ?? null,
        'role' => $user['role'] ?? null,
        'status' => $user['status'] ?? null,
    ];
    if ($created) {
        $result['createdAt'] = $toIsoDate($user['createdAt'] ?? null);
    } elseif ($updated) {
        $result['updatedAt'] = $toIsoDate($user['updatedAt'] ?? null);
    } else {
        $result['lastLoginAt'] = $toIsoDate($user['lastLoginAt'] ?? null);
        $result['createdAt'] = $toIsoDate($user['createdAt'] ?? null);
        $result['updatedAt'] = $toIsoDate($user['updatedAt'] ?? null);
    }
    return $result;
}

function awikValidateSubscriptionDate(mixed $value, string $field, array &$errors): void
{
    if (!is_string($value)
        || preg_match('/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/', $value) !== 1
        || strtotime($value) === false) {
        $errors[] = $field . ' must be a valid ISO 8601 date string';
    }
}

function awikValidateSubscriptionInput(array $body, string $operation): array
{
    $allowedByOperation = [
        'create' => ['customerId', 'planId', 'startDate', 'durationDays', 'paymentStatus', 'notes'],
        'update' => ['planId', 'startDate', 'expiryDate', 'paymentStatus', 'notes'],
        'renew' => ['planId', 'durationDays'],
    ];
    $allowed = $allowedByOperation[$operation] ?? [];
    $errors = [];
    foreach (array_keys($body) as $field) {
        if (!in_array($field, $allowed, true)) {
            $errors[] = 'property ' . (string) $field . ' should not exist';
        }
    }

    foreach (['customerId', 'planId'] as $field) {
        if ($operation === 'create' && !array_key_exists($field, $body)) {
            $errors[] = $field . ' should not be empty';
            continue;
        }
        if (!array_key_exists($field, $body) || $body[$field] === null) {
            continue;
        }
        if (!is_string($body[$field])) {
            $errors[] = $field . ' must be a string';
        } elseif ($operation === 'create' && $body[$field] === '') {
            $errors[] = $field . ' should not be empty';
        }
    }
    foreach (['startDate', 'expiryDate'] as $field) {
        if (array_key_exists($field, $body) && $body[$field] !== null) {
            awikValidateSubscriptionDate($body[$field], $field, $errors);
        }
    }
    if (array_key_exists('durationDays', $body) && $body['durationDays'] !== null) {
        $duration = $body['durationDays'];
        if (!is_int($duration) && !is_numeric($duration)) {
            $errors[] = 'durationDays must be an integer number';
        } elseif (filter_var((string) $duration, FILTER_VALIDATE_INT) === false) {
            $errors[] = 'durationDays must be an integer number';
        } elseif ((int) $duration < 1) {
            $errors[] = 'durationDays must not be less than 1';
        }
    }
    if (array_key_exists('paymentStatus', $body) && $body['paymentStatus'] !== null
        && (!is_string($body['paymentStatus']) || !in_array($body['paymentStatus'], ['paid', 'pending', 'partially_paid'], true))) {
        $errors[] = 'paymentStatus must be one of the following values: paid, pending, partially_paid';
    }
    if (array_key_exists('notes', $body) && $body['notes'] !== null && !is_string($body['notes'])) {
        $errors[] = 'notes must be a string';
    }
    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }

    foreach (['durationDays'] as $field) {
        if (isset($body[$field])) {
            $body[$field] = (int) $body[$field];
        }
    }
    return $body;
}

function awikValidateSubscriptionQuery(array $query): array
{
    $allowed = ['page', 'limit', 'search', 'sortBy', 'sortOrder', 'status', 'planId', 'customerId', 'expiringSoon'];
    $errors = [];
    foreach (array_keys($query) as $field) {
        if (!in_array($field, $allowed, true)) {
            $errors[] = 'property ' . (string) $field . ' should not exist';
        }
    }
    $page = $query['page'] ?? '1';
    $limit = $query['limit'] ?? '20';
    foreach (['page' => $page, 'limit' => $limit] as $field => $value) {
        if (!is_scalar($value) || filter_var((string) $value, FILTER_VALIDATE_INT) === false) {
            $errors[] = $field . ' must be an integer number';
            continue;
        }
        if ((int) $value < 1) {
            $errors[] = $field . ' must not be less than 1';
        }
        if ($field === 'limit' && (int) $value > 100) {
            $errors[] = 'limit must not be greater than 100';
        }
    }
    foreach (['search', 'sortBy', 'sortOrder', 'status', 'planId', 'customerId', 'expiringSoon'] as $field) {
        if (isset($query[$field]) && !is_string($query[$field])) {
            $errors[] = $field . ' must be a string';
        }
    }
    if (!in_array($query['sortOrder'] ?? 'desc', ['asc', 'desc'], true)) {
        $errors[] = 'sortOrder must be one of the following values: asc, desc';
    }
    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }
    $sortFields = ['startDate', 'expiryDate', 'status', 'createdAt', 'updatedAt'];
    $sortBy = $query['sortBy'] ?? 'expiryDate';
    return [
        'page' => (int) $page,
        'limit' => (int) $limit,
        'search' => isset($query['search']) ? awikSanitizePlanString($query['search']) : null,
        'status' => $query['status'] ?? null,
        'planId' => $query['planId'] ?? null,
        'customerId' => $query['customerId'] ?? null,
        'expiringSoon' => $query['expiringSoon'] ?? null,
        'sortBy' => in_array($sortBy, $sortFields, true) ? $sortBy : 'expiryDate',
        'sortOrder' => $query['sortOrder'] ?? 'desc',
    ];
}

function awikExpiryWarningDays(PDO $db): int
{
    $statement = $db->prepare('SELECT `value` FROM awik_company_settings WHERE `key` = ? LIMIT 1');
    $statement->execute(['subscription_expiry_warning_days']);
    $value = $statement->fetchColumn();
    if ($value !== false && filter_var((string) $value, FILTER_VALIDATE_INT) !== false && (int) $value > 0) {
        return (int) $value;
    }
    return 7;
}

function awikComputeSubscriptionStatus(DateTimeImmutable $expiryDate, int $warningDays, ?DateTimeImmutable $now = null): string
{
    $now ??= new DateTimeImmutable('now', new DateTimeZone('UTC'));
    if ($expiryDate < $now) {
        return 'EXPIRED';
    }
    if ($expiryDate <= $now->modify('+' . $warningDays . ' days')) {
        return 'EXPIRING_SOON';
    }
    return 'ACTIVE';
}

function awikParseUtcDate(string $value): DateTimeImmutable
{
    return (new DateTimeImmutable($value, new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('UTC'));
}

function awikNormalizeSubscription(array $subscription, ?array $customer = null, ?array $plan = null, array $reminders = [], bool $includeReminders = false): array
{
    $toIsoDate = static function (?string $value): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        return (new DateTimeImmutable($value, new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone('UTC'))
            ->format('Y-m-d\TH:i:s.v\Z');
    };
    $normalized = [
        'id' => $subscription['id'] ?? null,
        'customerId' => $subscription['customerId'] ?? null,
        'planId' => $subscription['planId'] ?? null,
        'startDate' => $toIsoDate($subscription['startDate'] ?? null),
        'expiryDate' => $toIsoDate($subscription['expiryDate'] ?? null),
        'status' => $subscription['status'] ?? null,
        'paymentStatus' => $subscription['paymentStatus'] ?? null,
        'notes' => $subscription['notes'] ?? null,
        'lastRenewalDate' => $toIsoDate($subscription['lastRenewalDate'] ?? null),
        'createdAt' => $toIsoDate($subscription['createdAt'] ?? null),
        'updatedAt' => $toIsoDate($subscription['updatedAt'] ?? null),
        'deletedAt' => $toIsoDate($subscription['deletedAt'] ?? null),
        'customer' => $customer,
        'plan' => $plan,
    ];
    if ($includeReminders) {
        $normalized['reminders'] = $reminders;
    }
    return $normalized;
}

function awikWriteSettingsHttpAudit(PDO $db, string $userId, string $settingId, string $key, ?string $ipAddress, string $userAgent): void
{
    try {
        $newValues = json_encode([
            'key' => $key,
            'value' => '[redacted]',
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $db->prepare(
            'INSERT INTO awik_audit_logs (id, userId, action, entity, entityId, oldValues, newValues, ipAddress, userAgent, createdAt) '
            . 'VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ' . awikCurrentTimestampSql($db) . ')'
        )->execute([
            awikUuidV4(),
            $userId,
            'UPDATE',
            'Settings',
            $settingId,
            $newValues,
            awikNormalizeClientIp($ipAddress),
            $userAgent !== '' ? $userAgent : null,
        ]);
    } catch (Throwable) {
        // Match the Nest interceptor's best-effort audit behavior without logging setting values.
    }
}

function awikWriteCustomerAudit(PDO $db, string $userId, string $action, string $customerId, ?array $oldValues, ?array $newValues): void
{
    try {
        $db->prepare(
            'INSERT INTO awik_audit_logs (id, userId, action, entity, entityId, oldValues, newValues, ipAddress, userAgent, createdAt) '
            . 'VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ' . awikCurrentTimestampSql($db) . ')'
        )->execute([
            awikUuidV4(),
            $userId,
            $action,
            'Customer',
            $customerId,
            $oldValues === null ? null : json_encode($oldValues, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
            $newValues === null ? null : json_encode($newValues, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
        ]);
    } catch (Throwable) {
        // Match the source AuditService: business operations remain available if audit storage fails.
    }
}

function awikWriteCustomerHttpAudit(PDO $db, string $userId, string $action, string $customerId, array $body, ?string $ipAddress, string $userAgent): void
{
    try {
        $safeBody = awikRedactPlanAuditValue($body);
        $newValues = $safeBody !== [] ? json_encode($safeBody, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) : null;
        $db->prepare(
            'INSERT INTO awik_audit_logs (id, userId, action, entity, entityId, oldValues, newValues, ipAddress, userAgent, createdAt) '
            . 'VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ' . awikCurrentTimestampSql($db) . ')'
        )->execute([
            awikUuidV4(),
            $userId,
            $action,
            'Customers',
            $customerId,
            $newValues,
            awikNormalizeClientIp($ipAddress),
            $userAgent !== '' ? $userAgent : null,
        ]);
    } catch (Throwable) {
        // Match the source AuditInterceptor's best-effort behavior.
    }
}

function awikIsDuplicateCustomerPhone(PDOException $exception): bool
{
    return ($exception->errorInfo[0] ?? null) === '23000'
        && (int) ($exception->errorInfo[1] ?? 0) === 1062;
}

function awikHandleCustomerRequest(PDO $db, string $method, string $path, array $query, array $body, array $headers, string $responsePath, ?string $ipAddress): ?array
{
    $basePath = '/api/v1/customers';
    $routePath = rtrim($path, '/') ?: '/';
    if ($routePath !== $basePath && !str_starts_with($routePath, $basePath . '/')) {
        return null;
    }

    if (!(
        ($routePath === $basePath && in_array($method, ['GET', 'POST'], true))
        || ($routePath === $basePath . '/search' && $method === 'GET')
        || (preg_match('~^' . preg_quote($basePath, '~') . '/[^/]+$~', $routePath) === 1
            && in_array($method, ['GET', 'PATCH', 'DELETE'], true))
    )) {
        return awikJsonError(404, 'Not Found', null, $responsePath);
    }

    $user = awikRequireAuthenticatedUser($db, $headers);
    awikRequireCustomerRole($user);

    if ($method === 'GET' && $routePath === $basePath . '/search') {
        $search = isset($query['q']) ? (string) $query['q'] : '';
        if ($search === '') {
            return awikResponse(200, ['success' => true, 'data' => []]);
        }
        $search = awikSanitizePlanString($search);
        $statement = $db->prepare(
            'SELECT * FROM awik_customers WHERE deletedAt IS NULL AND ('
            . 'LOCATE(?, phone) > 0 OR LOCATE(LOWER(?), LOWER(firstName)) > 0 OR LOCATE(LOWER(?), LOWER(lastName)) > 0'
            . ') ORDER BY createdAt DESC LIMIT 10'
        );
        $statement->execute([$search, $search, $search]);
        return awikResponse(200, [
            'success' => true,
            'data' => array_map('awikNormalizeCustomer', $statement->fetchAll()),
        ]);
    }

    if ($method === 'GET' && $routePath === $basePath) {
        $filters = awikValidateCustomerQuery($query);
        $where = ['c.deletedAt IS NULL'];
        $parameters = [];
        if ($filters['search'] !== null && $filters['search'] !== '') {
            $where[] = '(LOCATE(?, c.phone) > 0 OR LOCATE(LOWER(?), LOWER(c.firstName)) > 0 '
                . 'OR LOCATE(LOWER(?), LOWER(c.lastName)) > 0 OR LOCATE(LOWER(?), LOWER(c.city)) > 0)';
            array_push($parameters, $filters['search'], $filters['search'], $filters['search'], $filters['search']);
        }
        foreach (['status', 'city', 'area'] as $field) {
            if ($filters[$field] !== null) {
                $where[] = 'c.`' . $field . '` = ?';
                $parameters[] = $filters[$field];
            }
        }
        $whereSql = implode(' AND ', $where);
        $db->beginTransaction();
        try {
        $countStatement = $db->prepare('SELECT COUNT(*) FROM awik_customers c WHERE ' . $whereSql);
        $countStatement->execute($parameters);
        $total = (int) $countStatement->fetchColumn();

        $sortFields = ['firstName', 'lastName', 'phone', 'email', 'status', 'createdAt', 'updatedAt'];
        $sortBy = in_array($filters['sortBy'], $sortFields, true) ? $filters['sortBy'] : 'createdAt';
        $orderBy = 'c.`' . $sortBy . '` ' . strtoupper($filters['sortOrder']);
        $sql = 'SELECT c.*, '
            . 's.id AS latestSubscriptionId, s.planId AS latestSubscriptionPlanId, '
            . 's.startDate AS latestSubscriptionStartDate, s.expiryDate AS latestSubscriptionExpiryDate, '
            . 's.status AS latestSubscriptionStatus, s.paymentStatus AS latestSubscriptionPaymentStatus, '
            . 'p.id AS latestPlanId, p.name AS latestPlanName '
            . 'FROM awik_customers c '
            . 'LEFT JOIN awik_subscriptions s ON s.id = ('
            . 'SELECT s2.id FROM awik_subscriptions s2 '
            . 'WHERE s2.customerId = c.id AND s2.deletedAt IS NULL '
            . 'ORDER BY s2.createdAt DESC LIMIT 1) '
            . 'LEFT JOIN awik_plans p ON p.id = s.planId '
            . 'WHERE ' . $whereSql . ' ORDER BY ' . $orderBy . ' LIMIT ? OFFSET ?';
        $statement = $db->prepare($sql);
        $parameterIndex = 1;
        foreach ($parameters as $parameter) {
            $statement->bindValue($parameterIndex++, $parameter);
        }
        $statement->bindValue($parameterIndex++, $filters['limit'], PDO::PARAM_INT);
        $statement->bindValue($parameterIndex, ($filters['page'] - 1) * $filters['limit'], PDO::PARAM_INT);
        $statement->execute();

        $customers = [];
        foreach ($statement->fetchAll() as $row) {
            $customer = awikNormalizeCustomer($row);
            $customer['subscriptions'] = [];
            if (($row['latestSubscriptionId'] ?? null) !== null) {
                $customer['subscriptions'][] = awikNormalizeCustomerSubscription([
                    'id' => $row['latestSubscriptionId'],
                    'planId' => $row['latestSubscriptionPlanId'],
                    'startDate' => $row['latestSubscriptionStartDate'],
                    'expiryDate' => $row['latestSubscriptionExpiryDate'],
                    'status' => $row['latestSubscriptionStatus'],
                    'paymentStatus' => $row['latestSubscriptionPaymentStatus'],
                ], ($row['latestPlanId'] ?? null) === null ? null : [
                    'id' => $row['latestPlanId'],
                    'name' => $row['latestPlanName'],
                ], true);
            }
            $customers[] = $customer;
        }
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }

        return awikResponse(200, [
            'success' => true,
            'data' => ['data' => $customers, 'total' => $total, 'page' => $filters['page'], 'limit' => $filters['limit']],
        ]);
    }

    if ($method === 'POST' && $routePath === $basePath) {
        $customerInput = awikValidateCustomerInput($body, true);
        $duplicate = $db->prepare('SELECT id FROM awik_customers WHERE phone = ? LIMIT 1');
        $duplicate->execute([$customerInput['phone']]);
        if ($duplicate->fetch()) {
            throw new AwikApiException(409, 'Customer with this phone already exists');
        }

        $customerId = awikUuidV4();
        try {
            $db->prepare(
                'INSERT INTO awik_customers (id, phone, email, whatsappNumber, firstName, lastName, address, area, city, location, latitude, longitude, notes, status) '
                . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $customerId,
                $customerInput['phone'],
                $customerInput['email'],
                $customerInput['whatsappNumber'],
                $customerInput['firstName'],
                $customerInput['lastName'],
                $customerInput['address'],
                $customerInput['area'],
                $customerInput['city'],
                $customerInput['location'],
                $customerInput['latitude'],
                $customerInput['longitude'],
                $customerInput['notes'],
                $customerInput['status'],
            ]);
        } catch (PDOException $exception) {
            if (awikIsDuplicateCustomerPhone($exception)) {
                throw new AwikApiException(409, 'Customer with this phone already exists');
            }
            throw $exception;
        }

        $createdStatement = $db->prepare('SELECT * FROM awik_customers WHERE id = ? LIMIT 1');
        $createdStatement->execute([$customerId]);
        $created = $createdStatement->fetch();
        awikWriteCustomerAudit($db, $user['id'], 'CREATE', $customerId, null, $customerInput);
        awikWriteCustomerHttpAudit($db, $user['id'], 'CREATE', $customerId, $body, $ipAddress, awikHeaderValue($headers, 'User-Agent'));

        return awikResponse(201, ['success' => true, 'data' => awikNormalizeCustomer($created)]);
    }

    if (preg_match('~^' . preg_quote($basePath, '~') . '/([^/]+)$~', $routePath, $matches) !== 1) {
        return awikJsonError(404, 'Not Found', null, $responsePath);
    }
    $customerId = rawurldecode($matches[1]);
    $find = $db->prepare('SELECT * FROM awik_customers WHERE id = ? AND deletedAt IS NULL LIMIT 1');
    $find->execute([$customerId]);
    $customer = $find->fetch();
    if (!$customer) {
        throw new AwikApiException(404, 'Customer not found');
    }

    if ($method === 'GET') {
        $subscriptionsStatement = $db->prepare(
            'SELECT s.*, p.id AS relatedPlanId, p.name AS relatedPlanName, p.description AS relatedPlanDescription, '
            . 'p.speed AS relatedPlanSpeed, p.durationDays AS relatedPlanDurationDays, p.price AS relatedPlanPrice, '
            . 'p.currency AS relatedPlanCurrency, p.isActive AS relatedPlanIsActive, p.createdAt AS relatedPlanCreatedAt, '
            . 'p.updatedAt AS relatedPlanUpdatedAt, p.deletedAt AS relatedPlanDeletedAt '
            . 'FROM awik_subscriptions s LEFT JOIN awik_plans p ON p.id = s.planId '
            . 'WHERE s.customerId = ? AND s.deletedAt IS NULL'
        );
        $subscriptionsStatement->execute([$customerId]);
        $normalized = awikNormalizeCustomer($customer);
        $normalized['subscriptions'] = [];
        foreach ($subscriptionsStatement->fetchAll() as $row) {
            $plan = ($row['relatedPlanId'] ?? null) === null ? null : [
                'id' => $row['relatedPlanId'],
                'name' => $row['relatedPlanName'],
                'description' => $row['relatedPlanDescription'],
                'speed' => $row['relatedPlanSpeed'],
                'durationDays' => $row['relatedPlanDurationDays'],
                'price' => $row['relatedPlanPrice'],
                'currency' => $row['relatedPlanCurrency'],
                'isActive' => $row['relatedPlanIsActive'],
                'createdAt' => $row['relatedPlanCreatedAt'],
                'updatedAt' => $row['relatedPlanUpdatedAt'],
                'deletedAt' => $row['relatedPlanDeletedAt'],
            ];
            $normalized['subscriptions'][] = awikNormalizeCustomerSubscription($row, $plan);
        }
        return awikResponse(200, ['success' => true, 'data' => $normalized]);
    }

    if ($method === 'PATCH') {
        $customerInput = awikValidateCustomerInput($body, false);
        if (isset($customerInput['phone']) && $customerInput['phone'] !== $customer['phone']) {
            $duplicate = $db->prepare('SELECT id FROM awik_customers WHERE phone = ? LIMIT 1');
            $duplicate->execute([$customerInput['phone']]);
            if ($duplicate->fetch()) {
                throw new AwikApiException(409, 'Customer with this phone already exists');
            }
        }

        if ($customerInput !== []) {
            $assignments = [];
            $parameters = [];
            foreach ($customerInput as $field => $value) {
                $assignments[] = '`' . $field . '` = ?';
                $parameters[] = $value;
            }
            $parameters[] = $customerId;
            try {
                $db->prepare(
                    'UPDATE awik_customers SET ' . implode(', ', $assignments)
                    . ', updatedAt = ' . awikCurrentTimestampSql($db) . ' WHERE id = ?'
                )->execute($parameters);
            } catch (PDOException $exception) {
                if (awikIsDuplicateCustomerPhone($exception)) {
                    throw new AwikApiException(409, 'Customer with this phone already exists');
                }
                throw $exception;
            }
        }

        $updatedStatement = $db->prepare('SELECT * FROM awik_customers WHERE id = ? LIMIT 1');
        $updatedStatement->execute([$customerId]);
        $updated = $updatedStatement->fetch();
        awikWriteCustomerAudit($db, $user['id'], 'UPDATE', $customerId, [
            'phone' => $customer['phone'],
            'status' => $customer['status'],
            'firstName' => $customer['firstName'],
            'lastName' => $customer['lastName'],
        ], $customerInput);
        awikWriteCustomerHttpAudit($db, $user['id'], 'UPDATE', $customerId, $body, $ipAddress, awikHeaderValue($headers, 'User-Agent'));

        return awikResponse(200, ['success' => true, 'data' => awikNormalizeCustomer($updated)]);
    }

    if ($method === 'DELETE') {
        $now = awikCurrentTimestampSql($db);
        $db->prepare('UPDATE awik_customers SET deletedAt = ' . $now . ', updatedAt = ' . $now . ' WHERE id = ?')
            ->execute([$customerId]);
        awikWriteCustomerAudit($db, $user['id'], 'DELETE', $customerId, null, null);
        awikWriteCustomerHttpAudit($db, $user['id'], 'DELETE', $customerId, $body, $ipAddress, awikHeaderValue($headers, 'User-Agent'));
        return awikResponse(200, ['success' => true, 'data' => ['message' => 'Customer deleted successfully']]);
    }

    return awikJsonError(404, 'Not Found', null, $responsePath);
}

function awikRouteNotFound(): array
{
    return awikJsonError(404, 'Not found');
}

function awikNormalizePlan(array $plan): array
{
    $toIsoDate = static function (?string $value): ?string {
        if ($value === null || $value === '') {
            return null;
        }

        return (new DateTimeImmutable($value, new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone('UTC'))
            ->format('Y-m-d\TH:i:s.v\Z');
    };
    $price = (string) ($plan['price'] ?? '0');
    if (str_contains($price, '.')) {
        $price = rtrim(rtrim($price, '0'), '.');
    }

    return [
        'id' => $plan['id'],
        'name' => $plan['name'],
        'description' => $plan['description'],
        'speed' => $plan['speed'],
        'durationDays' => (int) $plan['durationDays'],
        'price' => $price === '' || $price === '-0' ? '0' : $price,
        'currency' => $plan['currency'],
        'isActive' => (bool) $plan['isActive'],
        'createdAt' => $toIsoDate($plan['createdAt'] ?? null),
        'updatedAt' => $toIsoDate($plan['updatedAt'] ?? null),
        'deletedAt' => $toIsoDate($plan['deletedAt'] ?? null),
    ];
}

function awikWritePlanAudit(PDO $db, string $userId, string $action, string $planId, ?array $oldValues = null, ?array $newValues = null): void
{
    try {
        $now = awikCurrentTimestampSql($db);
        $db->prepare(
            'INSERT INTO awik_audit_logs (id, userId, action, entity, entityId, oldValues, newValues, ipAddress, userAgent, createdAt) '
            . 'VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ' . $now . ')'
        )->execute([
            awikUuidV4(),
            $userId,
            $action,
            'Plan',
            $planId,
            $oldValues === null ? null : json_encode($oldValues, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            $newValues === null ? null : json_encode($newValues, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]);
    } catch (Throwable) {
        // Plan mutations must still succeed when best-effort auditing is unavailable.
    }
}

function awikRedactPlanAuditValue(mixed $value, int $depth = 0): mixed
{
    if ($depth > 6 || !is_array($value)) {
        return $value;
    }

    $sensitiveKeys = ['password', 'newpassword', 'currentpassword', 'confirmpassword', 'passwordhash', 'accesstoken', 'refreshtoken', 'token', 'secret', 'apitoken', 'authorization'];
    $redacted = [];
    foreach ($value as $key => $item) {
        if (is_string($key) && in_array(strtolower($key), $sensitiveKeys, true)) {
            $redacted[$key] = '[redacted]';
        } else {
            $redacted[$key] = awikRedactPlanAuditValue($item, $depth + 1);
        }
    }

    return $redacted;
}

function awikWritePlanHttpAudit(PDO $db, string $userId, string $action, ?string $entityId, array $body, ?string $ipAddress, string $userAgent): void
{
    try {
        $safeBody = awikRedactPlanAuditValue($body);
        $newValues = $safeBody !== [] ? json_encode($safeBody, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) : null;
        $db->prepare(
            'INSERT INTO awik_audit_logs (id, userId, action, entity, entityId, oldValues, newValues, ipAddress, userAgent, createdAt) '
            . 'VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ' . awikCurrentTimestampSql($db) . ')'
        )->execute([
            awikUuidV4(),
            $userId,
            $action,
            'Plans',
            $entityId,
            $newValues,
            $ipAddress,
            $userAgent !== '' ? $userAgent : null,
        ]);
    } catch (Throwable) {
        // The Nest audit interceptor does not fail successful API operations.
    }
}

function awikValidatePlanInput(array $body, bool $create): array
{
    $allowed = ['name', 'description', 'speed', 'durationDays', 'price', 'currency', 'isActive'];
    $messages = [];
    foreach (array_keys($body) as $field) {
        if (!in_array($field, $allowed, true)) {
            $messages[] = 'property ' . $field . ' should not exist';
        }
    }

    foreach (['name', 'speed'] as $field) {
        if ($create && !array_key_exists($field, $body)) {
            $messages[] = $field . ' should not be empty';
            continue;
        }
        if (!array_key_exists($field, $body)) {
            continue;
        }
        if ($body[$field] === null) {
            if ($create) {
                $messages[] = $field . ' must be a string';
            }
            continue;
        }
        if (!is_string($body[$field])) {
            $messages[] = $field . ' must be a string';
        } elseif ($create && $body[$field] === '') {
            $messages[] = $field . ' should not be empty';
        }
    }

    foreach (['description', 'currency'] as $field) {
        if (array_key_exists($field, $body) && $body[$field] !== null && !is_string($body[$field])) {
            $messages[] = $field . ' must be a string';
        }
    }

    foreach (['durationDays' => 1, 'price' => 0] as $field => $minimum) {
        if ($create && !array_key_exists($field, $body)) {
            $messages[] = $field . ' must be a number conforming to the specified constraints';
            continue;
        }
        if (!array_key_exists($field, $body)) {
            continue;
        }
        if ($body[$field] === null) {
            if ($create) {
                $messages[] = $field . ' must be a number conforming to the specified constraints';
            }
            continue;
        }
        if (!is_int($body[$field]) && !is_float($body[$field]) && !is_numeric($body[$field])) {
            $messages[] = $field . ' must be a number conforming to the specified constraints';
        } elseif ((float) $body[$field] < $minimum) {
            $messages[] = $field . ' must not be less than ' . $minimum;
        }
    }

    if (array_key_exists('isActive', $body) && $body['isActive'] !== null && !is_bool($body['isActive'])) {
        $messages[] = 'isActive must be a boolean value';
    }

    if ($messages !== []) {
        throw new AwikApiException(400, 'Validation failed', $messages);
    }

    return $body;
}

function awikEnsurePlanStorageCompatibility(array $input): void
{
    if (isset($input['durationDays']) && is_numeric($input['durationDays'])) {
        $durationDays = (float) $input['durationDays'];
        if (floor($durationDays) !== $durationDays) {
            throw new RuntimeException('durationDays cannot be stored as a Prisma integer');
        }
    }
}

function awikSanitizePlanString(string $value): string
{
    $value = preg_replace('/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i', '', $value) ?? $value;
    $value = preg_replace('/on\w+\s*=/i', '', $value) ?? $value;

    return preg_replace('/javascript:/i', '', $value) ?? $value;
}

function awikSanitizePlanInput(array $input): array
{
    foreach ($input as $field => $value) {
        if (is_string($value)) {
            $input[$field] = awikSanitizePlanString($value);
        }
    }

    return $input;
}

function awikValidatePlanQuery(array $query): array
{
    $allowed = ['page', 'limit', 'search', 'sortBy', 'sortOrder', 'isActive'];
    $messages = [];
    foreach (array_keys($query) as $field) {
        if (!in_array($field, $allowed, true)) {
            $messages[] = 'property ' . $field . ' should not exist';
        }
    }

    $page = $query['page'] ?? '1';
    $limit = $query['limit'] ?? '20';
    foreach (['page' => $page, 'limit' => $limit] as $field => $value) {
        if (!is_scalar($value) || filter_var((string) $value, FILTER_VALIDATE_INT) === false) {
            $messages[] = $field . ' must be an integer number';
            continue;
        }
        if ((int) $value < 1) {
            $messages[] = $field . ' must not be less than 1';
        }
        if ($field === 'limit' && (int) $value > 100) {
            $messages[] = 'limit must not be greater than 100';
        }
    }

    foreach (['search', 'sortBy', 'sortOrder', 'isActive'] as $field) {
        if (isset($query[$field]) && !is_string($query[$field])) {
            $messages[] = $field . ' must be a string';
        }
    }
    $sortOrder = $query['sortOrder'] ?? 'desc';
    if (!in_array($sortOrder, ['asc', 'desc'], true)) {
        $messages[] = 'sortOrder must be one of the following values: asc, desc';
    }

    if ($messages !== []) {
        throw new AwikApiException(400, 'Validation failed', $messages);
    }

    $sortFields = ['name', 'price', 'speed', 'durationDays', 'isActive', 'createdAt', 'updatedAt'];
    $sortBy = $query['sortBy'] ?? 'createdAt';
    return [
        'page' => (int) $page,
        'limit' => (int) $limit,
        'search' => isset($query['search']) ? awikSanitizePlanString($query['search']) : null,
        'isActive' => array_key_exists('isActive', $query) ? ($query['isActive'] === 'true' ? 1 : 0) : null,
        'sortBy' => in_array($sortBy, $sortFields, true) ? $sortBy : 'createdAt',
        'sortOrder' => $sortOrder,
    ];
}

function awikFindActivePlan(PDO $db, string $planId): ?array
{
    $statement = $db->prepare('SELECT * FROM awik_plans WHERE id = ? AND deletedAt IS NULL LIMIT 1');
    $statement->execute([$planId]);
    $plan = $statement->fetch();

    return $plan ?: null;
}

function awikHandlePlanRequest(PDO $db, string $method, string $path, array $query, array $body, array $headers, string $responsePath, ?string $ipAddress): ?array
{
    $basePath = '/api/v1/plans';
    $routePath = rtrim($path, '/') ?: '/';
    if ($routePath !== $basePath && !str_starts_with($routePath, $basePath . '/')) {
        return null;
    }

    $user = awikRequireAuthenticatedUser($db, $headers);
    if (!in_array($user['role'] ?? null, ['ADMIN', 'STAFF'], true)) {
        throw new AwikApiException(403, 'Forbidden');
    }
    $isAdmin = $user['role'] === 'ADMIN';

    if ($method === 'GET' && $routePath === $basePath . '/active') {
        $statement = $db->query('SELECT * FROM awik_plans WHERE isActive = 1 AND deletedAt IS NULL ORDER BY price ASC');
        return awikResponse(200, [
            'success' => true,
            'data' => array_map('awikNormalizePlan', $statement->fetchAll()),
        ]);
    }

    if ($method === 'GET' && $routePath === $basePath) {
        $filters = awikValidatePlanQuery($query);
        $where = ['deletedAt IS NULL'];
        $parameters = [];
        if ($filters['search'] !== null && $filters['search'] !== '') {
            $where[] = 'LOWER(name) LIKE LOWER(?)';
            $parameters[] = '%' . $filters['search'] . '%';
        }
        if ($filters['isActive'] !== null) {
            $where[] = 'isActive = ?';
            $parameters[] = $filters['isActive'];
        }
        $whereSql = implode(' AND ', $where);
        $countStatement = $db->prepare('SELECT COUNT(*) FROM awik_plans WHERE ' . $whereSql);
        $countStatement->execute($parameters);
        $total = (int) $countStatement->fetchColumn();

        $orderBy = '`' . $filters['sortBy'] . '` ' . strtoupper($filters['sortOrder']);
        $statement = $db->prepare(
            'SELECT * FROM awik_plans WHERE ' . $whereSql . ' ORDER BY ' . $orderBy . ' LIMIT ? OFFSET ?'
        );
        $parameterIndex = 1;
        foreach ($parameters as $parameter) {
            $statement->bindValue($parameterIndex++, $parameter);
        }
        $statement->bindValue($parameterIndex++, $filters['limit'], PDO::PARAM_INT);
        $statement->bindValue($parameterIndex, ($filters['page'] - 1) * $filters['limit'], PDO::PARAM_INT);
        $statement->execute();

        return awikResponse(200, [
            'success' => true,
            'data' => [
                'data' => array_map('awikNormalizePlan', $statement->fetchAll()),
                'total' => $total,
                'page' => $filters['page'],
                'limit' => $filters['limit'],
            ],
        ]);
    }

    if ($routePath === $basePath && $method === 'POST') {
        if (!$isAdmin) {
            throw new AwikApiException(403, 'Forbidden');
        }
        $planInput = awikSanitizePlanInput(awikValidatePlanInput($body, true));
        awikEnsurePlanStorageCompatibility($planInput);
        $duplicate = $db->prepare('SELECT id FROM awik_plans WHERE name = ? AND deletedAt IS NULL LIMIT 1');
        $duplicate->execute([$planInput['name']]);
        if ($duplicate->fetch()) {
            throw new AwikApiException(409, 'A plan with this name already exists');
        }

        $planId = awikUuidV4();
        $description = $planInput['description'] ?? null;
        $currency = ($planInput['currency'] ?? null) ?: 'USD';
        $isActive = $planInput['isActive'] ?? true;
        $db->prepare(
            'INSERT INTO awik_plans (id, name, description, speed, durationDays, price, currency, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $planId,
            $planInput['name'],
            $description === '' ? null : $description,
            $planInput['speed'],
            $planInput['durationDays'],
            (string) $planInput['price'],
            $currency,
            $isActive ? 1 : 0,
        ]);
        $created = awikFindActivePlan($db, $planId);
        awikWritePlanAudit($db, $user['id'], 'CREATE', $planId, null, $planInput);
        awikWritePlanHttpAudit($db, $user['id'], 'CREATE', $planId, $body, $ipAddress, awikHeaderValue($headers, 'User-Agent'));

        return awikResponse(201, ['success' => true, 'data' => awikNormalizePlan($created)]);
    }

    if (preg_match('~^' . preg_quote($basePath, '~') . '/([^/]+)$~', $routePath, $matches) !== 1) {
        return awikJsonError(404, 'Not Found', null, $responsePath);
    }
    $planId = rawurldecode($matches[1]);
    if ($planId === 'active') {
        return awikJsonError(404, 'Not Found', null, $responsePath);
    }

    if ($method === 'GET') {
        $plan = awikFindActivePlan($db, $planId);
        if (!$plan) {
            throw new AwikApiException(404, 'Plan not found');
        }
        return awikResponse(200, ['success' => true, 'data' => awikNormalizePlan($plan)]);
    }

    if ($method === 'PATCH') {
        if (!$isAdmin) {
            throw new AwikApiException(403, 'Forbidden');
        }
        $plan = awikFindActivePlan($db, $planId);
        if (!$plan) {
            throw new AwikApiException(404, 'Plan not found');
        }
        $planInput = awikSanitizePlanInput(awikValidatePlanInput($body, false));
        awikEnsurePlanStorageCompatibility($planInput);

        if (isset($planInput['name']) && $planInput['name'] !== '' && $planInput['name'] !== $plan['name']) {
            $duplicate = $db->prepare('SELECT id FROM awik_plans WHERE name = ? AND deletedAt IS NULL AND id != ? LIMIT 1');
            $duplicate->execute([$planInput['name'], $planId]);
            if ($duplicate->fetch()) {
                throw new AwikApiException(409, 'A plan with this name already exists');
            }
        }

        $updateData = [];
        foreach (['name', 'description', 'speed', 'durationDays', 'price', 'currency', 'isActive'] as $field) {
            if (array_key_exists($field, $planInput)) {
                $updateData[$field] = $field === 'price' && $planInput[$field] !== null
                    ? (string) $planInput[$field]
                    : $planInput[$field];
            }
        }
        if ($updateData !== []) {
            $assignments = [];
            $parameters = [];
            foreach ($updateData as $field => $value) {
                $assignments[] = '`' . $field . '` = ?';
                $parameters[] = $field === 'isActive' && $value !== null ? ($value ? 1 : 0) : $value;
            }
            $parameters[] = $planId;
            $db->prepare(
                'UPDATE awik_plans SET ' . implode(', ', $assignments) . ', updatedAt = ' . awikCurrentTimestampSql($db) . ' WHERE id = ?'
            )->execute($parameters);
        }
        $updated = awikFindActivePlan($db, $planId);
        awikWritePlanAudit($db, $user['id'], 'UPDATE', $planId, [
            'name' => $plan['name'],
            'price' => (string) $plan['price'],
        ], $updateData);
        awikWritePlanHttpAudit($db, $user['id'], 'UPDATE', $planId, $body, $ipAddress, awikHeaderValue($headers, 'User-Agent'));

        return awikResponse(200, ['success' => true, 'data' => awikNormalizePlan($updated)]);
    }

    if ($method === 'DELETE') {
        if (!$isAdmin) {
            throw new AwikApiException(403, 'Forbidden');
        }
        if (!awikFindActivePlan($db, $planId)) {
            throw new AwikApiException(404, 'Plan not found');
        }
        $now = awikCurrentTimestampSql($db);
        $db->prepare('UPDATE awik_plans SET deletedAt = ' . $now . ', isActive = 0, updatedAt = ' . $now . ' WHERE id = ?')
            ->execute([$planId]);
        awikWritePlanAudit($db, $user['id'], 'DELETE', $planId);
        awikWritePlanHttpAudit($db, $user['id'], 'DELETE', null, $body, $ipAddress, awikHeaderValue($headers, 'User-Agent'));

        return awikResponse(200, ['success' => true, 'data' => ['message' => 'Plan deleted successfully']]);
    }

    return awikJsonError(404, 'Not Found', null, $responsePath);
}

function awikWriteUserAudit(PDO $db, string $actorId, string $action, string $userId, ?array $oldValues, ?array $newValues): void
{
    try {
        $safeOld = $oldValues === null ? null : awikRedactPlanAuditValue($oldValues);
        $safeNew = $newValues === null ? null : awikRedactPlanAuditValue($newValues);
        $db->prepare(
            'INSERT INTO awik_audit_logs (id, userId, action, entity, entityId, oldValues, newValues, ipAddress, userAgent, createdAt) '
            . 'VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ' . awikCurrentTimestampSql($db) . ')'
        )->execute([
            awikUuidV4(),
            $actorId,
            $action,
            'User',
            $userId,
            $safeOld === null ? null : json_encode($safeOld, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
            $safeNew === null ? null : json_encode($safeNew, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
        ]);
    } catch (Throwable) {
        // Preserve the source best-effort audit behavior without persisting credentials.
    }
}

function awikWriteUserHttpAudit(PDO $db, string $actorId, string $action, ?string $entityId, array $body, ?string $ipAddress, string $userAgent): void
{
    try {
        $safeBody = awikRedactPlanAuditValue($body);
        $newValues = $safeBody !== [] ? json_encode($safeBody, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) : null;
        $db->prepare(
            'INSERT INTO awik_audit_logs (id, userId, action, entity, entityId, oldValues, newValues, ipAddress, userAgent, createdAt) '
            . 'VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ' . awikCurrentTimestampSql($db) . ')'
        )->execute([
            awikUuidV4(),
            $actorId,
            $action,
            'Users',
            $entityId,
            $newValues,
            awikNormalizeClientIp($ipAddress),
            $userAgent !== '' ? $userAgent : null,
        ]);
    } catch (Throwable) {
        // The source HTTP audit interceptor is best effort.
    }
}

function awikUserDuplicateConflict(PDOException $exception): bool
{
    return ($exception->errorInfo[0] ?? null) === '23000'
        && (int) ($exception->errorInfo[1] ?? 0) === 1062;
}

function awikValidateAdminPasswordBody(array $body): string
{
    $errors = [];
    foreach (array_keys($body) as $field) {
        if ($field !== 'newPassword') {
            $errors[] = 'property ' . (string) $field . ' should not exist';
        }
    }
    if (!isset($body['newPassword']) || !is_string($body['newPassword']) || $body['newPassword'] === '') {
        $errors[] = 'newPassword should not be empty';
    } elseif (mb_strlen($body['newPassword']) < 8) {
        $errors[] = 'newPassword must be longer than or equal to 8 characters';
    }
    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }
    return $body['newPassword'];
}

function awikHandleUserRequest(PDO $db, string $method, string $path, array $query, array $body, array $headers, string $responsePath, ?string $ipAddress): ?array
{
    $basePath = '/api/v1/users';
    $routePath = rtrim($path, '/') ?: '/';
    if ($routePath !== $basePath && !str_starts_with($routePath, $basePath . '/')) {
        return null;
    }

    if (!(
        ($routePath === $basePath && in_array($method, ['GET', 'POST'], true))
        || (preg_match('~^' . preg_quote($basePath, '~') . '/([^/]+)$~', $routePath, $routeMatches) === 1
            && ($method === 'PATCH' || $method === 'DELETE'
                || ($method === 'POST' && $routePath === $basePath . '/' . $routeMatches[1] . '/password')))
        || (preg_match('~^' . preg_quote($basePath, '~') . '/([^/]+)/password$~', $routePath) === 1 && $method === 'POST')
    )) {
        return awikJsonError(404, 'Not Found', null, $responsePath);
    }

    $actor = awikRequireAuthenticatedUser($db, $headers);
    awikRequireAdminUser($actor);
    $actorId = (string) $actor['id'];

    if ($method === 'GET' && $routePath === $basePath) {
        $filters = awikValidateUserQuery($query);
        $where = ['deletedAt IS NULL'];
        $parameters = [];
        if ($filters['search'] !== null && $filters['search'] !== '') {
            $where[] = '(LOCATE(?, phone) > 0 OR LOCATE(LOWER(?), LOWER(firstName)) > 0 '
                . 'OR LOCATE(LOWER(?), LOWER(lastName)) > 0 OR LOCATE(LOWER(?), LOWER(email)) > 0)';
            array_push($parameters, $filters['search'], $filters['search'], $filters['search'], $filters['search']);
        }
        foreach (['role', 'status'] as $field) {
            if ($filters[$field] !== null) {
                $where[] = '`' . $field . '` = ?';
                $parameters[] = $filters[$field];
            }
        }
        $whereSql = implode(' AND ', $where);
        $countStatement = $db->prepare('SELECT COUNT(*) FROM awik_users WHERE ' . $whereSql);
        $countStatement->execute($parameters);
        $total = (int) $countStatement->fetchColumn();

        $sortFields = ['firstName', 'lastName', 'phone', 'email', 'role', 'status', 'createdAt', 'updatedAt'];
        $sortBy = in_array($filters['sortBy'], $sortFields, true) ? $filters['sortBy'] : 'createdAt';
        $statement = $db->prepare(
            'SELECT id, phone, email, firstName, lastName, role, status, lastLoginAt, createdAt, updatedAt '
            . 'FROM awik_users WHERE ' . $whereSql . ' ORDER BY `' . $sortBy . '` '
            . strtoupper($filters['sortOrder']) . ' LIMIT ? OFFSET ?'
        );
        $parameterIndex = 1;
        foreach ($parameters as $parameter) {
            $statement->bindValue($parameterIndex++, $parameter);
        }
        $statement->bindValue($parameterIndex++, $filters['limit'], PDO::PARAM_INT);
        $statement->bindValue($parameterIndex, ($filters['page'] - 1) * $filters['limit'], PDO::PARAM_INT);
        $statement->execute();

        return awikResponse(200, [
            'success' => true,
            'data' => [
                'data' => array_map('awikNormalizeManagedUser', $statement->fetchAll()),
                'total' => $total,
                'page' => $filters['page'],
                'limit' => $filters['limit'],
            ],
        ]);
    }

    if ($method === 'POST' && $routePath === $basePath) {
        $input = awikValidateManagedUserInput($body, true);
        $existing = $db->prepare('SELECT id FROM awik_users WHERE phone = ? LIMIT 1');
        $existing->execute([$input['phone']]);
        if ($existing->fetch()) {
            throw new AwikApiException(409, 'Phone number already in use');
        }
        if ($input['email'] !== null) {
            $existing = $db->prepare('SELECT id FROM awik_users WHERE email = ? LIMIT 1');
            $existing->execute([$input['email']]);
            if ($existing->fetch()) {
                throw new AwikApiException(409, 'Email already in use');
            }
        }

        $userId = awikUuidV4();
        try {
            $db->prepare(
                'INSERT INTO awik_users (id, phone, email, firstName, lastName, passwordHash, role, status) '
                . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $userId,
                $input['phone'],
                $input['email'],
                $input['firstName'],
                $input['lastName'],
                password_hash($input['password'], PASSWORD_BCRYPT, ['cost' => 12]),
                $input['role'],
                $input['status'],
            ]);
        } catch (PDOException $exception) {
            if (awikUserDuplicateConflict($exception)) {
                $phoneConflict = $db->prepare('SELECT id FROM awik_users WHERE phone = ? LIMIT 1');
                $phoneConflict->execute([$input['phone']]);
                if ($phoneConflict->fetch()) {
                    throw new AwikApiException(409, 'Phone number already in use');
                }
                if ($input['email'] !== null) {
                    $emailConflict = $db->prepare('SELECT id FROM awik_users WHERE email = ? LIMIT 1');
                    $emailConflict->execute([$input['email']]);
                    if ($emailConflict->fetch()) {
                        throw new AwikApiException(409, 'Email already in use');
                    }
                }
                throw new AwikApiException(409, 'Phone number or email already in use');
            }
            throw $exception;
        }
        $createdStatement = $db->prepare('SELECT id, phone, email, firstName, lastName, role, status, createdAt FROM awik_users WHERE id = ? LIMIT 1');
        $createdStatement->execute([$userId]);
        $created = $createdStatement->fetch();
        $auditInput = $input;
        $auditInput['password'] = '[REDACTED]';
        awikWriteUserAudit($db, $actorId, 'CREATE', $userId, null, $auditInput);
        awikWriteUserHttpAudit($db, $actorId, 'CREATE', $userId, $body, $ipAddress, awikHeaderValue($headers, 'User-Agent'));

        return awikResponse(201, ['success' => true, 'data' => awikNormalizeManagedUser($created, true)]);
    }

    if (preg_match('~^' . preg_quote($basePath, '~') . '/([^/]+)(?:/password)?$~', $routePath, $matches) !== 1) {
        return awikJsonError(404, 'Not Found', null, $responsePath);
    }
    $userId = rawurldecode($matches[1]);
    $passwordRoute = str_ends_with($routePath, '/password');
    $userStatement = $db->prepare('SELECT * FROM awik_users WHERE id = ? AND deletedAt IS NULL LIMIT 1');
    $userStatement->execute([$userId]);
    $targetUser = $userStatement->fetch();
    if (!$targetUser) {
        throw new AwikApiException(404, 'User not found');
    }

    if ($method === 'POST' && $passwordRoute) {
        $newPassword = awikValidateAdminPasswordBody($body);
        $db->prepare('UPDATE awik_users SET passwordHash = ?, updatedAt = ' . awikCurrentTimestampSql($db) . ' WHERE id = ?')
            ->execute([password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]), $userId]);
        awikWriteUserAudit($db, $actorId, 'UPDATE', $userId, null, null);
        awikWriteUserHttpAudit($db, $actorId, 'UPDATE', $userId, $body, $ipAddress, awikHeaderValue($headers, 'User-Agent'));
        return awikResponse(200, ['success' => true, 'data' => ['message' => 'Password updated successfully']]);
    }

    if ($method === 'PATCH' && !$passwordRoute) {
        $input = awikValidateManagedUserInput($body, false);
        if ($input === []) {
            throw new AwikApiException(400, 'No fields to update');
        }
        if (!empty($input['email']) && $input['email'] !== $targetUser['email']) {
            $existing = $db->prepare('SELECT id FROM awik_users WHERE email = ? LIMIT 1');
            $existing->execute([$input['email']]);
            $existingUser = $existing->fetch();
            if ($existingUser && $existingUser['id'] !== $userId) {
                throw new AwikApiException(409, 'Email already in use');
            }
        }

        $assignments = [];
        $parameters = [];
        foreach ($input as $field => $value) {
            $assignments[] = '`' . $field . '` = ?';
            $parameters[] = $value;
        }
        $parameters[] = $userId;
        try {
            $db->prepare(
                'UPDATE awik_users SET ' . implode(', ', $assignments)
                . ', updatedAt = ' . awikCurrentTimestampSql($db) . ' WHERE id = ?'
            )->execute($parameters);
        } catch (PDOException $exception) {
            if (awikUserDuplicateConflict($exception)) {
                throw new AwikApiException(409, 'Email already in use');
            }
            throw $exception;
        }
        $updatedStatement = $db->prepare('SELECT id, phone, email, firstName, lastName, role, status, updatedAt FROM awik_users WHERE id = ? LIMIT 1');
        $updatedStatement->execute([$userId]);
        $updated = $updatedStatement->fetch();
        awikWriteUserAudit($db, $actorId, 'UPDATE', $userId, [
            'role' => $targetUser['role'], 'status' => $targetUser['status'],
        ], $input);
        awikWriteUserHttpAudit($db, $actorId, 'UPDATE', $userId, $body, $ipAddress, awikHeaderValue($headers, 'User-Agent'));
        return awikResponse(200, ['success' => true, 'data' => awikNormalizeManagedUser($updated, false, true)]);
    }

    if ($method === 'DELETE' && !$passwordRoute) {
        if ($userId === $actorId) {
            throw new AwikApiException(400, 'You cannot deactivate your own account');
        }
        $now = awikCurrentTimestampSql($db);
        $db->prepare('UPDATE awik_users SET deletedAt = ' . $now . ', status = ?, updatedAt = ' . $now . ' WHERE id = ?')
            ->execute(['INACTIVE', $userId]);
        awikWriteUserAudit($db, $actorId, 'DELETE', $userId, null, null);
        awikWriteUserHttpAudit($db, $actorId, 'DELETE', $userId, $body, $ipAddress, awikHeaderValue($headers, 'User-Agent'));
        return awikResponse(200, ['success' => true, 'data' => ['message' => 'User deactivated successfully']]);
    }

    return awikJsonError(404, 'Not Found', null, $responsePath);
}

function awikSubscriptionRelationSelect(bool $fullCustomer, bool $fullPlan): string
{
    $customerFields = $fullCustomer
        ? ['id', 'phone', 'email', 'whatsappNumber', 'firstName', 'lastName', 'address', 'area', 'city', 'location', 'latitude', 'longitude', 'notes', 'status', 'createdAt', 'updatedAt', 'deletedAt']
        : ['id', 'firstName', 'lastName', 'phone', 'status'];
    $planFields = $fullPlan
        ? ['id', 'name', 'description', 'speed', 'durationDays', 'price', 'currency', 'isActive', 'createdAt', 'updatedAt', 'deletedAt']
        : ['id', 'name', 'speed', 'price', 'durationDays', 'currency'];
    $select = ['s.*'];
    foreach ($customerFields as $field) {
        $select[] = 'c.`' . $field . '` AS `customer__' . $field . '`';
    }
    foreach ($planFields as $field) {
        $select[] = 'p.`' . $field . '` AS `plan__' . $field . '`';
    }
    return 'SELECT ' . implode(', ', $select)
        . ' FROM awik_subscriptions s '
        . 'LEFT JOIN awik_customers c ON c.id = s.customerId '
        . 'LEFT JOIN awik_plans p ON p.id = s.planId';
}

function awikNormalizeSubscriptionJoinedRow(array $row, bool $fullCustomer, bool $fullPlan, array $reminders = [], bool $includeReminders = false): array
{
    $customerFields = $fullCustomer
        ? ['id', 'phone', 'email', 'whatsappNumber', 'firstName', 'lastName', 'address', 'area', 'city', 'location', 'latitude', 'longitude', 'notes', 'status', 'createdAt', 'updatedAt', 'deletedAt']
        : ['id', 'firstName', 'lastName', 'phone', 'status'];
    $planFields = $fullPlan
        ? ['id', 'name', 'description', 'speed', 'durationDays', 'price', 'currency', 'isActive', 'createdAt', 'updatedAt', 'deletedAt']
        : ['id', 'name', 'speed', 'price', 'durationDays', 'currency'];

    $customer = null;
    if (($row['customer__id'] ?? null) !== null) {
        $customerRow = [];
        foreach ($customerFields as $field) {
            $customerRow[$field] = $row['customer__' . $field] ?? null;
        }
        $customer = $fullCustomer ? awikNormalizeCustomer($customerRow) : $customerRow;
    }

    $plan = null;
    if (($row['plan__id'] ?? null) !== null) {
        $planRow = [];
        foreach ($planFields as $field) {
            $planRow[$field] = $row['plan__' . $field] ?? null;
        }
        if ($fullPlan) {
            $plan = awikNormalizePlan($planRow);
        } else {
            $plan = [
                'id' => $planRow['id'],
                'name' => $planRow['name'],
                'speed' => $planRow['speed'],
                'price' => (string) $planRow['price'],
                'durationDays' => (int) $planRow['durationDays'],
                'currency' => $planRow['currency'],
            ];
        }
    }

    return awikNormalizeSubscription($row, $customer, $plan, $reminders, $includeReminders);
}

function awikFetchSubscription(PDO $db, string $subscriptionId, bool $includeReminders = false, bool $forUpdate = false): ?array
{
    $sql = awikSubscriptionRelationSelect(true, true)
        . ' WHERE s.id = ? AND s.deletedAt IS NULL LIMIT 1'
        . ($forUpdate ? ' FOR UPDATE' : '');
    $statement = $db->prepare($sql);
    $statement->execute([$subscriptionId]);
    $row = $statement->fetch();
    if (!$row) {
        return null;
    }

    $reminders = [];
    if ($includeReminders) {
        $reminderStatement = $db->prepare(
            'SELECT * FROM awik_whatsapp_reminders WHERE subscriptionId = ? ORDER BY scheduledFor ASC'
        );
        $reminderStatement->execute([$subscriptionId]);
        foreach ($reminderStatement->fetchAll() as $reminder) {
            $toIsoDate = static function (?string $value): ?string {
                if ($value === null || $value === '') {
                    return null;
                }
                return (new DateTimeImmutable($value, new DateTimeZone('UTC')))
                    ->setTimezone(new DateTimeZone('UTC'))
                    ->format('Y-m-d\TH:i:s.v\Z');
            };
            $reminders[] = [
                'id' => $reminder['id'],
                'subscriptionId' => $reminder['subscriptionId'],
                'customerId' => $reminder['customerId'],
                'reminderType' => $reminder['reminderType'],
                'scheduledFor' => $toIsoDate($reminder['scheduledFor']),
                'sentAt' => $toIsoDate($reminder['sentAt']),
                'status' => $reminder['status'],
                'errorMessage' => $reminder['errorMessage'],
                'createdAt' => $toIsoDate($reminder['createdAt']),
            ];
        }
    }
    return awikNormalizeSubscriptionJoinedRow($row, true, true, $reminders, $includeReminders);
}

function awikWriteSubscriptionAudit(PDO $db, string $userId, string $action, string $subscriptionId, ?array $oldValues = null, ?array $newValues = null): void
{
    try {
        $db->prepare(
            'INSERT INTO awik_audit_logs (id, userId, action, entity, entityId, oldValues, newValues, ipAddress, userAgent, createdAt) '
            . 'VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ' . awikCurrentTimestampSql($db) . ')'
        )->execute([
            awikUuidV4(),
            $userId,
            $action,
            'Subscription',
            $subscriptionId,
            $oldValues === null ? null : json_encode($oldValues, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
            $newValues === null ? null : json_encode($newValues, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
        ]);
    } catch (Throwable) {
        // Preserve the source best-effort audit behavior.
    }
}

function awikWriteSubscriptionHttpAudit(PDO $db, string $userId, string $action, ?string $subscriptionId, array $body, ?string $ipAddress, string $userAgent): void
{
    try {
        $safeBody = awikRedactPlanAuditValue($body);
        $newValues = $safeBody !== [] ? json_encode($safeBody, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) : null;
        $db->prepare(
            'INSERT INTO awik_audit_logs (id, userId, action, entity, entityId, oldValues, newValues, ipAddress, userAgent, createdAt) '
            . 'VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ' . awikCurrentTimestampSql($db) . ')'
        )->execute([
            awikUuidV4(),
            $userId,
            $action,
            'Subscriptions',
            $subscriptionId,
            $newValues,
            awikNormalizeClientIp($ipAddress),
            $userAgent !== '' ? $userAgent : null,
        ]);
    } catch (Throwable) {
        // The source HTTP audit interceptor is best effort.
    }
}

function awikRefreshSubscriptionStatuses(PDO $db, ?int $warningDays = null): array
{
    $warningDays ??= awikExpiryWarningDays($db);
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $nowSql = $now->format('Y-m-d H:i:s.v');
    $thresholdSql = $now->modify('+' . $warningDays . ' days')->format('Y-m-d H:i:s.v');

    $db->beginTransaction();
    try {
        $countExpired = $db->prepare("SELECT COUNT(*) FROM awik_subscriptions WHERE deletedAt IS NULL AND status <> 'SUSPENDED' AND expiryDate < ?");
        $countExpired->execute([$nowSql]);
        $expired = (int) $countExpired->fetchColumn();
        $countSoon = $db->prepare("SELECT COUNT(*) FROM awik_subscriptions WHERE deletedAt IS NULL AND status <> 'SUSPENDED' AND expiryDate >= ? AND expiryDate <= ?");
        $countSoon->execute([$nowSql, $thresholdSql]);
        $expiringSoon = (int) $countSoon->fetchColumn();
        $countActive = $db->prepare("SELECT COUNT(*) FROM awik_subscriptions WHERE deletedAt IS NULL AND status <> 'SUSPENDED' AND expiryDate > ?");
        $countActive->execute([$thresholdSql]);
        $active = (int) $countActive->fetchColumn();

        $db->prepare("UPDATE awik_subscriptions SET status = 'EXPIRED', updatedAt = ? WHERE deletedAt IS NULL AND status <> 'SUSPENDED' AND expiryDate < ?")
            ->execute([$nowSql, $nowSql]);
        $db->prepare("UPDATE awik_subscriptions SET status = 'EXPIRING_SOON', updatedAt = ? WHERE deletedAt IS NULL AND status <> 'SUSPENDED' AND expiryDate >= ? AND expiryDate <= ?")
            ->execute([$nowSql, $nowSql, $thresholdSql]);
        $db->prepare("UPDATE awik_subscriptions SET status = 'ACTIVE', updatedAt = ? WHERE deletedAt IS NULL AND status <> 'SUSPENDED' AND expiryDate > ?")
            ->execute([$nowSql, $thresholdSql]);
        $db->commit();
        return ['expired' => $expired, 'expiringSoon' => $expiringSoon, 'active' => $active];
    } catch (Throwable) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw new AwikApiException(503, 'Subscription status refresh failed');
    }
}

function awikHandleSubscriptionRequest(PDO $db, string $method, string $path, array $query, array $body, array $headers, string $responsePath, ?string $ipAddress): ?array
{
    $basePath = '/api/v1/subscriptions';
    $routePath = rtrim($path, '/') ?: '/';
    if ($routePath !== $basePath && !str_starts_with($routePath, $basePath . '/')) {
        return null;
    }
    $isRefresh = $method === 'GET' && $routePath === $basePath . '/stats/refresh';
    $isIdRoute = preg_match('~^' . preg_quote($basePath, '~') . '/([^/]+)$~', $routePath, $routeMatches) === 1;
    $isActionRoute = preg_match('~^' . preg_quote($basePath, '~') . '/([^/]+)/(renew|suspend|activate|cancel)$~', $routePath, $actionMatches) === 1;
    if (!(($routePath === $basePath && in_array($method, ['GET', 'POST'], true))
        || $isRefresh || ($isIdRoute && in_array($method, ['GET', 'PATCH'], true))
        || ($isActionRoute && $method === 'POST'))) {
        return awikJsonError(404, 'Not Found', null, $responsePath);
    }

    $user = awikRequireAuthenticatedUser($db, $headers);
    if (!in_array($user['role'] ?? null, ['ADMIN', 'STAFF'], true)) {
        throw new AwikApiException(403, 'Forbidden');
    }
    $userId = (string) $user['id'];

    if ($isRefresh) {
        if (($user['role'] ?? null) !== 'ADMIN') {
            throw new AwikApiException(403, 'Forbidden');
        }
        return awikResponse(200, ['success' => true, 'data' => awikRefreshSubscriptionStatuses($db)]);
    }

    if ($method === 'GET' && $routePath === $basePath) {
        $filters = awikValidateSubscriptionQuery($query);
        $where = ['s.deletedAt IS NULL'];
        $parameters = [];
        if ($filters['search'] !== null && $filters['search'] !== '') {
            $where[] = '(LOCATE(?, c.phone) > 0 OR LOCATE(LOWER(?), LOWER(c.firstName)) > 0 OR LOCATE(LOWER(?), LOWER(c.lastName)) > 0)';
            array_push($parameters, $filters['search'], $filters['search'], $filters['search']);
        }
        foreach (['status' => 's.status', 'planId' => 's.planId', 'customerId' => 's.customerId'] as $field => $column) {
            if ($filters[$field] !== null) {
                $where[] = $column . ' = ?';
                $parameters[] = $filters[$field];
            }
        }
        if (in_array($filters['expiringSoon'], ['true', '1'], true)) {
            $warningDays = awikExpiryWarningDays($db);
            $where[] = "s.status = 'ACTIVE'";
            $where[] = 's.expiryDate <= ?';
            $parameters[] = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
                ->modify('+' . $warningDays . ' days')->format('Y-m-d H:i:s.v');
        }
        $whereSql = implode(' AND ', $where);
        $sortFields = ['startDate', 'expiryDate', 'status', 'createdAt', 'updatedAt'];
        $sortBy = in_array($filters['sortBy'], $sortFields, true) ? $filters['sortBy'] : 'expiryDate';
        $orderBy = 's.`' . $sortBy . '` ' . strtoupper($filters['sortOrder']);
        $db->beginTransaction();
        try {
            $count = $db->prepare('SELECT COUNT(*) FROM awik_subscriptions s INNER JOIN awik_customers c ON c.id = s.customerId WHERE ' . $whereSql);
            $count->execute($parameters);
            $total = (int) $count->fetchColumn();
            $statement = $db->prepare(
                awikSubscriptionRelationSelect(false, false) . ' WHERE ' . $whereSql
                . ' ORDER BY ' . $orderBy . ' LIMIT ? OFFSET ?'
            );
            $index = 1;
            foreach ($parameters as $parameter) {
                $statement->bindValue($index++, $parameter);
            }
            $statement->bindValue($index++, $filters['limit'], PDO::PARAM_INT);
            $statement->bindValue($index, ($filters['page'] - 1) * $filters['limit'], PDO::PARAM_INT);
            $statement->execute();
            $rows = $statement->fetchAll();
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
        return awikResponse(200, ['success' => true, 'data' => [
            'data' => array_map(static fn (array $row): array => awikNormalizeSubscriptionJoinedRow($row, false, false), $rows),
            'total' => $total,
            'page' => $filters['page'],
            'limit' => $filters['limit'],
        ]]);
    }

    if ($method === 'POST' && $routePath === $basePath) {
        $input = awikValidateSubscriptionInput($body, 'create');
        $customer = $db->prepare('SELECT id FROM awik_customers WHERE id = ? AND deletedAt IS NULL LIMIT 1');
        $customer->execute([$input['customerId']]);
        if (!$customer->fetch()) {
            throw new AwikApiException(404, 'Customer not found');
        }
        $planStatement = $db->prepare('SELECT * FROM awik_plans WHERE id = ? AND deletedAt IS NULL AND isActive = 1 LIMIT 1');
        $planStatement->execute([$input['planId']]);
        $plan = $planStatement->fetch();
        if (!$plan) {
            throw new AwikApiException(404, 'Plan not found');
        }
        $startDate = isset($input['startDate'])
            ? awikParseUtcDate($input['startDate'])
            : new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $durationDays = $input['durationDays'] ?? (int) $plan['durationDays'];
        $expiryDate = $startDate->modify('+' . $durationDays . ' days');
        $status = awikComputeSubscriptionStatus($expiryDate, awikExpiryWarningDays($db));
        $subscriptionId = awikUuidV4();
        $db->prepare(
            'INSERT INTO awik_subscriptions (id, customerId, planId, startDate, expiryDate, status, paymentStatus, notes, lastRenewalDate) '
            . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $subscriptionId, $input['customerId'], $input['planId'], $startDate->format('Y-m-d H:i:s.v'),
            $expiryDate->format('Y-m-d H:i:s.v'), $status, $input['paymentStatus'] ?? 'paid',
            $input['notes'] ?? null, $startDate->format('Y-m-d H:i:s.v'),
        ]);
        $created = awikFetchSubscription($db, $subscriptionId);
        awikWriteSubscriptionAudit($db, $userId, 'CREATE', $subscriptionId, null, [
            'customerId' => $input['customerId'], 'planId' => $input['planId'], 'expiryDate' => $expiryDate->format(DATE_ATOM),
        ]);
        awikWriteSubscriptionHttpAudit($db, $userId, 'CREATE', $subscriptionId, $body, $ipAddress, awikHeaderValue($headers, 'User-Agent'));
        return awikResponse(201, ['success' => true, 'data' => $created]);
    }

    if ($isIdRoute && $method === 'GET') {
        $subscription = awikFetchSubscription($db, rawurldecode($routeMatches[1]), true);
        if (!$subscription) {
            throw new AwikApiException(404, 'Subscription not found');
        }
        return awikResponse(200, ['success' => true, 'data' => $subscription]);
    }

    if ($isIdRoute && $method === 'PATCH') {
        $subscriptionId = rawurldecode($routeMatches[1]);
        $input = awikValidateSubscriptionInput($body, 'update');
        $db->beginTransaction();
        try {
            $current = $db->prepare('SELECT * FROM awik_subscriptions WHERE id = ? AND deletedAt IS NULL LIMIT 1 FOR UPDATE');
            $current->execute([$subscriptionId]);
            $subscription = $current->fetch();
            if (!$subscription) {
                throw new AwikApiException(404, 'Subscription not found');
            }
            if (!empty($input['planId'])) {
                $planCheck = $db->prepare('SELECT id FROM awik_plans WHERE id = ? AND deletedAt IS NULL LIMIT 1');
                $planCheck->execute([$input['planId']]);
                if (!$planCheck->fetch()) {
                    throw new AwikApiException(404, 'Plan not found');
                }
            }
            $updateFields = [];
            foreach (['planId', 'startDate', 'expiryDate', 'paymentStatus', 'notes'] as $field) {
                if (!array_key_exists($field, $input)) {
                    continue;
                }
                $updateFields[$field] = in_array($field, ['startDate', 'expiryDate'], true) && $input[$field] !== null
                    ? awikParseUtcDate($input[$field])->format('Y-m-d H:i:s.v')
                    : $input[$field];
            }
            if (isset($input['startDate']) || isset($input['expiryDate'])) {
                $nextExpiry = isset($input['expiryDate']) ? awikParseUtcDate($input['expiryDate']) : awikParseUtcDate($subscription['expiryDate']);
                $updateFields['status'] = awikComputeSubscriptionStatus($nextExpiry, awikExpiryWarningDays($db));
            }
            if ($updateFields !== []) {
                $assignments = [];
                $values = [];
                foreach ($updateFields as $field => $value) {
                    $assignments[] = '`' . $field . '` = ?';
                    $values[] = $value;
                }
                $values[] = $subscriptionId;
                $db->prepare('UPDATE awik_subscriptions SET ' . implode(', ', $assignments) . ', updatedAt = ' . awikCurrentTimestampSql($db) . ' WHERE id = ?')->execute($values);
            }
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
        $updated = awikFetchSubscription($db, $subscriptionId);
        awikWriteSubscriptionAudit($db, $userId, 'UPDATE', $subscriptionId, null, $input);
        awikWriteSubscriptionHttpAudit($db, $userId, 'UPDATE', $subscriptionId, $body, $ipAddress, awikHeaderValue($headers, 'User-Agent'));
        return awikResponse(200, ['success' => true, 'data' => $updated]);
    }

    if ($isActionRoute) {
        $subscriptionId = rawurldecode($actionMatches[1]);
        $action = $actionMatches[2];
        if ($action === 'renew') {
            $input = awikValidateSubscriptionInput($body, 'renew');
            $db->beginTransaction();
            try {
                $currentStatement = $db->prepare('SELECT * FROM awik_subscriptions WHERE id = ? AND deletedAt IS NULL LIMIT 1 FOR UPDATE');
                $currentStatement->execute([$subscriptionId]);
                $current = $currentStatement->fetch();
                if (!$current) {
                    throw new AwikApiException(404, 'Subscription not found');
                }
                $targetPlanId = $input['planId'] ?? $current['planId'];
                $planStatement = $db->prepare('SELECT * FROM awik_plans WHERE id = ? AND deletedAt IS NULL LIMIT 1');
                $planStatement->execute([$targetPlanId]);
                $targetPlan = $planStatement->fetch();
                if (!$targetPlan || (isset($input['planId']) && !(bool) $targetPlan['isActive'])) {
                    throw new AwikApiException(404, 'Plan not found');
                }
                $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
                $previousExpiry = awikParseUtcDate($current['expiryDate']);
                $startDate = $previousExpiry > $now ? $previousExpiry : $now;
                $durationDays = $input['durationDays'] ?? (int) $targetPlan['durationDays'];
                $expiryDate = $startDate->modify('+' . $durationDays . ' days');
                $newStatus = awikComputeSubscriptionStatus($expiryDate, awikExpiryWarningDays($db));

                $db->prepare('DELETE FROM awik_whatsapp_reminders WHERE subscriptionId = ?')->execute([$subscriptionId]);
                $db->prepare(
                    'INSERT INTO awik_subscription_renewals (id, subscriptionId, userId, previousPlanId, newPlanId, previousExpiryDate, newExpiryDate, durationDays) '
                    . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                )->execute([
                    awikUuidV4(), $subscriptionId, $userId, $current['planId'], $targetPlanId,
                    $previousExpiry->format('Y-m-d H:i:s.v'), $expiryDate->format('Y-m-d H:i:s.v'), $durationDays,
                ]);
                $db->prepare(
                    'UPDATE awik_subscriptions SET planId = ?, startDate = ?, expiryDate = ?, status = ?, paymentStatus = ?, lastRenewalDate = ?, updatedAt = '
                    . awikCurrentTimestampSql($db) . ' WHERE id = ?'
                )->execute([
                    $targetPlanId, $startDate->format('Y-m-d H:i:s.v'), $expiryDate->format('Y-m-d H:i:s.v'),
                    $newStatus, 'paid', $startDate->format('Y-m-d H:i:s.v'), $subscriptionId,
                ]);
                $db->commit();
            } catch (Throwable $exception) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                throw $exception;
            }
            $updated = awikFetchSubscription($db, $subscriptionId);
            awikWriteSubscriptionAudit($db, $userId, 'SUBSCRIPTION_RENEWAL', $subscriptionId, [
                'status' => $current['status'], 'planId' => $current['planId'], 'expiryDate' => $current['expiryDate'],
            ], ['planId' => $targetPlanId, 'expiryDate' => $expiryDate->format(DATE_ATOM), 'durationDays' => $durationDays]);
            awikWriteSubscriptionHttpAudit($db, $userId, 'CREATE', $subscriptionId, $body, $ipAddress, awikHeaderValue($headers, 'User-Agent'));
            return awikResponse(200, ['success' => true, 'data' => $updated]);
        }

        $currentStatement = $db->prepare('SELECT * FROM awik_subscriptions WHERE id = ? AND deletedAt IS NULL LIMIT 1');
        $currentStatement->execute([$subscriptionId]);
        $current = $currentStatement->fetch();
        if (!$current) {
            throw new AwikApiException(404, 'Subscription not found');
        }
        if ($action === 'suspend') {
            $db->prepare('UPDATE awik_subscriptions SET status = ?, updatedAt = ' . awikCurrentTimestampSql($db) . ' WHERE id = ?')->execute(['SUSPENDED', $subscriptionId]);
            awikWriteSubscriptionAudit($db, $userId, 'SUBSCRIPTION_SUSPEND', $subscriptionId, null, null);
        } elseif ($action === 'activate') {
            $status = awikComputeSubscriptionStatus(awikParseUtcDate($current['expiryDate']), awikExpiryWarningDays($db));
            $db->prepare('UPDATE awik_subscriptions SET status = ?, updatedAt = ' . awikCurrentTimestampSql($db) . ' WHERE id = ?')->execute([$status, $subscriptionId]);
            awikWriteSubscriptionAudit($db, $userId, 'UPDATE', $subscriptionId, null, null);
        } elseif ($action === 'cancel') {
            $now = awikCurrentTimestampSql($db);
            $db->prepare('UPDATE awik_subscriptions SET deletedAt = ' . $now . ', updatedAt = ' . $now . ' WHERE id = ?')->execute([$subscriptionId]);
            awikWriteSubscriptionAudit($db, $userId, 'DELETE', $subscriptionId, null, null);
            awikWriteSubscriptionHttpAudit($db, $userId, 'DELETE', $subscriptionId, $body, $ipAddress, awikHeaderValue($headers, 'User-Agent'));
            return awikResponse(200, ['success' => true, 'data' => ['message' => 'Subscription cancelled successfully']]);
        }
        awikWriteSubscriptionHttpAudit($db, $userId, 'POST', $subscriptionId, $body, $ipAddress, awikHeaderValue($headers, 'User-Agent'));
        return awikResponse(200, ['success' => true, 'data' => awikFetchSubscription($db, $subscriptionId)]);
    }

    return awikJsonError(404, 'Not Found', null, $responsePath);
}

function awikValidateInventoryCategoryInput(array $body, bool $create): array
{
    $allowed = ['name', 'description'];
    $errors = [];
    foreach (array_keys($body) as $field) {
        if (!in_array($field, $allowed, true)) {
            $errors[] = 'property ' . (string) $field . ' should not exist';
        }
    }
    foreach (['name'] as $field) {
        if ($create && !array_key_exists($field, $body)) {
            $errors[] = $field . ' should not be empty';
            continue;
        }
        if (!array_key_exists($field, $body)) {
            continue;
        }
        if (!is_string($body[$field])) {
            $errors[] = $field . ' must be a string';
        } elseif ($body[$field] === '') {
            $errors[] = $field . ' should not be empty';
        }
    }
    if (array_key_exists('description', $body) && $body['description'] !== null && !is_string($body['description'])) {
        $errors[] = 'description must be a string';
    }
    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }
    $result = [];
    foreach (['name', 'description'] as $field) {
        if (array_key_exists($field, $body)) {
            $value = $body[$field];
            if (is_string($value)) {
                $value = awikSanitizePlanString($value);
            }
            $result[$field] = $value;
        }
    }
    return $result;
}

function awikNormalizeInventoryCategory(array $category): array
{
    $createdAt = $category['createdAt'] ?? null;
    return [
        'id' => $category['id'] ?? null,
        'name' => $category['name'] ?? null,
        'description' => $category['description'] ?? null,
        'createdAt' => $createdAt === null || $createdAt === '' ? null : (new DateTimeImmutable($createdAt, new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z'),
        '_count' => ['products' => (int) ($category['_count']['products'] ?? 0)],
    ];
}

function awikValidateProductInput(array $body, bool $create): array
{
    $allowed = ['name', 'sku', 'barcode', 'categoryId', 'description', 'imageUrl', 'purchasePrice', 'sellingPrice', 'currency', 'initialStock', 'initialStockNote', 'minStock', 'unit', 'isActive'];
    $errors = [];
    foreach (array_keys($body) as $field) {
        if (!in_array($field, $allowed, true)) {
            $errors[] = 'property ' . (string) $field . ' should not exist';
        }
    }
    foreach (['name', 'sku', 'categoryId'] as $field) {
        if ($create && !array_key_exists($field, $body)) {
            $errors[] = $field . ' should not be empty';
            continue;
        }
        if (!array_key_exists($field, $body) || $body[$field] === null) {
            continue;
        }
        if (!is_string($body[$field])) {
            $errors[] = $field . ' must be a string';
        } elseif ($body[$field] === '') {
            $errors[] = $field . ' should not be empty';
        }
    }
    if (array_key_exists('sku', $body) && is_string($body['sku']) && preg_match('/^[A-Za-z0-9\-_]+$/', $body['sku']) !== 1) {
        $errors[] = 'SKU can only contain letters, numbers, dashes and underscores';
    }
    foreach (['purchasePrice', 'sellingPrice'] as $field) {
        if (!array_key_exists($field, $body) || $body[$field] === null) {
            continue;
        }
        if (!is_numeric($body[$field])) {
            $errors[] = $field . ' must be a number conforming to the specified constraints';
        } elseif ((float) $body[$field] < 0) {
            $errors[] = $field . ' must not be less than 0';
        }
    }
    foreach (['initialStock', 'minStock'] as $field) {
        if (!array_key_exists($field, $body) || $body[$field] === null) {
            continue;
        }
        if (!is_int($body[$field]) && !is_numeric($body[$field])) {
            $errors[] = $field . ' must be an integer number';
        } elseif ((float) $body[$field] < 0) {
            $errors[] = $field . ' must not be less than 0';
        }
    }
    if (array_key_exists('currency', $body) && $body['currency'] !== null && !is_string($body['currency'])) {
        $errors[] = 'currency must be a string';
    }
    if (array_key_exists('isActive', $body) && $body['isActive'] !== null && !is_bool($body['isActive'])) {
        $errors[] = 'isActive must be a boolean value';
    }
    foreach (['barcode', 'description', 'imageUrl', 'initialStockNote', 'unit'] as $field) {
        if (array_key_exists($field, $body) && $body[$field] !== null && !is_string($body[$field])) {
            $errors[] = $field . ' must be a string';
        }
    }
    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }
    $result = [];
    foreach ($allowed as $field) {
        if (array_key_exists($field, $body)) {
            $value = $body[$field];
            if (is_string($value)) {
                $value = awikSanitizePlanString($value);
            }
            if (in_array($field, ['initialStock', 'minStock'], true) && $value !== null) {
                $value = (int) $value;
            }
            $result[$field] = $value;
        }
    }
    if ($create && !array_key_exists('currency', $result)) {
        $result['currency'] = 'USD';
    }
    if ($create && !array_key_exists('initialStock', $result)) {
        $result['initialStock'] = 0;
    }
    if ($create && !array_key_exists('minStock', $result)) {
        $result['minStock'] = 0;
    }
    if ($create && !array_key_exists('unit', $result)) {
        $result['unit'] = 'piece';
    }
    if ($create && !array_key_exists('isActive', $result)) {
        $result['isActive'] = true;
    }
    return $result;
}

function awikValidateProductQuery(array $query): array
{
    $allowed = ['page', 'limit', 'search', 'sortBy', 'sortOrder', 'categoryId', 'lowStock', 'isActive'];
    $errors = [];
    foreach (array_keys($query) as $field) {
        if (!in_array($field, $allowed, true)) {
            $errors[] = 'property ' . (string) $field . ' should not exist';
        }
    }
    $page = $query['page'] ?? '1';
    $limit = $query['limit'] ?? '20';
    foreach (['page' => $page, 'limit' => $limit] as $field => $value) {
        if (!is_scalar($value) || filter_var((string) $value, FILTER_VALIDATE_INT) === false) {
            $errors[] = $field . ' must be an integer number';
            continue;
        }
        if ((int) $value < 1) {
            $errors[] = $field . ' must not be less than 1';
        }
        if ($field === 'limit' && (int) $value > 100) {
            $errors[] = 'limit must not be greater than 100';
        }
    }
    foreach (['search', 'sortBy', 'sortOrder', 'categoryId', 'lowStock', 'isActive'] as $field) {
        if (isset($query[$field]) && !is_string($query[$field])) {
            $errors[] = $field . ' must be a string';
        }
    }
    if (!in_array($query['sortOrder'] ?? 'desc', ['asc', 'desc'], true)) {
        $errors[] = 'sortOrder must be one of the following values: asc, desc';
    }
    if (($query['lowStock'] ?? null) !== null && !in_array($query['lowStock'], ['true', 'false'], true)) {
        $errors[] = 'lowStock must be one of the following values: true, false';
    }
    if (($query['isActive'] ?? null) !== null && !in_array($query['isActive'], ['true', 'false'], true)) {
        $errors[] = 'isActive must be one of the following values: true, false';
    }
    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }
    $sortFields = ['name', 'sku', 'barcode', 'purchasePrice', 'sellingPrice', 'currentStock', 'minStock', 'createdAt', 'updatedAt'];
    $sortBy = $query['sortBy'] ?? 'createdAt';
    return [
        'page' => (int) $page,
        'limit' => (int) $limit,
        'search' => isset($query['search']) ? awikSanitizePlanString($query['search']) : null,
        'categoryId' => $query['categoryId'] ?? null,
        'lowStock' => $query['lowStock'] ?? null,
        'isActive' => array_key_exists('isActive', $query) ? ($query['isActive'] === 'true' ? 1 : 0) : null,
        'sortBy' => in_array($sortBy, $sortFields, true) ? $sortBy : 'createdAt',
        'sortOrder' => $query['sortOrder'] ?? 'desc',
    ];
}

function awikNormalizeProduct(array $product, ?array $category = null): array
{
    $toIso = static function (?string $value): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        return (new DateTimeImmutable($value, new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
    };
    return [
        'id' => $product['id'] ?? null,
        'name' => $product['name'] ?? null,
        'sku' => $product['sku'] ?? null,
        'barcode' => $product['barcode'] ?? null,
        'categoryId' => $product['categoryId'] ?? null,
        'description' => $product['description'] ?? null,
        'imageUrl' => $product['imageUrl'] ?? null,
        'purchasePrice' => (string) ($product['purchasePrice'] ?? '0'),
        'sellingPrice' => (string) ($product['sellingPrice'] ?? '0'),
        'currency' => $product['currency'] ?? 'USD',
        'currentStock' => (int) ($product['currentStock'] ?? 0),
        'minStock' => (int) ($product['minStock'] ?? 0),
        'unit' => $product['unit'] ?? 'piece',
        'isActive' => (bool) ($product['isActive'] ?? true),
        'createdAt' => $toIso($product['createdAt'] ?? null),
        'updatedAt' => $toIso($product['updatedAt'] ?? null),
        'deletedAt' => $toIso($product['deletedAt'] ?? null),
        'category' => $category,
    ];
}

function awikValidateStockMovementInput(array $body): array
{
    $allowed = ['movementType', 'quantity', 'reference', 'notes'];
    $errors = [];
    foreach (array_keys($body) as $field) {
        if (!in_array($field, $allowed, true)) {
            $errors[] = 'property ' . (string) $field . ' should not exist';
        }
    }
    $movementType = $body['movementType'] ?? null;
    if (!is_string($movementType) || !in_array($movementType, ['PURCHASE', 'RETURN', 'ADJUSTMENT', 'DAMAGED', 'LOST', 'CORRECTION', 'SALE'], true)) {
        $errors[] = 'movementType must be one of the following values: PURCHASE, RETURN, ADJUSTMENT, DAMAGED, LOST, CORRECTION, SALE';
    }
    if (!array_key_exists('quantity', $body) || !is_numeric($body['quantity'])) {
        $errors[] = 'quantity must be a number conforming to the specified constraints';
    } else {
        $quantity = (float) $body['quantity'];
        if (in_array($movementType, ['ADJUSTMENT', 'CORRECTION'], true) && $quantity === 0.0) {
            $errors[] = 'quantity must not be 0';
        }
        if (!in_array($movementType, ['ADJUSTMENT', 'CORRECTION'], true) && $quantity <= 0) {
            $errors[] = 'quantity must be greater than 0';
        }
    }
    foreach (['reference', 'notes'] as $field) {
        if (array_key_exists($field, $body) && $body[$field] !== null && !is_string($body[$field])) {
            $errors[] = $field . ' must be a string';
        }
    }
    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }
    return [
        'movementType' => $movementType,
        'quantity' => (float) $body['quantity'],
        'reference' => array_key_exists('reference', $body) ? $body['reference'] : null,
        'notes' => array_key_exists('notes', $body) ? $body['notes'] : null,
    ];
}

function awikInventoryRouteMatches(string $method, string $path): ?array
{
    $routePath = rtrim($path, '/') ?: '/';
    $inventoryBases = ['/api/v1/inventory', '/api/v1/inventory-lifecycle'];
    foreach ($inventoryBases as $basePath) {
        if ($routePath === $basePath . '/stats' && $method === 'GET') {
            return ['kind' => 'inventory-stats', 'basePath' => $basePath];
        }
        if ($routePath === $basePath . '/summary' && $method === 'GET') {
            return ['kind' => 'inventory-summary', 'basePath' => $basePath];
        }
        if ($routePath === $basePath . '/categories' && $method === 'GET') {
            return ['kind' => 'category-list', 'basePath' => $basePath];
        }
        if ($routePath === $basePath . '/categories' && $method === 'POST') {
            return ['kind' => 'category-create', 'basePath' => $basePath];
        }
        if (preg_match('~^' . preg_quote($basePath, '~') . '/categories/([^/]+)$~', $routePath, $matches) === 1) {
            if ($method === 'PATCH') {
                return ['kind' => 'category-update', 'basePath' => $basePath, 'id' => rawurldecode($matches[1])];
            }
            if ($method === 'DELETE') {
                return ['kind' => 'category-delete', 'basePath' => $basePath, 'id' => rawurldecode($matches[1])];
            }
        }
        if ($routePath === $basePath . '/movements' && $method === 'GET') {
            return ['kind' => 'movement-list', 'basePath' => $basePath];
        }
    }

    $productBase = '/api/v1/products';
    if ($routePath === $productBase . '/lookup' && $method === 'GET') {
        return ['kind' => 'product-lookup'];
    }
    if ($routePath === $productBase . '/low-stock' && $method === 'GET') {
        return ['kind' => 'product-low-stock'];
    }
    if ($routePath === $productBase && $method === 'GET') {
        return ['kind' => 'product-list'];
    }
    if ($routePath === $productBase && $method === 'POST') {
        return ['kind' => 'product-create'];
    }
    if ($routePath === $productBase . '/import' && $method === 'POST') {
        return ['kind' => 'product-import'];
    }
    if (preg_match('~^' . preg_quote($productBase, '~') . '/([^/]+)$~', $routePath, $matches) === 1) {
        if ($method === 'GET') {
            return ['kind' => 'product-detail', 'id' => rawurldecode($matches[1])];
        }
        if ($method === 'PATCH') {
            return ['kind' => 'product-update', 'id' => rawurldecode($matches[1])];
        }
        if ($method === 'DELETE') {
            return ['kind' => 'product-delete', 'id' => rawurldecode($matches[1])];
        }
    }
    if (preg_match('~^' . preg_quote($productBase, '~') . '/([^/]+)/movements$~', $routePath, $matches) === 1) {
        if ($method === 'GET') {
            return ['kind' => 'product-movements', 'id' => rawurldecode($matches[1])];
        }
        if ($method === 'POST') {
            return ['kind' => 'product-movement-create', 'id' => rawurldecode($matches[1])];
        }
    }

    return null;
}

function awikNormalizeInventoryCategoryRow(array $row): array
{
    return [
        'id' => $row['id'] ?? null,
        'name' => $row['name'] ?? null,
        'description' => $row['description'] ?? null,
        'createdAt' => $row['createdAt'] ?? null,
        '_count' => ['products' => (int) ($row['productCount'] ?? 0)],
    ];
}

function awikNormalizeInventoryProductRow(array $row, ?array $category = null): array
{
    return [
        'id' => $row['id'] ?? null,
        'name' => $row['name'] ?? null,
        'sku' => $row['sku'] ?? null,
        'barcode' => $row['barcode'] ?? null,
        'categoryId' => $row['categoryId'] ?? null,
        'description' => $row['description'] ?? null,
        'imageUrl' => $row['imageUrl'] ?? null,
        'purchasePrice' => (string) ($row['purchasePrice'] ?? '0'),
        'sellingPrice' => (string) ($row['sellingPrice'] ?? '0'),
        'currency' => $row['currency'] ?? 'USD',
        'currentStock' => (int) ($row['currentStock'] ?? 0),
        'minStock' => (int) ($row['minStock'] ?? 0),
        'unit' => $row['unit'] ?? 'piece',
        'isActive' => (bool) (($row['isActive'] ?? 1) == 1),
        'createdAt' => $row['createdAt'] ?? null,
        'updatedAt' => $row['updatedAt'] ?? null,
        'deletedAt' => $row['deletedAt'] ?? null,
        'category' => $category,
    ];
}

function awikNormalizeInventoryMovementRow(array $row): array
{
    return [
        'id' => $row['id'] ?? null,
        'productId' => $row['productId'] ?? null,
        'userId' => $row['userId'] ?? null,
        'movementType' => $row['movementType'] ?? null,
        'quantity' => (int) ($row['quantity'] ?? 0),
        'previousStock' => (int) ($row['previousStock'] ?? 0),
        'newStock' => (int) ($row['newStock'] ?? 0),
        'reference' => $row['reference'] ?? null,
        'notes' => $row['notes'] ?? null,
        'createdAt' => $row['createdAt'] ?? null,
        'product' => [
            'id' => $row['productId'] ?? null,
            'name' => $row['productName'] ?? null,
            'sku' => $row['productSku'] ?? null,
            'barcode' => $row['productBarcode'] ?? null,
        ],
        'user' => [
            'id' => $row['userId'] ?? null,
            'firstName' => $row['userFirstName'] ?? null,
            'lastName' => $row['userLastName'] ?? null,
        ],
    ];
}

function awikMovementDelta(string $type, float $quantity): int
{
    switch ($type) {
        case 'PURCHASE':
        case 'RETURN':
            return (int) abs((int) round($quantity));
        case 'ADJUSTMENT':
        case 'CORRECTION':
            return (int) round($quantity);
        case 'DAMAGED':
        case 'LOST':
        case 'SALE':
            return -(int) abs((int) round($quantity));
        default:
            return -(int) abs((int) round($quantity));
    }
}

function awikHandleInventoryRequest(PDO $db, string $method, string $path, array $query, array $body, array $headers, string $responsePath, ?string $ipAddress): ?array
{
    $route = awikInventoryRouteMatches($method, $path);
    if ($route === null) {
        return null;
    }

    $user = awikRequireAuthenticatedUser($db, $headers);
    if (!in_array($user['role'] ?? null, ['ADMIN', 'STAFF'], true)) {
        throw new AwikApiException(403, 'Forbidden');
    }
    $isAdmin = ($user['role'] ?? null) === 'ADMIN';
    $basePath = $route['basePath'] ?? null;

    if ($route['kind'] === 'inventory-stats' && $method === 'GET') {
        $statement = $db->prepare(
            'SELECT COUNT(*) AS totalAssets, SUM(CASE WHEN currentStock > 0 THEN 1 ELSE 0 END) AS inUse, SUM(currentStock) AS available FROM awik_products WHERE deletedAt IS NULL'
        );
        $statement->execute();
        $row = $statement->fetch() ?: ['totalAssets' => 0, 'inUse' => 0, 'available' => 0];
        return awikResponse(200, ['success' => true, 'data' => [
            'totalAssets' => (int) ($row['totalAssets'] ?? 0),
            'inUse' => (int) ($row['inUse'] ?? 0),
            'available' => (int) ($row['available'] ?? 0),
            'depreciatedValue' => 0,
        ]]);
    }

    if ($route['kind'] === 'inventory-summary' && $method === 'GET') {
        $summary = $db->query(
            'SELECT COUNT(*) AS totalProducts, SUM(currentStock) AS totalStock, SUM(purchasePrice * currentStock) AS totalValue FROM awik_products WHERE deletedAt IS NULL'
        )->fetch();
        $lowStock = $db->query('SELECT COUNT(*) AS lowStock FROM awik_products WHERE deletedAt IS NULL AND currentStock <= minStock')->fetch();
        $outOfStock = $db->query('SELECT COUNT(*) AS outOfStock FROM awik_products WHERE deletedAt IS NULL AND currentStock = 0')->fetch();
        $categories = $db->query('SELECT COUNT(*) AS categories FROM awik_inventory_categories')->fetch();
        return awikResponse(200, ['success' => true, 'data' => [
            'totalProducts' => (int) ($summary['totalProducts'] ?? 0),
            'totalStock' => (int) ($summary['totalStock'] ?? 0),
            'totalValue' => (string) ($summary['totalValue'] ?? '0'),
            'lowStock' => (int) ($lowStock['lowStock'] ?? 0),
            'outOfStock' => (int) ($outOfStock['outOfStock'] ?? 0),
            'categories' => (int) ($categories['categories'] ?? 0),
        ]]);
    }

    if ($route['kind'] === 'category-list' && $method === 'GET') {
        $statement = $db->query(
            'SELECT c.id, c.name, c.description, c.createdAt, COUNT(p.id) AS productCount '
            . 'FROM awik_inventory_categories c '
            . 'LEFT JOIN awik_products p ON p.categoryId = c.id AND p.deletedAt IS NULL '
            . 'GROUP BY c.id, c.name, c.description, c.createdAt '
            . 'ORDER BY c.name ASC'
        );
        return awikResponse(200, ['success' => true, 'data' => array_map('awikNormalizeInventoryCategoryRow', $statement->fetchAll())]);
    }

    if ($route['kind'] === 'category-create' && $method === 'POST') {
        if (!$isAdmin) {
            throw new AwikApiException(403, 'Forbidden');
        }
        $input = awikValidateInventoryCategoryInput($body, true);
        $exists = $db->prepare('SELECT id FROM awik_inventory_categories WHERE name = ? LIMIT 1');
        $exists->execute([$input['name']]);
        if ($exists->fetch()) {
            throw new AwikApiException(409, 'Category already exists');
        }
        $id = awikUuidV4();
        $db->prepare('INSERT INTO awik_inventory_categories (id, name, description) VALUES (?, ?, ?)')->execute([$id, $input['name'], $input['description'] ?? null]);
        $row = $db->prepare('SELECT id, name, description, createdAt FROM awik_inventory_categories WHERE id = ? LIMIT 1');
        $row->execute([$id]);
        return awikResponse(201, ['success' => true, 'data' => awikNormalizeInventoryCategoryRow($row->fetch() ?: ['id' => $id, 'name' => $input['name'], 'description' => $input['description'] ?? null, 'createdAt' => null])]);
    }

    if ($route['kind'] === 'category-update' && $method === 'PATCH') {
        if (!$isAdmin) {
            throw new AwikApiException(403, 'Forbidden');
        }
        $categoryId = $route['id'];
        $existing = $db->prepare('SELECT id, name, description FROM awik_inventory_categories WHERE id = ? LIMIT 1');
        $existing->execute([$categoryId]);
        $current = $existing->fetch();
        if (!$current) {
            throw new AwikApiException(404, 'Category not found');
        }
        $input = awikValidateInventoryCategoryInput($body, false);
        if (($input['name'] ?? null) !== null && $input['name'] !== $current['name']) {
            $duplicate = $db->prepare('SELECT id FROM awik_inventory_categories WHERE name = ? AND id != ? LIMIT 1');
            $duplicate->execute([$input['name'], $categoryId]);
            if ($duplicate->fetch()) {
                throw new AwikApiException(409, 'Category already exists');
            }
        }
        $updates = [];
        $values = [];
        foreach (['name', 'description'] as $field) {
            if (array_key_exists($field, $input)) {
                $updates[] = '`' . $field . '` = ?';
                $values[] = $input[$field];
            }
        }
        if ($updates !== []) {
            $values[] = $categoryId;
            $db->prepare('UPDATE awik_inventory_categories SET ' . implode(', ', $updates) . ' WHERE id = ?')->execute($values);
        }
        $row = $db->prepare('SELECT id, name, description, createdAt FROM awik_inventory_categories WHERE id = ? LIMIT 1');
        $row->execute([$categoryId]);
        return awikResponse(200, ['success' => true, 'data' => awikNormalizeInventoryCategoryRow($row->fetch() ?: $current)]);
    }

    if ($route['kind'] === 'category-delete' && $method === 'DELETE') {
        if (!$isAdmin) {
            throw new AwikApiException(403, 'Forbidden');
        }
        $categoryId = $route['id'];
        $count = $db->prepare('SELECT COUNT(*) FROM awik_products WHERE categoryId = ? AND deletedAt IS NULL');
        $count->execute([$categoryId]);
        if ((int) $count->fetchColumn() > 0) {
            throw new AwikApiException(400, 'Cannot delete category: it still has product(s).');
        }
        $db->prepare('DELETE FROM awik_inventory_categories WHERE id = ?')->execute([$categoryId]);
        return awikResponse(200, ['success' => true, 'data' => ['message' => 'Category deleted successfully']]);
    }

    if ($route['kind'] === 'movement-list' && $method === 'GET') {
        $page = max(1, (int) ($query['page'] ?? 1));
        $limit = min(100, max(1, (int) ($query['limit'] ?? 20)));
        $where = [];
        $params = [];
        if (!empty($query['productId'])) {
            $where[] = 'sm.productId = ?';
            $params[] = $query['productId'];
        }
        if (!empty($query['movementType'])) {
            $where[] = 'sm.movementType = ?';
            $params[] = $query['movementType'];
        }
        if (!empty($query['search'])) {
            $where[] = '(sm.reference LIKE ? OR sm.notes LIKE ? OR p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)';
            $needle = '%' . (string) $query['search'] . '%';
            $params = array_merge($params, [$needle, $needle, $needle, $needle, $needle]);
        }
        if (!empty($query['dateFrom'])) {
            $where[] = 'sm.createdAt >= ?';
            $params[] = $query['dateFrom'];
        }
        if (!empty($query['dateTo'])) {
            $where[] = 'sm.createdAt <= ?';
            $params[] = $query['dateTo'];
        }
        $whereSql = $where !== [] ? ' WHERE ' . implode(' AND ', $where) : '';
        $countSql = 'SELECT COUNT(*) FROM awik_stock_movements sm LEFT JOIN awik_products p ON p.id = sm.productId LEFT JOIN awik_users u ON u.id = sm.userId' . $whereSql;
        $count = $db->prepare($countSql);
        $count->execute($params);
        $total = (int) $count->fetchColumn();
        $statement = $db->prepare(
            'SELECT sm.*, p.name AS productName, p.sku AS productSku, p.barcode AS productBarcode, u.firstName AS userFirstName, u.lastName AS userLastName '
            . 'FROM awik_stock_movements sm '
            . 'LEFT JOIN awik_products p ON p.id = sm.productId '
            . 'LEFT JOIN awik_users u ON u.id = sm.userId '
            . $whereSql
            . ' ORDER BY sm.createdAt DESC LIMIT ? OFFSET ?'
        );
        $index = 1;
        foreach ($params as $parameter) {
            $statement->bindValue($index++, $parameter);
        }
        $statement->bindValue($index++, $limit, PDO::PARAM_INT);
        $statement->bindValue($index, ($page - 1) * $limit, PDO::PARAM_INT);
        $statement->execute();
        return awikResponse(200, ['success' => true, 'data' => ['data' => array_map('awikNormalizeInventoryMovementRow', $statement->fetchAll()), 'total' => $total, 'page' => $page, 'limit' => $limit]]);
    }

    if ($route['kind'] === 'product-lookup' && $method === 'GET') {
        $queryText = trim((string) ($query['q'] ?? ''));
        if ($queryText === '') {
            throw new AwikApiException(400, 'Query parameter "q" is required');
        }
        $term = preg_replace('/[\r\n\t ]+/', '', $queryText);
        if ($term === '') {
            throw new AwikApiException(400, 'Query parameter "q" is required');
        }
        foreach (['barcode', 'sku', 'id'] as $field) {
            $statement = $db->prepare('SELECT p.*, c.name AS categoryName FROM awik_products p LEFT JOIN awik_inventory_categories c ON c.id = p.categoryId WHERE p.' . $field . ' = ? AND p.deletedAt IS NULL LIMIT 1');
            $statement->execute([$term]);
            $row = $statement->fetch();
            if ($row) {
                return awikResponse(200, ['success' => true, 'data' => awikNormalizeInventoryProductRow($row, ['id' => $row['categoryId'], 'name' => $row['categoryName']])]);
            }
        }
        $statement = $db->prepare('SELECT p.*, c.name AS categoryName FROM awik_products p LEFT JOIN awik_inventory_categories c ON c.id = p.categoryId WHERE p.name LIKE ? AND p.deletedAt IS NULL ORDER BY p.name ASC LIMIT 1');
        $statement->execute(['%' . $term . '%']);
        $row = $statement->fetch();
        if ($row) {
            return awikResponse(200, ['success' => true, 'data' => awikNormalizeInventoryProductRow($row, ['id' => $row['categoryId'], 'name' => $row['categoryName']])]);
        }
        return awikResponse(200, ['success' => true, 'data' => null]);
    }

    if ($route['kind'] === 'product-low-stock' && $method === 'GET') {
        $statement = $db->query('SELECT p.*, c.name AS categoryName FROM awik_products p LEFT JOIN awik_inventory_categories c ON c.id = p.categoryId WHERE p.deletedAt IS NULL AND p.currentStock <= p.minStock ORDER BY p.name ASC');
        $rows = $statement->fetchAll();
        return awikResponse(200, ['success' => true, 'data' => array_map(static fn (array $row): array => awikNormalizeInventoryProductRow($row, ['id' => $row['categoryId'], 'name' => $row['categoryName']]), $rows)]);
    }

    if ($route['kind'] === 'product-list' && $method === 'GET') {
        $filters = awikValidateProductQuery($query);
        $page = $filters['page'];
        $limit = $filters['limit'];
        $where = ['p.deletedAt IS NULL'];
        $params = [];
        if (!empty($query['search'])) {
            $where[] = '(LOWER(p.name) LIKE LOWER(?) OR LOWER(p.sku) LIKE LOWER(?) OR LOWER(p.barcode) LIKE LOWER(?))';
            $needle = '%' . $query['search'] . '%';
            $params = array_merge($params, [$needle, $needle, $needle]);
        }
        if (!empty($query['categoryId'])) {
            $where[] = 'p.categoryId = ?';
            $params[] = $query['categoryId'];
        }
        if ($filters['isActive'] !== null) {
            $where[] = 'p.isActive = ?';
            $params[] = (int) $filters['isActive'];
        }
        $whereSql = implode(' AND ', $where);
        if ($filters['lowStock'] === 'true') {
            $whereSql .= ' AND p.currentStock <= p.minStock';
        }
        $countStmt = $db->prepare('SELECT COUNT(*) FROM awik_products p WHERE ' . $whereSql);
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();
        $sortField = in_array($filters['sortBy'], ['name', 'sku', 'barcode', 'purchasePrice', 'sellingPrice', 'currentStock', 'minStock', 'createdAt', 'updatedAt'], true) ? $filters['sortBy'] : 'createdAt';
        $statement = $db->prepare(
            'SELECT p.*, c.name AS categoryName FROM awik_products p LEFT JOIN awik_inventory_categories c ON c.id = p.categoryId WHERE ' . $whereSql . ' ORDER BY p.' . $sortField . ' ' . strtoupper($filters['sortOrder']) . ' LIMIT ? OFFSET ?'
        );
        $index = 1;
        foreach ($params as $parameter) {
            $statement->bindValue($index++, $parameter);
        }
        $statement->bindValue($index++, $limit, PDO::PARAM_INT);
        $statement->bindValue($index, ($page - 1) * $limit, PDO::PARAM_INT);
        $statement->execute();
        $rows = $statement->fetchAll();
        return awikResponse(200, ['success' => true, 'data' => ['data' => array_map(static fn (array $row): array => awikNormalizeInventoryProductRow($row, ['id' => $row['categoryId'], 'name' => $row['categoryName']]), $rows), 'total' => $total, 'page' => $page, 'limit' => $limit]]);
    }

    if ($route['kind'] === 'product-create' && $method === 'POST') {
        $input = awikValidateProductInput($body, true);
        $category = $db->prepare('SELECT id FROM awik_inventory_categories WHERE id = ? LIMIT 1');
        $category->execute([$input['categoryId']]);
        if (!$category->fetch()) {
            throw new AwikApiException(404, 'Category not found');
        }
        $skuExists = $db->prepare('SELECT id FROM awik_products WHERE sku = ? AND deletedAt IS NULL LIMIT 1');
        $skuExists->execute([$input['sku']]);
        if ($skuExists->fetch()) {
            throw new AwikApiException(409, 'SKU already exists');
        }
        if (!empty($input['barcode'])) {
            $barcodeExists = $db->prepare('SELECT id FROM awik_products WHERE barcode = ? AND deletedAt IS NULL LIMIT 1');
            $barcodeExists->execute([$input['barcode']]);
            if ($barcodeExists->fetch()) {
                throw new AwikApiException(409, 'Barcode already exists');
            }
        }
        $initialStock = (int) ($input['initialStock'] ?? 0);
        if ($initialStock < 0) {
            throw new AwikApiException(400, 'Initial stock cannot be negative');
        }
        $productId = awikUuidV4();
        $db->beginTransaction();
        try {
            $db->prepare(
                'INSERT INTO awik_products (id, name, sku, barcode, categoryId, description, imageUrl, purchasePrice, sellingPrice, currency, currentStock, minStock, unit, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $productId,
                $input['name'],
                $input['sku'],
                $input['barcode'] ?? null,
                $input['categoryId'],
                $input['description'] ?? null,
                $input['imageUrl'] ?? null,
                (string) $input['purchasePrice'],
                (string) $input['sellingPrice'],
                $input['currency'] ?? 'USD',
                $initialStock,
                (int) ($input['minStock'] ?? 0),
                $input['unit'] ?? 'piece',
                !empty($input['isActive']) ? 1 : 0,
            ]);
            if ($initialStock > 0) {
                $movementId = awikUuidV4();
                $db->prepare(
                    'INSERT INTO awik_stock_movements (id, productId, userId, movementType, quantity, previousStock, newStock, reference, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                )->execute([
                    $movementId,
                    $productId,
                    $user['id'],
                    'PURCHASE',
                    $initialStock,
                    0,
                    $initialStock,
                    'initial-stock',
                    $input['initialStockNote'] ?? 'Initial stock on product creation',
                ]);
            }
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
        $row = $db->prepare('SELECT p.*, c.name AS categoryName FROM awik_products p LEFT JOIN awik_inventory_categories c ON c.id = p.categoryId WHERE p.id = ? LIMIT 1');
        $row->execute([$productId]);
        $product = $row->fetch();
        return awikResponse(201, ['success' => true, 'data' => awikNormalizeInventoryProductRow($product, ['id' => $product['categoryId'], 'name' => $product['categoryName']])]);
    }

    if ($route['kind'] === 'product-import' && $method === 'POST') {
        if (!$isAdmin) {
            throw new AwikApiException(403, 'Forbidden');
        }
        $rows = $body['rows'] ?? null;
        if (!is_array($rows)) {
            throw new AwikApiException(400, 'Validation failed', ['rows must be an array']);
        }
        if ($rows === []) {
            throw new AwikApiException(400, 'Validation failed', ['rows must not be empty']);
        }
        if (count($rows) > 2000) {
            throw new AwikApiException(400, 'Validation failed', ['rows must not contain more than 2000 items']);
        }

        $categoryByName = [];
        foreach ($db->query('SELECT id, name FROM awik_inventory_categories')->fetchAll() as $categoryRow) {
            $categoryByName[mb_strtolower(trim((string) $categoryRow['name']))] = $categoryRow['id'];
        }
        $skuSet = [];
        foreach ($db->query('SELECT sku FROM awik_products WHERE deletedAt IS NULL')->fetchAll() as $existing) {
            $skuSet[mb_strtolower(trim((string) $existing['sku']))] = true;
        }
        $barcodeSet = [];
        foreach ($db->query('SELECT barcode FROM awik_products WHERE deletedAt IS NULL AND barcode IS NOT NULL')->fetchAll() as $existing) {
            $barcodeSet[trim((string) $existing['barcode'])] = true;
        }

        $results = [];
        $imported = 0;
        $failed = 0;
        $createdCategories = [];

        foreach (array_values($rows) as $index => $rawRow) {
            $rowNumber = $index + 1;
            if ($rawRow instanceof stdClass) {
                $rawRow = get_object_vars($rawRow);
            }
            if (!is_array($rawRow)) {
                $failed++;
                $results[] = ['row' => $rowNumber, 'status' => 'failed', 'error' => 'Row must be an object'];
                continue;
            }
            try {
                $categoryName = trim((string) ($rawRow['category'] ?? ''));
                if ($categoryName === '') {
                    throw new AwikApiException(400, 'Validation failed', ['category should not be empty']);
                }
                $candidate = [];
                foreach (['name', 'sku', 'barcode', 'description', 'imageUrl', 'purchasePrice', 'sellingPrice', 'currency', 'initialStock', 'initialStockNote', 'minStock', 'unit'] as $field) {
                    if (array_key_exists($field, $rawRow) && $rawRow[$field] !== null && $rawRow[$field] !== '') {
                        $candidate[$field] = $rawRow[$field];
                    }
                }
                if (array_key_exists('isActive', $rawRow) && $rawRow['isActive'] !== null && $rawRow['isActive'] !== '') {
                    $candidate['isActive'] = filter_var($rawRow['isActive'], FILTER_VALIDATE_BOOLEAN);
                }
                if (!isset($candidate['currency'])) {
                    $candidate['currency'] = 'USD';
                }
                // awikValidateProductInput requires categoryId on create; pass the
                // category name as a placeholder so validation runs before we
                // resolve (or create) the real category row inside the transaction.
                $candidate['categoryId'] = $categoryName;
                $input = awikValidateProductInput($candidate, true);

                $skuKey = mb_strtolower(trim((string) $input['sku']));
                if (isset($skuSet[$skuKey])) {
                    throw new AwikApiException(409, 'SKU already exists');
                }
                if (!empty($input['barcode'])) {
                    if (isset($barcodeSet[trim((string) $input['barcode'])])) {
                        throw new AwikApiException(409, 'Barcode already exists');
                    }
                }
                $initialStock = (int) ($input['initialStock'] ?? 0);
                if ($initialStock < 0) {
                    throw new AwikApiException(400, 'Initial stock cannot be negative');
                }

                $categoryKey = mb_strtolower($categoryName);
                $productId = awikUuidV4();
                $db->beginTransaction();
                try {
                    if (isset($categoryByName[$categoryKey])) {
                        $categoryId = $categoryByName[$categoryKey];
                    } else {
                        $existingCategory = $db->prepare('SELECT id FROM awik_inventory_categories WHERE LOWER(TRIM(name)) = ? LIMIT 1');
                        $existingCategory->execute([strtolower(trim($categoryName))]);
                        $found = $existingCategory->fetch();
                        if ($found) {
                            $categoryId = $found['id'];
                        } else {
                            $categoryId = awikUuidV4();
                            $db->prepare('INSERT INTO awik_inventory_categories (id, name) VALUES (?, ?)')->execute([$categoryId, $categoryName]);
                            $createdCategories[$categoryName] = $categoryId;
                        }
                        $categoryByName[$categoryKey] = $categoryId;
                    }
                    $db->prepare(
                        'INSERT INTO awik_products (id, name, sku, barcode, categoryId, description, imageUrl, purchasePrice, sellingPrice, currency, currentStock, minStock, unit, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    )->execute([
                        $productId,
                        $input['name'],
                        $input['sku'],
                        $input['barcode'] ?? null,
                        $categoryId,
                        $input['description'] ?? null,
                        $input['imageUrl'] ?? null,
                        (string) $input['purchasePrice'],
                        (string) $input['sellingPrice'],
                        $input['currency'] ?? 'USD',
                        $initialStock,
                        (int) ($input['minStock'] ?? 0),
                        $input['unit'] ?? 'piece',
                        !empty($input['isActive']) ? 1 : 0,
                    ]);
                    if ($initialStock > 0) {
                        $db->prepare(
                            'INSERT INTO awik_stock_movements (id, productId, userId, movementType, quantity, previousStock, newStock, reference, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                        )->execute([
                            awikUuidV4(),
                            $productId,
                            $user['id'],
                            'PURCHASE',
                            $initialStock,
                            0,
                            $initialStock,
                            'csv-import',
                            $input['initialStockNote'] ?? 'Initial stock on import (row ' . $rowNumber . ')',
                        ]);
                    }
                    $db->commit();
                } catch (Throwable $exception) {
                    if ($db->inTransaction()) {
                        $db->rollBack();
                    }
                    throw $exception;
                }
                $skuSet[$skuKey] = true;
                if (!empty($input['barcode'])) {
                    $barcodeSet[trim((string) $input['barcode'])] = true;
                }
                $imported++;
                $results[] = ['row' => $rowNumber, 'status' => 'imported', 'id' => $productId, 'sku' => $input['sku'], 'name' => $input['name']];
            } catch (Throwable $exception) {
                $failed++;
                $message = $exception instanceof AwikApiException ? $exception->getMessage() : 'Import failed';
                if ($exception instanceof AwikApiException && !empty($exception->errors)) {
                    $message .= ': ' . implode(', ', $exception->errors);
                }
                $results[] = [
                    'row' => $rowNumber,
                    'status' => 'failed',
                    'sku' => is_array($rawRow) && isset($rawRow['sku']) && is_string($rawRow['sku']) ? $rawRow['sku'] : null,
                    'error' => $message,
                ];
            }
        }

        return awikResponse(200, ['success' => true, 'data' => [
            'imported' => $imported,
            'failed' => $failed,
            'total' => count($rows),
            'createdCategories' => array_keys($createdCategories),
            'results' => $results,
        ]]);
    }

    if ($route['kind'] === 'product-detail' && $method === 'GET') {
        $id = $route['id'];
        $statement = $db->prepare('SELECT p.*, c.name AS categoryName FROM awik_products p LEFT JOIN awik_inventory_categories c ON c.id = p.categoryId WHERE p.id = ? AND p.deletedAt IS NULL LIMIT 1');
        $statement->execute([$id]);
        $row = $statement->fetch();
        if (!$row) {
            throw new AwikApiException(404, 'Product not found');
        }
        return awikResponse(200, ['success' => true, 'data' => awikNormalizeInventoryProductRow($row, ['id' => $row['categoryId'], 'name' => $row['categoryName']])]);
    }

    if ($route['kind'] === 'product-update' && $method === 'PATCH') {
        $id = $route['id'];
        $product = $db->prepare('SELECT * FROM awik_products WHERE id = ? AND deletedAt IS NULL LIMIT 1');
        $product->execute([$id]);
        $current = $product->fetch();
        if (!$current) {
            throw new AwikApiException(404, 'Product not found');
        }
        $input = awikValidateProductInput($body, false);
        if (!empty($input['sku']) && $input['sku'] !== $current['sku']) {
            $exists = $db->prepare('SELECT id FROM awik_products WHERE sku = ? AND id != ? AND deletedAt IS NULL LIMIT 1');
            $exists->execute([$input['sku'], $id]);
            if ($exists->fetch()) {
                throw new AwikApiException(409, 'SKU already exists');
            }
        }
        if (!empty($input['barcode']) && $input['barcode'] !== $current['barcode']) {
            $exists = $db->prepare('SELECT id FROM awik_products WHERE barcode = ? AND id != ? AND deletedAt IS NULL LIMIT 1');
            $exists->execute([$input['barcode'], $id]);
            if ($exists->fetch()) {
                throw new AwikApiException(409, 'Barcode already exists');
            }
        }
        if (!empty($input['categoryId'])) {
            $category = $db->prepare('SELECT id FROM awik_inventory_categories WHERE id = ? LIMIT 1');
            $category->execute([$input['categoryId']]);
            if (!$category->fetch()) {
                throw new AwikApiException(404, 'Category not found');
            }
        }
        $updates = [];
        $values = [];
        foreach (['name', 'sku', 'barcode', 'categoryId', 'description', 'imageUrl', 'purchasePrice', 'sellingPrice', 'currency', 'minStock', 'unit', 'isActive'] as $field) {
            if (array_key_exists($field, $input)) {
                $updates[] = '`' . $field . '` = ?';
                $values[] = $field === 'categoryId' ? $input[$field] : $input[$field];
            }
        }
        if ($updates !== []) {
            $values[] = $id;
            $db->prepare('UPDATE awik_products SET ' . implode(', ', $updates) . ', updatedAt = ' . awikCurrentTimestampSql($db) . ' WHERE id = ?')->execute($values);
        }
        $updated = $db->prepare('SELECT p.*, c.name AS categoryName FROM awik_products p LEFT JOIN awik_inventory_categories c ON c.id = p.categoryId WHERE p.id = ? LIMIT 1');
        $updated->execute([$id]);
        $row = $updated->fetch();
        return awikResponse(200, ['success' => true, 'data' => awikNormalizeInventoryProductRow($row, ['id' => $row['categoryId'], 'name' => $row['categoryName']])]);
    }

    if ($route['kind'] === 'product-delete' && $method === 'DELETE') {
        if (!$isAdmin) {
            throw new AwikApiException(403, 'Forbidden');
        }
        $id = $route['id'];
        $product = $db->prepare('SELECT id FROM awik_products WHERE id = ? AND deletedAt IS NULL LIMIT 1');
        $product->execute([$id]);
        if (!$product->fetch()) {
            throw new AwikApiException(404, 'Product not found');
        }
        $db->prepare('UPDATE awik_products SET deletedAt = ' . awikCurrentTimestampSql($db) . ', isActive = 0, updatedAt = ' . awikCurrentTimestampSql($db) . ' WHERE id = ?')->execute([$id]);
        return awikResponse(200, ['success' => true, 'data' => ['message' => 'Product deleted successfully']]);
    }

    if ($route['kind'] === 'product-movements' && $method === 'GET') {
        $id = $route['id'];
        $statement = $db->prepare(
            'SELECT sm.*, p.name AS productName, p.sku AS productSku, p.barcode AS productBarcode, u.firstName AS userFirstName, u.lastName AS userLastName '
            . 'FROM awik_stock_movements sm '
            . 'LEFT JOIN awik_products p ON p.id = sm.productId '
            . 'LEFT JOIN awik_users u ON u.id = sm.userId '
            . 'WHERE sm.productId = ? ORDER BY sm.createdAt DESC LIMIT 100'
        );
        $statement->execute([$id]);
        return awikResponse(200, ['success' => true, 'data' => array_map('awikNormalizeInventoryMovementRow', $statement->fetchAll())]);
    }

    if ($route['kind'] === 'product-movement-create' && $method === 'POST') {
        $productId = $route['id'];
        $input = awikValidateStockMovementInput($body);
        $db->beginTransaction();
        try {
            $product = $db->prepare('SELECT * FROM awik_products WHERE id = ? AND deletedAt IS NULL LIMIT 1 FOR UPDATE');
            $product->execute([$productId]);
            $current = $product->fetch();
            if (!$current) {
                throw new AwikApiException(404, 'Product not found');
            }
            $delta = awikMovementDelta($input['movementType'], $input['quantity']);
            $newStock = (int) $current['currentStock'] + $delta;
            if ($newStock < 0) {
                throw new AwikApiException(400, 'Insufficient stock: operation would leave negative stock');
            }
            $db->prepare('UPDATE awik_products SET currentStock = ?, updatedAt = ' . awikCurrentTimestampSql($db) . ' WHERE id = ?')->execute([$newStock, $productId]);
            $movementId = awikUuidV4();
            $db->prepare(
                'INSERT INTO awik_stock_movements (id, productId, userId, movementType, quantity, previousStock, newStock, reference, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $movementId,
                $productId,
                $user['id'],
                $input['movementType'],
                (int) round($input['quantity']),
                (int) $current['currentStock'],
                $newStock,
                $input['reference'] ?? null,
                $input['notes'] ?? null,
            ]);
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
        return awikResponse(201, ['success' => true, 'data' => ['id' => $movementId ?? awikUuidV4(), 'productId' => $productId, 'movementType' => $input['movementType'], 'quantity' => (int) round($input['quantity']), 'previousStock' => (int) $current['currentStock'], 'newStock' => $newStock]]);
    }

    return awikJsonError(404, 'Not Found', null, $responsePath);
}

function awikValidateSaleItemInput(array $item): array
{
    $allowed = ['productId', 'quantity'];
    $errors = [];
    foreach (array_keys($item) as $field) {
        if (!in_array($field, $allowed, true)) {
            $errors[] = 'property ' . (string) $field . ' should not exist';
        }
    }
    if (!array_key_exists('productId', $item) || !is_string($item['productId']) || trim($item['productId']) === '') {
        $errors[] = 'productId should not be empty';
    }
    if (!array_key_exists('quantity', $item) || !is_numeric($item['quantity'])) {
        $errors[] = 'quantity must be a number conforming to the specified constraints';
    } else {
        $quantity = (int) $item['quantity'];
        if ($quantity < 1) {
            $errors[] = 'quantity must not be less than 1';
        }
    }
    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }
    return ['productId' => trim((string) $item['productId']), 'quantity' => (int) $item['quantity']];
}

function awikValidateSaleInput(array $body): array
{
    $allowed = ['items', 'customerId', 'paymentMethod', 'currency', 'notes'];
    $errors = [];
    foreach (array_keys($body) as $field) {
        if (!in_array($field, $allowed, true)) {
            $errors[] = 'property ' . (string) $field . ' should not exist';
        }
    }
    if (!array_key_exists('items', $body) || !is_array($body['items']) || $body['items'] === []) {
        $errors[] = 'A sale must contain at least one line item';
    }
    if (array_key_exists('customerId', $body) && $body['customerId'] !== null && (!is_string($body['customerId']) || trim($body['customerId']) === '')) {
        $errors[] = 'customerId must be a string';
    }
    if (!array_key_exists('paymentMethod', $body) || !is_string($body['paymentMethod']) || !in_array($body['paymentMethod'], ['cash', 'card', 'bank_transfer', 'credit', 'other'], true)) {
        $errors[] = 'paymentMethod must be one of the following values: cash, card, bank_transfer, credit, other';
    }
    if (array_key_exists('currency', $body) && $body['currency'] !== null && (!is_string($body['currency']) || trim($body['currency']) === '')) {
        $errors[] = 'currency must be a string';
    }
    if (array_key_exists('notes', $body) && $body['notes'] !== null && !is_string($body['notes'])) {
        $errors[] = 'notes must be a string';
    }
    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }
    $items = [];
    foreach ($body['items'] as $item) {
        // JSON bodies are decoded with objects preserved as stdClass so empty
        // objects ({}) stay distinguishable from empty arrays ([]). Normalize
        // each decoded object here so line items reach the validator as arrays.
        if (is_object($item)) {
            $item = get_object_vars($item);
        }
        if (!is_array($item)) {
            throw new AwikApiException(400, 'Validation failed', ['items' => ['must be an array of objects']]);
        }
        $items[] = awikValidateSaleItemInput($item);
    }
    return [
        'items' => $items,
        'customerId' => array_key_exists('customerId', $body) && $body['customerId'] !== null ? trim((string) $body['customerId']) : null,
        'paymentMethod' => $body['paymentMethod'],
        'currency' => array_key_exists('currency', $body) && $body['currency'] !== null ? trim((string) $body['currency']) : 'USD',
        'notes' => array_key_exists('notes', $body) ? $body['notes'] : null,
    ];
}

function awikSaleRouteMatches(string $method, string $path): ?array
{
    $routePath = rtrim($path, '/') ?: '/';
    if ($routePath === '/api/v1/sales' && in_array($method, ['GET', 'POST'], true)) {
        return ['kind' => $method === 'GET' ? 'sale-list' : 'sale-create'];
    }
    if (preg_match('~^/api/v1/sales/([^/]+)$~', $routePath, $matches) === 1) {
        if ($method === 'GET') {
            return ['kind' => 'sale-detail', 'id' => rawurldecode($matches[1])];
        }
    }
    if (preg_match('~^/api/v1/sales/([^/]+)/(refund|cancel)$~', $routePath, $matches) === 1) {
        if ($method === 'POST') {
            return ['kind' => 'sale-action', 'id' => rawurldecode($matches[1]), 'action' => $matches[2]];
        }
    }
    return null;
}

function awikFormatMoney(mixed $value): string
{
    return number_format((float) $value, 2, '.', '');
}

function awikNormalizeSaleItemRow(array $row): array
{
    $item = [
        'id' => $row['id'] ?? null,
        'saleId' => $row['saleId'] ?? null,
        'productId' => $row['productId'] ?? null,
        'quantity' => (int) ($row['quantity'] ?? 0),
        'unitPrice' => awikFormatMoney($row['unitPrice'] ?? 0),
        'totalPrice' => awikFormatMoney($row['totalPrice'] ?? 0),
        'createdAt' => $row['createdAt'] ?? null,
    ];
    if (isset($row['costPrice'])) {
        $item['costPrice'] = awikFormatMoney($row['costPrice']);
        $item['lineCost'] = awikFormatMoney($row['lineCost'] ?? 0);
        $item['lineProfit'] = awikFormatMoney($row['lineProfit'] ?? 0);
    }
    if (isset($row['product']) && is_array($row['product'])) {
        $item['product'] = $row['product'];
    }
    return $item;
}

function awikNormalizeSaleRow(array $row): array
{
    $items = [];
    foreach (($row['items'] ?? []) as $item) {
        if (is_array($item)) {
            $items[] = awikNormalizeSaleItemRow($item);
        }
    }

    $sale = [
        'id' => $row['id'] ?? null,
        'saleNumber' => $row['saleNumber'] ?? null,
        'customerId' => $row['customerId'] ?? null,
        'userId' => $row['userId'] ?? null,
        'totalAmount' => awikFormatMoney($row['totalAmount'] ?? 0),
        'currency' => $row['currency'] ?? 'USD',
        'paymentMethod' => $row['paymentMethod'] ?? null,
        'status' => $row['status'] ?? null,
        'notes' => $row['notes'] ?? null,
        'createdAt' => $row['createdAt'] ?? null,
        'updatedAt' => $row['updatedAt'] ?? null,
        'customer' => $row['customer'] ?? null,
        'user' => $row['user'] ?? null,
        'items' => $items,
    ];
    if (isset($row['cost'])) {
        $sale['cost'] = awikFormatMoney($row['cost']);
        $sale['profit'] = awikFormatMoney($row['profit'] ?? 0);
    }
    return $sale;
}

/**
 * Loads sale lines enriched with product identity and cost so the UI can show
 * profit. Cost is taken from the product's current purchasePrice (no per-sale
 * cost snapshot exists yet), so profit is an estimate based on today's cost.
 */
function awikLoadEnrichedSaleItems(PDO $db, array $saleIds): array
{
    $map = [];
    if ($saleIds === []) {
        return $map;
    }
    $placeholders = implode(',', array_fill(0, count($saleIds), '?'));
    $statement = $db->prepare(
        'SELECT si.saleId AS saleId, si.id AS id, si.productId AS productId, si.quantity AS quantity, '
        . 'si.unitPrice AS unitPrice, si.totalPrice AS totalPrice, '
        . 'p.name AS productName, p.sku AS productSku, p.barcode AS productBarcode, p.unit AS productUnit, '
        . 'p.purchasePrice AS purchasePrice '
        . 'FROM awik_sale_items si '
        . 'LEFT JOIN awik_products p ON p.id = si.productId '
        . 'WHERE si.saleId IN (' . $placeholders . ') '
        . 'ORDER BY si.createdAt ASC'
    );
    $statement->execute(array_values($saleIds));
    foreach ($statement->fetchAll() as $row) {
        $saleId = (string) $row['saleId'];
        $quantity = (int) ($row['quantity'] ?? 0);
        $totalPrice = (float) ($row['totalPrice'] ?? 0);
        $unitCost = (float) ($row['purchasePrice'] ?? 0);
        $lineCost = $unitCost * $quantity;
        $map[$saleId][] = [
            'id' => $row['id'] ?? null,
            'saleId' => $saleId,
            'productId' => $row['productId'] ?? null,
            'quantity' => $quantity,
            'unitPrice' => awikFormatMoney($row['unitPrice'] ?? 0),
            'totalPrice' => awikFormatMoney($row['totalPrice'] ?? 0),
            'costPrice' => awikFormatMoney($unitCost),
            'lineCost' => awikFormatMoney($lineCost),
            'lineProfit' => awikFormatMoney($totalPrice - $lineCost),
            'product' => [
                'id' => $row['productId'] ?? null,
                'name' => $row['productName'] ?? null,
                'sku' => $row['productSku'] ?? null,
                'barcode' => $row['productBarcode'] ?? null,
                'unit' => $row['productUnit'] ?? null,
            ],
        ];
    }
    return $map;
}

/**
 * Attaches the sale's customer and cashier so the UI (invoice, receipt, detail
 * page) can render them. The list endpoint builds these inline; single-sale
 * responses need this helper.
 */
function awikAttachSaleRelations(PDO $db, array $sale): array
{
    if (!empty($sale['customerId'])) {
        $statement = $db->prepare('SELECT id, firstName, lastName, phone, email, address FROM awik_customers WHERE id = ? LIMIT 1');
        $statement->execute([$sale['customerId']]);
        $sale['customer'] = $statement->fetch() ?: null;
    } else {
        $sale['customer'] = null;
    }
    if (!empty($sale['userId'])) {
        $statement = $db->prepare('SELECT id, firstName, lastName FROM awik_users WHERE id = ? LIMIT 1');
        $statement->execute([$sale['userId']]);
        $sale['user'] = $statement->fetch() ?: null;
    } else {
        $sale['user'] = null;
    }
    return $sale;
}

function awikGenerateSaleNumber(): string
{
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $suffix = str_pad((string) random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
    return 'S-' . $now->format('Ymd') . '-' . $suffix;
}

function awikHandleSaleRequest(PDO $db, string $method, string $path, array $query, array $body, array $headers, string $responsePath, ?string $ipAddress): ?array
{
    $route = awikSaleRouteMatches($method, $path);
    if ($route === null) {
        return null;
    }

    $user = awikRequireAuthenticatedUser($db, $headers);
    if (!in_array($user['role'] ?? null, ['ADMIN', 'STAFF'], true)) {
        throw new AwikApiException(403, 'Forbidden');
    }
    $actorId = (string) $user['id'];

    if ($route['kind'] === 'sale-list' && $method === 'GET') {
        $page = max(1, (int) ($query['page'] ?? 1));
        $limit = min(100, max(1, (int) ($query['limit'] ?? 20)));
        $where = [];
        $params = [];
        if (!empty($query['status'])) {
            $where[] = 's.status = ?';
            $params[] = $query['status'];
        }
        if (!empty($query['customerId'])) {
            $where[] = 's.customerId = ?';
            $params[] = $query['customerId'];
        }
        if (!empty($query['paymentMethod'])) {
            $where[] = 's.paymentMethod = ?';
            $params[] = $query['paymentMethod'];
        }
        if (!empty($query['dateFrom'])) {
            $where[] = 's.createdAt >= ?';
            $params[] = $query['dateFrom'];
        }
        if (!empty($query['dateTo'])) {
            $where[] = 's.createdAt <= ?';
            $params[] = $query['dateTo'];
        }
        if (!empty($query['search'])) {
            $where[] = '(s.saleNumber LIKE ? OR c.phone LIKE ? OR c.firstName LIKE ? OR c.lastName LIKE ? '
                . 'OR EXISTS (SELECT 1 FROM awik_sale_items si JOIN awik_products p ON p.id = si.productId '
                . 'WHERE si.saleId = s.id AND p.name LIKE ?))';
            $needle = '%' . (string) $query['search'] . '%';
            $params = array_merge($params, [$needle, $needle, $needle, $needle, $needle]);
        }
        $whereSql = $where !== [] ? ' WHERE ' . implode(' AND ', $where) : '';
        $count = $db->prepare('SELECT COUNT(*) FROM awik_sales s LEFT JOIN awik_customers c ON c.id = s.customerId' . $whereSql);
        $count->execute($params);
        $total = (int) $count->fetchColumn();
        $statement = $db->prepare(
            'SELECT s.*, c.firstName AS customerFirstName, c.lastName AS customerLastName, c.phone AS customerPhone, u.firstName AS userFirstName, u.lastName AS userLastName '
            . 'FROM awik_sales s '
            . 'LEFT JOIN awik_customers c ON c.id = s.customerId '
            . 'LEFT JOIN awik_users u ON u.id = s.userId '
            . $whereSql
            . ' ORDER BY s.createdAt DESC LIMIT ? OFFSET ?'
        );
        $index = 1;
        foreach ($params as $parameter) {
            $statement->bindValue($index++, $parameter);
        }
        $statement->bindValue($index++, $limit, PDO::PARAM_INT);
        $statement->bindValue($index, ($page - 1) * $limit, PDO::PARAM_INT);
        $statement->execute();
        $rows = $statement->fetchAll();
        $saleIds = array_map(static fn (array $row): string => (string) $row['id'], $rows);
        $itemsBySale = awikLoadEnrichedSaleItems($db, $saleIds);
        $result = [];
        foreach ($rows as $row) {
            $saleId = (string) $row['id'];
            $items = $itemsBySale[$saleId] ?? [];
            $cost = 0.0;
            foreach ($items as $item) {
                $cost += (float) $item['lineCost'];
            }
            $totalAmount = (float) $row['totalAmount'];
            $result[] = [
                'id' => $row['id'],
                'saleNumber' => $row['saleNumber'],
                'customerId' => $row['customerId'],
                'userId' => $row['userId'],
                'totalAmount' => awikFormatMoney($row['totalAmount']),
                'currency' => $row['currency'],
                'paymentMethod' => $row['paymentMethod'],
                'status' => $row['status'],
                'notes' => $row['notes'],
                'cost' => awikFormatMoney($cost),
                'profit' => awikFormatMoney($totalAmount - $cost),
                'createdAt' => $row['createdAt'],
                'updatedAt' => $row['updatedAt'],
                'customer' => [
                    'id' => $row['customerId'],
                    'firstName' => $row['customerFirstName'],
                    'lastName' => $row['customerLastName'],
                    'phone' => $row['customerPhone'],
                ],
                'user' => [
                    'id' => $row['userId'],
                    'firstName' => $row['userFirstName'],
                    'lastName' => $row['userLastName'],
                ],
                'items' => $items,
            ];
        }
        return awikResponse(200, ['success' => true, 'data' => ['data' => $result, 'total' => $total, 'page' => $page, 'limit' => $limit]]);
    }

    if ($route['kind'] === 'sale-create' && $method === 'POST') {
        $input = awikValidateSaleInput($body);
        $quantityByProduct = [];
        foreach ($input['items'] as $line) {
            $quantityByProduct[$line['productId']] = ($quantityByProduct[$line['productId']] ?? 0) + $line['quantity'];
        }
        $productIds = array_keys($quantityByProduct);
        $placeholders = implode(',', array_fill(0, count($productIds), '?'));
        $productRows = [];
        if ($productIds !== []) {
            $sql = 'SELECT * FROM awik_products WHERE id IN (' . $placeholders . ') AND deletedAt IS NULL AND isActive = 1';
            $statement = $db->prepare($sql);
            $statement->execute($productIds);
            $productRows = $statement->fetchAll();
        }
        if (count($productRows) !== count($productIds)) {
            throw new AwikApiException(400, 'One or more products do not exist or are inactive');
        }
        $productMap = [];
        foreach ($productRows as $row) {
            $productMap[$row['id']] = $row;
        }
        if (!empty($input['customerId'])) {
            $customerExists = $db->prepare('SELECT id FROM awik_customers WHERE id = ? AND deletedAt IS NULL LIMIT 1');
            $customerExists->execute([$input['customerId']]);
            if (!$customerExists->fetch()) {
                throw new AwikApiException(404, 'Customer not found');
            }
        }

        $lines = [];
        $preparedTotal = 0.0;
        foreach ($quantityByProduct as $productId => $quantity) {
            $product = $productMap[$productId];
            $unitPrice = (float) $product['sellingPrice'];
            $totalPrice = $unitPrice * $quantity;
            $preparedTotal += $totalPrice;
            $lines[] = ['productId' => $productId, 'quantity' => $quantity, 'unitPrice' => $unitPrice, 'totalPrice' => $totalPrice];
        }
        $currency = $input['currency'] ?? 'USD';
        $saleNumber = awikGenerateSaleNumber();
        $saleId = awikUuidV4();
        $db->beginTransaction();
        try {
            foreach ($lines as $line) {
                $product = $productMap[$line['productId']];
                $updated = $db->prepare('UPDATE awik_products SET currentStock = currentStock - ?, updatedAt = ' . awikCurrentTimestampSql($db) . ' WHERE id = ? AND deletedAt IS NULL AND currentStock >= ?');
                $updated->execute([(int) $line['quantity'], $line['productId'], (int) $line['quantity']]);
                if ($updated->rowCount() !== 1) {
                    throw new AwikApiException(400, 'Insufficient stock for product ' . ($product['name'] ?? $line['productId']));
                }
            }
            $db->prepare(
                'INSERT INTO awik_sales (id, saleNumber, customerId, userId, totalAmount, currency, paymentMethod, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $saleId,
                $saleNumber,
                $input['customerId'],
                $actorId,
                number_format($preparedTotal, 2, '.', ''),
                $currency,
                $input['paymentMethod'],
                'COMPLETED',
                $input['notes'],
            ]);
            foreach ($lines as $line) {
                $itemId = awikUuidV4();
                $db->prepare(
                    'INSERT INTO awik_sale_items (id, saleId, productId, quantity, unitPrice, totalPrice) VALUES (?, ?, ?, ?, ?, ?)'
                )->execute([
                    $itemId,
                    $saleId,
                    $line['productId'],
                    $line['quantity'],
                    number_format((float) $line['unitPrice'], 2, '.', ''),
                    number_format((float) $line['totalPrice'], 2, '.', ''),
                ]);
                $stock = $db->prepare('SELECT currentStock FROM awik_products WHERE id = ? LIMIT 1');
                $stock->execute([$line['productId']]);
                $currentStock = (int) ($stock->fetch()['currentStock'] ?? 0);
                $previousStock = $currentStock + (int) $line['quantity'];
                $movementId = awikUuidV4();
                $db->prepare(
                    'INSERT INTO awik_stock_movements (id, productId, userId, movementType, quantity, previousStock, newStock, reference, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                )->execute([
                    $movementId,
                    $line['productId'],
                    $actorId,
                    'SALE',
                    (int) $line['quantity'],
                    $previousStock,
                    $currentStock,
                    $saleNumber,
                    'Sale ' . $saleNumber,
                ]);
            }
            $db->commit();
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
        $createdSale = $db->prepare('SELECT * FROM awik_sales WHERE id = ? LIMIT 1');
        $createdSale->execute([$saleId]);
        $sale = $createdSale->fetch();
        $sale = awikAttachSaleRelations($db, $sale);
        $enriched = awikLoadEnrichedSaleItems($db, [$saleId]);
        $sale['items'] = $enriched[(string) $saleId] ?? [];
        return awikResponse(201, ['success' => true, 'data' => [
            'sale' => awikNormalizeSaleRow($sale),
            'receipt' => [
                'saleNumber' => $sale['saleNumber'],
                'totalAmount' => awikFormatMoney($sale['totalAmount']),
                'currency' => $sale['currency'],
                'paymentMethod' => $sale['paymentMethod'],
                'items' => count($lines),
                'soldAt' => $sale['createdAt'],
            ],
        ]]);
    }

    if ($route['kind'] === 'sale-detail' && $method === 'GET') {
        $saleId = $route['id'];
        $sale = $db->prepare('SELECT * FROM awik_sales WHERE id = ? LIMIT 1');
        $sale->execute([$saleId]);
        $row = $sale->fetch();
        if (!$row) {
            throw new AwikApiException(404, 'Sale not found');
        }
        $row = awikAttachSaleRelations($db, $row);
        $enriched = awikLoadEnrichedSaleItems($db, [$saleId]);
        $row['items'] = $enriched[(string) $saleId] ?? [];
        $cost = 0.0;
        foreach ($row['items'] as $item) {
            $cost += (float) $item['lineCost'];
        }
        $row['cost'] = awikFormatMoney($cost);
        $row['profit'] = awikFormatMoney((float) $row['totalAmount'] - $cost);
        return awikResponse(200, ['success' => true, 'data' => awikNormalizeSaleRow($row)]);
    }

    if ($route['kind'] === 'sale-action' && $method === 'POST') {
        $saleId = $route['id'];
        $action = $route['action'];
        $reason = is_string(($body['reason'] ?? null)) ? $body['reason'] : null;
        $db->beginTransaction();
        try {
            $sale = $db->prepare('SELECT * FROM awik_sales WHERE id = ? LIMIT 1 FOR UPDATE');
            $sale->execute([$saleId]);
            $current = $sale->fetch();
            if (!$current) {
                throw new AwikApiException(404, 'Sale not found');
            }
            if ($current['status'] !== 'COMPLETED') {
                $message = $action === 'refund'
                    ? 'Sale cannot be refunded: current status is "' . ($current['status'] ?? 'UNKNOWN') . '"'
                    : 'Sale cannot be cancelled: current status is "' . ($current['status'] ?? 'UNKNOWN') . '"';
                throw new AwikApiException(400, $message);
            }

            $targetStatus = $action === 'refund' ? 'REFUNDED' : 'CANCELLED';
            $claimed = $db->prepare('UPDATE awik_sales SET status = ? WHERE id = ? AND status = ?');
            $claimed->execute([$targetStatus, $saleId, 'COMPLETED']);
            if ($claimed->rowCount() !== 1) {
                $message = $action === 'refund'
                    ? 'Sale cannot be refunded: it was already refunded'
                    : 'Sale cannot be cancelled: it was already cancelled or refunded';
                throw new AwikApiException(400, $message);
            }

            $items = $db->prepare('SELECT * FROM awik_sale_items WHERE saleId = ?');
            $items->execute([$saleId]);
            foreach ($items->fetchAll() as $item) {
                $product = $db->prepare('SELECT id, deletedAt FROM awik_products WHERE id = ? LIMIT 1 FOR UPDATE');
                $product->execute([$item['productId']]);
                $lockedProduct = $product->fetch();
                if (!$lockedProduct) {
                    throw new RuntimeException('Sale item references a missing product');
                }
                if ($lockedProduct['deletedAt'] !== null) {
                    continue;
                }

                $stock = $db->prepare('UPDATE awik_products SET currentStock = currentStock + ?, updatedAt = ' . awikCurrentTimestampSql($db) . ' WHERE id = ? AND deletedAt IS NULL');
                $stock->execute([(int) $item['quantity'], $item['productId']]);
                if ($stock->rowCount() !== 1) {
                    throw new RuntimeException('Sale product stock could not be restored');
                }
                $product = $db->prepare('SELECT currentStock FROM awik_products WHERE id = ? LIMIT 1');
                $product->execute([$item['productId']]);
                $next = $product->fetch();
                if (!$next) {
                    throw new RuntimeException('Sale product stock could not be reloaded');
                }
                $newStock = (int) ($next['currentStock'] ?? 0);
                $movementId = awikUuidV4();
                $db->prepare(
                    'INSERT INTO awik_stock_movements (id, productId, userId, movementType, quantity, previousStock, newStock, reference, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                )->execute([
                    $movementId,
                    $item['productId'],
                    $actorId,
                    'RETURN',
                    (int) $item['quantity'],
                    $newStock - (int) $item['quantity'],
                    $newStock,
                    ($action === 'refund' ? 'refund-' : 'cancel-') . $current['saleNumber'],
                    $reason ?: ($action === 'refund' ? 'Refund of sale ' : 'Cancellation of sale ') . $current['saleNumber'],
                ]);
            }
            $updated = $db->prepare('SELECT * FROM awik_sales WHERE id = ? LIMIT 1');
            $updated->execute([$saleId]);
            $updatedSale = $updated->fetch();
            if (!$updatedSale) {
                throw new RuntimeException('Updated sale could not be reloaded');
            }

            $db->commit();
            return awikResponse(200, ['success' => true, 'data' => awikNormalizeSaleRow($updatedSale)]);
        } catch (Throwable $exception) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $exception;
        }
    }

    return awikJsonError(404, 'Not Found', null, $responsePath);
}

function awikDashboardRouteMatches(string $method, string $path): ?array
{
    $basePath = '/api/v1/dashboard';
    $routePath = rtrim($path, '/') ?: '/';
    if ($routePath !== $basePath && !str_starts_with($routePath, $basePath . '/')) {
        return null;
    }

    $knownRoutes = [
        '/api/v1/dashboard/kpis' => 'kpis',
        '/api/v1/dashboard/revenue-chart' => 'revenue-chart',
        '/api/v1/dashboard/recent-activity' => 'recent-activity',
        '/api/v1/dashboard/alerts' => 'alerts',
    ];

    if ($method !== 'GET') {
        return null;
    }

    if (isset($knownRoutes[$routePath])) {
        return ['kind' => $knownRoutes[$routePath], 'path' => $routePath];
    }

    return null;
}

function awikValidateDashboardPeriod(string $period): string
{
    $normalized = strtolower(trim($period));
    if ($normalized === '') {
        $normalized = 'monthly';
    }
    if (!in_array($normalized, ['daily', 'weekly', 'monthly'], true)) {
        throw new AwikApiException(400, 'period must be one of: daily, weekly, monthly');
    }
    return $normalized;
}

function awikValidateReportDateRange(array $query): array
{
    $validated = awikValidateReportQuery($query);
    $dateFrom = $validated['dateFrom'];
    $dateTo = $validated['dateTo'];
    $normalized = [];

    foreach (['dateFrom' => $dateFrom, 'dateTo' => $dateTo] as $field => $value) {
        if ($value === null) {
            $normalized[$field] = null;
            continue;
        }

        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})?)?$/', $value, $matches) !== 1
            || !checkdate((int) $matches[2], (int) $matches[3], (int) $matches[1])) {
            throw new AwikApiException(400, $field . ' must be a valid ISO date');
        }

        $dateTime = str_contains($value, 'T') ? $value : $value . 'T00:00:00Z';
        if (preg_match('/(?:Z|[+-]\d{2}:\d{2})$/', $dateTime) !== 1) {
            $dateTime .= 'Z';
        }
        try {
            $instant = new DateTimeImmutable($dateTime, new DateTimeZone('UTC'));
        } catch (Throwable) {
            throw new AwikApiException(400, $field . ' must be a valid ISO date');
        }
        $normalized[$field] = $instant->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.v');
    }

    if ($normalized['dateFrom'] !== null && $normalized['dateTo'] !== null && $normalized['dateFrom'] > $normalized['dateTo']) {
        throw new AwikApiException(400, 'dateFrom must be earlier than or equal to dateTo');
    }

    return $normalized;
}

function awikValidateReportQuery(array $query): array
{
    foreach ($query as $key => $value) {
        if (!in_array($key, ['dateFrom', 'dateTo', 'format'], true)) {
            throw new AwikApiException(400, 'Unknown report query parameter: ' . $key);
        }
        if (!is_string($value)) {
            throw new AwikApiException(400, $key . ' must be a string');
        }
        if ($key !== 'format' && trim($value) === '') {
            throw new AwikApiException(400, $key . ' must be a valid ISO date');
        }
    }

    $range = [
        'dateFrom' => isset($query['dateFrom']) ? $query['dateFrom'] : null,
        'dateTo' => isset($query['dateTo']) ? $query['dateTo'] : null,
    ];
    if (isset($query['format'])) {
        $range['format'] = $query['format'];
    }
    return $range;
}

function awikReportUsesDateRange(string $report): bool
{
    return in_array($report, ['revenue', 'sales', 'stock-movements', 'whatsapp'], true);
}

function awikReportLocalRowLimit(string $report): ?int
{
    return match ($report) {
        'customers' => 20,
        'whatsapp' => 50,
        default => null,
    };
}

function awikReportCsvDate(mixed $value): string
{
    if (!is_string($value) || $value === '') {
        return '';
    }
    try {
        return (new DateTimeImmutable($value, new DateTimeZone('UTC')))->format('n/j/Y');
    } catch (Throwable) {
        return $value;
    }
}

function awikReportCsvCell(mixed $value): string
{
    if ($value === null) {
        return '';
    }
    if (is_bool($value)) {
        $value = $value ? 'true' : 'false';
    } elseif (is_array($value) || is_object($value)) {
        $value = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }
    $cell = (string) $value;
    $unicodeFormulaPrefix = preg_match('/^[\p{Z}\s\p{Cf}]*[=+\-@]/u', $cell);
    $asciiFormulaPrefix = preg_match('/^[\x00-\x20\x7f]*[=+\-@]/', $cell);
    if ($unicodeFormulaPrefix === 1 || $asciiFormulaPrefix === 1) {
        return "'" . $cell;
    }
    return $cell;
}

function awikReportCsvProjection(string $report, mixed $data): array
{
    $headers = [
        'revenue' => ['Sale #', 'Customer', 'Method', 'Amount', 'Date'],
        'sales' => ['Sale #', 'Customer', 'Method', 'Status', 'Amount', 'Date'],
        'customers' => ['Name', 'Phone', 'WhatsApp', 'Status', 'Joined'],
        'subscriptions' => ['Status', 'Count'],
        'inventory' => ['Category', 'Item Count', 'Total Stock', 'Value'],
        'stock-movements' => ['Product', 'Type', 'Quantity', 'Prev', 'New', 'User', 'Date'],
        'whatsapp' => ['Phone', 'Status', 'Template', 'Date'],
    ];
    if (!isset($headers[$report])) {
        throw new AwikApiException(400, 'Unsupported report type');
    }

    $asRows = static function (mixed $rows): array {
        return is_array($rows) && array_is_list($rows) ? $rows : [];
    };
    $customerName = static function (array $row): string {
        $customer = is_array($row['customer'] ?? null) ? $row['customer'] : [];
        $name = trim((string) ($customer['firstName'] ?? $row['customerFirstName'] ?? $row['firstName'] ?? '') . ' '
            . (string) ($customer['lastName'] ?? $row['customerLastName'] ?? $row['lastName'] ?? ''));
        return $name === '' ? 'Walk-in' : $name;
    };
    $rows = [];
    switch ($report) {
        case 'revenue':
            $records = is_array($data) ? ($data['sales'] ?? $data['payments'] ?? $data) : [];
            foreach ($asRows($records) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $rows[] = [
                    $row['saleNumber'] ?? $row['paymentNumber'] ?? '',
                    $customerName($row),
                    $row['paymentMethod'] ?? '',
                    $row['totalAmount'] ?? $row['amount'] ?? '',
                    awikReportCsvDate($row['createdAt'] ?? null),
                ];
            }
            break;
        case 'sales':
            $records = is_array($data) && isset($data['sales']) ? $data['sales'] : $data;
            foreach ($asRows($records) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $rows[] = [
                    $row['saleNumber'] ?? '',
                    $customerName($row),
                    $row['paymentMethod'] ?? '',
                    $row['status'] ?? '',
                    $row['totalAmount'] ?? '',
                    awikReportCsvDate($row['createdAt'] ?? null),
                ];
            }
            break;
        case 'customers':
            $records = is_array($data) && isset($data['customers']) ? $data['customers'] : $data;
            foreach ($asRows($records) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $rows[] = [
                    trim((string) ($row['firstName'] ?? '') . ' ' . (string) ($row['lastName'] ?? '')),
                    $row['phone'] ?? '',
                    $row['whatsappNumber'] ?? '-',
                    $row['status'] ?? '',
                    awikReportCsvDate($row['createdAt'] ?? null),
                ];
            }
            break;
        case 'subscriptions':
            $records = is_array($data) ? ($data['byStatus'] ?? []) : [];
            foreach ($asRows($records) as $row) {
                if (is_array($row)) {
                    $rows[] = [$row['status'] ?? '', $row['count'] ?? 0];
                }
            }
            break;
        case 'inventory':
            $records = is_array($data) ? ($data['byCategory'] ?? []) : [];
            foreach ($asRows($records) as $row) {
                if (is_array($row)) {
                    $rows[] = [
                        $row['category'] ?? '',
                        $row['count'] ?? 0,
                        $row['totalStock'] ?? 0,
                        number_format((float) ($row['value'] ?? 0), 2, '.', ''),
                    ];
                }
            }
            break;
        case 'stock-movements':
            $records = is_array($data) && isset($data['movements']) ? $data['movements'] : $data;
            foreach ($asRows($records) as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $product = is_array($row['product'] ?? null) ? $row['product'] : [];
                $user = is_array($row['user'] ?? null) ? $row['user'] : [];
                $rows[] = [
                    $product['name'] ?? $row['productName'] ?? '',
                    $row['movementType'] ?? '',
                    $row['quantity'] ?? '',
                    $row['previousStock'] ?? '',
                    $row['newStock'] ?? '',
                    trim((string) ($user['firstName'] ?? $row['userFirstName'] ?? '') . ' ' . (string) ($user['lastName'] ?? $row['userLastName'] ?? '')),
                    awikReportCsvDate($row['createdAt'] ?? null),
                ];
            }
            break;
        case 'whatsapp':
            $records = is_array($data) && isset($data['messages']) ? $data['messages'] : $data;
            foreach ($asRows($records) as $row) {
                if (is_array($row)) {
                    $rows[] = [
                        $row['recipientPhone'] ?? $row['phone'] ?? '',
                        $row['status'] ?? '',
                        $row['templateType'] ?? $row['template'] ?? '',
                        awikReportCsvDate($row['createdAt'] ?? null),
                    ];
                }
            }
            break;
    }

    return [$headers[$report], $rows];
}

function awikReportCsvContent(string $report, mixed $data): string
{
    [$headers, $rows] = awikReportCsvProjection($report, $data);
    $stream = fopen('php://temp', 'r+');
    if ($stream === false) {
        throw new RuntimeException('Could not allocate report CSV stream');
    }
    try {
        foreach (array_merge([$headers], $rows) as $row) {
            $cells = array_map('awikReportCsvCell', $row);
            if (fputcsv($stream, $cells, ',', '"', '') === false) {
                throw new RuntimeException('Could not serialize report CSV row');
            }
        }
        rewind($stream);
        $content = stream_get_contents($stream);
        if (!is_string($content)) {
            throw new RuntimeException('Could not read serialized report CSV');
        }
        return $content;
    } finally {
        fclose($stream);
    }
}

function awikReportTitle(string $report): string
{
    return match ($report) {
        'revenue' => 'Revenue Report',
        'sales' => 'Sales Report',
        'customers' => 'Customers Report',
        'subscriptions' => 'Subscriptions Report',
        'inventory' => 'Inventory Report',
        'stock-movements' => 'Stock Movements Report',
        'whatsapp' => 'WhatsApp Report',
        default => throw new AwikApiException(400, 'Unsupported report type'),
    };
}

function awikReportSummaryLines(string $report, mixed $data): array
{
    if (!is_array($data)) {
        return [];
    }
    $summary = is_array($data['summary'] ?? null) ? $data['summary'] : [];
    $money = static fn (mixed $value): string => number_format((float) $value, 2, '.', '');
    $lines = match ($report) {
        'revenue' => [
            'Total Revenue: ' . $money($summary['totalRevenue'] ?? 0),
            'Total Sales: ' . (int) ($summary['totalSales'] ?? $summary['totalPayments'] ?? 0),
        ],
        'sales' => [
            'Total Amount: ' . $money($summary['totalAmount'] ?? 0),
            'Total Count: ' . (int) ($summary['totalCount'] ?? 0),
        ],
        'customers' => [
            'Total Customers: ' . (int) ($summary['totalCustomers'] ?? 0),
            'With WhatsApp: ' . (int) ($summary['withWhatsapp'] ?? 0),
        ],
        'subscriptions' => [
            'Total Subscriptions: ' . (int) ($summary['totalSubscriptions'] ?? 0),
            'Active: ' . (int) ($summary['totalActive'] ?? 0),
        ],
        'inventory' => [
            'Total Items: ' . (int) ($summary['totalItems'] ?? 0),
            'Total Quantity: ' . (int) ($summary['totalQuantity'] ?? 0),
            'Total Value: ' . $money($summary['totalValue'] ?? 0),
        ],
        'stock-movements' => [
            'Total Movements: ' . (int) ($summary['totalMovements'] ?? 0),
            'Inbound: ' . (int) ($summary['inbound'] ?? 0),
            'Outbound: ' . (int) ($summary['outbound'] ?? 0),
        ],
        'whatsapp' => [
            'Total: ' . (int) ($summary['totalMessages'] ?? 0),
            'Delivered: ' . (int) ($summary['delivered'] ?? 0),
            'Failed: ' . (int) ($summary['failed'] ?? 0),
            'Rate: ' . (($summary['deliveryRate'] ?? null) === null
                ? '-'
                : number_format((float) $summary['deliveryRate'] * 100, 1, '.', '') . '%'),
        ],
        default => throw new AwikApiException(400, 'Unsupported report type'),
    };

    $groupKey = match ($report) {
        'revenue' => 'byMethod',
        'sales', 'customers' => 'byStatus',
        default => null,
    };
    if ($groupKey !== null && is_array($data[$groupKey] ?? null)) {
        foreach ($data[$groupKey] as $group) {
            if (!is_array($group)) {
                continue;
            }
            $label = (string) ($group['method'] ?? $group['status'] ?? '');
            $count = (int) ($group['count'] ?? 0);
            $lines[] = $report === 'revenue'
                ? $label . ': ' . $money($group['total'] ?? 0) . ' (' . $count . ')'
                : $label . ': ' . $count;
        }
    }
    return $lines;
}

function awikReportExportData(string $report, mixed $data): array
{
    [$headers, $rows] = awikReportCsvProjection($report, $data);
    return [
        'title' => awikReportTitle($report),
        'headers' => $headers,
        'rows' => $rows,
        'summary' => awikReportSummaryLines($report, $data),
    ];
}

function awikReportPlainText(mixed $value): string
{
    if (is_array($value) || is_object($value)) {
        $value = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }
    $text = (string) ($value ?? '');
    $encoded = @iconv('UTF-8', 'Windows-1252//TRANSLIT//IGNORE', $text);
    if (!is_string($encoded)) {
        throw new RuntimeException('Report contains text that cannot be encoded for PDF');
    }
    return preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $encoded) ?? '';
}

function awikReportPdfEscape(string $text): string
{
    return str_replace(["\\", '(', ')'], ["\\\\", '\\(', '\\)'], $text);
}

function awikReportPdfContent(string $report, mixed $data): string
{
    $export = awikReportExportData($report, $data);
    $lines = ['AWIK NET - ' . $export['title'], 'Internet Service Provider', 'Generated: ' . gmdate('Y-m-d H:i:s') . ' UTC', ''];
    foreach ($export['summary'] as $summaryLine) {
        $lines[] = $summaryLine;
    }
    if ($export['summary'] !== []) {
        $lines[] = '';
    }
    $lines[] = implode(' | ', $export['headers']);
    $lines[] = str_repeat('-', min(145, max(20, count($export['headers']) * 14)));
    if ($export['rows'] === []) {
        $lines[] = 'No data available';
    } else {
        foreach ($export['rows'] as $row) {
            $cells = array_map(static fn (mixed $cell): string => awikReportPlainText($cell), $row);
            $wrapped = wordwrap(implode(' | ', $cells), 145, "\n", true);
            foreach (explode("\n", $wrapped) as $line) {
                $lines[] = $line;
            }
        }
    }

    $pageSize = 48;
    $pageLines = array_chunk($lines, $pageSize);
    $pageCount = max(1, count($pageLines));
    $objects = [
        1 => '<< /Type /Catalog /Pages 2 0 R >>',
        3 => '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    ];
    $pageObjectIds = [];
    foreach ($pageLines as $pageIndex => $contentLines) {
        $pageObjectId = 4 + $pageIndex * 2;
        $contentObjectId = $pageObjectId + 1;
        $pageObjectIds[] = $pageObjectId . ' 0 R';
        $commands = [];
        foreach ($contentLines as $lineIndex => $line) {
            $pdfLine = awikReportPdfEscape(awikReportPlainText($line));
            $commands[] = 'BT /F1 8 Tf 36 ' . (555 - $lineIndex * 11) . ' Td (' . $pdfLine . ') Tj ET';
        }
        $commands[] = 'BT /F1 8 Tf 36 24 Td (Page ' . ($pageIndex + 1) . ' of ' . $pageCount . ') Tj ET';
        $stream = implode("\n", $commands) . "\n";
        $objects[$pageObjectId] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] '
            . '/Resources << /Font << /F1 3 0 R >> >> /Contents ' . $contentObjectId . ' 0 R >>';
        $objects[$contentObjectId] = '<< /Length ' . strlen($stream) . " >>\nstream\n" . $stream . 'endstream';
    }
    $objects[2] = '<< /Type /Pages /Kids [' . implode(' ', $pageObjectIds) . '] /Count ' . $pageCount . ' >>';
    ksort($objects);
    $pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    $offsets = [0 => 0];
    foreach ($objects as $objectId => $object) {
        $offsets[$objectId] = strlen($pdf);
        $pdf .= $objectId . " 0 obj\n" . $object . "\nendobj\n";
    }
    $xrefOffset = strlen($pdf);
    $objectCount = max(array_keys($objects)) + 1;
    $pdf .= "xref\n0 " . $objectCount . "\n0000000000 65535 f \n";
    for ($objectId = 1; $objectId < $objectCount; $objectId++) {
        $pdf .= sprintf("%010d 00000 n \n", $offsets[$objectId]);
    }
    $pdf .= 'trailer << /Size ' . $objectCount . " /Root 1 0 R >>\nstartxref\n"
        . $xrefOffset . "\n%%EOF\n";
    return $pdf;
}

function awikReportXlsxColumn(int $number): string
{
    $column = '';
    while ($number > 0) {
        $remainder = ($number - 1) % 26;
        $column = chr(65 + $remainder) . $column;
        $number = intdiv($number - 1, 26);
    }
    return $column;
}

function awikReportXmlText(mixed $value): string
{
    $text = (string) ($value ?? '');
    if (preg_match('//u', $text) !== 1) {
        throw new RuntimeException('Report contains invalid UTF-8 text');
    }
    return htmlspecialchars($text, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

function awikReportXlsxContent(string $report, mixed $data): string
{
    if (!class_exists(ZipArchive::class)) {
        throw new RuntimeException('The PHP ZIP extension is required for Excel reports');
    }
    $export = awikReportExportData($report, $data);
    $columnCount = max(1, count($export['headers']));
    $lastColumn = awikReportXlsxColumn($columnCount);
    $sheetName = substr(str_replace(['[', ']', ':', '*', '?', '/', '\\'], ' ', $export['title']), 0, 31);
    $rows = [
        [[[$export['title'], 1]]],
        [[['Generated: ' . gmdate('Y-m-d H:i:s') . ' UTC', 1]]],
        [array_map(static fn (mixed $header): array => [$header, 2], $export['headers'])],
    ];
    if ($export['rows'] === []) {
        $rows[] = [[['No data available', 0]]];
    } else {
        foreach ($export['rows'] as $row) {
            $rows[] = [array_map(static fn (mixed $cell): array => [$cell, 0], $row)];
        }
    }
    if ($export['summary'] !== []) {
        $rows[] = [[]];
        $rows[] = [[['Summary', 1]]];
        foreach ($export['summary'] as $summaryLine) {
            $rows[] = [[[$summaryLine, 0]]];
        }
    }
    $sheetRows = '';
    foreach ($rows as $rowIndex => $row) {
        $cells = $row[0];
        $rowNumber = $rowIndex + 1;
        $cellXml = '';
        foreach ($cells as $columnIndex => $cell) {
            if (!is_array($cell) || count($cell) !== 2) {
                continue;
            }
            [$value, $style] = $cell;
            $reference = awikReportXlsxColumn($columnIndex + 1) . $rowNumber;
            $cellXml .= '<c r="' . $reference . '" t="inlineStr" s="' . (int) $style
                . '"><is><t xml:space="preserve">' . awikReportXmlText($value) . '</t></is></c>';
        }
        $sheetRows .= '<row r="' . $rowNumber . '">' . $cellXml . '</row>';
    }
    $mergeCells = '<mergeCells count="2"><mergeCell ref="A1:' . $lastColumn . '1"/>'
        . '<mergeCell ref="A2:' . $lastColumn . '2"/></mergeCells>';
    $sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        . '<sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/>'
        . '<sheetData>' . $sheetRows . '</sheetData>' . $mergeCells . '</worksheet>';
    $workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        . 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        . '<sheets><sheet name="' . awikReportXmlText($sheetName) . '" sheetId="1" r:id="rId1"/></sheets></workbook>';
    $contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        . '<Default Extension="xml" ContentType="application/xml"/>'
        . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        . '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        . '</Types>';
    $rootRelationships = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        . '</Relationships>';
    $workbookRelationships = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        . '</Relationships>';
    $stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        . '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>'
        . '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
        . '<fill><patternFill patternType="solid"><fgColor rgb="FF1E40AF"/><bgColor indexed="64"/></patternFill></fill></fills>'
        . '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        . '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        . '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
        . '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
        . '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

    $temporaryPath = tempnam(sys_get_temp_dir(), 'awik-report-xlsx-');
    if (!is_string($temporaryPath)) {
        throw new RuntimeException('Could not allocate temporary Excel archive');
    }
    $archive = new ZipArchive();
    $archiveOpened = false;
    try {
        if (!unlink($temporaryPath)) {
            throw new RuntimeException('Could not prepare temporary Excel archive');
        }
        $openResult = $archive->open($temporaryPath, ZipArchive::CREATE);
        if ($openResult !== true) {
            throw new RuntimeException('Could not create Excel report archive');
        }
        $archiveOpened = true;
        foreach ([
            '[Content_Types].xml' => $contentTypes,
            '_rels/.rels' => $rootRelationships,
            'xl/workbook.xml' => $workbookXml,
            'xl/_rels/workbook.xml.rels' => $workbookRelationships,
            'xl/styles.xml' => $stylesXml,
            'xl/worksheets/sheet1.xml' => $sheetXml,
        ] as $entryName => $entryContent) {
            if (!$archive->addFromString($entryName, $entryContent)) {
                throw new RuntimeException('Could not write Excel report component');
            }
        }
        if (!$archive->close()) {
            throw new RuntimeException('Could not finalize Excel report archive');
        }
        $archiveOpened = false;
        $content = file_get_contents($temporaryPath);
        if (!is_string($content) || !str_starts_with($content, "PK\x03\x04")) {
            throw new RuntimeException('Could not read generated Excel report');
        }
        return $content;
    } finally {
        if ($archiveOpened) {
            @$archive->close();
        }
        if (is_file($temporaryPath)) {
            unlink($temporaryPath);
        }
    }
}

function awikReportResponse(array $route, array $query, mixed $data): array
{
    if (!($route['download'] ?? false)) {
        return awikResponse(200, ['success' => true, 'data' => $data]);
    }

    $validated = awikValidateReportQuery($query);
    $format = $validated['format'] ?? '';
    if ($format === '') {
        $format = 'pdf';
    }
    $report = (string) ($route['kind'] ?? '');
    try {
        return match ($format) {
            'pdf' => [
                'statusCode' => 200,
                'headers' => [
                    'Content-Type' => 'application/pdf',
                    'Content-Disposition' => 'attachment; filename="' . $report . '-report.pdf"',
                ],
                'body' => awikReportPdfContent($report, $data),
            ],
            'excel' => [
                'statusCode' => 200,
                'headers' => [
                    'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'Content-Disposition' => 'attachment; filename="' . $report . '-report.xlsx"',
                ],
                'body' => awikReportXlsxContent($report, $data),
            ],
            'csv' => [
                'statusCode' => 200,
                'headers' => [
                    'Content-Type' => 'text/csv',
                    'Content-Disposition' => 'attachment; filename="' . $report . '-report.csv"',
                ],
                'body' => awikReportCsvContent($report, $data),
            ],
            default => throw new AwikApiException(400, 'Unsupported format: ' . $format . '. Use pdf, excel, or csv.'),
        };
    } catch (AwikApiException $exception) {
        throw $exception;
    } catch (Throwable) {
        throw new AwikApiException(400, 'Failed to generate report');
    }
}

function awikReportRouteMatches(string $method, string $path): ?array
{
    $basePath = '/api/v1/reports';
    $routePath = rtrim($path, '/') ?: '/';
    if ($routePath !== $basePath && !str_starts_with($routePath, $basePath . '/')) {
        return null;
    }

    if ($method !== 'GET') {
        return null;
    }

    if (preg_match('~^' . preg_quote($basePath, '~') . '/([^/]+)(?:/download)?$~', $routePath, $matches) !== 1) {
        return null;
    }

    $reportName = rawurldecode($matches[1]);
    $allowed = ['revenue', 'sales', 'customers', 'subscriptions', 'inventory', 'stock-movements', 'whatsapp'];
    if (!in_array($reportName, $allowed, true)) {
        return null;
    }

    $isDownload = str_ends_with($routePath, '/download');
    return ['kind' => $reportName, 'path' => $routePath, 'download' => $isDownload];
}

function awikHandleDashboardRequest(PDO $db, string $method, string $path, array $query, array $body, array $headers, string $responsePath, ?string $ipAddress): ?array
{
    $route = awikDashboardRouteMatches($method, $path);
    if ($route === null) {
        return null;
    }

    $user = awikRequireAuthenticatedUser($db, $headers);
    if (!in_array($user['role'] ?? null, ['ADMIN', 'STAFF'], true)) {
        throw new AwikApiException(403, 'Forbidden');
    }

    if ($route['kind'] === 'kpis') {
        $kpis = [
            'totalCustomers' => (int) $db->query('SELECT COUNT(*) FROM awik_customers WHERE deletedAt IS NULL')->fetchColumn(),
            'activeSubscriptions' => (int) $db->query("SELECT COUNT(*) FROM awik_subscriptions WHERE deletedAt IS NULL AND status = 'ACTIVE'")->fetchColumn(),
            'expiringSubscriptions' => (int) $db->query("SELECT COUNT(*) FROM awik_subscriptions WHERE deletedAt IS NULL AND status = 'EXPIRING_SOON'")->fetchColumn(),
            'totalRevenue' => (float) $db->query("SELECT COALESCE(SUM(totalAmount), 0) FROM awik_sales WHERE status = 'COMPLETED'")->fetchColumn(),
            'totalSales' => (int) $db->query("SELECT COUNT(*) FROM awik_sales WHERE status = 'COMPLETED'")->fetchColumn(),
            'todayRevenue' => (float) $db->query("SELECT COALESCE(SUM(totalAmount), 0) FROM awik_sales WHERE status = 'COMPLETED' AND DATE(createdAt) = CURDATE() ")->fetchColumn(),
            'todaySalesCount' => (int) $db->query("SELECT COUNT(*) FROM awik_sales WHERE status = 'COMPLETED' AND DATE(createdAt) = CURDATE() ")->fetchColumn(),
            'inventory' => [
                'totalProducts' => (int) $db->query('SELECT COUNT(*) FROM awik_products WHERE isActive = 1 AND deletedAt IS NULL')->fetchColumn(),
                'totalStock' => (int) $db->query('SELECT COALESCE(SUM(currentStock), 0) FROM awik_products WHERE deletedAt IS NULL')->fetchColumn(),
                'totalValue' => (float) $db->query('SELECT COALESCE(SUM(purchasePrice * currentStock), 0) FROM awik_products WHERE deletedAt IS NULL AND isActive = 1')->fetchColumn(),
                'lowStock' => (int) $db->query('SELECT COUNT(*) FROM awik_products WHERE deletedAt IS NULL AND currentStock <= minStock')->fetchColumn(),
            ],
            'whatsapp' => [
                'pendingMessages' => (int) $db->query("SELECT COUNT(*) FROM awik_whatsapp_messages WHERE status = 'pending'")->fetchColumn(),
                'configured' => false,
            ],
            'suspendedSubscriptions' => (int) $db->query("SELECT COUNT(*) FROM awik_subscriptions WHERE deletedAt IS NULL AND status = 'SUSPENDED'")->fetchColumn(),
        ];
        return awikResponse(200, ['success' => true, 'data' => $kpis]);
    }

    if ($route['kind'] === 'revenue-chart') {
        $period = awikValidateDashboardPeriod((string) ($query['period'] ?? 'monthly'));
        $salesStatement = $db->prepare(
            'SELECT totalAmount, createdAt FROM awik_sales WHERE status = ? ORDER BY createdAt ASC'
        );
        $salesStatement->execute(['COMPLETED']);
        $chart = [];
        foreach ($salesStatement->fetchAll() as $row) {
            $date = new DateTimeImmutable((string) $row['createdAt'], new DateTimeZone('UTC'));
            $key = '';
            if ($period === 'daily') {
                $key = $date->format('Y-m-d');
            } elseif ($period === 'weekly') {
                $key = $date->format('Y-W');
            } else {
                $key = $date->format('Y-m');
            }
            if (!isset($chart[$key])) {
                $chart[$key] = 0.0;
            }
            $chart[$key] += (float) $row['totalAmount'];
        }

        $data = [];
        foreach ($chart as $label => $revenue) {
            $data[] = ['date' => $label, 'revenue' => $revenue];
        }

        return awikResponse(200, ['success' => true, 'data' => $data]);
    }

    if ($route['kind'] === 'recent-activity') {
        $recentSales = $db->query('SELECT * FROM awik_sales ORDER BY createdAt DESC LIMIT 5')->fetchAll();
        $recentCustomers = $db->query('SELECT * FROM awik_customers WHERE deletedAt IS NULL ORDER BY createdAt DESC LIMIT 5')->fetchAll();
        $recentSubscriptions = $db->query('SELECT * FROM awik_subscriptions WHERE deletedAt IS NULL ORDER BY createdAt DESC LIMIT 5')->fetchAll();
        $recentMessages = $db->query('SELECT * FROM awik_whatsapp_messages ORDER BY createdAt DESC LIMIT 5')->fetchAll();

        return awikResponse(200, [
            'success' => true,
            'data' => [
                'recentSales' => $recentSales,
                'recentCustomers' => $recentCustomers,
                'recentSubscriptions' => $recentSubscriptions,
                'recentMessages' => $recentMessages,
            ],
        ]);
    }

    if ($route['kind'] === 'alerts') {
        $expiringStatement = $db->prepare(
            "SELECT s.*, c.firstName, c.lastName, c.phone, p.name AS planName FROM awik_subscriptions s "
            . 'LEFT JOIN awik_customers c ON c.id = s.customerId '
            . 'LEFT JOIN awik_plans p ON p.id = s.planId '
            . "WHERE s.deletedAt IS NULL AND s.status IN ('ACTIVE', 'EXPIRING_SOON') AND s.expiryDate <= DATE_ADD(NOW(), INTERVAL 3 DAY) ORDER BY s.expiryDate ASC LIMIT 5"
        );
        $expiringStatement->execute();

        $lowStockStatement = $db->prepare(
            'SELECT * FROM awik_products WHERE deletedAt IS NULL AND currentStock <= minStock ORDER BY currentStock ASC LIMIT 10'
        );
        $lowStockStatement->execute();

        $failedMessages = $db->prepare(
            "SELECT * FROM awik_whatsapp_messages WHERE status = 'failed' ORDER BY createdAt DESC LIMIT 5"
        );
        $failedMessages->execute();

        return awikResponse(200, [
            'success' => true,
            'data' => [
                'expiringSubscriptions' => $expiringStatement->fetchAll(),
                'lowStockProducts' => $lowStockStatement->fetchAll(),
                'failedWhatsAppMessages' => $failedMessages->fetchAll(),
            ],
        ]);
    }

    return awikJsonError(404, 'Not Found', null, $responsePath);
}

function awikHandleReportRequest(PDO $db, string $method, string $path, array $query, array $body, array $headers, string $responsePath, ?string $ipAddress): ?array
{
    $route = awikReportRouteMatches($method, $path);
    if ($route === null) {
        return null;
    }

    $user = awikRequireAuthenticatedUser($db, $headers);
    $report = $route['kind'];
    $adminOnly = in_array($report, ['revenue', 'subscriptions', 'whatsapp'], true);
    if ($adminOnly && ($user['role'] ?? null) !== 'ADMIN') {
        throw new AwikApiException(403, 'Forbidden');
    }
    if (!$adminOnly && !in_array($user['role'] ?? null, ['ADMIN', 'STAFF'], true)) {
        throw new AwikApiException(403, 'Forbidden');
    }

    awikValidateReportQuery($query);
    $range = awikValidateReportDateRange($query);
    $dateFrom = $range['dateFrom'];
    $dateTo = $range['dateTo'];
    $whereSql = '';
    $params = [];
    if (awikReportUsesDateRange($report) && $dateFrom !== null) {
        $whereSql .= ' AND createdAt >= ?';
        $params[] = $dateFrom;
    }
    if (awikReportUsesDateRange($report) && $dateTo !== null) {
        $whereSql .= ' AND createdAt <= ?';
        $params[] = $dateTo;
    }
    $responseFor = static fn (array $data): array => awikReportResponse($route, $query, $data);
    $limit = awikReportLocalRowLimit($report);

    switch ($report) {
        case 'revenue':
            $statement = $db->prepare('SELECT COALESCE(SUM(totalAmount), 0) AS totalRevenue, COUNT(*) AS totalPayments FROM awik_sales WHERE status = ?' . $whereSql);
            $statement->execute(array_merge(['COMPLETED'], $params));
            $summary = $statement->fetch();
            $methods = $db->prepare('SELECT paymentMethod AS method, COALESCE(SUM(totalAmount), 0) AS total, COUNT(*) AS count FROM awik_sales WHERE status = ?' . $whereSql . ' GROUP BY paymentMethod ORDER BY total DESC');
            $methods->execute(array_merge(['COMPLETED'], $params));
            $data = [
                'summary' => ['totalRevenue' => (float) ($summary['totalRevenue'] ?? 0), 'totalPayments' => (int) ($summary['totalPayments'] ?? 0)],
                'byMethod' => $methods->fetchAll(),
                'payments' => [],
            ];
            if ($route['download']) {
                $sales = $db->prepare(
                    'SELECT s.saleNumber, s.paymentMethod, s.totalAmount, s.createdAt, '
                    . 'c.firstName AS customerFirstName, c.lastName AS customerLastName '
                    . 'FROM awik_sales s LEFT JOIN awik_customers c ON c.id = s.customerId '
                    . 'WHERE s.status = ?'
                    . ($dateFrom !== null ? ' AND s.createdAt >= ?' : '')
                    . ($dateTo !== null ? ' AND s.createdAt <= ?' : '')
                    . ' ORDER BY s.createdAt DESC'
                );
                $sales->execute(array_merge(
                    ['COMPLETED'],
                    $dateFrom !== null ? [$dateFrom] : [],
                    $dateTo !== null ? [$dateTo] : []
                ));
                $data['sales'] = $sales->fetchAll();
            }
            return $responseFor($data);

        case 'sales':
            $salesWhere = $route['download']
                ? ' WHERE 1 = 1' . ($dateFrom !== null ? ' AND s.createdAt >= ?' : '') . ($dateTo !== null ? ' AND s.createdAt <= ?' : '')
                : ' WHERE 1 = 1' . $whereSql;
            $salesParams = $route['download']
                ? array_values(array_filter([$dateFrom, $dateTo], static fn (mixed $value): bool => $value !== null))
                : $params;
            $salesSelect = $route['download']
                ? 'SELECT s.*, c.firstName AS customerFirstName, c.lastName AS customerLastName FROM awik_sales s LEFT JOIN awik_customers c ON c.id = s.customerId'
                : 'SELECT * FROM awik_sales';
            $salesLimitSql = $route['download']
                ? ($limit === null ? '' : ' LIMIT ' . (int) $limit)
                : ' LIMIT 100';
            $statement = $db->prepare($salesSelect . $salesWhere . ' ORDER BY ' . ($route['download'] ? 's.createdAt' : 'createdAt') . ' DESC' . $salesLimitSql);
            $statement->execute($salesParams);
            $sales = $statement->fetchAll();
            if (!$route['download']) {
                return $responseFor($sales);
            }
            $totals = $db->prepare(
                'SELECT COALESCE(SUM(s.totalAmount), 0) AS totalAmount, COUNT(*) AS totalCount '
                . 'FROM awik_sales s' . $salesWhere
            );
            $totals->execute($salesParams);
            $statusCounts = $db->prepare(
                'SELECT s.status, COUNT(*) AS count FROM awik_sales s'
                . $salesWhere . ' GROUP BY s.status ORDER BY s.status ASC'
            );
            $statusCounts->execute($salesParams);
            $summary = $totals->fetch();
            return $responseFor([
                'summary' => [
                    'totalAmount' => (float) ($summary['totalAmount'] ?? 0),
                    'totalCount' => (int) ($summary['totalCount'] ?? 0),
                ],
                'byStatus' => $statusCounts->fetchAll(),
                'sales' => $sales,
            ]);

        case 'customers':
            if ($route['download']) {
                $summary = $db->query(
                    'SELECT COUNT(*) AS totalCustomers, '
                    . 'SUM(CASE WHEN whatsappNumber IS NOT NULL THEN 1 ELSE 0 END) AS withWhatsapp '
                    . 'FROM awik_customers WHERE deletedAt IS NULL'
                )->fetch();
                $statuses = $db->query(
                    'SELECT status, COUNT(*) AS count FROM awik_customers '
                    . 'WHERE deletedAt IS NULL GROUP BY status ORDER BY status ASC'
                )->fetchAll();
                $customers = $db->query(
                    'SELECT firstName, lastName, phone, whatsappNumber, status, createdAt '
                    . 'FROM awik_customers WHERE deletedAt IS NULL ORDER BY createdAt DESC LIMIT 20'
                )->fetchAll();
                return $responseFor([
                    'summary' => [
                        'totalCustomers' => (int) ($summary['totalCustomers'] ?? 0),
                        'withWhatsapp' => (int) ($summary['withWhatsapp'] ?? 0),
                    ],
                    'byStatus' => $statuses,
                    'recentCustomers' => $customers,
                ]);
            }
            $statement = $db->prepare('SELECT * FROM awik_customers WHERE deletedAt IS NULL ORDER BY createdAt DESC LIMIT ' . (int) ($limit ?? 100));
            $statement->execute($params);
            return $responseFor($statement->fetchAll());

        case 'subscriptions':
            if ($route['download']) {
                $statement = $db->query('SELECT status, COUNT(*) AS count FROM awik_subscriptions WHERE deletedAt IS NULL GROUP BY status ORDER BY status ASC');
                $byStatus = $statement->fetchAll();
                $total = 0;
                $active = 0;
                foreach ($byStatus as $row) {
                    $count = (int) ($row['count'] ?? 0);
                    $total += $count;
                    if (($row['status'] ?? null) === 'ACTIVE') {
                        $active = $count;
                    }
                }
                return $responseFor([
                    'summary' => ['totalSubscriptions' => $total, 'totalActive' => $active],
                    'byStatus' => $byStatus,
                    'byPlan' => [],
                ]);
            }
            $statement = $db->prepare('SELECT * FROM awik_subscriptions WHERE deletedAt IS NULL ORDER BY createdAt DESC LIMIT 100');
            $statement->execute($params);
            return $responseFor($statement->fetchAll());

        case 'inventory':
            if ($route['download']) {
                $summary = $db->query(
                    'SELECT COUNT(*) AS totalItems, COALESCE(SUM(currentStock), 0) AS totalQuantity, '
                    . 'COALESCE(SUM(purchasePrice * currentStock), 0) AS totalValue '
                    . 'FROM awik_products WHERE deletedAt IS NULL'
                )->fetch();
                $categories = $db->query(
                    'SELECT COALESCE(c.name, \'Uncategorized\') AS category, COUNT(*) AS count, '
                    . 'COALESCE(SUM(p.currentStock), 0) AS totalStock, COALESCE(SUM(p.purchasePrice * p.currentStock), 0) AS value '
                    . 'FROM awik_products p LEFT JOIN awik_inventory_categories c ON c.id = p.categoryId '
                    . 'WHERE p.deletedAt IS NULL GROUP BY c.name ORDER BY c.name ASC'
                )->fetchAll();
                return $responseFor([
                    'summary' => [
                        'totalItems' => (int) ($summary['totalItems'] ?? 0),
                        'totalQuantity' => (int) ($summary['totalQuantity'] ?? 0),
                        'totalValue' => (float) ($summary['totalValue'] ?? 0),
                    ],
                    'byCategory' => $categories,
                ]);
            }
            $statement = $db->prepare('SELECT * FROM awik_products WHERE deletedAt IS NULL ORDER BY updatedAt DESC LIMIT 100');
            $statement->execute($params);
            return $responseFor($statement->fetchAll());

        case 'stock-movements':
            $movementWhere = $route['download']
                ? ' WHERE 1 = 1' . ($dateFrom !== null ? ' AND m.createdAt >= ?' : '') . ($dateTo !== null ? ' AND m.createdAt <= ?' : '')
                : ' WHERE 1 = 1' . $whereSql;
            $movementParams = $route['download']
                    ? array_values(array_filter([$dateFrom, $dateTo], static fn (mixed $value): bool => $value !== null))
                    : $params;
            $movementSelect = $route['download']
                    ? 'SELECT m.*, p.name AS productName, u.firstName AS userFirstName, u.lastName AS userLastName '
                    . 'FROM awik_stock_movements m LEFT JOIN awik_products p ON p.id = m.productId '
                    . 'LEFT JOIN awik_users u ON u.id = m.userId'
                    : 'SELECT * FROM awik_stock_movements';
            $movementLimitSql = $route['download']
                ? ($limit === null ? '' : ' LIMIT ' . (int) $limit)
                : ' LIMIT 100';
            $statement = $db->prepare($movementSelect . $movementWhere . ' ORDER BY ' . ($route['download'] ? 'm.createdAt' : 'createdAt') . ' DESC' . $movementLimitSql);
            $statement->execute($movementParams);
            $movements = $statement->fetchAll();
            if (!$route['download']) {
                    return $responseFor($movements);
            }
            $movementSummary = $db->prepare(
                    'SELECT COUNT(*) AS totalMovements, '
                    . 'COALESCE(SUM(CASE WHEN m.movementType IN (\'PURCHASE\', \'RETURN\', \'ADJUSTMENT\') AND m.quantity > 0 THEN m.quantity ELSE 0 END), 0) AS inbound, '
                    . 'COALESCE(SUM(CASE WHEN m.movementType IN (\'DAMAGED\', \'LOST\', \'SALE\') OR m.quantity < 0 THEN ABS(m.quantity) ELSE 0 END), 0) AS outbound '
                    . 'FROM awik_stock_movements m' . $movementWhere
            );
            $movementSummary->execute($movementParams);
            $summary = $movementSummary->fetch();
            return $responseFor([
                    'summary' => [
                        'totalMovements' => (int) ($summary['totalMovements'] ?? 0),
                        'inbound' => (int) ($summary['inbound'] ?? 0),
                        'outbound' => (int) ($summary['outbound'] ?? 0),
                    ],
                    'movements' => $movements,
            ]);

        case 'whatsapp':
            if ($route['download']) {
                    $statusRows = $db->prepare(
                        'SELECT status, COUNT(*) AS count FROM awik_whatsapp_messages'
                        . $whereSql . ' GROUP BY status ORDER BY status ASC'
                    );
                    $statusRows->execute($params);
                    $byStatus = $statusRows->fetchAll();
                    $statusCounts = [];
                    $totalMessages = 0;
                    foreach ($byStatus as $statusRow) {
                        $status = strtolower((string) ($statusRow['status'] ?? ''));
                        $count = (int) ($statusRow['count'] ?? 0);
                        $statusCounts[$status] = $count;
                        $totalMessages += $count;
                    }
                    $delivered = ($statusCounts['sent'] ?? 0) + ($statusCounts['delivered'] ?? 0) + ($statusCounts['read'] ?? 0);
                    $failed = $statusCounts['failed'] ?? 0;
                    $statement = $db->prepare(
                        'SELECT * FROM awik_whatsapp_messages WHERE 1 = 1' . $whereSql
                        . ' ORDER BY createdAt DESC LIMIT ' . (int) ($limit ?? 50)
                    );
                    $statement->execute($params);
                    return $responseFor([
                        'summary' => [
                            'totalMessages' => $totalMessages,
                            'delivered' => $delivered,
                            'failed' => $failed,
                            'deliveryRate' => $delivered + $failed === 0 ? null : round($delivered / ($delivered + $failed), 3),
                        ],
                        'byStatus' => $byStatus,
                        'messages' => $statement->fetchAll(),
                    ]);
            }
            $statement = $db->prepare('SELECT * FROM awik_whatsapp_messages WHERE 1 = 1' . $whereSql . ' ORDER BY createdAt DESC LIMIT ' . (int) ($limit ?? 100));
            $statement->execute($params);
            return $responseFor($statement->fetchAll());

        default:
            return awikJsonError(404, 'Not Found', null, $responsePath);
    }
}

// ─── WhatsApp messaging ────────────────────────────────────────────────
//
// Mirrors apps/api/src/modules/whatsapp. Routes used by the dashboard
// screens: GET status, POST test-connection, POST send, GET messages,
// GET reminders, GET reminders/due, POST reminders/trigger,
// GET/POST templates. The Meta Cloud API integration is optional: when no
// provider credentials are configured, outbound messages are queued as
// `pending` (never reported as sent). The Meta-facing webhook is not
// implemented here because its signature verification needs raw request
// bytes that the current HTTP entrypoint does not expose; it is tracked as
// an unconfigured integration in RELEASE_FINALIZATION_REPORT.md.

function awikWhatsAppRouteMatches(string $method, string $path): ?array
{
    $basePath = '/api/v1/whatsapp';
    $routePath = rtrim($path, '/') ?: '/';
    if ($routePath !== $basePath && !str_starts_with($routePath, $basePath . '/')) {
        return null;
    }

    $routes = [
        'GET' => [
            '/api/v1/whatsapp/status' => 'status',
            '/api/v1/whatsapp/messages' => 'messages',
            '/api/v1/whatsapp/templates' => 'templates',
            '/api/v1/whatsapp/reminders' => 'reminders',
            '/api/v1/whatsapp/reminders/due' => 'reminders-due',
        ],
        'POST' => [
            '/api/v1/whatsapp/test-connection' => 'test-connection',
            '/api/v1/whatsapp/send' => 'send',
            '/api/v1/whatsapp/templates' => 'template-save',
            '/api/v1/whatsapp/reminders/trigger' => 'reminders-trigger',
        ],
    ];

    $kind = $routes[$method][$routePath] ?? null;
    if ($kind === null) {
        return null;
    }

    return ['kind' => $kind, 'path' => $routePath];
}

function awikHandleWhatsAppRequest(PDO $db, string $method, string $path, array $query, array $body, array $headers, string $responsePath, ?string $ipAddress): ?array
{
    $route = awikWhatsAppRouteMatches($method, $path);
    if ($route === null) {
        return null;
    }

    $kind = $route['kind'];
    $user = awikRequireAuthenticatedUser($db, $headers);
    if (!in_array($user['role'] ?? null, ['ADMIN', 'STAFF'], true)) {
        throw new AwikApiException(403, 'Forbidden');
    }

    if ($kind === 'status') {
        return awikResponse(200, ['success' => true, 'data' => awikWhatsAppStatusDetails($db)]);
    }

    if ($kind === 'test-connection') {
        awikRequireAdminUser($user);
        return awikResponse(200, ['success' => true, 'data' => awikWhatsAppTestConnection($db)]);
    }

    if ($kind === 'send') {
        return awikWhatsAppHandleSend($db, $body);
    }

    if ($kind === 'messages') {
        return awikWhatsAppHandleMessages($db, $query);
    }

    if ($kind === 'templates') {
        return awikWhatsAppHandleTemplates($db, $query);
    }

    if ($kind === 'template-save') {
        awikRequireAdminUser($user);
        return awikWhatsAppHandleSaveTemplate($db, $body, $user, $ipAddress, $headers);
    }

    if ($kind === 'reminders') {
        return awikWhatsAppHandleReminders($db, $query);
    }

    if ($kind === 'reminders-due') {
        $due = awikWhatsAppDueReminders($db);
        return awikResponse(200, ['success' => true, 'data' => ['count' => count($due), 'reminders' => $due]]);
    }

    if ($kind === 'reminders-trigger') {
        return awikWhatsAppHandleRemindersTrigger($db, $user);
    }

    return awikJsonError(404, 'Not Found', null, $responsePath);
}

function awikWhatsAppReadSettings(PDO $db, array $keys): array
{
    if ($keys === []) {
        return [];
    }
    $placeholders = implode(', ', array_fill(0, count($keys), '?'));
    $statement = $db->prepare('SELECT `key`, `value` FROM awik_company_settings WHERE `key` IN (' . $placeholders . ')');
    $statement->execute(array_values($keys));
    $map = [];
    foreach ($statement->fetchAll() as $row) {
        $map[(string) $row['key']] = (string) $row['value'];
    }

    return $map;
}

function awikWhatsAppSettingValue(PDO $db, string $key, string $fallback = ''): string
{
    $map = awikWhatsAppReadSettings($db, [$key]);

    return $map[$key] ?? $fallback;
}

function awikWhatsAppEnvApiUrl(): string
{
    $explicit = trim(awikMigrationEnv('WHATSAPP_API_URL', ''));
    if ($explicit !== '') {
        return rtrim($explicit, '/');
    }
    $version = trim(awikMigrationEnv('WHATSAPP_API_VERSION', 'v18.0'));
    if ($version === '') {
        $version = 'v18.0';
    }

    return 'https://graph.facebook.com/' . $version;
}

function awikWhatsAppProviderConfig(PDO $db): array
{
    $settings = awikWhatsAppReadSettings($db, [
        'whatsapp.phoneNumberId', 'whatsapp.phone_number_id',
        'whatsapp.accessToken', 'whatsapp.access_token', 'whatsapp.apiUrl',
    ]);

    $phoneNumberId = '';
    foreach (['whatsapp.phoneNumberId', 'whatsapp.phone_number_id'] as $key) {
        if (($settings[$key] ?? '') !== '') {
            $phoneNumberId = trim($settings[$key]);
            break;
        }
    }
    $accessToken = '';
    foreach (['whatsapp.accessToken', 'whatsapp.access_token'] as $key) {
        if (($settings[$key] ?? '') !== '') {
            $accessToken = trim($settings[$key]);
            break;
        }
    }
    $apiUrl = trim($settings['whatsapp.apiUrl'] ?? '');
    if ($apiUrl === '') {
        $apiUrl = awikWhatsAppEnvApiUrl();
    }
    if ($phoneNumberId === '') {
        $phoneNumberId = trim(awikMigrationEnv('WHATSAPP_PHONE_NUMBER_ID', ''));
    }
    if ($accessToken === '') {
        $accessToken = trim(awikMigrationEnv('WHATSAPP_API_TOKEN', ''));
        if ($accessToken === '') {
            $accessToken = trim(awikMigrationEnv('WHATSAPP_ACCESS_TOKEN', ''));
        }
    }

    return [
        'phoneNumberId' => $phoneNumberId,
        'accessToken' => $accessToken,
        'apiUrl' => rtrim($apiUrl, '/'),
        'configured' => $phoneNumberId !== '' && $accessToken !== '',
    ];
}

function awikWhatsAppStatusDetails(PDO $db): array
{
    $settings = awikWhatsAppReadSettings($db, [
        'whatsapp.phoneNumberId', 'whatsapp.businessAccountId', 'whatsapp.webhookVerifyToken',
        'reminder.enabled_5d', 'reminder.enabled_3d', 'reminder.enabled_1d', 'reminder.enabled_expiry',
        'reminder.offset_5d', 'reminder.offset_3d', 'reminder.offset_1d',
    ]);
    $config = awikWhatsAppProviderConfig($db);

    $enabled = static fn (string $key): bool => ($settings[$key] ?? 'true') !== 'false';
    $text = static fn (string $key, string $fallback): string => (($settings[$key] ?? '') !== '') ? $settings[$key] : $fallback;

    return [
        'configured' => $config['configured'],
        'phoneNumberId' => $config['phoneNumberId'] !== '' ? $config['phoneNumberId'] : ($settings['whatsapp.phoneNumberId'] ?? ''),
        'hasToken' => $config['accessToken'] !== '',
        'businessAccountId' => $settings['whatsapp.businessAccountId'] ?? '',
        'webhookVerifyToken' => $settings['whatsapp.webhookVerifyToken'] ?? 'awiknet-webhook-secret',
        'reminders' => [
            'enabled5d' => $enabled('reminder.enabled_5d'),
            'enabled3d' => $enabled('reminder.enabled_3d'),
            'enabled1d' => $enabled('reminder.enabled_1d'),
            'enabledExpiry' => $enabled('reminder.enabled_expiry'),
            'offset5d' => $text('reminder.offset_5d', '5'),
            'offset3d' => $text('reminder.offset_3d', '3'),
            'offset1d' => $text('reminder.offset_1d', '1'),
        ],
    ];
}

function awikWhatsAppHttpRequest(string $method, string $url, string $accessToken, ?string $payload = null): array
{
    $headers = ['Authorization: Bearer ' . $accessToken, 'Content-Type: application/json'];

    if (function_exists('curl_init')) {
        $handle = curl_init($url);
        if ($handle === false) {
            return ['ok' => false, 'status' => 0, 'body' => null, 'error' => 'HTTP client unavailable'];
        }
        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_CONNECTTIMEOUT => 10,
        ];
        if ($payload !== null) {
            $options[CURLOPT_POSTFIELDS] = $payload;
        }
        curl_setopt_array($handle, $options);
        $responseBody = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
        $error = curl_error($handle);
        curl_close($handle);

        if ($responseBody === false) {
            return ['ok' => false, 'status' => 0, 'body' => null, 'error' => $error !== '' ? $error : 'network request failed'];
        }
        $decoded = json_decode((string) $responseBody, true);

        return [
            'ok' => $status >= 200 && $status < 300,
            'status' => $status,
            'body' => is_array($decoded) ? $decoded : null,
            'error' => null,
        ];
    }

    $context = stream_context_create([
        'http' => [
            'method' => $method,
            'header' => implode("\r\n", $headers) . "\r\n",
            'timeout' => 15,
            'ignore_errors' => true,
            'content' => $payload ?? '',
        ],
    ]);
    $responseBody = @file_get_contents($url, false, $context);
    if ($responseBody === false) {
        return ['ok' => false, 'status' => 0, 'body' => null, 'error' => 'network request failed (allow_url_fopen may be disabled)'];
    }

    $status = 0;
    foreach ($http_response_header ?? [] as $line) {
        if (preg_match('~^HTTP/\S+\s+(\d{3})~', (string) $line, $matches) === 1) {
            $status = (int) $matches[1];
            break;
        }
    }
    $decoded = json_decode((string) $responseBody, true);

    return [
        'ok' => $status >= 200 && $status < 300,
        'status' => $status,
        'body' => is_array($decoded) ? $decoded : null,
        'error' => null,
    ];
}

function awikWhatsAppHttpErrorMessage(array $http): string
{
    if (is_array($http['body']) && isset($http['body']['error']['message'])) {
        if (isset($http['body']['error']['code'])) {
            return 'WhatsApp API error ' . $http['body']['error']['code'] . ': ' . (string) $http['body']['error']['message'];
        }
        return (string) $http['body']['error']['message'];
    }
    if (($http['error'] ?? null) !== null && (string) $http['error'] !== '') {
        return (string) $http['error'];
    }

    return 'HTTP ' . (int) $http['status'];
}

function awikWhatsAppTestConnection(PDO $db): array
{
    $config = awikWhatsAppProviderConfig($db);
    if (!$config['configured']) {
        return [
            'success' => false,
            'message' => 'Phone Number ID and Access Token are required to test WhatsApp connection.',
        ];
    }

    $url = $config['apiUrl'] . '/' . rawurlencode($config['phoneNumberId'])
        . '?fields=verified_name,display_phone_number,quality_rating,code_verification_status';
    $http = awikWhatsAppHttpRequest('GET', $url, $config['accessToken']);

    if (!$http['ok']) {
        return [
            'success' => false,
            'message' => 'Meta API error: ' . awikWhatsAppHttpErrorMessage($http),
        ];
    }

    $body = is_array($http['body']) ? $http['body'] : [];
    $verifiedName = (string) ($body['verified_name'] ?? 'AWIK NET');
    $displayPhone = (string) ($body['display_phone_number'] ?? $config['phoneNumberId']);

    return [
        'success' => true,
        'message' => 'Connected successfully to WhatsApp Cloud API. Verified Name: "' . $verifiedName . '" (' . $displayPhone . ')',
    ];
}

function awikWhatsAppNormalizePhone(string $phone): string
{
    $cleaned = preg_replace('/[^0-9+]/', '', $phone) ?? '';

    return str_starts_with($cleaned, '+') ? substr($cleaned, 1) : $cleaned;
}

function awikWhatsAppSendText(array $config, string $to, string $body): array
{
    if (!$config['configured']) {
        return ['success' => false, 'error' => 'WhatsApp API not configured'];
    }

    $payload = json_encode([
        'messaging_product' => 'whatsapp',
        'recipient_type' => 'individual',
        'to' => awikWhatsAppNormalizePhone($to),
        'type' => 'text',
        'text' => ['preview_url' => false, 'body' => $body],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

    $url = $config['apiUrl'] . '/' . rawurlencode($config['phoneNumberId']) . '/messages';
    $http = awikWhatsAppHttpRequest('POST', $url, $config['accessToken'], $payload);

    if (!$http['ok']) {
        return ['success' => false, 'error' => awikWhatsAppHttpErrorMessage($http)];
    }

    $messageId = null;
    if (is_array($http['body']) && isset($http['body']['messages'][0]['id'])) {
        $messageId = (string) $http['body']['messages'][0]['id'];
    }

    return ['success' => true, 'messageId' => $messageId];
}

function awikWhatsAppIsoDate(?string $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    try {
        return (new DateTimeImmutable($value, new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone('UTC'))
            ->format('Y-m-d\TH:i:s.v\Z');
    } catch (Throwable) {
        return null;
    }
}

function awikWhatsAppUtcDate(string $value): ?DateTimeImmutable
{
    if ($value === '') {
        return null;
    }
    try {
        return new DateTimeImmutable($value, new DateTimeZone('UTC'));
    } catch (Throwable) {
        return null;
    }
}

function awikWhatsAppValidateListQuery(array $query, array $extraAllowed = []): array
{
    $allowed = array_merge(['page', 'limit'], $extraAllowed);
    $errors = [];
    foreach (array_keys($query) as $field) {
        if (!in_array($field, $allowed, true)) {
            $errors[] = 'property ' . (string) $field . ' should not exist';
        }
    }

    $page = $query['page'] ?? '1';
    $limit = $query['limit'] ?? '20';
    foreach (['page' => $page, 'limit' => $limit] as $field => $value) {
        if (!is_scalar($value) || filter_var((string) $value, FILTER_VALIDATE_INT) === false) {
            $errors[] = $field . ' must be an integer number';
            continue;
        }
        if ((int) $value < 1) {
            $errors[] = $field . ' must not be less than 1';
        }
        if ($field === 'limit' && (int) $value > 100) {
            $errors[] = 'limit must not be greater than 100';
        }
    }
    foreach (['search', 'status', 'customerId', 'reminderType', 'dateFrom', 'dateTo'] as $field) {
        if (isset($query[$field]) && !is_string($query[$field])) {
            $errors[] = $field . ' must be a string';
        }
    }
    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }

    $stringOrNull = static fn (string $field): ?string => (isset($query[$field]) && $query[$field] !== '') ? (string) $query[$field] : null;

    return [
        'page' => (int) $page,
        'limit' => (int) $limit,
        'search' => isset($query['search']) ? awikSanitizePlanString((string) $query['search']) : null,
        'status' => $stringOrNull('status'),
        'customerId' => $stringOrNull('customerId'),
        'reminderType' => $stringOrNull('reminderType'),
        'dateFrom' => $stringOrNull('dateFrom'),
        'dateTo' => $stringOrNull('dateTo'),
    ];
}

function awikWhatsAppValidateStatus(?string $status): ?string
{
    if ($status === null) {
        return null;
    }
    if (!in_array($status, ['pending', 'sent', 'delivered', 'read', 'failed'], true)) {
        throw new AwikApiException(400, 'Validation failed', [
            'status must be one of the following values: pending, sent, delivered, read, failed',
        ]);
    }

    return $status;
}

function awikWhatsAppNormalizeDateFilter(?string $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    try {
        return (new DateTimeImmutable($value, new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone('UTC'))
            ->format('Y-m-d H:i:s');
    } catch (Throwable) {
        throw new AwikApiException(400, 'Validation failed', ['date filter must be a valid date string']);
    }
}

function awikWhatsAppMessageBody(array $body): string
{
    if (isset($body['body']) && is_string($body['body'])) {
        return $body['body'];
    }
    if (isset($body['messageBody']) && is_string($body['messageBody'])) {
        return $body['messageBody'];
    }

    return '';
}

function awikWhatsAppCreateAndSend(PDO $db, array $params): array
{
    $messageId = awikUuidV4();
    $db->prepare(
        'INSERT INTO awik_whatsapp_messages (id, recipientPhone, customerId, messageBody, status, templateType, referenceId, scheduledFor) '
        . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $messageId,
        $params['recipientPhone'],
        $params['customerId'] ?? null,
        $params['messageBody'],
        'pending',
        $params['templateType'] ?? null,
        $params['referenceId'] ?? null,
        $params['scheduledFor'] ?? null,
    ]);

    if (($params['scheduledFor'] ?? null) !== null) {
        return ['messageId' => $messageId, 'status' => 'pending', 'sentImmediately' => false];
    }

    $config = awikWhatsAppProviderConfig($db);
    if (!$config['configured']) {
        return ['messageId' => $messageId, 'status' => 'pending', 'sentImmediately' => false];
    }

    $sendResult = awikWhatsAppSendText($config, (string) $params['recipientPhone'], (string) $params['messageBody']);
    if ($sendResult['success']) {
        $db->prepare(
            'UPDATE awik_whatsapp_messages SET status = ?, externalMessageId = ?, sentAt = '
            . awikCurrentTimestampSql($db) . ', errorMessage = NULL WHERE id = ?'
        )->execute(['sent', $sendResult['messageId'] ?? null, $messageId]);

        return ['messageId' => $messageId, 'status' => 'sent', 'sentImmediately' => true, 'result' => ['success' => true]];
    }

    $db->prepare(
        'UPDATE awik_whatsapp_messages SET status = ?, retryCount = 1, errorMessage = ? WHERE id = ?'
    )->execute(['failed', $sendResult['error'] ?? 'WhatsApp send failed', $messageId]);

    return [
        'messageId' => $messageId,
        'status' => 'failed',
        'sentImmediately' => true,
        'result' => ['success' => false, 'error' => $sendResult['error'] ?? null],
    ];
}

function awikWhatsAppHandleSend(PDO $db, array $body): array
{
    $recipientPhone = isset($body['recipientPhone']) && is_string($body['recipientPhone']) ? trim($body['recipientPhone']) : '';
    $messageBody = trim(awikWhatsAppMessageBody($body));
    $customerId = isset($body['customerId']) && is_string($body['customerId']) ? trim($body['customerId']) : '';

    $errors = [];
    if ($recipientPhone === '') {
        $errors[] = 'recipientPhone should not be empty';
    } elseif (mb_strlen($recipientPhone) > 30) {
        $errors[] = 'recipientPhone must be 30 characters or fewer';
    }
    if ($messageBody === '') {
        $errors[] = 'body should not be empty';
    }
    if ($customerId !== '' && mb_strlen($customerId) > 36) {
        $errors[] = 'customerId must be 36 characters or fewer';
    }
    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }

    $scheduledFor = null;
    if (array_key_exists('scheduledFor', $body) && $body['scheduledFor'] !== null && $body['scheduledFor'] !== '') {
        if (!is_string($body['scheduledFor'])) {
            throw new AwikApiException(400, 'Validation failed', ['scheduledFor must be a string']);
        }
        try {
            $scheduled = new DateTimeImmutable($body['scheduledFor'], new DateTimeZone('UTC'));
        } catch (Throwable) {
            throw new AwikApiException(400, 'Validation failed', ['scheduledFor must be a valid date string']);
        }
        if ($scheduled->getTimestamp() <= time()) {
            throw new AwikApiException(400, 'scheduledFor must be in the future');
        }
        $scheduledFor = $scheduled->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    if ($customerId !== '') {
        $customerStatement = $db->prepare('SELECT id FROM awik_customers WHERE id = ? AND deletedAt IS NULL LIMIT 1');
        $customerStatement->execute([$customerId]);
        if (!$customerStatement->fetch()) {
            throw new AwikApiException(404, 'Customer not found');
        }
    }

    $result = awikWhatsAppCreateAndSend($db, [
        'recipientPhone' => $recipientPhone,
        'customerId' => $customerId !== '' ? $customerId : null,
        'messageBody' => $messageBody,
        'templateType' => 'manual',
        'referenceId' => null,
        'scheduledFor' => $scheduledFor,
    ]);

    return awikResponse(201, ['success' => true, 'data' => $result]);
}

function awikWhatsAppNormalizeMessage(array $row): array
{
    $customer = null;
    if (($row['customer_id'] ?? null) !== null) {
        $customer = [
            'id' => $row['customer_id'],
            'firstName' => $row['customer_firstName'],
            'lastName' => $row['customer_lastName'],
            'phone' => $row['customer_phone'],
        ];
    }

    return [
        'id' => $row['id'],
        'recipientPhone' => $row['recipientPhone'],
        'customerId' => $row['customerId'] ?? null,
        'messageBody' => $row['messageBody'],
        'status' => $row['status'],
        'templateType' => $row['templateType'] ?? null,
        'externalId' => $row['externalMessageId'] ?? null,
        'sentAt' => awikWhatsAppIsoDate($row['sentAt'] ?? null),
        'deliveredAt' => awikWhatsAppIsoDate($row['deliveredAt'] ?? null),
        'readAt' => awikWhatsAppIsoDate($row['readAt'] ?? null),
        'errorMessage' => $row['errorMessage'] ?? null,
        'createdAt' => awikWhatsAppIsoDate($row['createdAt'] ?? null),
        'customer' => $customer,
    ];
}

function awikWhatsAppHandleMessages(PDO $db, array $query): array
{
    $filters = awikWhatsAppValidateListQuery($query, ['status', 'search', 'customerId', 'dateFrom', 'dateTo']);
    $status = awikWhatsAppValidateStatus($filters['status']);
    $dateFrom = awikWhatsAppNormalizeDateFilter($filters['dateFrom']);
    $dateTo = awikWhatsAppNormalizeDateFilter($filters['dateTo']);

    $where = [];
    $params = [];
    if ($status !== null) {
        $where[] = 'm.status = ?';
        $params[] = $status;
    }
    if ($filters['customerId'] !== null) {
        $where[] = 'm.customerId = ?';
        $params[] = $filters['customerId'];
    }
    if ($filters['search'] !== null && $filters['search'] !== '') {
        $where[] = 'INSTR(m.recipientPhone, ?) > 0';
        $params[] = $filters['search'];
    }
    if ($dateFrom !== null) {
        $where[] = 'm.createdAt >= ?';
        $params[] = $dateFrom;
    }
    if ($dateTo !== null) {
        $where[] = 'm.createdAt <= ?';
        $params[] = $dateTo;
    }
    $whereSql = $where === [] ? '1 = 1' : implode(' AND ', $where);

    $countStatement = $db->prepare('SELECT COUNT(*) FROM awik_whatsapp_messages m WHERE ' . $whereSql);
    $countStatement->execute($params);
    $total = (int) $countStatement->fetchColumn();

    $sql = 'SELECT m.*, c.id AS customer_id, c.firstName AS customer_firstName, '
        . 'c.lastName AS customer_lastName, c.phone AS customer_phone '
        . 'FROM awik_whatsapp_messages m LEFT JOIN awik_customers c ON c.id = m.customerId '
        . 'WHERE ' . $whereSql . ' ORDER BY m.createdAt DESC LIMIT ? OFFSET ?';
    $statement = $db->prepare($sql);
    $index = 1;
    foreach ($params as $param) {
        $statement->bindValue($index++, $param);
    }
    $statement->bindValue($index++, $filters['limit'], PDO::PARAM_INT);
    $statement->bindValue($index, ($filters['page'] - 1) * $filters['limit'], PDO::PARAM_INT);
    $statement->execute();

    $data = [];
    foreach ($statement->fetchAll() as $row) {
        $data[] = awikWhatsAppNormalizeMessage($row);
    }

    return awikResponse(200, [
        'success' => true,
        'data' => ['data' => $data, 'total' => $total, 'page' => $filters['page'], 'limit' => $filters['limit']],
    ]);
}

function awikWhatsAppTemplateVariables(string $template): array
{
    if (preg_match_all('/\{\{(\w+)\}\}/', $template, $matches) === false || !isset($matches[1])) {
        return [];
    }

    return array_values(array_unique($matches[1]));
}

function awikWhatsAppNormalizeTemplate(array $row): array
{
    $key = (string) $row['key'];
    $value = (string) ($row['value'] ?? '');

    return [
        'id' => $row['id'],
        'name' => preg_replace('/^whatsapp\./', '', $key) ?? $key,
        'key' => $key,
        'type' => str_starts_with($key, 'whatsapp.reminder') ? 'reminder' : 'general',
        'body' => $value,
        'variables' => awikWhatsAppTemplateVariables($value),
        'isActive' => $value !== '',
        'language' => 'en',
        'description' => $row['description'] ?? null,
        'createdAt' => awikWhatsAppIsoDate($row['createdAt'] ?? null),
        'updatedAt' => awikWhatsAppIsoDate($row['updatedAt'] ?? null),
    ];
}

function awikWhatsAppHandleTemplates(PDO $db, array $query): array
{
    $filters = awikWhatsAppValidateListQuery($query, ['search']);

    $where = "`key` LIKE 'whatsapp.%'";
    $params = [];
    if ($filters['search'] !== null && $filters['search'] !== '') {
        $where .= ' AND LOWER(`key`) LIKE ?';
        $params[] = '%' . mb_strtolower($filters['search']) . '%';
    }

    $countStatement = $db->prepare('SELECT COUNT(*) FROM awik_company_settings WHERE ' . $where);
    $countStatement->execute($params);
    $total = (int) $countStatement->fetchColumn();

    $statement = $db->prepare(
        'SELECT * FROM awik_company_settings WHERE ' . $where . ' ORDER BY `key` ASC LIMIT ? OFFSET ?'
    );
    $index = 1;
    foreach ($params as $param) {
        $statement->bindValue($index++, $param);
    }
    $statement->bindValue($index++, $filters['limit'], PDO::PARAM_INT);
    $statement->bindValue($index, ($filters['page'] - 1) * $filters['limit'], PDO::PARAM_INT);
    $statement->execute();

    $data = [];
    foreach ($statement->fetchAll() as $row) {
        $data[] = awikWhatsAppNormalizeTemplate($row);
    }

    return awikResponse(200, [
        'success' => true,
        'data' => ['data' => $data, 'total' => $total, 'page' => $filters['page'], 'limit' => $filters['limit']],
    ]);
}

function awikWhatsAppHandleSaveTemplate(PDO $db, array $body, array $user, ?string $ipAddress, array $headers): array
{
    $allowed = ['key', 'name', 'body', 'description'];
    $errors = [];
    foreach (array_keys($body) as $field) {
        if (!in_array($field, $allowed, true)) {
            $errors[] = 'property ' . (string) $field . ' should not exist';
        }
    }

    $name = isset($body['name']) && is_string($body['name']) ? trim($body['name']) : '';
    $templateBody = isset($body['body']) && is_string($body['body']) ? $body['body'] : '';
    if ($name === '') {
        $errors[] = 'name should not be empty';
    }
    if (trim($templateBody) === '') {
        $errors[] = 'body should not be empty';
    }

    $providedKey = null;
    if (array_key_exists('key', $body)) {
        if (!is_string($body['key'])) {
            $errors[] = 'key must be a string';
        } else {
            $providedKey = trim($body['key']);
        }
    }

    $description = null;
    $descriptionProvided = array_key_exists('description', $body);
    if ($descriptionProvided) {
        if ($body['description'] !== null && !is_string($body['description'])) {
            $errors[] = 'description must be a string';
        } else {
            $description = $body['description'];
        }
    }
    if ($errors !== []) {
        throw new AwikApiException(400, 'Validation failed', $errors);
    }

    $key = $providedKey;
    if ($key === null || $key === '') {
        $slug = trim((string) preg_replace('/[^a-z0-9]+/', '.', mb_strtolower($name)), '.');
        if ($slug === '') {
            throw new AwikApiException(400, 'Template name must include letters or numbers');
        }
        $key = 'whatsapp.' . $slug;
    }
    if (!str_starts_with($key, 'whatsapp.')) {
        throw new AwikApiException(400, 'Template key must start with "whatsapp."');
    }

    $find = $db->prepare('SELECT id FROM awik_company_settings WHERE `key` = ? LIMIT 1');
    $find->execute([$key]);
    $existing = $find->fetch();

    if ($existing) {
        if ($descriptionProvided) {
            $db->prepare(
                'UPDATE awik_company_settings SET `value` = ?, description = ?, updatedAt = '
                . awikCurrentTimestampSql($db) . ' WHERE `key` = ?'
            )->execute([$templateBody, $description, $key]);
        } else {
            $db->prepare(
                'UPDATE awik_company_settings SET `value` = ?, updatedAt = '
                . awikCurrentTimestampSql($db) . ' WHERE `key` = ?'
            )->execute([$templateBody, $key]);
        }
        $settingId = (string) $existing['id'];
    } else {
        $settingId = awikUuidV4();
        $db->prepare('INSERT INTO awik_company_settings (id, `key`, `value`, description) VALUES (?, ?, ?, ?)')
            ->execute([$settingId, $key, $templateBody, $description]);
    }

    $reload = $db->prepare('SELECT * FROM awik_company_settings WHERE `key` = ? LIMIT 1');
    $reload->execute([$key]);
    $saved = $reload->fetch();
    if (!$saved) {
        throw new RuntimeException('Saved template could not be reloaded');
    }

    awikWriteSettingsHttpAudit(
        $db,
        (string) ($user['id'] ?? ''),
        (string) ($saved['id'] ?? $settingId),
        $key,
        $ipAddress,
        awikHeaderValue($headers, 'User-Agent')
    );

    return awikResponse(201, ['success' => true, 'data' => awikWhatsAppNormalizeTemplate($saved)]);
}

function awikWhatsAppReminderOffsets(PDO $db): array
{
    $settings = awikWhatsAppReadSettings($db, ['reminder.offset_5d', 'reminder.offset_3d', 'reminder.offset_1d']);

    return [
        'DAYS_5' => awikWhatsAppParseIntSetting($settings['reminder.offset_5d'] ?? '5', 5),
        'DAYS_3' => awikWhatsAppParseIntSetting($settings['reminder.offset_3d'] ?? '3', 3),
        'DAYS_1' => awikWhatsAppParseIntSetting($settings['reminder.offset_1d'] ?? '1', 1),
        'EXPIRY_DAY' => 0,
    ];
}

function awikWhatsAppParseIntSetting(string $value, int $fallback): int
{
    if (!is_numeric(trim($value))) {
        return $fallback;
    }

    return max(0, (int) $value);
}

function awikWhatsAppReminderEnabled(PDO $db): array
{
    $settings = awikWhatsAppReadSettings($db, [
        'reminder.enabled_5d', 'reminder.enabled_3d', 'reminder.enabled_1d', 'reminder.enabled_expiry',
    ]);

    return [
        'DAYS_5' => ($settings['reminder.enabled_5d'] ?? 'true') === 'true',
        'DAYS_3' => ($settings['reminder.enabled_3d'] ?? 'true') === 'true',
        'DAYS_1' => ($settings['reminder.enabled_1d'] ?? 'true') === 'true',
        'EXPIRY_DAY' => ($settings['reminder.enabled_expiry'] ?? 'true') === 'true',
    ];
}

function awikWhatsAppReminderConfig(string $type): array
{
    $config = [
        'DAYS_5' => ['offsetKey' => 'reminder.offset_5d', 'templateKey' => 'whatsapp.reminder_5d_template'],
        'DAYS_3' => ['offsetKey' => 'reminder.offset_3d', 'templateKey' => 'whatsapp.reminder_3d_template'],
        'DAYS_1' => ['offsetKey' => 'reminder.offset_1d', 'templateKey' => 'whatsapp.reminder_1d_template'],
        'EXPIRY_DAY' => ['offsetKey' => 'reminder.offset_expiry', 'templateKey' => 'whatsapp.reminder_expiry_template'],
    ];

    if (!isset($config[$type])) {
        throw new AwikApiException(400, 'Validation failed', ['reminderType is invalid']);
    }

    return $config[$type];
}

function awikWhatsAppBuildVariables(PDO $db, ?array $customer, array $overrides = []): array
{
    $companyName = awikWhatsAppSettingValue($db, 'company.name', 'AWIK NET');
    $companyPhone = awikWhatsAppSettingValue($db, 'company.phone', '');
    $firstName = (string) ($customer['firstName'] ?? '');
    $lastName = (string) ($customer['lastName'] ?? '');

    return array_merge([
        'customer_name' => trim($firstName . ' ' . $lastName),
        'plan_name' => '',
        'price' => '',
        'expiry_date' => '',
        'days_remaining' => '',
        'company_name' => $companyName,
        'company_phone' => $companyPhone,
        'phone' => $companyPhone,
        'firstName' => $firstName,
        'lastName' => $lastName,
        'expiryDate' => '',
        'planName' => '',
        'daysRemaining' => '',
        'companyName' => $companyName,
        'companyPhone' => $companyPhone,
    ], $overrides);
}

function awikWhatsAppRenderTemplate(string $template, array $variables): string
{
    return (string) preg_replace_callback(
        '/\{\{(\w+)\}\}/',
        static fn (array $matches): string => array_key_exists($matches[1], $variables) ? (string) $variables[$matches[1]] : '',
        $template
    );
}

function awikWhatsAppPrettyDate(DateTimeImmutable $date): string
{
    return $date->setTimezone(new DateTimeZone('Asia/Beirut'))->format('d M Y');
}

function awikWhatsAppDaysUntil(DateTimeImmutable $date): int
{
    $today = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $target = new DateTimeImmutable($date->format('Y-m-d') . ' 00:00:00', new DateTimeZone('UTC'));
    $baseline = new DateTimeImmutable($today->format('Y-m-d') . ' 00:00:00', new DateTimeZone('UTC'));

    return (int) round(($target->getTimestamp() - $baseline->getTimestamp()) / 86400);
}

function awikWhatsAppNormalizeReminder(array $row, bool $includeSubscription = true): array
{
    $reminder = [
        'id' => $row['id'],
        'subscriptionId' => $row['subscriptionId'],
        'customerId' => $row['customerId'],
        'reminderType' => $row['reminderType'],
        'scheduledFor' => awikWhatsAppIsoDate($row['scheduledFor'] ?? null),
        'sentAt' => awikWhatsAppIsoDate($row['sentAt'] ?? null),
        'status' => $row['status'],
        'errorMessage' => $row['errorMessage'] ?? null,
        'createdAt' => awikWhatsAppIsoDate($row['createdAt'] ?? null),
    ];

    if ($includeSubscription) {
        $subscription = null;
        if (($row['subscriptionId'] ?? null) !== null) {
            $subscription = [
                'expiryDate' => awikWhatsAppIsoDate($row['sub_expiryDate'] ?? null),
                'plan' => ($row['plan_id'] ?? null) === null ? null : ['id' => $row['plan_id'], 'name' => $row['plan_name']],
                'customer' => ($row['customer_id'] ?? null) === null ? null : [
                    'id' => $row['customer_id'],
                    'firstName' => $row['customer_firstName'],
                    'lastName' => $row['customer_lastName'],
                    'phone' => $row['customer_phone'],
                ],
            ];
        }
        $reminder['subscription'] = $subscription;
    }

    return $reminder;
}

function awikWhatsAppHandleReminders(PDO $db, array $query): array
{
    $filters = awikWhatsAppValidateListQuery($query, ['status', 'reminderType']);
    $status = awikWhatsAppValidateStatus($filters['status']);

    $where = [];
    $params = [];
    if ($status !== null) {
        $where[] = 'r.status = ?';
        $params[] = $status;
    }
    if ($filters['reminderType'] !== null) {
        if (!in_array($filters['reminderType'], ['DAYS_5', 'DAYS_3', 'DAYS_1', 'EXPIRY_DAY'], true)) {
            throw new AwikApiException(400, 'Validation failed', [
                'reminderType must be one of the following values: DAYS_5, DAYS_3, DAYS_1, EXPIRY_DAY',
            ]);
        }
        $where[] = 'r.reminderType = ?';
        $params[] = $filters['reminderType'];
    }
    $whereSql = $where === [] ? '1 = 1' : implode(' AND ', $where);

    $countStatement = $db->prepare('SELECT COUNT(*) FROM awik_whatsapp_reminders r WHERE ' . $whereSql);
    $countStatement->execute($params);
    $total = (int) $countStatement->fetchColumn();

    $sql = 'SELECT r.*, s.expiryDate AS sub_expiryDate, '
        . 'p.id AS plan_id, p.name AS plan_name, '
        . 'c.id AS customer_id, c.firstName AS customer_firstName, '
        . 'c.lastName AS customer_lastName, c.phone AS customer_phone '
        . 'FROM awik_whatsapp_reminders r '
        . 'LEFT JOIN awik_subscriptions s ON s.id = r.subscriptionId '
        . 'LEFT JOIN awik_plans p ON p.id = s.planId '
        . 'LEFT JOIN awik_customers c ON c.id = r.customerId '
        . 'WHERE ' . $whereSql . ' ORDER BY r.scheduledFor ASC LIMIT ? OFFSET ?';
    $statement = $db->prepare($sql);
    $index = 1;
    foreach ($params as $param) {
        $statement->bindValue($index++, $param);
    }
    $statement->bindValue($index++, $filters['limit'], PDO::PARAM_INT);
    $statement->bindValue($index, ($filters['page'] - 1) * $filters['limit'], PDO::PARAM_INT);
    $statement->execute();

    $data = [];
    foreach ($statement->fetchAll() as $row) {
        $data[] = awikWhatsAppNormalizeReminder($row);
    }

    return awikResponse(200, [
        'success' => true,
        'data' => ['data' => $data, 'total' => $total, 'page' => $filters['page'], 'limit' => $filters['limit']],
    ]);
}

function awikWhatsAppDueReminders(PDO $db): array
{
    $offsets = awikWhatsAppReminderOffsets($db);
    $enabled = awikWhatsAppReminderEnabled($db);
    $timezone = new DateTimeZone('Asia/Beirut');
    $todayStr = (new DateTimeImmutable('now', $timezone))->format('Y-m-d');
    $soonStr = (new DateTimeImmutable('now', $timezone))->modify('+6 days')->format('Y-m-d');

    $statement = $db->prepare(
        'SELECT s.id AS subscriptionId, s.customerId AS subscriptionCustomerId, s.expiryDate AS expiryDate, '
        . 'c.firstName AS customer_firstName, c.lastName AS customer_lastName, '
        . 'c.phone AS customer_phone, c.whatsappNumber AS customer_whatsapp, '
        . 'p.name AS plan_name '
        . 'FROM awik_subscriptions s '
        . 'LEFT JOIN awik_customers c ON c.id = s.customerId '
        . 'LEFT JOIN awik_plans p ON p.id = s.planId '
        . "WHERE s.deletedAt IS NULL AND s.status NOT IN ('SUSPENDED', 'EXPIRED') AND s.expiryDate >= ? "
        . 'ORDER BY s.expiryDate ASC'
    );
    $statement->execute([$todayStr . ' 00:00:00']);

    $due = [];
    foreach ($statement->fetchAll() as $row) {
        $expiry = awikWhatsAppUtcDate((string) $row['expiryDate']);
        if ($expiry === null) {
            continue;
        }
        $expiryStr = $expiry->setTimezone($timezone)->format('Y-m-d');
        if ($expiryStr > $soonStr) {
            continue;
        }

        $whatsapp = $row['customer_whatsapp'] ?? null;
        $phone = trim((string) (($whatsapp !== null && $whatsapp !== '') ? $whatsapp : ($row['customer_phone'] ?? '')));
        if ($phone === '') {
            continue;
        }

        foreach (['DAYS_5', 'DAYS_3', 'DAYS_1', 'EXPIRY_DAY'] as $type) {
            if (empty($enabled[$type])) {
                continue;
            }
            $scheduled = $expiry->setTimezone($timezone)->modify('-' . $offsets[$type] . ' days');
            if ($scheduled->format('Y-m-d') !== $todayStr) {
                continue;
            }
            $due[] = [
                'subscriptionId' => $row['subscriptionId'],
                'customerId' => $row['subscriptionCustomerId'],
                'customerName' => trim(((string) ($row['customer_firstName'] ?? '')) . ' ' . ((string) ($row['customer_lastName'] ?? ''))),
                'phone' => $phone,
                'type' => $type,
                'expiryDate' => awikWhatsAppIsoDate((string) $row['expiryDate']),
                'planName' => $row['plan_name'] ?? null,
            ];
        }
    }

    return $due;
}

function awikWhatsAppSendReminder(PDO $db, string $subscriptionId, string $type): array
{
    $config = awikWhatsAppReminderConfig($type);

    $statement = $db->prepare(
        'SELECT s.*, c.firstName AS customer_firstName, c.lastName AS customer_lastName, '
        . 'c.phone AS customer_phone, c.whatsappNumber AS customer_whatsapp, '
        . 'p.name AS planName, p.currency AS planCurrency, p.price AS planPrice '
        . 'FROM awik_subscriptions s '
        . 'LEFT JOIN awik_customers c ON c.id = s.customerId '
        . 'LEFT JOIN awik_plans p ON p.id = s.planId '
        . 'WHERE s.id = ? LIMIT 1'
    );
    $statement->execute([$subscriptionId]);
    $subscription = $statement->fetch();
    if (!$subscription) {
        throw new AwikApiException(404, 'Subscription not found');
    }

    $existingStatement = $db->prepare(
        'SELECT * FROM awik_whatsapp_reminders WHERE subscriptionId = ? AND reminderType = ? LIMIT 1'
    );
    $existingStatement->execute([$subscriptionId, $type]);
    $existing = $existingStatement->fetch();
    if ($existing && in_array((string) $existing['status'], ['sent', 'skipped', 'pending'], true)) {
        return awikWhatsAppNormalizeReminder($existing, false);
    }

    $expiry = awikWhatsAppUtcDate((string) ($subscription['expiryDate'] ?? ''));
    if ($expiry === null) {
        throw new AwikApiException(400, 'Subscription expiry date is invalid');
    }

    $fallbackOffset = $type === 'DAYS_5' ? '5' : ($type === 'DAYS_3' ? '3' : ($type === 'DAYS_1' ? '1' : '0'));
    $offset = awikWhatsAppParseIntSetting(awikWhatsAppSettingValue($db, $config['offsetKey'], $fallbackOffset), 0);
    $scheduledFor = $expiry->modify('-' . $offset . ' days')->format('Y-m-d H:i:s');

    $templateValue = awikWhatsAppSettingValue($db, $config['templateKey'], '');
    $customer = [
        'firstName' => $subscription['customer_firstName'] ?? '',
        'lastName' => $subscription['customer_lastName'] ?? '',
    ];
    $variables = awikWhatsAppBuildVariables($db, $customer, [
        'plan_name' => (string) ($subscription['planName'] ?? ''),
        'price' => trim((string) ($subscription['planCurrency'] ?? '') . ' ' . (string) ($subscription['planPrice'] ?? '')),
        'expiry_date' => awikWhatsAppPrettyDate($expiry),
        'days_remaining' => (string) awikWhatsAppDaysUntil($expiry),
    ]);
    $messageBody = $templateValue !== ''
        ? awikWhatsAppRenderTemplate($templateValue, $variables)
        : '(No WhatsApp template configured)';

    $whatsapp = $subscription['customer_whatsapp'] ?? null;
    $recipientPhone = (string) (($whatsapp !== null && $whatsapp !== '') ? $whatsapp : ($subscription['customer_phone'] ?? ''));

    $message = awikWhatsAppCreateAndSend($db, [
        'recipientPhone' => $recipientPhone,
        'customerId' => $subscription['customerId'] ?? null,
        'messageBody' => $messageBody,
        'templateType' => $config['templateKey'],
        'referenceId' => $subscriptionId,
        'scheduledFor' => null,
    ]);

    $reminderStatus = (string) $message['status'];
    $sentAt = $reminderStatus === 'sent' ? gmdate('Y-m-d H:i:s') : null;
    $errorMessage = $reminderStatus === 'failed' ? ($message['result']['error'] ?? null) : null;

    if ($existing) {
        $db->prepare(
            'UPDATE awik_whatsapp_reminders SET status = ?, sentAt = ?, errorMessage = ? WHERE subscriptionId = ? AND reminderType = ?'
        )->execute([$reminderStatus, $sentAt, $errorMessage, $subscriptionId, $type]);
        $reminderId = (string) $existing['id'];
    } else {
        $reminderId = awikUuidV4();
        $db->prepare(
            'INSERT INTO awik_whatsapp_reminders (id, subscriptionId, customerId, reminderType, scheduledFor, sentAt, status, errorMessage) '
            . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $reminderId,
            $subscriptionId,
            $subscription['customerId'] ?? null,
            $type,
            $scheduledFor,
            $sentAt,
            $reminderStatus,
            $errorMessage,
        ]);
    }

    $reload = $db->prepare('SELECT * FROM awik_whatsapp_reminders WHERE id = ? LIMIT 1');
    $reload->execute([$reminderId]);
    $row = $reload->fetch();

    return is_array($row) ? awikWhatsAppNormalizeReminder($row, false) : [
        'id' => $reminderId,
        'status' => $reminderStatus,
    ];
}

function awikWhatsAppHandleRemindersTrigger(PDO $db, array $user): array
{
    $due = awikWhatsAppDueReminders($db);
    $results = [];
    foreach ($due as $item) {
        try {
            $reminder = awikWhatsAppSendReminder($db, (string) $item['subscriptionId'], (string) $item['type']);
            $results[] = [
                'subscriptionId' => $item['subscriptionId'],
                'type' => $item['type'],
                'status' => $reminder['status'],
            ];
        } catch (Throwable $exception) {
            $results[] = [
                'subscriptionId' => $item['subscriptionId'],
                'type' => $item['type'],
                'status' => 'error',
                'error' => $exception instanceof AwikApiException ? $exception->getMessage() : 'Reminder processing failed',
            ];
        }
    }

    return awikResponse(200, ['success' => true, 'data' => ['processed' => count($results), 'results' => $results]]);
}

function awikHandleRequest(array $request): array
{
    $method = strtoupper((string) ($request['method'] ?? 'GET'));
    $uri = (string) ($request['uri'] ?? '/');
    $path = parse_url($uri, PHP_URL_PATH) ?: '/';
    $body = is_array($request['body'] ?? null) ? (array) $request['body'] : awikReadJsonBody();
    $headers = is_array($request['headers'] ?? null) ? $request['headers'] : [];
    $responsePath = $uri;
    $ipAddress = is_string($request['ipAddress'] ?? null) ? $request['ipAddress'] : null;
    $query = [];
    $queryString = parse_url($uri, PHP_URL_QUERY);
    if (is_string($queryString)) {
        parse_str($queryString, $query);
    }

    try {
        $db = awikDatabase();

        $backupResponse = awikHandleBackupRequest($db, $method, $path, $query, $body, $headers, $responsePath, $ipAddress);
        if ($backupResponse !== null) {
            return $backupResponse;
        }

        $planResponse = awikHandlePlanRequest($db, $method, $path, $query, $body, $headers, $responsePath, $ipAddress);
        if ($planResponse !== null) {
            return $planResponse;
        }

        $customerResponse = awikHandleCustomerRequest($db, $method, $path, $query, $body, $headers, $responsePath, $ipAddress);
        if ($customerResponse !== null) {
            return $customerResponse;
        }

        $userResponse = awikHandleUserRequest($db, $method, $path, $query, $body, $headers, $responsePath, $ipAddress);
        if ($userResponse !== null) {
            return $userResponse;
        }

        $inventoryResponse = awikHandleInventoryRequest($db, $method, $path, $query, $body, $headers, $responsePath, $ipAddress);
        if ($inventoryResponse !== null) {
            return $inventoryResponse;
        }

        $saleResponse = awikHandleSaleRequest($db, $method, $path, $query, $body, $headers, $responsePath, $ipAddress);
        if ($saleResponse !== null) {
            return $saleResponse;
        }

        $subscriptionResponse = awikHandleSubscriptionRequest($db, $method, $path, $query, $body, $headers, $responsePath, $ipAddress);
        if ($subscriptionResponse !== null) {
            return $subscriptionResponse;
        }

        $dashboardResponse = awikHandleDashboardRequest($db, $method, $path, $query, $body, $headers, $responsePath, $ipAddress);
        if ($dashboardResponse !== null) {
            return $dashboardResponse;
        }

        $reportResponse = awikHandleReportRequest($db, $method, $path, $query, $body, $headers, $responsePath, $ipAddress);
        if ($reportResponse !== null) {
            return $reportResponse;
        }

        $whatsAppResponse = awikHandleWhatsAppRequest($db, $method, $path, $query, $body, $headers, $responsePath, $ipAddress);
        if ($whatsAppResponse !== null) {
            return $whatsAppResponse;
        }

        if ($method === 'GET' && $path === '/api/v1/company/branding') {
            $keys = ['company.name', 'company.tagline', 'company.logo'];
            $placeholders = implode(', ', array_fill(0, count($keys), '?'));
            $statement = $db->prepare(
                'SELECT `key`, `value` FROM awik_company_settings WHERE `key` IN (' . $placeholders . ')'
            );
            $statement->execute($keys);
            $map = [];
            foreach ($statement->fetchAll() as $row) {
                $map[$row['key']] = (string) ($row['value'] ?? '');
            }

            return awikResponse(200, [
                'success' => true,
                'data' => [
                    'name' => $map['company.name'] ?? '',
                    'tagline' => $map['company.tagline'] ?? '',
                    'logo' => $map['company.logo'] ?? '',
                ],
            ]);
        }

        if ($method === 'GET' && $path === '/api/v1/settings') {
            $user = awikRequireAuthenticatedUser($db, $headers);
            awikRequireSettingsRole($user, $method);

            $settings = $db->query(
                'SELECT id, `key`, `value`, description, createdAt, updatedAt '
                . 'FROM awik_company_settings ORDER BY `key` ASC'
            )->fetchAll();

            return awikResponse(200, [
                'success' => true,
                'data' => array_map('awikNormalizeCompanySetting', $settings),
            ]);
        }

        if ($method === 'PATCH' && preg_match('~^/api/v1/settings/([^/]+)$~', $path, $matches) === 1) {
            $user = awikRequireAuthenticatedUser($db, $headers);
            awikRequireSettingsRole($user, $method);

            $key = rawurldecode($matches[1]);
            if (preg_match('~^[A-Za-z0-9_.:-]{1,191}$~', $key) !== 1) {
                throw new AwikApiException(400, 'Validation failed', [
                    'key' => ['must be a valid setting key'],
                ]);
            }

            $update = awikValidateSettingUpdateBody($body);
            $find = $db->prepare(
                'SELECT id, `key`, `value`, description, createdAt, updatedAt '
                . 'FROM awik_company_settings WHERE `key` = ? LIMIT 1'
            );
            $find->execute([$key]);
            $setting = $find->fetch();
            if (!$setting) {
                // Upsert: a valid key that has not been seeded yet is created on
                // first write rather than rejected, so settings pages (print
                // layout, WhatsApp credentials, ...) always save successfully.
                $db->prepare(
                    'INSERT INTO awik_company_settings (id, `key`, `value`, description) '
                    . 'VALUES (?, ?, ?, ?)'
                )->execute([
                    awikUuidV4(),
                    $key,
                    $update['value'],
                    $update['description'] ?? null,
                ]);
            } elseif ($update['descriptionProvided']) {
                $db->prepare(
                    'UPDATE awik_company_settings SET `value` = ?, description = ?, updatedAt = '
                    . awikCurrentTimestampSql($db) . ' WHERE `key` = ?'
                )->execute([$update['value'], $update['description'], $key]);
            } else {
                $db->prepare(
                    'UPDATE awik_company_settings SET `value` = ?, updatedAt = '
                    . awikCurrentTimestampSql($db) . ' WHERE `key` = ?'
                )->execute([$update['value'], $key]);
            }

            $find->execute([$key]);
            $updated = $find->fetch();
            if (!$updated) {
                throw new RuntimeException('Updated setting could not be reloaded');
            }

            awikWriteSettingsHttpAudit(
                $db,
                $user['id'],
                $updated['id'],
                $key,
                $ipAddress,
                awikHeaderValue($headers, 'User-Agent')
            );

            return awikResponse(200, [
                'success' => true,
                'data' => awikNormalizeCompanySetting($updated),
            ]);
        }

        if ($method === 'POST' && $path === '/api/v1/auth/login') {
            $identifier = trim((string) ($body['identifier'] ?? $body['emailOrPhone'] ?? $body['phone'] ?? $body['email'] ?? ''));
            $password = (string) ($body['password'] ?? '');

            if ($identifier === '' || $password === '') {
                throw new AwikApiException(400, 'Identifier and password are required', [
                    'identifier' => ['is required'],
                    'password' => ['is required'],
                ]);
            }

            if (mb_strlen($identifier) > 254 || mb_strlen($password) < 6 || mb_strlen($password) > 128) {
                throw new AwikApiException(400, 'Invalid login credentials', [
                    'identifier' => ['must be a valid phone or email'],
                    'password' => ['must be between 6 and 128 characters'],
                ]);
            }

            $normalizedIdentifier = awikResolveLoginIdentifier($identifier);
            $identifierKey = awikLoginIdentifierScopeKey($normalizedIdentifier, $identifier);
            awikRequireGenericLoginGuard($db, $identifierKey, $ipAddress);

            $sql = 'SELECT * FROM awik_users WHERE deletedAt IS NULL AND (';
            $clauses = [];
            $params = [];
            if ($normalizedIdentifier !== null && $normalizedIdentifier['kind'] === 'email') {
                $clauses[] = 'LOWER(email) = LOWER(?)';
                $params[] = $normalizedIdentifier['candidates'][0];
            } else {
                $clauses[] = 'phone = ?';
                $params[] = $identifier;
            }
            foreach ($normalizedIdentifier['candidates'] ?? [] as $candidate) {
                if ($candidate === $params[0]) {
                    continue;
                }
                $clauses[] = 'phone = ?';
                $params[] = $candidate;
            }
            $sql .= implode(' OR ', $clauses) . ') LIMIT 1';

            $statement = $db->prepare($sql);
            $statement->execute($params);
            $user = $statement->fetch();

            $dummyPasswordHash = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
            $passwordHash = is_array($user) ? (string) ($user['passwordHash'] ?? $dummyPasswordHash) : $dummyPasswordHash;
            $passwordMatches = password_verify($password, $passwordHash);
            $passwordValid = is_array($user) && ($user['status'] ?? null) === 'ACTIVE' && $passwordMatches;
            if (!$passwordValid) {
                $ipScopeKey = 'ip:' . hash('sha256', awikNormalizeClientIp($ipAddress));
                awikRecordLoginFailure($db, 'identifier', $identifierKey, 5, 900, 900);
                awikRecordLoginFailure($db, 'ip', $ipScopeKey, 10, 300, 300);
                throw new AwikApiException(401, 'Invalid credentials');
            }

            awikResetLoginAttemptState($db, 'identifier', $identifierKey);

            $now = awikCurrentTimestampSql($db);
            $db->prepare('UPDATE awik_users SET lastLoginAt = ' . $now . ', updatedAt = ' . $now . ' WHERE id = ?')->execute([$user['id']]);

            $config = awikMigrationConfig();
            if ($config['jwtSecret'] === '' || $config['jwtRefreshSecret'] === '') {
                throw new RuntimeException('JWT secrets are not configured');
            }
            $accessExpires = time() + 86400;
            $refreshExpires = time() + 604800;
            $accessToken = awikSignJwt([
                'sub' => $user['id'],
                'role' => $user['role'],
                'jti' => awikUuidV4(),
                'type' => 'access',
                'exp' => $accessExpires,
            ], (string) $config['jwtSecret']);
            $refreshToken = awikSignJwt([
                'sub' => $user['id'],
                'role' => $user['role'],
                'jti' => awikUuidV4(),
                'type' => 'refresh',
                'exp' => $refreshExpires,
            ], (string) $config['jwtRefreshSecret']);

            awikPersistToken($db, $user['id'], $accessToken, 'access', $accessExpires);
            awikPersistToken($db, $user['id'], $refreshToken, 'refresh', $refreshExpires);

            $freshUserStatement = $db->prepare('SELECT * FROM awik_users WHERE id = ? LIMIT 1');
            $freshUserStatement->execute([$user['id']]);
            $freshUser = $freshUserStatement->fetch() ?: $user;

            return awikResponse(200, [
                'success' => true,
                'data' => [
                    'user' => awikNormalizeUser($freshUser),
                    'accessToken' => $accessToken,
                    'refreshToken' => $refreshToken,
                ],
            ]);
        }

        if ($method === 'POST' && $path === '/api/v1/auth/refresh') {
            $refreshToken = trim((string) ($body['refreshToken'] ?? ''));
            if ($refreshToken === '') {
                throw new AwikApiException(400, 'refreshToken is required');
            }

            $config = awikMigrationConfig();
            if ($config['jwtRefreshSecret'] === '') {
                throw new RuntimeException('JWT refresh secret is not configured');
            }
            $payload = awikVerifyJwt($refreshToken, (string) $config['jwtRefreshSecret'], 'refresh');
            $userId = (string) ($payload['sub'] ?? '');
            if ($userId === '') {
                throw new AwikApiException(401, 'Unauthorized');
            }

            $hash = hash('sha256', $refreshToken);
            $tokenStatement = $db->prepare(
                'SELECT * FROM awik_user_tokens WHERE tokenHash = ? AND userId = ? AND tokenType = ? AND revokedAt IS NULL AND expiresAt > ' . awikCurrentTimestampSql($db) . ' LIMIT 1'
            );
            $tokenStatement->execute([$hash, $userId, 'refresh']);
            $tokenRow = $tokenStatement->fetch();

            if (!$tokenRow) {
                throw new AwikApiException(401, 'Invalid refresh token');
            }

            $userStatement = $db->prepare('SELECT * FROM awik_users WHERE id = ? LIMIT 1');
            $userStatement->execute([$userId]);
            $user = $userStatement->fetch();
            if (!$user || ($user['status'] ?? null) !== 'ACTIVE' || ($user['deletedAt'] ?? null) !== null) {
                throw new AwikApiException(401, 'Invalid refresh token');
            }

            $db->beginTransaction();
            $updateStmt = $db->prepare('UPDATE awik_user_tokens SET revokedAt = ' . awikCurrentTimestampSql($db) . ' WHERE tokenHash = ? AND userId = ? AND tokenType = ? AND revokedAt IS NULL');
            $updateStmt->execute([$hash, $userId, 'refresh']);
            if ($updateStmt->rowCount() === 0) {
                $db->rollBack();
                throw new AwikApiException(401, 'Invalid refresh token');
            }


            $accessExpires = time() + 86400;
            $refreshExpires = time() + 604800;
            $newAccessToken = awikSignJwt([
                'sub' => $user['id'],
                'role' => $user['role'],
                'jti' => awikUuidV4(),
                'type' => 'access',
                'exp' => $accessExpires,
            ], (string) $config['jwtSecret']);
            $newRefreshToken = awikSignJwt([
                'sub' => $user['id'],
                'role' => $user['role'],
                'jti' => awikUuidV4(),
                'type' => 'refresh',
                'exp' => $refreshExpires,
            ], (string) $config['jwtRefreshSecret']);

            awikPersistToken($db, $user['id'], $newAccessToken, 'access', $accessExpires);
            awikPersistToken($db, $user['id'], $newRefreshToken, 'refresh', $refreshExpires);
            $db->commit();

            return awikResponse(200, [
                'success' => true,
                'data' => [
                    'user' => awikNormalizeUser($user),
                    'accessToken' => $newAccessToken,
                    'refreshToken' => $newRefreshToken,
                ],
            ]);
        }

        if ($method === 'POST' && $path === '/api/v1/auth/logout') {
            $user = awikRequireAuthenticatedUser($db, $headers);
            awikRevokeUserTokens($db, $user['id']);
            return awikResponse(200, [
                'success' => true,
                'data' => ['message' => 'Logged out successfully'],
            ]);
        }

        if ($method === 'GET' && $path === '/api/v1/auth/profile') {
            $user = awikRequireAuthenticatedUser($db, $headers);
            return awikResponse(200, [
                'success' => true,
                'data' => awikNormalizeUser($user),
            ]);
        }

        if ($method === 'PATCH' && $path === '/api/v1/auth/profile') {
            $user = awikRequireAuthenticatedUser($db, $headers);
            $updates = $body;
            $allowed = ['firstName' => 'firstName', 'lastName' => 'lastName', 'email' => 'email'];
            $updateData = [];
            $errors = [];

            foreach ($allowed as $inputKey => $dbKey) {
                if (!array_key_exists($inputKey, $updates)) {
                    continue;
                }

                if (!is_string($updates[$inputKey])) {
                    $errors[$inputKey] = ['must be a string'];
                    continue;
                }
                $value = trim($updates[$inputKey]);
                if ($dbKey === 'email') {
                    if ($value === '') {
                        $errors[$inputKey] = ['is required'];
                        continue;
                    }
                    if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
                        $errors[$inputKey] = ['must be a valid email address'];
                        continue;
                    }
                    $value = strtolower($value);
                    $conflict = $db->prepare('SELECT id FROM awik_users WHERE LOWER(email) = LOWER(?) AND id != ? AND deletedAt IS NULL LIMIT 1');
                    $conflict->execute([$value, $user['id']]);
                    if ($conflict->fetch()) {
                        throw new AwikApiException(409, 'Email already in use');
                    }
                } else {
                    // Names are optional so a profile with a blank last name can
                    // still be saved; only over-length input is rejected here.
                    if (mb_strlen($value) > 100) {
                        $errors[$inputKey] = ['must be 100 characters or fewer'];
                        continue;
                    }
                }

                $updateData[$dbKey] = $value;
            }

            if ($errors !== []) {
                throw new AwikApiException(400, 'Profile update validation failed', $errors);
            }

            if ($updateData !== []) {
                $setParts = [];
                $params = [];
                foreach ($updateData as $key => $value) {
                    $setParts[] = $key . ' = ?';
                    $params[] = $value;
                }
                $params[] = $user['id'];
                $db->prepare('UPDATE awik_users SET ' . implode(', ', $setParts) . ', updatedAt = ' . awikCurrentTimestampSql($db) . ' WHERE id = ?')->execute($params);
            }

            $updated = $db->prepare('SELECT * FROM awik_users WHERE id = ? LIMIT 1');
            $updated->execute([$user['id']]);
            $updatedUser = $updated->fetch();

            return awikResponse(200, [
                'success' => true,
                'data' => [
                    'id' => $updatedUser['id'],
                    'firstName' => $updatedUser['firstName'],
                    'lastName' => $updatedUser['lastName'],
                    'email' => $updatedUser['email'],
                ],
            ]);
        }

        if ($method === 'POST' && $path === '/api/v1/auth/change-password') {
            $user = awikRequireAuthenticatedUser($db, $headers);
            $currentPassword = (string) ($body['currentPassword'] ?? '');
            $newPassword = (string) ($body['newPassword'] ?? '');
            $confirmPassword = (string) ($body['confirmPassword'] ?? '');

            if ($currentPassword === '' || $newPassword === '' || $confirmPassword === '') {
                throw new AwikApiException(400, 'Current password, new password, and confirmation are required');
            }

            if (!password_verify($currentPassword, (string) ($user['passwordHash'] ?? ''))) {
                throw new AwikApiException(400, 'Current password is incorrect');
            }

            if (mb_strlen($newPassword) < 8) {
                throw new AwikApiException(400, 'New password must be at least 8 characters long');
            }

            if ($newPassword !== $confirmPassword) {
                throw new AwikApiException(400, 'Passwords do not match');
            }

            $db->prepare('UPDATE awik_users SET passwordHash = ?, updatedAt = ' . awikCurrentTimestampSql($db) . ' WHERE id = ?')->execute([
                password_hash($newPassword, PASSWORD_BCRYPT),
                $user['id'],
            ]);
            awikRevokeUserTokens($db, $user['id']);

            return awikResponse(200, [
                'success' => true,
                'data' => ['message' => 'Password changed successfully'],
            ]);
        }

        if ($method === 'POST' && $path === '/api/v1/auth/forgot-password') {
            $email = $body['email'] ?? null;
            if (!is_string($email) || trim($email) === '' || strlen($email) > 320) {
                throw new AwikApiException(400, 'A valid email address is required');
            }

            return awikRequestPasswordRecovery($db, $email, $ipAddress);
        }

        if ($method === 'POST' && $path === '/api/v1/auth/reset-password') {
            foreach (['token', 'newPassword', 'confirmPassword'] as $field) {
                if (!is_string($body[$field] ?? null)) {
                    throw new AwikApiException(400, 'Invalid password recovery request');
                }
            }
            return awikResponse(200, [
                'success' => true,
                'data' => awikRedeemPasswordRecovery(
                    $db,
                    $body['token'],
                    $body['newPassword'],
                    $body['confirmPassword']
                ),
            ]);
        }

        return awikJsonError(404, 'Not Found', null, $responsePath);
    } catch (AwikApiException $exception) {
        return awikJsonError($exception->statusCode, $exception->getMessage(), $exception->errors ?: null, $responsePath, $exception->headers);
    } catch (Throwable $exception) {
        if (str_starts_with($path, '/api/v1/backups')) {
            error_log('AWIK backup operation failed: ' . get_class($exception));
        }
        if ($method === 'POST' && $path === '/api/v1/auth/login') {
            error_log('AWIK login exception: ' . get_class($exception) . ' - ' . $exception->getMessage());
            return awikJsonError(503, 'Login temporarily unavailable', null, $responsePath);
        }
        if (in_array($path, ['/api/v1/auth/forgot-password', '/api/v1/auth/reset-password'], true)) {
            return awikJsonError(503, 'Password recovery is temporarily unavailable', null, $responsePath);
        }
        return awikJsonError(500, 'Internal server error', null, $responsePath);
    }
}



function awikBackupStoragePath(array $record): string
{
    $directory = awikBackupDirectory();
    $storageName = basename((string) ($record['storagePath'] ?? ''));
    if ($storageName === '') {
        throw new AwikApiException(404, 'Backup file is unavailable');
    }

    $path = $directory . DIRECTORY_SEPARATOR . $storageName;
    if (!is_file($path) || is_link($path)) {
        throw new AwikApiException(404, 'Backup file is unavailable');
    }

    return $path;
}

function awikRequireBackupRecord(string $id): array
{
    $record = awikFindBackupRecord($id);
    if ($record === null) {
        throw new AwikApiException(404, 'Backup not found');
    }

    return $record;
}

function awikHandleBackupRequest(PDO $db, string $method, string $path, array $query, array $body, array $headers, string $responsePath, ?string $ipAddress): ?array
{
    $basePath = '/api/v1/backups';
    $routePath = rtrim($path, '/') ?: '/';
    if ($routePath !== $basePath && !str_starts_with($routePath, $basePath . '/')) {
        return null;
    }

    $user = awikRequireAuthenticatedUser($db, $headers);
    awikRequireAdminUser($user);

    if ($method === 'GET' && $routePath === $basePath) {
        $records = awikBackupReadManifest();
        $type = isset($query['type']) && is_string($query['type']) ? trim($query['type']) : '';
        if ($type !== '') {
            $records = array_values(array_filter(
                $records,
                static fn ($record): bool => is_array($record) && ($record['type'] ?? null) === $type
            ));
        }
        $records = array_values(array_map('awikNormalizeBackupRecord', $records));
        $total = count($records);

        return awikResponse(200, [
            'success' => true,
            'data' => $records,
            'meta' => [
                'total' => $total,
                'page' => 1,
                'limit' => $total === 0 ? 20 : $total,
                'totalPages' => $total === 0 ? 0 : 1,
                'hasNext' => false,
                'hasPrev' => false,
            ],
        ]);
    }

    if ($method === 'POST' && $routePath === $basePath . '/create') {
        $description = isset($body['description']) && is_string($body['description']) ? $body['description'] : null;
        $record = awikCreateDatabaseBackup($db, $description);

        return awikResponse(201, [
            'success' => true,
            'data' => awikNormalizeBackupRecord($record),
        ]);
    }

    if ($method === 'POST' && $routePath === $basePath . '/cleanup') {
        $retentionDays = 30;
        if (isset($body['retentionDays']) && is_numeric($body['retentionDays'])) {
            $retentionDays = max(1, (int) $body['retentionDays']);
        }

        $cutoff = time() - ($retentionDays * 86400);
        $manifest = awikBackupReadManifest();
        $kept = [];
        $cleaned = 0;
        foreach ($manifest as $record) {
            $createdAt = is_array($record) ? strtotime((string) ($record['createdAt'] ?? '')) : false;
            if ($createdAt !== false && $createdAt < $cutoff) {
                $storageName = basename((string) ($record['storagePath'] ?? ''));
                $path = awikBackupDirectory() . DIRECTORY_SEPARATOR . $storageName;
                if ($storageName !== '' && is_file($path)) {
                    @unlink($path);
                }
                $cleaned++;
                continue;
            }
            $kept[] = $record;
        }
        if ($cleaned > 0) {
            awikBackupWriteManifest($kept);
        }

        return awikResponse(200, [
            'success' => true,
            'data' => ['cleaned' => $cleaned, 'errors' => []],
        ]);
    }

    if ($method === 'GET' && preg_match('#^' . preg_quote($basePath, '#') . '/integrity/([^/]+)$#', $routePath, $matches) === 1) {
        $record = awikRequireBackupRecord(rawurldecode($matches[1]));
        $path = awikBackupStoragePath($record);
        $size = (int) filesize($path);
        $valid = awikBackupVerifyFile($path, [
            'size' => (int) ($record['size'] ?? -1),
            'sha256' => $record['checksum'] ?? null,
            'hmac' => $record['hmac'] ?? null,
        ], awikBackupKey());

        return awikResponse(200, [
            'success' => true,
            'data' => [
                'valid' => $valid,
                'storedSize' => (int) ($record['size'] ?? 0),
                'actualSize' => $size,
            ],
        ]);
    }

    if ($method === 'GET' && preg_match('#^' . preg_quote($basePath, '#') . '/([^/]+)/download$#', $routePath, $matches) === 1) {
        $record = awikRequireBackupRecord(rawurldecode($matches[1]));
        $path = awikBackupStoragePath($record);
        $filename = str_replace(['"', "\r", "\n"], '', (string) ($record['filename'] ?? 'backup.awikbak'));

        $response = awikResponse(200, [], [
            'Content-Type' => 'application/gzip',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
        $response['filePath'] = $path;

        return $response;
    }

    return awikJsonError(404, 'Not Found', null, $responsePath);
}

<?php

declare(strict_types=1);

$databasePath = sys_get_temp_dir() . '/awik_php_whatsapp_' . bin2hex(random_bytes(12)) . '.sqlite';
putenv('AWIK_MIGRATION_DSN=sqlite:' . $databasePath);
putenv('AWIK_MIGRATION_DB_USER=');
putenv('AWIK_MIGRATION_DB_PASSWORD=');
putenv('AWIK_MIGRATION_JWT_SECRET=local-whatsapp-access-secret-for-tests-32');
putenv('AWIK_MIGRATION_JWT_REFRESH_SECRET=local-whatsapp-refresh-secret-for-tests-32');
putenv('WHATSAPP_PHONE_NUMBER_ID=');
putenv('WHATSAPP_API_TOKEN=');
putenv('WHATSAPP_ACCESS_TOKEN=');
putenv('WHATSAPP_API_URL=');
putenv('WHATSAPP_API_VERSION=');

register_shutdown_function(static function () use ($databasePath): void {
    if (is_file($databasePath)) {
        @unlink($databasePath);
    }
});

require_once __DIR__ . '/../private/bootstrap.php';

function awikWhatsAppTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function awikWhatsAppTestCall(string $method, string $uri, ?string $token = null, ?array $body = null): array
{
    $request = ['method' => $method, 'uri' => $uri];
    if ($token !== null) {
        $request['headers'] = ['Authorization' => 'Bearer ' . $token];
    }
    if ($body !== null) {
        $request['body'] = $body;
    }

    return awikHandleRequest($request);
}

/**
 * Runs a short-lived direct query so the harness never keeps an open SQLite
 * handle while the handlers (which open their own connections) write.
 *
 * @return array<int, array<string, mixed>>
 */
function awikWhatsAppTestQuery(string $sql, array $params = []): array
{
    $connection = awikDatabase();
    $statement = $connection->prepare($sql);
    $statement->execute($params);
    $rows = $statement->fetchAll();
    $connection = null;

    return $rows;
}

// ─── Schema + fixtures (one connection, closed before any handler runs) ──
$setup = awikDatabase();
$setup->exec('CREATE TABLE awik_users (
    id TEXT PRIMARY KEY, email TEXT, phone TEXT NOT NULL, firstName TEXT NOT NULL, lastName TEXT NOT NULL,
    passwordHash TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, deletedAt TEXT NULL
)');
$setup->exec('CREATE TABLE awik_user_tokens (
    id TEXT PRIMARY KEY, userId TEXT NOT NULL, tokenHash TEXT NOT NULL, tokenType TEXT NOT NULL,
    expiresAt TEXT NOT NULL, revokedAt TEXT NULL
)');
$setup->exec('CREATE TABLE awik_company_settings (
    id TEXT PRIMARY KEY, `key` TEXT NOT NULL, `value` TEXT NOT NULL, description TEXT NULL,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)');
$setup->exec('CREATE TABLE awik_customers (
    id TEXT PRIMARY KEY, phone TEXT NOT NULL, whatsappNumber TEXT NULL, firstName TEXT NOT NULL,
    lastName TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'active\', createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deletedAt TEXT NULL
)');
$setup->exec('CREATE TABLE awik_plans (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT \'USD\', price TEXT NOT NULL DEFAULT \'0\'
)');
$setup->exec('CREATE TABLE awik_subscriptions (
    id TEXT PRIMARY KEY, customerId TEXT NOT NULL, planId TEXT NOT NULL, startDate TEXT NOT NULL,
    expiryDate TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'ACTIVE\', paymentStatus TEXT NOT NULL DEFAULT \'paid\',
    notes TEXT NULL, lastRenewalDate TEXT NULL, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deletedAt TEXT NULL
)');
$setup->exec('CREATE TABLE awik_whatsapp_messages (
    id TEXT PRIMARY KEY, recipientPhone TEXT NOT NULL, customerId TEXT NULL, messageBody TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT \'pending\', externalMessageId TEXT NULL, errorMessage TEXT NULL,
    retryCount INTEGER NOT NULL DEFAULT 0, sentAt TEXT NULL, deliveredAt TEXT NULL, readAt TEXT NULL,
    scheduledFor TEXT NULL, referenceId TEXT NULL, templateType TEXT NULL,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)');
$setup->exec('CREATE TABLE awik_whatsapp_reminders (
    id TEXT PRIMARY KEY, subscriptionId TEXT NOT NULL, customerId TEXT NOT NULL, reminderType TEXT NOT NULL,
    scheduledFor TEXT NOT NULL, sentAt TEXT NULL, status TEXT NOT NULL DEFAULT \'pending\',
    errorMessage TEXT NULL, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)');

$adminId = awikUuidV4();
$staffId = awikUuidV4();
foreach ([[$adminId, 'ADMIN'], [$staffId, 'STAFF']] as [$userId, $role]) {
    $setup->prepare(
        'INSERT INTO awik_users (id,email,phone,firstName,lastName,passwordHash,role,status) VALUES (?,?,?,?,?,?,?,?)'
    )->execute([$userId, null, $userId, 'WhatsApp', 'Tester', 'not-used', $role, 'ACTIVE']);
}
$accessSecret = getenv('AWIK_MIGRATION_JWT_SECRET');
$tokens = [];
foreach ([[$adminId, 'ADMIN'], [$staffId, 'STAFF']] as [$userId, $role]) {
    $token = awikSignJwt([
        'sub' => $userId,
        'role' => $role,
        'jti' => awikUuidV4(),
        'type' => 'access',
        'exp' => time() + 3600,
    ], $accessSecret);
    $setup->prepare(
        'INSERT INTO awik_user_tokens (id,userId,tokenHash,tokenType,expiresAt) VALUES (?,?,?,?,?)'
    )->execute([awikUuidV4(), $userId, hash('sha256', $token), 'access', gmdate('Y-m-d H:i:s', time() + 3600)]);
    $tokens[$role] = $token;
}

$seedSetting = $setup->prepare(
    'INSERT INTO awik_company_settings (id, `key`, `value`, description) VALUES (?, ?, ?, ?)'
);
foreach ([
    ['company.name', 'AWIK NET', 'Company name'],
    ['company.phone', '+961000000', 'Company phone'],
    ['whatsapp.businessAccountId', '109283749102834', 'WABA id'],
    ['whatsapp.webhookVerifyToken', 'verify-me-please', 'Webhook verify token'],
    ['whatsapp.accessToken', 'SECRET-TOKEN-DO-NOT-LEAK', 'Access token'],
    ['whatsapp.reminder_5d_template', 'Hi {{firstName}}, {{planName}} expires {{expiryDate}}', '5d template'],
    ['whatsapp.reminder_3d_template', 'Hello {{customer_name}}', '3d template'],
    ['reminder.offset_5d', '5', 'offset'],
    ['reminder.offset_3d', '3', 'offset'],
    ['reminder.offset_1d', '1', 'offset'],
    ['reminder.enabled_5d', 'true', 'enabled'],
    ['reminder.enabled_3d', 'true', 'enabled'],
    ['reminder.enabled_1d', 'true', 'enabled'],
    ['reminder.enabled_expiry', 'true', 'enabled'],
] as [$key, $value, $description]) {
    $seedSetting->execute([awikUuidV4(), $key, $value, $description]);
}

$customerId = awikUuidV4();
$setup->prepare(
    'INSERT INTO awik_customers (id, phone, whatsappNumber, firstName, lastName, status) VALUES (?,?,?,?,?,?)'
)->execute([$customerId, '96170000001', '96170000002', 'Layla', 'Haddad', 'active']);

$planId = awikUuidV4();
$setup->prepare('INSERT INTO awik_plans (id, name, currency, price) VALUES (?,?,?,?)')
    ->execute([$planId, 'Fiber 50', 'USD', '20.00']);
$subscriptionId = awikUuidV4();
$timezone = new DateTimeZone('Asia/Beirut');
$expiryUtc = (new DateTimeImmutable('now', $timezone))->modify('+5 days')->setTime(12, 0, 0)
    ->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
$setup->prepare(
    'INSERT INTO awik_subscriptions (id, customerId, planId, startDate, expiryDate, status) VALUES (?,?,?,?,?,?)'
)->execute([$subscriptionId, $customerId, $planId, gmdate('Y-m-d H:i:s'), $expiryUtc, 'ACTIVE']);
$setup = null;

try {
    // ─── Route matching ─────────────────────────────
    foreach ([
        ['GET', '/api/v1/whatsapp/status'],
        ['GET', '/api/v1/whatsapp/messages'],
        ['GET', '/api/v1/whatsapp/templates'],
        ['GET', '/api/v1/whatsapp/reminders'],
        ['GET', '/api/v1/whatsapp/reminders/due'],
        ['POST', '/api/v1/whatsapp/test-connection'],
        ['POST', '/api/v1/whatsapp/send'],
        ['POST', '/api/v1/whatsapp/templates'],
        ['POST', '/api/v1/whatsapp/reminders/trigger'],
    ] as [$method, $uri]) {
        awikWhatsAppTestAssert(
            awikWhatsAppRouteMatches($method, $uri) !== null,
            'WhatsApp route not matched: ' . $method . ' ' . $uri
        );
    }
    awikWhatsAppTestAssert(awikWhatsAppRouteMatches('DELETE', '/api/v1/whatsapp/status') === null, 'Unsupported method was matched');
    awikWhatsAppTestAssert(awikWhatsAppRouteMatches('GET', '/api/v1/whatsapp/unknown') === null, 'Unknown path was matched');
    awikWhatsAppTestAssert(awikWhatsAppRouteMatches('GET', '/api/v1/whatsapp') === null, 'Collection root should not be a route');

    // ─── Unauthorized ───────────────────────────────
    awikWhatsAppTestAssert(awikWhatsAppTestCall('GET', '/api/v1/whatsapp/status')['statusCode'] === 401, 'Anonymous status was not rejected');
    awikWhatsAppTestAssert(awikWhatsAppTestCall('POST', '/api/v1/whatsapp/send', null, [])['statusCode'] === 401, 'Anonymous send was not rejected');

    // ─── Status (staff allowed) ─────────────────────
    $status = awikWhatsAppTestCall('GET', '/api/v1/whatsapp/status', $tokens['STAFF']);
    awikWhatsAppTestAssert($status['statusCode'] === 200, 'Staff status request failed');
    $statusData = $status['payload']['data'];
    awikWhatsAppTestAssert($statusData['hasToken'] === true, 'Status should report a stored token');
    awikWhatsAppTestAssert($statusData['businessAccountId'] === '109283749102834', 'Status business account mismatch');
    awikWhatsAppTestAssert($statusData['reminders']['enabled5d'] === true && $statusData['reminders']['offset5d'] === '5', 'Status reminder defaults mismatch');
    awikWhatsAppTestAssert(
        strpos((string) json_encode($status['payload']), 'SECRET-TOKEN-DO-NOT-LEAK') === false,
        'Status response leaked the access token'
    );

    // ─── Test connection (ADMIN only, unconfigured => no network) ──
    awikWhatsAppTestAssert(awikWhatsAppTestCall('POST', '/api/v1/whatsapp/test-connection', $tokens['STAFF'], [])['statusCode'] === 403, 'Staff test-connection was not rejected');
    $testConnection = awikWhatsAppTestCall('POST', '/api/v1/whatsapp/test-connection', $tokens['ADMIN'], []);
    awikWhatsAppTestAssert($testConnection['statusCode'] === 200, 'Admin test-connection failed');
    awikWhatsAppTestAssert(
        $testConnection['payload']['data']['success'] === false
        && strpos($testConnection['payload']['data']['message'], 'Phone Number ID') !== false,
        'Unconfigured test-connection should report missing credentials'
    );

    // ─── Send validation ────────────────────────────
    $invalidSend = awikWhatsAppTestCall('POST', '/api/v1/whatsapp/send', $tokens['STAFF'], ['recipientPhone' => '', 'body' => '']);
    awikWhatsAppTestAssert($invalidSend['statusCode'] === 400, 'Empty send payload was not rejected');
    awikWhatsAppTestAssert(is_array($invalidSend['payload']['errors']) && $invalidSend['payload']['errors'] !== [], 'Send validation should return field errors');

    // ─── Send success (unconfigured => queued pending) ──
    $queuedAlias = awikWhatsAppTestCall('POST', '/api/v1/whatsapp/send', $tokens['STAFF'], [
        'recipientPhone' => '96170000111',
        'messageBody' => 'Hello from the connect screen',
    ]);
    awikWhatsAppTestAssert($queuedAlias['statusCode'] === 201, 'Send (messageBody alias) failed: ' . json_encode($queuedAlias));
    awikWhatsAppTestAssert($queuedAlias['payload']['data']['status'] === 'pending', 'Unconfigured send should queue as pending');
    awikWhatsAppTestAssert($queuedAlias['payload']['data']['sentImmediately'] === false, 'Unconfigured send should not report immediate send');

    $queuedBody = awikWhatsAppTestCall('POST', '/api/v1/whatsapp/send', $tokens['STAFF'], [
        'recipientPhone' => '96170000122',
        'body' => 'Hello from the messages screen',
        'customerId' => $customerId,
    ]);
    awikWhatsAppTestAssert($queuedBody['statusCode'] === 201, 'Send (body alias + customerId) failed: ' . json_encode($queuedBody));
    awikWhatsAppTestAssert($queuedBody['payload']['data']['status'] === 'pending', 'Send with known customer should queue as pending');

    $unknownCustomer = awikWhatsAppTestCall('POST', '/api/v1/whatsapp/send', $tokens['STAFF'], [
        'recipientPhone' => '96170000133',
        'body' => 'Should fail',
        'customerId' => awikUuidV4(),
    ]);
    awikWhatsAppTestAssert($unknownCustomer['statusCode'] === 404, 'Send with unknown customer was not rejected');

    // ─── Messages list ──────────────────────────────
    $messages = awikWhatsAppTestCall('GET', '/api/v1/whatsapp/messages', $tokens['STAFF']);
    awikWhatsAppTestAssert($messages['statusCode'] === 200, 'Message list failed');
    awikWhatsAppTestAssert($messages['payload']['data']['total'] === 2, 'Message total mismatch: ' . json_encode($messages['payload']));
    awikWhatsAppTestAssert(count($messages['payload']['data']['data']) === 2, 'Message page size mismatch');
    awikWhatsAppTestAssert(array_key_exists('externalId', $messages['payload']['data']['data'][0]), 'Message projection must expose externalId');

    $searched = awikWhatsAppTestCall('GET', '/api/v1/whatsapp/messages?search=96170000111', $tokens['STAFF']);
    awikWhatsAppTestAssert(($searched['payload']['data']['total'] ?? null) === 1, 'Message search filter mismatch: ' . json_encode($searched));

    $statusFiltered = awikWhatsAppTestCall('GET', '/api/v1/whatsapp/messages?status=pending', $tokens['STAFF']);
    awikWhatsAppTestAssert($statusFiltered['payload']['data']['total'] === 2, 'Message status filter mismatch');

    awikWhatsAppTestAssert(awikWhatsAppTestCall('GET', '/api/v1/whatsapp/messages?status=bogus', $tokens['STAFF'])['statusCode'] === 400, 'Invalid status filter was not rejected');
    awikWhatsAppTestAssert(awikWhatsAppTestCall('GET', '/api/v1/whatsapp/messages?limit=101', $tokens['STAFF'])['statusCode'] === 400, 'Oversized limit was not rejected');
    awikWhatsAppTestAssert(awikWhatsAppTestCall('GET', '/api/v1/whatsapp/messages?bogus=1', $tokens['STAFF'])['statusCode'] === 400, 'Unknown query param was not rejected');

    // ─── Templates list ─────────────────────────────
    $templates = awikWhatsAppTestCall('GET', '/api/v1/whatsapp/templates', $tokens['STAFF']);
    awikWhatsAppTestAssert($templates['statusCode'] === 200, 'Template list failed');
    awikWhatsAppTestAssert($templates['payload']['data']['total'] === 5, 'Template total should include every whatsapp.* setting: ' . json_encode($templates['payload']));
    $templateByKey = [];
    foreach ($templates['payload']['data']['data'] as $template) {
        $templateByKey[$template['key']] = $template;
    }
    awikWhatsAppTestAssert(isset($templateByKey['whatsapp.reminder_5d_template']), 'Seeded 5d template missing');
    awikWhatsAppTestAssert($templateByKey['whatsapp.reminder_5d_template']['type'] === 'reminder', 'Reminder template type mismatch');
    awikWhatsAppTestAssert(in_array('firstName', $templateByKey['whatsapp.reminder_5d_template']['variables'], true), 'Template variable extraction failed');

    $templateSearch = awikWhatsAppTestCall('GET', '/api/v1/whatsapp/templates?search=5d', $tokens['STAFF']);
    awikWhatsAppTestAssert($templateSearch['payload']['data']['total'] === 1, 'Template search mismatch: ' . json_encode($templateSearch['payload']));

    awikWhatsAppTestAssert(awikWhatsAppTestCall('POST', '/api/v1/whatsapp/templates', $tokens['STAFF'], ['name' => 'x', 'body' => 'y'])['statusCode'] === 403, 'Staff template write was not rejected');
    awikWhatsAppTestAssert(awikWhatsAppTestCall('POST', '/api/v1/whatsapp/templates', $tokens['ADMIN'], ['name' => '', 'body' => ''])['statusCode'] === 400, 'Invalid template was not rejected');
    awikWhatsAppTestAssert(
        awikWhatsAppTestCall('POST', '/api/v1/whatsapp/templates', $tokens['ADMIN'], ['key' => 'company.name', 'name' => 'x', 'body' => 'y'])['statusCode'] === 400,
        'Template write outside the whatsapp. namespace was not rejected'
    );

    $created = awikWhatsAppTestCall('POST', '/api/v1/whatsapp/templates', $tokens['ADMIN'], [
        'name' => 'Welcome',
        'body' => 'Hi {{customer_name}}',
        'key' => 'whatsapp.welcome_template',
    ]);
    awikWhatsAppTestAssert($created['statusCode'] === 201, 'Admin template create failed: ' . json_encode($created));
    $createdTemplate = awikWhatsAppTestQuery('SELECT `key` FROM awik_company_settings WHERE `value` = ?', ['Hi {{customer_name}}']);
    awikWhatsAppTestAssert(($createdTemplate[0]['key'] ?? null) === 'whatsapp.welcome_template', 'Template key was not persisted');

    // ─── Due reminders + trigger + history ──────────
    $due = awikWhatsAppTestCall('GET', '/api/v1/whatsapp/reminders/due', $tokens['STAFF']);
    awikWhatsAppTestAssert($due['statusCode'] === 200, 'Due reminders request failed');
    awikWhatsAppTestAssert($due['payload']['data']['count'] >= 1, 'Expected at least one due reminder: ' . json_encode($due['payload']));

    $trigger = awikWhatsAppTestCall('POST', '/api/v1/whatsapp/reminders/trigger', $tokens['STAFF'], []);
    awikWhatsAppTestAssert($trigger['statusCode'] === 200 && $trigger['payload']['data']['processed'] >= 1, 'Reminder trigger processed count mismatch');

    $reminderRows = awikWhatsAppTestQuery('SELECT `status`, `reminderType` FROM awik_whatsapp_reminders WHERE `subscriptionId` = ?', [$subscriptionId]);
    awikWhatsAppTestAssert($reminderRows !== [], 'Reminder row was not persisted');

    $reminders = awikWhatsAppTestCall('GET', '/api/v1/whatsapp/reminders', $tokens['STAFF']);
    awikWhatsAppTestAssert($reminders['statusCode'] === 200 && $reminders['payload']['data']['total'] >= 1, 'Reminder history total mismatch');

    awikWhatsAppTestAssert(awikWhatsAppTestCall('GET', '/api/v1/whatsapp/reminders?reminderType=NOPE', $tokens['STAFF'])['statusCode'] === 400, 'Invalid reminder type filter was not rejected');

    // ─── Database error surfaces a safe 500 ─────────
    $connection = awikDatabase();
    $connection->exec('DROP TABLE awik_whatsapp_messages');
    $connection = null;
    $failure = awikWhatsAppTestCall('GET', '/api/v1/whatsapp/messages', $tokens['STAFF']);
    awikWhatsAppTestAssert($failure['statusCode'] === 500, 'Database failure did not surface a safe 500');
    awikWhatsAppTestAssert($failure['payload']['message'] === 'Internal server error', 'Database failure leaked detail');

    echo "AWIK WhatsApp API contract tests passed\n";
} finally {
    gc_collect_cycles();
}

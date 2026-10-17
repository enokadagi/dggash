<?php

declare(strict_types=1);

$externalDsn = getenv('AWIK_MIGRATION_DSN');
$useMariaDb = is_string($externalDsn) && str_starts_with($externalDsn, 'mysql:');
$databasePath = $useMariaDb ? null : sys_get_temp_dir() . '/awik_php_http_' . bin2hex(random_bytes(12)) . '.sqlite';
$testUserId = '00000000-0000-4000-8000-000000000201';
$testEmail = 'http-test@example.invalid';
$password = bin2hex(random_bytes(12));
if (!$useMariaDb) {
    putenv('AWIK_MIGRATION_DSN=sqlite:' . $databasePath);
    putenv('AWIK_MIGRATION_DB_USER=');
    putenv('AWIK_MIGRATION_DB_PASSWORD=');
    putenv('AWIK_MIGRATION_JWT_SECRET=local-http-access-secret-for-tests-only-32');
    putenv('AWIK_MIGRATION_JWT_REFRESH_SECRET=local-http-refresh-secret-for-tests-only-32');
}

function awikHttpTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function awikHttpTestRemoveDirectory(string $path): void
{
    if (!is_dir($path)) {
        return;
    }

    $entries = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($entries as $entry) {
        if ($entry->isDir() && !$entry->isLink()) {
            rmdir($entry->getPathname());
        } else {
            unlink($entry->getPathname());
        }
    }
    rmdir($path);
}

function awikHttpTestRequest(string $url, string $method, ?array $body = null): array
{
    $headers = ['Accept: application/json'];
    $content = '';
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
        $content = (string) json_encode($body, JSON_THROW_ON_ERROR);
    }

    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'content' => $content,
        'ignore_errors' => true,
        'timeout' => 3,
    ]]);
    $bodyText = @file_get_contents($url, false, $context);
    $statusLine = $http_response_header[0] ?? '';
    preg_match('/\s(\d{3})\s/', $statusLine, $matches);
    $statusCode = isset($matches[1]) ? (int) $matches[1] : 0;

    try {
        $payload = is_string($bodyText) ? json_decode($bodyText, true, 512, JSON_THROW_ON_ERROR) : null;
    } catch (JsonException) {
        $payload = null;
    }

    return ['statusCode' => $statusCode, 'payload' => $payload];
}

function awikHttpTestAssertError(array $response, int $statusCode, string $path): void
{
    awikHttpTestAssert($response['statusCode'] === $statusCode, 'Unexpected HTTP status for ' . $path);
    $payload = $response['payload'];
    awikHttpTestAssert(is_array($payload), 'Response body was not JSON for ' . $path);
    awikHttpTestAssert(($payload['success'] ?? null) === false, 'Failure envelope missing for ' . $path);
    awikHttpTestAssert(($payload['statusCode'] ?? null) === $statusCode, 'Error statusCode mismatch for ' . $path);
    awikHttpTestAssert(($payload['path'] ?? null) === $path, 'Error path mismatch for ' . $path);
}

$prototypeRoot = dirname(__DIR__);
$repositoryRoot = dirname($prototypeRoot);
$publicIndex = $prototypeRoot . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'index.php';
$rewriteRules = file_get_contents($prototypeRoot . DIRECTORY_SEPARATOR . '.htaccess');
$webRewriteRules = file_get_contents($repositoryRoot . DIRECTORY_SEPARATOR . 'apps' . DIRECTORY_SEPARATOR . 'web' . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . '.htaccess');
$apiBridge = file_get_contents($repositoryRoot . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'hostinger-api-bridge.php');
$packageBuilder = file_get_contents($repositoryRoot . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'build-hostinger-package.ps1');
$bridgeFixtureRoot = null;
$server = null;
$database = null;
$exitCode = 0;

try {
    awikHttpTestAssert(is_file($publicIndex), 'Public HTTP entrypoint is missing');
    awikHttpTestAssert(is_string($rewriteRules), 'Cannot read .htaccess');
    awikHttpTestAssert(is_string($webRewriteRules), 'Cannot read static web .htaccess');
    awikHttpTestAssert(is_string($apiBridge), 'Cannot read Hostinger API bridge');
    awikHttpTestAssert(is_string($packageBuilder), 'Cannot read Hostinger package builder');
    awikHttpTestAssert(str_contains($rewriteRules, 'RewriteCond %{REQUEST_URI} ^/api/v1(?:/|$) [NC]'), 'API base path rewrite is missing');
    awikHttpTestAssert(str_contains($rewriteRules, 'RewriteRule ^ public/index.php [QSA,L]'), 'API rewrite target does not use the public entrypoint');
    awikHttpTestAssert(str_contains($rewriteRules, 'RewriteRule ^private(?:/|$) - [F,L]'), 'Private PHP files must be denied when the prototype root is served directly');
    $webApiRewritePosition = strpos($webRewriteRules, 'RewriteRule ^api/v1(?:/|$) api/index.php [QSA,L]');
    $webSpaFallbackPosition = strpos($webRewriteRules, 'RewriteRule ^ index.html [QSA,L]');
    awikHttpTestAssert(
        $webApiRewritePosition !== false && $webSpaFallbackPosition !== false && $webApiRewritePosition < $webSpaFallbackPosition,
        'Static web .htaccess must route /api/v1 to the PHP bridge before the SPA fallback'
    );
    awikHttpTestAssert(
        str_contains($apiBridge, "dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'staging-api'")
            && str_contains($apiBridge, "dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'api'")
            && str_contains($apiBridge, "'public' . DIRECTORY_SEPARATOR . 'index.php'")
            && str_contains($apiBridge, "Application unavailable"),
        'Hostinger API bridge must resolve staging-private first, fall back to the production layout, and fail closed'
    );
    $bridgeCopyCommand = "Copy-Item (Join-Path " . '$PSScriptRoot' . " 'hostinger-api-bridge.php') "
        . "(Join-Path " . '$packageDir' . " 'public_html/api/index.php') -Force";
    $bridgeDirectoryCommand = "New-Item -ItemType Directory -Path (Join-Path " . '$packageDir'
        . " 'public_html/api') -Force";
    awikHttpTestAssert(
        str_contains($packageBuilder, $bridgeCopyCommand)
            && str_contains($packageBuilder, $bridgeDirectoryCommand),
        'Hostinger package builder must create public_html/api and copy the sibling-relative bridge there'
    );
    awikHttpTestAssert(
        str_contains($packageBuilder, "Copy-Item (Join-Path " . '$root' . " 'hostinger-php-prototype/.htaccess') (Join-Path " . '$packageDir' . " 'api/.htaccess') -Force")
            && str_contains($packageBuilder, "Copy-Item (Join-Path " . '$root' . " 'hostinger-php-prototype/private') (Join-Path " . '$packageDir' . " 'api/private') -Recurse -Force")
            && str_contains($packageBuilder, "Copy-Item (Join-Path " . '$root' . " 'hostinger-php-prototype/public') (Join-Path " . '$packageDir' . " 'api/public') -Recurse -Force")
            && !str_contains($packageBuilder, "hostinger-php-prototype/database/migrations') (Join-Path " . '$packageDir' . " 'api/database/migrations')")
            && str_contains($packageBuilder, 'legacy `2026_10_13_company_settings.sql` helper remains in the source repository but is not packaged')
            && !str_contains($packageBuilder, "Copy-Item (Join-Path " . '$root' . " 'hostinger-php-prototype/*')"),
        'Package must copy PHP runtime code and one canonical migration chain outside public_html, not legacy duplicate paths, tests, or fixtures'
    );
    awikHttpTestAssert(
        !is_dir($prototypeRoot . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'private')
            && is_dir($prototypeRoot . DIRECTORY_SEPARATOR . 'private'),
        'PHP private source must remain outside the document-root public directory'
    );
    awikHttpTestAssert(
        str_contains($packageBuilder, '[System.IO.Compression.ZipArchive]::new')
            && str_contains($packageBuilder, 'Get-ChildItem -LiteralPath $packageDir -Recurse -Force -File')
            && str_contains($packageBuilder, '[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile')
            && !str_contains($packageBuilder, 'Compress-Archive'),
        'Hostinger package builder must archive all files, including hidden .htaccess files'
    );
    awikHttpTestAssert(
        str_contains($packageBuilder, "'public_html/.htaccess', 'api/.htaccess'")
            && str_contains($packageBuilder, '[System.IO.Compression.ZipFile]::OpenRead'),
        'Hostinger package builder must verify both public and API .htaccess archive entries'
    );
    $bridgeFixtureRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'awik_hostinger_bridge_' . bin2hex(random_bytes(12));
    awikHttpTestAssert(!file_exists($bridgeFixtureRoot), 'Generated bridge fixture path already exists');
    $bridgePublicApiDirectory = $bridgeFixtureRoot . DIRECTORY_SEPARATOR . 'package' . DIRECTORY_SEPARATOR . 'public_html' . DIRECTORY_SEPARATOR . 'api';
    $bridgeSiblingEntryPoint = $bridgeFixtureRoot . DIRECTORY_SEPARATOR . 'package' . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'index.php';
    awikHttpTestAssert(mkdir($bridgePublicApiDirectory, 0700, true), 'Could not create isolated bridge fixture');
    awikHttpTestAssert(mkdir(dirname($bridgeSiblingEntryPoint), 0700, true), 'Could not create isolated sibling API fixture');
    $bridgeScript = $bridgePublicApiDirectory . DIRECTORY_SEPARATOR . 'index.php';
    awikHttpTestAssert(copy($repositoryRoot . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'hostinger-api-bridge.php', $bridgeScript), 'Could not copy API bridge into fixture layout');
    awikHttpTestAssert(
        file_put_contents($bridgeSiblingEntryPoint, "<?php echo 'AWIK_HOSTINGER_BRIDGE_OK';") !== false,
        'Could not create sibling API entrypoint fixture'
    );
    $bridgeProcess = proc_open([PHP_BINARY, $bridgeScript], [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ], $bridgePipes, $bridgePublicApiDirectory, null, ['bypass_shell' => true]);
    awikHttpTestAssert(is_resource($bridgeProcess), 'Could not execute bridge against isolated sibling layout');
    fclose($bridgePipes[0]);
    $bridgeOutput = stream_get_contents($bridgePipes[1]);
    $bridgeError = stream_get_contents($bridgePipes[2]);
    fclose($bridgePipes[1]);
    fclose($bridgePipes[2]);
    awikHttpTestAssert(proc_close($bridgeProcess) === 0, 'Bridge fixture failed: ' . (string) $bridgeError);
    awikHttpTestAssert($bridgeOutput === 'AWIK_HOSTINGER_BRIDGE_OK', 'Bridge did not reach the sibling API front controller');

    // Staging layout fixture: the bridge lives one level deeper under the document root
    // (.../public_html/staging/api/index.php) and the staging-private application directory
    // sits outside the document root (.../staging-api).
    $stagingBridgeDirectory = $bridgeFixtureRoot . DIRECTORY_SEPARATOR . 'package' . DIRECTORY_SEPARATOR . 'public_html' . DIRECTORY_SEPARATOR . 'staging' . DIRECTORY_SEPARATOR . 'api';
    $stagingPrivateDirectory = $bridgeFixtureRoot . DIRECTORY_SEPARATOR . 'package' . DIRECTORY_SEPARATOR . 'staging-api';
    $stagingBridgeScript = $stagingBridgeDirectory . DIRECTORY_SEPARATOR . 'index.php';
    $stagingPublicEntry = $stagingPrivateDirectory . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'index.php';
    awikHttpTestAssert(mkdir($stagingBridgeDirectory, 0700, true), 'Could not create isolated staging bridge fixture');
    awikHttpTestAssert(mkdir(dirname($stagingPublicEntry), 0700, true), 'Could not create isolated staging-private fixture');
    awikHttpTestAssert(copy($repositoryRoot . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'hostinger-api-bridge.php', $stagingBridgeScript), 'Could not copy API bridge into staging fixture layout');
    awikHttpTestAssert(file_put_contents($stagingPublicEntry, "<?php echo 'AWIK_HOSTINGER_STAGING_BRIDGE_OK';") !== false, 'Could not create staging API entrypoint fixture');
    $stagingBridgeProcess = proc_open([PHP_BINARY, $stagingBridgeScript], [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ], $stagingBridgePipes, $stagingBridgeDirectory, null, ['bypass_shell' => true]);
    awikHttpTestAssert(is_resource($stagingBridgeProcess), 'Could not execute staging bridge against isolated layout');
    fclose($stagingBridgePipes[0]);
    $stagingBridgeOutput = stream_get_contents($stagingBridgePipes[1]);
    $stagingBridgeError = stream_get_contents($stagingBridgePipes[2]);
    fclose($stagingBridgePipes[1]);
    fclose($stagingBridgePipes[2]);
    awikHttpTestAssert(proc_close($stagingBridgeProcess) === 0, 'Staging bridge fixture failed: ' . (string) $stagingBridgeError);
    awikHttpTestAssert($stagingBridgeOutput === 'AWIK_HOSTINGER_STAGING_BRIDGE_OK', 'Staging bridge did not reach the staging-private front controller');

    // Remove the staging-private fixture so the fail-closed bridge sees no
    // intended private application directory anywhere under the package root.
    awikHttpTestRemoveDirectory($stagingPrivateDirectory);

    // Fail-closed fixture: no intended private directory exists anywhere.
    $failClosedDirectory = $bridgeFixtureRoot . DIRECTORY_SEPARATOR . 'package' . DIRECTORY_SEPARATOR . 'public_html' . DIRECTORY_SEPARATOR . 'fail-closed' . DIRECTORY_SEPARATOR . 'api';
    $failClosedScript = $failClosedDirectory . DIRECTORY_SEPARATOR . 'index.php';
    awikHttpTestAssert(mkdir($failClosedDirectory, 0700, true), 'Could not create fail-closed bridge fixture');
    awikHttpTestAssert(copy($repositoryRoot . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'hostinger-api-bridge.php', $failClosedScript), 'Could not copy API bridge into fail-closed fixture layout');
    $failClosedProcess = proc_open([PHP_BINARY, $failClosedScript], [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ], $failClosedPipes, $failClosedDirectory, null, ['bypass_shell' => true]);
    awikHttpTestAssert(is_resource($failClosedProcess), 'Could not execute fail-closed bridge fixture');
    fclose($failClosedPipes[0]);
    $failClosedOutput = stream_get_contents($failClosedPipes[1]);
    $failClosedError = stream_get_contents($failClosedPipes[2]);
    fclose($failClosedPipes[1]);
    fclose($failClosedPipes[2]);
    awikHttpTestAssert(proc_close($failClosedProcess) === 0, 'Fail-closed bridge fixture failed: ' . (string) $failClosedError);
    $failClosedPayload = json_decode((string) $failClosedOutput, true, 512, JSON_THROW_ON_ERROR);
    awikHttpTestAssert(is_array($failClosedPayload) && ($failClosedPayload['success'] ?? null) === false && ($failClosedPayload['message'] ?? '') === 'Application unavailable', 'Fail-closed bridge did not return a generic unavailable response');
    awikHttpTestAssert(!str_contains((string) $failClosedOutput, $bridgeFixtureRoot), 'Fail-closed response must not leak filesystem paths');

    if ($useMariaDb) {
        $database = new PDO(
            (string) $externalDsn,
            (string) getenv('AWIK_MIGRATION_DB_USER'),
            (string) getenv('AWIK_MIGRATION_DB_PASSWORD'),
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
    } else {
        $database = new PDO('sqlite:' . $databasePath, '', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $database->exec('CREATE TABLE awik_users (
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
        $database->exec('CREATE TABLE awik_user_tokens (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            tokenHash TEXT NOT NULL,
            tokenType TEXT NOT NULL,
            expiresAt TEXT NOT NULL,
            revokedAt TEXT NULL,
            createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            lastUsedAt TEXT NULL
        )');
        $database->exec('CREATE TABLE awik_login_attempts (
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
        $database->exec('CREATE INDEX idx_awik_login_attempts_locked_until ON awik_login_attempts(lockedUntil)');
        $database->exec('CREATE INDEX idx_awik_login_attempts_last_failed_at ON awik_login_attempts(scopeType, lastFailedAt)');
    }

    $database->prepare('INSERT INTO awik_users (id, email, phone, firstName, lastName, passwordHash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([
            $testUserId,
            $testEmail,
            '+15550000201',
            'HTTP',
            'Test',
            password_hash($password, PASSWORD_BCRYPT),
            'STAFF',
            'ACTIVE',
        ]);
    $database = null;

    $socket = stream_socket_server('tcp://127.0.0.1:0', $errno, $errorMessage);
    awikHttpTestAssert(is_resource($socket), 'Cannot reserve a local test port: ' . $errorMessage);
    $socketAddress = stream_socket_get_name($socket, false);
    fclose($socket);
    $port = (int) substr((string) strrchr((string) $socketAddress, ':'), 1);
    awikHttpTestAssert($port > 0, 'Could not determine local test port');

    $command = [PHP_BINARY];
    if (!$useMariaDb) {
        $command[] = '-d';
        $command[] = 'extension=php_pdo_sqlite.dll';
    }
    array_push($command,
        '-S',
        '127.0.0.1:' . $port,
        '-t',
        $prototypeRoot,
        $publicIndex,
    );
    $server = proc_open($command, [
        0 => ['pipe', 'r'],
        1 => ['file', 'NUL', 'a'],
        2 => ['file', 'NUL', 'a'],
    ], $pipes, $prototypeRoot, null, ['bypass_shell' => true]);
    awikHttpTestAssert(is_resource($server), 'Could not start local PHP HTTP server');
    fclose($pipes[0]);

    $baseUrl = 'http://127.0.0.1:' . $port;
    $ready = false;
    for ($attempt = 0; $attempt < 80; $attempt++) {
        $connection = @stream_socket_client('tcp://127.0.0.1:' . $port, $connectErrno, $connectError, 0.1);
        if (is_resource($connection)) {
            fclose($connection);
            $ready = true;
            break;
        }
        usleep(50000);
    }
    awikHttpTestAssert($ready, 'Local PHP HTTP server did not start');

    $login = awikHttpTestRequest($baseUrl . '/api/v1/auth/login', 'POST', [
        'identifier' => $testEmail,
        'password' => $password,
    ]);
    awikHttpTestAssert($login['statusCode'] === 200, 'HTTP login did not return 200');
    awikHttpTestAssert(($login['payload']['success'] ?? false) === true, 'HTTP login success envelope missing');
    awikHttpTestAssert(isset($login['payload']['data']['accessToken'], $login['payload']['data']['refreshToken']), 'HTTP login token data missing');

    $badLogin = awikHttpTestRequest($baseUrl . '/api/v1/auth/login', 'POST', [
        'identifier' => $testEmail,
        'password' => 'not-the-test-password',
    ]);
    awikHttpTestAssertError($badLogin, 401, '/api/v1/auth/login');

    $unauthorized = awikHttpTestRequest($baseUrl . '/api/v1/auth/profile', 'GET');
    awikHttpTestAssertError($unauthorized, 401, '/api/v1/auth/profile');

    $unknown = awikHttpTestRequest($baseUrl . '/api/v1/not-a-real-route', 'GET');
    awikHttpTestAssertError($unknown, 404, '/api/v1/not-a-real-route');

    echo "AWIK PHP HTTP entrypoint tests passed\n";
} catch (Throwable $exception) {
    fwrite(STDERR, $exception->getMessage() . PHP_EOL);
    $exitCode = 1;
} finally {
    if (is_resource($server)) {
        proc_terminate($server);
        proc_close($server);
    }
    if ($database instanceof PDO) {
        if ($useMariaDb) {
            $database->prepare('DELETE FROM awik_login_attempts WHERE scopeType = ? AND scopeKey = ?')
                ->execute(['identifier', 'account:' . hash('sha256', 'email:' . $testEmail)]);
            $database->prepare('DELETE FROM awik_user_tokens WHERE userId = ?')->execute([$testUserId]);
            $database->prepare('DELETE FROM awik_users WHERE id = ?')->execute([$testUserId]);
        }
        $database = null;
    }
    if (is_string($databasePath) && is_file($databasePath)) {
        unlink($databasePath);
    }
    if (is_string($bridgeFixtureRoot)) {
        awikHttpTestRemoveDirectory($bridgeFixtureRoot);
    }
}

exit($exitCode);

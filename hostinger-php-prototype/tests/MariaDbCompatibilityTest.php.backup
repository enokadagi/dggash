<?php

declare(strict_types=1);

function awikMariaDbTestAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function awikMariaDbTestRemoveDirectory(string $path): void
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

function awikMariaDbTestTableNames(PDO $db): array
{
    $names = $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    sort($names);
    return $names;
}

function awikMariaDbTestStartHttpServer(string $prototypeRoot, string $publicIndex, int $timeoutAttempts = 80): array
{
    $socket = stream_socket_server('tcp://127.0.0.1:0', $socketError, $socketMessage);
    awikMariaDbTestAssert(is_resource($socket), 'Cannot reserve local PHP HTTP test port: ' . $socketMessage);
    $socketAddress = stream_socket_get_name($socket, false);
    fclose($socket);
    $port = (int) substr((string) strrchr((string) $socketAddress, ':'), 1);
    awikMariaDbTestAssert($port > 0, 'Could not determine local PHP HTTP test port');

    $process = proc_open([
        PHP_BINARY,
        '-S',
        '127.0.0.1:' . $port,
        '-t',
        $prototypeRoot,
        $publicIndex,
    ], [
        0 => ['pipe', 'r'],
        1 => ['file', 'NUL', 'a'],
        2 => ['file', 'NUL', 'a'],
    ], $pipes, $prototypeRoot, null, ['bypass_shell' => true]);
    awikMariaDbTestAssert(is_resource($process), 'Could not start local PHP HTTP entrypoint');
    fclose($pipes[0]);

    $ready = false;
    for ($attempt = 0; $attempt < $timeoutAttempts; $attempt++) {
        $connection = @stream_socket_client('tcp://127.0.0.1:' . $port, $connectErrno, $connectError, 0.1);
        if (is_resource($connection)) {
            fclose($connection);
            $ready = true;
            break;
        }
        usleep(50000);
    }
    if (!$ready) {
        proc_terminate($process);
        proc_close($process);
        throw new RuntimeException('Local PHP HTTP entrypoint did not start');
    }

    return ['process' => $process, 'baseUrl' => 'http://127.0.0.1:' . $port];
}

function awikMariaDbTestCollectChildProcess(array &$child, int $timeoutSeconds = 30): array
{
    awikMariaDbTestAssert(is_resource($child['process'] ?? null), 'Child process is not registered');
    awikMariaDbTestAssert($timeoutSeconds > 0, 'Child process timeout must be positive');
    foreach ([1, 2] as $pipeIndex) {
        if (is_resource($child['pipes'][$pipeIndex] ?? null)) {
            stream_set_blocking($child['pipes'][$pipeIndex], false);
        }
    }

    if (is_resource($child['pipes'][0] ?? null)) {
        fclose($child['pipes'][0]);
        $child['pipes'][0] = null;
    }

    $output = [1 => '', 2 => ''];
    $deadline = microtime(true) + $timeoutSeconds;
    do {
        foreach ([1, 2] as $pipeIndex) {
            if (is_resource($child['pipes'][$pipeIndex] ?? null)) {
                $chunk = stream_get_contents($child['pipes'][$pipeIndex]);
                if (is_string($chunk)) {
                    $output[$pipeIndex] .= $chunk;
                }
            }
        }
        $status = proc_get_status($child['process']);
        if (!$status['running']) {
            break;
        }
        if (microtime(true) >= $deadline) {
            throw new RuntimeException('Child process exceeded its ' . $timeoutSeconds . '-second timeout');
        }
        usleep(10000);
    } while (true);

    foreach ([1, 2] as $pipeIndex) {
        if (is_resource($child['pipes'][$pipeIndex] ?? null)) {
            $chunk = stream_get_contents($child['pipes'][$pipeIndex]);
            if (is_string($chunk)) {
                $output[$pipeIndex] .= $chunk;
            }
            fclose($child['pipes'][$pipeIndex]);
            $child['pipes'][$pipeIndex] = null;
        }
    }
    $closeExitCode = proc_close($child['process']);
    $child['process'] = null;
    $exitCode = (int) ($status['exitcode'] ?? -1);
    if ($exitCode < 0) {
        $exitCode = $closeExitCode;
    }

    return ['exitCode' => $exitCode, 'stdout' => $output[1], 'stderr' => $output[2]];
}

function awikMariaDbTestStopHttpServer(array &$server): void
{
    if (is_resource($server['process'] ?? null)) {
        $status = proc_get_status($server['process']);
        if ($status['running']) {
            proc_terminate($server['process']);
            $deadline = microtime(true) + 2;
            do {
                $status = proc_get_status($server['process']);
                if (!$status['running']) {
                    break;
                }
                usleep(10000);
            } while (microtime(true) < $deadline);
            if ($status['running']) {
                proc_terminate($server['process'], 9);
            }
        }
    }
    foreach (($server['pipes'] ?? []) as $pipe) {
        if (is_resource($pipe)) {
            fclose($pipe);
        }
    }
    if (is_resource($server['process'] ?? null)) {
        proc_close($server['process']);
    }
    $server = [];
}

function awikMariaDbTestHttpRequest(string $baseUrl, string $path, string $method, array $body = [], array $headers = []): array
{
    $requestHeaders = ['Accept: application/json', 'Content-Type: application/json'];
    foreach ($headers as $name => $value) {
        $requestHeaders[] = $name . ': ' . $value;
    }
    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $requestHeaders),
        'content' => json_encode($body, JSON_THROW_ON_ERROR),
        'ignore_errors' => true,
        'timeout' => 5,
    ]]);
    $responseBody = @file_get_contents($baseUrl . $path, false, $context);
    $statusLine = $http_response_header[0] ?? '';
    preg_match('/\s(\d{3})\s/', $statusLine, $statusMatches);
    $responseHeaders = [];
    foreach ($http_response_header ?? [] as $headerLine) {
        if (str_contains($headerLine, ':')) {
            [$name, $value] = explode(':', $headerLine, 2);
            $responseHeaders[strtolower(trim($name))] = trim($value);
        }
    }
    try {
        $payload = is_string($responseBody) ? json_decode($responseBody, true, 512, JSON_THROW_ON_ERROR) : null;
    } catch (JsonException) {
        $payload = null;
    }

    return [
        'statusCode' => isset($statusMatches[1]) ? (int) $statusMatches[1] : 0,
        'payload' => $payload,
        'headers' => $responseHeaders,
    ];
}

function awikMariaDbTestLockWaitDiagnostics(PDO $observerDb, string $databaseName, array $httpChildStates): array
{
    $lockTablePattern = '%`' . $databaseName . '`%';
    $rawLockWaits = $observerDb->query(
        'SELECT requesting_trx_id, requested_lock_id, blocking_trx_id, blocking_lock_id '
        . 'FROM INFORMATION_SCHEMA.INNODB_LOCK_WAITS'
    )->fetchAll(PDO::FETCH_ASSOC);
    $rawLocks = $observerDb->query(
        'SELECT lock_id, lock_trx_id, lock_table, lock_index, lock_type, lock_mode, lock_data '
        . 'FROM INFORMATION_SCHEMA.INNODB_LOCKS'
    )->fetchAll(PDO::FETCH_ASSOC);
    $rawTransactions = $observerDb->query(
        'SELECT trx_id, trx_state, trx_wait_started, trx_mysql_thread_id, trx_query '
        . 'FROM INFORMATION_SCHEMA.INNODB_TRX ORDER BY trx_mysql_thread_id'
    )->fetchAll(PDO::FETCH_ASSOC);
    $lockWaits = $observerDb->prepare(
        'SELECT w.requesting_trx_id, w.blocking_trx_id, '
        . 'rl.lock_table AS requested_table, rl.lock_index AS requested_index, '
        . 'rl.lock_type AS requested_type, rl.lock_mode AS requested_mode, rl.lock_data AS requested_data, '
        . 'bl.lock_table AS blocking_table, bl.lock_index AS blocking_index, '
        . 'bl.lock_type AS blocking_type, bl.lock_mode AS blocking_mode, bl.lock_data AS blocking_data '
        . 'FROM INFORMATION_SCHEMA.INNODB_LOCK_WAITS w '
        . 'LEFT JOIN INFORMATION_SCHEMA.INNODB_LOCKS rl ON rl.lock_id = w.requested_lock_id '
        . 'LEFT JOIN INFORMATION_SCHEMA.INNODB_LOCKS bl ON bl.lock_id = w.blocking_lock_id '
        . 'WHERE rl.lock_table LIKE ? OR bl.lock_table LIKE ?'
    );
    $lockWaits->execute([$lockTablePattern, $lockTablePattern]);
    $transactions = $observerDb->prepare(
        'SELECT t.trx_id, t.trx_state, t.trx_started, t.trx_wait_started, '
        . 't.trx_mysql_thread_id, t.trx_query, t.trx_operation_state, t.trx_tables_locked, t.trx_rows_locked '
        . 'FROM INFORMATION_SCHEMA.INNODB_TRX t '
        . 'INNER JOIN INFORMATION_SCHEMA.PROCESSLIST p ON p.ID = t.trx_mysql_thread_id '
        . 'WHERE p.DB = ? ORDER BY t.trx_mysql_thread_id'
    );
    $transactions->execute([$databaseName]);
    $processList = $observerDb->prepare(
        'SELECT ID, USER, HOST, DB, COMMAND, TIME, STATE, INFO '
        . 'FROM INFORMATION_SCHEMA.PROCESSLIST WHERE DB = ? ORDER BY ID'
    );
    $processList->execute([$databaseName]);
    $observerIdentity = $observerDb->query(
        'SELECT USER() AS connectionUser, CURRENT_USER() AS privilegeAccount, DATABASE() AS selectedDatabase'
    )->fetch(PDO::FETCH_ASSOC);
    $observerGrantLines = $observerDb->query('SHOW GRANTS')->fetchAll(PDO::FETCH_COLUMN);
    $observerHasProcessPrivilege = false;
    foreach ($observerGrantLines as $grantLine) {
        if (preg_match('/\b(?:ALL PRIVILEGES|PROCESS)\b/i', (string) $grantLine) === 1) {
            $observerHasProcessPrivilege = true;
            break;
        }
    }
    $metadataLocks = [];
    $metadataLocksError = null;
    try {
        $metadataLockQuery = $observerDb->prepare(
            'SELECT t.PROCESSLIST_ID, m.OBJECT_TYPE, m.OBJECT_SCHEMA, m.OBJECT_NAME, '
            . 'm.LOCK_TYPE, m.LOCK_DURATION, m.LOCK_STATUS '
            . 'FROM performance_schema.metadata_locks m '
            . 'INNER JOIN performance_schema.threads t ON t.THREAD_ID = m.OWNER_THREAD_ID '
            . 'WHERE m.OBJECT_SCHEMA = ? ORDER BY t.PROCESSLIST_ID'
        );
        $metadataLockQuery->execute([$databaseName]);
        $metadataLocks = $metadataLockQuery->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $exception) {
        $metadataLocksError = $exception->getMessage();
    }
    $innodbStatusRow = $observerDb->query('SHOW ENGINE INNODB STATUS')->fetch(PDO::FETCH_ASSOC);
    $innodbStatus = (string) ($innodbStatusRow['Status'] ?? '');
    $transactionStatusPosition = strpos($innodbStatus, 'TRANSACTIONS');
    $transactionStatus = $transactionStatusPosition === false
        ? substr($innodbStatus, 0, 2500)
        : substr($innodbStatus, $transactionStatusPosition, 3500);

    return [
        'httpChildProcesses' => $httpChildStates,
        'rawInnoDbLockWaits' => $rawLockWaits,
        'rawInnoDbLocks' => $rawLocks,
        'rawInnoDbTransactions' => $rawTransactions,
        'observerIdentity' => $observerIdentity,
        'observerHasProcessPrivilege' => $observerHasProcessPrivilege,
        'innodbLockWaits' => $lockWaits->fetchAll(PDO::FETCH_ASSOC),
        'innodbTransactions' => $transactions->fetchAll(PDO::FETCH_ASSOC),
        'processList' => $processList->fetchAll(PDO::FETCH_ASSOC),
        'metadataLocks' => $metadataLocks,
        'metadataLocksError' => $metadataLocksError,
        'innodbTransactionStatus' => $transactionStatus,
    ];
}

function awikMariaDbTestStatusExactRowWaiterEvidence(PDO $observerDb, PDO $lockingDb, string $operation, string $databaseName, string $tableName, string $rowId, string $runtimeDbUser, int $expectedWaits, array $httpChildStates): array
{
    if (!$lockingDb->inTransaction() || count($httpChildStates) !== $expectedWaits) {
        return [];
    }
    $httpChildPids = [];
    foreach ($httpChildStates as $childState) {
        if (($childState['running'] ?? false) !== true) {
            return [];
        }
        $httpChildPids[] = (int) ($childState['pid'] ?? 0);
    }
    if (count(array_unique($httpChildPids)) !== $expectedWaits || in_array(0, $httpChildPids, true)) {
        return [];
    }
    if (preg_match('/^[a-zA-Z0-9_]+$/', $tableName) !== 1) {
        return [];
    }

    $rowPrefix = substr($rowId, 0, 30);
    // MariaDB 10.5 truncates PHYSICAL RECORD output; require this prefix to identify exactly one full test UUID.
    $rowIds = $lockingDb->prepare('SELECT id FROM `' . $tableName . '` WHERE LEFT(id, 30) = ?');
    $rowIds->execute([$rowPrefix]);
    $matchedRowIds = $rowIds->fetchAll(PDO::FETCH_COLUMN);
    if (count($matchedRowIds) !== 1 || $matchedRowIds[0] !== $rowId) {
        return [];
    }

    $expectedHttpQueries = [
        'sale-refund' => [
            'table' => 'awik_sales',
            'query' => 'SELECT * FROM awik_sales WHERE id = ? LIMIT 1 FOR UPDATE',
        ],
        'sale-cancel' => [
            'table' => 'awik_sales',
            'query' => 'SELECT * FROM awik_sales WHERE id = ? LIMIT 1 FOR UPDATE',
        ],
        'inventory-movement' => [
            'table' => 'awik_products',
            'query' => 'SELECT * FROM awik_products WHERE id = ? AND deletedAt IS NULL LIMIT 1 FOR UPDATE',
        ],
    ];
    $expectedHttpQuery = $expectedHttpQueries[$operation] ?? null;
    if (!is_array($expectedHttpQuery) || $expectedHttpQuery['table'] !== $tableName) {
        return [];
    }
    $httpSessions = $observerDb->prepare(
        'SELECT ID, USER, DB, INFO FROM INFORMATION_SCHEMA.PROCESSLIST '
        . 'WHERE DB = ? AND USER = ? ORDER BY ID'
    );
    $httpSessions->execute([$databaseName, $runtimeDbUser]);
    $httpSessionRows = array_values(array_filter(
        $httpSessions->fetchAll(PDO::FETCH_ASSOC),
        static fn (array $session): bool => ($session['INFO'] ?? null) === $expectedHttpQuery['query']
    ));
    if (count($httpSessionRows) !== $expectedWaits) {
        return [];
    }
    $httpConnectionIds = array_map(static fn (array $row): int => (int) $row['ID'], $httpSessionRows);

    $statusRow = $observerDb->query('SHOW ENGINE INNODB STATUS')->fetch(PDO::FETCH_ASSOC);
    $status = (string) ($statusRow['Status'] ?? '');
    $transactionPosition = strpos($status, 'TRANSACTIONS');
    if ($transactionPosition === false) {
        return [];
    }
    $transactionStatus = substr($status, $transactionPosition);
    $blocks = preg_split('/(?=---TRANSACTION\s+\d+,\s+ACTIVE)/', $transactionStatus) ?: [];
    $schemaPattern = preg_quote($databaseName, '/');
    $tablePattern = preg_quote($tableName, '/');
    $expectedHexPrefix = bin2hex($rowPrefix);
    $waiters = [];
    $blockerThreadId = (int) $lockingDb->query('SELECT CONNECTION_ID()')->fetchColumn();
    $blockerBlock = null;
    foreach ($blocks as $block) {
        if (preg_match('/MySQL thread id (\d+)/', $block, $threadMatch) !== 1) {
            continue;
        }
        $threadId = (int) $threadMatch[1];
        if ($threadId === $blockerThreadId) {
            $blockerBlock = $block;
            continue;
        }
        if (
            !in_array($threadId, $httpConnectionIds, true)
            || strpos($block, 'LOCK WAIT') === false
            || strpos($block, 'lock_mode X locks rec but not gap waiting') === false
        ) {
            continue;
        }
        if (preg_match(
            '/RECORD LOCKS space id (\d+) page no (\d+).*?index PRIMARY of table `' . $schemaPattern . '`\.`' . $tablePattern . '`/s',
            $block,
            $recordMatch
        ) !== 1 || preg_match('/Record lock, heap no (\d+) PHYSICAL RECORD:/', $block, $heapMatch) !== 1) {
            continue;
        }
        if (preg_match('/^\s*0: len \d+; hex ([0-9a-f]+)/mi', $block, $recordIdMatch) !== 1) {
            continue;
        }
        $physicalIdPrefix = hex2bin($recordIdMatch[1]);
        if (!is_string($physicalIdPrefix) || !str_starts_with($physicalIdPrefix, $rowPrefix)) {
            continue;
        }
        $waiters[$threadId] = [
            'threadId' => $threadId,
            'transactionId' => (int) (preg_match('/---TRANSACTION\s+(\d+)/', $block, $transactionMatch) === 1 ? $transactionMatch[1] : 0),
            'spaceId' => (int) $recordMatch[1],
            'pageNo' => (int) $recordMatch[2],
            'heapNo' => (int) $heapMatch[1],
            'physicalIdPrefix' => $physicalIdPrefix,
        ];
    }
    if (count($waiters) !== $expectedWaits || !is_string($blockerBlock)) {
        return [];
    }

    $recordAddresses = array_unique(array_map(
        static fn (array $waiter): string => $waiter['spaceId'] . ':' . $waiter['pageNo'] . ':' . $waiter['heapNo'],
        $waiters
    ));
    $waiterTransactionIds = array_unique(array_column($waiters, 'transactionId'));
    if (
        count($recordAddresses) !== 1
        || count($waiterTransactionIds) !== $expectedWaits
        || in_array(0, $waiterTransactionIds, true)
        || preg_match('/[1-9]\d* row lock\(s\)/', $blockerBlock) !== 1
    ) {
        return [];
    }

    $blockerTransaction = $observerDb->prepare(
        'SELECT trx_id, trx_rows_locked FROM INFORMATION_SCHEMA.INNODB_TRX WHERE trx_mysql_thread_id = ?'
    );
    $blockerTransaction->execute([$blockerThreadId]);
    $blocker = $blockerTransaction->fetch(PDO::FETCH_ASSOC);
    if (
        !is_array($blocker)
        || (int) $blocker['trx_rows_locked'] !== 1
        || in_array((int) $blocker['trx_id'], $waiterTransactionIds, true)
    ) {
        return [];
    }
    $testTransactions = $observerDb->prepare(
        'SELECT t.trx_mysql_thread_id, t.trx_rows_locked FROM INFORMATION_SCHEMA.INNODB_TRX t '
        . 'INNER JOIN INFORMATION_SCHEMA.PROCESSLIST p ON p.ID = t.trx_mysql_thread_id '
        . 'WHERE p.DB = ? AND t.trx_rows_locked > 0 ORDER BY t.trx_mysql_thread_id'
    );
    $testTransactions->execute([$databaseName]);
    $testRowLockHolders = $testTransactions->fetchAll(PDO::FETCH_ASSOC);
    if (
        count($testRowLockHolders) !== 1
        || (int) $testRowLockHolders[0]['trx_mysql_thread_id'] !== $blockerThreadId
        || (int) $testRowLockHolders[0]['trx_rows_locked'] !== 1
    ) {
        return [];
    }

    return [
        'operation' => $operation,
        'database' => $databaseName,
        'table' => $tableName,
        'rowId' => $rowId,
        'physicalIdPrefix' => $rowPrefix,
        'recordAddress' => reset($recordAddresses),
        'blockingConnectionId' => $blockerThreadId,
        'blockingTransactionId' => (int) $blocker['trx_id'],
        'waitingConnections' => array_values($waiters),
        'httpChildProcesses' => $httpChildStates,
    ];
}

function awikMariaDbTestWaitForInnoDbLockWaits(PDO $observerDb, PDO $lockingDb, string $operation, string $databaseName, string $tableName, string $rowId, int $expectedWaits = 2, int $timeoutSeconds = 10, array $httpChildStates = [], ?string $runtimeDbUser = null): void
{
    $lockTablePattern = '%' . $databaseName . '%' . $tableName . '%';
    $deadline = microtime(true) + $timeoutSeconds;
    $tableWaiters = 0;
    $exactRowWaiters = 0;
    $nextStatusPoll = 0.0;

    try {
        $statement = $observerDb->prepare(
            'SELECT '
            . 'COUNT(DISTINCT w.requesting_trx_id) AS tableWaiters, '
            . 'COUNT(DISTINCT CASE WHEN rl.lock_type = \'RECORD\' AND rl.lock_index = \'PRIMARY\' AND rl.lock_data = ? '
            . 'AND bl.lock_type = \'RECORD\' AND bl.lock_index = \'PRIMARY\' AND bl.lock_data = ? '
            . 'AND bl.lock_table = rl.lock_table '
            . 'THEN w.requesting_trx_id END) AS exactRowWaiters '
            . 'FROM INFORMATION_SCHEMA.INNODB_LOCK_WAITS w '
            . 'INNER JOIN INFORMATION_SCHEMA.INNODB_LOCKS rl ON rl.lock_id = w.requested_lock_id '
            . 'INNER JOIN INFORMATION_SCHEMA.INNODB_LOCKS bl ON bl.lock_id = w.blocking_lock_id '
            . 'WHERE rl.lock_table LIKE ?'
        );
        do {
            try {
                $statement->execute([$rowId, $rowId, $lockTablePattern]);
            } catch (Throwable $exception) {
                throw new RuntimeException(
                    'MariaDB did not provide the InnoDB metadata required to verify exact row-lock waiters',
                    0,
                    $exception
                );
            }
            $waits = $statement->fetch(PDO::FETCH_ASSOC);
            $tableWaiters = (int) ($waits['tableWaiters'] ?? 0);
            $exactRowWaiters = (int) ($waits['exactRowWaiters'] ?? 0);
            if ($exactRowWaiters >= $expectedWaits) {
                $lockingDb->commit();
                return;
            }
            if ($runtimeDbUser !== null && microtime(true) >= $nextStatusPoll) {
                $nextStatusPoll = microtime(true) + 0.1;
                $statusEvidence = awikMariaDbTestStatusExactRowWaiterEvidence(
                    $observerDb,
                    $lockingDb,
                    $operation,
                    $databaseName,
                    $tableName,
                    $rowId,
                    $runtimeDbUser,
                    $expectedWaits,
                    $httpChildStates
                );
                if ($statusEvidence !== []) {
                    $diagnostics = awikMariaDbTestLockWaitDiagnostics($observerDb, $databaseName, $httpChildStates);
                    fwrite(STDOUT, 'Exact-row concurrency evidence from SHOW ENGINE INNODB STATUS: ' . json_encode([
                        'evidence' => $statusEvidence,
                        'observerIdentity' => $diagnostics['observerIdentity'],
                        'observerHasProcessPrivilege' => $diagnostics['observerHasProcessPrivilege'],
                        'rawInnoDbLockWaits' => $diagnostics['rawInnoDbLockWaits'],
                        'rawInnoDbLocks' => $diagnostics['rawInnoDbLocks'],
                    ], JSON_PARTIAL_OUTPUT_ON_ERROR) . PHP_EOL);
                    $lockingDb->commit();
                    return;
                }
            }
            if ($tableWaiters >= $expectedWaits) {
                $diagnostics = awikMariaDbTestLockWaitDiagnostics($observerDb, $databaseName, $httpChildStates);
                throw new RuntimeException(
                    'MariaDB lock metadata could not prove that all competing requests wait on '
                    . $tableName . ' row ' . $rowId
                    . '; observed table waiters=' . $tableWaiters . ', exact row waiters=' . $exactRowWaiters
                    . '; diagnostics=' . json_encode($diagnostics, JSON_PARTIAL_OUTPUT_ON_ERROR)
                );
            }
            usleep(10000);
        } while (microtime(true) < $deadline);

        $diagnostics = awikMariaDbTestLockWaitDiagnostics($observerDb, $databaseName, $httpChildStates);
        throw new RuntimeException(
            'Timed out waiting for competing requests to block on '
            . $tableName . ' row ' . $rowId
            . '; observed table waiters=' . $tableWaiters . ', exact row waiters=' . $exactRowWaiters
            . '; diagnostics=' . json_encode($diagnostics, JSON_PARTIAL_OUTPUT_ON_ERROR)
        );
    } catch (Throwable $exception) {
        if ($lockingDb->inTransaction()) {
            $lockingDb->rollBack();
        }
        if ($exception instanceof PDOException) {
            throw new RuntimeException(
                'MariaDB did not provide the InnoDB metadata required to verify exact row-lock waiters',
                0,
                $exception
            );
        }
        throw $exception;
    }
}

function awikMariaDbTestParallelHttpRequests(array $baseUrls, string $path, string $accessToken, array $bodies, string $barrierDirectory, int $timeoutSeconds = 10, ?callable $afterRelease = null): array
{
    awikMariaDbTestAssert(count($baseUrls) === count($bodies), 'Parallel request server/body count mismatch');
    awikMariaDbTestAssert(is_dir($barrierDirectory), 'Parallel request barrier directory is missing');
    awikMariaDbTestAssert($timeoutSeconds > 0, 'Parallel request timeout must be positive');
    $barrierId = bin2hex(random_bytes(8));
    $releasePath = $barrierDirectory . DIRECTORY_SEPARATOR . 'parallel_release_' . $barrierId;
    $clientCode = <<<'PHP'
$readyPath = $argv[4];
$releasePath = $argv[5];
$barrierDeadline = microtime(true) + (int) $argv[6];
if (file_put_contents($readyPath, 'ready', LOCK_EX) === false) {
    exit(3);
}
while (!is_file($releasePath)) {
    if (microtime(true) >= $barrierDeadline) {
        exit(4);
    }
    usleep(10000);
}
$context = stream_context_create(['http' => [
    'method' => 'POST',
    'header' => "Accept: application/json\r\nContent-Type: application/json\r\nAuthorization: Bearer " . $argv[2],
    'content' => $argv[3],
    'ignore_errors' => true,
    'timeout' => (int) $argv[6],
]]);
$responseBody = @file_get_contents($argv[1], false, $context);
$statusLine = $http_response_header[0] ?? '';
preg_match('/\s(\d{3})\s/', $statusLine, $matches);
try {
    $payload = is_string($responseBody) ? json_decode($responseBody, true, 512, JSON_THROW_ON_ERROR) : null;
} catch (JsonException) {
    $payload = null;
}
echo json_encode(['statusCode' => isset($matches[1]) ? (int) $matches[1] : 0, 'payload' => $payload], JSON_THROW_ON_ERROR);
PHP;
    $clients = [];
    $readyPaths = [];
    $responses = [];
    try {
        foreach ($bodies as $index => $body) {
            $readyPath = $barrierDirectory . DIRECTORY_SEPARATOR . 'parallel_ready_' . $barrierId . '_' . $index;
            $readyPaths[] = $readyPath;
            $process = proc_open([
                PHP_BINARY,
                '-r',
                $clientCode,
                $baseUrls[$index] . $path,
                $accessToken,
                json_encode($body, JSON_THROW_ON_ERROR),
                $readyPath,
                $releasePath,
                (string) ($timeoutSeconds + 5),
            ], [
                0 => ['pipe', 'r'],
                1 => ['pipe', 'w'],
                2 => ['file', 'NUL', 'a'],
            ], $pipes, dirname(__DIR__), null, ['bypass_shell' => true]);
            awikMariaDbTestAssert(is_resource($process), 'Could not start concurrent HTTP request');
            fclose($pipes[0]);
            $clients[] = ['process' => $process, 'stdout' => $pipes[1]];
        }

        $readyDeadline = microtime(true) + $timeoutSeconds;
        do {
            $allReady = count(array_filter($readyPaths, 'is_file')) === count($bodies);
            if ($allReady) {
                break;
            }
            usleep(10000);
        } while (microtime(true) < $readyDeadline);
        awikMariaDbTestAssert($allReady, 'Concurrent HTTP clients did not reach the start barrier before timeout');
        awikMariaDbTestAssert(file_put_contents($releasePath, 'go', LOCK_EX) !== false, 'Could not release concurrent HTTP clients');
        if ($afterRelease !== null) {
            $childStates = [];
            foreach ($clients as $index => $client) {
                $status = proc_get_status($client['process']);
                $childStates[] = [
                    'index' => $index,
                    'pid' => $status['pid'],
                    'running' => $status['running'],
                    'exitCode' => $status['exitcode'],
                ];
            }
            $afterRelease($childStates);
        }

        foreach ($clients as $index => $client) {
            stream_set_timeout($client['stdout'], $timeoutSeconds + 3);
            $responseText = stream_get_contents($client['stdout']);
            $streamStatus = stream_get_meta_data($client['stdout']);
            fclose($client['stdout']);
            $clients[$index]['stdout'] = null;
            awikMariaDbTestAssert(empty($streamStatus['timed_out']), 'Concurrent HTTP request exceeded its response timeout');
            $exitCode = proc_close($client['process']);
            $clients[$index]['process'] = null;
            awikMariaDbTestAssert($exitCode === 0, 'Concurrent HTTP request process failed');
            $response = json_decode((string) $responseText, true, 512, JSON_THROW_ON_ERROR);
            awikMariaDbTestAssert(is_array($response), 'Concurrent HTTP response was not JSON');
            $responses[] = $response;
        }
    } finally {
        foreach ($clients as $client) {
            if (is_resource($client['process'] ?? null)) {
                $processStatus = proc_get_status($client['process']);
                if ($processStatus['running']) {
                    proc_terminate($client['process']);
                }
                if (is_resource($client['stdout'] ?? null)) {
                    fclose($client['stdout']);
                }
                proc_close($client['process']);
            } elseif (is_resource($client['stdout'] ?? null)) {
                fclose($client['stdout']);
            }
        }
        foreach ($readyPaths as $readyPath) {
            if (file_exists($readyPath)) {
                unlink($readyPath);
            }
        }
        if (file_exists($releasePath)) {
            unlink($releasePath);
        }
    }

    return $responses;
}

function awikMariaDbTestCreateProduct(PDO $db, string $categoryId, string $sku, int $stock): string
{
    $productId = awikUuidV4();
    $db->prepare(
        'INSERT INTO awik_products (id, name, sku, categoryId, purchasePrice, sellingPrice, currentStock, minStock, unit, isActive) '
        . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([$productId, 'Integrity test product', $sku, $categoryId, '1.00', '2.00', $stock, 0, 'piece', 1]);
    return $productId;
}

function awikMariaDbTestCreateSale(PDO $db, string $saleNumber, string $userId, array $items): string
{
    $saleId = awikUuidV4();
    $db->prepare(
        'INSERT INTO awik_sales (id, saleNumber, userId, totalAmount, currency, paymentMethod, status) '
        . 'VALUES (?, ?, ?, ?, ?, ?, ?)'
    )->execute([$saleId, $saleNumber, $userId, '2.00', 'USD', 'cash', 'COMPLETED']);
    foreach ($items as $productId => $quantity) {
        $db->prepare(
            'INSERT INTO awik_sale_items (id, saleId, productId, quantity, unitPrice, totalPrice) VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([awikUuidV4(), $saleId, $productId, $quantity, '1.00', (string) $quantity . '.00']);
    }
    return $saleId;
}

$baseDirectory = trim((string) (getenv('AWIK_MARIADB_BASEDIR') ?: ''));
$requestedVersion = trim((string) (getenv('AWIK_MARIADB_TARGET_VERSION') ?: '10.5'));
$binaryDirectory = $baseDirectory . DIRECTORY_SEPARATOR . 'bin';
$installer = $binaryDirectory . DIRECTORY_SEPARATOR . 'mariadb-install-db.exe';
$serverBinary = $binaryDirectory . DIRECTORY_SEPARATOR . 'mariadbd.exe';
$schemaPath = __DIR__ . '/../private/schema/auth-slice.sql';
$testRoot = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'awik_mariadb_compat_' . bin2hex(random_bytes(12));
$dataDirectory = $testRoot . DIRECTORY_SEPARATOR . 'data';
$server = null;
$httpServers = [];
$exitCode = 0;

try {
    awikMariaDbTestAssert(PHP_OS_FAMILY === 'Windows', 'This local MariaDB runner currently supports Windows only');
    awikMariaDbTestAssert($baseDirectory !== '', 'Set AWIK_MARIADB_BASEDIR to the verified isolated MariaDB installation root; there is no default server path');
    awikMariaDbTestAssert(preg_match('/^\d+\.\d+$/', $requestedVersion) === 1, 'Requested MariaDB target must be a major.minor version');
    awikMariaDbTestAssert(is_file($installer) && is_file($serverBinary), 'MariaDB ' . $requestedVersion . ' installer/server binaries are unavailable');
    awikMariaDbTestAssert(is_file($schemaPath), 'Auth slice schema is missing');
    awikMariaDbTestAssert(!file_exists($testRoot), 'Generated disposable datadir already exists; refusing to continue');
    awikMariaDbTestAssert(mkdir($testRoot, 0700), 'Could not create the unique temporary test root');

    $portSocket = stream_socket_server('tcp://127.0.0.1:0', $socketError, $socketMessage);
    awikMariaDbTestAssert(is_resource($portSocket), 'Could not reserve a local MariaDB test port: ' . $socketMessage);
    $portAddress = stream_socket_get_name($portSocket, false);
    fclose($portSocket);
    $port = (int) substr((string) strrchr((string) $portAddress, ':'), 1);
    awikMariaDbTestAssert($port > 0, 'Could not determine the isolated MariaDB port');

    $rootPassword = bin2hex(random_bytes(24));
    $installerProcess = proc_open([
        $installer,
        '--datadir=' . $dataDirectory,
        '--password=' . $rootPassword,
        '--port=' . $port,
        '--silent',
    ], [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ], $installerPipes, $binaryDirectory, null, ['bypass_shell' => true]);
    awikMariaDbTestAssert(is_resource($installerProcess), 'Could not run the MariaDB installer');
    fclose($installerPipes[0]);
    $installerOutput = stream_get_contents($installerPipes[1]) . stream_get_contents($installerPipes[2]);
    fclose($installerPipes[1]);
    fclose($installerPipes[2]);
    $installerExitCode = proc_close($installerProcess);
    awikMariaDbTestAssert($installerExitCode === 0, 'MariaDB temp datadir initialization failed: ' . trim($installerOutput));
    awikMariaDbTestAssert(is_dir($dataDirectory), 'MariaDB installer did not create the requested temp datadir');

    $server = proc_open([
        $serverBinary,
        '--no-defaults',
        '--basedir=' . $baseDirectory,
        '--datadir=' . $dataDirectory,
        '--port=' . $port,
        '--bind-address=127.0.0.1',
        '--console',
    ], [
        0 => ['pipe', 'r'],
        1 => ['file', $testRoot . DIRECTORY_SEPARATOR . 'server.stdout.log', 'a'],
        2 => ['file', $testRoot . DIRECTORY_SEPARATOR . 'server.stderr.log', 'a'],
    ], $serverPipes, $binaryDirectory, null, ['bypass_shell' => true]);
    awikMariaDbTestAssert(is_resource($server), 'Could not start isolated MariaDB');
    fclose($serverPipes[0]);

    $adminDsn = 'mysql:host=127.0.0.1;port=' . $port . ';charset=utf8mb4';
    $adminDb = null;
    $startupError = null;
    for ($attempt = 0; $attempt < 100; $attempt++) {
        try {
            $adminDb = new PDO($adminDsn, 'root', $rootPassword, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            break;
        } catch (PDOException $exception) {
            $startupError = $exception->getMessage();
            $status = proc_get_status($server);
            if (!$status['running']) {
                break;
            }
            usleep(100000);
        }
    }
    awikMariaDbTestAssert($adminDb instanceof PDO, 'Isolated MariaDB did not become available: ' . (string) $startupError);

    try {
        $serverVersion = $adminDb->query('SELECT VERSION()')->fetchColumn();
    } catch (Throwable) {
        echo 'MariaDB server version could not be established (requested ' . $requestedVersion . ')' . PHP_EOL;
        throw new RuntimeException('Could not establish MariaDB server version');
    }
    if (!is_string($serverVersion) || $serverVersion === '') {
        echo 'MariaDB server version could not be established (requested ' . $requestedVersion . ')' . PHP_EOL;
        throw new RuntimeException('Could not establish MariaDB server version');
    }
    echo 'Disposable MariaDB server version: ' . $serverVersion . ' (requested major.minor ' . $requestedVersion . ')' . PHP_EOL;
    $versionPattern = '/^' . preg_quote($requestedVersion, '/') . '\.\d+(?:[-+]|$)/i';
    awikMariaDbTestAssert(
        stripos($serverVersion, 'mariadb') !== false && preg_match($versionPattern, $serverVersion) === 1,
        'MariaDB version mismatch: requested ' . $requestedVersion . ', detected ' . $serverVersion
    );
    $observerIdentity = $adminDb->query('SELECT USER() AS connectionUser, CURRENT_USER() AS privilegeAccount')->fetch(PDO::FETCH_ASSOC);
    $observerGrantLines = $adminDb->query('SHOW GRANTS')->fetchAll(PDO::FETCH_COLUMN);
    $observerHasProcessPrivilege = false;
    foreach ($observerGrantLines as $grantLine) {
        if (preg_match('/\b(?:ALL PRIVILEGES|PROCESS)\b/i', (string) $grantLine) === 1) {
            $observerHasProcessPrivilege = true;
            break;
        }
    }
    awikMariaDbTestAssert(
        $observerHasProcessPrivilege,
        'Isolated MariaDB lock observer must have PROCESS privilege; this privilege is test-only'
    );
    echo 'Isolated lock observer: ' . $observerIdentity['connectionUser'] . ' / ' . $observerIdentity['privilegeAccount']
        . ' (PROCESS verified; disposable test server only)' . PHP_EOL;

    $databaseName = 'awik_mariadb_compat_' . bin2hex(random_bytes(8));
    $adminDb->exec('CREATE DATABASE `' . $databaseName . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $dsn = 'mysql:host=127.0.0.1;port=' . $port . ';dbname=' . $databaseName . ';charset=utf8mb4';
    $appDb = new PDO($dsn, 'root', $rootPassword, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    $schema = file_get_contents($schemaPath);
    awikMariaDbTestAssert(is_string($schema), 'Could not read auth slice schema');
    foreach (preg_split('/;\s*(?:\r?\n|$)/', $schema) ?: [] as $statement) {
        if (trim($statement) !== '') {
            $appDb->exec($statement);
        }
    }

    $migrationPath = __DIR__ . '/../database/migrations/2026_10_12_login_attempts.sql';
    $beforeMigrationTables = awikMariaDbTestTableNames($appDb);
    $migration = file_get_contents($migrationPath);
    awikMariaDbTestAssert(is_string($migration), 'Could not read login-attempt migration');
    $appDb->exec($migration);
    $appDb->exec($migration);
    $afterMigrationTables = awikMariaDbTestTableNames($appDb);
    $expectedTables = $beforeMigrationTables;
    $expectedTables[] = 'awik_login_attempts';
    sort($expectedTables);
    awikMariaDbTestAssert($afterMigrationTables === $expectedTables, 'Login-attempt migration changed tables other than awik_login_attempts or was not repeatable');

    $applicationMigrationPath = __DIR__ . '/../database/migrations/2026_10_13_full_application.sql';
    $applicationMigration = file_get_contents($applicationMigrationPath);
    awikMariaDbTestAssert(is_string($applicationMigration), 'Full application test schema is missing');
    foreach (preg_split('/;\s*(?:\r?\n|$)/', $applicationMigration) ?: [] as $statement) {
        if (trim($statement) !== '') {
            $appDb->exec($statement);
        }
    }
    $expectedApplicationTables = [
        'awik_audit_logs',
        'awik_company_settings',
        'awik_customers',
        'awik_inventory_categories',
        'awik_login_attempts',
        'awik_plans',
        'awik_products',
        'awik_sale_items',
        'awik_sales',
        'awik_stock_movements',
        'awik_subscription_renewals',
        'awik_subscriptions',
        'awik_user_tokens',
        'awik_users',
        'awik_whatsapp_messages',
        'awik_whatsapp_reminders',
    ];
    sort($expectedApplicationTables);
    awikMariaDbTestAssert(
        awikMariaDbTestTableNames($appDb) === $expectedApplicationTables,
        'Ordered clean-install chain did not create exactly the expected 16 application tables'
    );
    $appDb->beginTransaction();
    try {
        $constraintCategoryId = '00000000-0000-4000-8000-000000009101';
        $constraintProductId = '00000000-0000-4000-8000-000000009102';
        $constraintSaleId = '00000000-0000-4000-8000-000000009103';
        $appDb->prepare('INSERT INTO awik_inventory_categories (id, name) VALUES (?, ?)')->execute([$constraintCategoryId, 'Constraint check ' . bin2hex(random_bytes(4))]);
        $negativeStockRejected = false;
        try {
            $appDb->prepare(
                'INSERT INTO awik_products (id, name, sku, categoryId, purchasePrice, sellingPrice, currentStock) VALUES (?, ?, ?, ?, ?, ?, ?)'
            )->execute([$constraintProductId, 'Invalid stock product', 'CHECK-' . strtoupper(bin2hex(random_bytes(4))), $constraintCategoryId, '1.00', '2.00', -1]);
        } catch (PDOException) {
            $negativeStockRejected = true;
        }
        awikMariaDbTestAssert($negativeStockRejected, 'MariaDB 10.5 did not enforce the nonnegative product-stock CHECK');

        $appDb->prepare(
            'INSERT INTO awik_products (id, name, sku, categoryId, purchasePrice, sellingPrice, currentStock) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$constraintProductId, 'Constraint check product', 'CHECK-' . strtoupper(bin2hex(random_bytes(4))), $constraintCategoryId, '1.00', '2.00', 1]);
        $appDb->prepare(
            'INSERT INTO awik_sales (id, saleNumber, totalAmount, paymentMethod) VALUES (?, ?, ?, ?)'
        )->execute([$constraintSaleId, 'CHECK-' . strtoupper(bin2hex(random_bytes(4))), '1.00', 'cash']);
        $nonpositiveQuantityRejected = false;
        try {
            $appDb->prepare(
                'INSERT INTO awik_sale_items (id, saleId, productId, quantity, unitPrice, totalPrice) VALUES (?, ?, ?, ?, ?, ?)'
            )->execute(['00000000-0000-4000-8000-000000009104', $constraintSaleId, $constraintProductId, 0, '1.00', '0.00']);
        } catch (PDOException) {
            $nonpositiveQuantityRejected = true;
        }
        awikMariaDbTestAssert($nonpositiveQuantityRejected, 'MariaDB 10.5 did not enforce the positive sale-item quantity CHECK');
    } finally {
        $appDb->rollBack();
    }
    echo "MariaDB 10.5 product-stock and sale-quantity CHECK constraints passed\n";

    $loginAttemptColumns = $appDb->prepare(
        'SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH, DATETIME_PRECISION, EXTRA '
        . 'FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?'
    );
    $loginAttemptColumns->execute([$databaseName, 'awik_login_attempts']);
    $attemptColumns = [];
    foreach ($loginAttemptColumns->fetchAll() as $column) {
        $attemptColumns[$column['COLUMN_NAME']] = $column;
    }
    foreach (['scopeType', 'scopeKey', 'failedCount', 'windowStartedAt', 'lastFailedAt', 'lockedUntil', 'createdAt', 'updatedAt'] as $columnName) {
        awikMariaDbTestAssert(isset($attemptColumns[$columnName]), 'Login-attempt migration is missing column ' . $columnName);
    }
    awikMariaDbTestAssert((int) $attemptColumns['scopeType']['CHARACTER_MAXIMUM_LENGTH'] === 16, 'scopeType length mismatch');
    awikMariaDbTestAssert((int) $attemptColumns['scopeKey']['CHARACTER_MAXIMUM_LENGTH'] === 255, 'scopeKey length mismatch');
    awikMariaDbTestAssert((int) $attemptColumns['windowStartedAt']['DATETIME_PRECISION'] === 3, 'windowStartedAt precision mismatch');
    awikMariaDbTestAssert(stripos((string) $attemptColumns['updatedAt']['EXTRA'], 'on update CURRENT_TIMESTAMP(3)') !== false, 'updatedAt migration behavior mismatch');
    $attemptIndexes = $appDb->query('SHOW INDEX FROM awik_login_attempts')->fetchAll();
    $attemptIndexNames = array_values(array_unique(array_column($attemptIndexes, 'Key_name')));
    sort($attemptIndexNames);
    $expectedIndexNames = ['PRIMARY', 'idx_awik_login_attempts_last_failed_at', 'idx_awik_login_attempts_locked_until'];
    sort($expectedIndexNames);
    awikMariaDbTestAssert($attemptIndexNames === $expectedIndexNames, 'Login-attempt migration indexes mismatch');

    $columnsQuery = $appDb->prepare(
        'SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH, COLUMN_TYPE, DATETIME_PRECISION '
        . 'FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?'
    );
    $columnsQuery->execute([$databaseName, 'awik_users']);
    $columns = [];
    foreach ($columnsQuery->fetchAll() as $column) {
        $columns[$column['COLUMN_NAME']] = $column;
    }
    foreach (['id', 'email', 'phone', 'firstName', 'lastName', 'passwordHash', 'role', 'status', 'lastLoginAt', 'createdAt', 'updatedAt', 'deletedAt'] as $columnName) {
        awikMariaDbTestAssert(isset($columns[$columnName]), 'MariaDB schema is missing awik_users.' . $columnName);
    }
    awikMariaDbTestAssert($columns['email']['IS_NULLABLE'] === 'YES', 'email should be nullable');
    awikMariaDbTestAssert(str_starts_with($columns['role']['COLUMN_TYPE'], 'enum('), 'role should be a MariaDB enum');
    awikMariaDbTestAssert(str_starts_with($columns['status']['COLUMN_TYPE'], 'enum('), 'status should be a MariaDB enum');
    foreach (['lastLoginAt', 'createdAt', 'updatedAt', 'deletedAt'] as $timestampColumn) {
        awikMariaDbTestAssert((int) $columns[$timestampColumn]['DATETIME_PRECISION'] === 3, $timestampColumn . ' should retain Prisma millisecond precision');
    }

    $testPassword = bin2hex(random_bytes(16));
    $adminPassword = bin2hex(random_bytes(24));
    putenv('AWIK_MIGRATION_DSN=' . $dsn);
    putenv('AWIK_MIGRATION_DB_USER=root');
    putenv('AWIK_MIGRATION_DB_PASSWORD=' . $rootPassword);
    putenv('AWIK_MIGRATION_JWT_SECRET=' . bin2hex(random_bytes(32)));
    putenv('AWIK_MIGRATION_JWT_REFRESH_SECRET=' . bin2hex(random_bytes(32)));
    require_once __DIR__ . '/../private/bootstrap.php';
    require_once __DIR__ . '/../private/admin-provisioner.php';

    $adminId = awikProvisionInitialAdmin($appDb, [
        'email' => 'maria-admin@example.invalid',
        'phone' => '+15550000302',
        'firstName' => 'Maria',
        'lastName' => 'Admin',
        'password' => $adminPassword,
    ]);
    $provisionedAdmin = $appDb->prepare('SELECT role, status, passwordHash FROM awik_users WHERE id = ?');
    $provisionedAdmin->execute([$adminId]);
    $provisionedAdminRow = $provisionedAdmin->fetch();
    awikMariaDbTestAssert(
        is_array($provisionedAdminRow)
            && $provisionedAdminRow['role'] === 'ADMIN'
            && $provisionedAdminRow['status'] === 'ACTIVE'
            && password_verify($adminPassword, $provisionedAdminRow['passwordHash']),
        'Initial administrator was not created with fixed role/status and a valid password hash'
    );
    $adminCountBeforeRepeat = (int) $appDb->query('SELECT COUNT(*) FROM awik_users')->fetchColumn();
    $repeatProvisioningRejected = false;
    try {
        awikProvisionInitialAdmin($appDb, [
            'email' => 'second-admin@example.invalid',
            'phone' => '+15550000303',
            'firstName' => 'Second',
            'lastName' => 'Admin',
            'password' => $adminPassword,
        ]);
    } catch (RuntimeException) {
        $repeatProvisioningRejected = true;
    }
    awikMariaDbTestAssert($repeatProvisioningRejected, 'Initial administrator provisioning succeeded a second time');
    awikMariaDbTestAssert(
        (int) $appDb->query('SELECT COUNT(*) FROM awik_users')->fetchColumn() === $adminCountBeforeRepeat,
        'Rejected repeat provisioning changed the users table'
    );
    echo "MariaDB initial ADMIN provisioning and repeat-refusal assertions passed\n";

    $userId = '00000000-0000-4000-8000-000000000301';
    $appDb->prepare('INSERT INTO awik_users (id, email, phone, firstName, lastName, passwordHash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$userId, 'maria-test@example.invalid', '+15550000301', 'Maria', 'Test', password_hash($testPassword, PASSWORD_BCRYPT), 'STAFF', 'ACTIVE']);

    $plusPhoneIdentifier = awikResolveLoginIdentifier('+15550000301');
    $zeroPrefixedPhoneIdentifier = awikResolveLoginIdentifier('0015550000301');
    awikMariaDbTestAssert($plusPhoneIdentifier['key'] === $zeroPrefixedPhoneIdentifier['key'], '00-prefixed phone did not normalize to the + international lockout key');
    $emailScopeKey = awikLoginIdentifierScopeKey(awikResolveLoginIdentifier('Maria-Test@example.invalid'), 'Maria-Test@example.invalid');
    awikMariaDbTestAssert($emailScopeKey === 'account:' . hash('sha256', 'email:maria-test@example.invalid'), 'Email scope key was not canonicalized and hashed');
    awikMariaDbTestAssert(!str_contains($emailScopeKey, 'maria-test@example.invalid'), 'Account tracker scope key exposes the email identifier');

    $login = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/auth/login',
        'headers' => [],
        'body' => ['identifier' => 'MARIA-TEST@example.invalid', 'password' => $testPassword],
    ]);
    awikMariaDbTestAssert($login['statusCode'] === 200, 'MariaDB auth login query failed: ' . json_encode($login['payload']));
    $tokens = $login['payload']['data'];

    $profile = awikHandleRequest([
        'method' => 'GET',
        'uri' => '/api/v1/auth/profile',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => [],
    ]);
    awikMariaDbTestAssert($profile['statusCode'] === 200, 'MariaDB protected profile query failed: ' . json_encode($profile['payload']));
    awikMariaDbTestAssert(str_ends_with((string) $profile['payload']['data']['lastLoginAt'], 'Z'), 'MariaDB user timestamps should be returned in UTC');

    $refresh = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/auth/refresh',
        'headers' => [],
        'body' => ['refreshToken' => $tokens['refreshToken']],
    ]);
    awikMariaDbTestAssert($refresh['statusCode'] === 200, 'MariaDB refresh transaction/query failed: ' . json_encode($refresh['payload']));

    $adminLogin = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/auth/login',
        'headers' => [],
        'body' => ['identifier' => 'maria-admin@example.invalid', 'password' => $adminPassword],
    ]);
    awikMariaDbTestAssert($adminLogin['statusCode'] === 200, 'MariaDB synthetic admin login failed');
    $adminHeaders = ['Authorization' => 'Bearer ' . $adminLogin['payload']['data']['accessToken']];

    $anonymousUsers = awikHandleRequest([
        'method' => 'GET',
        'uri' => '/api/v1/users',
        'headers' => [],
        'body' => [],
    ]);
    awikMariaDbTestAssert($anonymousUsers['statusCode'] === 401, 'Anonymous user administration request should be rejected');
    $staffUsers = awikHandleRequest([
        'method' => 'GET',
        'uri' => '/api/v1/users',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => [],
    ]);
    awikMariaDbTestAssert($staffUsers['statusCode'] === 403, 'STAFF user administration request should be forbidden');

    $customerCreate = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/customers',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => [
            'phone' => '+15550000311',
            'email' => 'customer-contract@example.invalid',
            'firstName' => 'Contract',
            'lastName' => 'Customer',
            'city' => 'Test City',
        ],
    ]);
    awikMariaDbTestAssert($customerCreate['statusCode'] === 201, 'MariaDB customer creation failed: ' . json_encode($customerCreate['payload']));
    $customerId = $customerCreate['payload']['data']['id'];
    $customerList = awikHandleRequest([
        'method' => 'GET',
        'uri' => '/api/v1/customers?search=Contract&page=1&limit=10',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => [],
    ]);
    awikMariaDbTestAssert(
        $customerList['statusCode'] === 200
            && $customerList['payload']['data']['total'] === 1
            && $customerList['payload']['data']['data'][0]['id'] === $customerId,
        'MariaDB customer search/list did not return the created customer'
    );
    $customerDetail = awikHandleRequest([
        'method' => 'GET',
        'uri' => '/api/v1/customers/' . $customerId,
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => [],
    ]);
    awikMariaDbTestAssert($customerDetail['statusCode'] === 200, 'MariaDB customer detail failed');
    $customerUpdate = awikHandleRequest([
        'method' => 'PATCH',
        'uri' => '/api/v1/customers/' . $customerId,
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => ['city' => 'Updated City'],
    ]);
    awikMariaDbTestAssert(
        $customerUpdate['statusCode'] === 200 && $customerUpdate['payload']['data']['city'] === 'Updated City',
        'MariaDB customer update failed'
    );
    echo "MariaDB customer CRUD/search and ADMIN/STAFF permission assertions passed\n";

    $staffCreate = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/plans',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => ['name' => 'Forbidden plan', 'speed' => '1 Mbps', 'durationDays' => 1, 'price' => 1],
    ]);
    awikMariaDbTestAssert($staffCreate['statusCode'] === 403, 'MariaDB plan create should forbid STAFF');

    $planCreate = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/plans',
        'headers' => $adminHeaders,
        'body' => [
            'name' => 'Maria Fiber ' . bin2hex(random_bytes(3)),
            'description' => 'Disposable MariaDB plan fixture',
            'speed' => '100 Mbps',
            'durationDays' => 30,
            'price' => 20.5,
        ],
    ]);
    awikMariaDbTestAssert($planCreate['statusCode'] === 201, 'MariaDB plan create failed: ' . json_encode($planCreate['payload']));
    $createdPlan = $planCreate['payload']['data'];
    awikMariaDbTestAssert($createdPlan['currency'] === 'USD' && $createdPlan['isActive'] === true, 'MariaDB plan defaults mismatch');
    $planId = $createdPlan['id'];

    $subscriptionCreate = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/subscriptions',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => [
            'customerId' => $customerId,
            'planId' => $planId,
            'startDate' => '2099-01-01T00:00:00Z',
            'durationDays' => 30,
        ],
    ]);
    awikMariaDbTestAssert(
        $subscriptionCreate['statusCode'] === 201
            && $subscriptionCreate['payload']['data']['status'] === 'ACTIVE',
        'MariaDB subscription creation failed: ' . json_encode($subscriptionCreate['payload'])
    );
    $subscriptionId = $subscriptionCreate['payload']['data']['id'];
    $subscriptionBeforeRenewal = $subscriptionCreate['payload']['data']['expiryDate'];
    $subscriptionRenew = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/subscriptions/' . $subscriptionId . '/renew',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => ['durationDays' => 45],
    ]);
    awikMariaDbTestAssert($subscriptionRenew['statusCode'] === 200, 'MariaDB subscription renewal failed: ' . json_encode($subscriptionRenew['payload']));
    awikMariaDbTestAssert($subscriptionRenew['payload']['data']['expiryDate'] > $subscriptionBeforeRenewal, 'Renewal did not extend subscription expiry');
    $renewalCount = $appDb->prepare('SELECT COUNT(*) FROM awik_subscription_renewals WHERE subscriptionId = ?');
    $renewalCount->execute([$subscriptionId]);
    awikMariaDbTestAssert((int) $renewalCount->fetchColumn() === 1, 'Renewal history row was not recorded exactly once');
    $subscriptionSuspend = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/subscriptions/' . $subscriptionId . '/suspend',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => [],
    ]);
    awikMariaDbTestAssert($subscriptionSuspend['statusCode'] === 200 && $subscriptionSuspend['payload']['data']['status'] === 'SUSPENDED', 'MariaDB subscription suspension failed');
    $subscriptionActivate = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/subscriptions/' . $subscriptionId . '/activate',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => [],
    ]);
    awikMariaDbTestAssert($subscriptionActivate['statusCode'] === 200 && $subscriptionActivate['payload']['data']['status'] === 'ACTIVE', 'MariaDB subscription reactivation failed');
    $subscriptionCancel = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/subscriptions/' . $subscriptionId . '/cancel',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => [],
    ]);
    awikMariaDbTestAssert($subscriptionCancel['statusCode'] === 200, 'MariaDB subscription cancellation failed');
    $cancelledSubscription = awikHandleRequest([
        'method' => 'GET',
        'uri' => '/api/v1/subscriptions/' . $subscriptionId,
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => [],
    ]);
    awikMariaDbTestAssert($cancelledSubscription['statusCode'] === 404, 'Cancelled subscription remained visible');
    echo "MariaDB subscription create/renew/status/cancel workflow assertions passed\n";

    $staffCategory = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/inventory/categories',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => ['name' => 'Forbidden category'],
    ]);
    awikMariaDbTestAssert($staffCategory['statusCode'] === 403, 'STAFF inventory category creation should be forbidden');
    $categoryCreate = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/inventory/categories',
        'headers' => $adminHeaders,
        'body' => ['name' => 'MariaDB contract ' . bin2hex(random_bytes(3)), 'description' => 'Disposable workflow test'],
    ]);
    awikMariaDbTestAssert($categoryCreate['statusCode'] === 201, 'MariaDB inventory category creation failed');
    $workflowCategoryId = $categoryCreate['payload']['data']['id'];
    $productCreate = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/products',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => [
            'name' => 'MariaDB workflow product',
            'sku' => 'WF-' . strtoupper(bin2hex(random_bytes(4))),
            'categoryId' => $workflowCategoryId,
            'purchasePrice' => 2,
            'sellingPrice' => 5,
            'initialStock' => 10,
            'minStock' => 1,
        ],
    ]);
    awikMariaDbTestAssert($productCreate['statusCode'] === 201, 'MariaDB inventory product creation failed: ' . json_encode($productCreate['payload']));
    $workflowProductId = $productCreate['payload']['data']['id'];
    $initialMovementCount = $appDb->prepare('SELECT COUNT(*) FROM awik_stock_movements WHERE productId = ?');
    $initialMovementCount->execute([$workflowProductId]);
    awikMariaDbTestAssert((int) $initialMovementCount->fetchColumn() === 1, 'Initial stock movement was not recorded transactionally');
    $stockPurchase = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/products/' . $workflowProductId . '/movements',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => ['movementType' => 'PURCHASE', 'quantity' => 2, 'reference' => 'workflow-purchase'],
    ]);
    awikMariaDbTestAssert(
        $stockPurchase['statusCode'] === 201 && $stockPurchase['payload']['data']['newStock'] === 12,
        'MariaDB inventory purchase movement failed'
    );
    $workflowSale = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/sales',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => [
            'items' => [['productId' => $workflowProductId, 'quantity' => 2]],
            'customerId' => $customerId,
            'paymentMethod' => 'cash',
        ],
    ]);
    awikMariaDbTestAssert($workflowSale['statusCode'] === 201, 'MariaDB sales creation failed: ' . json_encode($workflowSale['payload']));
    $workflowSaleId = $workflowSale['payload']['data']['sale']['id'];
    $workflowStock = $appDb->prepare('SELECT currentStock FROM awik_products WHERE id = ?');
    $workflowStock->execute([$workflowProductId]);
    awikMariaDbTestAssert((int) $workflowStock->fetchColumn() === 10, 'Sale did not decrement inventory');
    $workflowRefund = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/sales/' . $workflowSaleId . '/refund',
        'headers' => $adminHeaders,
        'body' => ['reason' => 'workflow refund'],
    ]);
    awikMariaDbTestAssert($workflowRefund['statusCode'] === 200 && $workflowRefund['payload']['data']['status'] === 'REFUNDED', 'MariaDB sale refund failed');
    $workflowStock->execute([$workflowProductId]);
    awikMariaDbTestAssert((int) $workflowStock->fetchColumn() === 12, 'Refund did not restore inventory');
    $workflowCancelSale = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/sales',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => [
            'items' => [['productId' => $workflowProductId, 'quantity' => 1]],
            'customerId' => $customerId,
            'paymentMethod' => 'cash',
        ],
    ]);
    awikMariaDbTestAssert($workflowCancelSale['statusCode'] === 201, 'Second MariaDB sale creation failed');
    $workflowCancelSaleId = $workflowCancelSale['payload']['data']['sale']['id'];
    $workflowCancel = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/sales/' . $workflowCancelSaleId . '/cancel',
        'headers' => $adminHeaders,
        'body' => ['reason' => 'workflow cancellation'],
    ]);
    awikMariaDbTestAssert($workflowCancel['statusCode'] === 200 && $workflowCancel['payload']['data']['status'] === 'CANCELLED', 'MariaDB sale cancellation failed');
    $workflowStock->execute([$workflowProductId]);
    awikMariaDbTestAssert((int) $workflowStock->fetchColumn() === 12, 'Cancellation did not restore inventory');
    echo "MariaDB inventory, sales, refunds and cancellations workflow assertions passed\n";

    $duplicatePlan = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/plans',
        'headers' => $adminHeaders,
        'body' => [
            'name' => $createdPlan['name'],
            'speed' => '100 Mbps',
            'durationDays' => 30,
            'price' => 20.5,
        ],
    ]);
    awikMariaDbTestAssert($duplicatePlan['statusCode'] === 409, 'MariaDB duplicate plan conflict was not detected');
    $invalidPlan = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/plans',
        'headers' => $adminHeaders,
        'body' => ['name' => 'Invalid plan', 'speed' => '10 Mbps', 'durationDays' => 0, 'price' => -1],
    ]);
    awikMariaDbTestAssert($invalidPlan['statusCode'] === 400, 'MariaDB plan validation failed');
    $fractionalPlan = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/plans',
        'headers' => $adminHeaders,
        'body' => ['name' => 'Fractional plan', 'speed' => '10 Mbps', 'durationDays' => 1.5, 'price' => 1],
    ]);
    awikMariaDbTestAssert($fractionalPlan['statusCode'] === 500, 'MariaDB fractional duration should fail consistently with the Prisma integer field');

    $planList = awikHandleRequest([
        'method' => 'GET',
        'uri' => '/api/v1/plans?search=' . rawurlencode($createdPlan['name']) . '&page=1&limit=10&sortBy=price&sortOrder=asc',
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => [],
    ]);
    awikMariaDbTestAssert($planList['statusCode'] === 200 && $planList['payload']['data']['total'] === 1, 'MariaDB plan search/pagination failed');

    $planUpdate = awikHandleRequest([
        'method' => 'PATCH',
        'uri' => '/api/v1/plans/' . $planId,
        'headers' => $adminHeaders,
        'body' => ['price' => 22.75, 'isActive' => false],
    ]);
    awikMariaDbTestAssert($planUpdate['statusCode'] === 200, 'MariaDB plan update failed: ' . json_encode($planUpdate['payload']));
    awikMariaDbTestAssert($planUpdate['payload']['data']['price'] === '22.75' && $planUpdate['payload']['data']['isActive'] === false, 'MariaDB plan update projection mismatch');

    $auditCount = (int) $appDb->query("SELECT COUNT(*) FROM awik_audit_logs WHERE entity = 'Plan'")->fetchColumn();
    awikMariaDbTestAssert($auditCount === 2, 'MariaDB plan create/update audit entries missing');
    $requestAuditCount = (int) $appDb->query("SELECT COUNT(*) FROM awik_audit_logs WHERE entity = 'Plans'")->fetchColumn();
    awikMariaDbTestAssert($requestAuditCount === 2, 'MariaDB global plan request audit entries missing');
    $appDb->exec('DROP TABLE awik_audit_logs');
    $auditFailure = awikHandleRequest([
        'method' => 'PATCH',
        'uri' => '/api/v1/plans/' . $planId,
        'headers' => $adminHeaders,
        'body' => ['description' => 'Audit table unavailable'],
    ]);
    awikMariaDbTestAssert($auditFailure['statusCode'] === 200, 'MariaDB audit failure should not fail plan updates');

    $planDelete = awikHandleRequest([
        'method' => 'DELETE',
        'uri' => '/api/v1/plans/' . $planId,
        'headers' => $adminHeaders,
        'body' => [],
    ]);
    awikMariaDbTestAssert($planDelete['statusCode'] === 200, 'MariaDB plan soft delete failed');
    $deletedPlan = awikHandleRequest([
        'method' => 'GET',
        'uri' => '/api/v1/plans/' . $planId,
        'headers' => ['Authorization' => 'Bearer ' . $tokens['accessToken']],
        'body' => [],
    ]);
    awikMariaDbTestAssert($deletedPlan['statusCode'] === 404, 'MariaDB soft-deleted plan should be hidden');

    $appDb->exec('RENAME TABLE awik_plans TO awik_plans_temporarily_unavailable');
    $planDatabaseFailure = awikHandleRequest([
        'method' => 'GET',
        'uri' => '/api/v1/plans',
        'headers' => $adminHeaders,
        'body' => [],
    ]);
    awikMariaDbTestAssert($planDatabaseFailure['statusCode'] === 500, 'MariaDB plan database failure should return 500');
    $appDb->exec('RENAME TABLE awik_plans_temporarily_unavailable TO awik_plans');

    $runtimeDb = awikDatabase();
    $sessionTimeZone = $runtimeDb->query('SELECT @@session.time_zone')->fetchColumn();
    awikMariaDbTestAssert($sessionTimeZone === '+00:00', 'PDO MariaDB session timezone should be UTC');
    $serverTime = $adminDb->query('SELECT @@system_time_zone AS systemTimeZone, @@time_zone AS sessionTimeZone')->fetch();
    echo 'MariaDB DDL and PDO auth/plan checks passed (server ' . $serverTime['systemTimeZone'] . ', app session ' . $sessionTimeZone . ')' . PHP_EOL;

    $prototypeRoot = dirname(__DIR__);
    $publicIndex = $prototypeRoot . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'index.php';
    $runtimeDbUser = 'awikapp_' . bin2hex(random_bytes(5));
    $runtimeDbPassword = bin2hex(random_bytes(20));
    $runtimeAccount = $adminDb->quote($runtimeDbUser) . "@'127.0.0.1'";
    $adminDb->exec('CREATE USER ' . $runtimeAccount . ' IDENTIFIED BY ' . $adminDb->quote($runtimeDbPassword));
    $adminDb->exec('GRANT SELECT, INSERT, UPDATE, DELETE ON `' . $databaseName . '`.* TO ' . $runtimeAccount);
    putenv('AWIK_MIGRATION_DB_USER=' . $runtimeDbUser);
    putenv('AWIK_MIGRATION_DB_PASSWORD=' . $runtimeDbPassword);

    $httpTestProcess = proc_open([PHP_BINARY, __DIR__ . DIRECTORY_SEPARATOR . 'HttpEntrypointTest.php'], [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ], $httpTestPipes, $prototypeRoot, null, ['bypass_shell' => true]);
    awikMariaDbTestAssert(is_resource($httpTestProcess), 'Could not run the existing HTTP entrypoint test');
    $httpTestChildIndex = count($httpServers);
    $httpServers[] = ['process' => $httpTestProcess, 'pipes' => $httpTestPipes];
    $httpTestResult = awikMariaDbTestCollectChildProcess($httpServers[$httpTestChildIndex]);
    awikMariaDbTestAssert(
        $httpTestResult['exitCode'] === 0 && str_contains($httpTestResult['stdout'], 'AWIK PHP HTTP entrypoint tests passed'),
        'Existing MariaDB-backed HTTP entrypoint tests failed: ' . trim($httpTestResult['stderr'])
    );
    echo trim($httpTestResult['stdout']) . PHP_EOL;

    $httpServer = awikMariaDbTestStartHttpServer($prototypeRoot, $publicIndex);
    $httpServers[] = $httpServer;
    $httpBaseUrl = $httpServer['baseUrl'];

    $integrityCategoryId = awikUuidV4();
    $appDb->prepare('INSERT INTO awik_inventory_categories (id, name, description) VALUES (?, ?, ?)')
        ->execute([$integrityCategoryId, 'Integrity test ' . bin2hex(random_bytes(4)), 'Disposable integrity-test category']);

    $parallelServers = [];
    $parallelBaseUrls = [];
    for ($index = 0; $index < 2; $index++) {
        $parallelServers[] = awikMariaDbTestStartHttpServer($prototypeRoot, $publicIndex);
        $httpServers[] = $parallelServers[$index];
        $parallelBaseUrls[] = $parallelServers[$index]['baseUrl'];
    }

    $refundProductId = awikMariaDbTestCreateProduct($appDb, $integrityCategoryId, 'INT-REFUND-' . bin2hex(random_bytes(4)), 8);
    $refundSaleId = awikMariaDbTestCreateSale($appDb, 'INT-REFUND-' . bin2hex(random_bytes(4)), $adminId, [$refundProductId => 2]);
    $refundSaleQuery = $appDb->prepare('SELECT saleNumber FROM awik_sales WHERE id = ?');
    $refundSaleQuery->execute([$refundSaleId]);
    $refundSaleNumber = (string) $refundSaleQuery->fetchColumn();
    $appDb->beginTransaction();
    try {
        $heldRefundSale = $appDb->prepare('SELECT id FROM awik_sales WHERE id = ? FOR UPDATE');
        $heldRefundSale->execute([$refundSaleId]);
        awikMariaDbTestAssert($heldRefundSale->fetchColumn() !== false, 'Could not hold refund sale row for concurrency test');
        $refundResponses = awikMariaDbTestParallelHttpRequests(
            $parallelBaseUrls,
            '/api/v1/sales/' . $refundSaleId . '/refund',
            substr($adminHeaders['Authorization'], 7),
            [[], []],
            $testRoot,
            10,
            static function (array $httpChildStates) use ($adminDb, $appDb, $databaseName, $refundSaleId, $runtimeDbUser): void {
                awikMariaDbTestWaitForInnoDbLockWaits($adminDb, $appDb, 'sale-refund', $databaseName, 'awik_sales', $refundSaleId, 2, 10, $httpChildStates, $runtimeDbUser);
            }
        );
    } finally {
        if ($appDb->inTransaction()) {
            $appDb->rollBack();
        }
    }
    $refundStatuses = array_column($refundResponses, 'statusCode');
    sort($refundStatuses);
    awikMariaDbTestAssert($refundStatuses === [200, 400], 'Concurrent refunds must allow exactly one successful status claim');
    $successfulRefunds = array_values(array_filter($refundResponses, static fn (array $response): bool => $response['statusCode'] === 200));
    $rejectedRefunds = array_values(array_filter($refundResponses, static fn (array $response): bool => $response['statusCode'] === 400));
    awikMariaDbTestAssert(($successfulRefunds[0]['payload']['data']['status'] ?? null) === 'REFUNDED', 'Successful refund response has the wrong sale status');
    awikMariaDbTestAssert(($rejectedRefunds[0]['payload']['success'] ?? null) === false, 'Duplicate refund must use the standard API error envelope');
    awikMariaDbTestAssert(str_starts_with((string) ($rejectedRefunds[0]['payload']['message'] ?? ''), 'Sale cannot be refunded'), 'Concurrent refund failed for an unrelated reason');
    awikMariaDbTestAssert(!isset($rejectedRefunds[0]['payload']['sqlState']) && !isset($rejectedRefunds[0]['payload']['errorInfo']), 'Duplicate refund exposed database details');
    $stockQuery = $appDb->prepare('SELECT currentStock FROM awik_products WHERE id = ?');
    $stockQuery->execute([$refundProductId]);
    awikMariaDbTestAssert((int) $stockQuery->fetchColumn() === 10, 'Concurrent refunds restored stock more than once or not at all');
    $saleStatusQuery = $appDb->prepare('SELECT status FROM awik_sales WHERE id = ?');
    $saleStatusQuery->execute([$refundSaleId]);
    awikMariaDbTestAssert($saleStatusQuery->fetchColumn() === 'REFUNDED', 'Concurrent refunds persisted the wrong sale status');
    $refundMovementCount = $appDb->prepare('SELECT COUNT(*) FROM awik_stock_movements WHERE reference = ?');
    $refundMovementCount->execute(['refund-' . $refundSaleNumber]);
    awikMariaDbTestAssert((int) $refundMovementCount->fetchColumn() === 1, 'Concurrent refunds must create exactly one return movement');

    $cancelProductId = awikMariaDbTestCreateProduct($appDb, $integrityCategoryId, 'INT-CANCEL-' . bin2hex(random_bytes(4)), 7);
    $cancelSaleId = awikMariaDbTestCreateSale($appDb, 'INT-CANCEL-' . bin2hex(random_bytes(4)), $adminId, [$cancelProductId => 3]);
    $cancelSaleQuery = $appDb->prepare('SELECT saleNumber FROM awik_sales WHERE id = ?');
    $cancelSaleQuery->execute([$cancelSaleId]);
    $cancelSaleNumber = (string) $cancelSaleQuery->fetchColumn();
    $appDb->beginTransaction();
    try {
        $heldCancelSale = $appDb->prepare('SELECT id FROM awik_sales WHERE id = ? FOR UPDATE');
        $heldCancelSale->execute([$cancelSaleId]);
        awikMariaDbTestAssert($heldCancelSale->fetchColumn() !== false, 'Could not hold cancellation sale row for concurrency test');
        $cancelResponses = awikMariaDbTestParallelHttpRequests(
            $parallelBaseUrls,
            '/api/v1/sales/' . $cancelSaleId . '/cancel',
            substr($adminHeaders['Authorization'], 7),
            [[], []],
            $testRoot,
            10,
            static function (array $httpChildStates) use ($adminDb, $appDb, $databaseName, $cancelSaleId, $runtimeDbUser): void {
                awikMariaDbTestWaitForInnoDbLockWaits($adminDb, $appDb, 'sale-cancel', $databaseName, 'awik_sales', $cancelSaleId, 2, 10, $httpChildStates, $runtimeDbUser);
            }
        );
    } finally {
        if ($appDb->inTransaction()) {
            $appDb->rollBack();
        }
    }
    $cancelStatuses = array_column($cancelResponses, 'statusCode');
    sort($cancelStatuses);
    awikMariaDbTestAssert($cancelStatuses === [200, 400], 'Concurrent cancellations must allow exactly one successful status claim');
    $successfulCancellations = array_values(array_filter($cancelResponses, static fn (array $response): bool => $response['statusCode'] === 200));
    $rejectedCancellations = array_values(array_filter($cancelResponses, static fn (array $response): bool => $response['statusCode'] === 400));
    awikMariaDbTestAssert(($successfulCancellations[0]['payload']['data']['status'] ?? null) === 'CANCELLED', 'Successful cancellation response has the wrong sale status');
    awikMariaDbTestAssert(($rejectedCancellations[0]['payload']['success'] ?? null) === false, 'Duplicate cancellation must use the standard API error envelope');
    awikMariaDbTestAssert(str_starts_with((string) ($rejectedCancellations[0]['payload']['message'] ?? ''), 'Sale cannot be cancelled'), 'Concurrent cancellation failed for an unrelated reason');
    $stockQuery->execute([$cancelProductId]);
    awikMariaDbTestAssert((int) $stockQuery->fetchColumn() === 10, 'Concurrent cancellations restored stock more than once or not at all');
    $saleStatusQuery->execute([$cancelSaleId]);
    awikMariaDbTestAssert($saleStatusQuery->fetchColumn() === 'CANCELLED', 'Concurrent cancellations persisted the wrong sale status');
    $cancelMovementCount = $appDb->prepare('SELECT COUNT(*) FROM awik_stock_movements WHERE reference = ?');
    $cancelMovementCount->execute(['cancel-' . $cancelSaleNumber]);
    awikMariaDbTestAssert((int) $cancelMovementCount->fetchColumn() === 1, 'Concurrent cancellations must create exactly one return movement');

    foreach (['refund' => 'REFUNDED', 'cancel' => 'CANCELLED'] as $action => $expectedStatus) {
        $deletedProductId = awikMariaDbTestCreateProduct($appDb, $integrityCategoryId, 'INT-DELETED-' . strtoupper($action) . '-' . bin2hex(random_bytes(4)), 6);
        $deletedSaleNumber = 'INT-DELETED-' . strtoupper($action) . '-' . bin2hex(random_bytes(4));
        $deletedSaleId = awikMariaDbTestCreateSale($appDb, $deletedSaleNumber, $adminId, [$deletedProductId => 2]);
        $appDb->prepare('UPDATE awik_products SET deletedAt = CURRENT_TIMESTAMP(3), isActive = 0 WHERE id = ?')
            ->execute([$deletedProductId]);

        $deletedProductResponse = awikHandleRequest([
            'method' => 'POST',
            'uri' => '/api/v1/sales/' . $deletedSaleId . '/' . $action,
            'headers' => $adminHeaders,
            'body' => [],
        ]);
        awikMariaDbTestAssert($deletedProductResponse['statusCode'] === 200, 'Soft-deleted sale product should follow the source no-restock policy');
        awikMariaDbTestAssert(($deletedProductResponse['payload']['data']['status'] ?? null) === $expectedStatus, 'Soft-deleted product action returned the wrong sale status');
        $saleStatusQuery->execute([$deletedSaleId]);
        awikMariaDbTestAssert($saleStatusQuery->fetchColumn() === $expectedStatus, 'Soft-deleted product action persisted the wrong sale status');
        $stockQuery->execute([$deletedProductId]);
        awikMariaDbTestAssert((int) $stockQuery->fetchColumn() === 6, 'Soft-deleted product stock should not be restored');
        $deletedMovementCount = $appDb->prepare('SELECT COUNT(*) FROM awik_stock_movements WHERE reference = ?');
        $deletedMovementCount->execute([($action === 'refund' ? 'refund-' : 'cancel-') . $deletedSaleNumber]);
        awikMariaDbTestAssert((int) $deletedMovementCount->fetchColumn() === 0, 'Soft-deleted product no-op must not create a false return movement');
    }

    $movementProductId = awikMariaDbTestCreateProduct($appDb, $integrityCategoryId, 'INT-MOVE-' . bin2hex(random_bytes(4)), 10);
    $appDb->beginTransaction();
    try {
        $heldMovementProduct = $appDb->prepare('SELECT id FROM awik_products WHERE id = ? FOR UPDATE');
        $heldMovementProduct->execute([$movementProductId]);
        awikMariaDbTestAssert($heldMovementProduct->fetchColumn() !== false, 'Could not hold product row for concurrency test');
        $movementResponses = awikMariaDbTestParallelHttpRequests(
            $parallelBaseUrls,
            '/api/v1/products/' . $movementProductId . '/movements',
            substr($adminHeaders['Authorization'], 7),
            [
                ['movementType' => 'PURCHASE', 'quantity' => 1, 'reference' => 'parallel-movement-a'],
                ['movementType' => 'PURCHASE', 'quantity' => 1, 'reference' => 'parallel-movement-b'],
            ],
            $testRoot,
            10,
            static function (array $httpChildStates) use ($adminDb, $appDb, $databaseName, $movementProductId, $runtimeDbUser): void {
                awikMariaDbTestWaitForInnoDbLockWaits($adminDb, $appDb, 'inventory-movement', $databaseName, 'awik_products', $movementProductId, 2, 10, $httpChildStates, $runtimeDbUser);
            }
        );
    } finally {
        if ($appDb->inTransaction()) {
            $appDb->rollBack();
        }
    }
    awikMariaDbTestAssert(array_column($movementResponses, 'statusCode') === [201, 201], 'Concurrent inbound stock movements should both succeed');
    $stockQuery->execute([$movementProductId]);
    awikMariaDbTestAssert((int) $stockQuery->fetchColumn() === 12, 'Concurrent stock movements lost an update');
    $concurrentMovementCount = $appDb->prepare('SELECT COUNT(*) FROM awik_stock_movements WHERE reference IN (?, ?)');
    $concurrentMovementCount->execute(['parallel-movement-a', 'parallel-movement-b']);
    awikMariaDbTestAssert((int) $concurrentMovementCount->fetchColumn() === 2, 'Concurrent stock movements did not both reach the movement ledger');

    $insufficientMovementProductId = awikMariaDbTestCreateProduct($appDb, $integrityCategoryId, 'INT-LOW-' . bin2hex(random_bytes(4)), 1);
    $insufficientMovement = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/products/' . $insufficientMovementProductId . '/movements',
        'headers' => $adminHeaders,
        'body' => ['movementType' => 'DAMAGED', 'quantity' => 2],
    ]);
    awikMariaDbTestAssert($insufficientMovement['statusCode'] === 400, 'Manual stock movement must reject a negative resulting stock');
    $stockQuery->execute([$insufficientMovementProductId]);
    awikMariaDbTestAssert((int) $stockQuery->fetchColumn() === 1, 'Insufficient manual movement changed stock');

    $saleStockA = awikMariaDbTestCreateProduct($appDb, $integrityCategoryId, 'INT-SALE-A-' . bin2hex(random_bytes(4)), 5);
    $saleStockB = awikMariaDbTestCreateProduct($appDb, $integrityCategoryId, 'INT-SALE-B-' . bin2hex(random_bytes(4)), 1);
    $salesBeforeInsufficient = (int) $appDb->query('SELECT COUNT(*) FROM awik_sales')->fetchColumn();
    $insufficientSale = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/sales',
        'headers' => $adminHeaders,
        'body' => [
            'items' => [
                ['productId' => $saleStockA, 'quantity' => 2],
                ['productId' => $saleStockB, 'quantity' => 2],
            ],
            'paymentMethod' => 'cash',
        ],
    ]);
    awikMariaDbTestAssert($insufficientSale['statusCode'] === 400, 'Sale creation must reject insufficient stock');
    awikMariaDbTestAssert((int) $appDb->query('SELECT COUNT(*) FROM awik_sales')->fetchColumn() === $salesBeforeInsufficient, 'Insufficient sale left a sale record behind');
    $stockQuery->execute([$saleStockA]);
    awikMariaDbTestAssert((int) $stockQuery->fetchColumn() === 5, 'Insufficient sale did not roll back an earlier product decrement');
    $stockQuery->execute([$saleStockB]);
    awikMariaDbTestAssert((int) $stockQuery->fetchColumn() === 1, 'Insufficient sale changed the out-of-stock product');

    $rollbackMovementProductId = awikMariaDbTestCreateProduct($appDb, $integrityCategoryId, 'INT-ROLLBACK-MOVE-' . bin2hex(random_bytes(4)), 10);
    $rollbackSaleProductId = awikMariaDbTestCreateProduct($appDb, $integrityCategoryId, 'INT-ROLLBACK-SALE-' . bin2hex(random_bytes(4)), 8);
    $rollbackSaleId = awikMariaDbTestCreateSale($appDb, 'ROLLBACK-CASE', $adminId, [$rollbackSaleProductId => 2]);
    $appDb->exec(
        "CREATE TRIGGER awik_test_fail_integrity_movement BEFORE INSERT ON awik_stock_movements FOR EACH ROW "
        . "BEGIN IF NEW.reference IN ('test-fail-movement', 'refund-ROLLBACK-CASE') THEN "
        . "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Injected test movement failure'; END IF; END"
    );
    $movementInsertFailure = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/products/' . $rollbackMovementProductId . '/movements',
        'headers' => $adminHeaders,
        'body' => ['movementType' => 'PURCHASE', 'quantity' => 3, 'reference' => 'test-fail-movement'],
    ]);
    awikMariaDbTestAssert($movementInsertFailure['statusCode'] === 500, 'Movement insert failure should return a generic server error');
    awikMariaDbTestAssert(($movementInsertFailure['payload']['message'] ?? null) === 'Internal server error', 'Movement insert failure did not use the standard generic error envelope');
    awikMariaDbTestAssert(!str_contains(json_encode($movementInsertFailure['payload']), 'Injected test movement failure'), 'Movement insert failure exposed SQL details');
    $stockQuery->execute([$rollbackMovementProductId]);
    awikMariaDbTestAssert((int) $stockQuery->fetchColumn() === 10, 'Failed movement insert did not roll back the stock update');

    $refundInsertFailure = awikHandleRequest([
        'method' => 'POST',
        'uri' => '/api/v1/sales/' . $rollbackSaleId . '/refund',
        'headers' => $adminHeaders,
        'body' => [],
    ]);
    awikMariaDbTestAssert($refundInsertFailure['statusCode'] === 500, 'Refund movement failure should return a generic server error');
    awikMariaDbTestAssert(($refundInsertFailure['payload']['message'] ?? null) === 'Internal server error', 'Refund movement failure did not use the standard generic error envelope');
    awikMariaDbTestAssert(!str_contains(json_encode($refundInsertFailure['payload']), 'Injected test movement failure'), 'Refund movement failure exposed SQL details');
    $saleStatusQuery = $appDb->prepare('SELECT status FROM awik_sales WHERE id = ?');
    $saleStatusQuery->execute([$rollbackSaleId]);
    awikMariaDbTestAssert($saleStatusQuery->fetchColumn() === 'COMPLETED', 'Failed refund did not roll back the sale status transition');
    $stockQuery->execute([$rollbackSaleProductId]);
    awikMariaDbTestAssert((int) $stockQuery->fetchColumn() === 8, 'Failed refund did not roll back stock restoration');
    $rollbackMovementCount = $appDb->prepare('SELECT COUNT(*) FROM awik_stock_movements WHERE reference = ?');
    $rollbackMovementCount->execute(['refund-ROLLBACK-CASE']);
    awikMariaDbTestAssert((int) $rollbackMovementCount->fetchColumn() === 0, 'Failed refund left a partial movement record');
    $appDb->exec('DROP TRIGGER awik_test_fail_integrity_movement');

    echo "MariaDB sales and inventory integrity assertions passed\n";

    $appDb->exec('DELETE FROM awik_login_attempts');

    $httpLogin = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/login', 'POST', [
        'identifier' => 'maria-test@example.invalid',
        'password' => $testPassword,
    ]);
    awikMariaDbTestAssert($httpLogin['statusCode'] === 200, 'Real HTTP entrypoint login failed against MariaDB');
    $httpTokens = $httpLogin['payload']['data'] ?? [];
    awikMariaDbTestAssert(isset($httpTokens['accessToken'], $httpTokens['refreshToken']), 'Real HTTP login token data missing');

    $httpProfile = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/profile', 'GET', [], [
        'Authorization' => 'Bearer ' . $httpTokens['accessToken'],
    ]);
    awikMariaDbTestAssert($httpProfile['statusCode'] === 200, 'Real HTTP profile request failed');
    $httpRefresh = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/refresh', 'POST', [
        'refreshToken' => $httpTokens['refreshToken'],
    ]);
    awikMariaDbTestAssert($httpRefresh['statusCode'] === 200, 'Real HTTP refresh rotation failed');
    $replayedHttpRefresh = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/refresh', 'POST', [
        'refreshToken' => $httpTokens['refreshToken'],
    ]);
    awikMariaDbTestAssert($replayedHttpRefresh['statusCode'] === 401, 'Real HTTP refresh replay was not rejected');

    $newHttpPassword = bin2hex(random_bytes(16));
    $passwordChange = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/change-password', 'POST', [
        'currentPassword' => $testPassword,
        'newPassword' => $newHttpPassword,
        'confirmPassword' => $newHttpPassword,
    ], ['Authorization' => 'Bearer ' . $httpRefresh['payload']['data']['accessToken']]);
    awikMariaDbTestAssert($passwordChange['statusCode'] === 200, 'Real HTTP password change failed');
    $revokedHttpProfile = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/profile', 'GET', [], [
        'Authorization' => 'Bearer ' . $httpRefresh['payload']['data']['accessToken'],
    ]);
    awikMariaDbTestAssert($revokedHttpProfile['statusCode'] === 401, 'Real HTTP password change did not revoke prior tokens');
    $oldHttpPassword = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/login', 'POST', [
        'identifier' => 'maria-test@example.invalid',
        'password' => $testPassword,
    ]);
    awikMariaDbTestAssert($oldHttpPassword['statusCode'] === 401, 'Real HTTP login accepted the old password after change');
    $newHttpLogin = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/login', 'POST', [
        'identifier' => 'maria-test@example.invalid',
        'password' => $newHttpPassword,
    ]);
    awikMariaDbTestAssert($newHttpLogin['statusCode'] === 200, 'Real HTTP login rejected the changed password');
    $httpLogout = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/logout', 'POST', [], [
        'Authorization' => 'Bearer ' . $newHttpLogin['payload']['data']['accessToken'],
    ]);
    awikMariaDbTestAssert($httpLogout['statusCode'] === 200, 'Real HTTP logout failed');
    $loggedOutProfile = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/profile', 'GET', [], [
        'Authorization' => 'Bearer ' . $newHttpLogin['payload']['data']['accessToken'],
    ]);
    awikMariaDbTestAssert($loggedOutProfile['statusCode'] === 401, 'Real HTTP logout did not revoke the access token');

    $appDb->exec('DELETE FROM awik_login_attempts');
    $badExisting = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/login', 'POST', [
        'identifier' => 'maria-test@example.invalid',
        'password' => 'incorrect-password',
    ]);
    $badUnknown = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/login', 'POST', [
        'identifier' => 'unknown@example.invalid',
        'password' => 'incorrect-password',
    ]);
    awikMariaDbTestAssert($badExisting['statusCode'] === 401 && $badUnknown['statusCode'] === 401, 'Unknown and existing accounts must both receive HTTP 401');
    awikMariaDbTestAssert(($badExisting['payload']['message'] ?? null) === 'Invalid credentials' && ($badUnknown['payload']['message'] ?? null) === 'Invalid credentials', 'Unknown and existing account messages differ');
    awikMariaDbTestAssert(($badExisting['payload']['errors'] ?? null) === ($badUnknown['payload']['errors'] ?? null), 'Unknown and existing account error details differ');
    $maliciousIdentifier = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/login', 'POST', [
        'identifier' => "' OR 1=1 --",
        'password' => 'incorrect-password',
    ]);
    awikMariaDbTestAssert($maliciousIdentifier['statusCode'] === 401, 'Malicious identifier bypassed prepared login lookup');

    $appDb->exec('DELETE FROM awik_login_attempts');
    foreach (['+15550000301', '0015550000301'] as $phoneVariant) {
        $phoneFailure = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/login', 'POST', [
            'identifier' => $phoneVariant,
            'password' => 'incorrect-password',
        ]);
        awikMariaDbTestAssert($phoneFailure['statusCode'] === 401, 'Phone-format normalization test should produce generic authentication failures');
    }
    $phoneCounter = $appDb->prepare('SELECT failedCount FROM awik_login_attempts WHERE scopeType = ? AND scopeKey = ?');
    $phoneScopeKey = 'account:' . hash('sha256', 'phone:+15550000301');
    $phoneCounter->execute(['identifier', $phoneScopeKey]);
    awikMariaDbTestAssert((int) $phoneCounter->fetchColumn() === 2, 'Equivalent international phone formats did not share an account counter');

    $appDb->exec('DELETE FROM awik_login_attempts');
    for ($attempt = 0; $attempt < 5; $attempt++) {
        $failedLogin = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/login', 'POST', [
            'identifier' => 'maria-test@example.invalid',
            'password' => 'incorrect-password',
        ]);
        awikMariaDbTestAssert($failedLogin['statusCode'] === 401, 'Account lockout must allow the first five generic failures');
    }
    $accountBlocked = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/login', 'POST', [
        'identifier' => 'maria-test@example.invalid',
        'password' => $newHttpPassword,
    ]);
    $accountRetryAfter = (int) ($accountBlocked['headers']['retry-after'] ?? 0);
    awikMariaDbTestAssert($accountBlocked['statusCode'] === 429, 'Sixth failed account attempt must be blocked with HTTP 429');
    awikMariaDbTestAssert($accountRetryAfter > 0 && $accountRetryAfter <= 900, 'Account Retry-After is missing or outside the 15-minute lockout');

    awikMariaDbTestStopHttpServer($httpServers[0]);
    $httpServers[0] = awikMariaDbTestStartHttpServer($prototypeRoot, $publicIndex);
    $httpBaseUrl = $httpServers[0]['baseUrl'];
    $blockedAfterRestart = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/login', 'POST', [
        'identifier' => 'maria-test@example.invalid',
        'password' => $newHttpPassword,
    ]);
    awikMariaDbTestAssert($blockedAfterRestart['statusCode'] === 429, 'Account lockout did not survive an HTTP/PHP process restart');

    $appDb->prepare(
        'UPDATE awik_login_attempts SET failedCount = 5, windowStartedAt = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 901 SECOND), '
        . 'lockedUntil = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE scopeType = ? AND scopeKey = ?'
    )->execute(['identifier', 'account:' . hash('sha256', 'email:maria-test@example.invalid')]);
    $appDb->exec('DELETE FROM awik_login_attempts WHERE scopeType = \'ip\'');
    $recoveredHttpLogin = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/login', 'POST', [
        'identifier' => 'maria-test@example.invalid',
        'password' => $newHttpPassword,
    ]);
    awikMariaDbTestAssert($recoveredHttpLogin['statusCode'] === 200, 'Expired account lockout did not recover');
    $accountCounter = $appDb->prepare('SELECT failedCount FROM awik_login_attempts WHERE scopeType = ? AND scopeKey = ?');
    $accountCounter->execute(['identifier', 'account:' . hash('sha256', 'email:maria-test@example.invalid')]);
    awikMariaDbTestAssert((int) $accountCounter->fetchColumn() === 0, 'Successful login did not reset the account failure counter');

    $ipUsers = [];
    $ipPassword = bin2hex(random_bytes(16));
    for ($index = 0; $index < 10; $index++) {
        $idSuffix = str_pad((string) (400 + $index), 12, '0', STR_PAD_LEFT);
        $userId = '00000000-0000-4000-8000-' . $idSuffix;
        $email = 'ip-test-' . $index . '@example.invalid';
        $appDb->prepare('INSERT INTO awik_users (id, email, phone, firstName, lastName, passwordHash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$userId, $email, '+1555000' . (400 + $index), 'IP', 'Test', password_hash($ipPassword, PASSWORD_BCRYPT), 'STAFF', 'ACTIVE']);
        $ipUsers[] = $email;
    }

    $appDb->exec('DELETE FROM awik_login_attempts');
    for ($attempt = 0; $attempt < 9; $attempt++) {
        $headers = $attempt === 0 ? ['X-Forwarded-For' => '198.51.100.123, 10.0.0.1'] : [];
        $ipFailure = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/login', 'POST', [
            'identifier' => $ipUsers[$attempt],
            'password' => 'incorrect-password',
        ], $headers);
        awikMariaDbTestAssert($ipFailure['statusCode'] === 401, 'Per-IP limit triggered before ten failures across accounts');
    }
    $loopbackIpKey = 'ip:' . hash('sha256', '127.0.0.1');
    $spoofedIpKey = 'ip:' . hash('sha256', '198.51.100.123');
    $ipCounter = $appDb->prepare('SELECT failedCount FROM awik_login_attempts WHERE scopeType = ? AND scopeKey = ?');
    $ipCounter->execute(['ip', $loopbackIpKey]);
    awikMariaDbTestAssert((int) $ipCounter->fetchColumn() === 9, 'Forwarded-header spoofing changed the authoritative REMOTE_ADDR counter');
    $ipCounter->execute(['ip', $spoofedIpKey]);
    awikMariaDbTestAssert($ipCounter->fetchColumn() === false, 'Untrusted X-Forwarded-For value was trusted');

    $validLoginDuringIpWindow = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/login', 'POST', [
        'identifier' => 'maria-test@example.invalid',
        'password' => $newHttpPassword,
    ]);
    awikMariaDbTestAssert($validLoginDuringIpWindow['statusCode'] === 200, 'Valid login unexpectedly blocked before the IP threshold');
    $ipCounter->execute(['ip', $loopbackIpKey]);
    awikMariaDbTestAssert((int) $ipCounter->fetchColumn() === 9, 'Successful login incorrectly reset shared IP failures');
    $tenthIpFailure = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/login', 'POST', [
        'identifier' => $ipUsers[9],
        'password' => 'incorrect-password',
    ]);
    awikMariaDbTestAssert($tenthIpFailure['statusCode'] === 401, 'The tenth per-IP failed attempt should record the threshold');
    $ipBlocked = awikMariaDbTestHttpRequest($httpBaseUrl, '/api/v1/auth/login', 'POST', [
        'identifier' => $ipUsers[9],
        'password' => 'incorrect-password',
    ]);
    $ipRetryAfter = (int) ($ipBlocked['headers']['retry-after'] ?? 0);
    awikMariaDbTestAssert($ipBlocked['statusCode'] === 429, 'Per-IP limit did not block after ten failures across accounts');
    awikMariaDbTestAssert($ipRetryAfter > 0 && $ipRetryAfter <= 300, 'IP Retry-After is missing or outside the five-minute lockout');

    $appDb->exec('DELETE FROM awik_login_attempts');
    $parallelId = '00000000-0000-4000-8000-000000000499';
    $parallelEmail = 'parallel-test@example.invalid';
    $appDb->prepare('INSERT INTO awik_users (id, email, phone, firstName, lastName, passwordHash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$parallelId, $parallelEmail, '+15550000499', 'Parallel', 'Test', password_hash($ipPassword, PASSWORD_BCRYPT), 'STAFF', 'ACTIVE']);

    $parallelServers = [];
    for ($index = 0; $index < 6; $index++) {
        $parallelServers[] = awikMariaDbTestStartHttpServer($prototypeRoot, $publicIndex);
        $httpServers[] = $parallelServers[$index];
    }
    $parallelClientCode = <<<'PHP'
$context = stream_context_create(['http' => [
    'method' => 'POST',
    'header' => "Accept: application/json\r\nContent-Type: application/json",
    'content' => json_encode(['identifier' => $argv[2], 'password' => $argv[3]], JSON_THROW_ON_ERROR),
    'ignore_errors' => true,
    'timeout' => 10,
]]);
@file_get_contents($argv[1], false, $context);
if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $matches)) {
    echo $matches[1];
} else {
    exit(2);
}
PHP;
    $parallelClients = [];
    for ($index = 0; $index < 12; $index++) {
        $worker = $parallelServers[$index % count($parallelServers)];
        $client = proc_open([PHP_BINARY, '-r', $parallelClientCode, $worker['baseUrl'] . '/api/v1/auth/login', $parallelEmail, 'incorrect-password'], [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['file', 'NUL', 'a'],
        ], $clientPipes, $prototypeRoot, null, ['bypass_shell' => true]);
        awikMariaDbTestAssert(is_resource($client), 'Could not start concurrent HTTP client');
        fclose($clientPipes[0]);
        $parallelClients[] = ['process' => $client, 'stdout' => $clientPipes[1]];
    }
    $parallelStatuses = [];
    foreach ($parallelClients as $client) {
        $statusText = stream_get_contents($client['stdout']);
        fclose($client['stdout']);
        $clientExitCode = proc_close($client['process']);
        awikMariaDbTestAssert($clientExitCode === 0 && preg_match('/^(401|429)$/', trim((string) $statusText)) === 1, 'Concurrent login request returned an unexpected result');
        $parallelStatuses[] = (int) trim((string) $statusText);
    }
    $parallelFailureCount = count(array_filter($parallelStatuses, static fn (int $status): bool => $status === 401));
    $parallelCounter = $appDb->prepare('SELECT failedCount FROM awik_login_attempts WHERE scopeType = ? AND scopeKey = ?');
    $parallelCounter->execute(['identifier', 'account:' . hash('sha256', 'email:' . $parallelEmail)]);
    awikMariaDbTestAssert((int) $parallelCounter->fetchColumn() === $parallelFailureCount, 'Concurrent requests lost or duplicated account failure increments');
    awikMariaDbTestAssert($parallelFailureCount >= 5, 'Parallel requests did not reach the configured account threshold');
    $parallelCounter->execute(['ip', $loopbackIpKey]);
    awikMariaDbTestAssert((int) $parallelCounter->fetchColumn() === $parallelFailureCount, 'Concurrent requests lost or duplicated IP failure increments');
    $parallelBlocked = awikMariaDbTestHttpRequest($parallelServers[0]['baseUrl'], '/api/v1/auth/login', 'POST', [
        'identifier' => $parallelEmail,
        'password' => 'incorrect-password',
    ]);
    awikMariaDbTestAssert($parallelBlocked['statusCode'] === 429, 'Parallel attempts raced past the account lockout threshold');

    putenv('AWIK_MIGRATION_DSN=mysql:host=127.0.0.1;port=1;dbname=awik_unreachable');
    $unavailableServer = awikMariaDbTestStartHttpServer($prototypeRoot, $publicIndex);
    $httpServers[] = $unavailableServer;
    putenv('AWIK_MIGRATION_DSN=' . $dsn);
    $unavailableLogin = awikMariaDbTestHttpRequest($unavailableServer['baseUrl'], '/api/v1/auth/login', 'POST', [
        'identifier' => 'maria-test@example.invalid',
        'password' => $newHttpPassword,
    ]);
    awikMariaDbTestAssert($unavailableLogin['statusCode'] === 503, 'Database outage did not fail login closed with HTTP 503');

    echo "MariaDB-backed public HTTP auth and login-lockout checks passed\n";
} catch (Throwable $exception) {
    fwrite(STDERR, $exception->getMessage() . PHP_EOL);
    $exitCode = 1;
} finally {
    foreach ($httpServers as &$httpServer) {
        awikMariaDbTestStopHttpServer($httpServer);
    }
    unset($httpServer);
    if (is_resource($server)) {
        proc_terminate($server);
        proc_close($server);
    }
    awikMariaDbTestRemoveDirectory($testRoot);
}

exit($exitCode);
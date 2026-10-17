<?php

declare(strict_types=1);

require_once __DIR__ . '/../private/bootstrap.php';

// Add CORS headers for API requests
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$headers = function_exists('getallheaders') ? getallheaders() : [];
if (!is_array($headers)) {
    $headers = [];
}

$authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
if ($authorization !== '' && awikHeaderValue($headers, 'Authorization') === '') {
    $headers['Authorization'] = $authorization;
}
$userAgent = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
if ($userAgent !== '' && awikHeaderValue($headers, 'User-Agent') === '') {
    $headers['User-Agent'] = $userAgent;
}

$response = awikHandleRequest([
    'method' => (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'),
    'uri' => (string) ($_SERVER['REQUEST_URI'] ?? '/'),
    'headers' => $headers,
    'body' => awikReadJsonBody(),
    'ipAddress' => (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
]);

// Add CORS headers for API requests
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

http_response_code((int) ($response['statusCode'] ?? 500));
$hasContentType = false;
foreach (($response['headers'] ?? []) as $headerName => $headerValue) {
    header($headerName . ': ' . $headerValue);
    if (strcasecmp((string) $headerName, 'Content-Type') === 0) {
        $hasContentType = true;
    }
}
if (!$hasContentType) {
    header('Content-Type: application/json; charset=utf-8');
}

if (isset($response['filePath'], $response['headers']['Content-Disposition'])) {
    $filePath = $response['filePath'];
    if (!is_string($filePath) || !is_file($filePath) || is_link($filePath)) {
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'message' => 'Backup file unavailable']);
        exit;
    }
    readfile($filePath);
    exit;
}

if (array_key_exists('body', $response)) {
    echo (string) $response['body'];
    return;
}

echo json_encode(
    $response['payload'] ?? [],
    JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
);

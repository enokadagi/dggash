<?php

declare(strict_types=1);

/**
 * AWIK NET Hostinger API bridge.
 *
 * Layouts resolved by this bridge:
 *
 *   Production (document root = .../domains/awiknet.com/public_html):
 *     bridge  .../domains/awiknet.com/public_html/api/index.php
 *     private .../domains/awiknet.com/api          (dirname(__DIR__, 2) . '/api')
 *
 *   Staging (document root = .../domains/awiknet.com/public_html/staging):
 *     bridge  .../domains/awiknet.com/public_html/staging/api/index.php
 *     private .../domains/awiknet.com/staging-api  (dirname(__DIR__, 3) . '/staging-api')
 *
 * The staging-private directory lives outside every public document root and is
 * resolved only when the bridge is deployed under `public_html/staging/`.
 * Production path resolution is unchanged: when the staging-private directory is
 * absent, the bridge falls back to the production `api/` sibling.
 *
 * If no intended private application directory exists, the bridge fails closed
 * with a generic response. No filesystem path, configuration value, or secret
 * is ever sent to HTTP clients.
 */

$candidates = [
    // Staging: document root is .../public_html/staging; the staging-private
    // application directory lives at .../staging-api, outside the document root.
    dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'staging-api',
    // Production: .../public_html/api/index.php resolves to .../api.
    dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'api',
];

$apiRoot = null;
foreach ($candidates as $candidate) {
    $candidate = rtrim((string) $candidate, DIRECTORY_SEPARATOR);
    if (is_dir($candidate) && is_file($candidate . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'index.php')) {
        $apiRoot = $candidate;
        break;
    }
}

if ($apiRoot === null) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => 'Application unavailable'], JSON_THROW_ON_ERROR);
    exit;
}

require $apiRoot . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'index.php';

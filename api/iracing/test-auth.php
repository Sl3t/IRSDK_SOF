<?php
/**
 * Debug script — tests iRacing OAuth 2.0 Password Limited authentication.
 * Run via: http://localhost/IRSDK_SOF/api/iracing/test-auth.php
 * DELETE after debugging.
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/crypto.php';

header('Content-Type: application/json; charset=utf-8');

$db  = Database::getInstance();
$key = _getEncryptionKey();

// Read stored credentials
$fields = ['oauth_client_id', 'oauth_client_secret', 'iracing_email', 'iracing_password'];
$creds  = [];

foreach ($fields as $f) {
    $enc = $db->getSetting($f);
    if (!$enc) {
        echo json_encode(['error' => "Missing setting: {$f}. Save credentials in Settings first."]);
        exit;
    }
    try {
        $creds[$f] = _decrypt($enc, $key);
    } catch (Throwable $e) {
        echo json_encode(['error' => "Cannot decrypt {$f}: {$e->getMessage()}"]);
        exit;
    }
}

// Build OAuth 2.0 Password Limited request
$tokenUrl = IRACING_OAUTH_TOKEN_URL;

$postFields = http_build_query([
    'grant_type'    => 'password_limited',
    'client_id'     => $creds['oauth_client_id'],
    'client_secret' => $creds['oauth_client_secret'],
    'username'      => $creds['iracing_email'],
    'password'      => $creds['iracing_password'],
]);

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL            => $tokenUrl,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $postFields,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_HEADER         => true,
    CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/x-www-form-urlencoded',
        'Accept: application/json',
    ],
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_VERBOSE        => true,
]);

$verbose = fopen('php://temp', 'w+');
curl_setopt($ch, CURLOPT_STDERR, $verbose);

$fullResponse  = curl_exec($ch);
$httpCode      = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$effectiveUrl  = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
$curlError     = curl_error($ch);
$headerSize    = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

rewind($verbose);
$verboseLog = stream_get_contents($verbose);
fclose($verbose);

$responseHeaders = substr($fullResponse, 0, $headerSize);
$responseBody    = substr($fullResponse, $headerSize);

echo json_encode([
    'request' => [
        'url'          => $tokenUrl,
        'grant_type'   => 'password_limited',
        'client_id'    => '****' . substr($creds['oauth_client_id'], -4),
        'email'        => '****' . substr($creds['iracing_email'], -8),
    ],
    'response' => [
        'http_code'    => $httpCode,
        'effective_url'=> $effectiveUrl,
        'headers'      => $responseHeaders,
        'body'         => mb_substr($responseBody, 0, 2000),
        'body_json'    => json_decode($responseBody, true),
    ],
    'curl_error'  => $curlError ?: null,
    'verbose_log' => $verboseLog,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

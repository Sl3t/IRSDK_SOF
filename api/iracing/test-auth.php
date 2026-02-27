<?php
/**
 * Debug script — tests iRacing authentication with HTTP/1.1 and browser-like headers.
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

// Decrypt stored credentials
$encId     = $db->getSetting('oauth_client_id');
$encSecret = $db->getSetting('oauth_client_secret');

if (!$encId || !$encSecret) {
    echo json_encode(['error' => 'No stored credentials found. Run setup-identity.php first.']);
    exit;
}

$email    = _decrypt($encId, $key);
$password = _decrypt($encSecret, $key);

// Hash password the iRacing way
$encodedPassword = base64_encode(
    hash('sha256', $password . strtolower($email), true)
);

$tokenUrl = IRACING_OAUTH_TOKEN_URL;
$postBody = json_encode([
    'email'    => $email,
    'password' => $encodedPassword,
]);

$cookieFile = sys_get_temp_dir() . '/irsdk_sof_test_cookies.txt';

// Clean old cookies
if (file_exists($cookieFile)) {
    unlink($cookieFile);
}

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL            => $tokenUrl,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $postBody,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_POSTREDIR      => CURL_REDIR_POST_ALL,
    CURLOPT_HEADER         => true,
    // Force HTTP/1.1 — CloudFront was rejecting HTTP/2 POST with 405
    CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Accept: application/json',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin: https://members-ng.iracing.com',
        'Referer: https://members-ng.iracing.com/',
    ],
    CURLOPT_COOKIEJAR      => $cookieFile,
    CURLOPT_COOKIEFILE     => $cookieFile,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_VERBOSE        => true,
]);

// Capture verbose output
$verbose = fopen('php://temp', 'w+');
curl_setopt($ch, CURLOPT_STDERR, $verbose);

$fullResponse = curl_exec($ch);
$httpCode     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
$redirectCount= curl_getinfo($ch, CURLINFO_REDIRECT_COUNT);
$curlError    = curl_error($ch);
$totalTime    = curl_getinfo($ch, CURLINFO_TOTAL_TIME);
$headerSize   = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

// Get verbose log
rewind($verbose);
$verboseLog = stream_get_contents($verbose);
fclose($verbose);

// Split headers and body
$responseHeaders = substr($fullResponse, 0, $headerSize);
$responseBody    = substr($fullResponse, $headerSize);

echo json_encode([
    'request' => [
        'url'          => $tokenUrl,
        'method'       => 'POST',
        'http_version' => '1.1 (forced)',
        'email_used'   => '****' . substr($email, -8),
    ],
    'response' => [
        'http_code'      => $httpCode,
        'effective_url'  => $effectiveUrl,
        'redirect_count' => $redirectCount,
        'total_time_s'   => round($totalTime, 3),
        'headers'        => $responseHeaders,
        'body'           => mb_substr($responseBody, 0, 2000),
        'body_json'      => json_decode($responseBody, true),
    ],
    'curl_error' => $curlError ?: null,
    'verbose_log' => $verboseLog,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

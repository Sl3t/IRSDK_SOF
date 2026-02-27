<?php
/**
 * IRSDK SOF Agent — iRacing OAuth 2.0 Authentication Endpoint
 *
 * Authenticates with the iRacing Data API using OAuth 2.0 Password Limited grant.
 * Requires OAuth client credentials (from iRacing Client Registration) plus
 * the user's iRacing email and password.
 *
 * Method: POST
 * Body (initial auth):
 *   { "oauth_client_id": "...", "oauth_client_secret": "...",
 *     "iracing_email": "...", "iracing_password": "..." }
 *
 * Body (test with stored credentials — all fields masked/empty):
 *   { "oauth_client_id": "****...", ... }
 *
 * Body (refresh token):
 *   { "grant_type": "refresh_token" }
 *
 * Response (success):
 *   { "success": true, "expires_in": 600, "message": "Authenticated successfully" }
 *
 * Response (failure):
 *   { "error": true, "message": "Authentication failed: ..." }
 *
 * @package IRSDK_SOF
 */

declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/crypto.php';

// Set CORS headers and handle preflight
setCorsHeaders();

// Only accept POST requests
requireMethod('POST');

// Parse the JSON request body
$input = getJsonInput();

$db  = Database::getInstance();
$key = _getEncryptionKey();

// ============================================================================
// Determine grant type
// ============================================================================

$grantType = $input['grant_type'] ?? 'password_limited';

if ($grantType === 'refresh_token') {
    // ---- Refresh token flow ----
    $refreshToken = $db->getSetting('oauth_refresh_token');
    if (empty($refreshToken)) {
        jsonError('No refresh token available. Authenticate first.', 400);
    }

    $refreshToken = _decrypt($refreshToken, $key);
    $clientId     = _decrypt($db->getSetting('oauth_client_id') ?? '', $key);
    $clientSecret = _decrypt($db->getSetting('oauth_client_secret') ?? '', $key);

    $postFields = http_build_query([
        'grant_type'    => 'refresh_token',
        'client_id'     => $clientId,
        'client_secret' => $clientSecret,
        'refresh_token' => $refreshToken,
    ]);
} else {
    // ---- Password Limited flow ----
    $oauthClientId     = trim($input['oauth_client_id'] ?? '');
    $oauthClientSecret = trim($input['oauth_client_secret'] ?? '');
    $iracingEmail      = trim($input['iracing_email'] ?? '');
    $iracingPassword   = trim($input['iracing_password'] ?? '');

    // If values are masked or empty, read stored encrypted credentials from DB
    if (str_starts_with($oauthClientId, '****') || empty($oauthClientId)) {
        $stored = $db->getSetting('oauth_client_id');
        if (!empty($stored)) $oauthClientId = _decrypt($stored, $key);
    }
    if (str_starts_with($oauthClientSecret, '****') || empty($oauthClientSecret)) {
        $stored = $db->getSetting('oauth_client_secret');
        if (!empty($stored)) $oauthClientSecret = _decrypt($stored, $key);
    }
    if (str_starts_with($iracingEmail, '****') || empty($iracingEmail)) {
        $stored = $db->getSetting('iracing_email');
        if (!empty($stored)) $iracingEmail = _decrypt($stored, $key);
    }
    if (str_starts_with($iracingPassword, '****') || empty($iracingPassword)) {
        $stored = $db->getSetting('iracing_password');
        if (!empty($stored)) $iracingPassword = _decrypt($stored, $key);
    }

    // Validate all 4 fields
    if (empty($oauthClientId) || empty($oauthClientSecret)) {
        jsonError('OAuth Client ID and Client Secret are required. Register at https://oauth.iracing.com/', 400);
    }
    if (empty($iracingEmail) || empty($iracingPassword)) {
        jsonError('iRacing email and password are required.', 400);
    }

    // Store credentials encrypted for future use
    $db->setSetting('oauth_client_id', _encrypt($oauthClientId, $key));
    $db->setSetting('oauth_client_secret', _encrypt($oauthClientSecret, $key));
    $db->setSetting('iracing_email', _encrypt($iracingEmail, $key));
    $db->setSetting('iracing_password', _encrypt($iracingPassword, $key));

    $postFields = http_build_query([
        'grant_type'    => 'password_limited',
        'client_id'     => $oauthClientId,
        'client_secret' => $oauthClientSecret,
        'username'      => $iracingEmail,
        'password'      => $iracingPassword,
    ]);
}

// ============================================================================
// Call the OAuth token endpoint
// ============================================================================

try {
    $tokenUrl = IRACING_OAUTH_TOKEN_URL;

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $tokenUrl,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $postFields,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/x-www-form-urlencoded',
            'Accept: application/json',
        ],
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response  = curl_exec($ch);
    $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    // Handle cURL errors
    if ($response === false) {
        jsonError("Connection to iRacing OAuth failed: {$curlError}", 502);
    }

    // Parse the response
    $data = json_decode($response, true);

    // Check for success
    if ($httpCode >= 200 && $httpCode < 300 && !empty($data['access_token'])) {
        // Store tokens
        $db->setSetting('oauth_access_token', _encrypt($data['access_token'], $key));
        $db->setSetting('oauth_token_type', $data['token_type'] ?? 'Bearer');
        $db->setSetting('oauth_authenticated_at', now());

        $expiresIn = (int)($data['expires_in'] ?? 600);
        $db->setSetting('oauth_token_expires_at', date('Y-m-d H:i:s', time() + $expiresIn));

        if (!empty($data['refresh_token'])) {
            $db->setSetting('oauth_refresh_token', _encrypt($data['refresh_token'], $key));
            $refreshExpiresIn = (int)($data['refresh_token_expires_in'] ?? 3600);
            $db->setSetting('oauth_refresh_expires_at', date('Y-m-d H:i:s', time() + $refreshExpiresIn));
        }

        jsonResponse([
            'success'    => true,
            'expires_in' => $expiresIn,
            'token_type' => $data['token_type'] ?? 'Bearer',
            'message'    => 'Authenticated successfully with iRacing OAuth 2.0.',
        ]);
    } else {
        // Authentication failed
        $errorMsg = $data['error_description'] ?? $data['error'] ?? $data['message'] ?? "HTTP {$httpCode}";
        $extra = [];
        if (DEBUG_MODE) {
            $extra['http_code'] = $httpCode;
            $extra['raw_response'] = mb_substr((string)$response, 0, 500);
        }
        jsonError("Authentication failed: {$errorMsg}", 401, $extra);
    }

} catch (Throwable $e) {
    if (DEBUG_MODE) {
        jsonError("Authentication error: {$e->getMessage()}", 500);
    }
    jsonError('An internal error occurred during authentication.', 500);
}

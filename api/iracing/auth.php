<?php
/**
 * IRSDK SOF Agent — iRacing OAuth2 Authentication Endpoint
 *
 * Handles OAuth2 authentication with the iRacing Data API.
 * Receives client credentials, exchanges them for an access token,
 * stores the encrypted token in the settings table, and returns
 * the connection status.
 *
 * Method: POST
 * Body: { "client_id": "...", "client_secret": "..." }
 *
 * Response (success):
 *   { "success": true, "expires_in": 3600, "message": "Authenticated successfully" }
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

$clientId     = trim($input['client_id'] ?? '');
$clientSecret = trim($input['client_secret'] ?? '');

// If credentials are masked (from a reloaded settings page), read stored ones from DB
if (str_starts_with($clientId, '****') || str_starts_with($clientSecret, '****')
    || empty($clientId) || empty($clientSecret)) {

    $dbForCreds    = Database::getInstance();
    $encKeyForCreds = _getEncryptionKey();

    $storedId     = $dbForCreds->getSetting('oauth_client_id');
    $storedSecret = $dbForCreds->getSetting('oauth_client_secret');

    if ((str_starts_with($clientId, '****') || empty($clientId)) && !empty($storedId)) {
        $clientId = _decrypt($storedId, $encKeyForCreds);
    }
    if ((str_starts_with($clientSecret, '****') || empty($clientSecret)) && !empty($storedSecret)) {
        $clientSecret = _decrypt($storedSecret, $encKeyForCreds);
    }
}

// Validate required fields
if (empty($clientId) || empty($clientSecret)) {
    jsonError('Both client_id and client_secret are required. Enter your iRacing email and password.', 400);
}

// ============================================================================
// Exchange credentials for an access token
// ============================================================================

try {
    // Build the token request
    // iRacing uses email/password hash authentication via their auth endpoint.
    // The client_id and client_secret here represent the user's iRacing credentials
    // (email and encoded password) for the members API.
    $tokenUrl = IRACING_OAUTH_TOKEN_URL;

    // Prepare the authentication payload
    // iRacing expects Base64(SHA256(password + email.lowercase))
    $encodedPassword = base64_encode(
        hash('sha256', $clientSecret . strtolower($clientId), true)
    );

    $postData = json_encode([
        'email'    => $clientId,
        'password' => $encodedPassword,
    ]);

    // Initialize cURL for the token request
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $tokenUrl,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $postData,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_FOLLOWLOCATION => true,
        // Keep POST method through 301/302 redirects (prevents POST→GET conversion)
        CURLOPT_POSTREDIR      => CURL_REDIR_POST_ALL,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'User-Agent: IRSDK-SOF-Agent/1.0',
        ],
        // Enable cookie handling for iRacing session cookies
        CURLOPT_COOKIEJAR      => sys_get_temp_dir() . '/irsdk_sof_cookies.txt',
        CURLOPT_COOKIEFILE     => sys_get_temp_dir() . '/irsdk_sof_cookies.txt',
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response   = curl_exec($ch);
    $httpCode   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError  = curl_error($ch);
    curl_close($ch);

    // Handle cURL errors
    if ($response === false) {
        jsonError("Connection to iRacing failed: {$curlError}", 502);
    }

    // Parse the response
    $data = json_decode($response, true);

    // Check for authentication success
    // iRacing returns a JSON body with authcode on success, or an error message
    if ($httpCode >= 200 && $httpCode < 300) {
        // Authentication succeeded — store the credentials (encrypted) in settings
        $db = Database::getInstance();

        // Encrypt sensitive data before storing
        $encryptionKey = _getEncryptionKey();

        $encryptedId     = _encrypt($clientId, $encryptionKey);
        $encryptedSecret = _encrypt($clientSecret, $encryptionKey);

        $db->setSetting('oauth_client_id', $encryptedId);
        $db->setSetting('oauth_client_secret', $encryptedSecret);
        $db->setSetting('oauth_authenticated_at', now());

        // Store authcode/token if present
        if (!empty($data['authcode'])) {
            $db->setSetting('oauth_authcode', _encrypt($data['authcode'], $encryptionKey));
        }

        // Determine expiration (default 1 hour)
        $expiresIn = $data['expires_in'] ?? 3600;
        $db->setSetting('oauth_expires_at', date('Y-m-d H:i:s', time() + (int)$expiresIn));

        jsonResponse([
            'success'    => true,
            'expires_in' => $expiresIn,
            'message'    => 'Authenticated successfully with iRacing.',
        ]);
    } else {
        // Authentication failed
        $errorMsg = $data['message'] ?? $data['error'] ?? "HTTP {$httpCode}";
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

// Encryption functions are in crypto.php (shared with proxy.php)

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

// Set CORS headers and handle preflight
setCorsHeaders();

// Only accept POST requests
requireMethod('POST');

// Parse the JSON request body
$input = getJsonInput();

$clientId     = trim($input['client_id'] ?? '');
$clientSecret = trim($input['client_secret'] ?? '');

// Validate required fields
if (empty($clientId) || empty($clientSecret)) {
    jsonError('Both client_id and client_secret are required.', 400);
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

    $postData = http_build_query([
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
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/x-www-form-urlencoded',
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
        jsonError("Authentication failed: {$errorMsg}", 401);
    }

} catch (Throwable $e) {
    if (DEBUG_MODE) {
        jsonError("Authentication error: {$e->getMessage()}", 500);
    }
    jsonError('An internal error occurred during authentication.', 500);
}

// ============================================================================
// Encryption helpers
// ============================================================================

/**
 * Get or generate the encryption key for sensitive settings.
 * The key is stored in a file outside the web root or derived from
 * a constant. For simplicity in this local application, we use a
 * deterministic key derived from the database path.
 *
 * @return string 32-byte encryption key
 */
function _getEncryptionKey(): string
{
    // Use a fixed key derivation — in production, use a proper key management system
    $seed = DB_PATH . '::irsdk_sof_encryption_key';
    return hash('sha256', $seed, true); // 32 bytes for AES-256
}

/**
 * Encrypt a plaintext string using AES-256-CBC.
 *
 * @param  string $plaintext The text to encrypt
 * @param  string $key       32-byte encryption key
 * @return string            Base64-encoded ciphertext (IV prepended)
 */
function _encrypt(string $plaintext, string $key): string
{
    $cipher = 'aes-256-cbc';
    $ivLen  = openssl_cipher_iv_length($cipher);
    $iv     = openssl_random_pseudo_bytes($ivLen);

    $encrypted = openssl_encrypt($plaintext, $cipher, $key, OPENSSL_RAW_DATA, $iv);
    if ($encrypted === false) {
        throw new RuntimeException('Encryption failed.');
    }

    // Prepend IV to ciphertext for storage
    return base64_encode($iv . $encrypted);
}

/**
 * Decrypt a Base64-encoded ciphertext string using AES-256-CBC.
 *
 * @param  string $ciphertext Base64-encoded ciphertext (IV prepended)
 * @param  string $key        32-byte encryption key
 * @return string             Decrypted plaintext
 */
function _decrypt(string $ciphertext, string $key): string
{
    $cipher = 'aes-256-cbc';
    $ivLen  = openssl_cipher_iv_length($cipher);
    $raw    = base64_decode($ciphertext);

    if ($raw === false || strlen($raw) < $ivLen) {
        throw new RuntimeException('Invalid ciphertext.');
    }

    $iv        = substr($raw, 0, $ivLen);
    $encrypted = substr($raw, $ivLen);

    $decrypted = openssl_decrypt($encrypted, $cipher, $key, OPENSSL_RAW_DATA, $iv);
    if ($decrypted === false) {
        throw new RuntimeException('Decryption failed.');
    }

    return $decrypted;
}

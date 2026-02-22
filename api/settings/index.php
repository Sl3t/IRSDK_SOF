<?php
/**
 * IRSDK SOF Agent — Settings CRUD Endpoint
 *
 * Provides read and write access to the application settings stored in
 * the settings table of the Access database.
 *
 * Methods:
 *   GET  — Return all settings (sensitive values are masked)
 *   POST — Update one or more settings. Body: { "key1": "value1", "key2": "value2", ... }
 *
 * Sensitive keys (oauth_client_id, oauth_client_secret, oauth_authcode) are
 * encrypted before storage and masked (showing only last 4 chars) in GET responses.
 *
 * GET Response:
 *   { "my_name": "John Doe", "irating_target": "2500", "oauth_client_id": "****abcd", ... }
 *
 * POST Response:
 *   { "success": true, "updated": 5, "message": "Settings saved." }
 *
 * @package IRSDK_SOF
 */

declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';

// Set CORS headers and handle preflight
setCorsHeaders();

// Accept GET and POST
requireMethod(['GET', 'POST']);

$db = Database::getInstance();

// ============================================================================
// List of keys that contain sensitive data and should be masked in GET
// ============================================================================

$sensitiveKeys = [
    'oauth_client_id',
    'oauth_client_secret',
    'oauth_authcode',
];

// ============================================================================
// GET — Return all settings (with masking for sensitive values)
// ============================================================================

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        // Fetch all settings from the database
        $rows = $db->fetchAll("SELECT setting_key, setting_value FROM settings");

        $settings = [];
        foreach ($rows as $row) {
            $key   = $row['setting_key'];
            $value = $row['setting_value'];

            // Mask sensitive values — show only the last 4 characters
            if (in_array($key, $sensitiveKeys, true) && !empty($value)) {
                $settings[$key] = _maskValue($value);
            } else {
                $settings[$key] = $value;
            }
        }

        jsonResponse($settings);

    } catch (Throwable $e) {
        if (DEBUG_MODE) {
            jsonError("Failed to retrieve settings: {$e->getMessage()}", 500);
        }
        jsonError('An internal error occurred while reading settings.', 500);
    }
}

// ============================================================================
// POST — Update settings
// ============================================================================

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = getJsonInput();

    if (empty($input)) {
        jsonError('Request body must be a non-empty JSON object of key-value pairs.', 400);
    }

    try {
        $updatedCount = 0;

        foreach ($input as $key => $value) {
            // Sanitize key name (allow only alphanumeric, underscores, hyphens)
            $key = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$key);
            if (empty($key)) continue;

            // Convert non-string values to string for storage
            $strValue = is_array($value) || is_object($value)
                ? json_encode($value, JSON_UNESCAPED_UNICODE)
                : (string)$value;

            // Encrypt sensitive values before storing
            if (in_array($key, $sensitiveKeys, true) && !empty($strValue)) {
                // Skip if the value looks like it is already masked (unchanged)
                if (str_starts_with($strValue, '****')) {
                    continue; // Do not overwrite with the masked placeholder
                }
                $strValue = _encryptValue($strValue);
            }

            // Upsert the setting
            $db->setSetting($key, $strValue);
            $updatedCount++;
        }

        jsonResponse([
            'success' => true,
            'updated' => $updatedCount,
            'message' => "Settings saved ({$updatedCount} updated).",
        ]);

    } catch (Throwable $e) {
        if (DEBUG_MODE) {
            jsonError("Failed to save settings: {$e->getMessage()}", 500);
        }
        jsonError('An internal error occurred while saving settings.', 500);
    }
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Mask a sensitive value, showing only the last 4 characters.
 * If the value is encrypted (Base64), it is decrypted first to get the
 * original plaintext length, but only the masked version is returned.
 *
 * @param  string $value The stored value (possibly encrypted)
 * @return string        Masked string like "****abcd"
 */
function _maskValue(string $value): string
{
    // Try to decrypt to get the actual plaintext for proper masking
    try {
        $key       = _getSettingsEncryptionKey();
        $plaintext = _decryptValue($value, $key);
        $len       = strlen($plaintext);

        if ($len <= 4) {
            return '****';
        }

        return '****' . substr($plaintext, -4);
    } catch (Throwable $e) {
        // If decryption fails, mask the raw stored value
        $len = strlen($value);
        if ($len <= 4) return '****';
        return '****' . substr($value, -4);
    }
}

/**
 * Encrypt a setting value using AES-256-CBC.
 *
 * @param  string $plaintext The value to encrypt
 * @return string            Base64-encoded ciphertext
 */
function _encryptValue(string $plaintext): string
{
    $key    = _getSettingsEncryptionKey();
    $cipher = 'aes-256-cbc';
    $ivLen  = openssl_cipher_iv_length($cipher);
    $iv     = openssl_random_pseudo_bytes($ivLen);

    $encrypted = openssl_encrypt($plaintext, $cipher, $key, OPENSSL_RAW_DATA, $iv);
    if ($encrypted === false) {
        throw new RuntimeException('Encryption failed.');
    }

    return base64_encode($iv . $encrypted);
}

/**
 * Decrypt a setting value using AES-256-CBC.
 *
 * @param  string $ciphertext Base64-encoded ciphertext
 * @param  string $key        Encryption key
 * @return string             Decrypted plaintext
 */
function _decryptValue(string $ciphertext, string $key): string
{
    $cipher = 'aes-256-cbc';
    $ivLen  = openssl_cipher_iv_length($cipher);
    $raw    = base64_decode($ciphertext);

    if ($raw === false || strlen($raw) < $ivLen) {
        throw new RuntimeException('Invalid ciphertext format.');
    }

    $iv        = substr($raw, 0, $ivLen);
    $encrypted = substr($raw, $ivLen);

    $decrypted = openssl_decrypt($encrypted, $cipher, $key, OPENSSL_RAW_DATA, $iv);
    if ($decrypted === false) {
        throw new RuntimeException('Decryption failed.');
    }

    return $decrypted;
}

/**
 * Get the encryption key for settings values.
 * Derived from the database path for consistency with auth.php.
 *
 * @return string 32-byte encryption key
 */
function _getSettingsEncryptionKey(): string
{
    $seed = DB_PATH . '::irsdk_sof_encryption_key';
    return hash('sha256', $seed, true);
}

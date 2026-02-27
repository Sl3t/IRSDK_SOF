<?php
/**
 * IRSDK SOF Agent — Shared Encryption/Decryption Helpers
 *
 * Provides AES-256-CBC encryption and decryption functions used by
 * auth.php, proxy.php, and settings/index.php.
 *
 * @package IRSDK_SOF
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';

/**
 * Get or generate the encryption key for sensitive settings.
 * Derived from the database path for deterministic key generation.
 *
 * @return string 32-byte encryption key
 */
function _getEncryptionKey(): string
{
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

<?php
/**
 * One-time setup script to insert user identity + API credentials into the database.
 * Run via: http://localhost/IRSDK_SOF/api/setup-identity.php
 * DELETE THIS FILE after use — it contains logic to store sensitive credentials.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/iracing/crypto.php';

$db  = Database::getInstance();
$key = _getEncryptionKey();

// ---- Identity ----
$db->setSetting('my_iracing_user_id', '677180');
$db->setSetting('my_name', 'Paul Lavoisiere');

// ---- API credentials (encrypted) ----
$email    = 'paul.lavoisiere@sl3t.com';
$password = '$106JericaLane';

$db->setSetting('oauth_client_id',     _encrypt($email, $key));
$db->setSetting('oauth_client_secret',  _encrypt($password, $key));

// ---- Driver record ----
$existing = $db->fetchOne(
    "SELECT id FROM drivers WHERE iracing_user_id = ?",
    [677180]
);

if ($existing === null) {
    $db->insert('drivers', [
        'iracing_user_id' => 677180,
        'user_name'       => 'Paul Lavoisiere',
        'is_me'           => 1,
        'updated_at'      => date('Y-m-d H:i:s'),
    ]);
    $driverMsg = 'Driver record created.';
} else {
    $db->update('drivers', ['is_me' => 1, 'user_name' => 'Paul Lavoisiere'], 'iracing_user_id = ?', [677180]);
    $driverMsg = 'Driver record updated.';
}

// ---- Verify storage ----
$storedId     = $db->getSetting('oauth_client_id');
$storedSecret = $db->getSetting('oauth_client_secret');
$decryptedId  = _decrypt($storedId, $key);

header('Content-Type: application/json');
echo json_encode([
    'success'  => true,
    'message'  => "All credentials saved and encrypted. {$driverMsg}",
    'identity' => [
        'user_id' => $db->getSetting('my_iracing_user_id'),
        'name'    => $db->getSetting('my_name'),
    ],
    'api' => [
        'email_stored'    => '****' . substr($decryptedId, -4),
        'password_stored' => true,
    ],
]);

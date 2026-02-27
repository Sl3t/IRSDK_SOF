<?php
/**
 * One-time setup script to insert user identity into the database.
 * Run via: http://localhost/IRSDK_SOF/api/setup-identity.php
 * Can be safely deleted after use.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

$db = Database::getInstance();

// Insert or update identity settings
$db->setSetting('my_iracing_user_id', '677180');
$db->setSetting('my_name', 'Paul Lavoisiere');

// Also insert the driver record
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

header('Content-Type: application/json');
echo json_encode([
    'success' => true,
    'message' => "Identity saved: Paul Lavoisiere (#677180). {$driverMsg}",
    'settings' => [
        'my_iracing_user_id' => $db->getSetting('my_iracing_user_id'),
        'my_name'            => $db->getSetting('my_name'),
    ],
]);

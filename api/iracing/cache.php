<?php
/**
 * IRSDK SOF Agent — Cache Management Endpoint
 *
 * Provides cache management operations for the api_cache table.
 * Supports clearing all cache, clearing only expired entries,
 * or clearing cache for a specific endpoint.
 *
 * Method: POST
 * Body: { "action": "clear_all" | "clear_expired" | "clear_endpoint", "endpoint": "..." }
 *
 * Actions:
 *   clear_all       — Delete all entries from api_cache
 *   clear_expired   — Delete only entries where expires_at <= NOW()
 *   clear_endpoint  — Delete entries matching a specific endpoint (requires "endpoint" field)
 *
 * Response:
 *   { "success": true, "deleted": <count>, "message": "..." }
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

$action   = trim($input['action'] ?? '');
$endpoint = trim($input['endpoint'] ?? '');

// Validate the action
$validActions = ['clear_all', 'clear_expired', 'clear_endpoint'];
if (!in_array($action, $validActions, true)) {
    jsonError(
        "Invalid action: '{$action}'. Expected one of: " . implode(', ', $validActions),
        400
    );
}

// ============================================================================
// Execute the requested cache operation
// ============================================================================

$db = Database::getInstance();

try {
    $deleted = 0;
    $message = '';

    switch ($action) {
        case 'clear_all':
            // Delete all cache entries
            $stmt = $db->query("DELETE FROM api_cache WHERE 1=1");
            $deleted = $stmt->rowCount();
            $message = "Cleared all cache entries ({$deleted} deleted).";
            break;

        case 'clear_expired':
            // Delete only expired entries
            $deleted = $db->purgeExpiredCache();
            $message = "Purged expired cache entries ({$deleted} deleted).";
            break;

        case 'clear_endpoint':
            // Delete cache for a specific endpoint
            if (empty($endpoint)) {
                jsonError('The "endpoint" field is required for clear_endpoint action.', 400);
            }

            $stmt = $db->query(
                "DELETE FROM api_cache WHERE endpoint = ?",
                [$endpoint]
            );
            $deleted = $stmt->rowCount();
            $message = "Cleared cache for endpoint '{$endpoint}' ({$deleted} deleted).";
            break;
    }

    jsonResponse([
        'success' => true,
        'deleted' => $deleted,
        'message' => $message,
    ]);

} catch (Throwable $e) {
    if (DEBUG_MODE) {
        jsonError("Cache operation failed: {$e->getMessage()}", 500);
    }
    jsonError('An internal error occurred while managing the cache.', 500);
}

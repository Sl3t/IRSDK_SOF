<?php
/**
 * IRSDK SOF Agent — Series List Endpoint
 *
 * GET /api/series/list.php
 *
 * Returns all series stored in the favorite_series table.
 * This table acts as the local catalogue of known series; entries are added
 * automatically when the iRacing API is queried, or manually by the user.
 *
 * Query parameters:
 *   - category (optional): Filter by category (road, oval, dirt_road, dirt_oval).
 *
 * Response:
 *   { "series": [{ "id": 1, "iracing_series_id": 234, "series_name": "...", ... }] }
 *
 * @package IRSDK_SOF
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

// CORS and method validation.
setCorsHeaders();
requireMethod('GET');

// ---------------------------------------------------------------------------
// Parse query parameters
// ---------------------------------------------------------------------------

$category = optionalParam('category');

// ---------------------------------------------------------------------------
// Build the query
// ---------------------------------------------------------------------------

$db     = Database::getInstance();
$params = [];

$sql = "SELECT
            id,
            iracing_series_id,
            series_name,
            category,
            license_group,
            is_favorite,
            last_sof_avg,
            current_track,
            current_car_classes,
            race_interval_minutes,
            updated_at
        FROM favorite_series";

if ($category !== null && $category !== '') {
    $sql     .= " WHERE LOWER(category) = ?";
    $params[] = strtolower($category);
}

$sql .= " ORDER BY series_name ASC";

$series = $db->fetchAll($sql, $params);

// ---------------------------------------------------------------------------
// Format boolean fields
// ---------------------------------------------------------------------------

foreach ($series as &$row) {
    $row['is_favorite'] = (bool) $row['is_favorite'];
}
unset($row);

// ---------------------------------------------------------------------------
// Return response
// ---------------------------------------------------------------------------

jsonResponse([
    'series' => $series,
    'count'  => count($series),
]);

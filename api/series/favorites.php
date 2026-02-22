<?php
/**
 * IRSDK SOF Agent — Series Favorites Endpoint
 *
 * GET  /api/series/favorites.php — Return only favorite series.
 * POST /api/series/favorites.php — Toggle a series as favorite (upsert).
 *
 * POST body:
 *   {
 *     "series_id": 123,
 *     "is_favorite": true,
 *     "series_name": "VRS GT Sprint Series",
 *     "category": "road",
 *     "license_group": "B"
 *   }
 *
 * GET response:
 *   { "favorites": [...], "count": 5 }
 *
 * POST response:
 *   { "success": true, "action": "inserted"|"updated", "series_id": 123, "is_favorite": true }
 *
 * @package IRSDK_SOF
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

// CORS and method validation.
setCorsHeaders();
requireMethod(['GET', 'POST']);

$db = Database::getInstance();

// ---------------------------------------------------------------------------
// GET — Return favorite series
// ---------------------------------------------------------------------------

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $favorites = $db->fetchAll(
        "SELECT
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
        FROM favorite_series
        WHERE is_favorite = TRUE
        ORDER BY series_name ASC"
    );

    // Format boolean fields (Access YESNO returns -1/0).
    foreach ($favorites as &$row) {
        $row['is_favorite'] = (bool) $row['is_favorite'];
    }
    unset($row);

    jsonResponse([
        'favorites' => $favorites,
        'count'     => count($favorites),
    ]);
}

// ---------------------------------------------------------------------------
// POST — Toggle favorite (upsert)
// ---------------------------------------------------------------------------

$input = getJsonInput();

// Validate required fields.
$seriesId = $input['series_id'] ?? null;
if ($seriesId === null) {
    jsonError('Missing required field: series_id', 400);
}
$seriesId = (int) $seriesId;

$isFavorite   = (bool) ($input['is_favorite'] ?? true);
$seriesName   = sanitize($input['series_name'] ?? '');
$category     = sanitize($input['category'] ?? '');
$licenseGroup = sanitize($input['license_group'] ?? '');

// Check if this series already exists in the table.
$existing = $db->fetchOne(
    "SELECT id FROM favorite_series WHERE iracing_series_id = ?",
    [$seriesId]
);

$now = now();

if ($existing !== null) {
    // Update existing entry.
    $updateData = ['is_favorite' => $isFavorite ? -1 : 0, 'updated_at' => $now];

    // Only update name/category/license if provided (non-empty).
    if ($seriesName !== '') {
        $updateData['series_name'] = $seriesName;
    }
    if ($category !== '') {
        $updateData['category'] = $category;
    }
    if ($licenseGroup !== '') {
        $updateData['license_group'] = $licenseGroup;
    }

    $db->update('favorite_series', $updateData, 'iracing_series_id = ?', [$seriesId]);

    jsonResponse([
        'success'     => true,
        'action'      => 'updated',
        'series_id'   => $seriesId,
        'is_favorite' => $isFavorite,
    ]);
} else {
    // Insert new entry.
    if ($seriesName === '') {
        jsonError('series_name is required when adding a new series.', 400);
    }

    $db->insert('favorite_series', [
        'iracing_series_id' => $seriesId,
        'series_name'       => $seriesName,
        'category'          => $category,
        'license_group'     => $licenseGroup,
        'is_favorite'       => $isFavorite ? -1 : 0,
        'updated_at'        => $now,
    ]);

    jsonResponse([
        'success'     => true,
        'action'      => 'inserted',
        'series_id'   => $seriesId,
        'is_favorite' => $isFavorite,
    ], 201);
}

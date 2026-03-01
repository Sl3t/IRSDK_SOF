<?php
/**
 * IRSDK SOF Agent — Series Update Endpoint
 *
 * POST /api/series/update.php
 * Body: { "series_id": 280, "baseline_offset_minutes": 120, "active_poll_offset_minutes": 20 }
 *
 * Updates the H-timestamp parameters for a tracked series.
 *
 * @package IRSDK_SOF
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

setCorsHeaders();
requireMethod('POST');

$input = getJsonInput();

$seriesId = (int) ($input['series_id'] ?? 0);
if ($seriesId <= 0) {
    jsonError('series_id is required and must be > 0', 400);
}

$db = Database::getInstance();

// Check series exists
$existing = $db->fetchOne(
    "SELECT id FROM favorite_series WHERE iracing_series_id = ?",
    [$seriesId]
);

if (!$existing) {
    jsonError("Series not found: {$seriesId}", 404);
}

// Build update data from allowed fields
$allowedFields = [
    'baseline_offset_minutes',
    'active_poll_offset_minutes',
];

$updateData = [];
foreach ($allowedFields as $field) {
    if (isset($input[$field])) {
        $value = (int) $input[$field];
        if ($value < 0) {
            jsonError("{$field} must be >= 0", 400);
        }
        $updateData[$field] = $value;
    }
}

if (empty($updateData)) {
    jsonError('No valid fields to update', 400);
}

$updateData['updated_at'] = now();

$affected = $db->update('favorite_series', $updateData, 'iracing_series_id = ?', [$seriesId]);

jsonResponse([
    'success' => true,
    'series_id' => $seriesId,
    'updated_fields' => array_keys($updateData),
    'affected_rows' => $affected,
]);

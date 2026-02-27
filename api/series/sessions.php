<?php
/**
 * IRSDK SOF Agent — Series Active Sessions Endpoint
 *
 * GET /api/series/sessions.php?series_id=X
 *
 * Returns recorded sessions for a given series. In the future this will
 * integrate with the iRacing race_guide API to show upcoming sessions.
 *
 * Query parameters:
 *   - series_id (required): The iRacing series ID.
 *   - limit     (optional): Number of rows (default 20, max 100).
 *
 * Response:
 *   { "series_id": 123, "sessions": [...], "count": 5 }
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

$seriesId = requireParam('series_id');
$limit    = (int) (optionalParam('limit', '20') ?? '20');
$limit    = (int) clampValue((float) $limit, 1, 100);

// ---------------------------------------------------------------------------
// Fetch sessions for this series
// ---------------------------------------------------------------------------

$db = Database::getInstance();

$sql = "SELECT
            id,
            iracing_subsession_id,
            session_type,
            is_official,
            series_name,
            track_name,
            track_config,
            car_class,
            sof,
            driver_count,
            min_irating,
            max_irating,
            median_irating,
            std_dev_irating,
            my_irating_at_time,
            track_temp_c,
            air_temp_c,
            track_wetness,
            decision,
            decision_score,
            created_at
        FROM sessions
        WHERE series_id = ?
        ORDER BY created_at DESC
        LIMIT {$limit}";

$sessions = $db->fetchAll($sql, [(int) $seriesId]);

// Format boolean fields.
foreach ($sessions as &$session) {
    $session['is_official'] = (bool) $session['is_official'];
}
unset($session);

// ---------------------------------------------------------------------------
// Also fetch the series metadata if available
// ---------------------------------------------------------------------------

$seriesInfo = $db->fetchOne(
    "SELECT
        iracing_series_id,
        series_name,
        category,
        license_group,
        current_track,
        current_car_classes,
        race_interval_minutes
    FROM favorite_series
    WHERE iracing_series_id = ?",
    [(int) $seriesId]
);

// ---------------------------------------------------------------------------
// Return response
// ---------------------------------------------------------------------------

jsonResponse([
    'series_id'   => (int) $seriesId,
    'series_info' => $seriesInfo,
    'sessions'    => $sessions,
    'count'       => count($sessions),
]);

<?php
/**
 * IRSDK SOF Agent — Session History Endpoint
 *
 * GET /api/session/history.php
 *
 * Returns a paginated list of previously recorded sessions from the database,
 * ordered by creation date (newest first).
 *
 * Query parameters:
 *   - series_id (optional): Filter by series ID.
 *   - limit     (optional): Number of rows to return (default 50, max 200).
 *   - offset    (optional): Pagination offset (default 0).
 *
 * Response:
 *   { "sessions": [...], "total": 123, "limit": 50, "offset": 0 }
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

$seriesId = optionalParam('series_id');
$limit    = (int) (optionalParam('limit', '50') ?? '50');
$offset   = (int) (optionalParam('offset', '0') ?? '0');

// Clamp limit to a reasonable range.
$limit  = (int) clampValue((float) $limit, 1, 200);
$offset = max(0, $offset);

// ---------------------------------------------------------------------------
// Build the query
// ---------------------------------------------------------------------------

$db = Database::getInstance();

$whereClause  = '';
$countWhere   = '';
$params       = [];
$countParams  = [];

if ($seriesId !== null && $seriesId !== '') {
    $whereClause = 'WHERE s.series_id = ?';
    $countWhere  = 'WHERE series_id = ?';
    $params[]    = (int) $seriesId;
    $countParams[] = (int) $seriesId;
}

// ---------------------------------------------------------------------------
// Get total count for pagination
// ---------------------------------------------------------------------------

$countSql = "SELECT COUNT(*) AS total FROM sessions {$countWhere}";
$countRow = $db->fetchOne($countSql, $countParams);
$total    = (int) ($countRow['total'] ?? 0);

// ---------------------------------------------------------------------------
// Fetch sessions
// ---------------------------------------------------------------------------

$sql = "SELECT
            s.id,
            s.iracing_subsession_id,
            s.session_type,
            s.is_official,
            s.series_id,
            s.series_name,
            s.track_name,
            s.track_config,
            s.car_class,
            s.sof,
            s.driver_count,
            s.min_irating,
            s.max_irating,
            s.median_irating,
            s.std_dev_irating,
            s.my_irating_at_time,
            s.track_temp_c,
            s.air_temp_c,
            s.track_wetness,
            s.weather_declared_wet,
            s.grip_state,
            s.skies,
            s.wind_speed_ms,
            s.humidity_pct,
            s.decision,
            s.decision_score,
            s.created_at
        FROM sessions AS s
        {$whereClause}
        ORDER BY s.created_at DESC
        LIMIT {$limit} OFFSET {$offset}";
$sessions = $db->fetchAll($sql, $params);

// ---------------------------------------------------------------------------
// Format boolean fields
// ---------------------------------------------------------------------------

foreach ($sessions as &$session) {
    $session['is_official']          = (bool) $session['is_official'];
    $session['weather_declared_wet'] = (bool) $session['weather_declared_wet'];
}
unset($session);

// ---------------------------------------------------------------------------
// Return response
// ---------------------------------------------------------------------------

jsonResponse([
    'sessions' => $sessions,
    'total'    => $total,
    'limit'    => $limit,
    'offset'   => $offset,
]);

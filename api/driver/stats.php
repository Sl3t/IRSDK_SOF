<?php
/**
 * IRSDK SOF Agent — Driver Recent Races Endpoint
 *
 * GET /api/driver/stats.php?driver_id=X
 *
 * Returns the last 20 sessions a driver participated in by joining the
 * session_drivers table with the sessions table.
 *
 * Query parameters:
 *   - driver_id (required): Internal driver ID from the drivers table.
 *   - limit     (optional): Number of sessions (default 20, max 50).
 *
 * Response:
 *   {
 *     "driver_id": 42,
 *     "driver": { "user_name": "...", "current_irating": 2200, ... },
 *     "recent_sessions": [ { "session_id": 1, "track_name": "...", ... } ],
 *     "count": 15,
 *     "summary": { "avg_finish": 8.3, "avg_incidents": 3.1, "races_count": 15 }
 *   }
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

$driverId = requireParam('driver_id');
$limit    = (int) (optionalParam('limit', '20') ?? '20');
$limit    = (int) clampValue((float) $limit, 1, 50);

// ---------------------------------------------------------------------------
// Fetch the driver record
// ---------------------------------------------------------------------------

$db = Database::getInstance();

$driver = $db->fetchOne(
    "SELECT
        id, iracing_user_id, user_name, current_irating, current_sr,
        license_class, club_name, division, is_me, tag, updated_at
    FROM drivers
    WHERE id = ?",
    [(int) $driverId]
);

if ($driver === null) {
    jsonError("Driver not found with id: {$driverId}", 404);
}

$driver['is_me'] = (bool) $driver['is_me'];

// ---------------------------------------------------------------------------
// Fetch recent sessions for this driver
// ---------------------------------------------------------------------------
// Note: Access does not support LIMIT/OFFSET. We use TOP and join manually.
// ---------------------------------------------------------------------------

$sql = "SELECT TOP {$limit}
            sd.id AS session_driver_id,
            sd.session_id,
            sd.irating AS irating_at_time,
            sd.license_string,
            sd.car_number,
            sd.car_name,
            sd.track_experience_score,
            sd.avg_pace_on_track,
            sd.avg_incidents_on_track,
            sd.races_on_track,
            sd.danger_score,
            sd.finish_position,
            sd.incidents,
            s.session_type,
            s.is_official,
            s.series_name,
            s.track_name,
            s.track_config,
            s.car_class,
            s.sof,
            s.driver_count,
            s.decision,
            s.decision_score,
            s.created_at AS session_date
        FROM session_drivers AS sd
        INNER JOIN sessions AS s ON sd.session_id = s.id
        WHERE sd.driver_id = ?
        ORDER BY s.created_at DESC";

$recentSessions = $db->fetchAll($sql, [(int) $driverId]);

// Format booleans.
foreach ($recentSessions as &$row) {
    $row['is_official'] = (bool) $row['is_official'];
}
unset($row);

// ---------------------------------------------------------------------------
// Compute summary statistics from recent sessions
// ---------------------------------------------------------------------------

$summary = [
    'races_count'     => count($recentSessions),
    'avg_finish'      => null,
    'avg_incidents'   => null,
    'best_finish'     => null,
    'worst_finish'    => null,
    'total_incidents' => 0,
    'dnf_count'       => 0,
];

$finishPositions = [];
$incidentCounts  = [];

foreach ($recentSessions as $row) {
    if ($row['finish_position'] !== null) {
        $finishPositions[] = (int) $row['finish_position'];
    }
    if ($row['incidents'] !== null) {
        $incidentCounts[] = (int) $row['incidents'];
        $summary['total_incidents'] += (int) $row['incidents'];
    }
}

if (!empty($finishPositions)) {
    $summary['avg_finish']  = round(array_sum($finishPositions) / count($finishPositions), 1);
    $summary['best_finish'] = min($finishPositions);
    $summary['worst_finish'] = max($finishPositions);
}

if (!empty($incidentCounts)) {
    $summary['avg_incidents'] = round(array_sum($incidentCounts) / count($incidentCounts), 1);
}

// ---------------------------------------------------------------------------
// Return response
// ---------------------------------------------------------------------------

jsonResponse([
    'driver_id'       => (int) $driverId,
    'driver'          => $driver,
    'recent_sessions' => $recentSessions,
    'count'           => count($recentSessions),
    'summary'         => $summary,
]);

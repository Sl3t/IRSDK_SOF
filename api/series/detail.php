<?php
/**
 * IRSDK SOF Agent — Series Detail Endpoint
 *
 * GET /api/series/detail.php?series_id=X
 *
 * Returns full series metadata (including H-timestamp parameters)
 * and upcoming race sessions from series_race_sessions table.
 *
 * @package IRSDK_SOF
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';

setCorsHeaders();
requireMethod('GET');

$seriesId = (int) requireParam('series_id');

$db = Database::getInstance();

// ---------------------------------------------------------------------------
// Fetch series metadata
// ---------------------------------------------------------------------------

$series = $db->fetchOne(
    "SELECT
        iracing_series_id,
        series_name,
        category,
        license_group,
        is_favorite,
        last_sof_avg,
        current_track,
        current_car_classes,
        race_interval_minutes,
        baseline_offset_minutes,
        active_poll_offset_minutes,
        updated_at
    FROM favorite_series
    WHERE iracing_series_id = ?",
    [$seriesId]
);

if (!$series) {
    jsonError("Series not found: {$seriesId}", 404);
}

// ---------------------------------------------------------------------------
// Fetch upcoming race sessions
// ---------------------------------------------------------------------------

$sessions = $db->fetchAll(
    "SELECT
        id,
        series_id,
        session_id,
        race_start_utc,
        registration_open,
        status,
        baseline_count,
        newcomer_count,
        predictive_sof,
        practice_session_ids,
        created_at,
        updated_at
    FROM series_race_sessions
    WHERE series_id = ?
    ORDER BY race_start_utc ASC",
    [$seriesId]
);

// ---------------------------------------------------------------------------
// For each session, count registration entries
// ---------------------------------------------------------------------------

foreach ($sessions as &$session) {
    $session['registration_open'] = (bool) $session['registration_open'];

    // Get registration stats
    $stats = $db->fetchOne(
        "SELECT
            COUNT(*) as total_entries,
            SUM(CASE WHEN is_baseline = 1 THEN 1 ELSE 0 END) as baseline_entries,
            SUM(CASE WHEN is_baseline = 0 THEN 1 ELSE 0 END) as newcomer_entries
        FROM registration_entries
        WHERE series_id = ? AND race_start_utc = ?",
        [$seriesId, $session['race_start_utc']]
    );

    $session['total_registered'] = (int) ($stats['total_entries'] ?? 0);
    $session['baseline_entries'] = (int) ($stats['baseline_entries'] ?? 0);
    $session['newcomer_entries'] = (int) ($stats['newcomer_entries'] ?? 0);

    // Parse practice_session_ids JSON
    if ($session['practice_session_ids']) {
        $session['practice_session_ids'] = json_decode($session['practice_session_ids'], true) ?: [];
    } else {
        $session['practice_session_ids'] = [];
    }
}
unset($session);

// ---------------------------------------------------------------------------
// Return response
// ---------------------------------------------------------------------------

jsonResponse([
    'series' => $series,
    'race_sessions' => $sessions,
    'session_count' => count($sessions),
]);

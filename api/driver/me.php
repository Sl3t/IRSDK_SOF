<?php
/**
 * IRSDK SOF Agent — My Driver Profile Endpoint
 *
 * GET /api/driver/me.php
 *
 * Returns the current user's driver profile from the database, including
 * iRating history and trend data.
 *
 * The "me" driver is identified by:
 *   1. The my_iracing_user_id setting in the settings table, OR
 *   2. The driver row where is_me = true in the drivers table.
 *
 * Response:
 *   {
 *     "driver": { "id": 1, "user_name": "...", "current_irating": 2200, ... },
 *     "history": [ { "irating": 2200, "sr": 3.45, "series_name": "...", ... } ],
 *     "trend": { "direction": "up", "recent_delta": +45, "avg_last_5": 2180 }
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
// Look up the current user's driver record
// ---------------------------------------------------------------------------

$db = Database::getInstance();

// Strategy 1: Check for my_iracing_user_id in settings.
$myUserId = $db->getSetting('my_iracing_user_id');
$driver   = null;

if ($myUserId !== null && $myUserId !== '') {
    $driver = $db->fetchOne(
        "SELECT
            id, iracing_user_id, user_name, current_irating, current_sr,
            license_class, club_name, division, is_me, tag, notes, updated_at
        FROM drivers
        WHERE iracing_user_id = ?",
        [(int) $myUserId]
    );
}

// Strategy 2: Fall back to the is_me flag.
if ($driver === null) {
    $driver = $db->fetchOne(
        "SELECT
            id, iracing_user_id, user_name, current_irating, current_sr,
            license_class, club_name, division, is_me, tag, notes, updated_at
        FROM drivers
        WHERE is_me = 1"
    );
}

if ($driver === null) {
    jsonError(
        'No "me" driver profile found. Set my_iracing_user_id in settings or mark a driver as is_me.',
        404
    );
}

// Format booleans.
$driver['is_me'] = (bool) $driver['is_me'];

// ---------------------------------------------------------------------------
// Fetch iRating history (latest 50 entries)
// ---------------------------------------------------------------------------

$history = $db->fetchAll(
    "SELECT
        id, irating, sr, series_name, track_name, sof,
        finish_position, irating_change, recorded_at
    FROM irating_history
    ORDER BY recorded_at DESC
    LIMIT 50"
);

// ---------------------------------------------------------------------------
// Calculate trend from recent history
// ---------------------------------------------------------------------------

$trend = [
    'direction'    => 'stable',
    'recent_delta' => 0,
    'avg_last_5'   => null,
    'avg_last_10'  => null,
    'sessions_count' => count($history),
];

if (count($history) >= 2) {
    // Recent delta: most recent iRating change.
    $trend['recent_delta'] = (int) ($history[0]['irating_change'] ?? 0);

    // Average of last 5 races.
    $last5 = array_slice($history, 0, min(5, count($history)));
    $last5Iratings = array_column($last5, 'irating');
    $trend['avg_last_5'] = (int) round(array_sum($last5Iratings) / count($last5Iratings));

    // Average of last 10 races.
    if (count($history) >= 10) {
        $last10 = array_slice($history, 0, 10);
        $last10Iratings = array_column($last10, 'irating');
        $trend['avg_last_10'] = (int) round(array_sum($last10Iratings) / count($last10Iratings));
    }

    // Direction: compare last 5 average to last 10 (or overall).
    $compareAvg = $trend['avg_last_10'] ?? ($trend['avg_last_5'] ?? 0);
    $currentIr  = (int) ($history[0]['irating'] ?? 0);

    if ($currentIr > $compareAvg + 30) {
        $trend['direction'] = 'up';
    } elseif ($currentIr < $compareAvg - 30) {
        $trend['direction'] = 'down';
    } else {
        $trend['direction'] = 'stable';
    }
}

// ---------------------------------------------------------------------------
// Load iRating target from settings
// ---------------------------------------------------------------------------

$iratingTarget = (int) ($db->getSetting('irating_target', (string) DEFAULT_IRATING_TARGET));

// ---------------------------------------------------------------------------
// Return response
// ---------------------------------------------------------------------------

jsonResponse([
    'driver'         => $driver,
    'history'        => $history,
    'trend'          => $trend,
    'irating_target' => $iratingTarget,
]);

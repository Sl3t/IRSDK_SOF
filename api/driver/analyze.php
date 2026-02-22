<?php
/**
 * IRSDK SOF Agent — Driver Analysis Endpoint
 *
 * GET /api/driver/analyze.php?driver_id=X&track_name=Y&car_class=Z
 *
 * Analyses a specific driver's performance on a given track. Checks the
 * driver_track_stats cache table first; if data is fresh (< 24 hours),
 * returns the cached stats. Otherwise, returns available data with a
 * needs_refresh flag so the frontend can trigger an API call if needed.
 *
 * Query parameters:
 *   - driver_id  (required): Internal driver ID from the drivers table.
 *   - track_name (optional): Track name to filter stats for.
 *   - car_class  (optional): Car class to filter stats for.
 *
 * Response:
 *   {
 *     "driver": { ... },
 *     "track_stats": { ... },
 *     "danger_score": 25.0,
 *     "experience_score": 72.0,
 *     "needs_refresh": false,
 *     "cached_at": "2026-02-22 18:00:00"
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

$driverId  = requireParam('driver_id');
$trackName = optionalParam('track_name');
$carClass  = optionalParam('car_class');

// ---------------------------------------------------------------------------
// Fetch the driver record
// ---------------------------------------------------------------------------

$db = Database::getInstance();

$driver = $db->fetchOne(
    "SELECT
        id, iracing_user_id, user_name, current_irating, current_sr,
        license_class, club_name, division, is_me, tag, notes, updated_at
    FROM drivers
    WHERE id = ?",
    [(int) $driverId]
);

if ($driver === null) {
    jsonError("Driver not found with id: {$driverId}", 404);
}

$driver['is_me'] = (bool) $driver['is_me'];

// ---------------------------------------------------------------------------
// Fetch cached track stats
// ---------------------------------------------------------------------------

$trackStats   = null;
$needsRefresh = true;
$dangerScore  = 50.0;    // Default neutral danger score.
$expScore     = 0.0;     // Default no experience.
$cachedAt     = null;

$cacheTtl = (int) ($db->getSetting('cache_ttl_driver_stats', (string) CACHE_TTL_DRIVER_STATS));

// Build the query depending on which filters are provided.
$statsSql    = "SELECT * FROM driver_track_stats WHERE driver_id = ?";
$statsParams = [(int) $driverId];

if ($trackName !== null && $trackName !== '') {
    $statsSql    .= " AND track_name = ?";
    $statsParams[] = $trackName;
}
if ($carClass !== null && $carClass !== '') {
    $statsSql    .= " AND car_class = ?";
    $statsParams[] = $carClass;
}

// Order by cached_at descending to get the most recent.
$statsSql .= " ORDER BY cached_at DESC";

$trackStatsRows = $db->fetchAll($statsSql, $statsParams);

if (!empty($trackStatsRows)) {
    $trackStats = $trackStatsRows[0];
    $cachedAt   = $trackStats['cached_at'] ?? null;

    // Check if the cache is still fresh.
    if ($cachedAt !== null) {
        $cacheAge = time() - strtotime($cachedAt);
        $needsRefresh = ($cacheAge > $cacheTtl);
    }

    // Calculate danger score from cached data.
    $avgIncidents = (float) ($trackStats['avg_incidents'] ?? 4.0);
    $dnfRate      = (float) ($trackStats['dnf_rate'] ?? 0.0);

    // Danger: higher incidents and DNF rate = higher danger (0-100).
    $dangerScore = clampValue(
        ($avgIncidents * 8.0) + ($dnfRate * 50.0),
        0,
        100
    );

    // Experience score: based on number of races and consistency.
    $racesCount    = (int) ($trackStats['races_count'] ?? 0);
    $consistency   = (float) ($trackStats['lap_consistency'] ?? 5.0);

    // More races = more experienced (up to ~80), good consistency adds bonus.
    $raceComponent = min($racesCount * 4.0, 80.0);
    $consistencyBonus = max(0, 20.0 - ($consistency * 4.0)); // Lower std_dev = better.
    $expScore = clampValue($raceComponent + $consistencyBonus, 0, 100);
}

// ---------------------------------------------------------------------------
// Return response
// ---------------------------------------------------------------------------

jsonResponse([
    'driver'           => $driver,
    'track_stats'      => $trackStats,
    'danger_score'     => round($dangerScore, 1),
    'experience_score' => round($expScore, 1),
    'needs_refresh'    => $needsRefresh,
    'cached_at'        => $cachedAt,
    'filters'          => [
        'track_name' => $trackName,
        'car_class'  => $carClass,
    ],
]);

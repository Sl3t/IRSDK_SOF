<?php
/**
 * IRSDK SOF Agent — Registration Newcomers Endpoint
 *
 * Returns the list of newcomer drivers (registered after the baseline snapshot)
 * and the predictive SOF calculated from their iRatings only.
 *
 * Method: GET
 * Parameters:
 *   ?series_id=280                        (required)
 *   &race_start_utc=2026-03-01T18:00:00Z  (required)
 *
 * Response:
 *   {
 *     "newcomers": [{ "customer_id", "display_name", "irating" }, ...],
 *     "predictive_sof": 2345,
 *     "newcomer_count": 8,
 *     "baseline_count": 22,
 *     "total_registered": 30,
 *     "has_baseline": true,
 *     "race_start_utc": "2026-03-01T18:00:00Z"
 *   }
 *
 * @package IRSDK_SOF
 */

declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';

setCorsHeaders();
requireMethod('GET');

$seriesId     = (int)requireParam('series_id');
$raceStartUtc = requireParam('race_start_utc');

if ($seriesId <= 0) {
    jsonError('series_id must be > 0', 400);
}

$db = Database::getInstance();

// ============================================================================
// Check if baseline exists
// ============================================================================

$hasBaseline = (bool)$db->fetchOne(
    "SELECT 1 FROM registration_entries WHERE series_id = ? AND race_start_utc = ? AND is_baseline = 1 LIMIT 1",
    [$seriesId, $raceStartUtc]
);

// ============================================================================
// Get newcomers (is_baseline = 0, irating > 0)
// ============================================================================

$newcomers = $db->fetchAll(
    "SELECT customer_id, display_name, irating
     FROM registration_entries
     WHERE series_id = ? AND race_start_utc = ? AND is_baseline = 0 AND irating > 0
     ORDER BY irating DESC",
    [$seriesId, $raceStartUtc]
);

// ============================================================================
// Calculate predictive SOF from newcomers only
// ============================================================================

$newcomerIratings = array_map(fn($r) => (int)$r['irating'], $newcomers);
$predictiveSof = count($newcomerIratings) > 0
    ? (int)round(array_sum($newcomerIratings) / count($newcomerIratings))
    : 0;

// ============================================================================
// Get counts
// ============================================================================

$baselineCount = (int)($db->fetchOne(
    "SELECT COUNT(*) as cnt FROM registration_entries WHERE series_id = ? AND race_start_utc = ? AND is_baseline = 1",
    [$seriesId, $raceStartUtc]
)['cnt'] ?? 0);

$totalRegistered = $baselineCount + count($newcomers);

// Also include newcomers without irating in the count
$newcomerCountAll = (int)($db->fetchOne(
    "SELECT COUNT(*) as cnt FROM registration_entries WHERE series_id = ? AND race_start_utc = ? AND is_baseline = 0",
    [$seriesId, $raceStartUtc]
)['cnt'] ?? 0);

jsonResponse([
    'newcomers'        => $newcomers,
    'predictive_sof'   => $predictiveSof,
    'newcomer_count'   => $newcomerCountAll,
    'baseline_count'   => $baselineCount,
    'total_registered' => $totalRegistered,
    'has_baseline'     => $hasBaseline,
    'race_start_utc'   => $raceStartUtc,
]);

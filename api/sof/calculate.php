<?php
/**
 * IRSDK SOF Agent — SOF Calculation Endpoint
 *
 * POST /api/sof/calculate.php
 *
 * Calculates the Strength of Field (SOF) and related statistics from a list
 * of iRating values. This is the core computation engine described in
 * Module 4 of the project specification.
 *
 * POST body:
 *   {
 *     "iratings": [2500, 1800, 3200, 1500, 4100, ...],
 *     "my_irating": 2200
 *   }
 *
 * Response:
 *   {
 *     "sof": 2450,
 *     "mean": 2450,
 *     "median": 2350,
 *     "std_dev": 680,
 *     "min": 1200,
 *     "max": 5100,
 *     "driver_count": 24,
 *     "distribution": { "0-1000": 1, "1000-2000": 6, ... },
 *     "my_rank": 8,
 *     "my_percentile": 66.7,
 *     "my_irating": 2200,
 *     "sof_ratio": 1.11,
 *     "estimated_position_gains": [...]
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
requireMethod('POST');

// ---------------------------------------------------------------------------
// Parse and validate input
// ---------------------------------------------------------------------------

$input = getJsonInput();

$iratings  = $input['iratings'] ?? null;
$myIrating = $input['my_irating'] ?? null;

if (!is_array($iratings) || empty($iratings)) {
    jsonError('Field "iratings" must be a non-empty array of integers.', 400);
}

// Sanitize: ensure all values are positive integers.
$iratings = array_values(array_filter(
    array_map('intval', $iratings),
    fn(int $v) => $v > 0
));

if (empty($iratings)) {
    jsonError('No valid iRating values provided (all must be positive integers).', 400);
}

$myIrating = $myIrating !== null ? (int) $myIrating : null;

// ---------------------------------------------------------------------------
// Core SOF calculations
// ---------------------------------------------------------------------------

$count  = count($iratings);
$mean   = (int) round(array_sum($iratings) / $count);
$median = medianValue($iratings);
$stdDev = standardDeviation($iratings);
$min    = min($iratings);
$max    = max($iratings);

// ---------------------------------------------------------------------------
// Distribution by 1000-point brackets
// ---------------------------------------------------------------------------

$distribution = [
    '0-1000'    => 0,
    '1000-2000' => 0,
    '2000-3000' => 0,
    '3000-4000' => 0,
    '4000-5000' => 0,
    '5000+'     => 0,
];

foreach ($iratings as $ir) {
    if ($ir < 1000) {
        $distribution['0-1000']++;
    } elseif ($ir < 2000) {
        $distribution['1000-2000']++;
    } elseif ($ir < 3000) {
        $distribution['2000-3000']++;
    } elseif ($ir < 4000) {
        $distribution['3000-4000']++;
    } elseif ($ir < 5000) {
        $distribution['4000-5000']++;
    } else {
        $distribution['5000+']++;
    }
}

// ---------------------------------------------------------------------------
// Personal ranking within the field
// ---------------------------------------------------------------------------

$myRank       = null;
$myPercentile = null;
$sofRatio     = null;

if ($myIrating !== null && $myIrating > 0) {
    // Rank: how many drivers have a higher iRating + 1.
    $sorted = $iratings;
    rsort($sorted); // Descending order.
    $myRank = 1;
    foreach ($sorted as $ir) {
        if ($ir > $myIrating) {
            $myRank++;
        } else {
            break;
        }
    }

    // Percentile: percentage of drivers with a lower iRating.
    $myPercentile = round(percentileRank($myIrating, $iratings), 1);

    // SOF ratio: how the field compares to my iRating.
    // > 1.0 means the field is stronger than me; < 1.0 means weaker.
    $sofRatio = round($mean / $myIrating, 3);
}

// ---------------------------------------------------------------------------
// Estimated iRating gain/loss by finishing position
// (Simplified Elo-like approximation as per project spec F.5)
// ---------------------------------------------------------------------------

$positionGains = [];
if ($myIrating !== null && $myIrating > 0) {
    // Generate estimates for each possible finishing position.
    for ($pos = 1; $pos <= $count; $pos++) {
        // Simplified formula: expected position based on iRating rank.
        // Delta iR depends on finishing above or below expected position.
        $expectedPos = $myRank;
        $posDiff     = $expectedPos - $pos; // Positive = finished better than expected.

        // Scale factor: roughly 3-5 iR per position better/worse, scaled by field SOF.
        $scaleFactor = max(1, (int) round($mean / 1000));
        $delta       = (int) round($posDiff * $scaleFactor * 3.5);

        // Apply diminishing returns at extremes.
        if ($pos === 1) {
            $delta = max($delta, (int) round(($count - 1) * 3.5));
        }
        if ($pos === $count) {
            $delta = min($delta, (int) round(-($count - 1) * 2.5));
        }

        $positionGains[] = [
            'position'          => $pos,
            'estimated_delta'   => $delta,
            'is_expected'       => ($pos === $myRank),
        ];
    }
}

// ---------------------------------------------------------------------------
// Return full SOF object
// ---------------------------------------------------------------------------

jsonResponse([
    'sof'                       => $mean,
    'mean'                      => $mean,
    'median'                    => $median,
    'std_dev'                   => $stdDev,
    'min'                       => $min,
    'max'                       => $max,
    'driver_count'              => $count,
    'distribution'              => $distribution,
    'my_irating'                => $myIrating,
    'my_rank'                   => $myRank,
    'my_percentile'             => $myPercentile,
    'sof_ratio'                 => $sofRatio,
    'estimated_position_gains'  => $positionGains,
]);

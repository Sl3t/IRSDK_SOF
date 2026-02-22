<?php
/**
 * IRSDK SOF Agent — GO/NO-GO Decision Engine Endpoint
 *
 * POST /api/decision/evaluate.php
 *
 * Evaluates a GO/NO-GO recommendation based on 8 weighted criteria.
 * This implements Module 5 (Moteur de decision) from the project specification.
 *
 * POST body:
 *   {
 *     "sof": { "mean": 2450, "median": 2350, "std_dev": 680, "min": 1200, "max": 5100, "driver_count": 24 },
 *     "my_irating": 2200,
 *     "my_sr": 3.45,
 *     "track_conditions": {
 *       "track_surface_temp_c": 38.2, "air_temp_c": 22.5,
 *       "track_wetness": "dry", "weather_declared_wet": false,
 *       "dynamic_track": "moderately_rubbered", "skies": "partly_cloudy",
 *       "weather_type": "constant"
 *     },
 *     "field_analysis": {
 *       "avg_experience_score": 55.0,
 *       "avg_danger_score": 28.0,
 *       "pct_experienced_drivers": 0.65,
 *       "avg_incidents_on_track": 4.2
 *     },
 *     "driver_count": 24
 *   }
 *
 * Response:
 *   {
 *     "score": 73.2,
 *     "recommendation": "NEUTRAL",
 *     "criteria": [ { "name": "...", "score": 82.0, "weight": 20, "explanation": "..." }, ... ],
 *     "summary_text": "..."
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
// Parse input
// ---------------------------------------------------------------------------

$input = getJsonInput();

$sof             = $input['sof'] ?? [];
$myIrating       = (int) ($input['my_irating'] ?? 0);
$mySr            = (float) ($input['my_sr'] ?? 0.0);
$trackConditions = $input['track_conditions'] ?? [];
$fieldAnalysis   = $input['field_analysis'] ?? [];
$driverCount     = (int) ($input['driver_count'] ?? 0);

if ($myIrating <= 0) {
    jsonError('Field "my_irating" must be a positive integer.', 400);
}

// ---------------------------------------------------------------------------
// Load configurable weights and thresholds from the database settings
// ---------------------------------------------------------------------------

$db = Database::getInstance();

// Weights: try database first, fall back to config.php constants.
$weights = $db->getSettingJson('decision_weights', DECISION_WEIGHTS);

// Thresholds.
$thresholdGo   = (int) ($db->getSetting('threshold_go', (string) DECISION_THRESHOLD_GO));
$thresholdNogo = (int) ($db->getSetting('threshold_nogo', (string) DECISION_THRESHOLD_NOGO));
$sofRatioThreshold = (float) ($db->getSetting('sof_ratio_threshold', (string) SOF_RATIO_THRESHOLD));
$srMinimum         = (float) ($db->getSetting('sr_minimum', (string) SR_MINIMUM));

// ---------------------------------------------------------------------------
// Criterion 1: SOF Ratio (sof_ratio — default 20%)
// Compares the field SOF to my iRating.
// SOF < my iR => favorable (high score), SOF > my iR => unfavorable (low score).
// ---------------------------------------------------------------------------

$sofMean  = (int) ($sof['mean'] ?? 0);
$ratio    = $sofMean > 0 ? $sofMean / $myIrating : 1.0;
$sofScore = 0.0;

if ($ratio <= 0.85) {
    // Field is significantly weaker — very favorable.
    $sofScore = 95.0;
} elseif ($ratio <= 0.95) {
    // Field is somewhat weaker — favorable.
    $sofScore = 85.0;
} elseif ($ratio <= 1.05) {
    // Field is roughly equal — neutral.
    $sofScore = 70.0;
} elseif ($ratio <= $sofRatioThreshold) {
    // Field is somewhat stronger — slightly unfavorable.
    $sofScore = 55.0;
} elseif ($ratio <= 1.30) {
    // Field is stronger — unfavorable.
    $sofScore = 35.0;
} else {
    // Field is much stronger — very unfavorable.
    $sofScore = 15.0;
}

$diffIr = $sofMean - $myIrating;
$diffText = $diffIr >= 0 ? "+{$diffIr}" : (string) $diffIr;
$sofExplanation = "Ratio SOF/iR = " . round($ratio, 2) . " (SOF {$sofMean} vs votre iR {$myIrating}, delta {$diffText}).";
if ($ratio <= 1.0) {
    $sofExplanation .= " Le champ est globalement plus faible que vous.";
} else {
    $sofExplanation .= " Le champ est plus fort que vous de " . abs($diffIr) . " points.";
}

// ---------------------------------------------------------------------------
// Criterion 2: Estimated Position (position_estimate — default 15%)
// Where I would likely finish based on iRating ranking.
// ---------------------------------------------------------------------------

$positionScore = 50.0;
$myRank        = 0;
$posExplanation = '';

if ($driverCount > 0 && $myIrating > 0 && $sofMean > 0) {
    // Estimate rank from SOF distribution.
    $sofMedian = (int) ($sof['median'] ?? $sofMean);
    $sofStdDev = (int) ($sof['std_dev'] ?? 500);
    $sofMin    = (int) ($sof['min'] ?? $sofMean - 1000);
    $sofMax    = (int) ($sof['max'] ?? $sofMean + 1000);

    // Simple linear interpolation of rank in the field.
    if ($sofMax !== $sofMin) {
        $normalizedPos = ($sofMax - $myIrating) / ($sofMax - $sofMin);
        $myRank = (int) round(1 + ($normalizedPos * ($driverCount - 1)));
        $myRank = (int) clampValue((float) $myRank, 1, $driverCount);
    } else {
        $myRank = (int) ceil($driverCount / 2);
    }

    // Score: top quarter is excellent, bottom quarter is poor.
    $rankPct = $myRank / $driverCount;
    if ($rankPct <= 0.1) {
        $positionScore = 95.0;
    } elseif ($rankPct <= 0.25) {
        $positionScore = 85.0;
    } elseif ($rankPct <= 0.40) {
        $positionScore = 72.0;
    } elseif ($rankPct <= 0.60) {
        $positionScore = 55.0;
    } elseif ($rankPct <= 0.75) {
        $positionScore = 38.0;
    } else {
        $positionScore = 20.0;
    }

    $posExplanation = "Position estimee : P{$myRank}/{$driverCount} (top " . round($rankPct * 100) . "% du champ).";
} else {
    $posExplanation = "Donnees insuffisantes pour estimer votre position.";
}

// ---------------------------------------------------------------------------
// Criterion 3: Probable iRating Change (irating_gain — default 15%)
// Estimated gain/loss based on expected position.
// ---------------------------------------------------------------------------

$irGainScore = 50.0;
$expectedDelta = 0;
$irGainExplanation = '';

if ($driverCount > 0 && $myRank > 0) {
    $expectedPos = $myRank;

    // Simplified Elo estimate (project spec F.5).
    $posDiff     = (int) ceil($driverCount / 2) - $expectedPos;
    $scaleFactor = max(1, (int) round($sofMean / 1000));
    $expectedDelta = (int) round($posDiff * $scaleFactor * 3.0);

    // Score based on expected delta.
    if ($expectedDelta >= 50) {
        $irGainScore = 95.0;
    } elseif ($expectedDelta >= 20) {
        $irGainScore = 82.0;
    } elseif ($expectedDelta >= 0) {
        $irGainScore = 65.0;
    } elseif ($expectedDelta >= -20) {
        $irGainScore = 45.0;
    } elseif ($expectedDelta >= -50) {
        $irGainScore = 30.0;
    } else {
        $irGainScore = 15.0;
    }

    $deltaSign = $expectedDelta >= 0 ? '+' : '';
    $irGainExplanation = "Delta iR estime : {$deltaSign}{$expectedDelta} points si vous finissez P{$myRank}.";
} else {
    $irGainExplanation = "Impossible d'estimer le gain/perte d'iRating sans donnees de champ.";
}

// ---------------------------------------------------------------------------
// Criterion 4: Field Quality (field_quality — default 15%)
// How experienced the field is on this specific track.
// ---------------------------------------------------------------------------

$fieldScore       = 50.0;
$fieldExplanation = '';

$avgExpScore    = (float) ($fieldAnalysis['avg_experience_score'] ?? 50.0);
$pctExperienced = (float) ($fieldAnalysis['pct_experienced_drivers'] ?? 0.5);

// Higher field experience can be both positive (cleaner racing) and a challenge.
// We score favorably if drivers are experienced (cleaner, more predictable).
$fieldScore = clampValue($avgExpScore, 0, 100);

if ($pctExperienced >= 0.7) {
    $fieldExplanation = "Champ tres experimente sur ce circuit (" . round($pctExperienced * 100) . "% avec experience). Course probablement propre.";
} elseif ($pctExperienced >= 0.4) {
    $fieldExplanation = "Champ moyennement experimente (" . round($pctExperienced * 100) . "% avec experience). Vigilance requise.";
} else {
    $fieldExplanation = "Champ peu experimente sur ce circuit (" . round($pctExperienced * 100) . "% avec experience). Risque d'incidents accru.";
}

// ---------------------------------------------------------------------------
// Criterion 5: Danger Score (danger_score — default 10%)
// Average incident rate of the field on this track.
// ---------------------------------------------------------------------------

$dangerScore       = 50.0;
$dangerExplanation = '';

$avgDanger    = (float) ($fieldAnalysis['avg_danger_score'] ?? 50.0);
$avgIncidents = (float) ($fieldAnalysis['avg_incidents_on_track'] ?? 4.0);

// Invert: lower danger = higher score (safer field).
$dangerScore = clampValue(100.0 - $avgDanger, 0, 100);

if ($avgIncidents <= 2.0) {
    $dangerExplanation = "Champ tres propre (incidents moyens : " . round($avgIncidents, 1) . "x). Faible risque.";
} elseif ($avgIncidents <= 5.0) {
    $dangerExplanation = "Champ correct (incidents moyens : " . round($avgIncidents, 1) . "x). Risque modere.";
} elseif ($avgIncidents <= 8.0) {
    $dangerExplanation = "Champ agite (incidents moyens : " . round($avgIncidents, 1) . "x). Risque eleve.";
} else {
    $dangerExplanation = "Champ dangereux (incidents moyens : " . round($avgIncidents, 1) . "x). Tres haut risque.";
}

// ---------------------------------------------------------------------------
// Criterion 6: Track Conditions (track_conditions — default 10%)
// Temperature, wetness, grip, weather.
// ---------------------------------------------------------------------------

$conditionsScore       = 70.0;
$conditionsExplanation = '';

$trackTemp   = (float) ($trackConditions['track_surface_temp_c'] ?? 25.0);
$airTemp     = (float) ($trackConditions['air_temp_c'] ?? 20.0);
$wetness     = (string) ($trackConditions['track_wetness'] ?? 'dry');
$declaredWet = (bool) ($trackConditions['weather_declared_wet'] ?? false);
$grip        = (string) ($trackConditions['dynamic_track'] ?? 'moderately_rubbered');
$weatherType = (string) ($trackConditions['weather_type'] ?? 'constant');

// Temperature scoring.
$tempScore = 70.0;
if ($trackTemp >= 20.0 && $trackTemp <= 35.0) {
    $tempScore = 90.0; // Optimal range.
} elseif ($trackTemp >= 15.0 && $trackTemp <= 40.0) {
    $tempScore = 70.0; // Acceptable range.
} elseif ($trackTemp > 40.0) {
    $tempScore = 40.0; // Too hot — tire degradation.
} else {
    $tempScore = 45.0; // Too cold — low grip.
}

// Wetness scoring.
$wetScore = 90.0;
if ($declaredWet) {
    $wetScore = 25.0;
} elseif ($wetness === 'dry') {
    $wetScore = 90.0;
} elseif (str_contains($wetness, 'damp') || str_contains($wetness, 'slightly')) {
    $wetScore = 55.0;
} elseif (str_contains($wetness, 'wet')) {
    $wetScore = 30.0;
} else {
    $wetScore = 70.0;
}

// Grip scoring.
$gripScore = 70.0;
$gripLower = strtolower($grip);
if (str_contains($gripLower, 'heavily_rubbered') || str_contains($gripLower, 'heavy')) {
    $gripScore = 90.0;
} elseif (str_contains($gripLower, 'moderately')) {
    $gripScore = 78.0;
} elseif (str_contains($gripLower, 'slightly')) {
    $gripScore = 60.0;
} elseif (str_contains($gripLower, 'green')) {
    $gripScore = 42.0;
}

// Weather type penalty.
$weatherPenalty = ($weatherType === 'dynamic') ? 8.0 : 0.0;

// Combine sub-scores.
$conditionsScore = ($tempScore * 0.35 + $wetScore * 0.35 + $gripScore * 0.30) - $weatherPenalty;
$conditionsScore = clampValue($conditionsScore, 0, 100);

$conditionsExplanation = "Piste {$trackTemp}C (air {$airTemp}C), adherence: {$wetness}, grip: {$grip}.";
if ($declaredWet) {
    $conditionsExplanation .= " PISTE DECLAREE MOUILLÉE — course a haut risque.";
} elseif ($trackTemp > 40) {
    $conditionsExplanation .= " Temperature piste elevee — degradation pneus acceleree.";
} elseif ($trackTemp < 15) {
    $conditionsExplanation .= " Temperature piste basse — grip reduit.";
}

// ---------------------------------------------------------------------------
// Criterion 7: Safety Rating (safety_rating — default 10%)
// Is my current SR high enough to race safely?
// ---------------------------------------------------------------------------

$srScore       = 50.0;
$srExplanation = '';

if ($mySr >= 4.50) {
    $srScore = 95.0;
    $srExplanation = "SR excellente ({$mySr}). Marge confortable pour cette course.";
} elseif ($mySr >= 4.00) {
    $srScore = 85.0;
    $srExplanation = "SR solide ({$mySr}). Bonne marge de securite.";
} elseif ($mySr >= $srMinimum) {
    $srScore = 65.0;
    $srExplanation = "SR correcte ({$mySr}) au-dessus du seuil minimum ({$srMinimum}). Attention aux incidents.";
} elseif ($mySr >= ($srMinimum - 0.50)) {
    $srScore = 35.0;
    $srExplanation = "SR faible ({$mySr}) proche du seuil minimum ({$srMinimum}). Risque de relegation !";
} else {
    $srScore = 10.0;
    $srExplanation = "SR critique ({$mySr}) sous le seuil minimum ({$srMinimum}). Relegation imminente — course deconseillée.";
}

// ---------------------------------------------------------------------------
// Criterion 8: Participant Count (participant_count — default 5%)
// More participants = more official, more exciting, but also more risk.
// ---------------------------------------------------------------------------

$participantScore       = 50.0;
$participantExplanation = '';

if ($driverCount >= 20) {
    $participantScore = 85.0;
    $participantExplanation = "Champ complet ({$driverCount} pilotes). Course officielle avec enjeu maximum.";
} elseif ($driverCount >= 12) {
    $participantScore = 72.0;
    $participantExplanation = "Bon nombre de participants ({$driverCount} pilotes). Course valable.";
} elseif ($driverCount >= 8) {
    $participantScore = 55.0;
    $participantExplanation = "Champ reduit ({$driverCount} pilotes). Enjeu moindre mais course officielle.";
} elseif ($driverCount >= 5) {
    $participantScore = 35.0;
    $participantExplanation = "Tres peu de pilotes ({$driverCount}). Session minimale.";
} else {
    $participantScore = 15.0;
    $participantExplanation = "Champ insuffisant ({$driverCount} pilotes). Session probablement non officielle.";
}

// ---------------------------------------------------------------------------
// Aggregate: weighted sum of all 8 criteria
// ---------------------------------------------------------------------------

$criteria = [
    [
        'key'         => 'sof_ratio',
        'name'        => 'Ratio SOF / iRating',
        'score'       => round($sofScore, 1),
        'weight'      => $weights['sof_ratio'] ?? 20,
        'explanation' => $sofExplanation,
    ],
    [
        'key'         => 'position_estimate',
        'name'        => 'Position estimee',
        'score'       => round($positionScore, 1),
        'weight'      => $weights['position_estimate'] ?? 15,
        'explanation' => $posExplanation,
    ],
    [
        'key'         => 'irating_gain',
        'name'        => 'Gain/Perte iRating probable',
        'score'       => round($irGainScore, 1),
        'weight'      => $weights['irating_gain'] ?? 15,
        'explanation' => $irGainExplanation,
    ],
    [
        'key'         => 'field_quality',
        'name'        => 'Qualite du champ',
        'score'       => round($fieldScore, 1),
        'weight'      => $weights['field_quality'] ?? 15,
        'explanation' => $fieldExplanation,
    ],
    [
        'key'         => 'danger_score',
        'name'        => 'Dangerosite du champ',
        'score'       => round($dangerScore, 1),
        'weight'      => $weights['danger_score'] ?? 10,
        'explanation' => $dangerExplanation,
    ],
    [
        'key'         => 'track_conditions',
        'name'        => 'Conditions de piste',
        'score'       => round($conditionsScore, 1),
        'weight'      => $weights['track_conditions'] ?? 10,
        'explanation' => $conditionsExplanation,
    ],
    [
        'key'         => 'safety_rating',
        'name'        => 'Safety Rating',
        'score'       => round($srScore, 1),
        'weight'      => $weights['safety_rating'] ?? 10,
        'explanation' => $srExplanation,
    ],
    [
        'key'         => 'participant_count',
        'name'        => 'Nombre de participants',
        'score'       => round($participantScore, 1),
        'weight'      => $weights['participant_count'] ?? 5,
        'explanation' => $participantExplanation,
    ],
];

// Calculate the final weighted score.
$totalWeight = 0;
$weightedSum = 0.0;

foreach ($criteria as $criterion) {
    $weightedSum += $criterion['score'] * $criterion['weight'];
    $totalWeight += $criterion['weight'];
}

// Normalize to 0-100 (in case weights do not sum to 100).
$finalScore = $totalWeight > 0 ? round($weightedSum / $totalWeight, 1) : 0.0;
$finalScore = clampValue($finalScore, 0, 100);

// Determine recommendation.
$recommendation = 'NEUTRAL';
if ($finalScore >= $thresholdGo) {
    $recommendation = 'GO';
} elseif ($finalScore < $thresholdNogo) {
    $recommendation = 'NOGO';
}

// ---------------------------------------------------------------------------
// Generate contextual summary in French
// ---------------------------------------------------------------------------

$summaryParts = [];

// SOF context.
if ($ratio <= 1.0) {
    $summaryParts[] = "Le SOF ({$sofMean}) est inferieur a votre iRating de " . abs($diffIr) . " points — situation favorable.";
} else {
    $summaryParts[] = "Le SOF ({$sofMean}) est superieur a votre iRating de {$diffIr} points.";
}

// Position context.
if ($myRank > 0 && $driverCount > 0) {
    $rankPctFinal = round(($myRank / $driverCount) * 100);
    $summaryParts[] = "Vous etes estime P{$myRank}/{$driverCount} (top {$rankPctFinal}%).";
}

// iR gain context.
if ($expectedDelta !== 0) {
    $deltaSign = $expectedDelta >= 0 ? '+' : '';
    $summaryParts[] = "Gain/perte estime : {$deltaSign}{$expectedDelta} iR.";
}

// Track conditions context.
if ($declaredWet) {
    $summaryParts[] = "Attention : piste declaree mouillee. Risque d'incidents significatif.";
} elseif ($trackTemp > 40) {
    $summaryParts[] = "Temperature de piste elevee ({$trackTemp}C) — degradation pneus acceleree.";
} elseif ($conditionsScore >= 75) {
    $summaryParts[] = "Conditions de piste optimales ({$trackTemp}C, {$grip}).";
}

// SR context.
if ($mySr < $srMinimum) {
    $summaryParts[] = "ATTENTION : votre SR ({$mySr}) est sous le seuil minimum. Course risquee pour votre licence.";
}

// Participant context.
if ($driverCount >= 20) {
    $summaryParts[] = "Champ complet avec {$driverCount} pilotes.";
} elseif ($driverCount < 8) {
    $summaryParts[] = "Seulement {$driverCount} pilotes — session potentiellement non officielle.";
}

// Final recommendation line.
if ($recommendation === 'GO') {
    $summaryParts[] = "Recommandation : GO ({$finalScore}%). Bonne opportunite de course.";
} elseif ($recommendation === 'NOGO') {
    $summaryParts[] = "Recommandation : NO-GO ({$finalScore}%). Il est preferable d'attendre une meilleure session.";
} else {
    $summaryParts[] = "Recommandation : NEUTRE ({$finalScore}%). A votre appreciation.";
}

$summaryText = implode(' ', $summaryParts);

// ---------------------------------------------------------------------------
// Return response
// ---------------------------------------------------------------------------

jsonResponse([
    'score'          => $finalScore,
    'recommendation' => $recommendation,
    'thresholds'     => [
        'go'   => $thresholdGo,
        'nogo' => $thresholdNogo,
    ],
    'criteria'       => $criteria,
    'summary_text'   => $summaryText,
    'input'          => [
        'my_irating'   => $myIrating,
        'my_sr'        => $mySr,
        'sof_mean'     => $sofMean,
        'driver_count' => $driverCount,
    ],
]);

<?php
/**
 * IRSDK SOF Agent — Series Enrichment Endpoint
 *
 * Fetches season schedule data from the iRacing Data API and enriches
 * the local favorite_series table with current track and race interval.
 *
 * POST /api/series/enrich
 *
 * Uses:
 *   - /data/series/seasons to get schedules (track per week)
 *   - Determines current race week automatically
 *
 * @package IRSDK_SOF
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../iracing/crypto.php';

setCorsHeaders();
requireMethod('POST');

$db  = Database::getInstance();
$key = _getEncryptionKey();

// ============================================================================
// Get a valid access token
// ============================================================================

$encToken  = $db->getSetting('oauth_access_token');
$expiresAt = $db->getSetting('oauth_token_expires_at');

if (!$encToken || !$expiresAt || strtotime($expiresAt) <= time()) {
    jsonError('Authentication expired. Please re-authenticate in Settings.', 401);
}

$accessToken = _decrypt($encToken, $key);

// ============================================================================
// Helper: authenticated GET to iRacing API with link-follow
// ============================================================================

function _fetchApi(string $url, string $token): array
{
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
        CURLOPT_HTTPHEADER     => [
            'Accept: application/json',
            "Authorization: Bearer {$token}",
        ],
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response  = curl_exec($ch);
    $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        return ['data' => null, 'error' => "cURL error: {$curlError}", 'http_code' => $httpCode];
    }

    if ($httpCode >= 400) {
        return ['data' => null, 'error' => "HTTP {$httpCode}: " . mb_substr($response, 0, 300), 'http_code' => $httpCode];
    }

    $data = json_decode($response, true);

    // Follow link if iRacing returns { "link": "...", "expires": "..." }
    if (is_array($data) && isset($data['link'])) {
        $ch2 = curl_init();
        curl_setopt_array($ch2, [
            CURLOPT_URL            => $data['link'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $response2 = curl_exec($ch2);
        $httpCode2 = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
        curl_close($ch2);

        if ($response2 === false || $httpCode2 >= 400) {
            return ['data' => null, 'error' => "Link follow failed (HTTP {$httpCode2})", 'http_code' => $httpCode2];
        }

        $data = json_decode($response2, true);
    }

    return ['data' => $data, 'error' => null, 'http_code' => $httpCode];
}

// ============================================================================
// Fetch season schedules from iRacing
// ============================================================================

$baseUrl = IRACING_API_BASE_URL;

// /data/series/seasons returns all current series with their season + schedule
$result = _fetchApi($baseUrl . '/data/series/seasons', $accessToken);

if ($result['error']) {
    jsonError("iRacing API error: {$result['error']}", $result['http_code'] ?: 502);
}

$seasonsData = $result['data'];

if (!is_array($seasonsData)) {
    jsonError('Unexpected response format from iRacing seasons API.', 502);
}

// ============================================================================
// Parse season data and enrich series
// ============================================================================

$enriched = 0;
$skipped  = 0;
$errors   = 0;
$now      = date('Y-m-d H:i:s');

// Get all our stored series IDs for quick lookup
$storedSeries = $db->fetchAll("SELECT iracing_series_id FROM favorite_series WHERE category = 'road'");
$storedIds = array_column($storedSeries, 'iracing_series_id');
$storedIdsMap = array_flip($storedIds);

// The response from /data/series/seasons is typically an array of season objects.
// Each contains: series_id, season_id, schedules (array of week objects)
// Schedules have: race_week_num, track.track_name, track.config_name, etc.

// Handle wrapped responses
$seasonsList = $seasonsData;
if (!isset($seasonsData[0]) && is_array($seasonsData)) {
    foreach (['seasons', 'series', 'data'] as $wrapperKey) {
        if (isset($seasonsData[$wrapperKey]) && is_array($seasonsData[$wrapperKey])) {
            $seasonsList = $seasonsData[$wrapperKey];
            break;
        }
    }
}

foreach ($seasonsList as $season) {
    if (!is_array($season)) continue;

    $seriesId = (int)($season['series_id'] ?? 0);
    if ($seriesId <= 0) continue;

    // Only enrich series we have in our database
    if (!isset($storedIdsMap[$seriesId])) {
        $skipped++;
        continue;
    }

    // Extract schedule (array of week objects)
    $schedules = $season['schedules'] ?? $season['schedule'] ?? $season['tracks'] ?? [];
    if (!is_array($schedules) || empty($schedules)) {
        $skipped++;
        continue;
    }

    // Determine current race week
    $currentWeek = null;
    $currentTrack = null;
    $raceInterval = null;

    // Method 1: Find the week whose start_date <= now < next week's start_date
    $today = time();
    foreach ($schedules as $week) {
        if (!is_array($week)) continue;

        $weekNum = (int)($week['race_week_num'] ?? -1);
        $startDate = $week['start_date'] ?? null;

        if ($startDate) {
            $weekStart = strtotime($startDate);
            // Each week is typically 7 days
            $weekEnd = $weekStart + (7 * 86400);

            if ($today >= $weekStart && $today < $weekEnd) {
                $currentWeek = $week;
                break;
            }
        }
    }

    // Method 2: If no date matching, use race_week_num from season
    if (!$currentWeek && isset($season['race_week_num'])) {
        $targetWeek = (int)$season['race_week_num'];
        foreach ($schedules as $week) {
            if (!is_array($week)) continue;
            if ((int)($week['race_week_num'] ?? -1) === $targetWeek) {
                $currentWeek = $week;
                break;
            }
        }
    }

    // Method 3: Fallback to last week in schedule that has started
    if (!$currentWeek) {
        foreach ($schedules as $week) {
            if (!is_array($week)) continue;
            $startDate = $week['start_date'] ?? null;
            if ($startDate && strtotime($startDate) <= $today) {
                $currentWeek = $week; // keep updating, last one wins
            }
        }
    }

    if (!$currentWeek) {
        // Fallback: use first week
        $currentWeek = $schedules[0] ?? null;
    }

    if (!$currentWeek) {
        $skipped++;
        continue;
    }

    // Extract track name from the week object
    // The track might be a nested object: { track: { track_name: "...", config_name: "..." } }
    // Or flat: { track_name: "...", config_name: "..." }
    $trackObj = $currentWeek['track'] ?? null;
    if (is_array($trackObj)) {
        $trackName   = $trackObj['track_name'] ?? $trackObj['name'] ?? '';
        $configName  = $trackObj['config_name'] ?? $trackObj['config'] ?? '';
    } else {
        $trackName   = $currentWeek['track_name'] ?? $currentWeek['name'] ?? '';
        $configName  = $currentWeek['config_name'] ?? $currentWeek['config'] ?? '';
    }

    if (!empty($configName) && $configName !== 'N/A' && $configName !== $trackName) {
        $currentTrack = $trackName . ' — ' . $configName;
    } else {
        $currentTrack = $trackName;
    }

    if (empty($currentTrack)) {
        $skipped++;
        continue;
    }

    // Extract race interval (minutes between races)
    $raceInterval = (int)($season['race_time_interval_minutes']
                       ?? $season['schedule_race_time_interval_minutes']
                       ?? $currentWeek['race_time_interval_minutes']
                       ?? 0);

    // Extract car classes if available
    $carClasses = '';
    $carClassArr = $season['car_classes'] ?? $currentWeek['car_classes'] ?? [];
    if (is_array($carClassArr)) {
        $classNames = [];
        foreach ($carClassArr as $cc) {
            if (is_array($cc) && isset($cc['short_name'])) {
                $classNames[] = $cc['short_name'];
            } elseif (is_array($cc) && isset($cc['name'])) {
                $classNames[] = $cc['name'];
            } elseif (is_string($cc)) {
                $classNames[] = $cc;
            }
        }
        $carClasses = implode(', ', $classNames);
    }

    try {
        $updateFields = ['current_track' => $currentTrack, 'updated_at' => $now];
        if ($raceInterval > 0) {
            $updateFields['race_interval_minutes'] = (string)$raceInterval;
        }
        if (!empty($carClasses)) {
            $updateFields['current_car_classes'] = $carClasses;
        }

        $setClauses = [];
        $params = [];
        foreach ($updateFields as $col => $val) {
            $setClauses[] = "{$col} = ?";
            $params[] = $val;
        }
        $params[] = $seriesId;

        $db->query(
            "UPDATE favorite_series SET " . implode(', ', $setClauses) . " WHERE iracing_series_id = ?",
            $params
        );
        $enriched++;
    } catch (Throwable $e) {
        $errors++;
        if (DEBUG_MODE) {
            error_log("[enrich] Error updating series {$seriesId}: {$e->getMessage()}");
        }
    }
}

$responseData = [
    'success'  => true,
    'enriched' => $enriched,
    'skipped'  => $skipped,
    'message'  => "Enriched {$enriched} series with track & schedule data.",
];

if ($errors > 0) {
    $responseData['errors'] = $errors;
}

// Debug output when nothing was enriched
if ($enriched === 0 && DEBUG_MODE) {
    $responseData['debug'] = [
        'seasons_data_type'  => gettype($seasonsData),
        'seasons_count'      => is_array($seasonsData) ? count($seasonsData) : 0,
        'seasons_top_keys'   => is_array($seasonsData) ? array_slice(array_keys($seasonsData), 0, 10) : [],
        'first_item_keys'    => (is_array($seasonsList) && isset($seasonsList[0]) && is_array($seasonsList[0]))
                                ? array_keys($seasonsList[0]) : 'N/A',
        'stored_series_count' => count($storedIds),
    ];
    // Include first season item for inspection
    if (is_array($seasonsList) && !empty($seasonsList)) {
        $first = reset($seasonsList);
        if (is_array($first)) {
            $responseData['debug']['first_season_keys'] = array_keys($first);
            // Show schedule structure if present
            foreach (['schedules', 'schedule', 'tracks'] as $schedKey) {
                if (isset($first[$schedKey]) && is_array($first[$schedKey]) && !empty($first[$schedKey])) {
                    $firstWeek = $first[$schedKey][0] ?? null;
                    $responseData['debug']['schedule_key'] = $schedKey;
                    $responseData['debug']['first_week_keys'] = is_array($firstWeek) ? array_keys($firstWeek) : 'N/A';
                    $responseData['debug']['first_week_sample'] = $firstWeek;
                    break;
                }
            }
        }
    }
}

jsonResponse($responseData);

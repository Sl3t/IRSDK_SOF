<?php
/**
 * IRSDK SOF Agent — Search iRacing Series by Name
 *
 * POST /api/series/search.php
 * Body: { "query": "ferrari" }
 *
 * Searches the local favorite_series table first. If fewer than 3 results,
 * also queries the iRacing Data API /data/series/get and filters by name.
 * Returns matching series with their iRacing series_id.
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

$input = getJsonInput();
$query = trim((string)($input['query'] ?? ''));

if ($query === '' || mb_strlen($query) < 2) {
    jsonError('query is required and must be at least 2 characters', 400);
}

$db = Database::getInstance();

// ============================================================================
// Step 1: Search local database
// ============================================================================

$localResults = $db->fetchAll(
    "SELECT iracing_series_id, series_name, category, license_group, is_favorite,
            current_track, race_interval_minutes
     FROM favorite_series
     WHERE LOWER(series_name) LIKE ?
     ORDER BY is_favorite DESC, series_name ASC
     LIMIT 20",
    ['%' . strtolower($query) . '%']
);

foreach ($localResults as &$row) {
    $row['is_favorite'] = (bool) $row['is_favorite'];
    $row['source'] = 'local';
}
unset($row);

// ============================================================================
// Step 2: If fewer than 3 local results, search iRacing API
// ============================================================================

$apiResults = [];

if (count($localResults) < 3) {
    try {
        $key = _getEncryptionKey();
        $encToken  = $db->getSetting('oauth_access_token');
        $expiresAt = $db->getSetting('oauth_token_expires_at');

        if ($encToken && $expiresAt && strtotime($expiresAt) > time()) {
            $accessToken = _decrypt($encToken, $key);

            $url = IRACING_API_BASE_URL . '/data/series/get';
            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL            => $url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 30,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_HTTPHEADER     => [
                    'Accept: application/json',
                    "Authorization: Bearer {$accessToken}",
                ],
                CURLOPT_SSL_VERIFYPEER => true,
            ]);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($response !== false && $httpCode < 400) {
                $data = json_decode($response, true);

                // Follow iRacing redirect link pattern
                if (is_array($data) && isset($data['link'])) {
                    $ch2 = curl_init();
                    curl_setopt_array($ch2, [
                        CURLOPT_URL            => $data['link'],
                        CURLOPT_RETURNTRANSFER => true,
                        CURLOPT_TIMEOUT        => 30,
                        CURLOPT_FOLLOWLOCATION => true,
                        CURLOPT_SSL_VERIFYPEER => true,
                    ]);
                    $response = curl_exec($ch2);
                    curl_close($ch2);
                    $data = json_decode($response, true);
                }

                if (is_array($data)) {
                    // Handle wrapper keys
                    $seriesList = $data;
                    if (!isset($data[0]) && is_array($data)) {
                        foreach (['series', 'data', 'results'] as $wrapperKey) {
                            if (isset($data[$wrapperKey]) && is_array($data[$wrapperKey])) {
                                $seriesList = $data[$wrapperKey];
                                break;
                            }
                        }
                    }

                    // Category mapping
                    $categoryIdMap = [
                        1 => 'oval', 2 => 'road', 3 => 'dirt_oval', 4 => 'dirt_road',
                        5 => 'road', 6 => 'road',
                    ];

                    $queryLower = strtolower($query);
                    $localIds = array_column($localResults, 'iracing_series_id');

                    foreach ($seriesList as $series) {
                        if (!is_array($series)) continue;

                        $seriesId   = (int)($series['series_id'] ?? 0);
                        $seriesName = $series['series_name'] ?? $series['series_short_name'] ?? '';

                        if ($seriesId <= 0) continue;

                        // Filter by name match
                        if (mb_stripos($seriesName, $query) === false) continue;

                        // Skip if already in local results
                        if (in_array($seriesId, $localIds, true)) continue;

                        // Determine category
                        $catId = (int)($series['category_id'] ?? 0);
                        $category = $categoryIdMap[$catId] ?? 'road';

                        // Determine license
                        $licenseGroup = '';
                        if (!empty($series['allowed_licenses']) && is_array($series['allowed_licenses'])) {
                            $minLevel = PHP_INT_MAX;
                            foreach ($series['allowed_licenses'] as $lic) {
                                if (isset($lic['min_license_level'])) {
                                    $minLevel = min($minLevel, (int)$lic['min_license_level']);
                                }
                            }
                            if ($minLevel < PHP_INT_MAX) {
                                if ($minLevel >= 18) $licenseGroup = 'A';
                                elseif ($minLevel >= 14) $licenseGroup = 'B';
                                elseif ($minLevel >= 10) $licenseGroup = 'C';
                                elseif ($minLevel >= 6)  $licenseGroup = 'D';
                                else $licenseGroup = 'R';
                            }
                        }

                        $apiResults[] = [
                            'iracing_series_id' => $seriesId,
                            'series_name'       => $seriesName,
                            'category'          => $category,
                            'license_group'     => $licenseGroup,
                            'is_favorite'       => false,
                            'current_track'     => null,
                            'race_interval_minutes' => null,
                            'source'            => 'iracing_api',
                        ];

                        if (count($apiResults) >= 20) break;
                    }
                }
            }
        }
    } catch (Throwable $e) {
        // Silently fail — local results still returned
        if (DEBUG_MODE) {
            error_log('[search] iRacing API error: ' . $e->getMessage());
        }
    }
}

// ============================================================================
// Merge and return
// ============================================================================

$allResults = array_merge($localResults, $apiResults);

jsonResponse([
    'success'       => true,
    'query'         => $query,
    'results'       => $allResults,
    'local_count'   => count($localResults),
    'api_count'     => count($apiResults),
    'total'         => count($allResults),
]);

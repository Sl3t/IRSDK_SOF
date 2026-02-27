<?php
/**
 * IRSDK SOF Agent — Series Sync Endpoint
 *
 * Fetches the full series catalogue from the iRacing Data API and
 * populates the local favorite_series table.
 *
 * POST /api/series/sync
 * Body (optional): { "category": "road" }
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

$input    = getJsonInput();
$category = strtolower(trim($input['category'] ?? ''));

$db  = Database::getInstance();
$key = _getEncryptionKey();

// ============================================================================
// Get a valid access token (auto-refresh if expired)
// ============================================================================

/**
 * Re-authenticate using stored credentials (password_limited grant).
 */
function _reAuth(): bool
{
    $db  = Database::getInstance();
    $key = _getEncryptionKey();

    $encClientId     = $db->getSetting('oauth_client_id');
    $encClientSecret = $db->getSetting('oauth_client_secret');
    $encEmail        = $db->getSetting('iracing_email');
    $encPassword     = $db->getSetting('iracing_password');

    if (!$encClientId || !$encClientSecret || !$encEmail || !$encPassword) return false;

    try {
        $clientId     = _decrypt($encClientId, $key);
        $clientSecret = _decrypt($encClientSecret, $key);
        $email        = _decrypt($encEmail, $key);
        $password     = _decrypt($encPassword, $key);
    } catch (Throwable $e) {
        return false;
    }

    $maskedSecret = base64_encode(hash('sha256', $clientSecret . strtolower(trim($clientId)), true));
    $maskedPwd    = base64_encode(hash('sha256', $password . strtolower(trim($email)), true));

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => IRACING_OAUTH_TOKEN_URL,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'grant_type'    => 'password_limited',
            'client_id'     => $clientId,
            'client_secret' => $maskedSecret,
            'username'      => $email,
            'password'      => $maskedPwd,
            'scope'         => 'iracing.auth',
        ]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json'],
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code >= 200 && $code < 300) {
        $data = json_decode($resp, true);
        if (!empty($data['access_token'])) {
            $db->setSetting('oauth_access_token', _encrypt($data['access_token'], $key));
            $db->setSetting('oauth_authenticated_at', date('Y-m-d H:i:s'));
            $db->setSetting('oauth_token_expires_at', date('Y-m-d H:i:s', time() + (int)($data['expires_in'] ?? 600)));
            if (!empty($data['refresh_token'])) {
                $db->setSetting('oauth_refresh_token', _encrypt($data['refresh_token'], $key));
            }
            return true;
        }
    }
    return false;
}

$encToken  = $db->getSetting('oauth_access_token');
$expiresAt = $db->getSetting('oauth_token_expires_at');

// Auto-refresh if expired
if (!$encToken || !$expiresAt || strtotime($expiresAt) <= time()) {
    if (!_reAuth()) {
        jsonError('Authentication expired. Please re-authenticate in Settings.', 401);
    }
    $encToken = $db->getSetting('oauth_access_token');
}

$accessToken = _decrypt($encToken, $key);

// ============================================================================
// Fetch series from iRacing Data API
// ============================================================================

$baseUrl = IRACING_API_BASE_URL;
$url     = $baseUrl . '/data/series/get';

/**
 * Make an authenticated GET request to the iRacing Data API.
 */
function _fetchIRacing(string $url, string $token): array
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

    return ['response' => $response, 'http_code' => $httpCode, 'error' => $curlError];
}

$result = _fetchIRacing($url, $accessToken);

// On 401, force re-auth and retry (token may lack scope)
if ($result['http_code'] === 401) {
    if (_reAuth()) {
        $encToken = $db->getSetting('oauth_access_token');
        $accessToken = _decrypt($encToken, $key);
        $result = _fetchIRacing($url, $accessToken);
    }
}

$response = $result['response'];
$httpCode = $result['http_code'];

if ($response === false) {
    jsonError("iRacing API connection failed: {$result['error']}", 502);
}

if ($httpCode >= 400) {
    jsonError("iRacing API returned HTTP {$httpCode}: " . mb_substr($response, 0, 300), $httpCode);
}

$data = json_decode($response, true);

// iRacing returns { "link": "https://...", "expires": "..." } — follow the link
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
    $httpCode = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
    curl_close($ch2);

    if ($response === false || $httpCode >= 400) {
        jsonError("Failed to follow iRacing data link (HTTP {$httpCode})", 502);
    }

    $data = json_decode($response, true);
}

if (!is_array($data)) {
    jsonError('Unexpected response format from iRacing API.', 502);
}

// ============================================================================
// Map category_id from iRacing to our schema
// iRacing category_id: 1=Oval, 2=Road, 3=Dirt Oval, 4=Dirt Road,
//                      5=Sports Car, 6=Formula Car
// ============================================================================

$categoryIdMap = [
    1 => 'oval',
    2 => 'road',
    3 => 'dirt_oval',
    4 => 'dirt_road',
    5 => 'road',       // Sports Car → road
    6 => 'road',       // Formula Car → road
];

$categoryNameMap = [
    'road'         => 'road',
    'oval'         => 'oval',
    'dirt_road'    => 'dirt_road',
    'dirt_oval'    => 'dirt_oval',
    'sports_car'   => 'road',
    'formula_car'  => 'road',
    'sports car'   => 'road',
    'formula car'  => 'road',
];

/**
 * Extract the minimum license group from the allowed_licenses array.
 * Each entry has: group_name, min_license_level, max_license_level, etc.
 * Returns one of: R, D, C, B, A, or '' if unknown.
 */
function _extractLicenseGroup(array $series): string
{
    // Method 1: Parse allowed_licenses array (preferred)
    if (!empty($series['allowed_licenses']) && is_array($series['allowed_licenses'])) {
        $minLevel = PHP_INT_MAX;
        foreach ($series['allowed_licenses'] as $lic) {
            if (isset($lic['min_license_level'])) {
                $minLevel = min($minLevel, (int)$lic['min_license_level']);
            }
            // Also check group_name directly
            if (isset($lic['group_name'])) {
                $gn = strtolower(trim($lic['group_name']));
                if (str_contains($gn, 'rookie')) return 'R';
            }
        }
        if ($minLevel < PHP_INT_MAX) {
            if ($minLevel >= 18) return 'A';
            if ($minLevel >= 14) return 'B';
            if ($minLevel >= 10) return 'C';
            if ($minLevel >= 6)  return 'D';
            return 'R';
        }
    }

    // Method 2: Direct min_license_level field (fallback)
    if (isset($series['min_license_level'])) {
        $level = (int)$series['min_license_level'];
        if ($level >= 18) return 'A';
        if ($level >= 14) return 'B';
        if ($level >= 10) return 'C';
        if ($level >= 6)  return 'D';
        return 'R';
    }

    // Method 3: license_group field (fallback)
    if (isset($series['license_group'])) {
        return (string)$series['license_group'];
    }

    return '';
}

// ============================================================================
// Insert/update series in the database
// ============================================================================

$inserted = 0;
$updated  = 0;
$skipped  = 0;
$errors   = 0;

$now = date('Y-m-d H:i:s');

// Handle non-sequential array (associative top-level keys)
// Some iRacing responses might wrap series in a key
$seriesList = $data;
if (!isset($data[0]) && is_array($data)) {
    // Try common wrapper keys
    foreach (['series', 'data', 'results'] as $wrapperKey) {
        if (isset($data[$wrapperKey]) && is_array($data[$wrapperKey])) {
            $seriesList = $data[$wrapperKey];
            break;
        }
    }
}

foreach ($seriesList as $series) {
    // Skip non-array entries (e.g. metadata keys in response)
    if (!is_array($series)) continue;

    $seriesId   = (int)($series['series_id'] ?? 0);
    $seriesName = $series['series_name'] ?? $series['series_short_name'] ?? 'Unknown';

    if ($seriesId <= 0) continue;

    // Determine category from category_id first, then category string
    $seriesCategory = '';
    $catId = (int)($series['category_id'] ?? 0);
    if ($catId > 0 && isset($categoryIdMap[$catId])) {
        $seriesCategory = $categoryIdMap[$catId];
    } else {
        $rawCategory = strtolower(trim($series['category'] ?? ''));
        $seriesCategory = $categoryNameMap[$rawCategory] ?? $rawCategory;
    }

    if (empty($seriesCategory)) {
        $seriesCategory = 'road'; // default
    }

    // Filter by category if specified
    if ($category !== '' && $seriesCategory !== $category) {
        $skipped++;
        continue;
    }

    // Determine license group from allowed_licenses or fallbacks
    $licenseGroup = _extractLicenseGroup($series);

    try {
        // Check if series already exists
        $existing = $db->fetchOne(
            "SELECT id FROM favorite_series WHERE iracing_series_id = ?",
            [$seriesId]
        );

        if ($existing) {
            $db->query(
                "UPDATE favorite_series SET series_name = ?, category = ?, license_group = ?, updated_at = ?
                 WHERE iracing_series_id = ?",
                [$seriesName, $seriesCategory, $licenseGroup, $now, $seriesId]
            );
            $updated++;
        } else {
            $db->query(
                "INSERT INTO favorite_series (iracing_series_id, series_name, category, license_group, is_favorite, updated_at)
                 VALUES (?, ?, ?, ?, 0, ?)",
                [$seriesId, $seriesName, $seriesCategory, $licenseGroup, $now]
            );
            $inserted++;
        }
    } catch (Throwable $e) {
        $errors++;
        if (DEBUG_MODE) {
            error_log("[sync] Error inserting series {$seriesId}: {$e->getMessage()}");
        }
    }
}

$responseData = [
    'success'  => true,
    'inserted' => $inserted,
    'updated'  => $updated,
    'skipped'  => $skipped,
    'total'    => $inserted + $updated,
    'message'  => "Synced {$inserted} new + {$updated} updated series from iRacing.",
];

if ($errors > 0) {
    $responseData['errors'] = $errors;
}

// Include debug info when no series were synced
if ($inserted + $updated === 0 && DEBUG_MODE) {
    $responseData['debug'] = [
        'data_type'       => gettype($data),
        'data_is_array'   => is_array($data),
        'data_count'      => is_array($data) ? count($data) : 0,
        'top_keys'        => is_array($data) ? array_slice(array_keys($data), 0, 10) : [],
        'first_item_keys' => (is_array($data) && isset($data[0]) && is_array($data[0]))
                             ? array_keys($data[0]) : 'N/A',
        'series_list_count' => is_array($seriesList) ? count($seriesList) : 0,
        'filter_category' => $category,
    ];
}

jsonResponse($responseData);

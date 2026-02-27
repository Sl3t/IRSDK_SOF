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

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL            => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
    CURLOPT_HTTPHEADER     => [
        'Accept: application/json',
        "Authorization: Bearer {$accessToken}",
    ],
    CURLOPT_SSL_VERIFYPEER => true,
]);

$response  = curl_exec($ch);
$httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($response === false) {
    jsonError("iRacing API connection failed: {$curlError}", 502);
}

if ($httpCode >= 400) {
    jsonError("iRacing API returned HTTP {$httpCode}: " . mb_substr($response, 0, 300), $httpCode);
}

$data = json_decode($response, true);

// iRacing may return { "link": "https://..." } — follow it
if (is_array($data) && isset($data['link']) && count($data) === 1) {
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
// Map category names from iRacing to our schema
// ============================================================================

$categoryMap = [
    'road'      => 'road',
    'oval'      => 'oval',
    'dirt_road'  => 'dirt_road',
    'dirt_oval'  => 'dirt_oval',
    'sports_car' => 'road',
    'formula_car' => 'road',
];

// ============================================================================
// Insert/update series in the database
// ============================================================================

$inserted = 0;
$updated  = 0;
$skipped  = 0;

$now = date('Y-m-d H:i:s');

foreach ($data as $series) {
    $seriesId   = (int)($series['series_id'] ?? $series['series_short_name_id'] ?? 0);
    $seriesName = $series['series_name'] ?? $series['series_short_name'] ?? 'Unknown';

    // Determine category
    $rawCategory = strtolower($series['category'] ?? '');
    if (empty($rawCategory)) {
        // Try category_id: 1=oval, 2=road, 3=dirt_oval, 4=dirt_road
        $catId = (int)($series['category_id'] ?? 0);
        $catMap = [1 => 'oval', 2 => 'road', 3 => 'dirt_oval', 4 => 'dirt_road'];
        $rawCategory = $catMap[$catId] ?? 'road';
    }
    $seriesCategory = $categoryMap[$rawCategory] ?? $rawCategory;

    // Filter by category if specified
    if ($category !== '' && $seriesCategory !== $category) {
        $skipped++;
        continue;
    }

    // Determine license group
    $licenseGroup = '';
    if (isset($series['min_license_level'])) {
        $level = (int)$series['min_license_level'];
        if ($level >= 18) $licenseGroup = 'A';
        elseif ($level >= 14) $licenseGroup = 'B';
        elseif ($level >= 10) $licenseGroup = 'C';
        elseif ($level >= 6)  $licenseGroup = 'D';
        else $licenseGroup = 'R';
    } elseif (isset($series['license_group'])) {
        $licenseGroup = $series['license_group'];
    }

    if ($seriesId <= 0) continue;

    // Check if series already exists
    $existing = $db->fetchOne(
        "SELECT id FROM favorite_series WHERE iracing_series_id = ?",
        [$seriesId]
    );

    if ($existing) {
        $db->execute(
            "UPDATE favorite_series SET series_name = ?, category = ?, license_group = ?, updated_at = ?
             WHERE iracing_series_id = ?",
            [$seriesName, $seriesCategory, $licenseGroup, $now, $seriesId]
        );
        $updated++;
    } else {
        $db->execute(
            "INSERT INTO favorite_series (iracing_series_id, series_name, category, license_group, is_favorite, updated_at)
             VALUES (?, ?, ?, ?, 0, ?)",
            [$seriesId, $seriesName, $seriesCategory, $licenseGroup, $now]
        );
        $inserted++;
    }
}

jsonResponse([
    'success'  => true,
    'inserted' => $inserted,
    'updated'  => $updated,
    'skipped'  => $skipped,
    'total'    => $inserted + $updated,
    'message'  => "Synced {$inserted} new + {$updated} updated series from iRacing.",
]);

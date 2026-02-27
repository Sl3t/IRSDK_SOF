<?php
/**
 * IRSDK SOF Agent — Debug Series Sync
 *
 * Returns the raw response from the iRacing /data/series/get endpoint
 * so we can inspect the actual field names and structure.
 *
 * GET /api/series/debug-sync
 *
 * @package IRSDK_SOF
 */

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../iracing/crypto.php';

setCorsHeaders();
requireMethod('GET');

$db  = Database::getInstance();
$key = _getEncryptionKey();

// Get access token
$encToken  = $db->getSetting('oauth_access_token');
$expiresAt = $db->getSetting('oauth_token_expires_at');

if (!$encToken) {
    jsonError('No access token stored. Authenticate first.', 401);
}

$accessToken = _decrypt($encToken, $key);

// Fetch series
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
    jsonError("cURL error: {$curlError}", 502);
}

$step1 = json_decode($response, true);

// Follow link if needed
$step2 = null;
if (is_array($step1) && isset($step1['link'])) {
    $ch2 = curl_init();
    curl_setopt_array($ch2, [
        CURLOPT_URL            => $step1['link'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $response2 = curl_exec($ch2);
    $httpCode2 = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
    curl_close($ch2);

    $step2 = json_decode($response2, true);
}

$finalData = $step2 ?? $step1;

// Analyze the structure
$info = [
    'step1_http_code' => $httpCode,
    'step1_type'      => gettype($step1),
    'step1_is_array'  => is_array($step1),
    'had_link'        => ($step2 !== null),
    'final_type'      => gettype($finalData),
    'final_is_array'  => is_array($finalData),
    'final_count'     => is_array($finalData) ? count($finalData) : 0,
];

// Show keys at top level
if (is_array($finalData) && !empty($finalData)) {
    $info['top_level_keys'] = array_keys($finalData);

    // If it's a sequential array, show first 2 items
    if (isset($finalData[0])) {
        $info['first_item_keys'] = is_array($finalData[0]) ? array_keys($finalData[0]) : 'not_array';
        $info['first_item'] = $finalData[0];
        if (isset($finalData[1])) {
            $info['second_item'] = $finalData[1];
        }
    } else {
        // Associative array — show the keys and types
        $info['structure'] = 'associative';
        foreach ($finalData as $k => $v) {
            $info['key_types'][$k] = is_array($v)
                ? 'array(' . count($v) . ')'
                : gettype($v) . ': ' . mb_substr((string)$v, 0, 100);
        }
        // If any value is an array of items, show first item
        foreach ($finalData as $k => $v) {
            if (is_array($v) && !empty($v) && isset($v[0]) && is_array($v[0])) {
                $info["first_item_in_{$k}"] = $v[0];
                $info["keys_in_{$k}"] = array_keys($v[0]);
                break;
            }
        }
    }
}

// Also check the DB for existing series count
$dbCount = $db->fetchOne("SELECT COUNT(*) as cnt FROM favorite_series");
$info['db_series_count'] = $dbCount ? (int)$dbCount['cnt'] : 0;

jsonResponse($info);

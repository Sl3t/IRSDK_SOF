<?php
/**
 * IRSDK SOF Agent — Live Track Conditions Endpoint
 *
 * GET /api/conditions/live.php
 *
 * Returns only the track_conditions block from the bridge live data file.
 * This is a lightweight endpoint optimized for the conditions panel which
 * needs frequent updates without the full driver list payload.
 *
 * Response (connected):
 *   {
 *     "connected": true,
 *     "track_conditions": {
 *       "track_surface_temp_c": 38.2,
 *       "air_temp_c": 22.5,
 *       "track_wetness": "dry",
 *       ...
 *     },
 *     "session_type": "Race",
 *     "track_name": "Spa-Francorchamps",
 *     "timestamp": "..."
 *   }
 *
 * Response (disconnected):
 *   { "connected": false, "reason": "..." }
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
// Configuration
// ---------------------------------------------------------------------------

$liveDataFile = realpath(__DIR__ . '/../../bridge') . '/live-data.json';
$maxAge       = 10; // seconds

// ---------------------------------------------------------------------------
// Read and validate the live data file
// ---------------------------------------------------------------------------

if (!file_exists($liveDataFile)) {
    jsonResponse([
        'connected' => false,
        'reason'    => 'Bridge live-data file not found.',
    ]);
}

$fileModTime = filemtime($liveDataFile);
$age         = time() - $fileModTime;

if ($age > $maxAge) {
    jsonResponse([
        'connected'    => false,
        'reason'       => "Bridge data is stale ({$age}s old).",
        'last_updated' => date('Y-m-d H:i:s', $fileModTime),
        'age_seconds'  => $age,
    ]);
}

$raw = file_get_contents($liveDataFile);

if ($raw === false || $raw === '') {
    jsonResponse([
        'connected' => false,
        'reason'    => 'Bridge live-data file is empty or unreadable.',
    ]);
}

$data = json_decode($raw, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    jsonResponse([
        'connected' => false,
        'reason'    => 'Invalid JSON in bridge data file.',
    ]);
}

$irsdkConnected = $data['connection']['iracing_running'] ?? false;

if (!$irsdkConnected) {
    jsonResponse([
        'connected' => false,
        'reason'    => 'iRacing is not running.',
    ]);
}

// ---------------------------------------------------------------------------
// Return only the track conditions block
// ---------------------------------------------------------------------------

jsonResponse([
    'connected'        => true,
    'track_conditions' => $data['track_conditions'] ?? null,
    'session_type'     => $data['session']['session_type'] ?? null,
    'track_name'       => $data['session']['track_name'] ?? null,
    'series_name'      => $data['session']['series_name'] ?? null,
    'timestamp'        => $data['timestamp'] ?? date('c'),
    'age_seconds'      => $age,
]);

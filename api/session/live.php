<?php
/**
 * IRSDK SOF Agent — Live Session Data Endpoint
 *
 * GET /api/session/live.php
 *
 * Reads live session data from the JSON file written by the Node.js bridge.
 * The bridge writes to bridge/live-data.json on each session_update event.
 * If the file does not exist or is stale (> 10 seconds old), the response
 * indicates that the bridge is not connected.
 *
 * Response (connected):
 *   { "connected": true, "session": {...}, "drivers": [...], "track_conditions": {...}, "sof": {...}, "timestamp": "..." }
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

/** Path to the live data file written by the Node.js bridge. */
$liveDataFile = realpath(__DIR__ . '/../../bridge') . '/live-data.json';

/** Maximum age (in seconds) before the data is considered stale. */
$maxAge = 10;

// ---------------------------------------------------------------------------
// Read and validate the live data file
// ---------------------------------------------------------------------------

// Check if the file exists.
if (!file_exists($liveDataFile)) {
    jsonResponse([
        'connected' => false,
        'reason'    => 'Bridge live-data file not found. The Node.js bridge may not be running.',
        'file'      => basename($liveDataFile),
    ]);
}

// Check file freshness.
$fileModTime = filemtime($liveDataFile);
$age = time() - $fileModTime;

if ($age > $maxAge) {
    jsonResponse([
        'connected'    => false,
        'reason'       => "Bridge data is stale ({$age}s old, max {$maxAge}s). The bridge may have stopped.",
        'last_updated' => date('Y-m-d H:i:s', $fileModTime),
        'age_seconds'  => $age,
    ]);
}

// Read and parse the JSON file.
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
        'reason'    => 'Bridge live-data file contains invalid JSON: ' . json_last_error_msg(),
    ]);
}

// ---------------------------------------------------------------------------
// Check the connection status within the data
// ---------------------------------------------------------------------------

$irsdkConnected = $data['connection']['iracing_running'] ?? false;
$inSession      = $data['connection']['in_session'] ?? false;

if (!$irsdkConnected) {
    jsonResponse([
        'connected'    => false,
        'reason'       => 'iRacing is not running on the host machine.',
        'timestamp'    => $data['timestamp'] ?? null,
        'age_seconds'  => $age,
    ]);
}

// ---------------------------------------------------------------------------
// Return full live data
// ---------------------------------------------------------------------------

jsonResponse([
    'connected'        => true,
    'in_session'       => $inSession,
    'timestamp'        => $data['timestamp'] ?? date('c'),
    'age_seconds'      => $age,
    'session'          => $data['session'] ?? null,
    'drivers'          => $data['drivers'] ?? [],
    'track_conditions' => $data['track_conditions'] ?? null,
    'sof'              => $data['sof'] ?? null,
]);

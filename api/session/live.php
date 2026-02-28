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
// Resolve series name from local DB using SeriesID from IRSDK
// ---------------------------------------------------------------------------

$session = $data['session'] ?? null;

if ($session) {
    $seriesId = $session['series_id'] ?? null;
    $currentName = $session['series_name'] ?? null;

    // If IRSDK didn't provide a useful series name but we have a SeriesID,
    // look it up in our local favorite_series table (populated by /api/series/sync).
    // Also auto-star the series as favorite since the user is actively racing it.
    if ($seriesId) {
        try {
            $db = Database::getInstance();
            $row = $db->fetchOne(
                "SELECT series_name, is_favorite FROM favorite_series WHERE iracing_series_id = ?",
                [(int) $seriesId]
            );
            if ($row) {
                // Resolve name if IRSDK only gave a fallback
                if (!$currentName || strpos($currentName, ' — ') !== false) {
                    if (!empty($row['series_name'])) {
                        $session['series_name'] = $row['series_name'];
                    }
                }
                // Auto-favorite: the user is racing this series, star it
                if (!$row['is_favorite']) {
                    $db->update('favorite_series', [
                        'is_favorite' => 1,
                        'updated_at'  => date('Y-m-d H:i:s'),
                    ], 'iracing_series_id = ?', [(int) $seriesId]);
                }
            }
        } catch (Exception $e) {
            // DB lookup failed — keep the original name, don't break the response
        }
    }
}

// ---------------------------------------------------------------------------
// Return full live data
// ---------------------------------------------------------------------------

jsonResponse([
    'connected'        => true,
    'in_session'       => $inSession,
    'timestamp'        => $data['timestamp'] ?? date('c'),
    'age_seconds'      => $age,
    'session'          => $session,
    'drivers'          => $data['drivers'] ?? [],
    'track_conditions' => $data['track_conditions'] ?? null,
    'sof'              => $data['sof'] ?? null,
]);

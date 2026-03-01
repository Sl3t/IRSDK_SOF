<?php
/**
 * IRSDK SOF Agent — Fetch Upcoming Race Sessions for a Series
 *
 * POST /api/series/fetch-sessions.php
 * Body: { "series_id": 280 }
 *
 * Calls iRacing /data/season/race_guide to get upcoming sessions,
 * then stores them in the series_race_sessions table.
 * Also discovers ALL open practice sessions for each upcoming race.
 *
 * @package IRSDK_SOF
 */

declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../iracing/crypto.php';

setCorsHeaders();
requireMethod('POST');

$input = getJsonInput();

$seriesId = (int) ($input['series_id'] ?? 0);
if ($seriesId <= 0) {
    jsonError('series_id is required and must be > 0', 400);
}

$db = Database::getInstance();

// Check series exists
$series = $db->fetchOne(
    "SELECT iracing_series_id, series_name, race_interval_minutes
     FROM favorite_series WHERE iracing_series_id = ?",
    [$seriesId]
);

if (!$series) {
    jsonError("Series not found: {$seriesId}", 404);
}

// ============================================================================
// Helper: Make an authenticated iRacing API request via internal proxy call
// ============================================================================

/**
 * Call the iRacing API via our proxy endpoint.
 * @param string $endpoint iRacing API path (e.g., /data/season/race_guide)
 * @param array $params Query parameters
 * @return array Decoded JSON response
 */
function callIRacingAPI(string $endpoint, array $params = []): array
{
    $db  = Database::getInstance();
    $key = _getEncryptionKey();

    $expiresAt = $db->getSetting('oauth_token_expires_at');
    $encToken  = $db->getSetting('oauth_access_token');

    if (!$encToken || !$expiresAt || strtotime($expiresAt) <= time()) {
        throw new RuntimeException('No valid access token. Authenticate in Settings first.');
    }

    $accessToken = _decrypt($encToken, $key);

    $queryString = !empty($params) ? '?' . http_build_query($params) : '';
    $url = IRACING_API_BASE_URL . $endpoint . $queryString;

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

    if ($response === false || $httpCode >= 400) {
        throw new RuntimeException("iRacing API returned HTTP {$httpCode}");
    }

    $decoded = json_decode($response, true);

    // Follow iRacing redirect link pattern
    if (is_array($decoded) && isset($decoded['link'])) {
        $ch2 = curl_init();
        curl_setopt_array($ch2, [
            CURLOPT_URL            => $decoded['link'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $response = curl_exec($ch2);
        curl_close($ch2);
        $decoded = json_decode($response, true);
    }

    if (!is_array($decoded)) {
        throw new RuntimeException('Invalid response from iRacing API');
    }

    return $decoded;
}

// ============================================================================
// Fetch race guide from iRacing
// ============================================================================

try {
    $raceGuide = callIRacingAPI('/data/season/race_guide', [
        'from' => gmdate('Y-m-d\TH:i:s\Z'),
        'include_end_after_from' => 'true',
    ]);
} catch (Throwable $e) {
    jsonError('Failed to fetch race guide: ' . $e->getMessage(), 502);
}

// Extract sessions array from the response
$guideSessions = $raceGuide['sessions'] ?? $raceGuide['races'] ?? $raceGuide;
if (!is_array($guideSessions)) {
    jsonError('Unexpected race guide response format', 502);
}

// ============================================================================
// Filter sessions for this series and store them
// ============================================================================

$now = now();
$insertedCount = 0;
$updatedCount = 0;

$db->beginTransaction();

try {
    foreach ($guideSessions as $gs) {
        $gsSeriesId = (int) ($gs['series_id'] ?? 0);
        if ($gsSeriesId !== $seriesId) {
            continue;
        }

        $sessionId = (int) ($gs['session_id'] ?? $gs['subsession_id'] ?? 0);
        $raceStartUtc = $gs['start_time'] ?? $gs['race_time_utc'] ?? $gs['session_start_utc'] ?? '';

        if (empty($raceStartUtc)) {
            continue;
        }

        // Collect practice session IDs for this race
        // iRacing race_guide may have subessions or we look for practice entries
        $practiceIds = [];
        if (isset($gs['practice_sessions']) && is_array($gs['practice_sessions'])) {
            foreach ($gs['practice_sessions'] as $ps) {
                $practiceIds[] = (int) ($ps['session_id'] ?? $ps['subsession_id'] ?? 0);
            }
        }
        // Also check if parent sessions include practice types
        if (isset($gs['session_types']) && is_array($gs['session_types'])) {
            foreach ($gs['session_types'] as $st) {
                $type = strtolower($st['type'] ?? $st['session_type'] ?? '');
                if (str_contains($type, 'practice') || str_contains($type, 'open')) {
                    $practiceIds[] = (int) ($st['session_id'] ?? $st['subsession_id'] ?? 0);
                }
            }
        }

        $practiceIdsJson = !empty($practiceIds) ? json_encode(array_unique(array_filter($practiceIds))) : null;

        // Check if session already exists
        $existing = $db->fetchOne(
            "SELECT id, status FROM series_race_sessions WHERE series_id = ? AND race_start_utc = ?",
            [$seriesId, $raceStartUtc]
        );

        if ($existing) {
            // Update only if not yet completed
            if ($existing['status'] !== 'completed') {
                $db->update('series_race_sessions', [
                    'session_id' => $sessionId > 0 ? $sessionId : null,
                    'practice_session_ids' => $practiceIdsJson,
                    'updated_at' => $now,
                ], 'id = ?', [(int) $existing['id']]);
                $updatedCount++;
            }
        } else {
            $db->insert('series_race_sessions', [
                'series_id'            => $seriesId,
                'session_id'           => $sessionId > 0 ? $sessionId : null,
                'race_start_utc'       => $raceStartUtc,
                'registration_open'    => 1,
                'status'               => 'upcoming',
                'practice_session_ids' => $practiceIdsJson,
                'created_at'           => $now,
                'updated_at'           => $now,
            ]);
            $insertedCount++;
        }
    }

    $db->commit();
} catch (Throwable $e) {
    $db->rollBack();
    jsonError('Database error: ' . $e->getMessage(), 500);
}

// ============================================================================
// Clean up old completed sessions (older than 24h)
// ============================================================================

$db->query(
    "DELETE FROM series_race_sessions WHERE series_id = ? AND race_start_utc < datetime('now', '-24 hours')",
    [$seriesId]
);

// ============================================================================
// Return all current sessions
// ============================================================================

$allSessions = $db->fetchAll(
    "SELECT * FROM series_race_sessions WHERE series_id = ? ORDER BY race_start_utc ASC",
    [$seriesId]
);

jsonResponse([
    'success'       => true,
    'series_id'     => $seriesId,
    'inserted'      => $insertedCount,
    'updated'       => $updatedCount,
    'total_sessions' => count($allSessions),
    'sessions'      => $allSessions,
]);

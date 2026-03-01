<?php
/**
 * IRSDK SOF Agent — Registration Polling Endpoint
 *
 * Polls the iRacing /data/session/reg_drivers_list endpoint and stores
 * driver registrations in the registration_entries table.
 *
 * IMPORTANT: Polls ALL open practice sessions for the series, not just one.
 * Practice session IDs are read from series_race_sessions.practice_session_ids.
 * If no practice sessions are known, falls back to session_id from the request.
 *
 * Logic:
 *   - First poll for a race_start_utc: all drivers are marked is_baseline = 1
 *   - Subsequent polls: only NEW drivers are inserted with is_baseline = 0
 *   - Existing drivers are never updated (we track first_seen_at)
 *   - Drivers from ALL practice sessions are merged into a single pool
 *
 * Method: POST
 * Body: { "series_id": 280, "race_start_utc": "2026-03-01T18:00:00Z", "session_id": 12345 }
 *        session_id is optional if practice_session_ids are stored in series_race_sessions
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

$sessionId    = (int)   ($input['session_id']    ?? 0);
$seriesId     = (int)   ($input['series_id']     ?? 0);
$raceStartUtc = (string)($input['race_start_utc'] ?? '');

if ($seriesId <= 0) {
    jsonError('series_id is required and must be > 0', 400);
}
if ($raceStartUtc === '') {
    jsonError('race_start_utc is required', 400);
}

$db = Database::getInstance();

// ============================================================================
// Determine ALL session IDs to poll (practice sessions + main session)
// ============================================================================

$sessionIdsToPoll = [];

// 1. Look up practice session IDs from series_race_sessions
$raceSession = $db->fetchOne(
    "SELECT id, session_id, practice_session_ids FROM series_race_sessions
     WHERE series_id = ? AND race_start_utc = ?",
    [$seriesId, $raceStartUtc]
);

if ($raceSession) {
    // Use the stored session_id if none was provided
    if ($sessionId <= 0 && !empty($raceSession['session_id'])) {
        $sessionId = (int)$raceSession['session_id'];
    }

    // Parse practice_session_ids (stored as JSON array)
    if (!empty($raceSession['practice_session_ids'])) {
        $practiceIds = json_decode($raceSession['practice_session_ids'], true);
        if (is_array($practiceIds)) {
            foreach ($practiceIds as $pid) {
                $pid = (int)$pid;
                if ($pid > 0) {
                    $sessionIdsToPoll[] = $pid;
                }
            }
        }
    }
}

// 2. Always include the main session_id
if ($sessionId > 0) {
    $sessionIdsToPoll[] = $sessionId;
}

// Deduplicate
$sessionIdsToPoll = array_unique(array_filter($sessionIdsToPoll));

if (empty($sessionIdsToPoll)) {
    jsonError('No session IDs available. Provide session_id or fetch sessions first.', 400);
}

// ============================================================================
// Fetch registered drivers from iRacing API
// ============================================================================

/**
 * Make an authenticated iRacing API request for a single session.
 */
function fetchRegisteredDrivers(int $sessionId): array
{
    $db  = Database::getInstance();
    $key = _getEncryptionKey();

    $expiresAt = $db->getSetting('oauth_token_expires_at');
    $encToken  = $db->getSetting('oauth_access_token');

    if (!$encToken || !$expiresAt || strtotime($expiresAt) <= time()) {
        throw new RuntimeException('No valid access token. Authenticate in Settings first.');
    }

    $accessToken = _decrypt($encToken, $key);
    $url = IRACING_API_BASE_URL . '/data/session/reg_drivers_list?session_id=' . $sessionId
         . '&subsession_id=' . $sessionId;

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
        throw new RuntimeException("iRacing API returned HTTP {$httpCode} for session {$sessionId}");
    }

    $decoded = json_decode($response, true);

    // iRacing returns { "link": "..." } pattern — follow the redirect
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
        throw new RuntimeException("Invalid response from iRacing API for session {$sessionId}");
    }

    return $decoded;
}

/**
 * Extract entries array from an iRacing API response.
 */
function extractEntries(array $apiResponse): array
{
    $entries = $apiResponse['entries']
        ?? $apiResponse['rows']
        ?? $apiResponse['drivers']
        ?? (isset($apiResponse[0]) ? $apiResponse : []);

    return is_array($entries) ? $entries : [];
}

// ============================================================================
// Poll ALL sessions and merge entries
// ============================================================================

$allEntries = [];
$polledSessions = [];
$pollErrors = [];

foreach ($sessionIdsToPoll as $pollSessionId) {
    try {
        $apiResponse = fetchRegisteredDrivers($pollSessionId);
        $entries = extractEntries($apiResponse);
        $polledSessions[] = $pollSessionId;

        // Merge entries, keyed by customer_id to avoid duplicates across sessions
        foreach ($entries as $entry) {
            $custId = (int)($entry['cust_id'] ?? $entry['customer_id'] ?? $entry['custid'] ?? 0);
            if ($custId > 0 && !isset($allEntries[$custId])) {
                $allEntries[$custId] = $entry;
            }
        }
    } catch (Throwable $e) {
        $pollErrors[] = "Session {$pollSessionId}: " . $e->getMessage();
    }
}

if (empty($allEntries) && !empty($pollErrors)) {
    jsonError('Failed to fetch drivers from any session: ' . implode('; ', $pollErrors), 502);
}

// ============================================================================
// Check if a baseline already exists for this race
// ============================================================================

$baselineExists = (bool)$db->fetchOne(
    "SELECT 1 FROM registration_entries WHERE series_id = ? AND race_start_utc = ? AND is_baseline = 1 LIMIT 1",
    [$seriesId, $raceStartUtc]
);

// ============================================================================
// Process each entry and store in DB
// ============================================================================

$newCount = 0;
$skippedCount = 0;
$newcomers = [];
$now = now();

$db->beginTransaction();

try {
    foreach ($allEntries as $entry) {
        // Extract fields — handle various iRacing field naming conventions
        $customerId  = (int)($entry['cust_id'] ?? $entry['customer_id'] ?? $entry['custid'] ?? 0);
        $displayName = (string)($entry['display_name'] ?? $entry['name'] ?? $entry['driver_name'] ?? '');
        $carName     = (string)($entry['car_name'] ?? $entry['car'] ?? '');

        // iRating can be at top level or nested in license object
        $irating = 0;
        if (isset($entry['irating'])) {
            $irating = (int)$entry['irating'];
        } elseif (isset($entry['i_rating'])) {
            $irating = (int)$entry['i_rating'];
        } elseif (isset($entry['license']['irating'])) {
            $irating = (int)$entry['license']['irating'];
        } elseif (isset($entry['license']['i_rating'])) {
            $irating = (int)$entry['license']['i_rating'];
        } elseif (isset($entry['license_info']['irating'])) {
            $irating = (int)$entry['license_info']['irating'];
        }

        // License string (e.g., "B 3.45")
        $license = '';
        if (isset($entry['license_string'])) {
            $license = (string)$entry['license_string'];
        } elseif (isset($entry['license']['group_name'])) {
            $license = (string)$entry['license']['group_name'];
        }

        if ($customerId <= 0) continue;

        // Check if this driver is already in our records for this race
        $existing = $db->fetchOne(
            "SELECT id FROM registration_entries WHERE series_id = ? AND race_start_utc = ? AND customer_id = ?",
            [$seriesId, $raceStartUtc, $customerId]
        );

        if ($existing) {
            $skippedCount++;
            continue;
        }

        // Determine baseline status:
        // If no baseline exists yet, this is the first poll → all are baseline
        // If baseline exists, new drivers are newcomers (is_baseline = 0)
        $isBaseline = $baselineExists ? 0 : 1;

        $db->insert('registration_entries', [
            'series_id'      => $seriesId,
            'session_id'     => $sessionId > 0 ? $sessionId : ($polledSessions[0] ?? null),
            'race_start_utc' => $raceStartUtc,
            'customer_id'    => $customerId,
            'display_name'   => $displayName,
            'irating'        => $irating,
            'license'        => $license,
            'car_name'       => $carName,
            'is_baseline'    => $isBaseline,
            'first_seen_at'  => $now,
        ]);

        $newCount++;

        // Track newcomers (only non-baseline entries)
        if ($isBaseline === 0) {
            $newcomers[] = [
                'customer_id'  => $customerId,
                'display_name' => $displayName,
                'irating'      => $irating,
            ];
        }
    }

    $db->commit();
} catch (Throwable $e) {
    $db->rollBack();
    jsonError('Database error: ' . $e->getMessage(), 500);
}

// ============================================================================
// Update series_race_sessions with counts
// ============================================================================

$allNewcomers = $db->fetchAll(
    "SELECT customer_id, display_name, irating FROM registration_entries
     WHERE series_id = ? AND race_start_utc = ? AND is_baseline = 0 AND irating > 0
     ORDER BY irating DESC",
    [$seriesId, $raceStartUtc]
);

$newcomerIratings = array_map(fn($r) => (int)$r['irating'], $allNewcomers);
$predictiveSof = count($newcomerIratings) > 0
    ? (int)round(array_sum($newcomerIratings) / count($newcomerIratings))
    : 0;

$baselineCount = (int)$db->fetchOne(
    "SELECT COUNT(*) as cnt FROM registration_entries WHERE series_id = ? AND race_start_utc = ? AND is_baseline = 1",
    [$seriesId, $raceStartUtc]
)['cnt'];

// Update the race session record
$newStatus = $baselineExists ? 'polling' : 'baseline_collected';
if ($raceSession) {
    $db->update('series_race_sessions', [
        'baseline_count'  => $baselineCount,
        'newcomer_count'  => count($allNewcomers),
        'predictive_sof'  => $predictiveSof,
        'status'          => $newStatus,
        'updated_at'      => $now,
    ], 'id = ?', [(int)$raceSession['id']]);
}

jsonResponse([
    'success'           => true,
    'baseline_count'    => $baselineCount,
    'newcomer_count'    => count($allNewcomers),
    'new_this_poll'     => $newCount,
    'skipped'           => $skippedCount,
    'predictive_sof'    => $predictiveSof,
    'newcomers'         => $allNewcomers,
    'is_first_poll'     => !$baselineExists,
    'race_start_utc'    => $raceStartUtc,
    'polled_sessions'   => $polledSessions,
    'poll_errors'       => $pollErrors,
    'total_entries_merged' => count($allEntries),
]);

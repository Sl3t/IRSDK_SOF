<?php
/**
 * IRSDK SOF Agent — iRacing API Proxy with Caching
 *
 * Proxies requests to the iRacing Data API, handling OAuth2 token refresh
 * and caching responses in the api_cache table to respect rate limits.
 *
 * Method: GET
 * Parameters:
 *   ?endpoint=/data/series/get&param1=value1&param2=value2...
 *
 * The "endpoint" parameter specifies the iRacing API path to call.
 * All other query parameters are forwarded to the iRacing API.
 *
 * Response: The raw JSON data from the iRacing API, cached if applicable.
 *
 * Cache behavior:
 *   - Checks api_cache table for a valid (non-expired) cached response
 *   - If cached: returns the cached data immediately
 *   - If not cached: calls the iRacing API, caches the response, returns it
 *   - On 401: attempts to refresh the OAuth token and retries once
 *
 * @package IRSDK_SOF
 */

declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';

// Set CORS headers and handle preflight
setCorsHeaders();

// Only accept GET requests
requireMethod('GET');

// Get the iRacing API endpoint to proxy
$endpoint = requireParam('endpoint');

// Collect all other query parameters (excluding "endpoint" itself)
$params = $_GET;
unset($params['endpoint']);

// Build a cache key from the endpoint + parameters
$cacheHash = paramsHash(['endpoint' => $endpoint, 'params' => $params]);

// ============================================================================
// Check cache first
// ============================================================================

$db = Database::getInstance();

try {
    $cached = $db->getCachedResponse($endpoint, $cacheHash);
    if ($cached !== null) {
        // Return cached response directly
        header('X-Cache: HIT');
        header('Content-Type: application/json; charset=utf-8');
        echo $cached;
        exit;
    }
} catch (Throwable $e) {
    // Cache miss or error — proceed to live API call
    if (DEBUG_MODE) {
        error_log("[proxy] Cache lookup error: {$e->getMessage()}");
    }
}

header('X-Cache: MISS');

// ============================================================================
// Load authentication credentials
// ============================================================================

/**
 * Load the stored OAuth credentials and make an authenticated request.
 * Returns the raw response body or throws on failure.
 */
function makeIRacingRequest(string $endpoint, array $params): string
{
    $baseUrl = IRACING_API_BASE_URL;

    // Build the full URL with query parameters
    $queryString = !empty($params) ? '?' . http_build_query($params) : '';
    $url = $baseUrl . $endpoint . $queryString;

    // Cookie file for iRacing session authentication
    $cookieFile = sys_get_temp_dir() . '/irsdk_sof_cookies.txt';

    // Make the API request
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER     => [
            'Accept: application/json',
        ],
        CURLOPT_COOKIEFILE     => $cookieFile,
        CURLOPT_COOKIEJAR      => $cookieFile,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response  = curl_exec($ch);
    $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        throw new RuntimeException("cURL error: {$curlError}");
    }

    if ($httpCode === 401) {
        throw new UnauthorizedException('Authentication expired or invalid.');
    }

    if ($httpCode >= 400) {
        throw new RuntimeException("iRacing API returned HTTP {$httpCode}: {$response}");
    }

    // iRacing sometimes returns a link object pointing to the actual data
    // e.g. { "link": "https://..." } — follow the link to get the real data
    $decoded = json_decode($response, true);
    if (is_array($decoded) && isset($decoded['link']) && count($decoded) === 1) {
        return _followLink($decoded['link']);
    }

    return $response;
}

/**
 * Follow a redirect link returned by the iRacing API.
 * Some endpoints return { "link": "https://s3.amazonaws.com/..." } and
 * the actual data is at that URL.
 *
 * @param  string $url The redirect URL
 * @return string      The response body from the redirect
 */
function _followLink(string $url): string
{
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response  = curl_exec($ch);
    $httpCode  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        throw new RuntimeException("Link follow failed: {$curlError}");
    }

    if ($httpCode >= 400) {
        throw new RuntimeException("Link returned HTTP {$httpCode}");
    }

    return $response;
}

/**
 * Attempt to re-authenticate with iRacing using stored credentials.
 * This refreshes the session cookie used for API requests.
 *
 * @return bool True if re-authentication succeeded
 */
function refreshAuth(): bool
{
    $db  = Database::getInstance();
    $key = _getEncryptionKey();

    $encId     = $db->getSetting('oauth_client_id');
    $encSecret = $db->getSetting('oauth_client_secret');

    if (!$encId || !$encSecret) {
        return false;
    }

    try {
        $clientId     = _decrypt($encId, $key);
        $clientSecret = _decrypt($encSecret, $key);
    } catch (Throwable $e) {
        return false;
    }

    // Re-authenticate
    $encodedPassword = base64_encode(
        hash('sha256', $clientSecret . strtolower($clientId), true)
    );

    $tokenUrl = IRACING_OAUTH_TOKEN_URL;
    $postData = http_build_query([
        'email'    => $clientId,
        'password' => $encodedPassword,
    ]);

    $cookieFile = sys_get_temp_dir() . '/irsdk_sof_cookies.txt';

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $tokenUrl,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $postData,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/x-www-form-urlencoded',
        ],
        CURLOPT_COOKIEJAR      => $cookieFile,
        CURLOPT_COOKIEFILE     => $cookieFile,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode >= 200 && $httpCode < 300) {
        $db->setSetting('oauth_authenticated_at', now());
        return true;
    }

    return false;
}

/**
 * Determine the cache TTL for a given endpoint path.
 * Uses constants from config.php, which can be overridden in settings.
 *
 * @param  string $endpoint The iRacing API endpoint path
 * @return int              TTL in seconds
 */
function getCacheTTL(string $endpoint): int
{
    // Match endpoint patterns to TTL values
    if (str_contains($endpoint, '/data/series'))           return CACHE_TTL_SERIES;
    if (str_contains($endpoint, '/data/member/profile'))   return CACHE_TTL_MEMBER_PROFILE;
    if (str_contains($endpoint, '/data/results'))          return CACHE_TTL_RESULTS;
    if (str_contains($endpoint, '/data/stats'))            return CACHE_TTL_DRIVER_STATS;
    if (str_contains($endpoint, '/data/season'))           return CACHE_TTL_SEASON_RESULTS;

    // Default: race guide TTL (short)
    return CACHE_TTL_RACE_GUIDE;
}

// Reuse encryption helpers from auth.php
require_once __DIR__ . '/auth.php';

/**
 * Custom exception for 401 responses (triggers re-auth).
 */
class UnauthorizedException extends RuntimeException {}

// ============================================================================
// Make the API request (with retry on 401)
// ============================================================================

try {
    $responseData = makeIRacingRequest($endpoint, $params);
} catch (UnauthorizedException $e) {
    // Try refreshing authentication and retry once
    if (refreshAuth()) {
        try {
            $responseData = makeIRacingRequest($endpoint, $params);
        } catch (Throwable $retryErr) {
            jsonError("iRacing API error after re-auth: {$retryErr->getMessage()}", 502);
        }
    } else {
        jsonError('iRacing authentication expired. Please re-authenticate in Settings.', 401);
    }
} catch (Throwable $e) {
    jsonError("iRacing API proxy error: {$e->getMessage()}", 502);
}

// ============================================================================
// Cache the response and return it
// ============================================================================

try {
    $ttl = getCacheTTL($endpoint);
    $db->setCachedResponse($endpoint, $cacheHash, $responseData, $ttl);
} catch (Throwable $e) {
    // Non-fatal: log the cache write failure but still return the data
    if (DEBUG_MODE) {
        error_log("[proxy] Cache write error: {$e->getMessage()}");
    }
}

// Return the API response
header('Content-Type: application/json; charset=utf-8');
echo $responseData;
exit;

<?php
/**
 * IRSDK SOF Agent — iRacing API Proxy with Caching
 *
 * Proxies requests to the iRacing Data API using OAuth 2.0 Bearer tokens.
 * Handles token refresh and caches responses in the api_cache table.
 *
 * Method: GET
 * Parameters:
 *   ?endpoint=/data/series/get&param1=value1&param2=value2...
 *
 * @package IRSDK_SOF
 */

declare(strict_types=1);

require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/crypto.php';

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
        header('X-Cache: HIT');
        header('Content-Type: application/json; charset=utf-8');
        echo $cached;
        exit;
    }
} catch (Throwable $e) {
    if (DEBUG_MODE) {
        error_log("[proxy] Cache lookup error: {$e->getMessage()}");
    }
}

header('X-Cache: MISS');

// ============================================================================
// Helper: get valid Bearer token
// ============================================================================

/**
 * Returns a valid access token, refreshing if expired.
 * @return string Bearer access token
 * @throws RuntimeException if no valid token available
 */
function getAccessToken(): string
{
    $db  = Database::getInstance();
    $key = _getEncryptionKey();

    // Check if current token is still valid
    $expiresAt = $db->getSetting('oauth_token_expires_at');
    $encToken  = $db->getSetting('oauth_access_token');

    if ($encToken && $expiresAt && strtotime($expiresAt) > time()) {
        return _decrypt($encToken, $key);
    }

    // Try to refresh
    if (refreshAuth()) {
        $encToken = $db->getSetting('oauth_access_token');
        if ($encToken) {
            return _decrypt($encToken, $key);
        }
    }

    throw new RuntimeException('No valid access token. Please authenticate in Settings.');
}

/**
 * Make an authenticated request to the iRacing Data API.
 */
function makeIRacingRequest(string $endpoint, array $params, string $accessToken): string
{
    $baseUrl = IRACING_API_BASE_URL;
    $queryString = !empty($params) ? '?' . http_build_query($params) : '';
    $url = $baseUrl . $endpoint . $queryString;

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
        throw new RuntimeException("cURL error: {$curlError}");
    }

    if ($httpCode === 401) {
        throw new UnauthorizedException('Bearer token expired or invalid.');
    }

    if ($httpCode >= 400) {
        throw new RuntimeException("iRacing API returned HTTP {$httpCode}: " . mb_substr($response, 0, 300));
    }

    // iRacing returns { "link": "https://...", "expires": "..." } — follow the link
    $decoded = json_decode($response, true);
    if (is_array($decoded) && isset($decoded['link'])) {
        return _followLink($decoded['link']);
    }

    return $response;
}

/**
 * Follow a redirect link returned by the iRacing API.
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
 * Refresh the OAuth token using the stored refresh token.
 */
function refreshAuth(): bool
{
    $db  = Database::getInstance();
    $key = _getEncryptionKey();

    $encRefresh = $db->getSetting('oauth_refresh_token');
    if (!$encRefresh) return false;

    $encClientId     = $db->getSetting('oauth_client_id');
    $encClientSecret = $db->getSetting('oauth_client_secret');
    if (!$encClientId || !$encClientSecret) return false;

    try {
        $refreshToken = _decrypt($encRefresh, $key);
        $clientId     = _decrypt($encClientId, $key);
        $clientSecret = _decrypt($encClientSecret, $key);
    } catch (Throwable $e) {
        return false;
    }

    // Mask the secret: base64(sha256_raw(secret + lowercase(trim(client_id))))
    $maskedSecret = base64_encode(
        hash('sha256', $clientSecret . strtolower(trim($clientId)), true)
    );

    $postFields = http_build_query([
        'grant_type'    => 'refresh_token',
        'client_id'     => $clientId,
        'client_secret' => $maskedSecret,
        'refresh_token' => $refreshToken,
        'scope'         => 'iracing.auth',
    ]);

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => IRACING_OAUTH_TOKEN_URL,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $postFields,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/x-www-form-urlencoded',
            'Accept: application/json',
        ],
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode >= 200 && $httpCode < 300) {
        $data = json_decode($response, true);
        if (!empty($data['access_token'])) {
            $db->setSetting('oauth_access_token', _encrypt($data['access_token'], $key));
            $db->setSetting('oauth_authenticated_at', now());
            $expiresIn = (int)($data['expires_in'] ?? 600);
            $db->setSetting('oauth_token_expires_at', date('Y-m-d H:i:s', time() + $expiresIn));

            if (!empty($data['refresh_token'])) {
                $db->setSetting('oauth_refresh_token', _encrypt($data['refresh_token'], $key));
            }
            return true;
        }
    }

    return false;
}

/**
 * Determine the cache TTL for a given endpoint path.
 */
function getCacheTTL(string $endpoint): int
{
    if (str_contains($endpoint, '/data/series'))           return CACHE_TTL_SERIES;
    if (str_contains($endpoint, '/data/member/profile'))   return CACHE_TTL_MEMBER_PROFILE;
    if (str_contains($endpoint, '/data/results'))          return CACHE_TTL_RESULTS;
    if (str_contains($endpoint, '/data/stats'))            return CACHE_TTL_DRIVER_STATS;
    if (str_contains($endpoint, '/data/season'))           return CACHE_TTL_SEASON_RESULTS;
    return CACHE_TTL_RACE_GUIDE;
}

class UnauthorizedException extends RuntimeException {}

// ============================================================================
// Make the API request (with retry on 401)
// ============================================================================

try {
    $accessToken  = getAccessToken();
    $responseData = makeIRacingRequest($endpoint, $params, $accessToken);
} catch (UnauthorizedException $e) {
    // Try refreshing and retry once
    if (refreshAuth()) {
        try {
            $newToken     = _decrypt($db->getSetting('oauth_access_token'), _getEncryptionKey());
            $responseData = makeIRacingRequest($endpoint, $params, $newToken);
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
    if (DEBUG_MODE) {
        error_log("[proxy] Cache write error: {$e->getMessage()}");
    }
}

header('Content-Type: application/json; charset=utf-8');
echo $responseData;
exit;

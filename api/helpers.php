<?php
/**
 * IRSDK SOF Agent — Utility / Helper Functions
 *
 * Provides common utilities used across all API endpoints:
 * HTTP response helpers, input validation, data formatting, and CORS support.
 *
 * Usage:
 *   require_once __DIR__ . '/helpers.php';
 *   setCorsHeaders();
 *   requireMethod('POST');
 *   $input = getJsonInput();
 *   jsonResponse(['status' => 'ok']);
 *
 * @package IRSDK_SOF
 */

declare(strict_types=1);

// ============================================================================
// CORS Headers — required for local development (Laragon, different ports)
// ============================================================================

/**
 * Sets CORS headers to allow cross-origin requests from the local network.
 *
 * Call this at the top of every API endpoint. Handles preflight OPTIONS
 * requests automatically by sending a 204 and exiting.
 *
 * @return void
 */
function setCorsHeaders(): void
{
    // Allow requests from any local origin (adjust in production if needed).
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Access-Control-Max-Age: 86400');

    // Handle preflight OPTIONS requests immediately.
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

// ============================================================================
// HTTP Response Helpers
// ============================================================================

/**
 * Sends a JSON response with the given HTTP status code and exits.
 *
 * Sets the Content-Type header to application/json and outputs the data
 * as a JSON-encoded string. Always terminates script execution.
 *
 * @param  mixed $data Any value serializable to JSON (array, object, scalar).
 * @param  int   $code HTTP status code (default: 200).
 * @return never
 */
function jsonResponse(mixed $data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Sends a JSON error response and exits.
 *
 * Convenience wrapper around jsonResponse() for error cases.
 *
 * @param  string $message Human-readable error message.
 * @param  int    $code    HTTP status code (default: 400).
 * @param  array  $extra   Additional key-value pairs to include in the response.
 * @return never
 */
function jsonError(string $message, int $code = 400, array $extra = []): never
{
    $payload = array_merge(['error' => true, 'message' => $message], $extra);
    jsonResponse($payload, $code);
}

// ============================================================================
// Input Handling
// ============================================================================

/**
 * Reads and decodes the JSON body from a POST/PUT request.
 *
 * Returns the decoded data as an associative array. Sends a 400 error
 * response automatically if the body is missing or contains invalid JSON.
 *
 * @return array Decoded JSON data.
 */
function getJsonInput(): array
{
    $raw = file_get_contents('php://input');

    if (empty($raw)) {
        jsonError('Request body is empty. Expected JSON.', 400);
    }

    $data = json_decode($raw, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        jsonError('Invalid JSON in request body: ' . json_last_error_msg(), 400);
    }

    return $data;
}

/**
 * Validates that the current HTTP request uses the expected method.
 *
 * Sends a 405 Method Not Allowed response if the method does not match.
 * Accepts a single method string or an array of allowed methods.
 *
 * @param  string|array $method Expected HTTP method(s), e.g. 'POST' or ['GET', 'POST'].
 * @return void
 */
function requireMethod(string|array $method): void
{
    $allowed = is_array($method) ? array_map('strtoupper', $method) : [strtoupper($method)];
    $current = strtoupper($_SERVER['REQUEST_METHOD']);

    if (!in_array($current, $allowed, true)) {
        header('Allow: ' . implode(', ', $allowed));
        jsonError(
            "Method {$current} not allowed. Expected: " . implode(', ', $allowed),
            405
        );
    }
}

/**
 * Retrieves a required parameter from the GET query string.
 *
 * Sends a 400 error if the parameter is missing or empty.
 *
 * @param  string $name Parameter name.
 * @return string       Sanitized parameter value.
 */
function requireParam(string $name): string
{
    $value = $_GET[$name] ?? '';
    $value = sanitize((string) $value);

    if ($value === '') {
        jsonError("Missing required parameter: {$name}", 400);
    }

    return $value;
}

/**
 * Retrieves an optional parameter from the GET query string.
 *
 * @param  string      $name    Parameter name.
 * @param  string|null $default Default value if not present.
 * @return string|null          Sanitized parameter value or default.
 */
function optionalParam(string $name, ?string $default = null): ?string
{
    if (!isset($_GET[$name])) {
        return $default;
    }

    return sanitize((string) $_GET[$name]);
}

// ============================================================================
// Sanitization
// ============================================================================

/**
 * Sanitizes a string for safe use in output and storage.
 *
 * Trims whitespace, strips HTML/PHP tags, and removes null bytes.
 * This is a general-purpose sanitizer; SQL injection is prevented
 * by the use of prepared statements in db.php.
 *
 * @param  string $str Raw input string.
 * @return string      Cleaned string.
 */
function sanitize(string $str): string
{
    // Remove null bytes (potential security issue).
    $str = str_replace(chr(0), '', $str);

    // Trim whitespace from both ends.
    $str = trim($str);

    // Strip HTML and PHP tags to prevent XSS in output contexts.
    $str = strip_tags($str);

    return $str;
}

// ============================================================================
// Lap Time Formatting
// ============================================================================

/**
 * Formats a lap time in seconds to the mm:ss.xxx display format.
 *
 * Examples:
 *   137.342  => "2:17.342"
 *   63.5     => "1:03.500"
 *   42.1     => "0:42.100"
 *   null     => "--:--.---"
 *
 * @param  float|null $seconds Lap time in seconds.
 * @return string              Formatted lap time string.
 */
function formatLapTime(?float $seconds): string
{
    if ($seconds === null || $seconds <= 0.0) {
        return '--:--.---';
    }

    $minutes = (int) floor($seconds / 60);
    $secs = fmod($seconds, 60);

    // Format seconds with exactly 3 decimal places, zero-padded to 2 digits before decimal.
    $secsFormatted = sprintf('%06.3f', $secs);

    return sprintf('%d:%s', $minutes, $secsFormatted);
}

/**
 * Parses a lap time string in mm:ss.xxx format to seconds.
 *
 * Accepts formats like:
 *   "2:17.342"  => 137.342
 *   "1:03.500"  => 63.5
 *   "0:42.100"  => 42.1
 *   "42.100"    => 42.1    (seconds only, no colon)
 *
 * Returns null if the string is empty, a placeholder, or unparseable.
 *
 * @param  string|null $str Lap time string.
 * @return float|null       Lap time in seconds, or null on failure.
 */
function parseLapTime(?string $str): ?float
{
    if ($str === null || $str === '' || $str === '--:--.---') {
        return null;
    }

    $str = trim($str);

    // Format with colon: "m:ss.xxx" or "mm:ss.xxx"
    if (str_contains($str, ':')) {
        $parts = explode(':', $str, 2);
        if (count($parts) !== 2) {
            return null;
        }

        $minutes = (int) $parts[0];
        $seconds = (float) $parts[1];

        if ($minutes < 0 || $seconds < 0.0 || $seconds >= 60.0) {
            return null;
        }

        return ($minutes * 60) + $seconds;
    }

    // Seconds only: "42.100"
    $value = (float) $str;
    return $value > 0.0 ? $value : null;
}

// ============================================================================
// Date / Time Helpers
// ============================================================================

/**
 * Returns the current date-time as a string formatted for Access DATETIME columns.
 *
 * @return string Date-time in "Y-m-d H:i:s" format.
 */
function now(): string
{
    return date('Y-m-d H:i:s');
}

/**
 * Generates a SHA-256 hash of the given parameters for use as a cache key.
 *
 * Accepts any JSON-serializable value (array, string, int, etc.).
 *
 * @param  mixed  $params The parameters to hash.
 * @return string         64-character lowercase hex hash.
 */
function paramsHash(mixed $params): string
{
    return hash('sha256', json_encode($params, JSON_UNESCAPED_UNICODE));
}

// ============================================================================
// Numeric Helpers
// ============================================================================

/**
 * Clamps a value between a minimum and maximum.
 *
 * @param  float $value The value to clamp.
 * @param  float $min   Minimum bound.
 * @param  float $max   Maximum bound.
 * @return float        Clamped value.
 */
function clampValue(float $value, float $min, float $max): float
{
    return max($min, min($max, $value));
}

/**
 * Calculates the percentile rank of a value within a sorted array.
 *
 * @param  int   $value  The value to rank.
 * @param  array $values Array of integers (will be sorted internally).
 * @return float         Percentile (0.0 to 100.0).
 */
function percentileRank(int $value, array $values): float
{
    if (empty($values)) {
        return 0.0;
    }

    sort($values);
    $count = count($values);
    $below = 0;

    foreach ($values as $v) {
        if ($v < $value) {
            $below++;
        }
    }

    return ($below / $count) * 100.0;
}

/**
 * Calculates the median of an array of numbers.
 *
 * @param  array    $values Array of numeric values.
 * @return int|null         Median value (rounded to integer), or null if empty.
 */
function medianValue(array $values): ?int
{
    if (empty($values)) {
        return null;
    }

    sort($values);
    $count = count($values);
    $mid = (int) floor($count / 2);

    if ($count % 2 === 0) {
        return (int) round(($values[$mid - 1] + $values[$mid]) / 2);
    }

    return (int) $values[$mid];
}

/**
 * Calculates the standard deviation of an array of numbers.
 *
 * @param  array    $values Array of numeric values.
 * @return int|null         Standard deviation (rounded to integer), or null if empty.
 */
function standardDeviation(array $values): ?int
{
    $count = count($values);
    if ($count < 2) {
        return $count === 1 ? 0 : null;
    }

    $mean = array_sum($values) / $count;
    $sumSquaredDiffs = 0.0;

    foreach ($values as $v) {
        $sumSquaredDiffs += ($v - $mean) ** 2;
    }

    return (int) round(sqrt($sumSquaredDiffs / $count));
}

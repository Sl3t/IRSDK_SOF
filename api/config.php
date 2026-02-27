<?php
/**
 * IRSDK SOF Agent — Application Configuration
 *
 * Central configuration file defining all constants used across the PHP backend.
 * Values here serve as sensible defaults; many can be overridden at runtime
 * via the `settings` table in the database.
 *
 * @package IRSDK_SOF
 */

declare(strict_types=1);

// ============================================================================
// Database
// ============================================================================

/** Absolute path to the SQLite database file. */
define('DB_PATH', __DIR__ . '/../db/irsdk_sof.sqlite');

/** PDO DSN string for SQLite connection. */
define('DB_DSN', 'sqlite:' . DB_PATH);

// ============================================================================
// Bridge WebSocket (Node.js IRSDK bridge on SIM PC 1)
// ============================================================================

/** Default WebSocket host for the Node.js IRSDK bridge. */
define('BRIDGE_WS_HOST', 'localhost');

/** Default WebSocket port for the Node.js IRSDK bridge. */
define('BRIDGE_WS_PORT', 8182);

/** Full default WebSocket URL for convenience. */
define('BRIDGE_WS_URL', 'ws://' . BRIDGE_WS_HOST . ':' . BRIDGE_WS_PORT);

// ============================================================================
// iRacing Data API (REST)
// ============================================================================

/** Base URL for the iRacing Data API (v1). */
define('IRACING_API_BASE_URL', 'https://members-ng.iracing.com');

/** OAuth2 token endpoint for iRacing authentication. */
define('IRACING_OAUTH_TOKEN_URL', 'https://members-ng.iracing.com/auth');

// ============================================================================
// Cache TTLs (seconds) — defaults, overridable via settings table
// ============================================================================

/** Cache lifetime for per-driver track statistics (24 hours). */
define('CACHE_TTL_DRIVER_STATS', 86400);

/** Cache lifetime for series catalogue data (1 hour). */
define('CACHE_TTL_SERIES', 3600);

/** Cache lifetime for race guide / active sessions (5 minutes). */
define('CACHE_TTL_RACE_GUIDE', 300);

/** Cache lifetime for member profile data (15 minutes). */
define('CACHE_TTL_MEMBER_PROFILE', 900);

/** Cache lifetime for season results (6 hours). */
define('CACHE_TTL_SEASON_RESULTS', 21600);

/** Cache lifetime for lap data / subsession results (permanent = 30 days). */
define('CACHE_TTL_RESULTS', 2592000);

// ============================================================================
// GO/NO-GO Decision Engine — default thresholds and weights
// ============================================================================

/**
 * Score at or above which the engine recommends GO (0-100).
 * Override via settings key: threshold_go
 */
define('DECISION_THRESHOLD_GO', 75);

/**
 * Score below which the engine recommends NO-GO (0-100).
 * Scores between NOGO and GO are NEUTRAL.
 * Override via settings key: threshold_nogo
 */
define('DECISION_THRESHOLD_NOGO', 50);

/**
 * SOF-to-personal-iRating ratio threshold.
 * A ratio above this value means the field is significantly stronger.
 * Override via settings key: sof_ratio_threshold
 */
define('SOF_RATIO_THRESHOLD', 1.15);

/**
 * Minimum acceptable Safety Rating before the engine penalises the score.
 * Override via settings key: sr_minimum
 */
define('SR_MINIMUM', 3.00);

/**
 * Default decision criteria weights (must sum to 100).
 * Override via settings key: decision_weights (JSON).
 *
 * Keys:
 *   sof_ratio          — SOF vs my iRating ratio          (20%)
 *   position_estimate  — Estimated finishing position      (15%)
 *   irating_gain       — Probable iRating gain/loss        (15%)
 *   field_quality      — Field experience on this track    (15%)
 *   danger_score       — Field incident/danger rating      (10%)
 *   track_conditions   — Track temp, grip, weather         (10%)
 *   safety_rating      — Current personal SR level         (10%)
 *   participant_count  — Number of participants             (5%)
 */
define('DECISION_WEIGHTS', [
    'sof_ratio'         => 20,
    'position_estimate' => 15,
    'irating_gain'      => 15,
    'field_quality'     => 15,
    'danger_score'      => 10,
    'track_conditions'  => 10,
    'safety_rating'     => 10,
    'participant_count' => 5,
]);

// ============================================================================
// Application Defaults
// ============================================================================

/** Default iRating target for new installations (adjustable in settings). */
define('DEFAULT_IRATING_TARGET', 2500);

/** Maximum number of drivers to analyse in detail per session. */
define('MAX_DRIVER_ANALYSIS_BATCH', 30);

/**
 * Priority radius: drivers within this iRating range of the user
 * are analysed first (higher API priority).
 */
define('DRIVER_PRIORITY_IRATING_RANGE', 300);

/** Application timezone. */
define('APP_TIMEZONE', 'UTC');

/** Enable debug mode (verbose error output). Set to false in production. */
define('DEBUG_MODE', true);
